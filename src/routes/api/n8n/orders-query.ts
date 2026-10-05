import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query } from "node-appwrite";

const N8N_API_KEY = process.env.N8N_API_KEY;

export const Route = createFileRoute("/api/n8n/orders-query")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const providedKey = request.headers.get("x-api-key");
          if (N8N_API_KEY && providedKey !== N8N_API_KEY) {
            return Response.json({ error: "Unauthorized: Invalid x-api-key" }, { status: 401 });
          }

          const body = await request.json().catch(() => ({}));
          const { company_id, status, limit = 50, offset = 0 } = body;

          if (!company_id) {
            return Response.json(
              { error: "Bad Request: company_id is required" },
              { status: 400 },
            );
          }

          const queries = [
            Query.equal("company_id", company_id),
            Query.limit(Math.min(limit, 100)),
            Query.offset(offset),
            Query.orderDesc("$createdAt"),
          ];

          if (status) queries.push(Query.equal("status", status));

          const res = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "sales",
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
          console.error("n8n/orders-query error:", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
    },
  },
});
