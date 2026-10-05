import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appwrite as supabase } from "@/integrations/appwrite/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { isSuperAdmin, logActivity } from "@/lib/db";

export type CashRegisterStatus = "OPEN" | "CLOSED";
export type TransactionType = "IN" | "OUT";
export type TransactionCategory =
  | "SALE"
  | "EXPENSE"
  | "WITHDRAWAL"
  | "PAYMENT_RECEIVED"
  | "ADJUSTMENT";
export type PaymentMethodType = "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO";

export interface CashRegister {
  id: string;
  company_id: string;
  user_id_open: string;
  user_id_close: string | null;
  opened_at: string;
  closed_at: string | null;
  initial_balance: number;
  final_balance_calculated: number | null;
  final_balance_informed: number | null;
  status: CashRegisterStatus;
  is_locked: boolean;
  locked_at: string | null;
  locked_by_user_id: string | null;
  unlock_required_role: "USER" | "MANAGER" | null;
}

export interface CashTransaction {
  id: string;
  company_id: string;
  cash_register_id: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  payment_method: PaymentMethodType;
  description: string | null;
  reference_id: string | null;
  user_id: string;
  created_at: string;
}

export function useCashRegister(targetUserId?: string) {
  const { currentCompanyId, user } = useAuth();
  const qc = useQueryClient();
  const cid = currentCompanyId;
  const uid = targetUserId || user?.id;

  const currentRegisterQ = useQuery({
    queryKey: ["current-cash-register", cid, uid],
    queryFn: async () => {
      if (!cid || !uid) return null;
      const { data, error } = await (supabase as any)
        .from("cash_registers")
        .select("*")
        .eq("company_id", cid)
        .eq("user_id_open", uid)
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CashRegister | null;
    },
    enabled: !!cid && !!uid,
  });

  const allOpenRegistersQ = useQuery({
    queryKey: ["all-open-registers", cid],
    queryFn: async () => {
      if (!cid) return [];
      const { data, error } = await (supabase as any)
        .from("cash_registers")
        .select("*, profiles!user_id_open(name, email)")
        .eq("company_id", cid)
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });

      if (error) throw error;
      return data as (CashRegister & { profiles: { name: string; email: string } })[];
    },
    enabled: !!cid,
  });

  const openRegisterMut = useMutation({
    mutationFn: async (params: { initialBalance: number; userId?: string }) => {
      if (!cid || !user?.id) throw new Error("Não autenticado");

      const targetUserId = params.userId || user.id;

      if (params.initialBalance <= 0) {
        throw new Error("O saldo inicial deve ser maior que zero.");
      }

      // Check if there's already an open register for this user
      const { data: existing } = await (supabase as any)
        .from("cash_registers")
        .select("id")
        .eq("company_id", cid)
        .eq("user_id_open", targetUserId)
        .eq("status", "OPEN")
        .maybeSingle();

      if (existing) {
        if (targetUserId === user.id) {
          throw new Error("Você já possui um caixa aberto.");
        } else {
          throw new Error("Este usuário já possui um caixa aberto.");
        }
      }

      const { data, error } = await (supabase as any)
        .from("cash_registers")
        .insert({
          company_id: cid,
          user_id_open: targetUserId,
          initial_balance: params.initialBalance,
          status: "OPEN",
        })
        .select()
        .single();

      if (error) throw error;

      await logActivity({
        companyId: cid,
        userId: user.id,
        action: "abertura_caixa",
        entity: "cash_registers",
        entityId: data.id,
        meta: { initial_balance: params.initialBalance, target_user: targetUserId },
      });

      return data;
    },
    onSuccess: (_, variables) => {
      toast.success("Caixa aberto com sucesso!");
      const targetUserId = variables.userId || user?.id;
      qc.invalidateQueries({ queryKey: ["current-cash-register", cid, targetUserId] });
      qc.invalidateQueries({ queryKey: ["cash-registers", cid] });
      qc.invalidateQueries({ queryKey: ["all-open-registers", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTransactionMut = useMutation({
    mutationFn: async (params: {
      type: TransactionType;
      category: TransactionCategory;
      amount: number;
      paymentMethod: PaymentMethodType;
      description?: string;
      referenceId?: string;
    }) => {
      if (!currentRegisterQ.data) throw new Error("Nenhum caixa aberto.");
      if (currentRegisterQ.data.is_locked) throw new Error("Caixa bloqueado.");

      const { data, error } = await (supabase as any)
        .from("cash_transactions")
        .insert({
          company_id: cid,
          cash_register_id: currentRegisterQ.data.id,
          type: params.type,
          category: params.category,
          amount: params.amount,
          payment_method: params.paymentMethod,
          description: params.description,
          reference_id: params.referenceId,
          user_id: currentRegisterQ.data.user_id_open || user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      if (user?.id) {
        await logActivity({
          companyId: cid!,
          userId: user.id,
          action: "INSERT",
          entity: "cash_transactions",
          entityId: data.id,
          meta: { new: data },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegisterQ.data?.id] });
    },
  });

  const lockRegisterMut = useMutation({
    mutationFn: async () => {
      if (!currentRegisterQ.data) throw new Error("Caixa não encontrado.");
      const { error } = await (supabase as any)
        .from("cash_registers")
        .update({
          is_locked: true,
          locked_at: new Date().toISOString(),
          locked_by_user_id: user?.id,
        })
        .eq("id", currentRegisterQ.data.id);

      if (error) throw error;

      await logActivity({
        companyId: cid!,
        userId: user?.id!,
        action: "bloqueio_caixa",
        entity: "cash_registers",
        entityId: currentRegisterQ.data.id,
      });
    },
    onSuccess: () => {
      toast.success("Caixa bloqueado.");
      qc.invalidateQueries({ queryKey: ["current-cash-register", cid, uid] });
      qc.invalidateQueries({ queryKey: ["cash-registers", cid] });
    },
    onError: (e: Error) => toast.error(`Erro ao bloquear: ${e.message}`),
  });

  const unlockRegisterMut = useMutation({
    mutationFn: async (password?: string) => {
      if (!currentRegisterQ.data) throw new Error("Caixa não encontrado.");

      // If password is provided, verify it.
      // If not provided, we assume the caller has already checked permissions (e.g. is manager/admin)
      if (password) {
        if (!user?.email) throw new Error("Email não encontrado.");
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: password,
        });
        if (authError) throw new Error("Senha incorreta.");
      }

      const { error } = await (supabase as any)
        .from("cash_registers")
        .update({
          is_locked: false,
          locked_at: null,
          locked_by_user_id: null,
        })
        .eq("id", currentRegisterQ.data.id);

      if (error) throw error;

      await logActivity({
        companyId: cid!,
        userId: user?.id!,
        action: "desbloqueio_caixa",
        entity: "cash_registers",
        entityId: currentRegisterQ.data.id,
      });
    },
    onSuccess: () => {
      toast.success("Caixa desbloqueado.");
      qc.invalidateQueries({ queryKey: ["current-cash-register", cid, uid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeRegisterMut = useMutation({
    mutationFn: async (params: {
      informedBalance: number;
      counts: { cash: number; pix: number; card: number };
    }) => {
      if (!currentRegisterQ.data) throw new Error("Caixa não encontrado.");
      if (currentRegisterQ.data.is_locked)
        throw new Error("Caixa bloqueado. Desbloqueie primeiro.");

      // Calculate balance
      const { data: txs, error: txError } = await (supabase as any)
        .from("cash_transactions")
        .select("amount, type")
        .eq("cash_register_id", currentRegisterQ.data.id);

      if (txError) throw txError;

      const totalIn = txs
        .filter((t: any) => t.type === "IN")
        .reduce((acc: number, t: any) => acc + Number(t.amount), 0);
      const totalOut = txs
        .filter((t: any) => t.type === "OUT")
        .reduce((acc: number, t: any) => acc + Number(t.amount), 0);
      const calculatedBalance = currentRegisterQ.data.initial_balance + totalIn - totalOut;

      // Close register
      const { error: closeError } = await (supabase as any)
        .from("cash_registers")
        .update({
          status: "CLOSED",
          closed_at: new Date().toISOString(),
          user_id_close: user?.id,
          final_balance_calculated: calculatedBalance,
          final_balance_informed: params.informedBalance,
        })
        .eq("id", currentRegisterQ.data.id);

      if (closeError) throw closeError;

      // Save countings
      await (supabase as any).from("cash_countings").insert({
        company_id: cid,
        cash_register_id: currentRegisterQ.data.id,
        cash_amount: params.counts.cash,
        pix_amount: params.counts.pix,
        card_amount: params.counts.card,
        total_counted: params.counts.cash + params.counts.pix + params.counts.card,
      });

      await logActivity({
        companyId: cid!,
        userId: user?.id!,
        action: "fechamento_caixa",
        entity: "cash_registers",
        entityId: currentRegisterQ.data.id,
        meta: { calculatedBalance, informedBalance: params.informedBalance },
      });
    },
    onSuccess: () => {
      toast.success("Caixa fechado com sucesso!");
      qc.invalidateQueries({ queryKey: ["current-cash-register", cid, uid] });
      qc.invalidateQueries({ queryKey: ["cash-registers", cid] });
      qc.invalidateQueries({ queryKey: ["all-open-registers", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelRegisterMut = useMutation({
    mutationFn: async (id?: string) => {
      const targetId = id || currentRegisterQ.data?.id;
      if (!targetId) throw new Error("Caixa não encontrado.");

      const { data: regData } = await (supabase as any)
        .from("cash_registers")
        .select("status, user_id_open, opened_at")
        .eq("id", targetId)
        .maybeSingle();

      if (!regData) throw new Error("Caixa não encontrado.");

      const { count, error: txCountError } = await (supabase as any)
        .from("cash_transactions")
        .select("id", { count: "exact", head: true })
        .eq("cash_register_id", targetId);

      if (txCountError) throw txCountError;

      if (count && count > 0) {
        throw new Error("Não é possível excluir uma sessão que possui movimentações registradas.");
      }

      const { count: saleCount, error: saleCountError } = await (supabase as any)
        .from("sales")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid)
        .eq("status", "concluida")
        .eq("created_by", regData.user_id_open)
        .gte("created_at", regData.opened_at);

      if (saleCountError) throw saleCountError;
      if (saleCount && saleCount > 0) {
        throw new Error(
          "Não é possível excluir uma sessão que possui vendas concluídas vinculadas.",
        );
      }

      const { error: deleteSalesError } = await (supabase as any)
        .from("sales")
        .delete()
        .eq("company_id", cid)
        .eq("status", "aberta")
        .eq("created_by", regData.user_id_open)
        .gte("created_at", regData.opened_at);

      if (deleteSalesError) throw deleteSalesError;

      const { error } = await (supabase as any).from("cash_registers").delete().eq("id", targetId);

      if (error) throw error;

      await logActivity({
        companyId: cid!,
        userId: user?.id!,
        action: "exclusao_sessao_caixa",
        entity: "cash_registers",
        entityId: targetId,
        meta: { register: regData },
      });
    },
    onSuccess: () => {
      toast.success("Sessão excluída com sucesso.");
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "current-cash-register" &&
          q.queryKey[1] === cid,
      });
      qc.invalidateQueries({ queryKey: ["cash-registers", cid] });
      qc.invalidateQueries({ queryKey: ["all-open-registers", cid] });
      qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === "current-session-sales" || q.queryKey[0] === "cash-transactions"),
      });
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  return {
    currentRegister: currentRegisterQ.data,
    isLoading: currentRegisterQ.isLoading,
    allOpenRegisters: allOpenRegistersQ.data || [],
    isAllOpenLoading: allOpenRegistersQ.isLoading,
    openRegister: openRegisterMut.mutateAsync,
    isOpening: openRegisterMut.isPending,
    addTransaction: addTransactionMut.mutateAsync,
    isAddingTransaction: addTransactionMut.isPending,
    lockRegister: lockRegisterMut.mutateAsync,
    isLocking: lockRegisterMut.isPending,
    unlockRegister: unlockRegisterMut.mutateAsync,
    isUnlocking: unlockRegisterMut.isPending,
    closeRegister: closeRegisterMut.mutateAsync,
    isClosing: closeRegisterMut.isPending,
    cancelRegister: cancelRegisterMut.mutateAsync,
    isCancelling: cancelRegisterMut.isPending,
  };
}
