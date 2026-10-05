import { usePersistedState } from "@/hooks/use-persisted-state";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchSales,
  fetchProducts,
  fetchPartners,
  fetchMovements,
  fetchPayables,
  fetchSaleItemsWithProduct,
  fetchBrands,
  fetchActivityLogs,
} from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { brl, dt } from "@/lib/format";
import { Download, BarChart3, ShieldCheck } from "lucide-react";
import { downloadCSV, toCSV } from "@/lib/csv";
import { Badge } from "@/components/ui/badge";
import { compareProductNames } from "@/lib/utils";

export const Route = createFileRoute("/app/relatorios")({
  component: ReportsPage,
});

function ReportsPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const [activeTab, setActiveTab] = usePersistedState("relatorios:tab", "vendas");
  const getTodayBrazil = () => {
    const now = new Date();
    // Ajuste para Horário de Brasília (UTC-3)
    const brazilTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
    return brazilTime.toISOString().slice(0, 10);
  };

  const todayStr = getTodayBrazil();
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);

  const salesQ = useQuery({
    queryKey: ["sales", cid],
    queryFn: () => fetchSales(cid, 500),
    enabled: !!cid,
  });
  const productsQ = useQuery({
    queryKey: ["products", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
  });
  const partnersQ = useQuery({
    queryKey: ["partners", cid],
    queryFn: () => fetchPartners(cid),
    enabled: !!cid,
  });
  const movementsQ = useQuery({
    queryKey: ["movements", cid],
    queryFn: () => fetchMovements(cid, 500),
    enabled: !!cid,
  });
  const payablesQ = useQuery({
    queryKey: ["payables", cid],
    queryFn: () => fetchPayables(cid),
    enabled: !!cid,
  });
  const saleItemsQ = useQuery({
    queryKey: ["sale-items-detailed", cid],
    queryFn: () => fetchSaleItemsWithProduct(cid),
    enabled: !!cid,
  });
  const brandsQ = useQuery({
    queryKey: ["brands", cid],
    queryFn: () => fetchBrands(cid),
    enabled: !!cid,
  });
  const logsQ = useQuery({
    queryKey: ["activity-logs", cid],
    queryFn: () => fetchActivityLogs(cid),
    enabled: !!cid,
  });

  const sales = (salesQ.data ?? []).filter((s) => {
    if (s.status !== "concluida") return false;
    const d = s.created_at.slice(0, 10);
    return d >= from && d <= to;
  });
  const products = productsQ.data ?? [];
  const partners = partnersQ.data ?? [];
  const movements = movementsQ.data ?? [];
  const payables = payablesQ.data ?? [];
  const allSaleItems = saleItemsQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const logs = logsQ.data ?? [];

  const salesTotals = useMemo(() => {
    const totalBruto = sales.reduce((s, x) => s + Number(x.subtotal), 0);
    const totalLiquido = sales.reduce((s, x) => s + Number(x.total), 0);
    const totalDesc = sales.reduce((s, x) => s + Number(x.discount), 0);
    return { qtd: sales.length, totalBruto, totalLiquido, totalDesc };
  }, [sales]);

  const topProducts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of movements) {
      const d = m.created_at.slice(0, 10);
      if (m.type === "saida" && d >= from && d <= to) {
        map.set(m.product_id, (map.get(m.product_id) ?? 0) + Number(m.quantity));
      }
    }
    return Array.from(map.entries())
      .map(([id, qty]) => ({ id, qty, product: products.find((p) => p.id === id) }))
      .filter((x) => x.product)
      .sort((a, b) => {
        const diff = b.qty - a.qty;
        if (diff !== 0) return diff;
        return compareProductNames(a.product?.name, b.product?.name);
      });
  }, [movements, products, from, to]);

  const topClients = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sales) {
      const k = s.customer_id ?? "_cf";
      map.set(k, (map.get(k) ?? 0) + Number(s.total));
    }
    return Array.from(map.entries())
      .map(([id, total]) => ({
        id,
        total,
        name: id === "_cf" ? "Consumidor final" : (partners.find((p) => p.id === id)?.name ?? "—"),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [sales, partners]);

  const finance = useMemo(() => {
    const inPeriod = payables.filter((p) => {
      const d = (p.paid_at ?? p.due_date) as string;
      return d >= from && d <= to;
    });
    return {
      receberPago: inPeriod
        .filter((p) => p.direction === "receber" && p.status === "pago")
        .reduce((s, p) => s + Number(p.amount), 0),
      pagarPago: inPeriod
        .filter((p) => p.direction === "pagar" && p.status === "pago")
        .reduce((s, p) => s + Number(p.amount), 0),
      receberAberto: payables
        .filter((p) => p.direction === "receber" && p.status === "aberto")
        .reduce((s, p) => s + Number(p.amount), 0),
      pagarAberto: payables
        .filter((p) => p.direction === "pagar" && p.status === "aberto")
        .reduce((s, p) => s + Number(p.amount), 0),
    };
  }, [payables, from, to]);

  const profitability = useMemo(() => {
    // Apenas vendas concluídas no período
    const periodSales = sales.filter((s) => {
      // O filtro global 'sales' já remove vendas não concluídas e filtra o período,
      // mas mantemos a verificação de período aqui por clareza se necessário.
      const d = s.created_at.slice(0, 10);
      return d >= from && d <= to;
    });
    const saleIds = new Set(periodSales.map((s) => s.id));

    const itemsInPeriod = allSaleItems.filter((item) => saleIds.has(item.sale_id));

    const revenue = periodSales.reduce((sum, s) => sum + Number(s.total), 0);
    const cogs = itemsInPeriod.reduce((sum, item) => {
      const cost = Number(item.products?.cost_price ?? 0);
      return sum + cost * Number(item.quantity);
    }, 0);

    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    // Despesas operacionais (pagamentos realizados no período)
    const expenses = payables
      .filter((p) => {
        const d = (p.paid_at ?? p.due_date) as string;
        return p.direction === "pagar" && p.status === "pago" && d >= from && d <= to;
      })
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const netProfit = grossProfit - expenses;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return { revenue, cogs, grossProfit, grossMargin, expenses, netProfit, netMargin };
  }, [sales, allSaleItems, payables, from, to]);

  const exportSales = () => {
    const rows = sales.map((s) => ({
      Data: dt(s.created_at),
      Numero: s.number,
      Cliente: s.customer_id
        ? (partners.find((p) => p.id === s.customer_id)?.name ?? "—")
        : "Consumidor final",
      Pagamento: s.payment_method ?? "",
      Status: s.status,
      Subtotal: Number(s.subtotal).toFixed(2),
      Desconto: Number(s.discount).toFixed(2),
      Total: Number(s.total).toFixed(2),
    }));
    downloadCSV(`vendas-${from}-a-${to}.csv`, toCSV(rows));
  };

  const exportProducts = () => {
    const sorted = [...products].sort((a, b) => compareProductNames(a.name, b.name));
    const rows = sorted.map((p) => {
      const brandName = (
        brands.find((b) => b.id === p.brand_id)?.name ||
        p.brand ||
        ""
      ).toUpperCase();
      return {
        SKU: p.sku,
        Nome: p.name,
        Marca: brandName,
        Estoque: p.stock,
        Min: p.min_stock,
        Custo: Number(p.cost_price).toFixed(2),
        Venda: Number(p.sale_price).toFixed(2),
      };
    });
    downloadCSV(`estoque-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
  };

  const exportFinance = () => {
    const rows = payables.map((p) => ({
      Vencimento: p.due_date,
      Pago_em: p.paid_at ?? "",
      Tipo: p.direction,
      Status: p.status,
      Descricao: p.description,
      Valor: Number(p.amount).toFixed(2),
      Forma: p.payment_method ?? "",
    }));
    downloadCSV(`financeiro-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={BarChart3}
          title="Relatórios"
          subtitle="Análises por período e exportação CSV"
        />
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border h-auto flex-wrap justify-start">
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="produtos">Top produtos</TabsTrigger>
          <TabsTrigger value="clientes">Top clientes</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="estoque">Estoque</TabsTrigger>
          <TabsTrigger value="lucratividade">Lucratividade</TabsTrigger>
          <TabsTrigger value="nfe">NF-e</TabsTrigger>
          <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
          <TabsTrigger value="auditoria" className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="space-y-4 pt-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Vendas</div>
              <div className="text-xl font-bold">{salesTotals.qtd}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Bruto</div>
              <div className="text-xl font-bold">{brl(salesTotals.totalBruto)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Descontos</div>
              <div className="text-xl font-bold text-brand-red">{brl(salesTotals.totalDesc)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Líquido</div>
              <div className="text-xl font-bold text-success">{brl(salesTotals.totalLiquido)}</div>
            </Card>
          </div>
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Vendas no período</h3>
              <Button size="sm" variant="outline" onClick={exportSales}>
                <Download className="size-4 mr-2" /> CSV
              </Button>
            </div>
            <div className="hidden md:block rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Nº</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pgto</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma venda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    sales.slice(0, 50).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{dt(s.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">#{s.number}</TableCell>
                        <TableCell>
                          {s.customer_id
                            ? (partners.find((p) => p.id === s.customer_id)?.name ?? "—")
                            : "Consumidor final"}
                        </TableCell>
                        <TableCell className="capitalize text-sm">{s.payment_method}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {brl(Number(s.total))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden space-y-3">
              {sales.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma venda.</p>
              ) : (
                sales.slice(0, 50).map((s) => (
                  <Card key={s.id} className="p-3 space-y-2 border-l-4 border-l-brand-orange">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-mono text-muted-foreground">#{s.number}</div>
                        <div className="font-semibold text-sm">
                          {s.customer_id
                            ? (partners.find((p) => p.id === s.customer_id)?.name ?? "—")
                            : "Consumidor final"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{dt(s.created_at)}</div>
                      </div>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {s.payment_method}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-end border-t border-border pt-2">
                      <span className="text-[10px] text-muted-foreground">Total</span>
                      <span className="font-bold text-success text-sm">{brl(Number(s.total))}</span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="produtos" className="space-y-4 pt-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Top produtos vendidos</h3>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qtd vendida</TableHead>
                    <TableHead className="text-right">Receita estimada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Sem dados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    topProducts.slice(0, 20).map((t, i) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{t.product?.name}</TableCell>
                        <TableCell className="font-mono text-xs">{t.product?.sku}</TableCell>
                        <TableCell className="text-right font-semibold">{t.qty}</TableCell>
                        <TableCell className="text-right text-success">
                          {brl(t.qty * Number(t.product?.sale_price ?? 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-4 pt-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Top clientes por receita</h3>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        Sem dados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    topClients.map((c, i) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right font-semibold text-success">
                          {brl(c.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-4 pt-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Recebido</div>
              <div className="text-xl font-bold text-success">{brl(finance.receberPago)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">Pago</div>
              <div className="text-xl font-bold text-brand-red">{brl(finance.pagarPago)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">A receber (aberto)</div>
              <div className="text-xl font-bold">{brl(finance.receberAberto)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase">A pagar (aberto)</div>
              <div className="text-xl font-bold">{brl(finance.pagarAberto)}</div>
            </Card>
          </div>
          <div className="flex justify-between items-center mb-4">
            <Button variant="outline" onClick={exportFinance}>
              <Download className="size-4 mr-2" /> Exportar todos os lançamentos (CSV)
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Contas a Receber (Aberto)</h3>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payables
                      .filter((p) => p.direction === "receber" && p.status === "aberto")
                      .slice(0, 10)
                      .map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">{p.due_date}</TableCell>
                          <TableCell className="text-xs truncate max-w-[150px]">
                            {p.description}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold">
                            {brl(Number(p.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    {payables.filter((p) => p.direction === "receber" && p.status === "aberto")
                      .length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground py-4 text-xs"
                        >
                          Nenhuma pendência
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3">Contas a Pagar (Aberto)</h3>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payables
                      .filter((p) => p.direction === "pagar" && p.status === "aberto")
                      .slice(0, 10)
                      .map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">{p.due_date}</TableCell>
                          <TableCell className="text-xs truncate max-w-[150px]">
                            {p.description}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold text-brand-red">
                            {brl(Number(p.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    {payables.filter((p) => p.direction === "pagar" && p.status === "aberto")
                      .length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground py-4 text-xs"
                        >
                          Nenhuma pendência
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="estoque" className="space-y-4 pt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Estoque atual ({products.length} produtos)</h3>
              <Button size="sm" variant="outline" onClick={exportProducts}>
                <Download className="size-4 mr-2" /> CSV
              </Button>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-right">Mín</TableHead>
                    <TableHead className="text-right">Valor (custo)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...products]
                    .sort((a, b) => compareProductNames(a.name, b.name))
                    .slice(0, 50)
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                        <TableCell
                          className={`text-right ${Number(p.stock) <= Number(p.min_stock) ? "text-brand-red font-semibold" : ""}`}
                        >
                          {p.stock}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {p.min_stock}
                        </TableCell>
                        <TableCell className="text-right">
                          {brl(Number(p.stock) * Number(p.cost_price))}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="lucratividade" className="space-y-4 pt-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="p-5 border-l-4 border-l-success">
              <div className="text-xs text-muted-foreground uppercase mb-1">Lucro Bruto</div>
              <div className="text-2xl font-bold">{brl(profitability.grossProfit)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Margem: {profitability.grossMargin.toFixed(1)}%
              </div>
            </Card>
            <Card className="p-5 border-l-4 border-l-brand-red">
              <div className="text-xs text-muted-foreground uppercase mb-1">
                Despesas Operacionais
              </div>
              <div className="text-2xl font-bold">{brl(profitability.expenses)}</div>
              <div className="text-xs text-muted-foreground mt-1">Payables pagos no período</div>
            </Card>
            <Card className="p-5 border-l-4 border-l-brand-orange">
              <div className="text-xs text-muted-foreground uppercase mb-1">Lucro Líquido</div>
              <div className="text-2xl font-bold">{brl(profitability.netProfit)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Margem: {profitability.netMargin.toFixed(1)}%
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="font-semibold mb-4 text-lg">DRE Simplificado</h3>
            <div className="space-y-3 max-w-2xl">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">(+) Receita Operacional Líquida</span>
                <span className="font-semibold">{brl(profitability.revenue)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">
                  (-) Custo das Mercadorias Vendidas (CPV)
                </span>
                <span className="font-semibold text-brand-red">- {brl(profitability.cogs)}</span>
              </div>
              <div className="flex justify-between py-2 border-b bg-muted/30 px-2 rounded">
                <span className="font-bold">(=) Lucro Bruto</span>
                <span className="font-bold">{brl(profitability.grossProfit)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">
                  (-) Despesas Administrativas / Operacionais
                </span>
                <span className="font-semibold text-brand-red">
                  - {brl(profitability.expenses)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b bg-success/10 px-2 rounded">
                <span className="font-bold text-success">(=) Resultado Líquido (EBIT)</span>
                <span className="font-bold text-success">{brl(profitability.netProfit)}</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="auditoria" className="space-y-4 pt-4">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Logs de Atividade</h3>
              <p className="text-xs text-muted-foreground">Últimas 100 alterações do sistema</p>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhum log encontrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">{dt(log.created_at)}</TableCell>
                        <TableCell className="text-xs">
                          {log.profiles?.name || log.profiles?.email || "Sistema"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.action === "DELETE"
                                ? "destructive"
                                : log.action === "INSERT"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="text-[10px] uppercase"
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{log.entity}</TableCell>
                        <TableCell className="text-xs max-w-[300px] truncate">
                          {JSON.stringify(log.meta)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
