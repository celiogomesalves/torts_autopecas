import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchPartners, upsertPartner, deletePartner } from "@/lib/db";
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
  Pencil,
  Trash2,
  Search,
  UserRound,
  Truck,
  Loader2,
  Phone,
  Mail,
  ArrowDownUp,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { cn, normalize } from "@/lib/utils";
import type { Partner, PartnerType } from "@/lib/db-types";
import { maskCep, maskCpfCnpj, maskPhone, fetchViaCep, onlyDigits } from "@/lib/masks";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

export const Route = createFileRoute("/app/parceiros")({
  loader: makePrefetchLoader(["partnersAll"]),
  component: PartnersPage,
});

interface FormState {
  name: string;
  type: PartnerType;
  doc: string;
  email: string;
  phone: string;
  cep: string;
  address: string;
  number: string;
  complement: string;
  notes: string;
}
const empty: FormState = {
  name: "",
  type: "cliente",
  doc: "",
  email: "",
  phone: "",
  cep: "",
  address: "",
  number: "",
  complement: "",
  notes: "",
};

function PartnersPage() {
  const { user, currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [tab, setTab] = useState<"todos" | PartnerType>("todos");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [cepLoading, setCepLoading] = useState(false);

  const partnersQ = useQuery({
    queryKey: ["partners", cid],
    queryFn: () => fetchPartners(cid),
    enabled: !!cid,
  });
  const list = partnersQ.data ?? [];

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
    let arr = list;
    if (tab !== "todos") arr = arr.filter((p) => p.type === tab || p.type === "ambos");
    const q = normalize(search.trim());
    let result = q
      ? arr.filter(
          (p) =>
            normalize(p.name).includes(q) ||
            normalize(p.doc).includes(q) ||
            normalize(p.email).includes(q),
        )
      : [...arr];

    if (sortConfig) {
      result.sort((a: any, b: any) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) aValue = "";
        if (bValue === null || bValue === undefined) bValue = "";

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [list, search, tab, sortConfig]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const handlePrint = () => {
    printList({
      title:
        tab === "todos"
          ? "Clientes & Fornecedores"
          : tab === "fornecedor"
            ? "Fornecedores"
            : "Clientes",
      subtitle: search ? `Filtro: "${search}"` : undefined,
      columns: [
        { header: "Nome", accessor: (p: Partner) => p.name },
        { header: "Tipo", accessor: (p: Partner) => p.type, align: "center", width: "15%" },
        {
          header: "Documento",
          accessor: (p: Partner) => (p.doc ? maskCpfCnpj(p.doc) : "—"),
          width: "20%",
        },
        {
          header: "Telefone",
          accessor: (p: Partner) => (p.phone ? maskPhone(p.phone) : "—"),
          width: "18%",
        },
        { header: "E-mail", accessor: (p: Partner) => p.email || "—" },
      ],
      rows: filtered,
    });
  };

  // Reset page when filters change
  useMemo(() => setCurrentPage(1), [search, tab]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, type: tab === "todos" ? "cliente" : (tab as PartnerType) });
    setOpen(true);
  };
  const openEdit = (p: Partner) => {
    setEditing(p);
    setForm({
      name: p.name,
      type: p.type,
      doc: p.doc ? maskCpfCnpj(p.doc) : "",
      email: p.email ?? "",
      phone: p.phone ? maskPhone(p.phone) : "",
      cep: p.cep ? maskCep(p.cep) : "",
      address: p.address ?? "",
      number: p.number ?? "",
      complement: p.complement ?? "",
      notes: p.notes ?? "",
    });
    setOpen(true);
  };

  const handleCepBlur = async () => {
    const d = onlyDigits(form.cep);
    if (d.length !== 8) return;
    setCepLoading(true);
    const r = await fetchViaCep(d);
    setCepLoading(false);
    if (!r) {
      toast.error("CEP não encontrado");
      return;
    }
    const addr = [r.logradouro, r.bairro, r.localidade, r.uf].filter(Boolean).join(", ");
    setForm((f) => ({ ...f, address: addr, complement: f.complement || r.complemento || "" }));
  };

  const saveMut = useMutation({
    mutationFn: () =>
      upsertPartner(cid, {
        id: editing?.id,
        name: form.name.trim(),
        type: form.type,
        doc: onlyDigits(form.doc) || null,
        email: form.email || null,
        phone: onlyDigits(form.phone) || null,
        cep: onlyDigits(form.cep) || null,
        address: form.address || null,
        number: form.number || null,
        complement: form.complement || null,
        notes: form.notes || null,
        userId: user?.id,
      }),
    onSuccess: () => {
      toast.success(editing ? "Sucesso! Parceiro atualizado." : "Sucesso! Parceiro cadastrado.");
      qc.invalidateQueries({ queryKey: ["partners", cid] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deletePartner,
    onSuccess: () => {
      toast.success("Sucesso! Parceiro excluído.");
      qc.invalidateQueries({ queryKey: ["partners", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={UserRound}
          title="Clientes & Fornecedores"
          subtitle={`${list.length} cadastrado(s)`}
        />
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <PrintButton
            onClick={handlePrint}
            className="w-full sm:w-auto"
            disabled={list.length === 0}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openNew}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground w-full sm:w-auto"
              >
                <Plus className="size-4 mr-2" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar parceiro" : "Novo parceiro"}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!form.name.trim()) return;
                  saveMut.mutate();
                }}
                className="grid gap-4 sm:grid-cols-6"
              >
                <div className="space-y-2 sm:col-span-4">
                  <Label>Nome / Razão social</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        name:
                          form.type === "fornecedor"
                            ? e.target.value.toUpperCase()
                            : e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Tipo</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as PartnerType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cliente">Cliente</SelectItem>
                      <SelectItem value="fornecedor">Fornecedor</SelectItem>
                      <SelectItem value="ambos">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label>CPF / CNPJ</Label>
                  <Input
                    value={form.doc}
                    onChange={(e) => setForm({ ...form, doc: maskCpfCnpj(e.target.value) })}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label>Telefone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                    placeholder="(00)00000-0000"
                    inputMode="tel"
                  />
                </div>
                <div className="sm:col-span-6 space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>CEP</Label>
                  <div className="relative">
                    <Input
                      value={form.cep}
                      onChange={(e) => setForm({ ...form, cep: maskCep(e.target.value) })}
                      onBlur={handleCepBlur}
                      placeholder="00000-000"
                      inputMode="numeric"
                    />
                    {cepLoading && (
                      <Loader2 className="size-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-4">
                  <Label>Endereço</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Rua, bairro, cidade/UF"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Número</Label>
                  <Input
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-4">
                  <Label>Complemento</Label>
                  <Input
                    value={form.complement}
                    onChange={(e) => setForm({ ...form, complement: e.target.value })}
                    placeholder="Apto, sala, referência…"
                  />
                </div>

                <div className="sm:col-span-6 space-y-2">
                  <Label>Observações</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <DialogFooter className="sm:col-span-6">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMut.isPending}
                    className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
                  >
                    {saveMut.isPending ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="bg-card border border-border h-auto flex-wrap justify-start">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="cliente">Clientes</TabsTrigger>
              <TabsTrigger value="fornecedor">Fornecedores</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Nome{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "name"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("type")}
                >
                  <div className="flex items-center gap-1">
                    Tipo{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "type"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("doc")}
                >
                  <div className="flex items-center gap-1">
                    Doc{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "doc"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("email")}
                >
                  <div className="flex items-center gap-1">
                    Contato{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "email"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead className="text-right w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partnersQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Nada por aqui ainda.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {p.type === "fornecedor" ? (
                          <Truck className="size-3" />
                        ) : (
                          <UserRound className="size-3" />
                        )}
                        {p.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.doc ? maskCpfCnpj(p.doc) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{p.phone ? maskPhone(p.phone) : "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.email || ""}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: "Excluir parceiro?",
                              description: `Tem certeza que deseja excluir "${p.name}"? Esta ação não pode ser desfeita.`,
                              confirmLabel: "Excluir",
                            })
                          )
                            deleteMut.mutate(p.id);
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
        </div>
        <div className="md:hidden space-y-3">
          {partnersQ.isLoading ? (
            <div className="text-center text-muted-foreground py-10">Carregando...</div>
          ) : paginated.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">Nada por aqui ainda.</div>
          ) : (
            paginated.map((p) => (
              <Card key={p.id} className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center shrink-0">
                    {p.type === "fornecedor" ? (
                      <Truck className="size-4" />
                    ) : (
                      <UserRound className="size-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Descrição</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-base truncate">{p.name}</div>
                      <Badge variant="outline" className="gap-1 text-[10px] h-5 shrink-0">
                        {p.type}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <div className="font-mono text-xs text-muted-foreground">
                        {p.doc ? maskCpfCnpj(p.doc) : "—"}
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                      {p.phone && (
                        <div className="flex items-center gap-1 truncate">
                          <Phone className="size-3" /> {maskPhone(p.phone)}
                        </div>
                      )}
                      {p.email && (
                        <div className="flex items-center gap-1 truncate">
                          <Mail className="size-3" /> {p.email}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end items-center gap-1 border-t pt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(p)}
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
                          title: "Excluir parceiro?",
                          description: `Tem certeza que deseja excluir "${p.name}"? Esta ação não pode ser desfeita.`,
                          confirmLabel: "Excluir",
                        })
                      )
                        deleteMut.mutate(p.id);
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
