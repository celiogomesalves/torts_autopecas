import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook Focus NFe — recebe atualizações de status de NFC-e.
 * Valida segredo via `?secret=...` contra FOCUS_NFE_WEBHOOK_SECRET.
 * Aplica update via RPC SECURITY DEFINER `apply_focus_nfe_webhook`
 * usando a publishable key (não requer SERVICE_ROLE_KEY).
 */

function stringProp(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

async function readJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

export const Route = createFileRoute("/api/public/focus-nfe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const reqId = Math.random().toString(36).slice(2, 10);
        const url = new URL(request.url);
        const headersObj: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          const lk = k.toLowerCase();
          headersObj[k] = lk.includes("auth") || lk.includes("secret") || lk === "cookie" ? "***" : v;
        });
        const query = Object.fromEntries(url.searchParams.entries());
        if (query.secret) query.secret = "***";
        console.log(`[focus-nfe ${reqId}] IN`, { method: request.method, path: url.pathname, query, headers: headersObj });

        const respond = (status: number, body: string | object) => {
          console.log(`[focus-nfe ${reqId}] OUT`, { status, body });
          if (typeof body === "string") return new Response(body, { status });
          return Response.json(body, { status });
        };

        const secret = url.searchParams.get("secret") || request.headers.get("x-webhook-secret");
        const expected = process.env.FOCUS_NFE_WEBHOOK_SECRET;
        if (!expected || secret !== expected) return respond(401, "Unauthorized");

        const rawBody = await request.text();
        console.log(`[focus-nfe ${reqId}] BODY`, rawBody);
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
        catch { return respond(400, "Invalid JSON"); }

        const ref = stringProp(payload, "ref");
        if (!ref) return respond(400, "Missing ref");

        const supabaseUrl = process.env.SUPABASE_URL;
        const apiKey =
          process.env.SUPABASE_PUBLISHABLE_KEY ||
          process.env.SUPABASE_ANON_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !apiKey) {
          console.error(`[focus-nfe ${reqId}] missing supabase env`, { hasUrl: !!supabaseUrl, hasKey: !!apiKey });
          return respond(500, { error: "Supabase env missing" });
        }

        const rawStatus = (stringProp(payload, "status") ?? "").toLowerCase();
        const statusSefaz = stringProp(payload, "status_sefaz") ?? stringProp(payload, "codigo_sefaz");
        const status = rawStatus === "autorizado" || rawStatus === "autorizada" || statusSefaz === "100"
          ? "autorizada"
          : rawStatus === "cancelado" || rawStatus === "cancelada"
            ? "cancelada"
            : rawStatus || "processando";
        const xmlPath = stringProp(payload, "caminho_xml_nota_fiscal");
        const danfcePath = stringProp(payload, "caminho_danfe");
        const rpcArgs = {
          _ref: ref,
          _status: status,
          _protocolo: stringProp(payload, "protocolo"),
          _chave: stringProp(payload, "chave_nfe") ?? stringProp(payload, "chave"),
          _qr_code_url: stringProp(payload, "qrcode") ?? stringProp(payload, "qrcode_url") ?? stringProp(payload, "url_consulta_nfce") ?? stringProp(payload, "url_consulta_nf"),
          _xml_url: xmlPath ? `https://focusnfe.com.br${xmlPath}` : null,
          _danfce_url: danfcePath ? `https://focusnfe.com.br${danfcePath}` : null,
          _motivo_rejeicao: status === "autorizada" ? null : (stringProp(payload, "mensagem_sefaz") || stringProp(payload, "mensagem")),
        };

        try {
          console.log(`[focus-nfe ${reqId}] RPC`, { ref, status });
          const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_focus_nfe_webhook`, {
            method: "POST",
            headers: {
              apikey: apiKey,
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(rpcArgs),
          });
          const rpcBody = await readJsonSafe(rpcRes);
          console.log(`[focus-nfe ${reqId}] RPC result`, { status: rpcRes.status, body: rpcBody });

          if (!rpcRes.ok) return respond(500, { error: "rpc failed", details: rpcBody });
          const result = (rpcBody && typeof rpcBody === "object") ? rpcBody as Record<string, unknown> : {};
          if (result.ok === false) {
            if (result.error === "not_found") return respond(404, "Note not found");
            return respond(500, { error: "rpc returned error", details: result });
          }

          console.log(`[focus-nfe ${reqId}] updated`, result);

          // Upload automático ao Google Drive (best-effort, não bloqueia resposta)
          if (status === "autorizada" && result.note_id) {
            try {
              const { uploadFiscalNoteInternal } = await import(
                "@/lib/google-drive-upload.server"
              );
              const driveRes = await uploadFiscalNoteInternal(String(result.note_id));
              console.log(`[focus-nfe ${reqId}] drive upload`, driveRes);
            } catch (e) {
              console.error(`[focus-nfe ${reqId}] drive upload failed`, e);
            }
          }

          // Envio automático do XML/PDF para a Contabilidade (best-effort)
          if (status === "autorizada") {
            try {
              const { sendFiscalNoteByEmail } = await import("@/lib/nfce-email.server");
              const mailRes = await sendFiscalNoteByEmail(ref);
              console.log(`[focus-nfe ${reqId}] accounting email`, mailRes);
            } catch (e) {
              console.error(`[focus-nfe ${reqId}] accounting email failed`, e);
            }
          }


          return respond(200, { ok: true, ...result });
        } catch (e) {
          console.error(`[focus-nfe ${reqId}] handler exception`, e);
          return respond(500, { error: "handler exception", message: e instanceof Error ? e.message : String(e) });
        }
      },
    },
  },
});
