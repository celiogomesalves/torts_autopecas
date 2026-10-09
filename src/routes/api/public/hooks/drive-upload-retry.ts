/**
 * Hook público chamado pelo pg_cron (a cada hora) para verificar se os XMLs
 * das NFC-e autorizadas no dia foram enviados ao Google Drive.
 *
 * O processamento por empresa só ocorre na hora configurada
 * (company_drive_settings.daily_check_hour, em America/Sao_Paulo) e somente
 * quando daily_check_enabled = true.
 *
 * Autenticação: header `apikey` igual ao SUPABASE_PUBLISHABLE_KEY, OU
 * header `x-cron-secret` igual ao DRIVE_RETRY_SECRET.
 */
import { createFileRoute } from "@tanstack/react-router";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorized(request: Request): boolean {
  const expectedApiKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const cronSecret = (process.env.DRIVE_RETRY_SECRET ?? "").trim();

  const apikey = (request.headers.get("apikey") ?? "").trim();
  if (expectedApiKey && apikey && timingSafeEqualStr(apikey, expectedApiKey)) return true;

  const provided = (request.headers.get("x-cron-secret") ?? "").trim();
  if (cronSecret && provided && timingSafeEqualStr(provided, cronSecret)) return true;

  return false;
}

async function runDailyCheck() {
  const { processDailyDriveCheck } = await import("@/lib/google-drive-upload.server");
  const result = await processDailyDriveCheck();
  return {
    companies: result.companies,
    processed: result.processed,
    ok: result.ok,
    failed: result.failed,
    reuploaded: result.reuploaded,
  };
}

export const Route = createFileRoute("/api/public/hooks/drive-upload-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const summary = await runDailyCheck();
          return new Response(JSON.stringify({ ...summary, ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[drive-upload-retry] erro:", msg);
          return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const summary = await runDailyCheck();
        return new Response(JSON.stringify({ ...summary, ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
