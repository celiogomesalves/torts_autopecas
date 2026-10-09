import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  consultNfce,
  cancelNfce,
  fetchDanfePdf,
  fetchNfceReceipt80mm,
  fetchNfceXml,
} from "@/lib/nfce.functions";
import { printNfceReceipt80mm, printPdfBase64 } from "@/lib/print-danfe";

function downloadBase64(b64: string, filename: string, mime: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileText, Download, Printer, RefreshCw, Ban, Search, Mail, Loader2 } from "lucide-react";
import { resendFiscalNoteEmail } from "@/lib/gmail.functions";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { cn, matchSearch } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";

type Note = {
  id: string;
  type: string;
  numero: number | null;
  serie: number | null;
  sale_id: string | null;
  sale_number: number | null;
  customer_name: string | null;
  customer_doc: string | null;
  total: number;
  chave: string | null;
  status: string;
  ambiente: string | null;
  emitted_at: string | null;
  ref: string | null;
  protocolo: string | null;
  qr_code_url: string | null;
  xml_url: string | null;
  danfce_url: string | null;
  motivo_rejeicao: string | null;
  motivo_cancelamento: string | null;
  cancelada_em: string | null;
};

export const Route = createFileRoute("/app/notas-fiscais")({
  component: NotasFiscaisPage,
});

