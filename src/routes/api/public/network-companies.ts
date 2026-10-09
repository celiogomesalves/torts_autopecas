import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Usamos anon key para listar empresas públicas via RPC.
// O RPC list_companies_by_ip deve ser acessível anonimamente ou via role anon.
const SUPABASE_URL = "https://oapfhdcvugcileuxumpb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcGZoZGN2dWdjaWxldXh1bXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTkxNDQsImV4cCI6MjA5MjM3NTE0NH0.I5EbNf4Rkr2XqKTjUUd720sP5V59wr1Xsgr8FMZy5WQ";

function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || null;
}

export const Route = createFileRoute("/api/public/network-companies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        if (!ip) {
          return Response.json({ companies: [], ip: null });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

        const { data, error } = await supabase.rpc("list_companies_by_ip", { _ip: ip });

        if (error) {
          console.error("list_companies_by_ip error:", error);
          return Response.json({ companies: [], ip, error: error.message });
        }

        return Response.json({ companies: data ?? [], ip });
      },
    },
  },
});
