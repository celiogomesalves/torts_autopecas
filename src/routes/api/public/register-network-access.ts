import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || null;
}

const Body = z.object({
  company_id: z.string().min(1).max(100),
  access_token: z.string().min(1).max(4000),
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

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { error } = await supabaseAdmin.from("company_network_access").upsert({
            company_id: parsed.company_id,
            ip_address: ip ?? "127.0.0.1",
            user_agent: ua ?? "",
            last_seen_at: new Date().toISOString(),
          });

          if (error) {
            console.error("register_network_access error:", error);
            return new Response(JSON.stringify({ error: (error as any).message }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          return Response.json({ ok: true });
        } catch (err: any) {
          console.error("register-network-access server error:", err);
          return new Response(JSON.stringify({ error: err.message || "Erro no servidor" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
