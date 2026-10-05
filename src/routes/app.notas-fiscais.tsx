import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchSales,
  fetchPartners,
  fetchFiscalSettings,
  upsertFiscalSettings,
  fetchFiscalNotes,
  createFiscalNote,
  updateFiscalNoteStatus,
  deleteFiscalNote,
} from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { FileText, Plus, Download, Trash2, Settings, Hash } from "lucide-react";
import { brl, dt } from "@/lib/format";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import type { NfType, NfStatus, FiscalNote, FiscalSettings } from "@/lib/db-types";
import { SearchInput } from "@/components/search-input";
import { matchSearch } from "@/lib/utils";

export const Route = createFileRoute("/app/notas-fiscais")({
  component: NotasFiscaisPage,
});

function genChave(): string {
  let s = "";
  for (let i = 0; i < 44; i++) s += Math.floor(Math.random() * 10).toString();
  return s;
}

function NotasFiscaisPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId ?? "";
  const qc = useQueryClient();
  const confirm = useConfirm();

  const settingsQ = useQuery({
    queryKey: ["fiscal-settings", cid],
    queryFn: () => fetchFiscalSettings(cid),
    enabled: !!cid,
  });
  const notasQ = useQuery({
    queryKey: ["fiscal-notes", cid],
    queryFn: () => fetchFiscalNotes(cid),
    enabled: !!cid,
  });
  const salesQ = useQuery({
    queryKey: ["sales", cid],
    queryFn: () => fetchSales(cid, 50),
    enabled: !!cid,
  });
  const partnersQ = useQuery({
    queryKey: ["partners", cid],
    queryFn: () => fetchPartners(cid),
    enabled: !!cid,
  });

  const settings =
    settingsQ.data ?? ({ ambiente: "homologacao", ultimo_numero: 0, serie: 1 } as FiscalSettings);
  const notas = notasQ.data ?? [];
  const sales = salesQ.data ?? [];
  const partners = partnersQ.data ?? [];

  const settingsMut = useMutation({
    mutationFn: (patch: Partial<FiscalSettings>) => upsertFiscalSettings(cid, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-settings", cid] });
      setCfgOpen(false);
      toast.success("Sucesso! Configurações salvas.");
    },
  });

  const emitMut = useMutation({
    mutationFn: (note: Omit<FiscalNote, "id" | "company_id" | "emitted_at">) =>
      createFiscalNote(cid, note),
    onSuccess: (newNote) => {
      qc.invalidateQueries({ queryKey: ["fiscal-notes", cid] });
      qc.invalidateQueries({ queryKey: ["fiscal-settings", cid] });
      setEmitOpen(false);
      setEmitForm({ type: "NF-e" });
      toast.success(`Sucesso! ${newNote.type} ${newNote.numero} emitida.`);
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: NfStatus }) =>
      updateFiscalNoteStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fiscal-notes", cid] }),
  });

  const delMut = useMutation({
    mutationFn: deleteFiscalNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-notes", cid] });
      toast.success("Sucesso! Nota excluída.");
    },
  });

  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgForm, setCfgForm] = useState<Partial<FiscalSettings>>({});

  const [emitOpen, setEmitOpen] = useState(false);
  const [emitForm, setEmitForm] = useState<{
    type: NfType;
    sale_id?: string;
    customer_name?: string;
    customer_doc?: string;
    total?: number;
    notes?: string;
  }>({ type: "NF-e" });

  const onEmit = () => {
    if (!emitForm.customer_name?.trim()) return toast.error("Informe o destinatário");
    if (!emitForm.total || emitForm.total <= 0) return toast.error("Informe o valor");

    const numero = Number(settings.ultimo_numero ?? 0) + 1;
    const sale = sales.find((s) => s.id === emitForm.sale_id);

    emitMut.mutate({
      type: emitForm.type,
      numero,
      serie: settings.serie ?? 1,
      sale_id: sale?.id ?? null,
      sale_number: sale?.number ?? null,
      customer_name: emitForm.customer_name!.trim(),
      customer_doc: emitForm.customer_doc ?? null,
      total: Number(emitForm.total),
      chave: genChave(),
      status: "autorizada",
      ambiente: settings.ambiente ?? "homologacao",
      notes: emitForm.notes ?? null,
    });

    // Atualiza o último número nas settings automaticamente
    settingsMut.mutate({ ultimo_numero: numero });
  };

  const downloadXML = (n: FiscalNote) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc>...</nfeProc>`;
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${n.type}-${n.numero}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    toast.info("XML simulado baixado");
  };

  const stats = useMemo(() => {
    const auth = notas.filter((n) => n.status === "autorizada");
    return {
      total: notas.length,
      autorizadas: auth.length,
      canceladas: notas.filter((n) => n.status === "cancelada").length,
      valorAuth: auth.reduce((s, n) => s + Number(n.total), 0),
    };
  }, [notas]);

  const [search, setSearch] = useState("");
  const filteredNotas = useMemo(
    () =>
      notas.filter(
        (n) =>
          matchSearch(n.customer_name, search) ||
          matchSearch(String(n.numero), search) ||
          matchSearch(n.type, search) ||
          matchSearch(n.status, search) ||
          matchSearch(n.customer_doc ?? "", search),
      ),
    [notas, search],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(filteredNotas.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNotas.slice(start, start + pageSize);
  }, [filteredNotas, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeading
          icon={FileText}
          title="Notas Fiscais"
          subtitle="Emissão simulada de NF-e e NFC-e."
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setCfgForm(settings);
              setCfgOpen(true);
            }}
          >
            <Settings className="size-4 mr-2" /> Configurações
          </Button>
          <Button className="bg-brand-red hover:bg-brand-red/90" onClick={() => setEmitOpen(true)}>
            <Plus className="size-4 mr-2" /> Emitir nota
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Emitidas</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-success">
          <div className="text-xs text-muted-foreground uppercase">Autorizadas</div>
          <div className="text-2xl font-bold">{stats.autorizadas}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-brand-red">
          <div className="text-xs text-muted-foreground uppercase">Canceladas</div>
          <div className="text-2xl font-bold">{stats.canceladas}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Valor total</div>
          <div className="text-2xl font-bold">{brl(stats.valorAuth)}</div>
        </Card>
      </div>

      <Card className="p-5 space-y-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setCurrentPage(1);
          }}
          placeholder="Pesquisar por destinatário, número, tipo ou status..."
        />
        <div className="hidden md:block rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma nota.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Badge variant="outline">{n.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {n.numero}/{n.serie}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs">{n.customer_name}</div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {brl(Number(n.total))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={n.status === "autorizada" ? "default" : "destructive"}>
                        {n.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => downloadXML(n)}>
                          <Download className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Excluir nota fiscal?",
                                description:
                                  "Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita.",
                                confirmLabel: "Excluir",
                              })
                            )
                              delMut.mutate(n.id);
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

      {/* Settings Dialog */}
      <Dialog open={cfgOpen} onOpenChange={setCfgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações Fiscais</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Razão Social</label>
              <Input
                value={cfgForm.razao_social ?? ""}
                onChange={(e) => setCfgForm({ ...cfgForm, razao_social: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase text-muted-foreground">CNPJ</label>
                <Input
                  value={cfgForm.cnpj ?? ""}
                  onChange={(e) => setCfgForm({ ...cfgForm, cnpj: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-muted-foreground">Ambiente</label>
                <Select
                  value={cfgForm.ambiente}
                  onValueChange={(v) => setCfgForm({ ...cfgForm, ambiente: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Homologação</SelectItem>
                    <SelectItem value="producao">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfgOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => settingsMut.mutate(cfgForm)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emit Dialog */}
      <Dialog open={emitOpen} onOpenChange={setEmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Emitir Nota</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-muted-foreground">Venda (opcional)</label>
              <Select
                value={emitForm.sale_id ?? "none"}
                onValueChange={(v) => {
                  if (v === "none") return setEmitForm({ ...emitForm, sale_id: undefined });
                  const s = sales.find((x) => x.id === v);
                  const c = partners.find((p) => p.id === s?.customer_id);
                  setEmitForm({
                    ...emitForm,
                    sale_id: v,
                    customer_name: c?.name || "Consumidor final",
                    total: Number(s?.total || 0),
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {sales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      #{s.number} - {brl(Number(s.total))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Destinatário</label>
              <Input
                value={emitForm.customer_name ?? ""}
                onChange={(e) => setEmitForm({ ...emitForm, customer_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Valor (R$)</label>
              <Input
                type="number"
                step="0.01"
                value={emitForm.total ?? ""}
                onChange={(e) => setEmitForm({ ...emitForm, total: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmitOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onEmit}>Emitir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
