import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { useEffect, useState, type ReactNode } from "react";
import { initScrollReveal } from "@/lib/scroll-reveal";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Bell, Calendar as CalendarIcon } from "lucide-react";
import { fetchMyCompanies, isSuperAdmin, hasPermission, hasRole, isAdmin } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Package,
  Tags,
  ArrowLeftRight,
  AlertTriangle,
  LogOut,
  Building2,
  ChevronsUpDown,
  ChevronDown,
  Wrench,
  ShoppingCart,
  Users,
  Wallet,
  Contact,
  Boxes,
  ClipboardList,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  TrendingUp,
  BarChart3,
  Truck,
  FileText,
  Banknote,
  Award,
  CreditCard,
  Settings,
  Ruler,
  Calculator,
  MapPin,
  Shield,
  RefreshCw,
  User,
  Calendar,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import { useConfirm } from "@/components/confirm-dialog";
import { useBranding } from "@/hooks/use-branding";
import { cn } from "@/lib/utils";
import { OverdueTasksDialog, useOverdueTasks } from "@/components/overdue-tasks-dialog";


type NavLeaf = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};
type NavGroup = {
  label: string;
  icon: typeof LayoutDashboard;
  children: NavLeaf[];
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};
type NavEntry = NavLeaf | NavGroup;

const navItems: ReadonlyArray<NavEntry> = [
  { to: "/app", label: "Página Inicial", icon: LayoutDashboard, exact: true },
  {
    label: "Vendas (PDV)",
    icon: ShoppingCart,
    children: [
      { to: "/app/vendas", label: "Realizar Vendas", icon: ShoppingCart },
      { to: "/app/orcamentos", label: "Gerar Orçamentos", icon: FileText },
      { to: "/app/fechamento-caixa", label: "Gestão de Caixa", icon: Calculator },
    ],
  },
  { to: "/app/estoque", label: "Estoque", icon: Boxes },

  {
    label: "Financeiro",
    icon: Wallet,
    children: [
      { to: "/app/financeiro", label: "Contas", icon: Wallet },
      { to: "/app/fluxo-caixa", label: "Fluxo de caixa", icon: TrendingUp },
      { to: "/app/conciliacao", label: "Conciliação", icon: Banknote },
      { to: "/app/notas-fiscais", label: "Notas Fiscais", icon: FileText },
      { to: "/app/auditoria-fiscal", label: "Auditoria fiscal", icon: FileText },
    ],
  },
  { to: "/app/delivery", label: "Delivery", icon: Truck },
  {
    label: "Cadastros",
    icon: ClipboardList,
    children: [
      { to: "/app/produtos", label: "Produtos", icon: Package },
      { to: "/app/categorias", label: "Categorias", icon: Tags },
      { to: "/app/marcas", label: "Marcas", icon: Award },
      { to: "/app/unidades", label: "Unidades de Medida", icon: Ruler },
      { to: "/app/localizacoes", label: "Localização", icon: MapPin },
      { to: "/app/parceiros", label: "Clientes & Forn.", icon: Contact },
      { to: "/app/formas-pagamento", label: "Formas de Pagamento", icon: CreditCard },
    ],
  },
  { to: "/app/relatorios", label: "Relatórios", icon: BarChart3 },

  { to: "/app/equipe", label: "Equipe", icon: Users },
  { to: "/app/agenda", label: "Agenda", icon: Calendar },
  { to: "/app/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },

  { to: "/super-admin", label: "Painel Master", icon: Shield, superAdminOnly: true },
];

function isGroup(e: NavEntry): e is NavGroup {
  return (e as NavGroup).children !== undefined;
}

function GlobalLoadingIndicator() {
  const isFetching = useIsFetching();
  const queryClient = useQueryClient();

  if (isFetching === 0) return null;

  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted overflow-hidden z-[60]">
      <div className="h-full bg-brand-orange animate-progress-fast shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
      <div className="absolute right-3 top-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange border border-brand-orange/20">
        <RefreshCw className="size-3 animate-spin" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Atualizando...</span>
      </div>
    </div>
  );
}
interface SidebarContentProps {
  isSidebarOpen: boolean;
  visibleNav: NavEntry[];
  isActive: (to: string, exact?: boolean) => boolean;
  setIsMobileOpen: (open: boolean) => void;
  user: SupabaseUser | null;
  pendingCount: number;
  pendingTasksCount: number;
  confirm: any;
  onLogout: () => void;
}

