import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { ID } from "node-appwrite";

function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || null;
}

const Body = z.object({
  company_id: z.string(),
  access_token: z.string().optional(),
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
          await serverDatabases.createDocument(
            APPWRITE_DATABASE_ID,
            "company_network_access",
            ID.unique(),
            {
              company_id: parsed.company_id,
              ip: ip ?? "",
              user_agent: ua ?? "",
            },
          );
          return Response.json({ ok: true });
        } catch (error: any) {
          console.error("register_network_access error:", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
