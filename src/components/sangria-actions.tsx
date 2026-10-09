import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowRight, Lock, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";


import { brl } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";

type AddTxFn = (params: {
  type: "IN" | "OUT";
  category: "WITHDRAWAL";
  amount: number;
  paymentMethod: "CASH";
  description?: string;
  referenceId?: string;
}) => Promise<any>;

interface SangriaButtonProps {
  currentRegister: any | null | undefined;
  transactions: any[] | undefined;
  addTransaction: AddTxFn;
  size?: "default" | "sm";
  className?: string;
}

export function SangriaButton({
  currentRegister,
  transactions,
  addTransaction,
  size = "default",
  className,
}: SangriaButtonProps) {
  const qc = useQueryClient();
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId!;

  const [showModal, setShowModal] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amount: "0,00", reason: "", toPayable: false });

  const cashBalance = useMemo(() => {
    if (!currentRegister) return 0;
    const txs = transactions || [];
    const inC = txs
      .filter((t) => t.payment_method === "CASH" && t.type === "IN")
      .reduce((a, t) => a + Number(t.amount || 0), 0);
    const outC = txs
      .filter((t) => t.payment_method === "CASH" && t.type === "OUT")
      .reduce((a, t) => a + Number(t.amount || 0), 0);
    return Number(currentRegister.initial_balance || 0) + inC - outC;
  }, [currentRegister, transactions]);

  const open = () => {
    if (!currentRegister) {
      toast.error("Abra um caixa para registrar sangria.");
      return;
    }
    setForm({ amount: "0,00", reason: "", toPayable: false });
    setShowModal(true);
  };

  const request = () => {
    const amount = Number(form.amount.replace(/\./g, "").replace(",", "."));
    if (isNaN(amount) || amount <= 0) return toast.error("Informe um valor válido.");
    if (amount > cashBalance)
      return toast.error(`Saldo em dinheiro insuficiente. Disponível: ${brl(cashBalance)}`);
    if (form.reason.trim().length < 10)
      return toast.error("Justificativa obrigatória (mínimo 10 caracteres).");
    setShowAuth(true);
  };

  const confirmSave = async () => {
    if (!currentRegister || !user?.id) return;
    const amount = Number(form.amount.replace(/\./g, "").replace(",", "."));
    setSaving(true);
    try {
      let payableId: string | undefined;

      if (form.toPayable) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: pay, error: payErr } = await (supabase as any)
          .from("payables")
          .insert({
            company_id: cid,
            direction: "pagar",
            description: `Sangria de caixa - ${form.reason.trim()}`,
            amount,
            due_date: today,
            paid_at: today,
            status: "pago",
            payment_method: "dinheiro",
            notes: `Originado de sangria do caixa #${currentRegister.id}`,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (payErr) {
          toast.warning("Falha ao criar lançamento financeiro. Sangria não registrada.");
          console.error(payErr);
          setSaving(false);
          return;
        }
        payableId = pay?.id;
      }

      await addTransaction({
        type: "OUT",
        category: "WITHDRAWAL",
        amount,
        paymentMethod: "CASH",
        description: `SANGRIA: ${form.reason.trim()}`,
        referenceId: payableId,
      });

      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister.id] });
      qc.invalidateQueries({ queryKey: ["all-cash-transactions", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      toast.success("Sangria registrada com sucesso.");
      setShowModal(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar sangria.");
    } finally {
      setSaving(false);
    }
  };

  if (!currentRegister) return null;

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={open}
        className={
          className ?? "border-destructive/40 text-destructive hover:bg-destructive/10"
        }
        title="Retirar dinheiro do caixa (sangria) com justificativa"
      >
        <ArrowDownCircle className="mr-2 size-4" /> Sangria
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ArrowDownCircle className="size-5" /> Sangria de Caixa
            </DialogTitle>
            <DialogDescription>
              Retirada de dinheiro do caixa. Exige justificativa e autorização de admin/gerente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo em dinheiro disponível</span>
                <span className="font-semibold">{brl(cashBalance)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor da sangria *</Label>
              <Input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-2">
              <Label>Justificativa * (mín. 10 caracteres)</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Ex: Pagamento de fornecedor / Troco para banco / Despesa"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{form.reason.trim().length}/10</p>
            </div>
            <div className="flex items-start gap-2 pt-1">
              <Checkbox
                id="sangria-payable"
                checked={form.toPayable}
                onCheckedChange={(c) => setForm({ ...form, toPayable: !!c })}
              />
              <Label htmlFor="sangria-payable" className="text-sm font-normal leading-tight">
                Lançar também como <strong>despesa paga</strong> no Financeiro
                <span className="block text-xs text-muted-foreground">
                  Cria um registro em Contas a Pagar (status: pago) vinculado a esta sangria.
                </span>
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={request} disabled={saving}>
              {saving ? "Processando..." : "Autorizar e registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAuthDialog
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => {
          setShowAuth(false);
          void confirmSave();
        }}
        title="Autorizar Sangria"
        description="Informe o login/senha de um admin ou gerente para autorizar a sangria."
      />
    </>
  );
}

interface CancelSangriaButtonProps {
  tx: any;
  registerStatus?: "OPEN" | "CLOSED" | string;
  size?: "sm" | "icon" | "default";
  variant?: "ghost" | "outline";
  label?: string;
}

export function CancelSangriaButton({
  tx,
  registerStatus,
  size = "icon",
  variant = "ghost",
  label,
}: CancelSangriaButtonProps) {
  const qc = useQueryClient();
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId!;
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registerInfo, setRegisterInfo] = useState<{
    opened_at?: string;
    operator?: string;
    status?: string;
  } | null>(null);

  useEffect(() => {
    if (!showConfirm || !tx?.cash_register_id) return;
    let alive = true;
    (async () => {
      const { data: reg } = await (supabase as any)
        .from("cash_registers")
        .select("opened_at, status, user_id_open")
        .eq("id", tx.cash_register_id)
        .maybeSingle();
      if (!alive || !reg) return;
      let operator: string | undefined;
      if (reg.user_id_open) {
        const { data: prof } = await (supabase as any)
          .from("profiles")
          .select("full_name, email")
          .eq("id", reg.user_id_open)
          .maybeSingle();
        operator = prof?.full_name || prof?.email;
      }
      setRegisterInfo({ opened_at: reg.opened_at, operator, status: reg.status });
    })();
    return () => {
      alive = false;
    };
  }, [showConfirm, tx?.cash_register_id]);

  if (tx?.category !== "WITHDRAWAL") return null;

  const isBlocked = registerStatus && registerStatus !== "OPEN";

  if (isBlocked) {
    const statusLabel = registerStatus === "CLOSED" ? "fechado" : registerStatus ? `"${registerStatus}"` : "desconhecido";
    const reason = `Cancelamento bloqueado: caixa ${statusLabel}. Para estornar esta sangria, o caixa precisa estar em status "Aberto". Se necessário, reabra o caixa ou contate um administrador.`;
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 cursor-not-allowed"
        title={reason}
      >
        <Lock className={size === "icon" ? "size-3.5" : "size-3.5 mr-1"} />
        {label ?? "Bloqueado"}
      </span>
    );
  }

  const doCancel = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      if (tx.reference_id) {
        const { error: payErr } = await (supabase as any)
          .from("payables")
          .delete()
          .eq("id", tx.reference_id)
          .eq("company_id", cid);
        if (payErr) console.warn("Não foi possível remover o payable vinculado:", payErr);
      }

      const { error } = await (supabase as any)
        .from("cash_transactions")
        .delete()
        .eq("id", tx.id);
      if (error) throw error;

      await logActivity({
        companyId: cid,
        userId: user.id,
        action: "cancelar_sangria",
        entity: "cash_transactions",
        entityId: tx.id,
        meta: {
          cancelled: tx,
          reverted_payable_id: tx.reference_id || null,
        },
      });

      qc.invalidateQueries({ queryKey: ["cash-transactions", tx.cash_register_id] });
      qc.invalidateQueries({ queryKey: ["all-cash-transactions", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      toast.success("Sangria cancelada e saldo restaurado.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cancelar sangria.");
    } finally {
      setBusy(false);
    }
  };

  const openedAtFmt = registerInfo?.opened_at
    ? new Date(registerInfo.opened_at).toLocaleString("pt-BR")
    : "—";
  const sangriaAtFmt = tx?.created_at
    ? new Date(tx.created_at).toLocaleString("pt-BR")
    : "—";
  const originLabel = `Caixa aberto em ${openedAtFmt}${
    registerInfo?.operator ? ` • ${registerInfo.operator}` : ""
  }`;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={
          size === "icon"
            ? "size-7 text-destructive hover:bg-destructive/10"
            : "text-destructive hover:bg-destructive/10"
        }
        title="Cancelar sangria"
        onClick={() => setShowConfirm(true)}
        disabled={busy}
      >
        <Undo2 className={size === "icon" ? "size-3.5" : "mr-1 size-3.5"} />
        {label}
      </Button>

      <Dialog open={showConfirm} onOpenChange={(o) => !busy && setShowConfirm(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Undo2 className="size-5" /> Cancelar sangria
            </DialogTitle>
            <DialogDescription>
              Revise os dados abaixo. O valor será estornado ao saldo do caixa de origem
              (mesmo caixa) e uma auditoria será registrada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-xs uppercase text-muted-foreground">Valor a estornar</div>
              <div className="text-2xl font-semibold text-destructive">
                {brl(Number(tx?.amount || 0))}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Sangria em {sangriaAtFmt}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase text-muted-foreground">Caixa de origem</div>
                <div className="font-medium">Sangria</div>
                <div className="text-xs text-muted-foreground">{originLabel}</div>
              </div>
              <div className="flex items-center justify-center">
                <ArrowRight className="size-4 text-muted-foreground" />
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="text-xs uppercase text-muted-foreground">Caixa de destino</div>
                <div className="font-medium">Retorno ao caixa</div>
                <div className="text-xs text-muted-foreground">{originLabel}</div>
              </div>
            </div>

            {tx?.description && (
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase text-muted-foreground">Motivo original</div>
                <div className="whitespace-pre-wrap text-sm">{tx.description}</div>
              </div>
            )}

            {tx?.reference_id && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                Há um lançamento financeiro vinculado — ele também será removido.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setShowConfirm(false);
                setShowAuth(true);
              }}
            >
              Autorizar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdminAuthDialog
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => {
          setShowAuth(false);
          void doCancel();
        }}
        title="Autorizar cancelamento de sangria"
        description="Informe o login/senha de um admin ou gerente para autorizar o estorno."
      />
    </>
  );
}
