import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query } from "node-appwrite";

export const Route = createFileRoute("/api/functions/product-ai-lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const { query, brand, company_id } = body;
          const term = String(query ?? "").trim();

          if (!term) {
            return Response.json({ ok: false, error: "Informe o nome do produto" }, { status: 400 });
          }

          // Busca primeiro no banco Appwrite de produtos para autocompletar
          const queries = [Query.limit(10)];
          if (company_id) {
            queries.push(Query.equal("company_id", company_id));
          }

          const existing = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "products",
            queries,
          );

          const match = existing.documents.find((p: any) =>
            String(p.name || "").toLowerCase().includes(term.toLowerCase())
          );

          if (match) {
            return Response.json({
              ok: true,
              data: {
                name: match.name,
                originalBrand: match.brand || brand || "",
                originalCode: match.sku || "",
                barcode: match.barcode || "",
                averagePurchasePrice: match.cost_price || 0,
                salePrice: match.sale_price || 0,
                unit: match.unit || "UN",
                details: match.description || "",
                imageUrl: match.image_url || "",
              },
            });
          }

          return Response.json({
            ok: true,
            data: {
              name: term,
              originalBrand: brand || "",
              originalCode: "",
              barcode: "",
              averagePurchasePrice: 0,
              salePrice: 0,
              unit: "UN",
              details: `Aplicação compatível para ${term}`,
              imageUrl: "",
            },
          });
        } catch (error: any) {
          console.error("product-ai-lookup error:", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
      },
    },
  },
});
