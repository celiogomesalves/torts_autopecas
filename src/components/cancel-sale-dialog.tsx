import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { brl } from "@/lib/format";
import { maskCpfCnpj } from "@/lib/masks";
import { cancelSaleWithCredit, type CancelMode } from "@/lib/customer-credits";
import { cancelNfce, consultNfce } from "@/lib/nfce.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  SaleProgressDialog,
  type ProgressStep,
} from "@/components/sale-progress-dialog";
import { toast } from "sonner";
import { Loader2, CreditCard, Undo2, ReceiptText, AlertTriangle } from "lucide-react";
import { ReturnSaleDialog } from "@/components/return-sale-dialog";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20; // ~1 min

function isTemporaryError(httpStatus?: number, message?: string) {
  if (httpStatus && (httpStatus >= 500 || httpStatus === 408 || httpStatus === 429)) return true;
  const s = (message || "").toLowerCase();
  return /network|timeout|fetch|indispon|temporar|econn|failed to fetch|socket|abort/.test(s);
}

function isProcessingStatus(status?: string | null) {
  const s = (status || "").toLowerCase();
  return s.includes("processando") || s === "em_processamento" || s === "processing";
}

/** Detecta rejeições da SEFAZ por prazo expirado de cancelamento (>30 min NFC-e). */
function isOutOfCancelWindow(code?: string | null, msg?: string | null) {
  const c = (code || "").trim();
  if (c === "218" || c === "501") return true;
  const m = (msg || "").toLowerCase();
  return (
    m.includes("fora do prazo") ||
    m.includes("prazo") && (m.includes("cancel") || m.includes("expir")) ||
    m.includes("tempo") && m.includes("cancel")
  );
}


interface CancelSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: {
    id: string;
    number?: number | string | null;
    total: number;
    customer_id?: string | null;
    customer_name?: string | null;
    customer_doc?: string | null;
  } | null;
  onSuccess?: () => void;
}

type FiscalNote = {
  ref: string | null;
  status: string | null;
  numero: number | null;
  serie: number | null;
  chave: string | null;
  ambiente: string | null;
} | null;

