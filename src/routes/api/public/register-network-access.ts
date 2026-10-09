import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = "https://oapfhdcvugcileuxumpb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcGZoZGN2dWdjaWxldXh1bXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTkxNDQsImV4cCI6MjA5MjM3NTE0NH0.I5EbNf4Rkr2XqKTjUUd720sP5V59wr1Xsgr8FMZy5WQ";

function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || null;
}

const Body = z.object({
  company_id: z.string().uuid(),
  access_token: z.string().min(10).max(4000),
});

export const Route = createFileRoute("/api/public/register-network-access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return new Response("Invalid body", { status: 400 });
        }

        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") ?? null;

        // Cria cliente autenticado com o token do usuário para segurança
        const supabaseUser = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${parsed.access_token}`,
            },
          },
        });

        // Chama a função SECURITY DEFINER que valida membership e registra o acesso
        const { error } = await supabaseUser.rpc("register_network_access", {
          _company: parsed.company_id,
          _ip: ip ?? "",
          _ua: ua ?? "",
        });

        if (error) {
          console.error("register_network_access error:", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
