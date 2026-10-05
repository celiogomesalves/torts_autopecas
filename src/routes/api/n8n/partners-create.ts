import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { ID } from "node-appwrite";

const N8N_API_KEY = process.env.N8N_API_KEY;

export const Route = createFileRoute("/api/n8n/partners-create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const providedKey = request.headers.get("x-api-key");
          if (N8N_API_KEY && providedKey !== N8N_API_KEY) {
            return Response.json({ error: "Unauthorized: Invalid x-api-key" }, { status: 401 });
          }

          const body = await request.json().catch(() => ({}));
          const { company_id, name, document, phone, email, type = "customer", notes = "" } = body;

          if (!company_id || !name) {
            return Response.json(
              { error: "company_id and name are required" },
              { status: 400 },
            );
          }

          const partner = await serverDatabases.createDocument(
            APPWRITE_DATABASE_ID,
            "partners",
            ID.unique(),
            {
              company_id,
              name,
              document: document || null,
              phone: phone || null,
              email: email || null,
              type,
              notes,
              active: true,
            },
          );

          return Response.json({
            ok: true,
            id: partner.$id,
            partner,
          });
        } catch (error: any) {
          console.error("n8n/partners-create error:", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
    },
  },
});
