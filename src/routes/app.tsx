import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { appwrite as supabase } from "@/integrations/appwrite/client";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { fetchMyCompanies, isSuperAdmin, hasPermission } from "@/lib/db";
import { Loader2, Clock, Wrench, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBranding } from "@/hooks/use-branding";

const PATH_TO_MODULE: Record<string, string> = {
  "/app": "dashboard",
  "/app/vendas": "vendas",
  "/app/fechamento-caixa": "fechamento-caixa",
  "/app/estoque": "estoque",
  "/app/financeiro": "financeiro",
  "/app/fluxo-caixa": "financeiro",
  "/app/conciliacao": "financeiro",
  "/app/delivery": "delivery",
  "/app/notas-fiscais": "notas-fiscais",
  "/app/produtos": "produtos",
  "/app/categorias": "categorias",
  "/app/marcas": "marcas",
  "/app/unidades": "unidades",
  "/app/localizacoes": "localizacoes",
  "/app/parceiros": "parceiros",
  "/app/formas-pagamento": "formas-pagamento",
  "/app/relatorios": "relatorios",
  "/app/equipe": "equipe",
  "/app/configuracoes": "configuracoes",
};

const getModuleFromPath = (path: string) => {
  if (path === "/app") return "dashboard";

  const sortedPaths = Object.keys(PATH_TO_MODULE)
    .filter((p) => p !== "/app")
    .sort((a, b) => b.length - a.length);

  for (const p of sortedPaths) {
    if (path === p || path.startsWith(p + "/") || path.startsWith(p + ".")) {
      return PATH_TO_MODULE[p];
    }
  }
  return "";
};

export const Route = createFileRoute("/app")({
  loader: async ({ context: { queryClient }, location }) => {
    // Busca a sessão atual de forma rápida
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Identifica o módulo atual para prefetch de permissões
    const moduleId = getModuleFromPath(location.pathname);

    // Tenta obter o companyId do localStorage (mesma lógica do AuthProvider)
    let companyId: string | null = null;
    if (typeof window !== "undefined") {
      try {
        companyId = localStorage.getItem("ap.currentCompanyId");
      } catch {
        /* ignore */
      }
    }

    const promises: Promise<any>[] = [
      queryClient.ensureQueryData({
        queryKey: ["systemSettings"],
        queryFn: async () => {
          const { data } = await supabase
            .from("system_settings" as any)
            .select("*")
            .maybeSingle();
          return data;
        },
        staleTime: 5 * 60 * 1000,
      }),
      queryClient.ensureQueryData({
        queryKey: ["branding"],
        queryFn: async () => {
          const { data } = await supabase
            .from("system_settings" as any)
            .select("brand_name, brand_logo_url")
            .maybeSingle();
          return {
            name: ((data as any)?.brand_name as string | null) || "AutoPeças",
            logoUrl: ((data as any)?.brand_logo_url as string | null) || null,
          };
        },
        staleTime: 5 * 60 * 1000,
      }),
    ];

    if (userId) {
      promises.push(
        queryClient.ensureQueryData({
          queryKey: ["companies", userId],
          queryFn: () => fetchMyCompanies(userId),
          staleTime: 5 * 60 * 1000,
        }),
        queryClient.ensureQueryData({
          queryKey: ["isSuperAdmin", userId],
          queryFn: isSuperAdmin,
          staleTime: 5 * 60 * 1000,
        }),
      );

      if (companyId && moduleId) {
        promises.push(
          queryClient.ensureQueryData({
            queryKey: ["route-permission", companyId, moduleId, userId],
            queryFn: () => hasPermission(companyId!, moduleId, "view"),
            staleTime: 2 * 60 * 1000,
          }),
        );
      }
    }

    // Aguarda o essencial para evitar flicker
    await Promise.allSettled(promises);
  },
  component: AppLayout,
});

