import { createFileRoute } from "@tanstack/react-router";

function getClientIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || null;
}

export const Route = createFileRoute("/api/public/network-companies")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        if (!ip) {
          return Response.json({ companies: [], ip: null });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: accesses, error: accErr } = await supabaseAdmin
            .from("company_network_access")
            .select("company_id")
            .eq("ip_address", ip);

          if (accErr) {
            console.error("list_companies_by_ip error:", accErr);
            return Response.json({ companies: [], ip, error: (accErr as any).message });
          }

          const companyIds = Array.from(
            new Set((accesses || []).map((a: any) => a.company_id).filter(Boolean)),
          );
          if (companyIds.length === 0) {
            return Response.json({ companies: [], ip });
          }

          const { data: comps } = await supabaseAdmin
            .from("companies")
            .select("id, name, trade_name, cnpj, logo_url");

          const matchedComps = (comps || []).filter((c: any) =>
            companyIds.includes(c.id || c.$id),
          );

          return Response.json({ companies: matchedComps, ip });
        } catch (error) {
          console.error("network-companies route error:", error);
          return Response.json({ companies: [], ip, error: "Erro ao buscar empresas da rede" });
        }
      },
    },
  },
});
