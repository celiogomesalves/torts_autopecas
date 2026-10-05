import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query } from "node-appwrite";

const N8N_API_KEY = process.env.N8N_API_KEY;

export const Route = createFileRoute("/api/n8n/products-query")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const providedKey = request.headers.get("x-api-key");
          if (N8N_API_KEY && providedKey !== N8N_API_KEY) {
            return Response.json({ error: "Unauthorized: Invalid x-api-key" }, { status: 401 });
          }

          const body = await request.json().catch(() => ({}));
          const { company_id, search = "", limit = 50, offset = 0, filters = {} } = body;

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
          ];

          if (filters.category_id) queries.push(Query.equal("category_id", filters.category_id));
          if (filters.brand_id) queries.push(Query.equal("brand_id", filters.brand_id));
          if (filters.active !== undefined) queries.push(Query.equal("active", Boolean(filters.active)));

          const res = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "products",
            queries,
          );

          let docs = res.documents.map((d: any) => ({
            id: d.$id,
            ...d,
          }));

          if (search && search.trim() !== "") {
            const term = search.toLowerCase().trim();
            docs = docs.filter((p: any) => {
              const name = String(p.name || "").toLowerCase();
              const sku = String(p.sku || "").toLowerCase();
              const brand = String(p.brand || "").toLowerCase();
              const desc = String(p.description || "").toLowerCase();
              return name.includes(term) || sku.includes(term) || brand.includes(term) || desc.includes(term);
            });
          }

          return Response.json({
            ok: true,
            total: res.total,
            count: docs.length,
            items: docs,
          });
        } catch (error: any) {
          console.error("n8n/products-query error:", error);
          return Response.json({ error: error.message }, { status: 500 });
        }
      },
    },
  },
});
