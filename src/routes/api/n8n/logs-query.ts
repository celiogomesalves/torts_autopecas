import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query } from "node-appwrite";

const N8N_API_KEY = process.env.N8N_API_KEY;

export const Route = createFileRoute("/api/n8n/logs-query")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const providedKey = request.headers.get("x-api-key");
          if (N8N_API_KEY && providedKey !== N8N_API_KEY) {
            return Response.json({ error: "Unauthorized: Invalid x-api-key" }, { status: 401 });
          }

          const body = await request.json().catch(() => ({}));
          const { session_id, limit = 50 } = body;

          const queries = [Query.limit(Math.min(limit, 100)), Query.orderDesc("$createdAt")];
          if (session_id) queries.push(Query.equal("session_id", session_id));

          const res = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "n8n_chat_histories",
            queries,
          );

          return Response.json({
            ok: true,
            total: res.total,
            items: res.documents.map((d: any) => ({
              id: d.$id,
              ...d,
            })),
          });
        } catch (error: any) {
          console.error("n8n/logs-query error:", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
    },
  },
});
