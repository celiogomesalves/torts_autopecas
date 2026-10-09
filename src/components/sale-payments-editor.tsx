import { useEffect, useMemo, useState } from "react";
import { Plus, X, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PaymentMethod, SalePaymentInput } from "@/lib/db-types";
import { brl, parseCurrencyInput, formatCurrencyInput } from "@/lib/format";

export type PaymentRow = SalePaymentInput;

// Detecta a forma de pagamento "Voucher" (crédito do cliente) pelo nome.
export const isVoucherMethodName = (n?: string | null) => /^\s*voucher\b/i.test(n ?? "");
export function findVoucherMethodId(methods: PaymentMethod[]): string | null {
  return methods.find((m) => isVoucherMethodName(m.name))?.id ?? null;
}

export interface SalePaymentsEditorProps {
  total: number;
  paymentMethods: PaymentMethod[];
  payments: PaymentRow[];
  onChange: (p: PaymentRow[]) => void;
  /** ID da forma de pagamento "Voucher" (crédito do cliente). */
  voucherMethodId?: string | null;
  /** Saldo máximo de crédito disponível para a linha "Voucher". */
  maxVoucher?: number;
}

const isVoucherRowFor = (voucherMethodId?: string | null) => (p: PaymentRow) =>
  !!voucherMethodId && p.payment_method_id === voucherMethodId;

/**
 * Redistribui as linhas de pagamento que NÃO são voucher para cobrir
 * (total - voucher) na ordem de inclusão. Cada linha mantém seu valor atual
 * limitado ao saldo restante; a última linha absorve qualquer diferença.
 */
export function redistributeAfterVoucher(
  rows: PaymentRow[],
  total: number,
  voucherMethodId?: string | null,
): PaymentRow[] {
  const isVoucher = isVoucherRowFor(voucherMethodId);
  const voucherAmt = rows.filter(isVoucher).reduce((s, r) => s + Number(r.amount || 0), 0);
  let remaining = Math.max(0, Number((total - voucherAmt).toFixed(2)));
  const nonVoucherIdxs = rows
    .map((r, i) => (isVoucher(r) ? -1 : i))
    .filter((i) => i >= 0);
  if (nonVoucherIdxs.length === 0) return rows;
  const out = [...rows];
  nonVoucherIdxs.forEach((idx, k) => {
    const isLast = k === nonVoucherIdxs.length - 1;
    const cur = Number(out[idx].amount || 0);
    const amt = isLast
      ? Math.max(0, Number(remaining.toFixed(2)))
      : Math.min(cur, remaining);
    remaining = Math.max(0, Number((remaining - amt).toFixed(2)));
    out[idx] = { ...out[idx], amount: Number(amt.toFixed(2)) };
  });
  return out;
}

