import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Query = z.object({
  company_id: z.string().min(1).max(100),
  q: z.string().min(1).max(100),
});

export const Route = createFileRoute("/api/public/stock-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = Query.safeParse({
          company_id: url.searchParams.get("company_id"),
          q: url.searchParams.get("q"),
        });
        if (!parsed.success) {
          return Response.json({ items: [] }, { status: 400 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const term = parsed.data.q.toLowerCase().trim();

          const { data: prods, error } = await supabaseAdmin
            .from("products")
            .select("id, name, sku, barcode, stock, price, sale_price, image_url, brand, category_id, is_active")
            .eq("company_id", parsed.data.company_id);

          if (error) {
            console.error("public_stock_search error:", error);
            return Response.json({ items: [], error: (error as any).message });
          }

          const filtered = (prods || []).filter((p: any) => {
            if (p.is_active === false) return false;
            const name = (p.name || "").toLowerCase();
            const sku = (p.sku || "").toLowerCase();
            const barcode = (p.barcode || "").toLowerCase();
            const brand = (p.brand || "").toLowerCase();
            return (
              name.includes(term) ||
              sku.includes(term) ||
              barcode.includes(term) ||
              brand.includes(term)
            );
          });

          return Response.json({
            items: filtered.slice(0, 50).map((item: any) => ({
              ...item,
              image_url: item.image_url || null,
            })),
          });
        } catch (error) {
          console.error("stock-search route error:", error);
          return Response.json({ items: [], error: "Erro ao buscar produtos" });
        }
      },
    },
  },
});
