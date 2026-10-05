import { PageHeading } from "@/components/page-header";
import { Loader2, ShieldAlert } from "lucide-react";
import { hasPermission, isSuperAdmin } from "@/lib/db";
import { useNavigate } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchPayables,
  upsertPayable,
  markPayablePaid,
  deletePayable,
  fetchPartners,
  fetchPaymentMethods,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SmartPagination } from "@/components/smart-pagination";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Check,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Pencil,
  ArrowDownUp,
} from "lucide-react";
import { brl, formatCurrencyInput, parseCurrencyInput } from "@/lib/format";
import { useValueVisibility, ValueVisibilityToggle } from "@/hooks/use-value-visibility";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { cn, matchSearch } from "@/lib/utils";
import { SearchInput } from "@/components/search-input";
import type { PayableDirection, PayableStatus } from "@/lib/db-types";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

export const Route = createFileRoute("/app/financeiro")({
  beforeLoad: async ({ context }: any) => {
    // A verificação de permissão real deve ser feita aqui se possível,
    // mas como o context do router pode não ter o hasPermission fácil,
    // vamos garantir que o componente lide com isso ou use um loader.
  },
  component: FinancePage,
});

interface FormState {
  direction: PayableDirection;
  description: string;
  amount: string;
  due_date: string;
  partner_id: string;
  payment_method: string;
  notes: string;
}
const empty: FormState = {
  direction: "receber",
  description: "",
  amount: "0,00",
  due_date: new Date().toISOString().slice(0, 10),
  partner_id: "none",
  payment_method: "",
  notes: "",
};