const SidebarContent = ({
  isSidebarOpen,
  visibleNav,
  isActive,
  setIsMobileOpen,
  user,
  pendingCount,
  pendingTasksCount,
  confirm,
  onLogout,
}: SidebarContentProps) => (
  <div className="flex flex-col h-full bg-sidebar">
    <BrandingHeader collapsed={!isSidebarOpen} />

    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
      {visibleNav.map((item) => {
        if (isGroup(item)) {
          return (
            <NavGroupItem
              key={item.label}
              group={item}
              isActive={isActive}
              collapsed={!isSidebarOpen}
              onItemClick={() => setIsMobileOpen(false)}
            />
          );
        }
        const active = isActive(item.to, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setIsMobileOpen(false)}
            className={[
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all relative group",
              active
                ? "bg-brand-red/10 text-brand-red font-semibold border-l-[3px] border-brand-red shadow-[inset_1px_0_0_0_rgba(239,68,68,0.2)] shadow-sm"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover:translate-x-0.5",
            ].join(" ")}
          >
            <Icon className="size-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:text-brand-orange" />
            {isSidebarOpen ? (
              <div className="flex items-center justify-between w-full min-w-0">
                <span className="truncate">{item.label}</span>
                {item.to === "/app/delivery" && pendingCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-auto px-1.5 h-4 min-w-4 flex items-center justify-center text-[10px]"
                  >
                    {pendingCount}
                  </Badge>
                )}
                {item.to === "/app/agenda" && pendingTasksCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-auto px-1.5 h-4 min-w-4 flex items-center justify-center text-[10px] bg-brand-orange hover:bg-brand-orange"
                  >
                    {pendingTasksCount}
                  </Badge>
                )}
              </div>
            ) : (
              <div className="relative group-hover:static">
                {item.to === "/app/delivery" && pendingCount > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 size-4 bg-brand-red text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-sidebar">
                    {pendingCount}
                  </div>
                )}
                {item.to === "/app/agenda" && pendingTasksCount > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 size-4 bg-brand-orange text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-sidebar">
                    {pendingTasksCount}
                  </div>
                )}
                <div className="fixed left-16 bg-popover text-popover-foreground px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 pointer-events-none border shadow-md z-50 transition-opacity whitespace-nowrap">
                  {item.label}
                  {item.to === "/app/delivery" && pendingCount > 0 && ` (${pendingCount})`}
                  {item.to === "/app/agenda" && pendingTasksCount > 0 && ` (${pendingTasksCount})`}
                </div>
              </div>
            )}
          </Link>
        );
      })}
    </nav>

    <div className="p-3 border-t border-sidebar-border bg-sidebar/30 backdrop-blur-sm">
      {isSidebarOpen ? (
        <div className="p-2.5 rounded-lg bg-background/30 border border-white/5 mb-2 shadow-inner">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            Logado como
          </div>
          <div className="text-sm font-semibold truncate text-foreground mt-0.5">
            {user?.user_metadata?.name || user?.email}
          </div>
          <div className="text-[10px] text-muted-foreground truncate">{user?.email}</div>
        </div>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className={`w-full text-sidebar-foreground/80 hover:bg-sidebar-accent ${isSidebarOpen ? "justify-start" : "justify-center"}`}
        onClick={async () => {
          if (
            await confirm({
              title: "Sair do sistema?",
              description:
                "Tem certeza que deseja sair? Você precisará fazer login novamente para acessar.",
              confirmLabel: "Sair",
              variant: "default",
            })
          )
            onLogout();
        }}
      >
        <LogOut className={`size-4 ${isSidebarOpen ? "mr-2" : ""}`} />
        {isSidebarOpen && <span>Sair</span>}
      </Button>
    </div>
  </div>
);

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, currentCompanyId, setCurrentCompanyId } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const companiesQ = useQuery({
    queryKey: ["companies", user?.id],
    queryFn: fetchMyCompanies,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const canSeeInviteQ = useQuery({
    queryKey: ["can-see-invite", currentCompanyId, user?.id],
    queryFn: async () => {
      if (!currentCompanyId) return false;
      const [admin, gerente] = await Promise.all([
        isAdmin(currentCompanyId),
        hasRole(currentCompanyId, "gerente"),
      ]);
      return admin || gerente;
    },
    enabled: !!currentCompanyId && !!user,
    staleTime: 5 * 60 * 1000,
  });

  const inviteCodeQ = useQuery({
    queryKey: ["invite-code", currentCompanyId],
    enabled: !!currentCompanyId && !!canSeeInviteQ.data,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_company_invite_code" as any, { _company: currentCompanyId });
      return (data as string | null) ?? null;
    },
  });

  const companies = companiesQ.data ?? [];
  const company = companies.find((c) => c.id === currentCompanyId);

  const deliveryOrdersQ = useQuery({
    queryKey: ["delivery-orders-count", currentCompanyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("delivery_orders")
        .select("*", { count: "exact", head: true })
        .eq("company_id", currentCompanyId!)
        .eq("status", "aguardando_confirmacao");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentCompanyId,
  });

  const pendingCount = deliveryOrdersQ.data || 0;
  
  const pendingTasksQ = useQuery({
    queryKey: ["pending-tasks-count", currentCompanyId, user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_tasks" as any)
        .select("*", { count: "exact", head: true })
        .eq("company_id", currentCompanyId!)
        .eq("user_id", user!.id)
        .eq("status", "pending");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentCompanyId && !!user,
  });

  const pendingTasksCount = pendingTasksQ.data || 0;

  // Lembrete diário de tarefas atrasadas (uma vez por dia por usuário)
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  const overdueTasksQ = useOverdueTasks(currentCompanyId, user?.id);

  useEffect(() => {
    if (!currentCompanyId || !user?.id) return;
    const overdue = overdueTasksQ.data;
    if (!overdue || overdue.length === 0) return;
    const key = `overdue-tasks-reminded-${user.id}-${new Date().toISOString().slice(0, 10)}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setOverdueDialogOpen(true);
  }, [currentCompanyId, user?.id, overdueTasksQ.data]);



  // Fallback: revalida os contadores a cada 15s caso o realtime esteja indisponível
  useEffect(() => {
    if (!currentCompanyId) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["delivery-orders-count", currentCompanyId] });
      queryClient.invalidateQueries({ queryKey: ["pending-tasks-count", currentCompanyId, user?.id] });
    }, 15000);
    return () => clearInterval(id);
  }, [currentCompanyId, user?.id, queryClient]);

  useEffect(() => {
    if (!currentCompanyId) return;

    const channel = supabase
      .channel(`delivery-orders-changes-${currentCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_orders",
          filter: `company_id=eq.${currentCompanyId}`,
        },
        (payload) => {
          // Sempre revalida o contador
          queryClient.invalidateQueries({ queryKey: ["delivery-orders-count", currentCompanyId] });

          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          const isAwaiting = newRow && newRow.status === "aguardando_confirmacao";
          const wasAwaiting = oldRow && oldRow.status === "aguardando_confirmacao";

          // Dispara toast em INSERT aguardando OU UPDATE que entrou em aguardando
          if (isAwaiting && !wasAwaiting) {
            toast.info("Novo pedido Delivery!", {
              description: `Pedido de ${newRow.customer_name || "Cliente"} aguardando confirmação.`,
              duration: 10000,
              icon: <Bell className="size-4" />,
              action: {
                label: "Ver pedidos",
                onClick: () => navigate({ to: "/app/delivery" }),
              },
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentCompanyId, queryClient, navigate]);

  // Monitoramento de Lembretes de Tarefas e Realtime para o Badge
  useEffect(() => {
    if (!currentCompanyId || !user?.id) return;

    // Realtime subscription para atualizar o badge de tarefas pendentes
    const taskChannel = supabase
      .channel(`user-tasks-changes-${currentCompanyId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_tasks",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["pending-tasks-count", currentCompanyId, user.id] });
          queryClient.invalidateQueries({ queryKey: ["user-tasks", currentCompanyId, user.id] });
        }
      )
      .subscribe();

    const checkReminders = async () => {
      try {
        const now = new Date();
        const nowIso = now.toISOString();

        const { data: tasks } = await (supabase
          .from("user_tasks" as any)
          .select("*")
          .eq("company_id", currentCompanyId)
          .eq("user_id", user.id)
          .eq("status", "pending")
          .lte("reminder_at", nowIso)
          .gt("due_at", nowIso) as any);

        if (tasks && tasks.length > 0) {
          // Prioriza configurações de som do usuário, com fallback para a empresa
          const { data: userSettings } = await supabase
            .from("user_settings" as any)
            .select("agenda_alert_sound_enabled, agenda_alert_sound_type")
            .eq("user_id", user.id)
            .eq("company_id", currentCompanyId)
            .maybeSingle();

          let soundEnabled = true;
          let soundType = "bell";

          if (userSettings) {
            soundEnabled = (userSettings as any).agenda_alert_sound_enabled ?? true;
            soundType = (userSettings as any).agenda_alert_sound_type ?? "bell";
          } else {
            const { data: companySettings } = await supabase
              .from("company_settings")
              .select("agenda_alert_sound_enabled, agenda_alert_sound_type")
              .eq("company_id", currentCompanyId)
              .maybeSingle();
            
            soundEnabled = (companySettings as any)?.agenda_alert_sound_enabled ?? true;
            soundType = (companySettings as any)?.agenda_alert_sound_type ?? "bell";
          }

          // Emite som de notificação se habilitado
          if (soundEnabled) {
            try {
              const soundUrls: Record<string, string> = {
                bell: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
                chime: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3",
                digital: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3",
                notification: "https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3",
              };
              const audio = new Audio(soundUrls[soundType] || soundUrls.bell);
              audio.volume = 0.5;
              void audio.play();
            } catch (e) {
              console.warn("Falha ao reproduzir som de notificação:", e);
            }
          }

          tasks.forEach((task: any) => {
            const toastKey = `reminder-${task.id}-${new Date().getMinutes()}`;
            toast.info("Lembrete de Compromisso", {
              id: toastKey,
              description: `${task.title} às ${new Date(task.due_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
              icon: <CalendarIcon className="size-4 text-brand-orange" />,
              action: {
                label: "Ver Agenda",
                onClick: () => navigate({ to: "/app/agenda" }),
              },
            });
          });
        }
      } catch (e) {
        console.warn("Reminder check failed", e);
      }
    };

    const interval = setInterval(checkReminders, 60_000);
    checkReminders();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(taskChannel);
    };
  }, [currentCompanyId, user?.id, navigate, queryClient]);


  // Papel do usuário na empresa atual (para esconder itens admin-only)
  const myMembershipQ = useQuery({
    queryKey: ["my-membership", user?.id, currentCompanyId],
    enabled: !!user && !!currentCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("memberships")
        .select("role")
        .eq("user_id", user!.id)
        .eq("company_id", currentCompanyId!)
        .maybeSingle();
      return (data?.role as string | undefined) ?? null;
    },
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

  const myRole = myMembershipQ.data;
  const isSuper = !!superAdminQ.data;

  const moduleConfigs = (systemSettingsQ.data as any)?.module_configs || [];

  const isModuleEnabled = (moduleId: string) => {
    const config = moduleConfigs.find((c: any) => c.id === moduleId);
    return config ? config.enabled !== false : true;
  };

  const labelToModule: Record<string, string> = {
    "Página Inicial": "dashboard",
    "Vendas (PDV)": "vendas",
    "Realizar Vendas": "vendas",
    "Gerar Orçamentos": "vendas",
    "Gestão de Caixa": "fechamento-caixa",
    Estoque: "estoque",
    Financeiro: "financeiro",
    Contas: "financeiro",
    "Fluxo de caixa": "financeiro",
    Conciliação: "financeiro",
    Delivery: "delivery",
    "Notas Fiscais": "notas-fiscais",
    Relatórios: "relatorios",
    Equipe: "equipe",
    Produtos: "produtos",
    Categorias: "categorias",
    Marcas: "marcas",
    "Unidades de Medida": "unidades",
    Localização: "localizacoes",
    "Clientes & Forn.": "parceiros",
    "Formas de Pagamento": "formas-pagamento",
    Configurações: "configuracoes",
    Agenda: "agenda",
  };

  const myPermissionsQ = useQuery({
    queryKey: ["my-permissions-list", currentCompanyId, user?.id],
    queryFn: async () => {
      const { data: member } = await supabase
        .from("memberships")
        .select("role, custom_role_id")
        .eq("user_id", user!.id)
        .eq("company_id", currentCompanyId!)
        .maybeSingle();

      if (!member) return [];
      if (member.role === "admin") return "all";
      if (!member.custom_role_id) return [];

      const { data } = await supabase
        .from("role_permissions")
        .select("module, can_view")
        .eq("role_id", member.custom_role_id);

      return data || [];
    },
    enabled: !!currentCompanyId && !!user && !isSuper,
    staleTime: 5 * 60 * 1000,
  });

  const hasViewPermission = (moduleId: string) => {
    if (isSuper) return true;
    if (!moduleId || moduleId === "dashboard") return true;
    if (myPermissionsQ.data === "all") return true;
    if (!Array.isArray(myPermissionsQ.data)) return false;
    const perm = myPermissionsQ.data.find((p) => p.module === moduleId);
    return perm ? perm.can_view : false;
  };

  const filterNav = (items: ReadonlyArray<NavEntry>): NavEntry[] => {
    return items
      .filter((it) => {
        if (it.superAdminOnly && !isSuper) return false;

        if (it.adminOnly && !isSuper && !hasViewPermission("configuracoes")) return false;

        const moduleId = labelToModule[it.label] || "";
        if (moduleId && !hasViewPermission(moduleId)) return false;

        if (!isGroup(it) && !isModuleEnabled(moduleId)) return false;
        return true;
      })
      .map((it) => {
        if (isGroup(it)) {
          return {
            ...it,
            children: it.children.filter((c) => {
              const childModuleId = labelToModule[c.label] || "";
              if (childModuleId && !hasViewPermission(childModuleId)) return false;
              return isModuleEnabled(childModuleId);
            }),
          };
        }
        return it;
      })
      .filter((it) => !isGroup(it) || it.children.length > 0);
  };

  const visibleNav = filterNav(navItems);

  // Initialize scroll-reveal animations on route change
  useEffect(() => {
    const timer = setTimeout(() => initScrollReveal(), 100);
    return () => clearTimeout(timer);
  }, [pathname]);

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname.startsWith(to);

  return (
    <div className="h-[100dvh] flex bg-background text-foreground overflow-hidden">
      {/* Noise overlay for subtle depth texture */}
      <div className="noise-overlay" />
      <OverdueTasksDialog
        open={overdueDialogOpen}
        onOpenChange={setOverdueDialogOpen}
        companyId={currentCompanyId}
        userId={user?.id}
        continueLabel="Fechar"
      />

      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex shrink-0 border-r border-sidebar-border flex-col transition-all duration-300 ease-in-out ${
          isSidebarOpen ? "w-64" : "w-16"
        }`}
      >
        <SidebarContent
          isSidebarOpen={isSidebarOpen}
          visibleNav={visibleNav}
          isActive={isActive}
          setIsMobileOpen={setIsMobileOpen}
          user={user}
        pendingCount={pendingCount}
        pendingTasksCount={pendingTasksCount}
          confirm={confirm}
          onLogout={onLogout}
        />
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-r-sidebar-border">
          <SidebarContent
            isSidebarOpen={true}
            visibleNav={visibleNav}
            isActive={isActive}
            setIsMobileOpen={setIsMobileOpen}
            user={user}
            pendingCount={pendingCount}
            pendingTasksCount={pendingTasksCount}
            confirm={confirm}
            onLogout={onLogout}
          />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0 h-[100dvh] relative">
        <header className="h-14 shrink-0 border-b border-border/80 bg-background/50 backdrop-blur-lg flex items-center px-3 md:px-6 gap-2 md:gap-3 sticky top-0 z-40 shadow-sm shadow-black/5">
          <GlobalLoadingIndicator />

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex text-muted-foreground hover:text-foreground"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="size-5" />
            ) : (
              <PanelLeftOpen className="size-5" />
            )}
          </Button>

          <div className="h-6 w-px bg-border/60 mx-1 hidden md:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="gap-2 px-1 md:px-2 hover:bg-accent/50 max-w-[160px] xs:max-w-[200px] sm:max-w-none justify-start"
              >
                <Building2 className="size-4 text-brand-orange shrink-0" />
                <span className="font-medium truncate text-sm md:text-base">
                  {company?.name ?? "—"}
                </span>
                <ChevronsUpDown className="size-4 opacity-40 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Trocar de empresa</DropdownMenuLabel>
              {companies.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => setCurrentCompanyId(c.id)}>
                  {c.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate({ to: "/app/meu-perfil" })}>
                <User className="size-4" />
                Meu perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/empresas" })}>
                <ArrowLeftRight className="size-4" />
                Gerenciar empresas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-2">
            {canSeeInviteQ.data && (
              <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                <span>Convite:</span>
                <span className="font-mono text-brand-orange font-bold select-all">
                  {inviteCodeQ.data ?? "—"}
                </span>
              </div>
            )}

            {/* Mobile simplified invite view if needed or just user profile */}
            <div className="md:hidden size-8 rounded-full bg-brand-orange/10 text-brand-orange flex items-center justify-center font-bold text-xs">
              {(user?.user_metadata?.name || user?.email || "?").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {pendingCount > 0 && pathname !== "/app/delivery" && (
          <button
            onClick={() => navigate({ to: "/app/delivery" })}
            className="shrink-0 w-full bg-brand-red text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium hover:bg-brand-red/90 transition-colors"
          >
            <Bell className="size-4 animate-pulse" />
            <span>
              {pendingCount === 1
                ? "1 pedido Delivery aguardando confirmação"
                : `${pendingCount} pedidos Delivery aguardando confirmação`}
            </span>
            <span className="underline ml-2">Ver agora</span>
          </button>
        )}

        <main className="flex-1 min-h-0 p-3 md:p-6 overflow-y-auto scrollbar-thin pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>

        {/* Bottom Navigation for Mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 z-50">
          {navItems.slice(0, 4).map((entry) => {
            if (isGroup(entry)) return null;
            // Em mobile, substituir Estoque por Produtos no menu inferior
            const item: NavLeaf =
              entry.to === "/app/estoque"
                ? { to: "/app/produtos", label: "Produtos", icon: Package }
                : entry;
            const active = isActive(item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors relative",
                  active ? "text-brand-red" : "text-muted-foreground",
                )}
              >
                <div className="relative">
                  <Icon className="size-5" />
                  {item.to === "/app/delivery" && pendingCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-2 -right-3 px-1.5 h-4 min-w-4 flex items-center justify-center text-[10px] border-2 border-card"
                    >
                      {pendingCount}
                    </Badge>
                  )}
                  {item.to === "/app/agenda" && pendingTasksCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-2 -right-3 px-1.5 h-4 min-w-4 flex items-center justify-center text-[10px] border-2 border-card bg-brand-orange hover:bg-brand-orange"
                    >
                      {pendingTasksCount}
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setIsMobileOpen(true)}
            className="flex flex-col items-center justify-center gap-1 flex-1 h-full text-muted-foreground"
          >
            <Menu className="size-5" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function NavGroupItem({
  group,
  isActive,
  collapsed,
  onItemClick,
}: {
  group: NavGroup;
  isActive: (to: string, exact?: boolean) => boolean;
  collapsed?: boolean;
  onItemClick?: () => void;
}) {
  const hasActive = group.children.some((c) => isActive(c.to));
  const [open, setOpen] = useState(hasActive);
  const Icon = group.icon;

  if (collapsed) {
    return (
      <div className="relative group py-1">
        <div
          className={[
            "flex items-center justify-center size-9 mx-auto rounded-md transition-colors",
            hasActive
              ? "bg-sidebar-accent text-brand-red"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent",
          ].join(" ")}
        >
          <Icon className="size-4" />
        </div>
        <div className="fixed left-16 bg-popover text-popover-foreground rounded-md border shadow-lg z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity min-w-[140px] overflow-hidden">
          <div className="px-3 py-2 bg-muted text-[10px] uppercase font-bold tracking-wider border-b">
            {group.label}
          </div>
          <div className="p-1">
            {group.children.map((child) => (
              <Link
                key={child.to}
                to={child.to}
                onClick={onItemClick}
                className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded-sm"
              >
                <child.icon className="size-3" />
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={open || hasActive} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={[
          "w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          hasActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        ].join(" ")}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={`size-4 transition-transform duration-200 ${open || hasActive ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-3 pl-3 border-l border-sidebar-border space-y-1">
        {group.children.map((child) => {
          const active = isActive(child.to);
          const ChildIcon = child.icon;
          return (
            <Link
              key={child.to}
              to={child.to}
              onClick={onItemClick}
              className={[
                "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-all group",
                active
                  ? "bg-brand-red/10 text-brand-red font-semibold border-l-[3px] border-brand-red shadow-[inset_1px_0_0_0_rgba(239,68,68,0.2)] shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover:translate-x-0.5",
              ].join(" ")}
            >
              <ChildIcon className="size-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:text-brand-orange" />
              <span className="truncate">{child.label}</span>
            </Link>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

function BrandingHeader({ collapsed }: { collapsed: boolean }) {
  const branding = useBranding();
  return (
    <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border h-14">
      <div className="size-9 rounded-lg bg-brand-red flex items-center justify-center shrink-0 overflow-hidden pulse-glow">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.name} className="size-full object-cover" />
        ) : (
          <Wrench className="size-5 text-brand-red-foreground" />
        )}
      </div>
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-bold leading-tight tracking-tight truncate">{branding.name}</div>
          <div className="text-[11px] uppercase tracking-wider text-brand-orange">ERP</div>
        </div>
      )}
    </div>
  );
}
