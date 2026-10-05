import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchPaymentMethods, upsertPaymentMethod, deletePaymentMethod } from "@/lib/db";
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
import { Plus, Pencil, Trash2, CreditCard, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/confirm-dialog";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

import { SearchInput } from "@/components/search-input";
import { matchSearch } from "@/lib/utils";

export const Route = createFileRoute("/app/formas-pagamento")({
  component: PaymentMethodsPage,
});

interface FormState {
  id?: string;
  name: string;
  requires_due_date: boolean;
  active: boolean;
}

const empty: FormState = {
  name: "",
  requires_due_date: false,
  active: true,
};

function PaymentMethodsPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);

  const [form, setForm] = useState<FormState>(empty);
  const [search, setSearch] = useState("");

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
  const filtered = methods.filter((m) => matchSearch(m.name, search));

  const saveMut = useMutation({
    mutationFn: () => upsertPaymentMethod(cid, form),
    onSuccess: () => {
      toast.success(
        form.id ? "Sucesso! Forma de pagamento atualizada." : "Sucesso! Forma de pagamento criada.",
      );
      qc.invalidateQueries({ queryKey: ["payment_methods", cid] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: deletePaymentMethod,
    onSuccess: () => {
      toast.success("Sucesso! Forma de pagamento excluída.");
      qc.invalidateQueries({ queryKey: ["payment_methods", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleEdit = (m: any) => {
    setForm({
      id: m.id,
      name: m.name,
      requires_due_date: m.requires_due_date,
      active: m.active,
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

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Pesquisar formas de pagamento..."
      />

      <div className="hidden md:block">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Vencimento Obrigatório</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
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
                      <Badge variant={m.active ? "outline" : "secondary"}>
                        {m.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(m)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(m)}
                  className="h-9 w-9"
                >
                  <Pencil className="size-4 text-brand-orange" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
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
