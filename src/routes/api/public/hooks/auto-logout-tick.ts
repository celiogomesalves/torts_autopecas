import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint chamado a cada minuto por pg_cron.
// Verifica empresas com auto_logout_enabled=true cujo horário
// (em America/Sao_Paulo) bate o minuto atual e ainda não disparou hoje.
// Ao bater, carimba force_logout_at = now() para invalidar sessões dos clientes.
export const Route = createFileRoute("/api/public/hooks/auto-logout-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL;
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        // Auth simples: header apikey precisa bater com o anon
        const apikey = request.headers.get("apikey");
        if (!url || !anon) {
          return new Response(JSON.stringify({ error: "Server misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (apikey !== anon) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Busca empresas elegíveis: enabled=true, horário bate no minuto atual (SP)
        // e last_forced_logout_at é anterior ao começo do dia atual (SP).
        const { data: rows, error } = await supabaseAdmin.rpc("companies_due_for_auto_logout" as any);
        if (error) {
          console.error("auto-logout-tick rpc error", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const ids = ((rows as any[]) || []).map((r) => r.company_id);
        if (ids.length === 0) {
          return new Response(JSON.stringify({ triggered: 0 }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const nowIso = new Date().toISOString();
        const { error: upErr } = await supabaseAdmin
          .from("company_settings")
          .update({ force_logout_at: nowIso, last_forced_logout_at: nowIso } as any)
          .in("company_id", ids);
        if (upErr) {
          console.error("auto-logout-tick update error", upErr);
          return new Response(JSON.stringify({ error: upErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ triggered: ids.length, companies: ids }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
