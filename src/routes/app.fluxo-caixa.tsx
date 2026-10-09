import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchPayables } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SmartPagination } from "@/components/smart-pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Download,
  Calendar,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { downloadCSV, toCSV } from "@/lib/csv";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/fluxo-caixa")({
  loader: makePrefetchLoader(["bankTransactions", "paymentMethods"]),
  component: CashFlowPage,
});

type EntryKind =
  | "venda"
  | "recebimento"
  | "conta_recebida"
  | "conta_paga"
  | "sangria"
  | "suprimento"
  | "devolucao_dinheiro"
  | "devolucao_credito"
  | "ajuste_entrada"
  | "ajuste_saida";

interface DayEntry {
  id: string;
  date: string;
  kind: EntryKind;
  label: string;
  amount: number;
  direction: "in" | "out" | "neutral";
}

interface DayRow {
  date: string;
  entradas: number;
  saidas: number;
  saldoDia: number;
  saldoAcumulado: number;
  entries: DayEntry[];
}

const KIND_META: Record<EntryKind, { label: string; className: string }> = {
  venda: { label: "Venda", className: "border-green-500 text-green-700 bg-green-50" },
  recebimento: { label: "Recebimento", className: "border-green-500 text-green-700 bg-green-50" },
  conta_recebida: { label: "Conta recebida", className: "border-emerald-500 text-emerald-700 bg-emerald-50" },
  conta_paga: { label: "Conta paga", className: "border-amber-500 text-amber-700 bg-amber-50" },
  sangria: { label: "Sangria", className: "border-red-500 text-red-700 bg-red-50" },
  suprimento: { label: "Suprimento", className: "border-blue-500 text-blue-700 bg-blue-50" },
  devolucao_dinheiro: { label: "Devolução (dinheiro)", className: "border-orange-500 text-orange-700 bg-orange-50" },
  devolucao_credito: { label: "Devolução (crédito)", className: "border-slate-400 text-slate-600 bg-slate-50" },
  ajuste_entrada: { label: "Ajuste (+)", className: "border-blue-400 text-blue-700 bg-blue-50" },
  ajuste_saida: { label: "Ajuste (−)", className: "border-red-400 text-red-700 bg-red-50" },
};

function CashFlowPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;

  const startQ = useQuery({
    queryKey: ["company-settings-start", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings" as any)
        .select("cashflow_start_date")
        .eq("company_id", cid)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        const local = localStorage.getItem(`company_settings_${cid}`);
        return local ? (JSON.parse(local).cashflow_start_date as string | null) : null;
      }
      return ((data as any)?.cashflow_start_date as string | null) ?? null;
    },
  });
  const SYSTEM_START = startQ.data || "1970-01-01";

  const today = new Date();
  const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const firstDay = firstDayMonth < SYSTEM_START ? SYSTEM_START : firstDayMonth;
  const lastDay = today.toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(lastDay);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (startQ.data && from < startQ.data) setFrom(startQ.data);
  }, [startQ.data, from]);

  const payablesQ = useQuery({
    queryKey: ["payables", cid],
    queryFn: () => fetchPayables(cid),
    enabled: !!cid,
  });

  const cashTxQ = useQuery({
    queryKey: ["cash-transactions-flow", cid, from, to],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cash_transactions")
        .select("id, type, category, amount, description, created_at, reference_id")
        .eq("company_id", cid)
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<any>;
    },
  });

  // Devoluções em crédito (não passam por cash_transactions)
  const returnsQ = useQuery({
    queryKey: ["return-sales-flow", cid, from, to],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("id, number, total, created_at, payment_method, origin_sale_id")
        .eq("company_id", cid)
        .eq("type", "devolucao")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<any>;
    },
  });

  const openRegQ = useQuery({
    queryKey: ["all-open-registers-flow", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cash_registers")
        .select("id, opening_amount, opened_at")
        .eq("company_id", cid)
        .eq("status", "OPEN");
      if (error) throw error;
      return (data ?? []) as Array<any>;
    },
  });

  // Payables efetivos (pago) e não cancelados
  const payables = useMemo(
    () =>
      (payablesQ.data ?? []).filter(
        (p: any) => p.status === "pago" && p.status !== "cancelado",
      ),
    [payablesQ.data],
  );

  const days = useMemo<DayRow[]>(() => {
    const fromDateStr = from < SYSTEM_START ? SYSTEM_START : from;
    const fromDate = new Date(fromDateStr);
    const toDate = new Date(to);
    const map = new Map<string, DayEntry[]>();
    const push = (e: DayEntry) => {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    };

    // Payables no período
    for (const p of payables) {
      const d = (p.paid_at || p.due_date || p.created_at || "").slice(0, 10);
      if (d < fromDateStr || d > to) continue;
      const isReceive = p.direction === "receber";
      const isSale = !!p.sale_id;
      push({
        id: `p-${p.id}`,
        date: d,
        kind: isSale ? "venda" : isReceive ? "conta_recebida" : "conta_paga",
        label: p.description || (isSale ? `Venda ${p.sale_id ? "#" + String(p.sale_id).slice(0, 6) : ""}` : isReceive ? "Recebimento" : "Pagamento"),
        amount: Number(p.amount),
        direction: isReceive ? "in" : "out",
      });
    }

    // Transações de caixa (não SALE — SALE já vem via payables)
    for (const tx of cashTxQ.data ?? []) {
      const d = (tx.created_at || "").slice(0, 10);
      if (d < fromDateStr || d > to) continue;
      if (tx.category === "SALE" || tx.category === "PAYMENT_RECEIVED") continue; // já vem via payables

      let kind: EntryKind | null = null;
      let direction: "in" | "out" = "in";
      if (tx.category === "WITHDRAWAL") { kind = "sangria"; direction = "out"; }
      else if (tx.category === "REFUND") { kind = "devolucao_dinheiro"; direction = "out"; }
      else if (tx.category === "EXPENSE") { kind = "conta_paga"; direction = "out"; }
      else if (tx.category === "ADJUSTMENT") {
        if (tx.type === "IN") { kind = "ajuste_entrada"; direction = "in"; }
        else { kind = "ajuste_saida"; direction = "out"; }
      } else if (tx.type === "IN") { kind = "suprimento"; direction = "in"; }
      if (!kind) continue;

      push({
        id: `t-${tx.id}`,
        date: d,
        kind,
        label: tx.description || KIND_META[kind].label,
        amount: Number(tx.amount),
        direction,
      });
    }

    // Devoluções em crédito (neutras) — quando não geram REFUND em cash_transactions
    const refundRefs = new Set(
      (cashTxQ.data ?? [])
        .filter((tx: any) => tx.category === "REFUND")
        .map((tx: any) => tx.reference_id),
    );
    for (const r of returnsQ.data ?? []) {
      if (refundRefs.has(r.id)) continue; // já contabilizada como saída
      const d = (r.created_at || "").slice(0, 10);
      if (d < fromDateStr || d > to) continue;
      push({
        id: `r-${r.id}`,
        date: d,
        kind: "devolucao_credito",
        label: `Devolução #${r.number ?? ""} → ref. #${r.origin_sale_id?.slice(0, 6) ?? ""}`,
        amount: Number(r.total),
        direction: "neutral",
      });
    }

    // Saldo inicial (antes do período)
    let initialAcc = 0;
    for (const p of payables) {
      const d = (p.paid_at || p.due_date || p.created_at || "").slice(0, 10);
      if (d < fromDateStr) initialAcc += p.direction === "receber" ? Number(p.amount) : -Number(p.amount);
    }
    for (const tx of cashTxQ.data ?? []) {
      const d = (tx.created_at || "").slice(0, 10);
      if (d >= fromDateStr) continue;
      if (tx.category === "SALE" || tx.category === "PAYMENT_RECEIVED") continue;
      if (tx.category === "WITHDRAWAL" || tx.category === "REFUND" || tx.category === "EXPENSE") initialAcc -= Number(tx.amount);
      else if (tx.category === "ADJUSTMENT") initialAcc += tx.type === "IN" ? Number(tx.amount) : -Number(tx.amount);
      else if (tx.type === "IN") initialAcc += Number(tx.amount);
    }

    const rows: DayRow[] = [];
    let acc = initialAcc;
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const entries = (map.get(key) ?? []).sort((a, b) => a.kind.localeCompare(b.kind));
      const entradas = entries.filter((e) => e.direction === "in").reduce((s, e) => s + e.amount, 0);
      const saidas = entries.filter((e) => e.direction === "out").reduce((s, e) => s + e.amount, 0);
      const saldoDia = entradas - saidas;
      acc += saldoDia;
      rows.push({ date: key, entradas, saidas, saldoDia, saldoAcumulado: acc, entries });
    }
    return rows.reverse();
  }, [from, to, payables, cashTxQ.data, returnsQ.data, SYSTEM_START]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(days.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return days.slice(start, start + pageSize);
  }, [days, currentPage, pageSize]);

  useMemo(() => setCurrentPage(1), [from, to]);

  const composition = useMemo(() => {
    let vendas = 0;
    let recebimentos = 0;
    let contasPagas = 0;
    let sangrias = 0;
    let suprimentos = 0;
    let devDinheiro = 0;
    let devCredito = 0;
    for (const d of days) {
      for (const e of d.entries) {
        switch (e.kind) {
          case "venda": vendas += e.amount; break;
          case "conta_recebida":
          case "recebimento": recebimentos += e.amount; break;
          case "conta_paga": contasPagas += e.amount; break;
          case "sangria": sangrias += e.amount; break;
          case "suprimento":
          case "ajuste_entrada": suprimentos += e.amount; break;
          case "devolucao_dinheiro": devDinheiro += e.amount; break;
          case "devolucao_credito": devCredito += e.amount; break;
          case "ajuste_saida": sangrias += e.amount; break;
        }
      }
    }
    return { vendas, recebimentos, contasPagas, sangrias, suprimentos, devDinheiro, devCredito };
  }, [days]);

  const totals = useMemo(
    () => ({
      entradas: days.reduce((s, d) => s + d.entradas, 0),
      saidas: days.reduce((s, d) => s + d.saidas, 0),
      saldo: days.reduce((s, d) => s + d.saldoDia, 0),
    }),
    [days],
  );

  const openBalance = useMemo(() => {
    return (openRegQ.data ?? []).reduce((s: number, r: any) => s + Number(r.opening_amount || 0), 0);
  }, [openRegQ.data]);

  const exportCSV = () => {
    const csv = toCSV(
      days.map((d) => ({
        Data: d.date,
        Entradas: d.entradas.toFixed(2),
        Saídas: d.saidas.toFixed(2),
        "Saldo do dia": d.saldoDia.toFixed(2),
        "Saldo acumulado": d.saldoAcumulado.toFixed(2),
      })),
    );
    downloadCSV(`fluxo-caixa-${from}-a-${to}.csv`, csv);
  };

  const handlePrint = () => {
    const dataToPrint = days;
    const totalEntradas = dataToPrint.reduce((s, d) => s + d.entradas, 0);
    const totalSaidas = dataToPrint.reduce((s, d) => s + d.saidas, 0);
    const saldoPeriodo = dataToPrint.reduce((s, d) => s + d.saldoDia, 0);
    printList({
      title: "Fluxo de Caixa",
      subtitle: `Período: ${new Date(from).toLocaleDateString("pt-BR")} a ${new Date(to).toLocaleDateString("pt-BR")}`,
      columns: [
        { header: "Data", accessor: (d: DayRow) => new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR"), width: "16%" },
        { header: "Entradas", accessor: (d: DayRow) => brl(d.entradas), align: "right" },
        { header: "Saídas", accessor: (d: DayRow) => brl(d.saidas), align: "right" },
        { header: "Saldo do dia", accessor: (d: DayRow) => brl(d.saldoDia), align: "right" },
        { header: "Saldo acumulado", accessor: (d: DayRow) => brl(d.saldoAcumulado), align: "right" },
      ],
      rows: dataToPrint,
      summary: [
        { label: "Total entradas", value: brl(totalEntradas) },
        { label: "Total saídas", value: brl(totalSaidas) },
        { label: "Saldo do período", value: brl(saldoPeriodo) },
      ],
    });
  };

  const toggle = (date: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={Wallet}
          title="Fluxo de Caixa"
          subtitle="Considera movimentos consolidados (payables pagos + transações de caixa). Vendas canceladas e devoluções são refletidas."
        />
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" min={SYSTEM_START} value={from} onChange={(e) => setFrom(e.target.value < SYSTEM_START ? SYSTEM_START : e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" min={SYSTEM_START} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-2" /> CSV
          </Button>
          <PrintButton onClick={handlePrint} />
        </div>
      </div>

      {openRegQ.data && openRegQ.data.length > 0 && (
        <div className="rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 p-3 text-xs flex items-start gap-2">
          <Info className="size-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            Há <strong>{openRegQ.data.length}</strong> caixa(s) em aberto (abertura total: {brl(openBalance)}).
            Movimentos do caixa aparecem aqui em tempo real; o fechamento só consolida a data quando o caixa é fechado.
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Entradas no período</div>
              <div className="mt-2 text-2xl font-bold text-success">{brl(totals.entradas)}</div>
            </div>
            <div className="size-10 rounded-lg bg-success/10 flex items-center justify-center">
              <ArrowDownToLine className="size-5 text-success" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Saídas no período</div>
              <div className="mt-2 text-2xl font-bold text-brand-red">{brl(totals.saidas)}</div>
            </div>
            <div className="size-10 rounded-lg bg-brand-red/10 flex items-center justify-center">
              <ArrowUpFromLine className="size-5 text-brand-red" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Saldo do período</div>
              <div className={cn("mt-2 text-2xl font-bold", totals.saldo >= 0 ? "text-foreground" : "text-brand-red")}>{brl(totals.saldo)}</div>
            </div>
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
              <Wallet className="size-5" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Composição do período</div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-muted-foreground">Vendas + Recebimentos</div>
            <div className="text-lg font-semibold text-success">{brl(composition.vendas + composition.recebimentos)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Devoluções em dinheiro</div>
            <div className="text-lg font-semibold text-orange-600">- {brl(composition.devDinheiro)}</div>
            {composition.devCredito > 0 && (
              <div className="text-[10px] text-muted-foreground">+ {brl(composition.devCredito)} em crédito (neutro)</div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Sangrias / Ajustes (−)</div>
            <div className="text-lg font-semibold text-brand-red">- {brl(composition.sangrias)}</div>
            {composition.suprimentos > 0 && (
              <div className="text-[10px] text-muted-foreground">+ {brl(composition.suprimentos)} suprimento</div>
            )}
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Contas pagas</div>
            <div className="text-lg font-semibold text-brand-red">- {brl(composition.contasPagas)}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Entradas</TableHead>
                <TableHead className="text-right">Saídas</TableHead>
                <TableHead className="text-right">Saldo do dia</TableHead>
                <TableHead className="text-right">Acumulado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum dado no período.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((d) => {
                  const isOpen = expanded.has(d.date);
                  const hasEntries = d.entries.length > 0;
                  return (
                    <Fragment key={d.date}>
                      <TableRow key={d.date} className={cn(hasEntries && "cursor-pointer hover:bg-muted/40")} onClick={() => hasEntries && toggle(d.date)}>
                        <TableCell className="w-8">
                          {hasEntries ? (
                            isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR")}
                          {hasEntries && <span className="ml-2 text-[10px] text-muted-foreground">({d.entries.length} lanç.)</span>}
                        </TableCell>
                        <TableCell className="text-right text-success">{brl(d.entradas)}</TableCell>
                        <TableCell className="text-right text-brand-red">{d.saidas > 0 ? `- ${brl(d.saidas)}` : brl(0)}</TableCell>
                        <TableCell className={cn("text-right font-semibold", d.saldoDia >= 0 ? "text-foreground" : "text-brand-red")}>{brl(d.saldoDia)}</TableCell>
                        <TableCell className={cn("text-right", d.saldoAcumulado >= 0 ? "text-muted-foreground" : "text-brand-red")}>{brl(d.saldoAcumulado)}</TableCell>
                      </TableRow>
                      {isOpen && hasEntries && (
                        <TableRow key={`${d.date}-details`} className="bg-muted/20">
                          <TableCell></TableCell>
                          <TableCell colSpan={5} className="py-2">
                            <div className="space-y-1">
                              {d.entries.map((e) => (
                                <div key={e.id} className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", KIND_META[e.kind].className)}>
                                    {KIND_META[e.kind].label}
                                  </Badge>
                                  <span className="flex-1 truncate">{e.label}</span>
                                  <span className={cn(
                                    "font-mono font-semibold",
                                    e.direction === "in" && "text-success",
                                    e.direction === "out" && "text-brand-red",
                                    e.direction === "neutral" && "text-muted-foreground",
                                  )}>
                                    {e.direction === "out" ? "-" : e.direction === "in" ? "+" : "="} {brl(e.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-2">
          {paginated.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum dado.</p>
          ) : (
            paginated.map((d) => (
              <Collapsible key={d.date} open={expanded.has(d.date)} onOpenChange={() => toggle(d.date)}>
                <Card className="p-3">
                  <CollapsibleTrigger className="w-full text-left">
                    <div className="flex justify-between items-center">
                      <div className="font-mono text-xs flex items-center gap-1">
                        {expanded.has(d.date) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                        <Calendar className="size-3" /> {d.date}
                      </div>
                      <div className={cn("text-sm font-bold", d.saldoDia >= 0 ? "text-foreground" : "text-brand-red")}>{brl(d.saldoDia)}</div>
                    </div>
                    <div className="flex justify-between text-[10px] mt-1 text-muted-foreground border-t border-dashed pt-2">
                      <span className="text-success">+ {brl(d.entradas)}</span>
                      <span className="text-brand-red">- {brl(d.saidas)}</span>
                      <span>Acum.: {brl(d.saldoAcumulado)}</span>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 pt-2 border-t space-y-1">
                      {d.entries.map((e) => (
                        <div key={e.id} className="flex items-center gap-2 text-[11px]">
                          <Badge variant="outline" className={cn("text-[9px] px-1 py-0", KIND_META[e.kind].className)}>
                            {KIND_META[e.kind].label}
                          </Badge>
                          <span className="flex-1 truncate">{e.label}</span>
                          <span className={cn(
                            "font-mono font-semibold",
                            e.direction === "in" && "text-success",
                            e.direction === "out" && "text-brand-red",
                            e.direction === "neutral" && "text-muted-foreground",
                          )}>
                            {e.direction === "out" ? "-" : e.direction === "in" ? "+" : "="} {brl(e.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 border-t pt-4">
            <SmartPagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
