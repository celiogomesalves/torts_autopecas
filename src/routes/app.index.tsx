import { PageHeading } from "@/components/page-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchProducts, fetchMovements, fetchPayables } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { initScrollReveal } from "@/lib/scroll-reveal";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  AlertTriangle,
  DollarSign,
  Boxes,
  ArrowUpRight,
  TrendingUp,
  Calendar,
  Wallet,
  Trophy,
  Check,
  Eye,
  EyeOff,
  ShoppingCart,
  Plus,
  LayoutDashboard,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { fetchUserTasks } from "@/lib/db";

function CardSkeleton() {
  return (
    <Card className="p-4 sm:p-5 bg-glass border border-white/5 shadow-lg relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-full pointer-events-none opacity-50" />
      <div className="flex items-start justify-between relative z-10">
        <div className="space-y-2.5 w-full">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Skeleton className="size-10 rounded-xl shrink-0" />
      </div>
    </Card>
  );
}

function CardSkeletonMobile() {
  return (
    <Card className="p-4 h-full bg-glass border border-white/5 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 w-full">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="size-9 rounded-lg shrink-0" />
      </div>
    </Card>
  );
}

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function Dashboard() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const { user } = useAuth();

  const VALUES_KEY = `ap.showValues.${cid}`;
  const [showValues, setShowValues] = useState<boolean>(false);

  const permQ = useQuery({
    queryKey: ["perm", "dashboard_valores", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_permission", {
        _company: cid,
        _module: "dashboard_valores",
        _action: "view",
      });
      if (error) return false;
      return !!data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutos
  });
  const canSeeValues = !!permQ.data;

  const productsQ = useQuery({
    queryKey: ["products", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
    staleTime: 30 * 1000, // 30 segundos
  });
  const movementsQ = useQuery({
    queryKey: ["movements", cid],
    queryFn: () => fetchMovements(cid, 8),
    enabled: !!cid,
    staleTime: 30 * 1000, // 30 segundos
  });

  // Início do mês corrente (ISO) para filtros server-side
  const monthStartISO = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }, []);

  // Vendas do mês (sem limite arbitrário) — para totais financeiros precisos
  const monthSalesQ = useQuery({
    queryKey: ["sales-month", cid, monthStartISO],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, created_at, status")
        .eq("company_id", cid)
        .eq("status", "concluida")
        .gte("created_at", monthStartISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000, // 30 segundos
  });

  // Itens de venda do mês — para lucro real e top produtos
  const monthSaleItemsQ = useQuery({
    queryKey: ["sale-items-month", cid, monthStartISO],
    enabled: !!cid && (monthSalesQ.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (monthSalesQ.data ?? []).map((s: any) => s.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, quantity, unit_price, sale_id")
        .in("sale_id", ids);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30 * 1000, // 30 segundos
  });




  // Início/fim do dia (BRT) — para buscar TODAS as vendas concluídas de hoje
  const { todayStartISO, todayEndISO } = useMemo(() => {
    const now = new Date();
    const y = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const start = new Date(`${y}T00:00:00-03:00`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { todayStartISO: start.toISOString(), todayEndISO: end.toISOString() };
  }, []);

  const todaySalesQ = useQuery({
    queryKey: ["sales-today", cid, todayStartISO],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, created_at, status, customer_id, created_by")
        .eq("company_id", cid)
        .eq("status", "concluida")
        .gte("created_at", todayStartISO)
        .lt("created_at", todayEndISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const userIds = Array.from(new Set(rows.map((s: any) => s.created_by).filter(Boolean)));
      let profMap = new Map<string, any>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", userIds as string[]);
        profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      }
      return rows.map((s: any) => ({
        ...s,
        profiles: s.created_by ? profMap.get(s.created_by) ?? null : null,
      }));
    },
    staleTime: 30 * 1000,
  });

  const upcomingTasksQ = useQuery({
    queryKey: ["upcoming-tasks", cid, user?.id],
    queryFn: () => fetchUserTasks(cid, user?.id!, { status: "pending", start: new Date().toISOString() }),
    enabled: !!cid && !!user?.id,
    staleTime: 60 * 1000,
  });

  const [todayPage, setTodayPage] = useState(1);
  const TODAY_PAGE_SIZE = 10;
  const payablesQ = useQuery({
    queryKey: ["payables", cid],
    queryFn: () => fetchPayables(cid),
    enabled: !!cid,
    staleTime: 30 * 1000, // 30 segundos
  });

  const products = productsQ.data ?? [];
  const movements = movementsQ.data ?? [];
  const brDateKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  const todayBrKey = brDateKey(new Date());
  const sales = todaySalesQ.data ?? [];
  const monthSales = monthSalesQ.data ?? [];
  const monthItems = monthSaleItemsQ.data ?? [];
  const payables = payablesQ.data ?? [];

  const isLoadingCards =
    permQ.isLoading ||
    productsQ.isLoading ||
    monthSalesQ.isLoading ||
    monthSaleItemsQ.isLoading ||
    upcomingTasksQ.isLoading ||
    payablesQ.isLoading;

  // Reinicializa o scroll-reveal após o carregamento dos dados, pois os elementos
  // com .animate-on-scroll só entram no DOM depois que o estado de loading muda.
  useEffect(() => {
    if (isLoadingCards) return;
    const t = setTimeout(() => initScrollReveal(), 50);
    return () => clearTimeout(t);
  }, [isLoadingCards]);

  const mask = (v: string | number) => (showValues && canSeeValues ? v : "••••••");
  void movements;

  const today = new Date();

  // Mapa de produtos por id (para custo/preço rápido)
  const productById = useMemo(() => {
    const m = new Map<string, (typeof products)[number]>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const stats = useMemo(() => {
    const sToday = monthSales.filter((s: any) => brDateKey(new Date(s.created_at)) === todayBrKey);
    const totalToday = sToday.reduce((acc: number, s: any) => acc + Number(s.total), 0);
    const totalMonth = monthSales.reduce((acc: number, s: any) => acc + Number(s.total), 0);

    // Lucro real do mês: soma (unit_price - cost_price) * quantity por item
    let profitMonth = 0;
    for (const it of monthItems) {
      const p = productById.get(it.product_id);
      const cost = Number(p?.cost_price ?? 0);
      const price = Number(it.unit_price);
      const qty = Number(it.quantity);
      // Se não houver custo cadastrado, ignora a margem desse item (evita inflar)
      if (cost > 0) profitMonth += (price - cost) * qty;
    }

    const receberAberto = payables
      .filter((p) => p.direction === "receber" && p.status === "aberto")
      .reduce((s, p) => s + Number(p.amount), 0);
    const pagarAberto = payables
      .filter((p) => p.direction === "pagar" && p.status === "aberto")
      .reduce((s, p) => s + Number(p.amount), 0);
    const receberPago = payables
      .filter((p) => p.direction === "receber" && p.status === "pago")
      .reduce((s, p) => s + Number(p.amount), 0);

    return {
      totalToday,
      totalMonth,
      profitMonth,
      receberAberto,
      pagarAberto,
      receberPago,
      vendasMes: monthSales.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthSales, monthItems, payables, productById]);

  const low = products.filter((p) => {
    const stk = Number(p.stock);
    const min = Number(p.min_stock);
    return stk <= min;
  });
  const totalUnits = products.reduce((s, p) => s + Number(p.stock), 0);
  // Valor em estoque a custo (apenas cost_price real, sem fallback)
  const totalValueCost = products.reduce(
    (s, p) => s + Number(p.stock) * Number(p.cost_price ?? 0),
    0,
  );
  // Valor em estoque a preço de venda
  const totalValueSale = products.reduce((s, p) => s + Number(p.stock) * Number(p.sale_price), 0);

  // Top produtos do mês — baseado em sale_items reais
  const topProducts = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of monthItems) {
      map.set(it.product_id, (map.get(it.product_id) ?? 0) + Number(it.quantity));
    }
    return Array.from(map.entries())
      .map(([id, qty]) => ({ id, qty, product: productById.get(id) }))
      .filter((x) => x.product)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [monthItems, productById]);
  void movements;

  const cards: Array<{
    label: string;
    value: string | number;
    sub?: string;
    icon: typeof TrendingUp;
    color: string;
    bg: string;
    sensitive?: boolean;
    href?: string;
    isLowStock?: boolean;
  }> = [
    {
      label: "Vendas hoje",
      value: mask(brl(stats.totalToday)),
      icon: TrendingUp,
      color: "text-success",
      bg: "bg-success/10",
      sensitive: true,
    },
    {
      label: "Vendas no mês",
      value: mask(brl(stats.totalMonth)),
      sub: `${stats.vendasMes} vendas`,
      icon: Calendar,
      color: "text-brand-orange",
      bg: "bg-brand-orange/10",
      sensitive: true,
    },
    {
      label: "Lucro estimado mês",
      value: mask(brl(stats.profitMonth)),
      icon: DollarSign,
      color: "text-success",
      bg: "bg-success/10",
      sensitive: true,
    },
    {
      label: "Recebido",
      value: mask(brl(stats.receberPago)),
      icon: Check,
      color: "text-success",
      bg: "bg-success/10",
      sensitive: true,
    },
    {
      label: "A receber",
      value: mask(brl(stats.receberAberto)),
      icon: ArrowUpRight,
      color: "text-success",
      bg: "bg-success/10",
      sensitive: true,
    },
    {
      label: "A pagar",
      value: mask(brl(stats.pagarAberto)),
      icon: Wallet,
      color: "text-brand-red",
      bg: "bg-brand-red/10",
      sensitive: true,
    },
    {
      label: "Estoque a custo",
      value: mask(brl(totalValueCost)),
      sub: `${totalUnits} un.`,
      icon: Boxes,
      color: "text-foreground",
      bg: "bg-muted",
      sensitive: true,
    },
    {
      label: "Estoque a venda",
      value: mask(brl(totalValueSale)),
      sub: `${totalUnits} un.`,
      icon: Boxes,
      color: "text-success",
      bg: "bg-success/10",
      sensitive: true,
    },
    {
      label: "Produtos",
      value: products.length,
      icon: Package,
      color: "text-foreground",
      bg: "bg-muted",
    },
    {
      label: "Alertas estoque",
      value: low.length,
      icon: AlertTriangle,
      color: "text-brand-red",
      bg: "bg-brand-red/10",
      href: "/app/estoque",
      isLowStock: true,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeading
          icon={LayoutDashboard}
          title="Página Inicial"
          subtitle="Visão geral de vendas, financeiro e estoque"
          gradientTitle="accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          {canSeeValues && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowValues((v) => !v)}
              title={showValues ? "Ocultar valores" : "Mostrar valores"}
            >
              {showValues ? (
                <>
                  <EyeOff className="size-4 sm:mr-2" />
                  <span className="hidden sm:inline">Ocultar valores</span>
                </>
              ) : (
                <>
                  <Eye className="size-4 sm:mr-2" />
                  <span className="hidden sm:inline">Mostrar valores</span>
                </>
              )}
            </Button>
          )}
          <Button size="sm" asChild className="hidden sm:inline-flex">
            <Link to="/app/vendas">
              <Plus className="size-4 mr-2" />
              Nova Venda
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick access mobile */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <Button asChild className="h-12">
          <Link to="/app/vendas">
            <ShoppingCart className="size-4 mr-2" /> Nova Venda
          </Link>
        </Button>
      </div>

      <div className="hidden lg:grid gap-4 lg:grid-cols-4 animate-on-scroll">
        {isLoadingCards
          ? Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)
          : cards.map((s) => {
              const Icon = s.icon;
              const glowClass = s.color.includes("text-success")
                ? "glow-card-success"
                : s.color.includes("text-brand-orange")
                  ? "glow-card-orange"
                  : s.color.includes("text-brand-red")
                    ? "glow-card-red"
                    : "glow-card-muted";

              const content = (
                <Card
                  key={s.label}
                  className={cn(
                    "p-5 bg-glass border border-white/5 shadow-lg relative overflow-hidden group transition-all duration-300",
                    glowClass,
                    s.href && "cursor-pointer",
                  )}
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-full pointer-events-none transition-opacity opacity-50 group-hover:opacity-100" />
                  <div className="flex items-start justify-between relative z-10">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                        {s.label}
                      </div>
                      <div className={`mt-2.5 text-2xl font-black tracking-tight ${s.color}`}>
                        {s.value}
                      </div>
                      {s.sub && (
                        <div className="text-[11px] text-muted-foreground/80 mt-1.5 font-medium bg-white/5 px-2 py-0.5 rounded-full inline-block">
                          {s.sub}
                        </div>
                      )}
                    </div>
                    <div
                      className={cn(
                        "size-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110",
                        s.bg,
                      )}
                    >
                      <Icon className={`size-5 ${s.color}`} />
                    </div>
                  </div>
                </Card>
              );

              if (s.href) {
                return (
                  <Link
                    key={s.label}
                    to={s.href as any}
                    search={s.isLowStock ? ({ filter: "baixo" } as any) : undefined}
                  >
                    {content}
                  </Link>
                );
              }

              return content;
            })}
      </div>

      <div className="lg:hidden">
        <Carousel className="w-full">
          <CarouselContent className="-ml-2">
            {isLoadingCards
              ? Array.from({ length: 10 }).map((_, i) => (
                  <CarouselItem key={i} className="pl-2 basis-[80%] sm:basis-1/2 md:basis-1/3">
                    <CardSkeletonMobile />
                  </CarouselItem>
                ))
              : cards.map((s) => {
                  const Icon = s.icon;
                  const glowClass = s.color.includes("text-success")
                    ? "glow-card-success"
                    : s.color.includes("text-brand-orange")
                      ? "glow-card-orange"
                      : s.color.includes("text-brand-red")
                        ? "glow-card-red"
                        : "glow-card-muted";

                  const content = (
                    <Card
                      className={cn(
                        "p-4 h-full bg-glass border border-white/5 relative overflow-hidden",
                        glowClass,
                        s.href && "cursor-pointer",
                      )}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                            {s.label}
                          </div>
                          <div className={`mt-1.5 text-lg font-black tracking-tight ${s.color}`}>
                            {s.value}
                          </div>
                          {s.sub && (
                            <div className="text-[9px] text-muted-foreground/80 mt-1 bg-white/5 px-1.5 py-0.2 rounded-full inline-block">
                              {s.sub}
                            </div>
                          )}
                        </div>
                        <div className={cn("size-9 rounded-lg flex items-center justify-center", s.bg)}>
                          <Icon className={`size-4 ${s.color}`} />
                        </div>
                      </div>
                    </Card>
                  );

                  return (
                    <CarouselItem key={s.label} className="pl-2 basis-[80%] sm:basis-1/2 md:basis-1/3">
                      {s.href ? (
                        <Link
                          to={s.href as any}
                          search={s.isLowStock ? ({ filter: "baixo" } as any) : undefined}
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </CarouselItem>
                  );
                })}
          </CarouselContent>
        </Carousel>
      </div>

      {/* Tarefas sempre no topo, em qualquer modo */}
      <div className="animate-on-scroll">
        <TasksWidget isLoading={upcomingTasksQ.isLoading} tasks={upcomingTasksQ.data} />
      </div>


      <div className="grid gap-4 lg:grid-cols-3 animate-on-scroll delay-2">
        <Card className="p-4 sm:p-5 lg:col-span-2 bg-glass border border-white/5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <ShoppingCart className="size-4 text-brand-red" /> Vendas concluídas hoje
            </h3>
            <Link to="/app/vendas" className="text-xs text-brand-orange hover:underline">
              Ver histórico detalhado
            </Link>
          </div>

          {todaySalesQ.isLoading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : sales.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Nenhuma venda registrada hoje.
            </p>
          ) : (
            (() => {
              const totalPages = Math.max(1, Math.ceil(sales.length / TODAY_PAGE_SIZE));
              const page = Math.min(todayPage, totalPages);
              const startIdx = (page - 1) * TODAY_PAGE_SIZE;
              const pageItems = sales.slice(startIdx, startIdx + TODAY_PAGE_SIZE);
              return (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5 text-muted-foreground text-[10px] uppercase tracking-wider">
                          <th className="text-left pb-2.5 font-bold">Data</th>
                          <th className="text-left pb-2.5 font-bold">Cliente</th>
                          <th className="text-left pb-2.5 font-bold">Vendedor</th>
                          <th className="text-right pb-2.5 font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {pageItems.map((s) => (
                          <tr
                            key={s.id}
                            className="group hover:bg-white/[0.02] transition-colors duration-200"
                          >
                            <td className="py-3.5 text-muted-foreground transition-colors group-hover:text-foreground">
                              {new Date(s.created_at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="py-3.5 font-semibold text-foreground">
                              {s.customer_id ? "Cliente" : "Consumidor final"}
                            </td>
                            <td className="py-3.5 text-muted-foreground transition-colors group-hover:text-foreground">
                              {s.profiles?.name || "—"}
                            </td>
                            <td className="py-3.5 text-right font-black text-success">
                              {brl(Number(s.total))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-3">
                    {pageItems.map((s) => (
                      <div
                        key={s.id}
                        className="flex justify-between items-center border-b border-white/5 pb-2.5 last:border-0 last:pb-0"
                      >
                        <div>
                          <div className="text-xs font-semibold text-foreground">
                            {s.customer_id ? "Cliente" : "Consumidor final"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(s.created_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-success">
                            {brl(Number(s.total))}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {s.profiles?.name || "—"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-4 mt-3 border-t border-white/5 text-xs">
                    <span className="text-muted-foreground">
                      {sales.length} {sales.length === 1 ? "venda" : "vendas"} hoje · página {page} de {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setTodayPage((p) => Math.max(1, p - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setTodayPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()
          )}
        </Card>


        <div className="space-y-4">
          <Card className="p-4 sm:p-5 bg-glass border border-white/5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Trophy className="size-4 text-brand-orange" /> Top produtos
              </h3>
              <Link to="/app/relatorios" className="text-xs text-brand-orange hover:underline">
                Relatórios
              </Link>
            </div>
            {monthSaleItemsQ.isLoading || productsQ.isLoading ? (
              <ul className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Skeleton className="size-5 rounded-full" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                    <Skeleton className="h-4 w-12 rounded-full" />
                  </li>
                ))}
              </ul>
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Sem vendas suficientes.
              </p>
            ) : (
              <ul className="space-y-3">
                {topProducts.map((t, idx) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-white/5 border border-white/5 transition-transform duration-200 hover:translate-x-1"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-bold text-brand-orange bg-brand-orange/10 size-5 rounded-full flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-sm truncate font-medium text-foreground">
                        {t.product?.name}
                      </span>
                    </div>
                    <span className="text-xs font-semibold bg-success/10 text-success px-2 py-0.5 rounded-full whitespace-nowrap">
                      {t.qty} un.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4 sm:p-5 bg-glass border border-white/5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="size-4 text-brand-red" /> Estoque baixo
              </h3>
              <Link
                to="/app/estoque"
                search={{ filter: "baixo" }}
                className="text-xs text-brand-orange hover:underline"
              >
                Ver estoque
              </Link>
            </div>
            {productsQ.isLoading ? (
              <ul className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="space-y-2 p-2 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2.5 w-16" />
                      </div>
                      <Skeleton className="h-3 w-12" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </li>
                ))}
              </ul>
            ) : low.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Tudo em ordem 🎉</p>
            ) : (
              <ul className="space-y-3">
                {low.slice(0, 3).map((p) => {
                  const stock = Number(p.stock);
                  const min = Number(p.min_stock);
                  const ratio = min > 0 ? Math.min(100, Math.max(0, (stock / min) * 100)) : 0;
                  return (
                    <li
                      key={p.id}
                      className="space-y-2 p-2 rounded-lg bg-white/5 border border-white/5 transition-transform duration-200 hover:translate-x-1"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate text-foreground">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">SKU {p.sku}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold text-brand-red">
                            {p.stock} {p.unit}
                          </div>
                          <div className="text-[10px] text-muted-foreground">mín {p.min_stock}</div>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-red transition-all duration-500"
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

      </div>
    </div>
  );
}

function TasksWidget({ 
  isLoading, 
  tasks 
}: { 
  isLoading: boolean; 
  tasks: any[] | undefined 
}) {
  const [filter, setFilter] = useState<"today" | "overdue" | "all">("today");

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return tasks.filter(task => {
      const taskDate = new Date(task.due_at);
      const taskDateStr = task.due_at.split('T')[0];

      if (filter === "today") return taskDateStr === todayStr;
      if (filter === "overdue") return taskDate < now && task.status === "pending";
      return true;
    });
  }, [tasks, filter]);

  return (
    <Card className="p-4 sm:p-5 bg-glass border border-white/5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
          <Calendar className="size-4 text-brand-orange" /> Próximas Tarefas
        </h3>
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg">
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn("h-7 px-2.5 text-[10px] uppercase font-bold tracking-wider", filter === "today" ? "bg-brand-orange text-white hover:bg-brand-orange hover:text-white" : "text-muted-foreground")}
            onClick={() => setFilter("today")}
          >
            Hoje
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn("h-7 px-2.5 text-[10px] uppercase font-bold tracking-wider", filter === "overdue" ? "bg-brand-red text-white hover:bg-brand-red hover:text-white" : "text-muted-foreground")}
            onClick={() => setFilter("overdue")}
          >
            Atrasadas
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn("h-7 px-2.5 text-[10px] uppercase font-bold tracking-wider", filter === "all" ? "bg-muted text-foreground hover:bg-muted" : "text-muted-foreground")}
            onClick={() => setFilter("all")}
          >
            Todas
          </Button>
        </div>
      </div>
      {isLoading ? (
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3 flex-1" />
            </li>
          ))}
        </ul>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <CheckCircle2 className="size-8 text-success/20 mb-2" />
          <p className="text-xs text-muted-foreground font-medium">Nenhuma tarefa pendente</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredTasks.slice(0, 5).map((task) => {
            const isOverdue = new Date(task.due_at) < new Date();
            return (
              <li
                key={task.id}
                title={task.title + (task.description ? ` - ${task.description}` : "")}
                className={cn(
                  "group flex items-start gap-3 p-2 rounded-lg transition-all duration-200 hover:bg-white/5 border border-transparent hover:border-white/5",
                  isOverdue && "bg-brand-red/5 border-brand-red/10"
                )}
              >
                <div className={cn(
                  "mt-0.5 size-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  isOverdue ? "border-brand-red text-brand-red" : "border-brand-orange text-brand-orange"
                )}>
                  <Clock3 className="size-2.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn(
                    "text-sm font-medium truncate",
                    isOverdue ? "text-brand-red" : "text-foreground"
                  )}>
                    {task.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    {new Date(task.due_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 pt-3 border-t border-white/5 flex justify-center">
        <Link to="/app/agenda" className="text-xs text-brand-orange hover:underline flex items-center gap-1.5">
          Ver agenda completa <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </Card>
  );
}
