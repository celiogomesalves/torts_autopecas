import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchPayables, fetchSales } from "@/lib/db";
import { appwrite } from "@/integrations/appwrite/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SmartPagination } from "@/components/smart-pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, Wallet, Download, Calendar } from "lucide-react";
import { downloadCSV, toCSV } from "@/lib/csv";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

export const Route = createFileRoute("/app/fluxo-caixa")({
  component: CashFlowPage,
});

interface DayRow {
  date: string;
  entradas: number;
  saidas: number;
  saldoDia: number;
  saldoAcumulado: number;
}

function CashFlowPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;

  // Data de início do fluxo de caixa configurada para a empresa
  const startQ = useQuery({
    queryKey: ["company-settings-start", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await appwrite
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

  const handlePrint = () => {
    const dataToPrint = days;
    const totalEntradas = dataToPrint.reduce((s, d) => s + d.entradas, 0);
    const totalSaidas = dataToPrint.reduce((s, d) => s + d.saidas, 0);
    const saldoPeriodo = dataToPrint.reduce((s, d) => s + d.saldoDia, 0);

    printList({
      title: "Fluxo de Caixa",
      subtitle: `Período: ${new Date(from).toLocaleDateString("pt-BR")} a ${new Date(to).toLocaleDateString("pt-BR")}`,
      columns: [
        {
          header: "Data",
          accessor: (d: DayRow) => new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR"),
          width: "16%",
        },
        { header: "Entradas", accessor: (d: DayRow) => brl(d.entradas), align: "right" },
        { header: "Saídas", accessor: (d: DayRow) => brl(d.saidas), align: "right" },
        { header: "Saldo do dia", accessor: (d: DayRow) => brl(d.saldoDia), align: "right" },
        {
          header: "Saldo acumulado",
          accessor: (d: DayRow) => brl(d.saldoAcumulado),
          align: "right",
        },
      ],
      rows: dataToPrint,
      summary: [
        { label: "Total entradas", value: brl(totalEntradas) },
        { label: "Total saídas", value: brl(totalSaidas) },
        { label: "Saldo do período", value: brl(saldoPeriodo) },
      ],
    });
  };

  // Quando a data de início configurada chegar/mudar, garante que `from` respeita o limite
  useEffect(() => {
    if (startQ.data && from < startQ.data) setFrom(startQ.data);
  }, [startQ.data, from]);

  const payablesQ = useQuery({
    queryKey: ["payables", cid],
    queryFn: () => fetchPayables(cid),
    enabled: !!cid,
  });
  // Removido salesQ daqui pois register_sale já cria payables para todas as vendas.
  // Usaremos apenas payables pagos para o fluxo de caixa efetivo.

  const payables = (payablesQ.data ?? []).filter((p) => p.status === "pago" || p.sale_id); // Incluir vendas mesmo que não estejam marcadas como 'pago' no payable

  const days = useMemo<DayRow[]>(() => {
    const fromDateStr = from < SYSTEM_START ? SYSTEM_START : from;
    const fromDate = new Date(fromDateStr);
    const toDate = new Date(to);
    const map = new Map<string, { entradas: number; saidas: number }>();

    // Calculate initial balance (before the range)
    const initialAcc = payables.reduce((acc, p) => {
      const d = (p.paid_at || p.due_date || p.created_at || "").slice(0, 10);

      if (d < fromDateStr) {
        return acc + (p.direction === "receber" ? Number(p.amount) : -Number(p.amount));
      }
      return acc;
    }, 0);

    // Payables pagos in range
    for (const p of payables) {
      const d = (p.paid_at || p.due_date || p.created_at || "").slice(0, 10);
      if (d >= fromDateStr && d <= to) {
        const cur = map.get(d) ?? { entradas: 0, saidas: 0 };
        if (p.direction === "receber") cur.entradas += Number(p.amount);
        else cur.saidas += Number(p.amount);
        map.set(d, cur);
      }
    }

    const rows: DayRow[] = [];
    let acc = initialAcc;
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const cur = map.get(key) ?? { entradas: 0, saidas: 0 };
      const saldoDia = cur.entradas - cur.saidas;
      acc += saldoDia;
      rows.push({
        date: key,
        entradas: cur.entradas,
        saidas: cur.saidas,
        saldoDia,
        saldoAcumulado: acc,
      });
    }
    return rows.reverse();
  }, [from, to, payables, SYSTEM_START]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(days.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return days.slice(start, start + pageSize);
  }, [days, currentPage, pageSize]);

  // Reset page when dates change
  useMemo(() => setCurrentPage(1), [from, to]);

  const totals = useMemo(
    () => ({
      entradas: days.reduce((s, d) => s + d.entradas, 0),
      saidas: days.reduce((s, d) => s + d.saidas, 0),
      saldo: days.reduce((s, d) => s + d.saldoDia, 0),
    }),
    [days],
  );

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

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={Wallet}
          title="Fluxo de Caixa"
          subtitle="Entradas e saídas por dia (vendas à vista + payables pagos)"
        />
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">De</Label>
            <Input
              type="date"
              min={SYSTEM_START}
              value={from}
              onChange={(e) =>
                setFrom(e.target.value < SYSTEM_START ? SYSTEM_START : e.target.value)
              }
            />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input
              type="date"
              min={SYSTEM_START}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={exportCSV}>
            <Download className="size-4 mr-2" /> CSV
          </Button>
          <PrintButton onClick={handlePrint} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Entradas no período
              </div>
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
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Saídas no período
              </div>
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
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Saldo do período
              </div>
              <div
                className={`mt-2 text-2xl font-bold ${
                  totals.saldo >= 0 ? "text-foreground" : "text-brand-red"
                }`}
              >
                {brl(totals.saldo)}
              </div>
            </div>
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
              <Wallet className="size-5" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum dado no período.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="font-mono text-xs">{d.date}</TableCell>
                    <TableCell className="text-right text-success">{brl(d.entradas)}</TableCell>
                    <TableCell className="text-right text-brand-red">
                      {d.saidas > 0 ? `- ${brl(d.saidas)}` : brl(0)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        d.saldoDia >= 0 ? "text-foreground" : "text-brand-red"
                      }`}
                    >
                      {brl(d.saldoDia)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        d.saldoAcumulado >= 0 ? "text-muted-foreground" : "text-brand-red"
                      }`}
                    >
                      {brl(d.saldoAcumulado)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-2">
          {paginated.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum dado.</p>
          ) : (
            paginated.map((d) => (
              <Card key={d.date} className="p-3">
                <div className="flex justify-between items-center">
                  <div className="font-mono text-xs flex items-center gap-1">
                    <Calendar className="size-3" /> {d.date}
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      d.saldoDia >= 0 ? "text-foreground" : "text-brand-red"
                    }`}
                  >
                    {brl(d.saldoDia)}
                  </div>
                </div>
                <div className="flex justify-between text-[10px] mt-1 text-muted-foreground border-t border-dashed pt-2">
                  <span className="text-success">+ {brl(d.entradas)}</span>
                  <span className="text-brand-red">- {brl(d.saidas)}</span>
                  <span>Acum.: {brl(d.saldoAcumulado)}</span>
                </div>
              </Card>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 border-t pt-4">
            <SmartPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
