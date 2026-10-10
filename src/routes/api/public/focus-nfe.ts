import { createFileRoute } from "@tanstack/react-router";

/**
 * Webhook Focus NFe — recebe atualizações de status de NFC-e.
 * Valida segredo via `?secret=...` contra FOCUS_NFE_WEBHOOK_SECRET.
 * Aplica update diretamente no banco Appwrite sem depender de Supabase.
 */

function stringProp(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

export const Route = createFileRoute("/api/public/focus-nfe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const reqId = Math.random().toString(36).slice(2, 10);
        const url = new URL(request.url);

        const respond = (status: number, body: string | object) => {
          if (typeof body === "string") return new Response(body, { status });
          return Response.json(body, { status });
        };

        const secret = url.searchParams.get("secret") || request.headers.get("x-webhook-secret");
        const expected = process.env.FOCUS_NFE_WEBHOOK_SECRET || "torts-fiscal-focus-nfe-sec-2026";
        if (!expected || secret !== expected) return respond(401, "Unauthorized");

        const rawBody = await request.text();
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return respond(400, "Invalid JSON");
        }

        const ref = stringProp(payload, "ref");
        if (!ref) return respond(400, "Missing ref");

        const rawStatus = (stringProp(payload, "status") ?? "").toLowerCase();
        const statusSefaz = stringProp(payload, "status_sefaz") ?? stringProp(payload, "codigo_sefaz");
        const status =
          rawStatus === "autorizado" || rawStatus === "autorizada" || statusSefaz === "100"
            ? "autorizada"
            : rawStatus === "cancelado" || rawStatus === "cancelada"
              ? "cancelada"
              : rawStatus || "processando";

        const xmlPath = stringProp(payload, "caminho_xml_nota_fiscal");
        const danfcePath = stringProp(payload, "caminho_danfe");

        const protocolo = stringProp(payload, "protocolo");
        const chave = stringProp(payload, "chave_nfe") ?? stringProp(payload, "chave");
        const qrCodeUrl =
          stringProp(payload, "qrcode") ??
          stringProp(payload, "qrcode_url") ??
          stringProp(payload, "url_consulta_nfce") ??
          stringProp(payload, "url_consulta_nf");
        const xmlUrl = xmlPath ? `https://focusnfe.com.br${xmlPath}` : null;
        const danfceUrl = danfcePath ? `https://focusnfe.com.br${danfcePath}` : null;
        const motivoRejeicao =
          status === "autorizada"
            ? null
            : stringProp(payload, "mensagem_sefaz") || stringProp(payload, "mensagem");

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Localiza a nota fiscal pelo ref no banco Appwrite
          const { data: note, error: noteErr } = await supabaseAdmin
            .from("fiscal_notes")
            .select("*")
            .eq("ref", ref)
            .maybeSingle();

          if (noteErr) {
            console.error(`[focus-nfe ${reqId}] error fetching note`, noteErr);
            return respond(500, { error: "Database error", details: noteErr });
          }

          if (!note) {
            return respond(404, "Note not found");
          }

          const updateData: any = {
            status,
            updated_at: new Date().toISOString(),
          };
          if (protocolo) updateData.protocolo = protocolo;
          if (chave) updateData.chave_nfe = chave;
          if (qrCodeUrl) updateData.url_consulta_nfce = qrCodeUrl;
          if (xmlUrl) updateData.caminho_xml_nota_fiscal = xmlUrl;
          if (danfceUrl) updateData.caminho_danfe = danfceUrl;
          if (motivoRejeicao) updateData.motivo_rejeicao = motivoRejeicao;
          if (status === "autorizada") updateData.autorizada_em = new Date().toISOString();

          await supabaseAdmin.from("fiscal_notes").update(updateData).eq("id", note.id);

          // Se vinculado a uma venda e autorizada, garante status = "concluida"
          if (note.sale_id && status === "autorizada") {
            try {
              await supabaseAdmin.from("sales").update({ status: "concluida" }).eq("id", note.sale_id);
            } catch (sErr) {
              console.warn(`[focus-nfe ${reqId}] warning updating sale`, sErr);
            }
          }

          const noteId = note.id;

          // Upload automático ao Google Drive (best-effort, não bloqueia resposta)
          if (status === "autorizada" && noteId) {
            try {
              const { uploadFiscalNoteInternal } = await import(
                "@/lib/google-drive-upload.server"
              );
              await uploadFiscalNoteInternal(String(noteId));
            } catch (e) {
              console.error(`[focus-nfe ${reqId}] drive upload failed`, e);
            }
          }

          // Envio automático do XML/PDF para a Contabilidade (best-effort)
          if (status === "autorizada") {
            try {
              const { sendFiscalNoteByEmail } = await import("@/lib/nfce-email.server");
              await sendFiscalNoteByEmail(ref);
            } catch (e) {
              console.error(`[focus-nfe ${reqId}] accounting email failed`, e);
            }
          }

          return respond(200, { ok: true, note_id: noteId, sale_id: note.sale_id });
        } catch (e) {
          console.error(`[focus-nfe ${reqId}] handler exception`, e);
          return respond(500, {
            error: "handler exception",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      },
    },
  },
});