function AppLayout() {
  const branding = useBranding();
  const { user, loading, currentCompanyId, setCurrentCompanyId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({ to: "/login" });
      return;
    }

    if (!currentCompanyId && !location.pathname.startsWith("/empresas")) {
      navigate({ to: "/empresas" });
    }
  }, [loading, user, currentCompanyId, navigate, location.pathname]);

  const companiesQ = useQuery({
    queryKey: ["companies", user?.id],
    queryFn: () => fetchMyCompanies(user?.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const superAdminQ = useQuery({
    queryKey: ["isSuperAdmin", user?.id],
    queryFn: isSuperAdmin,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const systemSettingsQ = useQuery({
    queryKey: ["systemSettings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings" as any)
        .select("*")
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const moduleId = getModuleFromPath(location.pathname);

  const permQ = useQuery({
    queryKey: ["route-permission", currentCompanyId, moduleId, user?.id],
    queryFn: () => hasPermission(currentCompanyId!, moduleId, "view"),
    enabled: !!currentCompanyId && !!user && !!moduleId && !superAdminQ.data,
    staleTime: 2 * 60 * 1000,
  });

  const isSuper = !!superAdminQ.data;
  const moduleConfigs = (systemSettingsQ.data as any)?.module_configs || [];
  const moduleConfig = moduleId ? moduleConfigs.find((c: any) => c.id === moduleId) : null;
  const isEnabled = !moduleConfig || moduleConfig.enabled !== false;

  const hasPermissionAccess = isSuper || !moduleId || (permQ.data ?? false);
  const isAuthorized = isEnabled && hasPermissionAccess;

  const company = (companiesQ.data ?? []).find((c) => c.id === currentCompanyId);
  const isPending = company && company.approved === false && !isSuper;
  const isBlocked = company && (company as any).is_blocked && !isSuper;

  const isInitialLoading =
    loading ||
    (companiesQ.isLoading && !companiesQ.data) ||
    (moduleId && permQ.isLoading && !permQ.data);

  if (isInitialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-brand-red flex items-center justify-center shadow-lg shadow-brand-red/20 overflow-hidden">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.name}
                  className="size-full object-cover"
                />
              ) : (
                <Wrench className="size-7 text-brand-red-foreground" />
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight leading-none">
                {branding.name}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-brand-orange font-semibold">
                ERP Multiempresa
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-5 text-brand-orange animate-spin" />
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              Validando permissões...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !currentCompanyId) return null;

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="mx-auto size-16 rounded-full bg-brand-orange/15 text-brand-orange flex items-center justify-center">
            <Clock className="size-8" />
          </div>
          <h1 className="text-2xl font-bold">Empresa aguardando aprovação</h1>
          <p className="text-sm text-muted-foreground">
            A empresa <strong>{company?.name}</strong> precisa ser aprovada por um super
            administrador antes de ser utilizada.
            {company?.rejection_reason ? (
              <span className="block mt-2 text-brand-red">
                Motivo da última rejeição: {company.rejection_reason}
              </span>
            ) : null}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setCurrentCompanyId(null);
              navigate({ to: "/empresas" });
            }}
          >
            Voltar para Empresas
          </Button>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="mx-auto size-20 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center shadow-inner">
            <ShieldAlert className="size-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Acesso Bloqueado</h1>
            <p className="text-muted-foreground">
              Seu acesso à empresa <strong>{company?.name}</strong> foi suspenso pela administração.
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg border border-border text-sm text-left space-y-3">
            <p className="font-medium text-foreground">O que fazer agora?</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Entre em contato com a administração da sua empresa.</li>
              <li>Contate o suporte técnico se acreditar que isso é um erro.</li>
              <li>Tente acessar com outra empresa se possuir permissão.</li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              className="w-full bg-brand-red hover:bg-brand-red/90"
              onClick={() => {
                setCurrentCompanyId(null);
                navigate({ to: "/empresas" });
              }}
            >
              Trocar de Empresa
            </Button>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => supabase.auth.signOut()}
            >
              Sair da conta
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto size-20 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center">
            <ShieldAlert className="size-10" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Acesso Negado</h1>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar este módulo ou ele está desativado.
            </p>
            {moduleId && (
              <Badge variant="outline" className="mt-2 uppercase tracking-widest text-[10px]">
                Módulo: {moduleId}
              </Badge>
            )}
          </div>
          <Button onClick={() => navigate({ to: "/app" })} className="w-full">
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AppShell key={currentCompanyId}>
      <Outlet />
    </AppShell>
  );
}
