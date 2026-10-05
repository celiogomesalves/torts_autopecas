import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchPayables,
  markPayablePaid,
  fetchBankTransactions,
  importBankTransactions,
  updateBankTransaction,
  deleteBankTransaction,
} from "@/lib/db";
import { parseCSV } from "@/lib/csv";
import { normalize } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Banknote, Upload, CheckCircle2, Trash2, Link2, Calendar } from "lucide-react";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import type { BankTransaction } from "@/lib/db-types";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

export const Route = createFileRoute("/app/conciliacao")({
  component: ConciliacaoPage,
});

function parseDateBR(s: string): string {
  const t = s.trim();
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return t;
}

function parseAmount(s: string): number {
  const t = s.trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (/,\d{2}$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  return Number(t.replace(/,/g, ""));
}

function ConciliacaoPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId ?? "";
  const qc = useQueryClient();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePrint = () => {
    const dataToPrint = txs;
    const currentStats = {
      total: dataToPrint.length,
      reconciled: dataToPrint.filter((t) => t.reconciled).length,
      pending: dataToPrint.filter((t) => !t.reconciled && !t.matched_payable_id).length,
      saldo: dataToPrint.reduce((s, t) => s + Number(t.amount), 0),
    };

    printList({
      title: "Conciliação Bancária",
      subtitle: `${dataToPrint.length} lançamento(s)`,
      columns: [
        {
          header: "Data",
          accessor: (t: BankTransaction) =>
            new Date(t.date + "T00:00:00").toLocaleDateString("pt-BR"),
          width: "12%",
        },
        { header: "Descrição", accessor: (t: BankTransaction) => t.description },
        {
          header: "Vinculado a",
          accessor: (t: BankTransaction) => payableLabel(t.matched_payable_id) || "—",
        },
        {
          header: "Status",
          accessor: (t: BankTransaction) =>
            t.reconciled ? "Conciliado" : t.matched_payable_id ? "Sugerido" : "Pendente",
          align: "center",
          width: "12%",
        },
        {
          header: "Valor",
          accessor: (t: BankTransaction) => brl(Number(t.amount)),
          align: "right",
          width: "14%",
        },
      ],
      rows: dataToPrint,
      summary: [
        { label: "Saldo do extrato", value: brl(currentStats.saldo) },
        { label: "Conciliados", value: String(currentStats.reconciled) },
        { label: "Pendentes", value: String(currentStats.pending) },
      ],
    });
  };

  const txsQ = useQuery({
    queryKey: ["bank-transactions", cid],
    queryFn: () => fetchBankTransactions(cid),
    enabled: !!cid,
  });
  const payablesQ = useQuery({
    queryKey: ["payables", cid],
    queryFn: () => fetchPayables(cid),
    enabled: !!cid,
  });

  const txs = txsQ.data ?? [];
  const payables = payablesQ.data ?? [];

  const importMut = useMutation({
    mutationFn: (data: any[]) => importBankTransactions(cid, data),
    onSuccess: (imported) => {
      qc.invalidateQueries({ queryKey: ["bank-transactions", cid] });
      toast.success(`Sucesso! ${imported.length} lançamentos importados.`);
      autoMatch(imported);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<BankTransaction> }) =>
      updateBankTransaction(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bank-transactions", cid] }),
  });

  const delMut = useMutation({
    mutationFn: deleteBankTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-transactions", cid] });
      toast.success("Sucesso! Lançamento removido.");
    },
  });

  const handleImport = async (file: File) => {
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      toast.error("CSV vazio ou inválido");
      return;
    }
    const header = rows[0].map((h) => h.toLowerCase().trim());
    const idxDate = header.findIndex((h) => /(data|date)/i.test(h));
    const idxDesc = header.findIndex((h) => /(descri|hist|memo|description)/i.test(h));
    const idxAmount = header.findIndex((h) => /(valor|amount|montante)/i.test(h));

    if (idxDate < 0 || idxDesc < 0 || idxAmount < 0) {
      toast.error("CSV deve ter colunas: data, descricao, valor");
      return;
    }

    const imported = rows.slice(1).map((r) => ({
      date: parseDateBR(r[idxDate] ?? ""),
      description: r[idxDesc] ?? "",
      amount: parseAmount(r[idxAmount] ?? "0"),
    }));

    importMut.mutate(imported);
  };

  const autoMatch = (incoming: BankTransaction[]) => {
    const open = payables.filter((p) => p.status === "aberto");
    let matched = 0;
    for (const tx of incoming) {
      const sign = tx.amount >= 0 ? "receber" : "pagar";
      const abs = Math.abs(tx.amount);
      const txDate = new Date(tx.date).getTime();
      const cand = open.find((p) => {
        if (p.direction !== sign) return false;
        if (Math.abs(Number(p.amount) - abs) > 0.01) return false;
        const pd = new Date(p.due_date).getTime();
        const diff = Math.abs(pd - txDate) / (1000 * 60 * 60 * 24);
        return diff <= 5;
      });
      if (cand) {
        matched++;
        updateMut.mutate({ id: tx.id, patch: { matched_payable_id: cand.id } });
      }
    }
    if (matched > 0) toast.info(`${matched} matches automáticos sugeridos`);
  };

  const conciliar = async (tx: BankTransaction) => {
    if (!tx.matched_payable_id) {
      toast.error("Vincule um lançamento financeiro primeiro");
      return;
    }
    try {
      const p = payables.find((x) => x.id === tx.matched_payable_id);
      if (p && p.status === "aberto") {
        await markPayablePaid(tx.matched_payable_id, cid);
        await qc.invalidateQueries({ queryKey: ["payables", cid] });
      }
      await updateMut.mutateAsync({ id: tx.id, patch: { reconciled: true } });
      toast.success("Sucesso! Lançamento conciliado.");
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const stats = useMemo(() => {
    const reconciled = txs.filter((t) => t.reconciled).length;
    const matched = txs.filter((t) => t.matched_payable_id && !t.reconciled).length;
    const pending = txs.length - reconciled - matched;
    const saldo = txs.reduce((s, t) => s + Number(t.amount), 0);
    return { total: txs.length, reconciled, matched, pending, saldo };
  }, [txs]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(txs.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return txs.slice(start, start + pageSize);
  }, [txs, currentPage, pageSize]);

  useMemo(() => setCurrentPage(1), [txs.length]);

  const payableLabel = (id?: string | null) => {
    if (!id) return null;
    const p = payables.find((x) => x.id === id);
    if (!p) return "(removido)";
    return `${p.description} — ${brl(Number(p.amount))}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeading
          icon={Banknote}
          title="Conciliação Bancária"
          subtitle="Importe extrato CSV e concilie com lançamentos financeiros."
        />
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
          <PrintButton onClick={handlePrint} />
          <Button
            className="bg-brand-red hover:bg-brand-red/90"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4 mr-2" /> Importar extrato CSV
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Lançamentos</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-success">
          <div className="text-xs text-muted-foreground uppercase">Conciliados</div>
          <div className="text-2xl font-bold">{stats.reconciled}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-brand-orange">
          <div className="text-xs text-muted-foreground uppercase">Sugeridos</div>
          <div className="text-2xl font-bold">{stats.matched}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-brand-red">
          <div className="text-xs text-muted-foreground uppercase">Pendentes</div>
          <div className="text-2xl font-bold">{stats.pending}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Saldo extrato</div>
          <div
            className={`text-2xl font-bold ${stats.saldo >= 0 ? "text-success" : "text-brand-red"}`}
          >
            {brl(stats.saldo)}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="hidden md:block rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vinculado a</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum lançamento.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((t) => (
                  <TableRow key={t.id} className={t.reconciled ? "opacity-60" : ""}>
                    <TableCell className="text-xs">{t.date}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate">
                      {t.description}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${Number(t.amount) >= 0 ? "text-success" : "text-brand-red"}`}
                    >
                      {brl(Number(t.amount))}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.matched_payable_id ? (
                        <span className="flex items-center gap-1">
                          <Link2 className="size-3 text-brand-orange" />
                          {payableLabel(t.matched_payable_id)}
                        </span>
                      ) : (
                        <PayableLinker
                          txAmount={Number(t.amount)}
                          onSelect={(pid) =>
                            updateMut.mutate({ id: t.id, patch: { matched_payable_id: pid } })
                          }
                          payables={payables}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {t.reconciled ? (
                        <Badge variant="outline" className="text-success border-success">
                          Conciliado
                        </Badge>
                      ) : t.matched_payable_id ? (
                        <Badge variant="secondary">Sugerido</Badge>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!t.reconciled && t.matched_payable_id && (
                          <Button size="sm" variant="outline" onClick={() => conciliar(t)}>
                            <CheckCircle2 className="size-3 mr-1" /> Conciliar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Excluir transação?",
                                description:
                                  "Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.",
                                confirmLabel: "Excluir",
                              })
                            )
                              delMut.mutate(t.id);
                          }}
                        >
                          <Trash2 className="size-3 text-brand-red" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function PayableLinker({
  txAmount,
  payables,
  onSelect,
}: {
  txAmount: number;
  payables: any[];
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const direction = txAmount >= 0 ? "receber" : "pagar";
  const filtered = payables
    .filter((p) => p.status === "aberto" && p.direction === direction)
    .filter((p) => !search || normalize(p.description).includes(normalize(search)))
    .slice(0, 8);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Vincular...
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1 min-w-[200px] bg-muted p-2 rounded-md animate-in fade-in zoom-in-95 duration-200">
      <Input
        size={1}
        className="h-7 text-xs"
        placeholder="Buscar..."
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-[120px] overflow-y-auto space-y-1">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="w-full text-left px-2 py-1 text-[10px] hover:bg-accent rounded-sm flex justify-between gap-2"
          >
            <span className="truncate">{p.description}</span>
            <span className="font-bold shrink-0">{brl(Number(p.amount))}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-[10px] text-muted-foreground p-2">Sem resultados</div>
        )}
      </div>
      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setOpen(false)}>
        Fechar
      </Button>
    </div>
  );
}
