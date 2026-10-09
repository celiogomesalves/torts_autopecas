import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Eye, FileText, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listNfceAttempts, fetchDanfePdf } from "@/lib/nfce.functions";
import { printPdfBase64 } from "@/lib/print-danfe";

type Attempt = {
  id: string;
  sale_id: string | null;
  ref: string | null;
  kind: string | null;
  http_status: number | null;
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  request_payload: unknown;
  response_body: unknown;
  created_at: string;
};

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os status" },
  { value: "autorizada", label: "Autorizada" },
  { value: "processando", label: "Processando" },
  { value: "erro", label: "Erro" },
  { value: "bloqueado", label: "Bloqueado (validação)" },
  { value: "erro_validacao_schema", label: "Erro validação schema" },
  { value: "rejeitada", label: "Rejeitada" },
];

export function FiscalNotesHistoryPanel({ companyId }: { companyId: string | null }) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [errorCode, setErrorCode] = useState("");
  const [saleId, setSaleId] = useState("");
  const [selected, setSelected] = useState<Attempt | null>(null);
  const list = useServerFn(listNfceAttempts);

  const q = useQuery({
    queryKey: ["nfce-attempts", companyId, statusFilter, errorCode, saleId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada");
      const rows = await list({
        data: {
          accessToken,
          companyId: companyId!,
          status: statusFilter === "all" ? null : statusFilter,
          errorCode: errorCode.trim() || null,
          saleId: saleId.trim() || null,
          limit: 200,
        },
      });
      return rows as Attempt[];
    },
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);


  const fetchDanfe = useServerFn(fetchDanfePdf);
  const [printingRef, setPrintingRef] = useState<string | null>(null);

  const reprint = async (ref?: string | null) => {
    if (!ref) {
      toast.error("Referência da NFC-e indisponível.");
      return;
    }
    try {
      setPrintingRef(ref);
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const r = await fetchDanfe({ data: { ref, accessToken: token } });
      if (!r?.pdfBase64) throw new Error("PDF do DANFE indisponível");
      printPdfBase64(r.pdfBase64);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao imprimir DANFE");
    } finally {
      setPrintingRef(null);
    }
  };

  const renderStatusBadge = (s: string | null) => {
    if (!s) return <Badge variant="outline">—</Badge>;
    const variant: "default" | "destructive" | "outline" | "secondary" =
      s === "autorizada"
        ? "default"
        : s === "processando"
        ? "secondary"
        : "destructive";
    return (
      <Badge variant={variant} className="font-mono text-[10px] uppercase">
        {s}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Histórico de Emissões NFC-e
            </CardTitle>
            <CardDescription>
              Auditoria de payload, resposta da Focus NFe e erros de schema por tentativa.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => q.refetch()}
            disabled={q.isFetching || !companyId}
          >
            {q.isFetching ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="size-4 mr-1" />
            )}
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Código do erro</Label>
            <Input
              placeholder="Ex.: 539, VALIDACAO_FRETE"
              value={errorCode}
              onChange={(e) => setErrorCode(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ID da venda</Label>
            <Input
              placeholder="UUID da venda (opcional)"
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
            />
          </div>
        </div>

        {!companyId ? (
          <p className="text-sm text-muted-foreground">Empresa não selecionada.</p>
        ) : q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma tentativa registrada com esses filtros.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Cód. erro</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Venda</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>{renderStatusBadge(r.status)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.http_status ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.error_code ?? "—"}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-xs" title={r.error_message ?? ""}>
                      {r.error_message ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">
                      {r.sale_id ? r.sale_id.slice(0, 8) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.ref && r.status === "autorizada" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Imprimir NFC-e (DANFE)"
                            onClick={() => reprint(r.ref)}
                            disabled={printingRef === r.ref}
                          >
                            {printingRef === r.ref ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Printer className="size-4 text-green-700" />
                            )}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" title="Ver detalhes" onClick={() => setSelected(r)}>
                          <Eye className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da tentativa</DialogTitle>
            <DialogDescription>
              {selected && (
                <span className="font-mono text-xs">
                  ref: {selected.ref ?? "—"} · {new Date(selected.created_at).toLocaleString("pt-BR")}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {renderStatusBadge(selected.status)}
                {selected.http_status != null && (
                  <Badge variant="outline" className="font-mono">HTTP {selected.http_status}</Badge>
                )}
                {selected.error_code && (
                  <Badge variant="destructive" className="font-mono">{selected.error_code}</Badge>
                )}
              </div>
              {selected.error_message && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive text-xs whitespace-pre-wrap">
                  {selected.error_message}
                </div>
              )}
              <div>
                <Label className="text-xs">Payload enviado</Label>
                <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px]">
{JSON.stringify(selected.request_payload, null, 2)}
                </pre>
              </div>
              <div>
                <Label className="text-xs">Resposta da Focus NFe</Label>
                <pre className="mt-1 max-h-64 overflow-auto rounded-md bg-muted p-2 text-[11px]">
{JSON.stringify(selected.response_body, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
