import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const SUPABASE_URL = "https://oapfhdcvugcileuxumpb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcGZoZGN2dWdjaWxldXh1bXBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTkxNDQsImV4cCI6MjA5MjM3NTE0NH0.I5EbNf4Rkr2XqKTjUUd720sP5V59wr1Xsgr8FMZy5WQ";

const Query = z.object({
  company_id: z.string().uuid(),
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
          const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
          const { data, error } = await supabase.rpc("public_stock_search" as any, {
            _company: parsed.data.company_id,
            _term: parsed.data.q,
          });
          if (error) {
            console.error("public_stock_search error:", error);
            return Response.json({ items: [], error: error.message });
          }
          return Response.json({
            items: ((data as any[]) ?? []).map((item) => ({
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
