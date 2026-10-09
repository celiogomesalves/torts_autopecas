import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Loader2, RefreshCw, Ban, ExternalLink, Printer, Download, Cloud, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  emitNfce,
  consultNfce,
  cancelNfce,
  fetchDanfePdf,
  fetchNfceReceipt80mm,
  fetchNfceXml,
} from "@/lib/nfce.functions";
import { uploadFiscalNoteToDrive } from "@/lib/google-drive.functions";
import { printNfceReceipt80mm, printPdfBase64 } from "@/lib/print-danfe";
import { cn } from "@/lib/utils";

export function NfceButton({ saleId }: { saleId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [printing, setPrinting] = useState(false);

  const noteQ = useQuery({
    queryKey: ["fiscal-note-by-sale", saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_notes")
        .select("*")
        .eq("sale_id", saleId)
        .in("type", ["NFC-e", "nfce"])
        .order("emitted_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;

      const { data: attempt, error: attemptError } = await supabase
        .from("fiscal_note_attempts" as never)
        .select("sale_id, ref, status, response_body, created_at")
        .eq("sale_id", saleId)
        .eq("status", "autorizada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (attemptError) throw attemptError;
      const a = attempt as any;
      const body = (a?.response_body ?? {}) as Record<string, unknown>;
      const danfePath = typeof body.caminho_danfe === "string" ? body.caminho_danfe : null;
      const xmlPath = typeof body.caminho_xml_nota_fiscal === "string" ? body.caminho_xml_nota_fiscal : null;
      return a
        ? {
            sale_id: a.sale_id,
            ref: a.ref,
            status: "autorizada",
            type: "NFC-e",
            ambiente: null,
            numero: typeof body.numero === "number" ? body.numero : null,
            serie: typeof body.serie === "number" ? body.serie : null,
            chave: typeof body.chave_nfe === "string" ? body.chave_nfe : null,
            protocolo: typeof body.protocolo === "string" ? body.protocolo : null,
            motivo_rejeicao: null,
            qr_code_url:
              typeof body.qrcode === "string"
                ? body.qrcode
                : typeof body.qrcode_url === "string"
                  ? body.qrcode_url
                  : typeof body.url_consulta_nf === "string"
                    ? body.url_consulta_nf
                    : null,
            xml_url: xmlPath ? `https://focusnfe.com.br${xmlPath}` : null,
            danfce_url: danfePath ? `https://focusnfe.com.br${danfePath}` : null,
            emitted_at: a.created_at,
          }
        : null;
    },
  });

  const saleCompanyQ = useQuery({
    queryKey: ["sale-company", saleId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("company_id")
        .eq("id", saleId)
        .maybeSingle();
      return data?.company_id ?? null;
    },
  });

  const fiscalSettingsQ = useQuery({
    queryKey: ["fiscal-settings-nfce-button", saleCompanyQ.data],
    queryFn: async () => {
      if (!saleCompanyQ.data) return null;
      const { data } = await supabase
        .from("fiscal_settings")
        .select("ambiente, auto_print_nfce")
        .eq("company_id", saleCompanyQ.data)
        .maybeSingle();
      return (data as any) ?? null;
    },
    enabled: !!saleCompanyQ.data,
  });
  const ambiente = fiscalSettingsQ.data?.ambiente as string | undefined;
  const autoPrintNfce = !!fiscalSettingsQ.data?.auto_print_nfce;

  const emit = useServerFn(emitNfce);
  const consult = useServerFn(consultNfce);
  const cancel = useServerFn(cancelNfce);
  const fetchDanfe = useServerFn(fetchDanfePdf);
  const fetchReceipt = useServerFn(fetchNfceReceipt80mm);
  const uploadDrive = useServerFn(uploadFiscalNoteToDrive);

  const uploadDriveMut = useMutation({
    mutationFn: async () => {
      const id = (noteQ.data as any)?.id as string | undefined;
      if (!id) throw new Error("Nota sem ID (emita pelo botão para gerar registro completo)");
      return uploadDrive({ data: { fiscalNoteId: id } });
    },
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Enviado ao Google Drive");
      else if (r?.skipped) toast.info(r.skipped);
      else toast.error(r?.error || "Falha ao enviar ao Drive");
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao enviar ao Drive"),
  });

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Faça login novamente para emitir NFC-e.");
    return token;
  };

  const printDirect = async (ref?: string | null) => {
    if (!ref) {
      toast.error("Referência da NFC-e indisponível.");
      return;
    }
    try {
      setPrinting(true);
      const accessToken = await getAccessToken();
      try {
        const receipt = await fetchReceipt({ data: { ref, accessToken } });
        await printNfceReceipt80mm(receipt);
      } catch (receiptError) {
        console.warn("Falha ao montar cupom 80mm local, tentando PDF Focus", receiptError);
        const r = await fetchDanfe({ data: { ref, accessToken } });
        if (!r?.pdfBase64) throw new Error("Cupom/DANFE indisponível");
        await printPdfBase64(r.pdfBase64);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao imprimir cupom fiscal");
    } finally {
      setPrinting(false);
    }
  };

  const emitMut = useMutation({
    mutationFn: async () => {
      if (fiscalSettingsQ.isLoading || !saleCompanyQ.data) {
        throw new Error("Aguarde o carregamento das configurações fiscais antes de emitir.");
      }
      const expectedAmbiente = ambiente;
      if (!expectedAmbiente) {
        throw new Error("Ambiente não definido em Configurações Fiscais. Configure antes de emitir.");
      }
      return emit({ data: { saleId, accessToken: await getAccessToken(), expectedAmbiente } });
    },
    onSuccess: async (r: any) => {
      qc.invalidateQueries({ queryKey: ["fiscal-note-by-sale", saleId] });
      qc.invalidateQueries({ queryKey: ["sales-active-fiscal-notes"] });
      qc.invalidateQueries({ queryKey: ["current-session-fiscal-notes"] });
      qc.invalidateQueries({ queryKey: ["fiscal-notes-danfe-map"] });
      qc.invalidateQueries({ queryKey: ["nfce-attempts"] });
      if (r.status === "autorizada") {
        toast.success(`NFC-e autorizada${r.protocolo ? ` (prot. ${r.protocolo})` : ""}`);
        setOpen(false);
        // Só tenta imprimir se a preferência "Emitir cupom automaticamente" estiver habilitada.
        const cid = saleCompanyQ.data;
        const autoPrint =
          !!cid && typeof window !== "undefined" &&
          localStorage.getItem(`auto_print_coupon_${cid}`) === "true";
        if (autoPrint) {
          if (r.ref) {
            await printDirect(r.ref);
          } else if (r.danfce_url) {
            const w = window.open(r.danfce_url, "_blank");
            if (!w) toast.info("Permita pop-ups para abrir o cupom para impressão.");
          }
        }
      } else if (r.status === "processando") {
        toast.info("NFC-e em processamento na SEFAZ");
        setOpen(false);
      } else {
        toast.error(`Falha: ${r.motivo_rejeicao || r.status || "erro"}`);
      }
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao emitir NFC-e"),
  });


  const consultMut = useMutation({
    mutationFn: async () => {
      if (!noteQ.data?.ref) throw new Error("Sem referência da nota");
      return consult({ data: { ref: noteQ.data.ref, accessToken: await getAccessToken() } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fiscal-note-by-sale", saleId] });
      qc.invalidateQueries({ queryKey: ["sales-active-fiscal-notes"] });
      qc.invalidateQueries({ queryKey: ["current-session-fiscal-notes"] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao consultar"),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      if (!noteQ.data?.ref) throw new Error("Sem referência");
      if (!confirmCancel) throw new Error("Marque a confirmação para cancelar a NFC-e");
      if (cancelReason.trim().length < 15)
        throw new Error("Justificativa deve ter no mínimo 15 caracteres");
      return cancel({
        data: {
          ref: noteQ.data.ref,
          justificativa: cancelReason.trim(),
          accessToken: await getAccessToken(),
        },
      });
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["fiscal-note-by-sale", saleId] });
      qc.invalidateQueries({ queryKey: ["sales-active-fiscal-notes"] });
      qc.invalidateQueries({ queryKey: ["current-session-fiscal-notes"] });
      if (r.ok) {
        toast.success("NFC-e cancelada");
        setCancelReason("");
        setConfirmCancel(false);
      } else toast.error("Falha ao cancelar");
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao cancelar"),
  });

  const note = noteQ.data;
  const status = note?.status as string | undefined;

  const isAuthorized = status === "autorizada";

  const label =
    printing && isAuthorized ? "Processando..." :
    emitMut.isPending ? "Emitindo..." :
    !status ? "Emitir NFC-e" :
    isAuthorized ? "Imprimir NFC-e" :
    status === "cancelada" ? "NFC-e cancelada" :
    status === "processando" ? "NFC-e processando" :
    "NFC-e: erro";

  const colorCls =
    isAuthorized
      ? "border-green-500 text-green-700 hover:bg-green-50"
      : status === "cancelada"
      ? "border-muted-foreground/30 text-muted-foreground"
      : status === "processando"
      ? "border-blue-500 text-blue-700 hover:bg-blue-50"
      : !status
      ? ""
      : "border-destructive text-destructive hover:bg-destructive/10";

  const handlePrimaryClick = () => {
    if (isAuthorized && note?.ref) {
      printDirect(note.ref);
      return;
    }
    // Auto-emissão: dispara direto sem abrir modal
    const canAutoEmit =
      !status || status === "rejeitada" || status === "erro";
    if (autoPrintNfce && canAutoEmit && !emitMut.isPending) {
      emitMut.mutate();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className={cn("h-8 w-8", !isAuthorized && colorCls)}
          onClick={handlePrimaryClick}
          disabled={printing || emitMut.isPending}
          title={isAuthorized ? "Imprimir cupom (DANFE)" : "Emitir NFC-e"}
        >
          {printing || emitMut.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isAuthorized ? (
            <Printer className="size-4" />
          ) : (
            <FileText className="size-4" />
          )}
        </Button>
        {isAuthorized && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-green-700 hover:text-green-800 hover:bg-green-50"
            onClick={() => setOpen(true)}
            title="Detalhes da NFC-e emitida"
          >
            <ReceiptText className="size-4" />
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>NFC-e da venda</DialogTitle>
            <DialogDescription>
              {(() => {
                const amb = note?.ambiente ?? ambiente;
                return amb === "producao"
                  ? "Ambiente: PRODUÇÃO"
                  : amb === "homologacao"
                  ? "Ambiente: HOMOLOGAÇÃO (sem valor fiscal)"
                  : "Carregando ambiente...";
              })()}
            </DialogDescription>

          </DialogHeader>

          {!note ? (
            <div className="text-sm text-muted-foreground">
              Nenhuma NFC-e emitida ainda para esta venda.
            </div>
          ) : status === "autorizada" ? (
            <div className="rounded-md border border-green-500/40 bg-green-50 dark:bg-green-950/30 p-3 text-sm space-y-2">
              <p className="font-medium text-green-800 dark:text-green-300">
                ✅ Esta venda já tem NFC-e autorizada.
              </p>
              <p className="text-green-900/80 dark:text-green-200/80">
                Reemissão está bloqueada para evitar duplicidade. Para imprimir novamente
            o cupom fiscal, use o botão <strong>Imprimir cupom</strong> abaixo (também é
                possível compartilhar o link de consulta na SEFAZ).
              </p>
            </div>
          ) : status === "processando" ? (
            <div className="rounded-md border border-blue-500/40 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-900 dark:text-blue-200">
              ⏳ NFC-e em processamento na SEFAZ. Clique em <strong>Atualizar</strong> para
              consultar o status antes de tentar reemitir.
            </div>
          ) : null}

          {note && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">Status:</span>
                <Badge variant="outline" className={colorCls}>{status}</Badge>
              </div>
              {note.numero && (
                <div>
                  <span className="font-medium">Número/Série:</span> {note.numero} / {note.serie}
                </div>
              )}
              {note.chave && (
                <div className="break-all">
                  <span className="font-medium">Chave:</span> <span className="font-mono text-xs">{note.chave}</span>
                </div>
              )}
              {note.protocolo && (
                <div>
                  <span className="font-medium">Protocolo:</span> {note.protocolo}
                </div>
              )}
              {note.motivo_rejeicao && (
                <div className="text-destructive">
                  <span className="font-medium">Motivo:</span> {note.motivo_rejeicao}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                {note.ref && note.status === "autorizada" && (
                  <Button
                    size="sm"
                    onClick={() => printDirect(note.ref)}
                    disabled={printing}
                  >
                    {printing ? (
                      <Loader2 className="size-4 mr-1 animate-spin" />
                    ) : (
                      <Printer className="size-4 mr-1" />
                    )}
                    Imprimir cupom 80mm
                  </Button>
                )}
                {note.ref && note.status === "autorizada" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const accessToken = await getAccessToken();
                        const res = await fetchNfceXml({ data: { ref: note.ref!, accessToken } });
                        const bin = atob(res.xmlBase64);
                        const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                        const url = URL.createObjectURL(new Blob([bytes], { type: "application/xml" }));
                        const a = document.createElement("a");
                        a.href = url; a.download = res.filename;
                        document.body.appendChild(a); a.click(); a.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      } catch (e) {
                        toast.error((e as Error).message || "Falha ao baixar XML");
                      }
                    }}
                  >
                    <Download className="size-4 mr-1" />XML
                  </Button>
                )}
                {note.qr_code_url && (
                  <a href={note.qr_code_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline"><ExternalLink className="size-4 mr-1" />Consultar SEFAZ</Button>
                  </a>
                )}
                {note.status === "autorizada" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => uploadDriveMut.mutate()}
                    disabled={uploadDriveMut.isPending}
                    title="Enviar PDF + XML para o Google Drive"
                  >
                    {uploadDriveMut.isPending ? (
                      <Loader2 className="size-4 mr-1 animate-spin" />
                    ) : (
                      <Cloud className="size-4 mr-1" />
                    )}
                    Enviar ao Drive
                  </Button>
                )}
              </div>
            </div>
          )}

          {status === "autorizada" && (
            <div className="space-y-2 pt-2 border-t">
              <Label>Cancelar NFC-e (mín. 15 caracteres)</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Justificativa do cancelamento (motivo detalhado)"
                rows={2}
              />
              <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  checked={confirmCancel}
                  onCheckedChange={(v) => setConfirmCancel(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Confirmo que desejo cancelar esta NFC-e. Esta ação é
                  <strong> irreversível</strong> e será registrada na SEFAZ.
                </span>
              </label>
            </div>
          )}

          <DialogFooter className="gap-2">
            {(!note ||
              (status !== "autorizada" &&
                status !== "processando" &&
                status !== "cancelada")) && (
              <Button onClick={() => emitMut.mutate()} disabled={emitMut.isPending}>
                {emitMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
                {note ? "Tentar emitir novamente" : "Emitir"}
              </Button>
            )}

            {note && (status === "processando" || status === "autorizada" || status === "rejeitada") && (
              <Button variant="outline" onClick={() => consultMut.mutate()} disabled={consultMut.isPending}>
                {consultMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
                Atualizar
              </Button>
            )}
            {status === "autorizada" && (
              <Button
                variant="destructive"
                onClick={() => cancelMut.mutate()}
                disabled={
                  cancelMut.isPending ||
                  !confirmCancel ||
                  cancelReason.trim().length < 15
                }
              >
                {cancelMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Ban className="size-4 mr-1" />}
                Cancelar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