export function CancelSaleDialog({ open, onOpenChange, sale, onSuccess }: CancelSaleDialogProps) {
  const [mode, setMode] = useState<CancelMode>("refund");
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [progressOpen, setProgressOpen] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  // Snapshot da venda para manter o modal de progresso funcionando mesmo se
  // o pai zerar `sale` (via onOpenChange/onSuccess) durante o fluxo async.
  const [flowSale, setFlowSale] = useState<CancelSaleDialogProps["sale"]>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const activeSale = sale ?? flowSale;
  const runCancelNfce = useServerFn(cancelNfce);
  const runConsultNfce = useServerFn(consultNfce);

  const openReturnFlow = () => {
    // Fecha progresso/confirmação e abre o dialog de devolução.
    setProgressOpen(false);
    setSteps([]);
    setReturnDialogOpen(true);
  };


  useEffect(() => {
    if (open && sale) {
      setMode("refund");
      setReason("");
      setName(sale.customer_name ?? "");
      setCpf(sale.customer_doc ? maskCpfCnpj(sale.customer_doc) : "");
    }
  }, [open, sale]);


  const noteQ = useQuery({
    queryKey: ["cancel-sale-fiscal-note", sale?.id],
    enabled: !!sale?.id && open,
    queryFn: async (): Promise<FiscalNote> => {
      const { data } = await supabase
        .from("fiscal_notes")
        .select("ref, status, numero, serie, chave, ambiente")
        .eq("sale_id", sale!.id)
        .in("status", ["autorizada", "processando", "cancelada"])
        .order("emitted_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  const note = noteQ.data ?? null;
  const noteStatus = note?.status ?? null;
  const hasAuthorizedNote = noteStatus === "autorizada";
  const noteIsProcessing = noteStatus === "processando";
  const noteAlreadyCancelled = noteStatus === "cancelada";

  const minReasonChars = hasAuthorizedNote ? 15 : 3;

  const updateStep = (id: string, patch: Partial<ProgressStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const upsertStep = (step: ProgressStep) => {
    setSteps((prev) => {
      const i = prev.findIndex((s) => s.id === step.id);
      if (i === -1) return [...prev, step];
      const next = [...prev];
      next[i] = { ...next[i], ...step };
      return next;
    });
  };

  const getAccessToken = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");
    return token;
  };

  /** Executa o cancelamento fiscal. Retorna 'done' | 'processing' | 'stop' (erro tratado no passo). */
  const runNfceStep = async (): Promise<"done" | "processing" | "stop"> => {
    updateStep("nfce", {
      status: "running",
      detail: "Enviando pedido de cancelamento à SEFAZ...",
      actions: undefined,
    });
    try {
      const accessToken = await getAccessToken();
      if (!note?.ref) throw new Error("Nota sem referência (ref).");
      const r: any = await runCancelNfce({
        data: { ref: note.ref, justificativa: reason.trim(), accessToken },
      });
      if (r?.ok) {
        updateStep("nfce", { status: "done", detail: "NFC-e cancelada na SEFAZ." });
        return "done";
      }
      // Não OK: pode ser processamento assíncrono, temporário ou permanente
      const httpStatus: number | undefined = r?.httpStatus;
      const focusStatus: string | undefined = r?.status;
      const raw = r?.raw ?? {};
      // Log completo pra debug (aparece no console do navegador)
      console.error("[cancelNfce] rejeitado", { httpStatus, focusStatus, raw });
      const firstErr = Array.isArray(raw?.erros) ? raw.erros[0] : null;
      const sefazCode =
        raw?.status_sefaz || raw?.codigo_sefaz || raw?.cStat || firstErr?.codigo || null;
      const sefazMsg =
        raw?.mensagem_sefaz ||
        raw?.mensagem ||
        raw?.erro ||
        raw?.motivo ||
        firstErr?.mensagem ||
        firstErr?.erro ||
        null;
      const msg: string = sefazMsg
        ? `${sefazMsg}${sefazCode ? ` (cod. ${sefazCode})` : ""}`
        : focusStatus === "erro_cancelamento"
        ? "cancelamento recusado pela SEFAZ (sem mensagem detalhada retornada pela Focus NFe)."
        : focusStatus || "SEFAZ não confirmou o cancelamento.";


      if (isProcessingStatus(focusStatus) || httpStatus === 202) {
        updateStep("nfce", {
          status: "done",
          detail: "Pedido aceito pela SEFAZ. Aguardando confirmação...",
        });
        return "processing";
      }
      if (isTemporaryError(httpStatus, msg)) {
        updateStep("nfce", {
          status: "error",
          detail: `Falha temporária na SEFAZ/Focus NFe: ${msg}. A venda NÃO foi cancelada.`,
          actions: [
            { label: "Tentar novamente", onClick: () => void retryFromNfce(), variant: "default" },
          ],
        });
        updateStep("sale", { status: "skipped", detail: "Aguardando cancelamento fiscal." });
        return "stop";
      }
      const outOfWindow = isOutOfCancelWindow(sefazCode, `${sefazMsg ?? ""} ${focusStatus ?? ""}`);
      updateStep("nfce", {
        status: "error",
        detail: outOfWindow
          ? `Prazo de cancelamento da NFC-e expirado (>30 min). Não é mais possível cancelar na SEFAZ — emita uma NFC-e de devolução para estornar. Detalhe: ${msg}`
          : `SEFAZ rejeitou o cancelamento: ${msg}. A venda NÃO foi cancelada.`,
        actions: outOfWindow
          ? [
              {
                label: "Emitir NFC-e de devolução",
                onClick: () => openReturnFlow(),
                variant: "default",
              },
            ]
          : [
              { label: "Tentar novamente", onClick: () => void retryFromNfce(), variant: "outline" },
            ],
      });
      updateStep("sale", {
        status: "skipped",
        detail: outOfWindow ? "Cancelamento fiscal indisponível — use devolução." : "Aguardando cancelamento fiscal.",
      });
      return "stop";

    } catch (e: any) {
      const msg = e?.message || "falha ao cancelar NFC-e";
      updateStep("nfce", {
        status: "error",
        detail: `Erro: ${msg}. A venda NÃO foi cancelada.`,
        actions: [
          { label: "Tentar novamente", onClick: () => void retryFromNfce(), variant: "default" },
        ],
      });
      updateStep("sale", { status: "skipped", detail: "Aguardando cancelamento fiscal." });
      return "stop";
    }
  };

  /** Polling do status na SEFAZ até confirmar 'cancelada'. */
  const runPollStep = async (): Promise<"done" | "stop"> => {
    upsertStep({
      id: "poll",
      label: "Confirmando cancelamento na SEFAZ",
      status: "running",
      detail: "Consultando SEFAZ...",
      actions: undefined,
    });
    if (!note?.ref) {
      updateStep("poll", { status: "error", detail: "Nota sem referência (ref)." });
      updateStep("sale", { status: "skipped", detail: "Aguardando cancelamento fiscal." });
      return "stop";
    }
    let attempt = 0;
    while (attempt < POLL_MAX_ATTEMPTS) {
      attempt++;
      updateStep("poll", {
        status: "running",
        detail: `Consultando SEFAZ (tentativa ${attempt}/${POLL_MAX_ATTEMPTS})...`,
        progress: Math.min(95, Math.round((attempt / POLL_MAX_ATTEMPTS) * 100)),
      });
      try {
        const accessToken = await getAccessToken();
        const r: any = await runConsultNfce({ data: { ref: note.ref, accessToken } });
        const status = (r?.status || "").toLowerCase();
        if (status === "cancelada") {
          updateStep("poll", { status: "done", detail: "SEFAZ confirmou o cancelamento.", progress: 100 });
          return "done";
        }
        if (status === "autorizada") {
          updateStep("poll", {
            status: "error",
            detail: "SEFAZ ainda indica nota AUTORIZADA. Tente reenviar o cancelamento.",
            actions: [
              { label: "Reenviar cancelamento", onClick: () => void retryFromNfce(), variant: "default" },
            ],
          });
          updateStep("sale", { status: "skipped", detail: "Aguardando cancelamento fiscal." });
          return "stop";
        }
        // continua polling se ainda processando
      } catch (e: any) {
        const msg = e?.message || "falha ao consultar SEFAZ";
        if (!isTemporaryError(undefined, msg)) {
          updateStep("poll", {
            status: "error",
            detail: `Erro ao consultar SEFAZ: ${msg}.`,
            actions: [
              { label: "Tentar novamente", onClick: () => void retryFromPoll(), variant: "default" },
            ],
          });
          updateStep("sale", { status: "skipped", detail: "Aguardando cancelamento fiscal." });
          return "stop";
        }
        // temporário → continua tentando
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    updateStep("poll", {
      status: "error",
      detail: `SEFAZ não confirmou o cancelamento após ${POLL_MAX_ATTEMPTS} tentativas.`,
      actions: [
        { label: "Continuar aguardando", onClick: () => void retryFromPoll(), variant: "default" },
        { label: "Reenviar cancelamento", onClick: () => void retryFromNfce(), variant: "outline" },
      ],
    });
    updateStep("sale", { status: "skipped", detail: "Aguardando cancelamento fiscal." });
    return "stop";
  };

  const runSaleStep = async (): Promise<"done" | "stop"> => {
    const s = activeSale;
    if (!s) return "stop";
    updateStep("sale", {
      status: "running",
      detail: "Estornando estoque e financeiro...",
      actions: undefined,
    });
    try {
      const res = await cancelSaleWithCredit({
        saleId: s.id,
        reason: reason.trim(),
        mode,
        partnerId: s.customer_id ?? null,
        name: mode === "credit" ? name.trim() : undefined,
        cpf: mode === "credit" ? cpf.replace(/\D/g, "") : undefined,
      });
      updateStep("sale", {
        status: "done",
        detail:
          mode === "credit"
            ? `Venda cancelada. Crédito de ${brl(res.amount)} adicionado ao cliente.`
            : "Venda cancelada e estoque restaurado.",
      });
      toast.success(
        mode === "credit"
          ? `Venda cancelada. Crédito de ${brl(res.amount)} gerado.`
          : "Venda cancelada com sucesso.",
      );
      onSuccess?.();
      return "done";
    } catch (e: any) {
      const msg = e?.message || "Falha ao cancelar venda";
      updateStep("sale", {
        status: "error",
        detail: `${msg}${
          hasAuthorizedNote
            ? " — a NFC-e já foi cancelada na SEFAZ; contate o suporte se persistir."
            : ""
        }`,
        actions: [
          { label: "Tentar novamente", onClick: () => void retryFromSale(), variant: "default" },
        ],
      });
      return "stop";
    }
  };


  const retryFromNfce = async () => {
    if (!hasAuthorizedNote) return retryFromSale();
    const r = await runNfceStep();
    if (r === "processing") {
      const p = await runPollStep();
      if (p !== "done") return;
    } else if (r !== "done") return;
    await runSaleStep();
  };

  const retryFromPoll = async () => {
    const p = await runPollStep();
    if (p !== "done") return;
    await runSaleStep();
  };

  const retryFromSale = async () => {
    await runSaleStep();
  };

  const runFlow = async () => {
    if (!sale) return;
    setFlowSale(sale);
    const initialSteps: ProgressStep[] = [];
    if (hasAuthorizedNote) {
      initialSteps.push({
        id: "nfce",
        label: `Cancelar NFC-e nº ${note?.numero ?? "?"}/${note?.serie ?? "?"} na SEFAZ`,
        status: "pending",
      });
    }
    initialSteps.push({
      id: "sale",
      label:
        mode === "credit"
          ? "Cancelar venda, devolver estoque e gerar crédito"
          : "Cancelar venda e devolver estoque",
      status: "pending",
    });
    setSteps(initialSteps);
    setProgressOpen(true);
    await retryFromNfce();
  };

  const validate = (): string | null => {
    if (!sale) return "Venda inválida";
    if (noteIsProcessing) {
      return 'A NFC-e está em "processando" na SEFAZ. Atualize o status da nota antes de cancelar a venda.';
    }
    if (reason.trim().length < minReasonChars) {
      return `Informe o motivo (mín. ${minReasonChars} caracteres${
        hasAuthorizedNote ? " — exigência da SEFAZ" : ""
      }).`;
    }
    if (mode === "credit") {
      if (name.trim().length < 2) return "Informe o nome do cliente.";
      const digits = cpf.replace(/\D/g, "");
      if (digits.length !== 11 && digits.length !== 14) return "CPF/CNPJ inválido.";
    }
    return null;
  };

  const confirmMut = useMutation({
    mutationFn: async () => {
      const err = validate();
      if (err) throw new Error(err);
      // Não fechamos o Dialog de confirmação aqui — isso desmontaria o
      // SaleProgressDialog (que é filho). Ele é ocultado visualmente enquanto
      // `progressOpen` estiver ativo (ver open={open && !progressOpen} abaixo).
      await runFlow();
    },
    onError: (e: any) => toast.error(e.message || "Não foi possível iniciar o cancelamento"),
  });

  const disableConfirm = noteIsProcessing || noteQ.isLoading || confirmMut.isPending;

  const closeProgress = () => {
    setProgressOpen(false);
    setSteps([]);
    setFlowSale(null);
    onOpenChange(false);
  };

  const confirmLabel = useMemo(() => {
    if (hasAuthorizedNote) return "Cancelar NFC-e e a venda";
    return mode === "credit" ? "Cancelar e gerar crédito" : "Cancelar venda";
  }, [hasAuthorizedNote, mode]);

  if (!activeSale) return null;


  const s = activeSale;

  return (
    <>
      <Dialog open={open && !progressOpen} onOpenChange={(o) => !confirmMut.isPending && onOpenChange(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar venda{s.number ? ` #${s.number}` : ""}</DialogTitle>
            <DialogDescription>
              Total: <strong>{brl(s.total)}</strong>. Escolha como tratar o valor.
            </DialogDescription>
          </DialogHeader>


          <div className="space-y-4">
            {noteQ.isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Verificando nota fiscal...
              </div>
            ) : hasAuthorizedNote ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                  <ReceiptText className="size-4" /> NFC-e autorizada vinculada
                </div>
                <div className="text-xs text-amber-900/80 dark:text-amber-200/80">
                  Nº <strong>{note?.numero ?? "?"}/{note?.serie ?? "?"}</strong>
                  {note?.ambiente ? ` • ${note.ambiente}` : ""}.
                  O sistema fará <strong>primeiro</strong> o cancelamento na SEFAZ. Só depois
                  a venda será marcada como cancelada. Se a SEFAZ recusar, nada é alterado.
                </div>
              </div>
            ) : noteIsProcessing ? (
              <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 font-medium text-blue-800 dark:text-blue-300">
                  <AlertTriangle className="size-4" /> NFC-e em processamento
                </div>
                <div className="text-xs text-blue-900/80 dark:text-blue-200/80">
                  A nota ainda não retornou status da SEFAZ. Atualize o status pelo botão da
                  NFC-e antes de cancelar a venda.
                </div>
              </div>
            ) : noteAlreadyCancelled ? (
              <div className="rounded-md border border-muted p-3 text-sm text-muted-foreground">
                A NFC-e já foi cancelada na SEFAZ. O cancelamento da venda pode prosseguir
                normalmente.
              </div>
            ) : null}

            <div>
              <Label className="mb-2 block">Destino do valor</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as CancelMode)} className="space-y-2">
                <label
                  htmlFor="mode-refund"
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <RadioGroupItem id="mode-refund" value="refund" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Undo2 className="size-4" /> Ressarcir valor
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Apenas cancela a venda e devolve os itens ao estoque.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="mode-credit"
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <RadioGroupItem id="mode-credit" value="credit" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <CreditCard className="size-4" /> Gerar crédito ao cliente
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Adiciona {brl(s.total)} como crédito para usar em uma próxima compra.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {mode === "credit" && (
              <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/30">
                <div className="space-y-1">
                  <Label htmlFor="credit-name">Nome do cliente *</Label>
                  <Input
                    id="credit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="credit-cpf">CPF/CNPJ *</Label>
                  <Input
                    id="credit-cpf"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpfCnpj(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se já existir cliente com este documento, ele será atualizado e o crédito vinculado a ele.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="cancel-reason">
                Motivo do cancelamento * {hasAuthorizedNote && <span className="text-xs text-muted-foreground">(mín. 15 caracteres — SEFAZ)</span>}
              </Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={
                  hasAuthorizedNote
                    ? "Ex.: erro na emissão do cupom, produto errado, desistência do cliente..."
                    : "Ex.: cliente desistiu, troca, erro no pedido…"
                }
              />
              <p className="text-xs text-muted-foreground">
                {reason.trim().length}/{minReasonChars}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirmMut.isPending}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmMut.mutate()}
              disabled={disableConfirm}
            >
              {confirmMut.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaleProgressDialog
        open={progressOpen}
        steps={steps}
        title="Cancelamento em andamento"
        description={
          hasAuthorizedNote
            ? "Primeiro a NFC-e é cancelada na SEFAZ. Se OK, a venda é cancelada em seguida."
            : "Estornando estoque e financeiro da venda."
        }
        successMessage={
          mode === "credit"
            ? `Venda cancelada. Crédito de ${brl(activeSale?.total ?? 0)} gerado para o cliente.`
            : "Venda cancelada e estoque devolvido."
        }
        errorMessage="Cancelamento não concluído. Revise os passos acima e tente novamente."
        partialMessage="Alguns passos não foram executados. Verifique acima antes de fechar."
        onClose={closeProgress}
      />


      <ReturnSaleDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
        sale={activeSale}
        onSuccess={() => {
          setReturnDialogOpen(false);
          setFlowSale(null);
          onOpenChange(false);
          onSuccess?.();
        }}
      />
    </>

  );
}
