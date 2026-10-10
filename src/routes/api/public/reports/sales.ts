/**
 * Endpoint público para automações (n8n) obterem os dados do Relatório de Vendas
 * em JSON, prontos para renderização em PDF externa.
 *
 * POST /api/public/reports/sales
 * Headers:
 *   - Content-Type: application/json
 *   - apikey: <SUPABASE_PUBLISHABLE_KEY>            (obrigatório se REPORTS_API_KEY não usado)
 *   - x-reports-secret: <REPORTS_API_KEY>           (alternativa recomendada)
 * Body:
 *   {
 *     "companyId": "uuid",
 *     "from": "YYYY-MM-DD",
 *     "to":   "YYYY-MM-DD",
 *     "paymentMethods": ["dinheiro","pix"],  // opcional; também aceita IDs UUID
 *     "paymentMethodIds": ["uuid"],          // opcional; vazio/omitido = todas
 *     "format": "pdf_base64",                // pdf | pdf_base64 | json
 *     "includePdf": true                     // obrigatório para gerar PDF
 *   }
 * Resposta:
 *   {
 *     ok: true,
 *     company: { id, name, cnpj },
 *     period:  { from, to, label },
 *     filters: { paymentMethods: [] },
 *     totals:  { count, subtotal, discount, total },
 *     paymentSummary: [ { method, count, total } ],
 *     sales:   [ { id, number, created_at, customer, payment_method, subtotal, discount, total, status } ]
 *   }
 */
