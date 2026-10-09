import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchPaymentMethods,
  upsertPaymentMethod,
  deletePaymentMethod,
  fetchPaymentMethodsUsage,
  isSuperAdmin,
  hasPermission,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, CreditCard, Calendar, ArrowDownUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/confirm-dialog";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { SearchInput } from "@/components/search-input";
import { cn, matchSearch } from "@/lib/utils";

export const Route = createFileRoute("/app/formas-pagamento")({
  loader: makePrefetchLoader(["paymentMethods"]),
  component: PaymentMethodsPage,
});

interface FormState {
  id?: string;
  name: string;
  requires_due_date: boolean;
  active: boolean;
  auto_issue_nfce: boolean;
}

const empty: FormState = {
  name: "",
  requires_due_date: false,
  active: true,
  auto_issue_nfce: false,
};

function PaymentMethodsPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);

  const [form, setForm] = useState<FormState>(empty);
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(
    null,
  );
  const [filterDueDate, setFilterDueDate] = useState<"all" | "yes" | "no">("all");
  const [filterAutoNfce, setFilterAutoNfce] = useState<"all" | "yes" | "no">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handlePrint = () => {
    printList({
      title: "Formas de Pagamento",
      columns: [
        { header: "Nome", accessor: (m: any) => m.name },
        {
          header: "Vencimento obrigatório",
          accessor: (m: any) => (m.requires_due_date ? "Sim" : "Não"),
          align: "center",
        },
        {
          header: "Status",
          accessor: (m: any) => (m.active ? "Ativo" : "Inativo"),
          align: "center",
        },
      ],
      rows: filtered,
    });
  };

  const methodsQ = useQuery({
    queryKey: ["payment_methods", cid],
    queryFn: () => fetchPaymentMethods(cid),
    enabled: !!cid,
  });

  const methods = methodsQ.data ?? [];
  const filtered = (() => {
    let arr = methods.filter((m) => matchSearch(m.name, search));
    if (filterDueDate !== "all")
      arr = arr.filter((m) => !!m.requires_due_date === (filterDueDate === "yes"));
    if (filterAutoNfce !== "all")
      arr = arr.filter((m) => !!(m as any).auto_issue_nfce === (filterAutoNfce === "yes"));
    if (filterStatus !== "all")
      arr = arr.filter((m) => !!m.active === (filterStatus === "active"));
    const cfg = sortConfig ?? { key: "name", direction: "asc" as const };
    const dir = cfg.direction === "asc" ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      const av = (a as any)[cfg.key];
      const bv = (b as any)[cfg.key];
      if (typeof av === "boolean" || typeof bv === "boolean") {
        return ((av ? 1 : 0) - (bv ? 1 : 0)) * dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR", { sensitivity: "base" }) *
        dir;
    });
    return arr;
  })();

  const usageQ = useQuery({
    queryKey: ["payment_methods_usage", cid],
    queryFn: () => fetchPaymentMethodsUsage(cid),
    enabled: !!cid,
  });
  const usage = usageQ.data ?? {};

  const superAdminQ = useQuery({
    queryKey: ["isSuperAdmin"],
    queryFn: isSuperAdmin,
  });
  const isSuper = !!superAdminQ.data;

  const permEditQ = useQuery({
    queryKey: ["has_permission", cid, "formas-pagamento", "edit"],
    queryFn: () => hasPermission(cid, "formas-pagamento", "edit"),
    enabled: !!cid,
  });
  const permDeleteQ = useQuery({
    queryKey: ["has_permission", cid, "formas-pagamento", "delete"],
    queryFn: () => hasPermission(cid, "formas-pagamento", "delete"),
    enabled: !!cid,
  });
  const canEditUsed = isSuper || !!permEditQ.data;
  const canDeleteUsed = isSuper || !!permDeleteQ.data;

  const saveMut = useMutation({
    mutationFn: () => upsertPaymentMethod(cid, form),
    onSuccess: () => {
      toast.success(
        form.id ? "Sucesso! Forma de pagamento atualizada." : "Sucesso! Forma de pagamento criada.",
      );
      qc.invalidateQueries({ queryKey: ["payment_methods", cid] });
      qc.invalidateQueries({ queryKey: ["payment_methods_usage", cid] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deletePaymentMethod(id, cid),
    onSuccess: () => {
      toast.success("Sucesso! Forma de pagamento excluída.");
      qc.invalidateQueries({ queryKey: ["payment_methods", cid] });
      qc.invalidateQueries({ queryKey: ["payment_methods_usage", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isSystemMethod = (m: any) =>
    (m?.name ?? "").trim().toLowerCase() === "voucher";
  const isSystemLocked = (m: any) => isSystemMethod(m) && !isSuper;

  const handleEdit = (m: any) => {
    if (isSystemLocked(m)) {
      toast.error(
        "A forma de pagamento Voucher é fixa do sistema e só pode ser alterada pelo super administrador.",
      );
      return;
    }
    const used = !!usage[m.id];
    if (used && !canEditUsed) {
      toast.error(
        "Esta forma de pagamento já foi usada em vendas e seu perfil não tem permissão de edição em Formas de pagamento.",
      );
      return;
    }
    setForm({
      id: m.id,
      name: m.name,
      requires_due_date: m.requires_due_date,
      active: m.active,
      auto_issue_nfce: !!(m as any).auto_issue_nfce,
    });
    setOpen(true);
  };


  const handleOpenNew = () => {
    setForm(empty);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <PageHeading
          icon={CreditCard}
          title="Formas de Pagamento"
          subtitle="Gerencie as formas de pagamento aceitas"
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <PrintButton
            onClick={handlePrint}
            className="w-full sm:w-auto"
            disabled={methods.length === 0}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={handleOpenNew}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground w-full sm:w-auto"
              >
                <Plus className="size-4 mr-2" /> Nova forma
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{form.id ? "Editar" : "Nova"} forma de pagamento</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.name.trim()) return;
                  saveMut.mutate();
                }}
                className="space-y-4 pt-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    required
                    placeholder="Ex: Cartão de Crédito, Boleto, etc."
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label>Exigir data de vencimento</Label>
                    <p className="text-xs text-muted-foreground">
                      Se ativado, o sistema exigirá o preenchimento da data de vencimento ao usar
                      esta forma.
                    </p>
                  </div>
                  <Switch
                    checked={form.requires_due_date}
                    onCheckedChange={(v) => setForm({ ...form, requires_due_date: v })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label>Ativo</Label>
                    <p className="text-xs text-muted-foreground">
                      Se desativado, esta forma não aparecerá nas seleções de venda/financeiro.
                    </p>
                  </div>
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => setForm({ ...form, active: v })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <Label>Emite NFC-e automaticamente</Label>
                    <p className="text-xs text-muted-foreground">
                      Ao finalizar a venda, se pelo menos uma forma usada tiver esta opção
                      ativa, a NFC-e é emitida automaticamente. Caso contrário, o sistema
                      pergunta se deseja emitir.
                    </p>
                  </div>
                  <Switch
                    checked={form.auto_issue_nfce}
                    onCheckedChange={(v) => setForm({ ...form, auto_issue_nfce: v })}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMut.isPending}
                    className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
                  >
                    {saveMut.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Pesquisar formas de pagamento..."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select value={filterDueDate} onValueChange={(v) => setFilterDueDate(v as any)}>
            <SelectTrigger><SelectValue placeholder="Vencimento obrigatório" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vencimento: todos</SelectItem>
              <SelectItem value="yes">Vencimento: sim</SelectItem>
              <SelectItem value="no">Vencimento: não</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAutoNfce} onValueChange={(v) => setFilterAutoNfce(v as any)}>
            <SelectTrigger><SelectValue placeholder="Emissão automática" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Emissão automática: todos</SelectItem>
              <SelectItem value="yes">Emissão automática: sim</SelectItem>
              <SelectItem value="no">Emissão automática: não</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: todos</SelectItem>
              <SelectItem value="active">Status: ativo</SelectItem>
              <SelectItem value="inactive">Status: inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="hidden md:block">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {([
                  { key: "name", label: "Nome" },
                  { key: "requires_due_date", label: "Vencimento Obrigatório" },
                  { key: "auto_issue_nfce", label: "Emissão Automática" },
                  { key: "active", label: "Status" },
                ] as const).map((col) => (
                  <TableHead
                    key={col.key}
                    className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                    onClick={() => handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      <ArrowDownUp
                        className={cn(
                          "size-3",
                          sortConfig?.key === col.key
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-50",
                        )}
                      />
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    {methods.length === 0
                      ? "Nenhuma forma de pagamento cadastrada."
                      : `Nenhuma forma encontrada para "${search}".`}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <CreditCard className="size-4 text-muted-foreground" />
                        {m.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.requires_due_date ? (
                        <Badge variant="secondary" className="gap-1">
                          <Calendar className="size-3" /> Sim
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(m as any).auto_issue_nfce ? (
                        <Badge variant="default" className="gap-1">Sim</Badge>
                      ) : (
                        <span className="text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.active ? "outline" : "secondary"}>
                        {m.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isSystemMethod(m) ? (
                        <Badge variant="outline" className="mr-2 text-[10px]">
                          Sistema
                        </Badge>
                      ) : usage[m.id] && !canEditUsed ? (
                        <Badge variant="outline" className="mr-2 text-[10px]">
                          Bloqueada
                        </Badge>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(m)}
                        disabled={isSystemLocked(m) || (usage[m.id] && !canEditUsed)}
                        title={
                          isSystemLocked(m)
                            ? "Forma fixa do sistema — apenas super admin pode editar"
                            : usage[m.id] && !canEditUsed
                              ? "Forma já usada em vendas — requer permissão de edição em Formas de pagamento"
                              : "Editar"
                        }
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isSystemLocked(m) || (usage[m.id] && !canDeleteUsed)}
                        title={
                          isSystemLocked(m)
                            ? "Forma fixa do sistema — apenas super admin pode excluir"
                            : usage[m.id] && !canDeleteUsed
                              ? "Forma já usada em vendas — requer permissão de exclusão em Formas de pagamento"
                              : "Excluir"
                        }
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Excluir forma de pagamento?",
                              description:
                                "Tem certeza que deseja excluir esta forma de pagamento? Esta ação não pode ser desfeita.",
                              confirmLabel: "Excluir",
                            })
                          ) {
                            delMut.mutate(m.id);
                          }
                        }}
                      >
                        <Trash2 className="size-4 text-brand-red" />
                      </Button>
                    </TableCell>

                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">
            {methods.length === 0
              ? "Nenhuma forma de pagamento cadastrada."
              : `Nenhuma forma encontrada para "${search}".`}
          </p>
        ) : (
          filtered.map((m) => (
            <Card key={m.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center shrink-0">
                  <CreditCard className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">Descrição</div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-base truncate">{m.name}</div>
                    <Badge
                      variant={m.active ? "outline" : "secondary"}
                      className="shrink-0 h-5 text-[10px]"
                    >
                      {m.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {m.requires_due_date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="size-3" /> Vencimento obrigatório
                      </div>
                    ) : (
                      "Sem vencimento obrigatório"
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end items-center gap-1 border-t pt-2">
                {isSystemMethod(m) ? (
                  <Badge variant="outline" className="mr-auto text-[10px]">
                    Sistema (fixa)
                  </Badge>
                ) : usage[m.id] && !canEditUsed ? (
                  <Badge variant="outline" className="mr-auto text-[10px]">
                    Bloqueada (já usada em vendas)
                  </Badge>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(m)}
                  disabled={isSystemLocked(m) || (usage[m.id] && !canEditUsed)}
                  className="h-9 w-9"
                >
                  <Pencil className="size-4 text-brand-orange" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isSystemLocked(m) || (usage[m.id] && !canDeleteUsed)}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Excluir forma de pagamento?",
                        description:
                          "Tem certeza que deseja excluir esta forma de pagamento? Esta ação não pode ser desfeita.",
                        confirmLabel: "Excluir",
                      })
                    ) {
                      delMut.mutate(m.id);
                    }
                  }}
                  className="h-9 w-9"
                >
                  <Trash2 className="size-4 text-brand-red" />
                </Button>
              </div>

            </Card>
          ))
        )}
      </div>
    </div>
  );
}
