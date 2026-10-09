import { usePersistedState } from "@/hooks/use-persisted-state";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSales,
  fetchProducts,
  fetchPartners,
  fetchMovements,
  fetchPayables,
  fetchSaleItemsWithProduct,
  fetchBrands,
  fetchActivityLogs,
  fetchFiscalNotes,
  fetchBankTransactions,
  fetchCompany,
  fetchPaymentMethods,
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
import { Download, BarChart3, ShieldCheck, ArrowUp, ArrowDown, ArrowUpDown, Printer, ChevronLeft, ChevronRight, FileCheck2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadCSV, toCSV } from "@/lib/csv";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { compareProductNames } from "@/lib/utils";
import { AccountingSettings } from "@/components/accounting-settings";


import type { FiscalNote } from "@/lib/db-types";

function FiscalNotePopover({ note, size = "sm" }: { note: FiscalNote; size?: "sm" | "xs" }) {
  const cls = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
  const typeLabel = note.type === "NFC-e" ? "NFC-e" : "NF-e";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          aria-label={`${typeLabel} autorizada`}
          title={`${typeLabel} autorizada`}
        >
          <FileCheck2 className={`${cls} text-emerald-600`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs" align="start">
        <div className="font-semibold text-sm mb-2 flex items-center gap-1.5">
          <FileCheck2 className="h-4 w-4 text-emerald-600" />
          {typeLabel} autorizada
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Número</span>
            <span className="font-mono">{note.numero}/{note.serie}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Emitida em</span>
            <span>{dt(note.emitted_at)}</span>
          </div>
          {note.chave && (
            <div className="pt-1">
              <div className="text-muted-foreground mb-0.5">Chave</div>
              <div className="font-mono text-[10px] break-all">{note.chave}</div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

  const companyQ = useQuery({
    queryKey: ["company", cid],
    queryFn: () => fetchCompany(cid),
    enabled: !!cid,
    staleTime: 60 * 60 * 1000,
  });
  const company = companyQ.data;
  const companyHeaderHtml = () => {
    const name = company?.name ?? "";
    const cnpj = company?.cnpj ? ` · CNPJ: ${company.cnpj}` : "";
    return `<div class="company">${name}${cnpj}</div>`;
  };
  const fmtBrDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const periodLabel = () =>
    from === to ? `Data: ${fmtBrDate(from)}` : `Período: ${fmtBrDate(from)} a ${fmtBrDate(to)}`;

  const salesQ = useQuery({
    queryKey: ["sales", cid, from, to],
    queryFn: () => fetchSales(cid, 5000, { from, to }),
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
  const fiscalNotesQ = useQuery({
    queryKey: ["fiscal-notes", cid],
    queryFn: () => fetchFiscalNotes(cid),
    enabled: !!cid,
  });
  const bankTxQ = useQuery({
    queryKey: ["bank-transactions", cid],
    queryFn: () => fetchBankTransactions(cid),
    enabled: !!cid,
  });
  const paymentMethodsQ = useQuery({
    queryKey: ["payment_methods", cid],
    queryFn: () => fetchPaymentMethods(cid),
    enabled: !!cid,
  });

  const qc = useQueryClient();
  useEffect(() => {
    if (!cid) return;
    const tables = [
      "stock_movements",
      "sales",
      "sale_items",
      "products",
      "payables",
      "partners",
      "brands",
      "activity_logs",
      "fiscal_notes",
      "bank_transactions",
    ];
    const channel = supabase.channel(`relatorios-sync-${cid}`);
    for (const t of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: t, filter: `company_id=eq.${cid}` },
        () => {
          qc.invalidateQueries({ queryKey: ["sales", cid] });
          qc.invalidateQueries({ queryKey: ["products", cid] });
          qc.invalidateQueries({ queryKey: ["partners", cid] });
          qc.invalidateQueries({ queryKey: ["movements", cid] });
          qc.invalidateQueries({ queryKey: ["payables", cid] });
          qc.invalidateQueries({ queryKey: ["sale-items-detailed", cid] });
          qc.invalidateQueries({ queryKey: ["brands", cid] });
          qc.invalidateQueries({ queryKey: ["activity-logs", cid] });
          qc.invalidateQueries({ queryKey: ["fiscal-notes", cid] });
          qc.invalidateQueries({ queryKey: ["bank-transactions", cid] });
        },
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cid, qc]);

  const sales = (salesQ.data ?? []).filter((s) => {
    if (s.status !== "concluida") return false;
    const d = s.created_at.slice(0, 10);
    return d >= from && d <= to;
  });
  const cancelledSalesInPeriod = useMemo(
    () =>
      (salesQ.data ?? []).filter((s) => {
        if (s.status !== "cancelada") return false;
        const d = s.created_at.slice(0, 10);
        return d >= from && d <= to;
      }),
    [salesQ.data, from, to],
  );
  const cancelledSummary = useMemo(
    () => ({
      count: cancelledSalesInPeriod.length,
      total: cancelledSalesInPeriod.reduce((a, s) => a + Number(s.total || 0), 0),
    }),
    [cancelledSalesInPeriod],
  );
  const products = productsQ.data ?? [];
  const partners = partnersQ.data ?? [];
  const movements = movementsQ.data ?? []; void movements;
  const payables = payablesQ.data ?? [];
  const allSaleItems = saleItemsQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const logs = logsQ.data ?? [];
  const fiscalNotes = fiscalNotesQ.data ?? [];
  const bankTx = bankTxQ.data ?? [];

  // ------- Filtros e ordenação da aba Vendas -------
  type SalesSortKey = "date" | "number" | "customer" | "payment" | "total";
  const [salesSortKey, setSalesSortKey] = useState<SalesSortKey>("date");
  const [salesSortDir, setSalesSortDir] = useState<"asc" | "desc">("desc");
  const [salesFilterCustomer, setSalesFilterCustomer] = useState("");
  const [salesFilterPayments, setSalesFilterPayments] = useState<string[]>([]);
  const [salesFilterMin, setSalesFilterMin] = useState("");
  const [salesFilterMax, setSalesFilterMax] = useState("");
  const [salesFilterFiscalOnly, setSalesFilterFiscalOnly] = useState(false);
  

  const paymentMethodsAll = paymentMethodsQ.data ?? [];
  const paymentMethodsInSales = useMemo(() => {
    const set = new Set<string>();
    for (const pm of paymentMethodsAll) if (pm.active !== false && pm.name) set.add(pm.name);
    for (const s of sales) if (s.payment_method) set.add(s.payment_method);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sales, paymentMethodsAll]);

  const fiscalNoteBySaleId = useMemo(() => {
    const map = new Map<string, typeof fiscalNotes[number]>();
    for (const n of fiscalNotes) {
      if (n.sale_id && n.status === "autorizada" && !map.has(n.sale_id)) map.set(n.sale_id, n);
    }
    return map;
  }, [fiscalNotes]);
  const salesWithFiscal = useMemo(() => new Set(fiscalNoteBySaleId.keys()), [fiscalNoteBySaleId]);

  const filteredSales = useMemo(() => {
    const q = salesFilterCustomer.trim().toLowerCase();
    const min = salesFilterMin === "" ? -Infinity : Number(salesFilterMin);
    const max = salesFilterMax === "" ? Infinity : Number(salesFilterMax);
    const list = sales.filter((s) => {
      const custName = s.customer_id
        ? (partners.find((p) => p.id === s.customer_id)?.name ?? "")
        : "Consumidor final";
      if (q && !custName.toLowerCase().includes(q) && !String(s.number).includes(q)) return false;
      if (salesFilterPayments.length > 0 && !salesFilterPayments.includes(s.payment_method ?? "")) return false;
      const total = Number(s.total);
      if (total < min || total > max) return false;
      if (salesFilterFiscalOnly && !salesWithFiscal.has(s.id)) return false;
      return true;
    });
    const dir = salesSortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const custA = a.customer_id
        ? (partners.find((p) => p.id === a.customer_id)?.name ?? "")
        : "Consumidor final";
      const custB = b.customer_id
        ? (partners.find((p) => p.id === b.customer_id)?.name ?? "")
        : "Consumidor final";
      let cmp = 0;
      switch (salesSortKey) {
        case "date":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
        case "number":
          cmp = Number(a.number) - Number(b.number);
          break;
        case "customer":
          cmp = custA.localeCompare(custB, "pt-BR");
          break;
        case "payment":
          cmp = (a.payment_method ?? "").localeCompare(b.payment_method ?? "", "pt-BR");
          break;
        case "total":
          cmp = Number(a.total) - Number(b.total);
          break;
      }
      return cmp * dir;
    });
  }, [
    sales,
    partners,
    salesFilterCustomer,
    salesFilterPayments,
    salesFilterMin,
    salesFilterMax,
    salesFilterFiscalOnly,
    salesWithFiscal,
    salesSortKey,
    salesSortDir,
  ]);

  const toggleSalesSort = (key: SalesSortKey) => {
    if (salesSortKey === key) {
      setSalesSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSalesSortKey(key);
      setSalesSortDir(key === "date" || key === "total" ? "desc" : "asc");
    }
  };
  const SortIcon = ({ k }: { k: SalesSortKey }) => {
    if (salesSortKey !== k) return <ArrowUpDown className="size-3 opacity-40 inline ml-1" />;
    return salesSortDir === "asc" ? (
      <ArrowUp className="size-3 inline ml-1" />
    ) : (
      <ArrowDown className="size-3 inline ml-1" />
    );
  };

  const salesTotals = useMemo(() => {
    const totalBruto = filteredSales.reduce((s, x) => s + Number(x.subtotal), 0);
    const totalLiquido = filteredSales.reduce((s, x) => s + Number(x.total), 0);
    const totalDesc = filteredSales.reduce((s, x) => s + Number(x.discount), 0);
    return { qtd: filteredSales.length, totalBruto, totalLiquido, totalDesc };
  }, [filteredSales]);

  // Paginação da aba Vendas
  const [salesPage, setSalesPage] = useState(1);
  const salesPageSize = 25;
  const salesTotalPages = Math.max(1, Math.ceil(filteredSales.length / salesPageSize));
  useEffect(() => {
    setSalesPage(1);
  }, [salesFilterCustomer, salesFilterPayments, salesFilterMin, salesFilterMax, salesFilterFiscalOnly, from, to]);
  useEffect(() => {
    if (salesPage > salesTotalPages) setSalesPage(salesTotalPages);
  }, [salesPage, salesTotalPages]);
  const pagedSales = useMemo(
    () => filteredSales.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize),
    [filteredSales, salesPage],
  );

  const printSales = () => {
    const rows = filteredSales
      .map((s) => {
        const cust = s.customer_id
          ? (partners.find((p) => p.id === s.customer_id)?.name ?? "—")
          : "Consumidor final";
        return `<tr>
          <td>${dt(s.created_at)}</td>
          <td>#${s.number}</td>
          <td>${cust}</td>
          <td style="text-transform:capitalize">${s.payment_method ?? ""}</td>
          <td style="text-align:right">${brl(Number(s.total))}</td>
        </tr>`;
      })
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>${company?.name ?? ""} - Relatório Analítico de Vendas - ${periodLabel()}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;padding:16px;color:#111}
        .company{font-size:14px;font-weight:bold;margin-bottom:2px}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:11px;color:#555;margin-bottom:12px}
        .foot{font-size:10px;color:#666;margin-top:14px;text-align:right}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f3f4f6}
        tfoot td{font-weight:bold;background:#f9fafb}
        @media print{@page{size:A4;margin:10mm}}
      </style></head><body>
      ${companyHeaderHtml()}
      <h1>Relatório Analítico de Vendas</h1>
      <div class="meta">${periodLabel()} · ${salesTotals.qtd} venda(s) · Total líquido: ${brl(salesTotals.totalLiquido)}</div>
      <table>
        <thead><tr><th>Data</th><th>Nº</th><th>Cliente</th><th>Pgto</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right">Total líquido</td><td style="text-align:right">${brl(salesTotals.totalLiquido)}</td></tr></tfoot>
      </table>
      <div class="foot">Emitido em ${new Date().toLocaleString("pt-BR")}</div>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const printPaymentTotals = () => {
    const totals = new Map<string, { qtd: number; total: number }>();
    for (const s of filteredSales) {
      const pm = s.payment_method ?? "—";
      const cur = totals.get(pm) ?? { qtd: 0, total: 0 };
      cur.qtd += 1;
      cur.total += Number(s.total ?? 0);
      totals.set(pm, cur);
    }
    const rows = Array.from(totals.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(
        ([pm, v]) => `<tr>
          <td style="text-transform:capitalize">${pm}</td>
          <td style="text-align:right">${v.qtd}</td>
          <td style="text-align:right">${brl(v.total)}</td>
        </tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
      <title>${company?.name ?? ""} - Resumo de Vendas por Forma de Pagamento - ${periodLabel()}</title>
      <style>
        body{font-family:system-ui,Arial,sans-serif;padding:16px;color:#111}
        .company{font-size:14px;font-weight:bold;margin-bottom:2px}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:11px;color:#555;margin-bottom:12px}
        .foot{font-size:10px;color:#666;margin-top:14px;text-align:right}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f3f4f6}
        tfoot td{font-weight:bold;background:#f9fafb}
        @media print{@page{size:A4;margin:10mm}}
      </style></head><body>
      ${companyHeaderHtml()}
      <h1>Resumo de Vendas por Forma de Pagamento</h1>
      <div class="meta">${periodLabel()} · ${salesTotals.qtd} venda(s)</div>
      <table>
        <thead><tr><th>Forma de Pagamento</th><th style="text-align:right">Qtd</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td style="text-align:right">Total líquido</td><td style="text-align:right">${salesTotals.qtd}</td><td style="text-align:right">${brl(salesTotals.totalLiquido)}</td></tr></tfoot>
      </table>
      <div class="foot">Emitido em ${new Date().toLocaleString("pt-BR")}</div>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };


  const topProducts = useMemo(() => {
    const saleIds = new Set(sales.map((s) => s.id));
    const qtyMap = new Map<string, number>();
    const revMap = new Map<string, number>();
    for (const it of allSaleItems) {
      if (!saleIds.has(it.sale_id)) continue;
      const q = Number(it.quantity ?? 0);
      const unit = Number(it.unit_price ?? 0);
      const totalRaw = it.total == null ? q * unit : Number(it.total);
      qtyMap.set(it.product_id, (qtyMap.get(it.product_id) ?? 0) + q);
      revMap.set(it.product_id, (revMap.get(it.product_id) ?? 0) + totalRaw);
    }
    return Array.from(qtyMap.entries())
      .map(([id, qty]) => ({
        id,
        qty,
        revenue: revMap.get(id) ?? 0,
        product: products.find((p) => p.id === id) ?? (allSaleItems.find((i) => i.product_id === id) as any)?.products ?? null,
      }))
      .sort((a, b) => {
        const diff = b.qty - a.qty;
        if (diff !== 0) return diff;
        return compareProductNames(a.product?.name, b.product?.name);
      });
  }, [sales, allSaleItems, products]);

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
    // Vendas concluídas no período (sales já está filtrado por status e período)
    const saleIds = new Set(sales.map((s) => s.id));
    const itemsInPeriod = allSaleItems.filter((item) => saleIds.has(item.sale_id));

    // Receita = soma dos itens reais vendidos (sale_items.total)
    const itemsRevenue = itemsInPeriod.reduce((sum, item) => {
      const q = Number(item.quantity ?? 0);
      const unit = Number(item.unit_price ?? 0);
      const t = item.total == null ? q * unit : Number(item.total);
      return sum + t;
    }, 0);
    // Descontos e acréscimos aplicados no cabeçalho da venda
    const headerDiscount = sales.reduce((s, x) => s + Number(x.discount ?? 0), 0);
    const revenue = itemsRevenue - headerDiscount;

    // CMV = custo unitário * quantidade real baixada
    const cogs = itemsInPeriod.reduce((sum, item) => {
      const cost = Number(item.products?.cost_price ?? 0);
      return sum + cost * Number(item.quantity ?? 0);
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
    const rows = filteredSales.map((s) => ({
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
          <TabsTrigger value="contabilidade">Contabilidade</TabsTrigger>
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
          {cancelledSummary.count > 0 && (
            <Card className="p-4 border-l-4 border-destructive bg-destructive/5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-destructive uppercase font-semibold">
                    Vendas canceladas no período (não incluídas nos totais)
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {cancelledSummary.count} venda{cancelledSummary.count > 1 ? "s" : ""} · Valor total:{" "}
                    <span className="font-bold text-destructive">{brl(cancelledSummary.total)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 max-w-full">
                  {cancelledSalesInPeriod.slice(0, 12).map((c) => (
                    <Badge key={c.id} variant="outline" className="border-destructive/40 text-destructive font-mono text-[10px]">
                      #{c.number} · {brl(Number(c.total))}
                    </Badge>
                  ))}
                  {cancelledSalesInPeriod.length > 12 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{cancelledSalesInPeriod.length - 12}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          )}
          <Card className="p-4">
            <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
              <h3 className="font-semibold">Vendas no período</h3>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={printSales}>
                  <Printer className="size-4 mr-2" /> Imprimir / PDF
                </Button>
                <Button size="sm" variant="outline" onClick={printPaymentTotals}>
                  <Printer className="size-4 mr-2" /> Totais por Pgto
                </Button>
                <Button size="sm" variant="outline" onClick={exportSales}>
                  <Download className="size-4 mr-2" /> CSV
                </Button>


              </div>
            </div>


            {/* Filtros */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div>
                <Label className="text-xs">Cliente / Nº</Label>
                <Input
                  placeholder="Buscar cliente ou nº..."
                  value={salesFilterCustomer}
                  onChange={(e) => setSalesFilterCustomer(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Forma de pagamento</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start font-normal capitalize">
                      {salesFilterPayments.length === 0
                        ? "Todas"
                        : salesFilterPayments.length === 1
                          ? salesFilterPayments[0]
                          : `${salesFilterPayments.length} selecionadas`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" align="start">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setSalesFilterPayments(paymentMethodsInSales)}
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:underline"
                        onClick={() => setSalesFilterPayments([])}
                      >
                        Limpar
                      </button>
                    </div>
                    <div className="max-h-60 overflow-auto space-y-1">
                      {paymentMethodsInSales.map((pm) => {
                        const checked = salesFilterPayments.includes(pm);
                        return (
                          <div
                            key={pm}
                            onClick={() =>
                              setSalesFilterPayments((prev) =>
                                prev.includes(pm) ? prev.filter((x) => x !== pm) : [...prev, pm],
                              )
                            }
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm capitalize"
                          >
                            <Checkbox checked={checked} className="pointer-events-none" />
                            <span>{pm}</span>
                          </div>
                        );
                      })}
                      {paymentMethodsInSales.length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma forma disponível</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Total mínimo</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={salesFilterMin}
                  onChange={(e) => setSalesFilterMin(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Total máximo</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={salesFilterMax}
                  onChange={(e) => setSalesFilterMax(e.target.value)}
                />
              </div>
            </div>
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id="sales-fiscal-only"
                checked={salesFilterFiscalOnly}
                onCheckedChange={(v) => setSalesFilterFiscalOnly(v === true)}
              />
              <Label htmlFor="sales-fiscal-only" className="text-xs cursor-pointer flex items-center gap-1">
                <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                Somente vendas com nota fiscal autorizada
              </Label>
            </div>

            <div className="hidden md:block rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSalesSort("date")}
                    >
                      Data <SortIcon k="date" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSalesSort("number")}
                    >
                      Nº <SortIcon k="number" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSalesSort("customer")}
                    >
                      Cliente <SortIcon k="customer" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSalesSort("payment")}
                    >
                      Pgto <SortIcon k="payment" />
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => toggleSalesSort("total")}
                    >
                      Total <SortIcon k="total" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Nenhuma venda.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedSales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{dt(s.created_at)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <span className="inline-flex items-center gap-1">
                            #{s.number}
                            {fiscalNoteBySaleId.get(s.id) && (
                              <FiscalNotePopover note={fiscalNoteBySaleId.get(s.id)!} />
                            )}
                          </span>
                        </TableCell>
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
              {filteredSales.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhuma venda.</p>
              ) : (
                pagedSales.map((s) => (
                  <Card key={s.id} className="p-3 space-y-2 border-l-4 border-l-brand-orange">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                          #{s.number}
                          {fiscalNoteBySaleId.get(s.id) && (
                            <FiscalNotePopover note={fiscalNoteBySaleId.get(s.id)!} size="xs" />
                          )}
                        </div>
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

            {filteredSales.length > salesPageSize && (
              <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                <div className="text-xs text-muted-foreground">
                  Mostrando {(salesPage - 1) * salesPageSize + 1}–
                  {Math.min(salesPage * salesPageSize, filteredSales.length)} de {filteredSales.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSalesPage((p) => Math.max(1, p - 1))}
                    disabled={salesPage <= 1}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-xs">
                    {salesPage} / {salesTotalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSalesPage((p) => Math.min(salesTotalPages, p + 1))}
                    disabled={salesPage >= salesTotalPages}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
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
                          {brl(t.revenue || t.qty * Number(t.product?.sale_price ?? 0))}
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

        <TabsContent value="nfe" className="space-y-4 pt-4">
          {(() => {
            const inRange = fiscalNotes.filter((n) => {
              const d = (n.emitted_at ?? (n as any).created_at ?? "").slice(0, 10);
              return d >= from && d <= to;
            });
            const byStatus = (s: string) => inRange.filter((n) => n.status === s);
            const totalValor = inRange.reduce(
              (acc, n) => acc + Number((n as any).valor_total ?? (n as any).total ?? 0),
              0,
            );
            return (
              <>
                <div className="grid sm:grid-cols-4 gap-3">
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Emitidas</div>
                    <div className="text-xl font-bold">{inRange.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Autorizadas</div>
                    <div className="text-xl font-bold text-success">{byStatus("autorizada").length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Canceladas / Rejeitadas</div>
                    <div className="text-xl font-bold text-brand-red">
                      {byStatus("cancelada").length + byStatus("rejeitada").length}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Valor total</div>
                    <div className="text-xl font-bold">{brl(totalValor)}</div>
                  </Card>
                </div>
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Notas fiscais no período</h3>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Número</TableHead>
                          <TableHead>Ref</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inRange.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                              Nenhuma NF-e no período.
                            </TableCell>
                          </TableRow>
                        ) : (
                          inRange.slice(0, 50).map((n: any) => (
                            <TableRow key={n.id}>
                              <TableCell className="text-xs">{dt(n.emitted_at ?? n.created_at)}</TableCell>
                              <TableCell className="font-mono text-xs">{n.numero ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs">{n.ref ?? "—"}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    n.status === "autorizada"
                                      ? "secondary"
                                      : n.status === "cancelada" || n.status === "rejeitada"
                                        ? "destructive"
                                        : "outline"
                                  }
                                  className="text-[10px] uppercase"
                                >
                                  {n.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {brl(Number(n.valor_total ?? n.total ?? 0))}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="conciliacao" className="space-y-4 pt-4">
          {(() => {
            const inRange = bankTx.filter((t: any) => {
              const d = (t.date ?? "").slice(0, 10);
              return d >= from && d <= to;
            });
            const reconciled = inRange.filter((t: any) => t.reconciled);
            const pending = inRange.filter((t: any) => !t.reconciled);
            const totalCredits = inRange
              .filter((t: any) => Number(t.amount) > 0)
              .reduce((s: number, t: any) => s + Number(t.amount), 0);
            const totalDebits = inRange
              .filter((t: any) => Number(t.amount) < 0)
              .reduce((s: number, t: any) => s + Number(t.amount), 0);
            return (
              <>
                <div className="grid sm:grid-cols-4 gap-3">
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Lançamentos</div>
                    <div className="text-xl font-bold">{inRange.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Conciliados</div>
                    <div className="text-xl font-bold text-success">{reconciled.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Pendentes</div>
                    <div className="text-xl font-bold text-brand-orange">{pending.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground uppercase">Saldo período</div>
                    <div className="text-xl font-bold">{brl(totalCredits + totalDebits)}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      C {brl(totalCredits)} · D {brl(Math.abs(totalDebits))}
                    </div>
                  </Card>
                </div>
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Movimentações bancárias</h3>
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inRange.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                              Nenhum lançamento bancário no período.
                            </TableCell>
                          </TableRow>
                        ) : (
                          inRange.slice(0, 100).map((t: any) => (
                            <TableRow key={t.id}>
                              <TableCell className="text-xs">{t.date}</TableCell>
                              <TableCell className="text-xs truncate max-w-[300px]">{t.description}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={t.reconciled ? "secondary" : "outline"}
                                  className="text-[10px] uppercase"
                                >
                                  {t.reconciled ? "Conciliado" : "Pendente"}
                                </Badge>
                              </TableCell>
                              <TableCell
                                className={`text-right font-semibold ${Number(t.amount) < 0 ? "text-brand-red" : "text-success"}`}
                              >
                                {brl(Number(t.amount))}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </>
            );
          })()}
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

        <TabsContent value="contabilidade" className="space-y-4 pt-4">
          <AccountingSettings companyId={cid} />
        </TabsContent>
      </Tabs>


    </div>
  );
}