const STATUS_CLS: Record<string, string> = {
  autorizada: "border-green-500 text-green-700",
  processando: "border-blue-500 text-blue-700",
  rejeitada: "border-destructive text-destructive",
  erro: "border-destructive text-destructive",
  cancelada: "border-muted-foreground/40 text-muted-foreground",
  rascunho: "border-muted-foreground/40 text-muted-foreground",
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function NotasFiscaisPage() {
  const confirm = useConfirm();
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId ?? "";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setToDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const notasQ = useQuery({
    queryKey: ["fiscal-notes-all", cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_notes")
        .select("*")
        .eq("company_id", cid)
        .order("emitted_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Note[];
    },
    enabled: !!cid,
  });

  const notas = notasQ.data ?? [];

  const filtered = useMemo(() => {
    return notas.filter((n) => {
      if (statusFilter !== "all" && n.status !== statusFilter) return false;
      if (typeFilter !== "all" && n.type.toLowerCase().replace(/[^a-z]/g, "") !== typeFilter)
        return false;
      if (from) {
        const d = n.emitted_at ? new Date(n.emitted_at) : null;
        if (!d || d < new Date(from + "T00:00:00")) return false;
      }
      if (to) {
        const d = n.emitted_at ? new Date(n.emitted_at) : null;
        if (!d || d > new Date(to + "T23:59:59")) return false;
      }
      if (search.trim()) {
        return (
          matchSearch(n.customer_name ?? "", search) ||
          matchSearch(String(n.numero ?? ""), search) ||
          matchSearch(String(n.sale_number ?? ""), search) ||
          matchSearch(n.chave ?? "", search) ||
          matchSearch(n.ref ?? "", search)
        );
      }
      return true;
    });
  }, [notas, search, statusFilter, typeFilter, from, to]);

  const stats = useMemo(() => {
    const auth = filtered.filter((n) => n.status === "autorizada");
    return {
      total: filtered.length,
      autorizadas: auth.length,
      canceladas: filtered.filter((n) => n.status === "cancelada").length,
      pendentes: filtered.filter((n) => ["processando", "rejeitada", "erro"].includes(n.status))
        .length,
      valor: auth.reduce((s, n) => s + Number(n.total ?? 0), 0),
    };
  }, [filtered]);

  const consult = useServerFn(consultNfce);
  const cancel = useServerFn(cancelNfce);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Sessão expirada");
    return t;
  };

  const consultMut = useMutation({
    mutationFn: async (ref: string) => consult({ data: { ref, accessToken: await getToken() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-notes-all", cid] });
      toast.success("Status atualizado");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao consultar"),
  });

  const [cancelOpen, setCancelOpen] = useState<Note | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const cancelMut = useMutation({
    mutationFn: async () => {
      if (!cancelOpen?.ref) throw new Error("Sem referência");
      if (cancelReason.trim().length < 15)
        throw new Error("Justificativa precisa ter ao menos 15 caracteres");
      return cancel({
        data: {
          ref: cancelOpen.ref,
          justificativa: cancelReason.trim(),
          accessToken: await getToken(),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-notes-all", cid] });
      toast.success("NFC-e cancelada");
      setCancelOpen(null);
      setCancelReason("");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar"),
  });

  const fetchReceipt = useServerFn(fetchNfceReceipt80mm);
  const fetchDanfe = useServerFn(fetchDanfePdf);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const reprint = async (n: Note) => {
    if (!n.ref) {
      toast.error("Referência da NFC-e indisponível.");
      return;
    }
    try {
      setPrintingId(n.id);
      const { data: s } = await supabase.auth.getSession();
      const accessToken = s.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");
      try {
        const receipt = await fetchReceipt({ data: { ref: n.ref, accessToken } });
        await printNfceReceipt80mm(receipt);
      } catch (receiptError) {
        console.warn("Falha ao montar cupom 80mm local, tentando PDF Focus", receiptError);
        const r = await fetchDanfe({ data: { ref: n.ref, accessToken } });
        if (!r?.pdfBase64) throw new Error("Cupom indisponível");
        await printPdfBase64(r.pdfBase64);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao imprimir cupom fiscal");
    } finally {
      setPrintingId(null);
    }
  };

  const resendEmail = useServerFn(resendFiscalNoteEmail);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [emailProgress, setEmailProgress] = useState(5);

  useEffect(() => {
    if (!emailingId) {
      setEmailProgress(5);
      return;
    }
    const timer = setInterval(() => {
      setEmailProgress((p) => (p >= 92 ? p : Math.min(92, p + Math.random() * 9 + 3)));
    }, 400);
    return () => clearInterval(timer);
  }, [emailingId]);

  const sendEmail = async (n: Note) => {
    if (!n.ref) {
      toast.error("Referência da NFC-e indisponível.");
      return;
    }
    const ok = await confirm({
      title: "Enviar nota fiscal por e-mail?",
      description: `Serão enviados o XML e o PDF da nota ${n.numero ? `nº ${n.numero}` : ""} aos e-mails da contabilidade configurados.`,
      confirmLabel: "Enviar",
      variant: "default",
    });
    if (!ok) return;

    setEmailingId(n.id);
    try {
      const r = await resendEmail({ data: { ref: n.ref } });
      if (r.sent) {
        toast.success(`E-mail enviado para: ${(r.recipients ?? []).join(", ")}`);
      } else {
        toast.error(r.reason ?? "Falha no envio");
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha no envio do e-mail");
    } finally {
      setEmailProgress(100);
      setTimeout(() => setEmailingId(null), 350);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        icon={FileText}
        title="Histórico de Notas Fiscais"
        subtitle="NFC-e emitidas — reimpressão, XML, DANFE e atualização de status."
      />

      <Dialog
        open={!!emailingId}
        onOpenChange={(open) => {
          if (!open) return;
        }}
      >
        <DialogContent className="sm:max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Enviando nota por e-mail
            </DialogTitle>
            <DialogDescription>
              Localizando XML/PDF, anexando arquivos e enviando aos destinatários…
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Progress value={emailProgress} className="h-2" />
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              {Math.round(emailProgress)}%
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid sm:grid-cols-5 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Total</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-green-500">
          <div className="text-xs text-muted-foreground uppercase">Autorizadas</div>
          <div className="text-2xl font-bold">{stats.autorizadas}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500">
          <div className="text-xs text-muted-foreground uppercase">Pendentes</div>
          <div className="text-2xl font-bold">{stats.pendentes}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-muted-foreground/40">
          <div className="text-xs text-muted-foreground uppercase">Canceladas</div>
          <div className="text-2xl font-bold">{stats.canceladas}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Valor autorizado</div>
          <div className="text-2xl font-bold">{brl(stats.valor)}</div>
        </Card>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-[1_1_220px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente, nº NFC-e, nº venda, chave ou ref"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="min-w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="autorizada">Autorizadas</SelectItem>
              <SelectItem value="processando">Processando</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
              <SelectItem value="erro">Erro</SelectItem>
              <SelectItem value="cancelada">Canceladas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="min-w-[140px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="nfce">NFC-e</SelectItem>
              <SelectItem value="nfe">NF-e</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex min-w-0 items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="De"
              className="w-[150px]"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="Até"
              className="w-[150px]"
            />
          </div>
        </div>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Emitida em</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nº / Série</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amb.</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notasQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhuma nota encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((n) => {
                  const cls = STATUS_CLS[n.status] ?? "";
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDateTime(n.emitted_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{(n.type || "").toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {n.numero ?? "—"}/{n.serie ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {n.sale_number ? `#${n.sale_number}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">
                        {n.customer_name || "Consumidor"}
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        {brl(Number(n.total ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn(cls)}>
                          {n.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {n.ambiente === "producao" ? "PROD" : "HOMOL"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Imprimir cupom"
                            disabled={n.status !== "autorizada" || printingId === n.id}
                            onClick={() => reprint(n)}
                          >
                            <Printer className="size-4" />
                          </Button>
                          {n.ref && n.status === "autorizada" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Baixar XML"
                              onClick={async () => {
                                try {
                                  const res = await fetchNfceXml({
                                    data: { ref: n.ref!, accessToken: await getToken() },
                                  });
                                  downloadBase64(res.xmlBase64, res.filename, "application/xml");
                                } catch (e) {
                                  toast.error((e as Error).message || "Falha ao baixar XML");
                                }
                              }}
                            >
                              <Download className="size-4" />
                            </Button>
                          )}
                          {n.ref && n.status === "autorizada" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Enviar XML e PDF por e-mail para a contabilidade"
                              disabled={emailingId === n.id}
                              onClick={() => sendEmail(n)}
                            >
                              {emailingId === n.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Mail className="size-4" />
                              )}
                            </Button>
                          )}
                          {n.ref &&
                            (n.status === "processando" ||
                              n.status === "autorizada" ||
                              n.status === "rejeitada") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Atualizar status"
                                disabled={consultMut.isPending}
                                onClick={() => consultMut.mutate(n.ref!)}
                              >
                                <RefreshCw className="size-4" />
                              </Button>
                            )}
                          {n.status === "autorizada" && n.ref && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Cancelar NFC-e"
                              onClick={() => {
                                setCancelOpen(n);
                                setCancelReason("");
                              }}
                            >
                              <Ban className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          Mostrando até 500 registros mais recentes. Use os filtros para refinar.
        </p>
      </Card>

      <Dialog open={!!cancelOpen} onOpenChange={(o) => !o && setCancelOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar NFC-e</DialogTitle>
            <DialogDescription>
              {cancelOpen
                ? `Nota ${cancelOpen.numero}/${cancelOpen.serie} — ${cancelOpen.customer_name ?? "Consumidor"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Justificativa (mín. 15 caracteres)</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Motivo do cancelamento exigido pela SEFAZ"
            />
            <p className="text-xs text-muted-foreground">
              O cancelamento só é aceito pela SEFAZ em até 30 minutos após a autorização.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMut.isPending}
              onClick={() => cancelMut.mutate()}
            >
              {cancelMut.isPending ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
