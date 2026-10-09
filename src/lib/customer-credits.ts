import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export async function getCustomerCreditBalance(partnerId: string): Promise<number> {
  const { data, error } = await db.rpc("get_customer_credit_balance", { _partner: partnerId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function applyCustomerCredit(
  saleId: string,
  partnerId: string,
  amount: number,
): Promise<number> {
  const { data, error } = await db.rpc("apply_customer_credit", {
    _sale: saleId,
    _partner: partnerId,
    _amount: amount,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type CancelMode = "refund" | "credit";

export async function cancelSaleWithCredit(opts: {
  saleId: string;
  reason: string;
  mode: CancelMode;
  partnerId?: string | null;
  name?: string;
  cpf?: string;
}): Promise<{ partner_id: string | null; credit_id: string | null; amount: number }> {
  const { data, error } = await db.rpc("cancel_sale_with_credit", {
    _sale: opts.saleId,
    _reason: opts.reason,
    _mode: opts.mode,
    _partner_id: opts.partnerId ?? null,
    _name: opts.name ?? null,
    _cpf: opts.cpf ?? null,
  });
  if (error) throw error;
  return data as any;
}

export type ReturnItemInput = { product_id: string; quantity: number };

export async function createReturnSale(opts: {
  originSaleId: string;
  items: ReturnItemInput[];
  mode: CancelMode;
  reason: string;
  partnerId?: string | null;
  name?: string;
  cpf?: string;
}): Promise<{
  return_sale_id: string;
  origin_note_id: string;
  origin_chave: string;
  total: number;
  partner_id: string | null;
}> {
  const { data, error } = await db.rpc("create_return_sale", {
    _origin_sale: opts.originSaleId,
    _items: opts.items,
    _mode: opts.mode,
    _reason: opts.reason,
    _partner_id: opts.partnerId ?? null,
    _name: opts.name ?? null,
    _cpf: opts.cpf ?? null,
  });
  if (error) throw error;
  return data as any;
}

