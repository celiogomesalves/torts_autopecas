import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query } from "node-appwrite";
import { z } from "zod";

const QuerySchema = z.object({
  company_id: z.string(),
  q: z.string().min(1).max(100),
});

export const Route = createFileRoute("/api/public/stock-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse({
          company_id: url.searchParams.get("company_id"),
          q: url.searchParams.get("q"),
        });
        if (!parsed.success) {
          return Response.json({ items: [] }, { status: 400 });
        }
        try {
          const term = parsed.data.q.toLowerCase();
          const res = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "products",
            [
              Query.equal("company_id", parsed.data.company_id),
              Query.limit(50),
            ],
          );

          // Filtra por termo nos campos relevantes
          const filtered = res.documents.filter((p: any) => {
            const name = String(p.name || "").toLowerCase();
            const sku = String(p.sku || "").toLowerCase();
            const barcode = String(p.barcode || "").toLowerCase();
            const desc = String(p.description || "").toLowerCase();
            return name.includes(term) || sku.includes(term) || barcode.includes(term) || desc.includes(term);
          });

          return Response.json({
            items: filtered.slice(0, 20).map((item: any) => ({
              id: item.$id,
              name: item.name,
              sku: item.sku,
              stock: item.stock,
              sale_price: item.sale_price,
              brand_name: item.brand,
              unit: item.unit,
              image_url: item.image_url || null,
            })),
          });
        } catch (error: any) {
          console.error("stock-search route error:", error);
          return Response.json({ items: [], error: "Erro ao buscar produtos" });
        }
      },
    },
  },
});