function FinancePage() {
  const { user, currentCompanyId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const cid = currentCompanyId!;

  const superAdminQ = useQuery({
    queryKey: ["isSuperAdmin", user?.id],
    queryFn: isSuperAdmin,
    enabled: !!user,
  });

  const permQ = useQuery({
    queryKey: ["has_permission", cid, "financeiro", "view", user?.id],
    queryFn: () => hasPermission(cid, "financeiro", "view"),
    enabled: !!cid && !!user,
  });

  const isSuper = !!superAdminQ.data;
  const hasPerm = permQ.data ?? false;
  const isLoading = authLoading || superAdminQ.isLoading || permQ.isLoading;

  const qc = useQueryClient();
  const confirm = useConfirm();

  const [tab, setTab] = useState<"todos" | PayableDirection>("todos");

  const handlePrint = () => {
    const dataToPrint = filtered;
    const total = dataToPrint.reduce((s, p) => s + Number(p.amount), 0);
    const aberto = dataToPrint
      .filter((p) => p.status === "aberto")
      .reduce((s, p) => s + Number(p.amount), 0);
    const pago = dataToPrint
      .filter((p) => p.status === "pago")
      .reduce((s, p) => s + Number(p.amount), 0);

    printList({
      title: "Financeiro — Lançamentos",
      subtitle: `${tab === "todos" ? "Todos" : tab === "receber" ? "A receber" : "A pagar"}${statusFilter !== "todos" ? ` · ${statusFilter}` : ""}`,
      columns: [
        {
          header: "Vencimento",
          accessor: (p: any) =>
            p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—",
          width: "12%",
        },
        {
          header: "Tipo",
          accessor: (p: any) => (p.direction === "receber" ? "Receber" : "Pagar"),
          width: "10%",
        },
        { header: "Descrição", accessor: (p: any) => p.description },
        {
          header: "Parceiro",
          accessor: (p: any) => partners.find((x) => x.id === p.partner_id)?.name || "—",
          width: "20%",
        },
        { header: "Forma", accessor: (p: any) => p.payment_method || "—", width: "14%" },
        { header: "Status", accessor: (p: any) => p.status, align: "center", width: "10%" },
        {
          header: "Valor",
          accessor: (p: any) => brl(Number(p.amount)),
          align: "right",
          width: "12%",
        },
      ],
      rows: dataToPrint,
      summary: [
        { label: "Total geral", value: brl(total) },
        { label: "Em aberto", value: brl(aberto) },
        { label: "Pago", value: brl(pago) },
      ],
    });
  };
  const [statusFilter, setStatusFilter] = useState<"todos" | PayableStatus>("todos");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);

  const payablesQ = useQuery({
    queryKey: ["payables", cid],
    queryFn: () => fetchPayables(cid),
    enabled: !!cid,
  });
  const partnersQ = useQuery({
    queryKey: ["partners", cid],
    queryFn: () => fetchPartners(cid),
    enabled: !!cid,
  });
  const paymentMethodsQ = useQuery({
    queryKey: ["payment_methods", cid],
    queryFn: () => fetchPaymentMethods(cid),
    enabled: !!cid,
  });

  const all = payablesQ.data ?? [];
  const partners = partnersQ.data ?? [];
  const paymentMethods = paymentMethodsQ.data ?? [];

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(
    null,
  );

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const filtered = useMemo(() => {
    let result = all.filter((p) => {
      const partnerName = partners.find((x) => x.id === p.partner_id)?.name || "";
      const matchesSearch =
        !search.trim() ||
        matchSearch(p.description, search) ||
        matchSearch(partnerName, search) ||
        matchSearch(p.payment_method ?? "", search);
      return (
        (tab === "todos" || p.direction === tab) &&
        (statusFilter === "todos" || p.status === statusFilter) &&
        matchesSearch
      );
    });

    if (sortConfig) {
      result = [...result].sort((a: any, b: any) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (sortConfig.key === "partner_name") {
          aValue = (partners.find((p) => p.id === a.partner_id)?.name || "").toLowerCase();
          bValue = (partners.find((p) => p.id === b.partner_id)?.name || "").toLowerCase();
        }

        if (aValue === null || aValue === undefined) aValue = "";
        if (bValue === null || bValue === undefined) bValue = "";

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [all, tab, statusFilter, sortConfig, partners, search]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset page when filters change
  useMemo(() => setCurrentPage(1), [tab, statusFilter, search]);

  const totals = useMemo(() => {
    const open = all.filter((p) => p.status === "aberto");
    const paid = all.filter((p) => p.status === "pago");
    return {
      receberAberto: open
        .filter((p) => p.direction === "receber")
        .reduce((s, p) => s + Number(p.amount), 0),
      pagarAberto: open
        .filter((p) => p.direction === "pagar")
        .reduce((s, p) => s + Number(p.amount), 0),
      receberPago: paid
        .filter((p) => p.direction === "receber")
        .reduce((s, p) => s + Number(p.amount), 0),
    };
  }, [all]);
  const saldoPrevisto = totals.receberAberto - totals.pagarAberto;

  const openNew = () => {
    setForm({ ...empty, direction: tab === "todos" ? "receber" : tab });
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const pm = paymentMethods.find((x) => x.id === form.payment_method);
      return upsertPayable(cid, {
        direction: form.direction,
        description: form.description.trim(),
        amount: parseCurrencyInput(form.amount),
        due_date: form.due_date,
        partner_id: form.partner_id === "none" ? null : form.partner_id,
        payment_method: pm?.name || null,
        notes: form.notes || null,
        userId: user?.id,
      });
    },
    onSuccess: () => {
      toast.success("Sucesso! Lançamento criado.");
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payMut = useMutation({
    mutationFn: (id: string) => markPayablePaid(id, cid),
    onSuccess: () => {
      toast.success("Sucesso! Lançamento marcado como pago.");
      qc.invalidateQueries({ queryKey: ["payables", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: deletePayable,
    onSuccess: () => {
      toast.success("Sucesso! Lançamento excluído.");
      qc.invalidateQueries({ queryKey: ["payables", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visibility = useValueVisibility("financeiro");

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuper && !hasPerm) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] space-y-4">
        <ShieldAlert className="size-12 text-brand-red" />
        <h1 className="text-xl font-bold">Acesso Negado</h1>
        <p className="text-muted-foreground">Você não tem permissão para acessar o financeiro.</p>
        <Button onClick={() => navigate({ to: "/app" })}>Voltar ao Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading icon={Wallet} title="Financeiro" subtitle="Contas a pagar e a receber" />
        <div className="flex items-center gap-2">
          <ValueVisibilityToggle
            hidden={visibility.hidden}
            canToggle={visibility.canToggle}
            onToggle={visibility.toggle}
          />
          <PrintButton onClick={handlePrint} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openNew}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              >
                <Plus className="size-4 mr-2" /> Novo lançamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Novo lançamento</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.description.trim()) return;
                  if (!form.payment_method) {
                    return toast.error("Selecione uma forma de pagamento.");
                  }
                  const pm = paymentMethods.find((x) => x.id === form.payment_method);
                  const requiresDueDate = pm?.requires_due_date ?? false;
                  if (requiresDueDate && !form.due_date) {
                    return toast.error(
                      "Data de vencimento é obrigatória para esta forma de pagamento.",
                    );
                  }
                  saveMut.mutate();
                }}
                className="grid gap-4 sm:grid-cols-2"
              >
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={form.direction}
                    onValueChange={(v) => setForm({ ...form, direction: v as PayableDirection })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receber">A receber</SelectItem>
                      <SelectItem value="pagar">A pagar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Vencimento</Label>
                  <Input
                    type="date"
                    required
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input
                    type="text"
                    required
                    readOnly={visibility.hidden}
                    value={visibility.maskInputValue(form.amount)}
                    onChange={(e) =>
                      setForm({ ...form, amount: formatCurrencyInput(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Forma</Label>
                  <Select
                    value={form.payment_method}
                    onValueChange={(v) => setForm({ ...form, payment_method: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.filter((pm) => pm.active).length === 0 ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground">
                          Cadastre formas em "Formas de Pagamento".
                        </div>
                      ) : (
                        paymentMethods
                          .filter((pm) => pm.active)
                          .map((pm) => (
                            <SelectItem key={pm.id} value={pm.id}>
                              {pm.name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Parceiro</Label>
                  <Select
                    value={form.partner_id}
                    onValueChange={(v) => setForm({ ...form, partner_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhum —</SelectItem>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Observações</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMut.isPending}
                    className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
                  >
                    {saveMut.isPending ? "Salvando..." : "Lançar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Recebido (pago)
              </div>
              <div className="mt-2 text-2xl font-bold text-success">
                {visibility.mask(brl(totals.receberPago))}
              </div>
            </div>
            <div className="size-10 rounded-lg bg-success/10 flex items-center justify-center">
              <Check className="size-5 text-success" />
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                A receber (aberto)
              </div>
              <div className="mt-2 text-2xl font-bold text-success">
                {visibility.mask(brl(totals.receberAberto))}
              </div>
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
                A pagar (aberto)
              </div>
              <div className="mt-2 text-2xl font-bold text-brand-red">
                {visibility.mask(brl(totals.pagarAberto))}
              </div>
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
                Saldo previsto
              </div>
              <div
                className={`mt-2 text-2xl font-bold ${saldoPrevisto >= 0 ? "text-foreground" : "text-brand-red"}`}
              >
                {visibility.mask(brl(saldoPrevisto))}
              </div>
            </div>
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
              <Wallet className="size-5" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="bg-card border border-border h-auto flex-wrap justify-start">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="receber">A receber</TabsTrigger>
              <TabsTrigger value="pagar">A pagar</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="pago">Pago</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Pesquisar por descrição, parceiro ou forma..."
            className="flex-1 min-w-[200px]"
          />
        </div>
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("due_date")}
                >
                  <div className="flex items-center gap-1">
                    Vencimento{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "due_date"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("description")}
                >
                  <div className="flex items-center gap-1">
                    Descrição{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "description"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("partner_name")}
                >
                  <div className="flex items-center gap-1">
                    Parceiro{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "partner_name"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("direction")}
                >
                  <div className="flex items-center gap-1">
                    Tipo{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "direction"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("status")}
                >
                  <div className="flex items-center gap-1">
                    Status{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "status"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("amount")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Valor{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "amount"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead className="text-right w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    Nenhum lançamento.
                  </TableCell>
                </TableRow>
              ) : (
                (paginated as any[]).map((p) => {
                  const partner = partners.find((x) => x.id === p.partner_id);
                  const overdue =
                    p.status === "aberto" &&
                    new Date(p.due_date) < new Date(new Date().toDateString());
                  return (
                    <TableRow key={p.id}>
                      <TableCell className={overdue ? "text-brand-red font-semibold" : ""}>
                        {p.due_date}
                      </TableCell>
                      <TableCell className="font-medium">{p.description}</TableCell>
                      <TableCell className="text-sm">{partner?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={p.direction === "receber" ? "text-success" : "text-brand-red"}
                        >
                          {p.direction === "receber" ? "Receber" : "Pagar"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {p.profiles?.name || "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${p.direction === "receber" ? "text-success" : "text-brand-red"}`}
                      >
                        {visibility.mask(brl(Number(p.amount)))}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.status === "aberto" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => payMut.mutate(p.id)}
                            title="Marcar como pago"
                          >
                            <Check className="size-4 text-success" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Excluir lançamento?",
                                description:
                                  "Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.",
                                confirmLabel: "Excluir",
                              })
                            )
                              delMut.mutate(p.id);
                          }}
                        >
                          <Trash2 className="size-4 text-brand-red" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {paginated.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm italic">
              Nenhum lançamento.
            </div>
          ) : (
            paginated.map((p) => {
              const partner = partners.find((x) => x.id === p.partner_id);
              const overdue =
                p.status === "aberto" && new Date(p.due_date) < new Date(new Date().toDateString());
              return (
                <Card
                  key={p.id}
                  className={`p-4 space-y-3 border-l-4 ${p.direction === "receber" ? "border-l-success" : "border-l-brand-red"}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="font-bold text-base line-clamp-1">{p.description}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                        {partner?.name || "Sem parceiro"}
                      </div>
                    </div>
                    <div
                      className={`text-right font-bold text-base ${p.direction === "receber" ? "text-success" : "text-brand-red"}`}
                    >
                      {visibility.mask(brl(Number(p.amount)))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs border-t border-dashed pt-3">
                    <div className="space-y-1">
                      <div
                        className={
                          overdue
                            ? "text-brand-red font-bold flex items-center gap-1"
                            : "text-muted-foreground"
                        }
                      >
                        Venc. {p.due_date}
                      </div>
                      <Badge variant="outline" className="capitalize text-[10px] h-5">
                        {p.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      {p.status === "aberto" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => payMut.mutate(p.id)}
                        >
                          <Check className="size-3 mr-1 text-success" /> Pagar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Excluir lançamento?",
                              description:
                                "Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.",
                              confirmLabel: "Excluir",
                            })
                          )
                            delMut.mutate(p.id);
                        }}
                      >
                        <Trash2 className="size-3 text-brand-red" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
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