import {
  buildAccountingEmailBody,
  buildAccountingEmailBodyHtml,
  buildAccountingEmailSubject,
} from "@/lib/accounting-email";
import { createFileRoute } from "@tanstack/react-router";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(request: Request): boolean {
  const accepted = [
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
  ]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  const reportsSecret = (process.env.REPORTS_API_KEY ?? "").trim();

  const apikeyHdr = (request.headers.get("apikey") ?? "").trim();
  if (apikeyHdr && accepted.some((k) => timingSafeEqualStr(apikeyHdr, k))) return true;

  const secretHdr = (request.headers.get("x-reports-secret") ?? "").trim();
  if (reportsSecret && secretHdr && timingSafeEqualStr(secretHdr, reportsSecret)) return true;

  return false;
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function metaHeaders(
  accounting: { name: string; email: string },
  includePdf: boolean,
  email?: { subject?: string; body?: string; emailBodyHtml?: string; bodyHtml?: string; senderName?: string },
) {
  const html = email?.emailBodyHtml ?? email?.bodyHtml;
  return {
    "x-accounting-name": encodeURIComponent(accounting.name ?? ""),
    "x-accounting-email": encodeURIComponent(accounting.email ?? ""),
    "x-include-pdf": String(includePdf),
    ...(email?.senderName ? { "x-sender-name": encodeURIComponent(email.senderName) } : {}),
    ...(email?.subject ? { "x-email-subject": encodeURIComponent(email.subject) } : {}),
    ...(email?.body ? { "x-email-body": encodeURIComponent(email.body) } : {}),
    ...(html ? { "x-email-body-html": encodeURIComponent(html) } : {}),
  };
}


function fmtBrDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function parseStringArray(value: unknown): string[] {
  let parsed = value;

  if (typeof value === "string" && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value.split(",");
    }
  }

  return Array.isArray(parsed)
    ? parsed.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, apikey, x-reports-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function getServerEnv() {
  const serviceKey = (
    process.env["REPORTS_SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_SECRET_KEY"] ??
    process.env["DRIVE_SUPABASE_SERVICE_ROLE_KEY"] ??
    ""
  ).trim();
  const supabaseUrl = (
    process.env["SUPABASE_URL"] ??
    process.env["DRIVE_SUPABASE_URL"] ??
    process.env["VITE_SUPABASE_URL"] ??
    "https://oapfhdcvugcileuxumpb.supabase.co"
  ).trim();
  const publishable = (
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"] ??
    ""
  ).trim();
  return { serviceKey, supabaseUrl, publishable };
}

/** Registra a execução do endpoint (nunca quebra a resposta). */
async function logExecution(
  supabase: any,
  companyId: string,
  meta: Record<string, unknown>,
) {
  try {
    await supabase.from("activity_logs").insert({
      company_id: companyId,
      action: "reports_sales_pdf",
      entity: "reports_api",
      meta: { ...meta, at: new Date().toISOString() },
    });
  } catch {
    /* logging é best-effort */
  }
}

export const Route = createFileRoute("/api/public/reports/sales")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      /** Health check por ambiente — só booleanos, nunca valores de chave. */
      GET: async ({ request }) => {
        const started = Date.now();
        const url = new URL(request.url);
        const companyId = (url.searchParams.get("companyId") ?? "").trim();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let dbOk: boolean | null = null;
        let lastExecution: unknown = null;

        try {
          const { error } = await supabaseAdmin.from("companies").select("id").limit(1);
          dbOk = !error;

          if (companyId) {
            const { data } = await supabaseAdmin
              .from("activity_logs")
              .select("created_at, meta")
              .eq("company_id", companyId)
              .eq("action", "reports_sales_pdf")
              .order("created_at", { ascending: false })
              .limit(1);
            lastExecution = data?.[0] ?? null;
          }
        } catch {
          dbOk = false;
        }

        const healthy = Boolean(serviceKey) && dbOk !== false;

        return new Response(
          JSON.stringify({
            ok: healthy,
            status: healthy ? "online" : "degraded",
            env: {
              serviceRoleKey: Boolean(serviceKey),
              supabaseUrl: Boolean(supabaseUrl),
              publishableKey: Boolean(publishable),
              database: dbOk,
            },
            host: url.host,
            lastExecution,
            checkedAt: new Date().toISOString(),
            latencyMs: Date.now() - started,
          }),
          { status: healthy ? 200 : 503, headers: { "Content-Type": "application/json", ...CORS } },
        );
      },

      POST: async ({ request }) => {
        const startedAt = Date.now();
        if (!isAuthorized(request)) return json({ ok: false, error: "Unauthorized" }, 401);

        let body: any;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "Invalid JSON body" }, 400);
        }

        const companyId = String(body?.companyId ?? "").trim();
        const from = String(body?.from ?? "").trim();
        const to = String(body?.to ?? "").trim();
        const rawPaymentMethods = parseStringArray(body?.paymentMethods);
        const explicitPaymentMethodIds = parseStringArray(body?.paymentMethodIds);
        // Respeita a escolha do usuário: valor explícito (corpo, header
        // x-include-pdf ou query) sempre vence. Se não vier nada, cai no
        // formato solicitado (pdf/pdf_base64 => true).
        const qs = new URL(request.url).searchParams;
        const rawIncludePdf =
          body?.includePdf ??
          request.headers.get("x-include-pdf") ??
          qs.get("includePdf") ??
          undefined;
        const requestedFormat = String(body?.format ?? qs.get("format") ?? "json")
          .trim()
          .toLowerCase();
        const truthy = new Set(["true", "1", "yes", "sim", "on"]);
        const hasExplicitIncludePdf = !(
          rawIncludePdf === undefined ||
          rawIncludePdf === null ||
          String(rawIncludePdf).trim() === ""
        );
        let includePdf = hasExplicitIncludePdf
          ? truthy.has(String(rawIncludePdf).trim().toLowerCase())
          : requestedFormat === "pdf" || requestedFormat === "pdf_base64";

        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const paymentMethodIds = Array.from(
          new Set([
            ...explicitPaymentMethodIds,
            ...rawPaymentMethods.filter((value) => uuidPattern.test(value)),
          ]),
        );
        const paymentMethods = rawPaymentMethods.filter((value) => !uuidPattern.test(value));


        if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
          return json(
            { ok: false, error: "Parâmetros obrigatórios: companyId, from (YYYY-MM-DD), to (YYYY-MM-DD)" },
            400,
          );
        }

        const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");


        const { data: company, error: companyErr } = await supabase
          .from("companies")
          .select("id, name, cnpj")
          .eq("id", companyId)
          .maybeSingle();
        if (companyErr) return json({ ok: false, error: companyErr.message }, 500);
        if (!company) return json({ ok: false, error: "Empresa não encontrada" }, 404);

        // Resolve nomes exatos a partir dos IDs informados
        let methodFilter = [...paymentMethods];
        const idToName = new Map<string, string>();
        if (paymentMethodIds.length > 0) {
          const { data: pms, error: pmErr } = await supabase
            .from("payment_methods")
            .select("id, name")
            .eq("company_id", companyId)
            .in("id", paymentMethodIds);
          if (pmErr) return json({ ok: false, error: pmErr.message }, 500);
          for (const p of pms ?? []) idToName.set(String((p as any).id), String((p as any).name));
          if (idToName.size === 0) {
            return json({ ok: false, error: "Nenhuma forma de pagamento encontrada para os IDs informados" }, 400);
          }
          methodFilter = Array.from(new Set([...methodFilter, ...idToName.values()]));
        }

        const norm = (s: string) =>
          s
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
        const wantedIds = new Set(paymentMethodIds);
        const wantedNames = new Set(methodFilter.map(norm));
        const hasFilter = wantedIds.size > 0 || wantedNames.size > 0;

        const { data: sales, error: salesErr } = await supabase
          .from("sales")
          .select("id, number, created_at, customer_id, payment_method, subtotal, discount, total, status")
          .eq("company_id", companyId)
          .eq("status", "concluida")
          .gte("created_at", `${from}T00:00:00`)
          .lte("created_at", `${to}T23:59:59.999`)
          .order("created_at", { ascending: false })
          .limit(10000);
        if (salesErr) return json({ ok: false, error: salesErr.message }, 500);

        const allSales = sales ?? [];
        const saleIds = allSales.map((s: any) => s.id);

        // Pagamentos por venda (fonte de verdade: payment_method_id)
        type Pay = { payment_method_id: string | null; method: string; amount: number };
        const paysBySale = new Map<string, Pay[]>();
        for (let i = 0; i < saleIds.length; i += 500) {
          const chunk = saleIds.slice(i, i + 500);
          if (chunk.length === 0) break;
          const { data: pays } = await supabase
            .from("sale_payments")
            .select("sale_id, payment_method_id, method, amount")
            .in("sale_id", chunk);
          for (const p of pays ?? []) {
            const list = paysBySale.get((p as any).sale_id) ?? [];
            list.push({
              payment_method_id: (p as any).payment_method_id ?? null,
              method: String((p as any).method ?? ""),
              amount: Number((p as any).amount ?? 0),
            });
            paysBySale.set((p as any).sale_id, list);
          }
        }

        const paysOf = (s: any): Pay[] => {
          const list = paysBySale.get(s.id);
          if (list && list.length > 0) return list;
          return [
            {
              payment_method_id: null,
              method: String(s.payment_method ?? "—"),
              amount: Number(s.total ?? 0),
            },
          ];
        };

        const matches = (p: Pay) =>
          (p.payment_method_id != null && wantedIds.has(p.payment_method_id)) ||
          wantedNames.has(norm(p.method));

        // ---- Regra de nota fiscal: formas de pagamento com emissão de NFC-e ----
        // só somam no relatório quando a venda tem nota AUTORIZADA vinculada.
        const nfceMethodIds = new Set<string>();
        const nfceMethodNames = new Set<string>();
        {
          const { data: pmAll } = await supabase
            .from("payment_methods")
            .select("id, name, auto_issue_nfce")
            .eq("company_id", companyId)
            .eq("auto_issue_nfce", true);
          for (const pm of pmAll ?? []) {
            if ((pm as any).id) nfceMethodIds.add(String((pm as any).id));
            if ((pm as any).name) nfceMethodNames.add(norm(String((pm as any).name)));
          }
        }

        // Vendas com nota autorizada (em qualquer momento, não só no período).
        const salesWithAuthorizedNote = new Set<string>();
        if (nfceMethodIds.size > 0 || nfceMethodNames.size > 0) {
          for (let i = 0; i < saleIds.length; i += 500) {
            const chunk = saleIds.slice(i, i + 500);
            if (chunk.length === 0) break;
            const { data: notes } = await supabase
              .from("fiscal_notes")
              .select("sale_id")
              .eq("company_id", companyId)
              .eq("status", "autorizada")
              .in("sale_id", chunk);
            for (const n of notes ?? []) {
              if ((n as any).sale_id) salesWithAuthorizedNote.add(String((n as any).sale_id));
            }
          }
        }

        const requiresNote = (p: Pay) =>
          (p.payment_method_id != null && nfceMethodIds.has(p.payment_method_id)) ||
          nfceMethodNames.has(norm(p.method));

        // Venda que exige nota (algum pagamento com emissão de NFC-e).
        const saleNeedsNote = (s: any): boolean => paysOf(s).some(requiresNote);

        // Pagamentos válidos da venda: os que exigem nota só contam se houver
        // nota autorizada para a venda.
        const validPaysOf = (s: any): Pay[] =>
          paysOf(s).filter(
            (p) => !requiresNote(p) || salesWithAuthorizedNote.has(String(s.id)),
          );

        const filteredSales = (hasFilter
          ? allSales.filter((s: any) => paysOf(s).some(matches))
          : allSales
        ).filter((s: any) => {
          // Vendas que exigem nota só entram se houver nota autorizada;
          // notas não autorizadas (rejeitada/processando/cancelada) não contabilizam.
          if (saleNeedsNote(s) && !salesWithAuthorizedNote.has(String(s.id))) {
            return false;
          }
          return validPaysOf(s).length > 0;
        });

        const customerIds = Array.from(
          new Set(filteredSales.map((s: any) => s.customer_id).filter(Boolean)),
        ) as string[];
        let customerMap = new Map<string, string>();
        if (customerIds.length > 0) {
          const { data: parts } = await supabase
            .from("partners")
            .select("id, name")
            .in("id", customerIds);
          customerMap = new Map((parts ?? []).map((p: any) => [p.id, p.name]));
        }

        const rows = filteredSales.map((s: any) => ({
          id: s.id,
          number: s.number,
          created_at: s.created_at,
          customer: s.customer_id ? (customerMap.get(s.customer_id) ?? null) : "Consumidor final",
          payment_method: s.payment_method,
          subtotal: Number(s.subtotal ?? 0),
          discount: Number(s.discount ?? 0),
          total: Number(s.total ?? 0),
          status: s.status,
        }));

        const totals = rows.reduce(
          (acc, r) => {
            acc.count += 1;
            acc.subtotal += r.subtotal;
            acc.discount += r.discount;
            acc.total += r.total;
            return acc;
          },
          { count: 0, subtotal: 0, discount: 0, total: 0 },
        );

        // Somatórias por forma de pagamento (baseadas nos pagamentos da venda)
        const pmMap = new Map<string, { count: number; total: number }>();
        for (const s of filteredSales) {
          for (const p of validPaysOf(s)) {
            if (hasFilter && !matches(p)) continue;
            const key =
              (p.payment_method_id ? idToName.get(p.payment_method_id) : null) ||
              (p.method || "—");
            const cur = pmMap.get(key) ?? { count: 0, total: 0 };
            cur.count += 1;
            cur.total += p.amount;
            pmMap.set(key, cur);
          }
        }
        const paymentSummary = Array.from(pmMap.entries())
          .map(([method, v]) => ({ method, count: v.count, total: v.total }))
          .sort((a, b) => b.total - a.total);

        // Contato da contabilidade (sempre presente no payload, mesmo vazio)
        let accounting = { name: "", email: "", senderName: "" };
        let accountingEmails: string[] = [];
        try {
          const { data: cs } = await supabase
            .from("company_settings")
            .select("accounting_name, accounting_email, accounting_emails, accounting_sender_name, accounting_include_pdf")
            .eq("company_id", companyId)
            .maybeSingle();
          const listed = Array.isArray((cs as any)?.accounting_emails)
            ? ((cs as any).accounting_emails as string[])
            : [];
          const fallback = String((cs as any)?.accounting_email ?? "")
            .split(/[,;]/)
            .map((e) => e.trim());
          accountingEmails = Array.from(
            new Set([...listed, ...fallback].map((e) => String(e ?? "").trim()).filter(Boolean)),
          );
          accounting = {
            name: String((cs as any)?.accounting_name ?? ""),
            email: accountingEmails.join(", "),
            senderName: String((cs as any)?.accounting_sender_name ?? ""),
          };

          // Sem valor explícito na requisição E sem formato de PDF pedido,
          // usa a preferência salva da empresa.
          const formatAsksPdf =
            requestedFormat === "pdf" ||
            requestedFormat === "pdf_base64" ||
            requestedFormat === "notes_pdf";
          if (
            !hasExplicitIncludePdf &&
            !formatAsksPdf &&
            typeof (cs as any)?.accounting_include_pdf === "boolean"
          ) {
            includePdf = (cs as any).accounting_include_pdf as boolean;
          }
        } catch {
          accounting = { name: "", email: "", senderName: "" };
        }


        const payload = {
          ok: true as const,
          company: { id: company.id, name: company.name, cnpj: company.cnpj ?? null },
          accounting: { ...accounting, emails: accountingEmails },
          accountingName: accounting.name,
          accountingEmail: accounting.email,
          accountingEmails,

          senderName: accounting.senderName || company.name,
          includePdf,
          pdfIncluded: false,
          emailSubject: buildAccountingEmailSubject(company.name, from, to),
          emailBody: buildAccountingEmailBody({
            recipientName: accounting.name,
            from,
            to,
            companyName: company.name,
            senderName: accounting.senderName || company.name,
            includePdf,
          }),
          emailBodyHtml: buildAccountingEmailBodyHtml({
            recipientName: accounting.name,
            from,
            to,
            companyName: company.name,
            senderName: accounting.senderName || company.name,
            includePdf,
          }),



          period: {
            from,
            to,
            label: from === to ? `Data: ${fmtBrDate(from)}` : `Período: ${fmtBrDate(from)} a ${fmtBrDate(to)}`,
          },
          filters: { paymentMethods: methodFilter, paymentMethodIds, status: "concluida" },
          totals,
          paymentSummary,
          sales: rows,
          generatedAt: new Date().toISOString(),
        };

        const format = String(body?.format ?? qs.get("format") ?? "json")
          .trim()
          .toLowerCase();
        const host = new URL(request.url).host;
        const baseMeta = {
          host,
          format,
          includePdf,
          from,
          to,
          salesCount: totals.count,
          total: totals.total,
        };

        // ---- PDF único com todas as notas fiscais do período ----
        const rawNotesPdf =
          body?.includeNotesPdf ??
          body?.includeInvoicesPdf ??
          request.headers.get("x-include-notes-pdf") ??
          qs.get("includeNotesPdf") ??
          undefined;
        const hasExplicitNotesPdf = !(
          rawNotesPdf === undefined ||
          rawNotesPdf === null ||
          String(rawNotesPdf).trim() === ""
        );
        const includeNotesPdf = hasExplicitNotesPdf
          ? truthy.has(String(rawNotesPdf).trim().toLowerCase())
          : format === "notes_pdf" || includePdf;

        const notesFilename = `notas-fiscais-${from}_a_${to}.pdf`;
        let notesBytes: Uint8Array | null = null;
        let notesCount = 0;

        if (includeNotesPdf) {
          try {
            const { data: fnotes } = await supabase
              .from("fiscal_notes")
              .select(
                "id, numero, serie, chave, status, tipo_operacao, emitted_at, customer_name, customer_doc, sale_number, sale_id, total, protocolo, ambiente, ref",
              )
              .eq("company_id", companyId)
              .eq("status", "autorizada")
              .gte("emitted_at", `${from}T00:00:00`)
              .lte("emitted_at", `${to}T23:59:59.999`)
              .order("numero", { ascending: true })
              .limit(2000);

            const notesRows = fnotes ?? [];
            notesCount = notesRows.length;

            // Itens das vendas vinculadas
            const noteSaleIds = Array.from(
              new Set(notesRows.map((n: any) => n.sale_id).filter(Boolean)),
            ) as string[];
            const itemsBySale = new Map<string, any[]>();
            const productIds = new Set<string>();
            for (let i = 0; i < noteSaleIds.length; i += 300) {
              const chunk = noteSaleIds.slice(i, i + 300);
              if (chunk.length === 0) break;
              const { data: its } = await supabase
                .from("sale_items")
                .select("sale_id, product_id, quantity, unit_price, total")
                .in("sale_id", chunk);
              for (const it of its ?? []) {
                const list = itemsBySale.get((it as any).sale_id) ?? [];
                list.push(it);
                itemsBySale.set((it as any).sale_id, list);
                if ((it as any).product_id) productIds.add(String((it as any).product_id));
              }
            }
            const productNames = new Map<string, string>();
            const pIds = Array.from(productIds);
            for (let i = 0; i < pIds.length; i += 300) {
              const chunk = pIds.slice(i, i + 300);
              if (chunk.length === 0) break;
              const { data: prods } = await supabase
                .from("products")
                .select("id, name")
                .in("id", chunk);
              for (const p of prods ?? []) productNames.set(String((p as any).id), String((p as any).name ?? ""));
            }

            const { buildFiscalNotesPdf } = await import("@/lib/fiscal-notes-pdf.server");
            notesBytes = await buildFiscalNotesPdf({
              company: { name: company.name, cnpj: company.cnpj ?? null },
              period: payload.period,
              notes: notesRows.map((n: any) => ({
                id: n.id,
                numero: n.numero ?? null,
                serie: n.serie ?? null,
                chave: n.chave ?? null,
                status: String(n.status ?? ""),
                tipo_operacao: n.tipo_operacao ?? null,
                emitted_at: n.emitted_at ?? null,
                customer_name: n.customer_name ?? null,
                customer_doc: n.customer_doc ?? null,
                sale_number: n.sale_number ?? null,
                protocolo: n.protocolo ?? null,
                ambiente: n.ambiente ?? null,
                ref: n.ref ?? null,
                total: Number(n.total ?? 0),
                items: (itemsBySale.get(n.sale_id) ?? []).map((it: any) => ({
                  description: productNames.get(String(it.product_id)) ?? "Item",
                  quantity: Number(it.quantity ?? 0),
                  unitPrice: Number(it.unit_price ?? 0),
                  total: Number(it.total ?? 0),
                })),
              })),
            });
          } catch {
            notesBytes = null;
          }
        }

        const notesPdfBase64 = (() => {
          if (!notesBytes) return null;
          let binary = "";
          for (let i = 0; i < notesBytes.length; i++) binary += String.fromCharCode(notesBytes[i]!);
          return btoa(binary);
        })();

        if (format === "notes_pdf") {
          if (!notesBytes) return json({ ok: false, error: "Falha ao gerar PDF das notas" }, 500);
          await logExecution(supabase, companyId, {
            ...baseMeta,
            status: 200,
            ok: true,
            notesCount,
            durationMs: Date.now() - startedAt,
          });
          return new Response(notesBytes as unknown as BodyInit, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${notesFilename}"`,
              "x-notes-count": String(notesCount),
              ...CORS,
            },
          });
        }


        if (includePdf && (format === "pdf" || format === "pdf_base64")) {
          try {
            const { buildSalesReportPdf } = await import("@/lib/sales-report-pdf.server");
            const bytes = await buildSalesReportPdf({
              ...payload,
              meta: { notesCount, from, to },
            });
            const filename = `relatorio-vendas-${from}_a_${to}.pdf`;

            await logExecution(supabase, companyId, {
              ...baseMeta,
              status: 200,
              ok: true,
              durationMs: Date.now() - startedAt,
            });

            if (format === "pdf_base64") {
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
              return json(
                {
                  ok: true,
                  filename,
                  mimeType: "application/pdf",
                  includePdf,
                  pdfIncluded: true,
                  notesFilename,
                  notesCount,
                  notesPdfIncluded: Boolean(notesPdfBase64),
                  notesPdfBase64,

                  pdfBase64: btoa(binary),
                  company: payload.company,
                  accounting: payload.accounting,
                  accountingName: payload.accounting.name,
                  accountingEmail: payload.accounting.email,
                  accountingEmails: payload.accountingEmails,

                  emailSubject: payload.emailSubject,
                  emailBody: buildAccountingEmailBody({
                    recipientName: payload.accounting.name,
                    from,
                    to,
                    companyName: payload.company.name,
                    senderName: payload.senderName,
                    includePdf: true,
                  }),
                  emailBodyHtml: buildAccountingEmailBodyHtml({
                    recipientName: payload.accounting.name,
                    from,
                    to,
                    companyName: payload.company.name,
                    senderName: payload.senderName,
                    includePdf: true,
                  }),
                  senderName: payload.senderName,
                  period: payload.period,
                  totals: payload.totals,
                  paymentSummary: payload.paymentSummary,
                },
                200,
                metaHeaders(payload.accounting, includePdf, {
                  subject: payload.emailSubject,
                  body: buildAccountingEmailBody({
                    recipientName: payload.accounting.name,
                    from,
                    to,
                    companyName: payload.company.name,
                    senderName: payload.senderName,
                    includePdf: true,
                  }),
                  emailBodyHtml: buildAccountingEmailBodyHtml({
                    recipientName: payload.accounting.name,
                    from,
                    to,
                    companyName: payload.company.name,
                    senderName: payload.senderName,
                    includePdf: true,
                  }),
                  senderName: payload.senderName,
                }),
              );
            }

            return new Response(bytes as unknown as BodyInit, {
              status: 200,
              headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${filename}"`,
                ...metaHeaders(payload.accounting, includePdf, {
                  subject: payload.emailSubject,
                  body: buildAccountingEmailBody({
                    recipientName: payload.accounting.name,
                    from,
                    to,
                    companyName: payload.company.name,
                    senderName: payload.senderName,
                    includePdf: true,
                  }),
                  emailBodyHtml: buildAccountingEmailBodyHtml({
                    recipientName: payload.accounting.name,
                    from,
                    to,
                    companyName: payload.company.name,
                    senderName: payload.senderName,
                    includePdf: true,
                  }),
                  senderName: payload.senderName,
                }),
                "x-company-name": encodeURIComponent(payload.company.name ?? ""),
                "x-notes-count": String(notesCount),
                "x-notes-filename": notesFilename,
                "x-notes-pdf-included": "false",
              },
            });

          } catch (e: any) {
            await logExecution(supabase, companyId, {
              ...baseMeta,
              status: 500,
              ok: false,
              error: String(e?.message ?? e),
              durationMs: Date.now() - startedAt,
            });
            return json({ ok: false, error: `Falha ao gerar PDF: ${e?.message ?? e}` }, 500);
          }
        }

        await logExecution(supabase, companyId, {
          ...baseMeta,
          status: 200,
          ok: true,
          durationMs: Date.now() - startedAt,
        });
        return json(
          {
            ...payload,
            notesFilename,
            notesCount,
            notesPdfIncluded: Boolean(notesPdfBase64),
            notesPdfBase64,
          },
          200,
          {
            ...metaHeaders(accounting, includePdf, {
              subject: payload.emailSubject,
              body: payload.emailBody,
              bodyHtml: payload.emailBodyHtml,
              senderName: payload.senderName,
            }),
            "x-notes-count": String(notesCount),
          },
        );
      },
    },
  },
});
