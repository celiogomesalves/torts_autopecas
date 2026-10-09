import * as React from "react";
import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent,
} from "@/components/ui/chart";
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell, Pie, PieChart,
  Line, LineChart,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { StockCount, StockCountTeam, StockCountItem, Product, StockLocation } from "@/lib/db-types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: StockCount | null;
  teams: StockCountTeam[];
  items: StockCountItem[];
  products: Product[];
  locations: StockLocation[];
}

const COLORS = [
  "#16a34a",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export function StockCountChartsDialog({ open, onOpenChange, count, teams, items, products, locations }: Props) {
  const productLocMap = useMemo(() => {
    const m = new Map<string, string | null>();
    products.forEach(p => m.set(p.id, p.location_id ?? null));
    return m;
  }, [products]);

  const locName = (id: string | null | undefined) =>
    (id && locations.find(l => l.id === id)?.name) || "Sem localização";

  const totals = useMemo(() => {
    const verified = items.filter(i => i.verified).length;
    return { total: items.length, verified, pending: items.length - verified };
  }, [items]);

  const byTeam = useMemo(() => {
    return teams.map(t => {
      const locSet = new Set(t.locations || []);
      const teamItems = items.filter(it => {
        const lid = productLocMap.get(it.product_id);
        return lid && locSet.has(lid);
      });
      const verified = teamItems.filter(i => i.verified).length;
      return {
        name: t.name,
        verificados: verified,
        pendentes: teamItems.length - verified,
        total: teamItems.length,
        pct: teamItems.length ? Math.round((verified / teamItems.length) * 100) : 0,
      };
    });
  }, [teams, items, productLocMap]);

  const byLocation = useMemo(() => {
    const map = new Map<string, { name: string; verificados: number; pendentes: number; total: number }>();
    items.forEach(it => {
      const lid = productLocMap.get(it.product_id) || "__none__";
      const name = locName(lid === "__none__" ? null : lid);
      const row = map.get(lid) || { name, verificados: 0, pendentes: 0, total: 0 };
      row.total += 1;
      if (it.verified) row.verificados += 1; else row.pendentes += 1;
      map.set(lid, row);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [items, productLocMap, locations]);

  const evolution = useMemo(() => {
    const verified = items.filter(i => i.verified && i.verified_at).sort(
      (a, b) => new Date(a.verified_at!).getTime() - new Date(b.verified_at!).getTime()
    );
    if (verified.length === 0) return [];
    const buckets = new Map<string, number>();
    verified.forEach(i => {
      const d = new Date(i.verified_at!);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    let cum = 0;
    return Array.from(buckets.entries()).map(([k, v]) => {
      cum += v;
      const [date, hour] = k.split(" ");
      const dt = new Date(date);
      const label = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")} ${hour}`;
      return { label, acumulado: cum, novos: v };
    });
  }, [items]);

  const pieData = [
    { name: "Verificados", value: totals.verified, color: "#16a34a" },
    { name: "Pendentes", value: totals.pending, color: "#dc2626" },
  ];

  const pct = totals.total ? Math.round((totals.verified / totals.total) * 100) : 0;

  const chartConfig = {
    verificados: { label: "Verificados", color: "#16a34a" },
    pendentes: { label: "Pendentes", color: "#dc2626" },
    acumulado: { label: "Acumulado", color: "#16a34a" },
    novos: { label: "Novos", color: "#f59e0b" },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-5xl max-h-[92vh] overflow-y-auto p-3 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Evolução da Contagem</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {count ? `Contagem de ${new Date(`${count.count_date}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
            {" · "}
            <span className="font-medium">{totals.verified}/{totals.total} verificados ({pct}%)</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="resumo" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
            <TabsTrigger value="resumo" className="text-xs sm:text-sm">Resumo</TabsTrigger>
            <TabsTrigger value="equipes" className="text-xs sm:text-sm">Equipes</TabsTrigger>
            <TabsTrigger value="locais" className="text-xs sm:text-sm">Localizações</TabsTrigger>
            <TabsTrigger value="evolucao" className="text-xs sm:text-sm">Evolução</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4 sm:gap-6 items-center">
              <ChartContainer config={chartConfig} className="mx-auto aspect-square w-full max-w-[260px] sm:max-w-[300px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex items-center justify-between p-2 sm:p-3 rounded border bg-muted/30">
                  <span className="text-xs sm:text-sm text-muted-foreground">Total de itens</span>
                  <span className="font-semibold text-base sm:text-lg">{totals.total}</span>
                </div>
                <div className="flex items-center justify-between p-2 sm:p-3 rounded border bg-muted/30">
                  <span className="text-xs sm:text-sm text-muted-foreground">Verificados</span>
                  <Badge className="bg-[#16a34a] hover:bg-[#16a34a]">{totals.verified}</Badge>
                </div>
                <div className="flex items-center justify-between p-2 sm:p-3 rounded border bg-muted/30">
                  <span className="text-xs sm:text-sm text-muted-foreground">Pendentes</span>
                  <Badge className="bg-[#dc2626] hover:bg-[#dc2626]">{totals.pending}</Badge>
                </div>
                <div className="flex items-center justify-between p-2 sm:p-3 rounded border bg-muted/30">
                  <span className="text-xs sm:text-sm text-muted-foreground">Equipes</span>
                  <span className="font-semibold">{teams.length}</span>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="equipes" className="mt-4">
            {byTeam.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma equipe definida.</p>
            ) : (
              <ChartContainer config={chartConfig} className="w-full h-[260px] sm:h-[350px]">
                <BarChart data={byTeam} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="verificados" stackId="a" fill="#16a34a" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="pendentes" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {byTeam.map(t => (
                <div key={t.name} className="flex items-center justify-between gap-2 p-2 rounded border text-xs sm:text-sm">
                  <span className="font-medium truncate">{t.name}</span>
                  <span className="text-muted-foreground shrink-0">{t.verificados}/{t.total} · {t.pct}%</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="locais" className="mt-4">
            {byLocation.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados de localização.</p>
            ) : (
              <ChartContainer config={chartConfig} className="w-full" style={{ height: Math.max(260, byLocation.length * 30) }}>
                <BarChart data={byLocation} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} width={90} tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 13) + "…" : v} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="verificados" stackId="a" fill="#16a34a" />
                  <Bar dataKey="pendentes" stackId="a" fill="#dc2626" />
                </BarChart>
              </ChartContainer>
            )}
          </TabsContent>

          <TabsContent value="evolucao" className="mt-4">
            {evolution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum item verificado ainda.</p>
            ) : (
              <ChartContainer config={chartConfig} className="w-full h-[260px] sm:h-[350px]">
                <LineChart data={evolution} margin={{ top: 8, right: 12, left: -16, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Line type="monotone" dataKey="acumulado" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="novos" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
