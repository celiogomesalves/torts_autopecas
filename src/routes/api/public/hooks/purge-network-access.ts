import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cron-callable endpoint to purge expired IP-company associations.
// Each company defines its own TTL via company_settings.network_access_ttl_days.
export const Route = createFileRoute("/api/public/hooks/purge-network-access")({
  server: {
    handlers: {
      POST: async () => {
        const { data, error } = await supabaseAdmin.rpc("purge_expired_network_access" as any);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true, deleted: data ?? 0 });
      },
    },
  },
});
