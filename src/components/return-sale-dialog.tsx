import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  SaleProgressDialog,
  type ProgressStep,
} from "@/components/sale-progress-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createReturnSale, type CancelMode } from "@/lib/customer-credits";
import { emitNfceDevolucao, consultNfce } from "@/lib/nfce.functions";
import { brl } from "@/lib/format";
import { maskCpfCnpj } from "@/lib/masks";
import { Loader2, CreditCard, Undo2, ReceiptText } from "lucide-react";

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

interface Props {
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

type Row = {
  product_id: string;
  name: string;
  soldQty: number;
  returnedQty: number;
  maxReturn: number;
  unit_price: number;
  selected: boolean;
  qty: number;
};

export function ReturnSaleDialog({ open, onOpenChange, sale, onSuccess }: Props) {
  const [mode, setMode] = useState<CancelMode>("refund");
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [snapshot, setSnapshot] = useState(sale);

  const runEmitDev = useServerFn(emitNfceDevolucao);
  const runConsult = useServerFn(consultNfce);

  const activeSale = sale ?? snapshot;

  useEffect(() => {
    if (open && sale) {
      setMode("refund");
      setReason("");
      setName(sale.customer_name ?? "");
      setCpf(sale.customer_doc ? maskCpfCnpj(sale.customer_doc) : "");
    }
  }, [open, sale]);

  // Carrega itens vendidos + já devolvidos
  const itemsQ = useQuery({
    queryKey: ["return-sale-items", sale?.id],
    enabled: !!sale?.id && open,
    queryFn: async (): Promise<Row[]> => {
      const [origRes, retRes] = await Promise.all([
        supabase
          .from("sale_items")
          .select("product_id, quantity, unit_price, products(name)")
          .eq("sale_id", sale!.id),
        supabase
          .from("sales")
          .select("id, sale_items(product_id, quantity)")
          .eq("origin_sale_id", sale!.id)
          .eq("type", "devolucao")
          .eq("status", "concluida"),
      ]);
      const returnedMap = new Map<string, number>();
      for (const s of (retRes.data as any[]) ?? []) {
        for (const it of (s.sale_items as any[]) ?? []) {
          returnedMap.set(
            it.product_id,
            (returnedMap.get(it.product_id) ?? 0) + Number(it.quantity),
          );
        }
      }
      const byProduct = new Map<string, Row>();
      for (const it of (origRes.data as any[]) ?? []) {
        const pid = it.product_id as string;
        const qty = Number(it.quantity);
        const price = Number(it.unit_price);
        const prev = byProduct.get(pid);
        if (prev) {
          prev.soldQty += qty;
        } else {
          const returned = returnedMap.get(pid) ?? 0;
          const maxReturn = Math.max(0, qty - returned);
          byProduct.set(pid, {
            product_id: pid,
            name: it.products?.name ?? "Item",
            soldQty: qty,
            returnedQty: returned,
            maxReturn,
            unit_price: price,
            selected: maxReturn > 0,
            qty: maxReturn,
          });
        }
      }
      return Array.from(byProduct.values());
    },
  });

  useEffect(() => {
    if (itemsQ.data) setRows(itemsQ.data);
  }, [itemsQ.data]);

  const totalReturn = useMemo(
    () => rows.filter((r) => r.selected).reduce((s, r) => s + r.qty * r.unit_price, 0),
    [rows],
  );

  const updateStep = (id: string, patch: Partial<ProgressStep>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");
    return token;
  };

  const validate = (): string | null => {
    if (!sale) return "Venda inválida";
    if (reason.trim().length < 15)
      return "Motivo obrigatório (mín. 15 caracteres — vai na nota fiscal).";
    const selected = rows.filter((r) => r.selected && r.qty > 0);
    if (!selected.length) return "Selecione ao menos 1 item para devolver.";
    for (const r of selected) {
      if (r.qty > r.maxReturn)
        return `Quantidade de "${r.name}" excede o disponível (${r.maxReturn}).`;
    }
    if (mode === "credit") {
      if (name.trim().length < 2) return "Informe o nome do cliente.";
      const d = cpf.replace(/\D/g, "");
      if (d.length !== 11 && d.length !== 14) return "CPF/CNPJ inválido.";
    }
    return null;
  };

  const runCreateStep = async (): Promise<string | null> => {
    updateStep("create", { status: "running", detail: "Registrando devolução..." });
    try {
      const selected = rows.filter((r) => r.selected && r.qty > 0);
      const res = await createReturnSale({
        originSaleId: sale!.id,
        items: selected.map((r) => ({ product_id: r.product_id, quantity: r.qty })),
        mode,
        reason: reason.trim(),
        partnerId: sale!.customer_id ?? null,
        name: mode === "credit" ? name.trim() : undefined,
        cpf: mode === "credit" ? cpf.replace(/\D/g, "") : undefined,
      });
      updateStep("create", {
        status: "done",
        detail: `Devolução registrada. Total ${brl(res.total)}.`,
      });
      return res.return_sale_id;
    } catch (e: any) {
      updateStep("create", {
        status: "error",
        detail: e?.message ?? "Falha ao registrar devolução.",
        actions: [{ label: "Tentar novamente", onClick: () => void retryAll() }],
      });
      updateStep("nfce", { status: "skipped", detail: "Aguardando registro da devolução." });
      return null;
    }
  };

  const returnSaleIdRef = useRef<string | null>(null);
  const returnRefRef = useRef<string | null>(null);


  const runEmitStep = async (): Promise<"done" | "processing" | "stop"> => {
    if (!returnSaleIdRef.current) return "stop";
    updateStep("nfce", {
      status: "running",
      detail: "Emitindo NFC-e de devolução na SEFAZ...",
      actions: undefined,
    });
    try {
      const accessToken = await getAccessToken();
      const r: any = await runEmitDev({ data: { returnSaleId: returnSaleIdRef.current!, accessToken } });
      returnRefRef.current = r?.ref ?? null;
      if (r?.status === "autorizada") {
        updateStep("nfce", {
          status: "done",
          detail: "NFC-e de devolução AUTORIZADA na SEFAZ.",
        });
        return "done";
      }
      if (r?.status === "processando") {
        updateStep("nfce", {
          status: "done",
          detail: "Pedido aceito pela SEFAZ. Aguardando confirmação...",
        });
        return "processing";
      }
      const msg =
        r?.motivo_rejeicao ||
        r?.raw?.mensagem ||
        r?.raw?.mensagem_sefaz ||
        r?.status ||
        "SEFAZ recusou a NFC-e de devolução.";
      updateStep("nfce", {
        status: "error",
        detail: `SEFAZ recusou: ${msg}`,
        actions: [{ label: "Tentar novamente", onClick: () => void retryEmit() }],
      });
      return "stop";
    } catch (e: any) {
      updateStep("nfce", {
        status: "error",
        detail: e?.message ?? "Erro ao emitir NFC-e de devolução.",
        actions: [{ label: "Tentar novamente", onClick: () => void retryEmit() }],
      });
      return "stop";
    }
  };

  const runPollStep = async (): Promise<"done" | "stop"> => {
    if (!returnRefRef.current) return "stop";
    setSteps((prev) => {
      const has = prev.some((s) => s.id === "poll");
      const step: ProgressStep = {
        id: "poll",
        label: "Confirmando autorização na SEFAZ",
        status: "running",
        detail: "Consultando SEFAZ...",
      };
      return has ? prev.map((s) => (s.id === "poll" ? { ...s, ...step } : s)) : [...prev, step];
    });
    for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
      updateStep("poll", {
        detail: `Consultando SEFAZ (${attempt}/${POLL_MAX_ATTEMPTS})...`,
        progress: Math.min(95, Math.round((attempt / POLL_MAX_ATTEMPTS) * 100)),
      });
      try {
        const accessToken = await getAccessToken();
        const r: any = await runConsult({ data: { ref: returnRefRef.current, accessToken } });
        const st = (r?.status || "").toLowerCase();
        if (st === "autorizada") {
          updateStep("poll", { status: "done", detail: "SEFAZ confirmou a autorização.", progress: 100 });
          return "done";
        }
        if (st === "cancelada" || st === "denegada" || st.startsWith("erro")) {
          updateStep("poll", {
            status: "error",
            detail: `SEFAZ retornou status "${st}".`,
            actions: [{ label: "Reemitir", onClick: () => void retryEmit() }],
          });
          return "stop";
        }
      } catch {
        // ignora transiente, continua
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    updateStep("poll", {
      status: "error",
      detail: "SEFAZ não confirmou após várias tentativas.",
      actions: [{ label: "Continuar aguardando", onClick: () => void runPollStep() }],
    });
    return "stop";
  };

  const retryEmit = async () => {
    const r = await runEmitStep();
    if (r === "processing") await runPollStep();
  };

  const retryAll = async () => {
    returnSaleIdRef.current = await runCreateStep();
    if (!returnSaleIdRef.current) return;
    const r = await runEmitStep();
    if (r === "processing") await runPollStep();
  };

  const startFlow = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSnapshot(sale);
    setSteps([
      { id: "create", label: "Registrar devolução (estoque + caixa/crédito)", status: "pending" },
      { id: "nfce", label: "Emitir NFC-e de devolução na SEFAZ", status: "pending" },
    ]);
    setProgressOpen(true);
    returnSaleIdRef.current = await runCreateStep();
    if (!returnSaleIdRef.current) return;
    const r = await runEmitStep();
    if (r === "processing") await runPollStep();
    if (returnSaleIdRef.current) onSuccess?.();
  };

  const closeProgress = () => {
    setProgressOpen(false);
    setSteps([]);
    setSnapshot(null);
    onOpenChange(false);
  };

  if (!activeSale) return null;

  return (
    <>
      <Dialog open={open && !progressOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Emitir NFC-e de devolução
              {activeSale.number ? ` — venda #${activeSale.number}` : ""}
            </DialogTitle>
            <DialogDescription>
              A nota original permanece autorizada. Uma nova NFC-e de devolução será emitida
              referenciando-a, o estoque volta e o valor sai do caixa ou vira crédito ao cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
              <ReceiptText className="size-4 mt-0.5 shrink-0" />
              <span>
                Use quando o prazo de cancelamento da NFC-e (30 min) já expirou. A nota de devolução
                é o caminho fiscal correto para estornar a venda.
              </span>
            </div>

            <div>
              <Label className="mb-2 block">Itens para devolver</Label>
              {itemsQ.isLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Carregando itens...
                </div>
              ) : rows.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum item encontrado.</div>
              ) : (
                <div className="rounded-md border divide-y">
                  {rows.map((r, i) => {
                    const noneLeft = r.maxReturn <= 0;
                    return (
                      <div
                        key={r.product_id}
                        className={`flex items-center gap-3 p-3 ${noneLeft ? "opacity-50" : ""}`}
                      >
                        <Checkbox
                          checked={r.selected}
                          disabled={noneLeft}
                          onCheckedChange={(v) =>
                            setRows((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, selected: !!v } : x)),
                            )
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Vendido: {r.soldQty} • Já devolvido: {r.returnedQty} • Disponível:{" "}
                            <strong>{r.maxReturn}</strong> • Unit.: {brl(r.unit_price)}
                          </div>
                        </div>
                        <Input
                          type="number"
                          className="w-24"
                          min={0}
                          max={r.maxReturn}
                          step="0.001"
                          disabled={!r.selected || noneLeft}
                          value={r.qty}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      qty: Math.max(
                                        0,
                                        Math.min(r.maxReturn, Number(e.target.value) || 0),
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 text-right text-sm">
                Total a devolver: <strong>{brl(totalReturn)}</strong>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Destino do valor</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as CancelMode)}
                className="space-y-2"
              >
                <label
                  htmlFor="ret-refund"
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <RadioGroupItem id="ret-refund" value="refund" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Undo2 className="size-4" /> Ressarcir em dinheiro
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Registra uma saída de {brl(totalReturn)} no caixa aberto atual.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor="ret-credit"
                  className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50"
                >
                  <RadioGroupItem id="ret-credit" value="credit" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <CreditCard className="size-4" /> Gerar crédito ao cliente
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Adiciona {brl(totalReturn)} como crédito para uma próxima compra.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {mode === "credit" && (
              <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/30">
                <div className="space-y-1">
                  <Label htmlFor="ret-name">Nome do cliente *</Label>
                  <Input
                    id="ret-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ret-cpf">CPF/CNPJ *</Label>
                  <Input
                    id="ret-cpf"
                    value={cpf}
                    onChange={(e) => setCpf(maskCpfCnpj(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="ret-reason">
                Motivo da devolução *{" "}
                <span className="text-xs text-muted-foreground">(mín. 15 caracteres)</span>
              </Label>
              <Textarea
                id="ret-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Ex.: cliente desistiu após 40 min, produto com defeito, troca por outro..."
              />
              <p className="text-xs text-muted-foreground">{reason.trim().length}/15</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void startFlow()}
              disabled={itemsQ.isLoading || totalReturn <= 0}
            >
              Emitir NFC-e de devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaleProgressDialog
        open={progressOpen}
        steps={steps}
        title="Devolução em andamento"
        description="Primeiro registramos a devolução no sistema; depois a NFC-e é enviada à SEFAZ."
        onClose={closeProgress}
      />
    </>
  );
}
