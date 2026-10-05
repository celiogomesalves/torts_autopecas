import { createFileRoute } from "@tanstack/react-router";
import { serverDatabases, APPWRITE_DATABASE_ID } from "@/integrations/appwrite/client.server";
import { Query } from "node-appwrite";

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
          const list = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "company_network_access",
            [Query.equal("ip", ip)],
          );
          const companyIds = list.documents.map((d: any) => d.company_id);
          if (companyIds.length === 0) {
            return Response.json({ companies: [], ip });
          }

          const companies = await serverDatabases.listDocuments(
            APPWRITE_DATABASE_ID,
            "companies",
            [Query.equal("$id", companyIds)],
          );

          return Response.json({
            companies: companies.documents.map((c: any) => ({
              id: c.$id,
              name: c.name,
            })),
            ip,
          });
        } catch (error: any) {
          console.error("network-companies error:", error);
          return Response.json({ companies: [], ip, error: error.message });
        }
      },
    },
  },
});
