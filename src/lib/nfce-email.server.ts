/**
 * Envio automático da NFC-e (XML + PDF) para os e-mails da Contabilidade.
 * O despacho é feito via webhook (n8n), que é quem entrega o e-mail.
 */
import { greetingByTime } from "@/lib/accounting-email";

const BUCKET = "fiscal-xmls";

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export type NfceEmailResult = {
  sent: boolean;
  reason?: string;
  httpStatus?: number;
  recipients?: string[];
};

type StoredSaleItem = {
  quantity: string | number | null;
  unit_price: string | number | null;
  total: string | number | null;
  products?: { name?: string | null; sku?: string | null } | null;
};

export async function sendFiscalNoteByEmail(
  ref: string,
  opts?: { force?: boolean },
): Promise<NfceEmailResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: note } = await supabaseAdmin
    .from("fiscal_notes")
    .select(
      "id, company_id, sale_id, status, numero, serie, chave, protocolo, sale_number, customer_name, customer_doc, total, emitted_at, ambiente, xml_storage_path, danfce_storage_path, xml_url, danfce_url",
    )
    .eq("ref", ref)
    .maybeSingle();

  if (!note) return { sent: false, reason: "nota não encontrada" };
  if (note.status !== "autorizada") return { sent: false, reason: "nota não autorizada" };

  const { data: settings } = await supabaseAdmin
    .from("company_settings")
    .select(
      "accounting_name, accounting_email, accounting_emails, accounting_sender_name, accounting_nfe_auto_send",
    )
    .eq("company_id", note.company_id)
    .maybeSingle();

  const s = settings as Record<string, unknown> | null;
  if (!opts?.force && !s?.["accounting_nfe_auto_send"]) {
    return { sent: false, reason: "envio automático desabilitado" };
  }

  // Evita envio duplicado (emissão síncrona + webhook da Focus)
  if (!opts?.force) {
    const { data: already } = await supabaseAdmin
      .from("email_logs")
      .select("id")
      .eq("company_id", note.company_id)
      .eq("context", `nfce:${ref}`)
      .eq("status", "sent")
      .limit(1);
    if (already && already.length > 0) {
      return { sent: false, reason: "e-mail já enviado para esta nota" };
    }
  }


  const listed = Array.isArray(s?.["accounting_emails"])
    ? (s?.["accounting_emails"] as string[])
    : [];
  const single =
    typeof s?.["accounting_email"] === "string" ? [s?.["accounting_email"] as string] : [];
  const recipients = Array.from(
    new Set(
      [...listed, ...single]
        .map((e) => String(e ?? "").trim())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  );
  if (recipients.length === 0) return { sent: false, reason: "nenhum e-mail configurado" };

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("name")
    .eq("id", note.company_id)
    .maybeSingle();
  const companyName = company?.name ?? "";
  const senderName = String(s?.["accounting_sender_name"] || companyName || "").trim();
  const recipientName = String(s?.["accounting_name"] || "responsável").trim();

  const download = async (path: string | null | undefined) => {
    if (!path) return null;
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return toBase64(new Uint8Array(await data.arrayBuffer()));
  };

  let xmlPath = note.xml_storage_path as string | null;
  let danfcePath = note.danfce_storage_path as string | null;
  let xmlBase64 = await download(xmlPath);
  // O PDF anexado é sempre o cupom (DANFC-e 80mm) gerado pelo sistema, no mesmo
  // modelo impresso na venda — não usamos o DANFE da Focus.
  let pdfBase64: string | null = null;

  // Fallback: se o XML ainda não está no storage, busca na Focus NFe e arquiva.
  if (!xmlBase64) {
    try {
      const { data: fs } = await supabaseAdmin
        .from("fiscal_settings")
        .select("ambiente, focus_token_homologacao, focus_token_producao, focus_company_token")
        .eq("company_id", note.company_id)
        .maybeSingle();
      const clean = (t?: string | null) => (t ?? "").replace(/\s+/g, "").trim();
      const chave = String(note.chave ?? "").replace(/\D/g, "");
      const tpAmb = chave.length >= 21 ? chave.charAt(20) : "";
      const ambiente =
        (note as Record<string, unknown>)["ambiente"] ||
        (tpAmb === "1" ? "producao" : tpAmb === "2" ? "homologacao" : null) ||
        fs?.ambiente ||
        "homologacao";
      const tokens = Array.from(
        new Set(
          [
            ambiente === "producao"
              ? clean(fs?.focus_token_producao)
              : clean(fs?.focus_token_homologacao),
            ambiente === "producao"
              ? clean(fs?.focus_token_homologacao)
              : clean(fs?.focus_token_producao),
            clean(fs?.focus_company_token),
            clean(process.env["FOCUS_NFE_TOKEN"]),
          ].filter(Boolean),
        ),
      ) as string[];
      if (tokens.length === 0) {
        console.error(
          "sendFiscalNoteByEmail: nenhum token Focus configurado para a empresa",
          note.company_id,
        );
      }

      const safeRefEnc = encodeURIComponent(ref);
      const xmlUrl =
        note.xml_url ||
        (ambiente === "producao"
          ? `https://api.focusnfe.com.br/v2/nfce/${safeRefEnc}.xml`
          : `https://homologacao.focusnfe.com.br/v2/nfce/${safeRefEnc}.xml`);

      const { archiveFiscalFiles } = await import("@/lib/nfce.functions");
      for (const token of tokens) {
        const archived = await archiveFiscalFiles({
          companyId: note.company_id,
          ref,
          token,
          xmlUrl,
          danfceUrl: note.danfce_url,
        });
        if (archived.xml_storage_path) xmlPath = archived.xml_storage_path;
        if (archived.danfce_storage_path) danfcePath = archived.danfce_storage_path;
        if (!xmlBase64 && archived.xml_storage_path)
          xmlBase64 = await download(archived.xml_storage_path);
        if (xmlBase64) break;
      }

      if (xmlPath !== note.xml_storage_path || danfcePath !== note.danfce_storage_path) {
        await supabaseAdmin
          .from("fiscal_notes")
          .update({ xml_storage_path: xmlPath, danfce_storage_path: danfcePath })
          .eq("id", note.id);
      }
    } catch (e) {
      console.error("sendFiscalNoteByEmail: falha ao recuperar arquivos da Focus", e);
    }
  }

  // PDF anexado = cupom fiscal (DANFC-e 80mm) gerado com os dados da venda,
  // idêntico ao impresso no fechamento da venda.
  {
    try {
      const [{ data: fiscal }, { data: sale }] = await Promise.all([
        supabaseAdmin
          .from("fiscal_settings")
          .select(
            "razao_social, cnpj, ie, endereco, endereco_logradouro, endereco_numero, endereco_bairro, municipio, uf, ambiente",
          )
          .eq("company_id", note.company_id)
          .maybeSingle(),
        note.sale_id
          ? supabaseAdmin
              .from("sales")
              .select("id, subtotal, discount, total, payment_method")
              .eq("id", note.sale_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const { data: items } = sale?.id
        ? await supabaseAdmin
            .from("sale_items")
            .select("quantity, unit_price, total, products(name, sku)")
            .eq("sale_id", sale.id)
        : { data: [] };
      const address =
        fiscal?.endereco ||
        [
          [fiscal?.endereco_logradouro, fiscal?.endereco_numero].filter(Boolean).join(", "),
          fiscal?.endereco_bairro,
          [fiscal?.municipio, fiscal?.uf].filter(Boolean).join("/"),
        ]
          .filter(Boolean)
          .join(" - ");
      const { buildNfceEmailPdf } = await import("@/lib/nfce-email-pdf.server");
      const pdf = await buildNfceEmailPdf({
        companyName: fiscal?.razao_social || companyName,
        fantasyName: companyName,
        address: address || null,
        cnpj: fiscal?.cnpj,
        ie: fiscal?.ie,
        ambiente: (note as Record<string, unknown>)["ambiente"] as string | null,
        ref,
        numero: note.numero,
        serie: note.serie,
        chave: note.chave,
        protocolo: note.protocolo,
        emittedAt: note.emitted_at,
        customerName: note.customer_name,
        customerDoc: note.customer_doc,
        paymentMethod: sale?.payment_method,
        subtotal: Number(sale?.subtotal ?? note.total ?? 0),
        discount: Number(sale?.discount ?? 0),
        total: Number(sale?.total ?? note.total ?? 0),
        items: ((items ?? []) as StoredSaleItem[]).map((item) => ({
          description: String(item.products?.name ?? "Item"),
          code: item.products?.sku ?? null,
          quantity: Number(item.quantity ?? 0),
          unitPrice: Number(item.unit_price ?? 0),
          total: Number(item.total ?? 0),

        })),
      });
      pdfBase64 = toBase64(pdf);
      const generatedPath = `${note.company_id}/${ref.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(generatedPath, pdf, { contentType: "application/pdf", upsert: true });
      if (!uploadError) {
        danfcePath = generatedPath;
        await supabaseAdmin
          .from("fiscal_notes")
          .update({ danfce_storage_path: generatedPath })
          .eq("id", note.id);
      }
    } catch (e) {
      console.error("sendFiscalNoteByEmail: falha ao gerar DANFC-e local", e);
    }
  }

  if (!xmlBase64 && !pdfBase64) {
    return { sent: false, reason: "Arquivos da nota indisponíveis (XML e PDF)" };
  }


  const numero = note.numero ?? "";
  const baseName = `NFCe-${numero || ref}`;
  const anexoLabel = xmlBase64 && pdfBase64 ? "o XML e o PDF" : xmlBase64 ? "o XML" : "o PDF";
  const subject = `NFC-e ${numero || ""} — ${companyName}`.replace(/\s+/g, " ").trim();
  const text = `Olá ${recipientName}, ${greetingByTime()}!

Segue em anexo ${anexoLabel} da nota fiscal ${numero ? `nº ${numero} ` : ""}emitida pela ${companyName}.

Chave de acesso: ${note.chave ?? "-"}

Atenciosamente,

${senderName || companyName}.`;

  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p>Olá <strong>${esc(recipientName)}</strong>, ${greetingByTime()}!</p>
<p>Segue em anexo ${anexoLabel} da nota fiscal ${numero ? `nº <strong>${esc(String(numero))}</strong> ` : ""}emitida pela <strong>${esc(companyName)}</strong>.</p>

<p>Chave de acesso: ${esc(note.chave ?? "-")}</p>
<p>Atenciosamente,</p>
<p><strong>${esc(senderName || companyName)}</strong>.</p>`;

  const attachments = [
    xmlBase64
      ? { filename: `${baseName}.xml`, mimeType: "application/xml", contentBase64: xmlBase64 }
      : null,
    pdfBase64
      ? { filename: `${baseName}.pdf`, mimeType: "application/pdf", contentBase64: pdfBase64 }
      : null,
  ].filter(Boolean) as { filename: string; mimeType: string; contentBase64: string }[];

  const { sendCompanyEmail } = await import("@/lib/gmail.server");
  const res = await sendCompanyEmail({
    companyId: note.company_id,
    to: recipients,
    subject,
    html,
    text,
    attachments,
    context: `nfce:${ref}`,
    senderNameOverride: senderName || companyName || null,
  });
  return { sent: res.sent, reason: res.reason, recipients };
}
