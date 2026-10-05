import { useQuery } from "@tanstack/react-query";
import { appwrite } from "@/integrations/appwrite/client";

const DEFAULT_NAME = "AutoPeças";

export function useBranding() {
  const q = useQuery({
    queryKey: ["branding"],
    staleTime: 60 * 60 * 1000, // 1 hora: branding muda raramente
    queryFn: async () => {
      const { data } = await appwrite
        .from("system_settings" as any)
        .select("brand_name, brand_logo_url")
        .maybeSingle();
      return {
        name: ((data as any)?.brand_name as string | null) || DEFAULT_NAME,
        logoUrl: ((data as any)?.brand_logo_url as string | null) || null,
      };
    },
  });

  return {
    name: q.data?.name ?? DEFAULT_NAME,
    logoUrl: q.data?.logoUrl ?? null,
    isLoading: q.isLoading,
  };
}