export function SalePaymentsEditor({
  total,
  paymentMethods,
  payments,
  onChange,
  voucherMethodId = null,
  maxVoucher = 0,
}: SalePaymentsEditorProps) {
  const [autoSplit, setAutoSplit] = useState(false);
  const isVoucherRow = isVoucherRowFor(voucherMethodId);
  // Mantém a linha de Voucher SEMPRE no topo para exibição.
  const orderedPayments = useMemo(() => {
    const v = payments.filter(isVoucherRow);
    const others = payments.filter((p) => !isVoucherRow(p));
    return [...v, ...others];
  }, [payments, voucherMethodId]);
  const activeMethods = useMemo(
    () => paymentMethods.filter((m) => m.active && !isVoucherMethodName(m.name)),
    [paymentMethods],
  );
  // Para fins de cálculo de saldo, dinheiro é limitado ao que falta (excedente vira troco)
  const paid = useMemo(() => {
    let acc = 0;
    let remainingTotal = total;
    for (const p of orderedPayments) {
      const m = paymentMethods.find((x) => x.id === p.payment_method_id);
      const isCash = /dinheiro|cash|especie|espécie/i.test(m?.name ?? p.method ?? "");
      const amt = Number(p.amount || 0);
      const eff = isCash ? Math.min(amt, Math.max(0, remainingTotal)) : amt;
      acc += eff;
      remainingTotal -= eff;
    }
    return acc;
  }, [orderedPayments, paymentMethods, total]);
  const remaining = Number((total - paid).toFixed(2));

  // Atualiza pela identidade da linha (não pelo índice exibido, que pode estar reordenado).
  const updateRow = (row: PaymentRow, patch: Partial<PaymentRow>) => {
    onChange(payments.map((p) => (p === row ? { ...p, ...patch } : p)));
  };

  const removeRowByRef = (row: PaymentRow) => {
    onChange(payments.filter((p) => p !== row));
  };

  const addRow = () => {
    const def = activeMethods[0];
    const sumOthers = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const outstanding = Math.max(0, Number((total - sumOthers).toFixed(2)));
    onChange([
      ...payments,
      {
        payment_method_id: def?.id ?? null,
        method: def?.name ?? "Dinheiro",
        amount: autoSplit ? 0 : outstanding,
        installments: 1,
        first_due_date: def?.requires_due_date ? new Date().toISOString().slice(0, 10) : null,
      },
    ]);
  };

  // Modo dividir automaticamente: distribui o saldo restante igualmente entre
  // as formas de pagamento com valor zerado/não preenchido.
  useEffect(() => {
    if (!autoSplit) return;
    const emptyIdx: number[] = [];
    let filled = 0;
    payments.forEach((p, i) => {
      const v = Number(p.amount || 0);
      if (isVoucherRow(p)) { filled += v; return; }
      if (v <= 0) emptyIdx.push(i);
      else filled += v;
    });
    if (emptyIdx.length === 0) return;
    const remainingTotal = Math.max(0, Number((total - filled).toFixed(2)));
    const share = Math.floor((remainingTotal / emptyIdx.length) * 100) / 100;
    const last = Number((remainingTotal - share * (emptyIdx.length - 1)).toFixed(2));
    let changed = false;
    const next = payments.map((p, i) => {
      const pos = emptyIdx.indexOf(i);
      if (pos === -1) return p;
      const v = pos === emptyIdx.length - 1 ? last : share;
      if (Number(p.amount || 0) !== v) changed = true;
      return { ...p, amount: v };
    });
    if (changed) onChange(next);
  }, [autoSplit, payments, total, onChange]);

  // Quando houver somente uma forma de pagamento (não-voucher), mantém o valor
  // sincronizado com o total da compra automaticamente.
  useEffect(() => {
    const nonVoucher = payments.filter((p) => !isVoucherRow(p));
    if (nonVoucher.length !== 1) return;
    if (payments.some(isVoucherRow)) return; // havendo voucher, redistribute cuida
    const only = nonVoucher[0];
    const m = paymentMethods.find((x) => x.id === only.payment_method_id);
    const isCash = /dinheiro|cash|especie|espécie/i.test(m?.name ?? only.method ?? "");
    if (isCash && Number(only.amount || 0) > total) return;
    const target = Math.max(0, Number(total.toFixed(2)));
    if (Number(only.amount || 0) !== target) {
      onChange(payments.map((p) => (p === only ? { ...p, amount: target } : p)));
    }
  }, [total, payments, paymentMethods, onChange]);

  const fillRemaining = (row: PaymentRow) => {
    const others = payments.reduce((s, p) => (p === row ? s : s + Number(p.amount || 0)), 0);
    const cap = Math.max(0, Number((total - others).toFixed(2)));
    updateRow(row, { amount: cap });
  };

  return (
    <div className="space-y-3">
      {orderedPayments.map((p, idx) => {
        const voucher = isVoucherRow(p);
        const method = paymentMethods.find((m) => m.id === p.payment_method_id);
        const requiresDue = !voucher && (method?.requires_due_date ?? false);
        const isCash = !voucher && /dinheiro|cash|especie|espécie/i.test(method?.name ?? p.method ?? "");
        const othersPaid = orderedPayments.reduce((s, pp) => (pp === p ? s : s + Number(pp.amount || 0)), 0);
        const owed = Math.max(0, Number((total - othersPaid).toFixed(2)));
        const amt = Number(p.amount || 0);
        const change = isCash ? Number((amt - owed).toFixed(2)) : 0;
        const voucherCap = voucher ? Math.max(0, maxVoucher) : Infinity;
        const errMethod = !voucher && !p.payment_method_id ? "Selecione a forma de pagamento." : null;
        const errAmount = amt <= 0 ? "Informe um valor maior que zero." : null;
        const errExceed = !voucher && !isCash && amt > owed + 0.01
          ? `Excede o saldo restante (${brl(owed)}). Reduza ou use Dinheiro.`
          : null;
        const errVoucher = voucher && amt > voucherCap + 0.01
          ? `Crédito disponível: ${brl(voucherCap)}.`
          : null;
        const errDue = requiresDue && !p.first_due_date ? "Informe o vencimento." : null;
        return (
          <div key={`${p.payment_method_id ?? "x"}-${idx}`} className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
                {voucher && <Ticket className="size-3.5 text-muted-foreground" aria-label="Voucher" />}
                {voucher ? "Voucher (crédito do cliente)" : `Pagamento ${idx + 1}`}
              </span>
              {(orderedPayments.filter((x) => !isVoucherRow(x)).length > 1 || voucher || !isVoucherRow(p)) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => removeRowByRef(p)}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Forma</Label>
                {voucher ? (
                  <Input value={method?.name ?? "Voucher"} disabled className="h-8" />
                ) : (
                  <Select
                    value={p.payment_method_id ?? ""}
                    onValueChange={(v) => {
                      const m = activeMethods.find((x) => x.id === v);
                      const others = payments.reduce(
                        (s, pp) => (pp === p ? s : s + Number(pp.amount || 0)),
                        0,
                      );
                      updateRow(p, {
                        payment_method_id: v,
                        method: m?.name ?? p.method,
                        amount: Math.max(0, Number((total - others).toFixed(2))),
                        first_due_date: m?.requires_due_date
                          ? (p.first_due_date || new Date().toISOString().slice(0, 10))
                          : null,
                      });
                    }}
                  >
                    <SelectTrigger className={`h-8 ${errMethod ? "border-destructive" : ""}`}><SelectValue placeholder="Selecione…" /></SelectTrigger>
                    <SelectContent>
                      {activeMethods.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errMethod && <p className="text-[10px] text-destructive">{errMethod}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isCash ? "Valor recebido" : "Valor"}
                </Label>
                <div className="flex gap-1">
                  <Input
                    inputMode="numeric"
                    disabled={voucher}
                    readOnly={voucher}
                    className={`h-8 text-right ${voucher ? "font-semibold" : ""} ${errAmount || errExceed || errVoucher ? "border-destructive" : ""}`}
                    value={formatCurrencyInput(String(Math.round(amt * 100)))}
                    onChange={(e) => {
                      if (voucher) return;
                      const v = parseCurrencyInput(e.target.value);
                      updateRow(p, { amount: v });
                    }}
                  />
                  {!voucher && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-[10px]"
                      onClick={() => fillRemaining(p)}
                    >
                      Restante
                    </Button>
                  )}
                </div>
                {errAmount && <p className="text-[10px] text-destructive">{errAmount}</p>}
                {!errAmount && errExceed && <p className="text-[10px] text-destructive">{errExceed}</p>}
                {!errAmount && errVoucher && <p className="text-[10px] text-destructive">{errVoucher}</p>}
                {voucher && !errVoucher && (
                  <p className="text-[10px] text-muted-foreground">Crédito disponível: {brl(voucherCap)}</p>
                )}
              </div>
              {requiresDue && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencimento</Label>
                  <Input
                    type="date"
                    className={`h-8 ${errDue ? "border-destructive" : ""}`}
                    value={p.first_due_date ?? ""}
                    onChange={(e) => updateRow(p, { first_due_date: e.target.value || null })}
                  />
                  {errDue && <p className="text-[10px] text-destructive">{errDue}</p>}
                </div>
              )}
            </div>
            {isCash && amt > 0 && (
              <div className="flex items-center justify-between text-xs pt-1 border-t">
                <span className="text-muted-foreground">A pagar: <strong>{brl(owed)}</strong></span>
                <span className={change > 0 ? "text-emerald-600 font-semibold" : "text-muted-foreground"}>
                  Troco: <strong>{brl(Math.max(0, change))}</strong>
                </span>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
            <Plus className="size-3.5" /> Adicionar pagamento
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={autoSplit} onCheckedChange={setAutoSplit} />
            Dividir restante automaticamente
          </label>
        </div>
        <div className="text-xs space-x-3">
          <span className="text-muted-foreground">Total: <strong>{brl(total)}</strong></span>
          <span className={remaining === 0 ? "text-emerald-600" : "text-destructive"}>
            {remaining === 0 ? "OK" : remaining > 0 ? `Falta ${brl(remaining)}` : `Excedeu ${brl(Math.abs(remaining))}`}
          </span>
        </div>
      </div>
    </div>
  );
}
