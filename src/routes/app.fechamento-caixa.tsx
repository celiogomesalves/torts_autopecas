import { usePersistedState } from "@/hooks/use-persisted-state";
import { PageHeading } from "@/components/page-header";

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin, hasPermission } from "@/lib/db";
import { appwrite } from "@/integrations/appwrite/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import {
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  User,
  Clock,
  Calculator,
  ArrowRight,
  ShoppingCart,
  Plus,
  Minus,
  ArrowUpCircle,
  ArrowDownCircle,
  Search,
  History,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  useCashRegister,
  TransactionType,
  TransactionCategory,
  PaymentMethodType,
} from "@/hooks/use-cash-register";
import { useValueVisibility, ValueVisibilityToggle } from "@/hooks/use-value-visibility";
import { PrintPreviewDialog } from "@/components/print-preview-dialog";
import { Eye, Receipt } from "lucide-react";

export const Route = createFileRoute("/app/fechamento-caixa")({
  component: CashManagementPage,
});

function CashManagementPage() {
  const { currentCompanyId, user: currentUser } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = usePersistedState("caixa:tab", "history-transactions");
  const [activeRegisterUserId, setActiveRegisterUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (currentUser?.id && !activeRegisterUserId) {
      setActiveRegisterUserId(currentUser.id);
    }
  }, [currentUser?.id, activeRegisterUserId]);

  const {
    currentRegister,
    allOpenRegisters,
    addTransaction,
    isAddingTransaction,
    cancelRegister,
    isCancelling,
  } = useCashRegister(activeRegisterUserId);

  const fechamentoPermQ = useQuery({
    queryKey: ["has_permission", cid, "fechamento-caixa", "edit", currentUser?.id],
    queryFn: () => hasPermission(cid, "fechamento-caixa", "edit"),
    enabled: !!cid && !!currentUser?.id,
  });

  const canOpenCashQ = useQuery({
    queryKey: ["has_permission", cid, "fechamento-caixa-abrir", "view", currentUser?.id],
    queryFn: () => hasPermission(cid, "fechamento-caixa-abrir", "view"),
    enabled: !!cid && !!currentUser?.id,
  });

  const canSeeAllCashQ = useQuery({
    queryKey: ["has_permission", cid, "fechamento-caixa-ver-todos", "view", currentUser?.id],
    queryFn: () => hasPermission(cid, "fechamento-caixa-ver-todos", "view"),
    enabled: !!cid && !!currentUser?.id,
  });

  const superAdminQ = useQuery({ queryKey: ["is-super-admin"], queryFn: isSuperAdmin });
  const isSAdmin = !!superAdminQ.data;
  const isManager = !!fechamentoPermQ.data;
  const canSeeAll = isSAdmin || !!canSeeAllCashQ.data;
  const canOpenCash = isSAdmin || !!canOpenCashQ.data;
  const hasSpecialAccess = isManager || canSeeAll;

  const { hidden, canToggle, toggle, mask } = useValueVisibility("financeiro");

  const [selectedRegister, setSelectedRegister] = useState<any>(null);
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [newTx, setNewTx] = useState<{
    type: TransactionType;
    category: TransactionCategory;
    amount: string;
    paymentMethod: PaymentMethodType;
    description: string;
  }>({
    type: "IN",
    category: "SALE",
    amount: "0,00",
    paymentMethod: "CASH",
    description: "",
  });

  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyTypeFilter, setHistoryTypeFilter] = useState("all");
  const [historyDateFilter, setHistoryDateFilter] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [historyRegisterFilter, setHistoryRegisterFilter] = useState<string>("all");
  const [historyRegisterStatusFilter, setHistoryRegisterStatusFilter] = useState<
    "all" | "OPEN" | "CLOSED"
  >("all");
  const [sessionsStatusFilter, setSessionsStatusFilter] = useState<"all" | "OPEN" | "CLOSED">(
    "all",
  );
  const [showGroupedBySession, setShowGroupedBySession] = useState(false);

  const registersQ = useQuery({
    queryKey: ["cash-registers", cid, canSeeAll, currentUser?.id],
    queryFn: async () => {
      let query = (appwrite as any)
        .from("cash_registers")
        .select("*, profiles!user_id_open(name)")
        .eq("company_id", cid);

      if (!canSeeAll && currentUser?.id) {
        query = query.eq("user_id_open", currentUser.id);
      }

      const { data, error } = await query.order("opened_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!cid && canSeeAll !== undefined,
  });

  const allTransactionsQ = useQuery({
    queryKey: ["all-cash-transactions", cid, canSeeAll, currentUser?.id],
    queryFn: async () => {
      let query = (appwrite as any)
        .from("cash_transactions")
        .select("*, cash_registers(opened_at, profiles!user_id_open(name))")
        .eq("company_id", cid);

      if (!canSeeAll && currentUser?.id) {
        query = query.eq("user_id", currentUser.id);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!cid && canSeeAll !== undefined,
  });

  const filteredHistory = useMemo(() => {
    if (!allTransactionsQ.data) return [];
    let list = allTransactionsQ.data;

    if (historyTypeFilter !== "all") {
      list = list.filter((t: any) => t.type === historyTypeFilter);
    }

    if (historyDateFilter) {
      list = list.filter((t: any) => {
        const d = new Date(t.created_at);
        const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return local === historyDateFilter;
      });
    }

    if (historyRegisterFilter !== "all") {
      list = list.filter((t: any) => t.cash_register_id === historyRegisterFilter);
    }

    if (historyRegisterStatusFilter !== "all") {
      const allowedRegisterIds = new Set(
        (registersQ.data || [])
          .filter((r: any) => r.status === historyRegisterStatusFilter)
          .map((r: any) => r.id),
      );
      list = list.filter((t: any) => allowedRegisterIds.has(t.cash_register_id));
    }

    if (historySearchTerm) {
      const s = historySearchTerm.toLowerCase();
      list = list.filter(
        (t: any) =>
          t.description?.toLowerCase().includes(s) ||
          t.category?.toLowerCase().includes(s) ||
          t.payment_method?.toLowerCase().includes(s) ||
          t.cash_registers?.profiles?.name?.toLowerCase().includes(s),
      );
    }

    return list;
  }, [
    allTransactionsQ.data,
    historySearchTerm,
    historyTypeFilter,
    historyDateFilter,
    historyRegisterFilter,
    historyRegisterStatusFilter,
    registersQ.data,
  ]);

  const fiscalSettingsQ = useQuery({
    queryKey: ["fiscal-settings", cid],
    queryFn: async () => {
      const { data } = await appwrite
        .from("fiscal_settings")
        .select("*")
        .eq("company_id", cid)
        .maybeSingle();
      return data;
    },
    enabled: !!cid,
  });

  const printSettings = useMemo(() => {
    const saved = localStorage.getItem(`print_settings_${cid}`);
    if (saved) return JSON.parse(saved);
    return {
      header: "AUTO PEÇAS ERP",
      showColumns: true,
      showSummary: true,
      showTotals: true,
      footerMessage: "Obrigado pela preferência!",
      showCnpjAddress: false,
      showCustomerData: false,
      showDetailedInstallments: false,
      receiptWidth: "280",
    };
  }, [cid]);

  const currentSessionSalesQ = useQuery({
    queryKey: ["current-session-sales", cid, currentRegister?.id],
    queryFn: async () => {
      if (!currentRegister) return [];
      const { data, error } = await appwrite
        .from("sales")
        .select("*, profiles(name)")
        .eq("company_id", cid)
        .eq("status", "concluida")
        .eq("created_by", currentRegister.user_id_open)
        .gte("created_at", currentRegister.opened_at)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentRegister && !!cid,
  });

  const [showClosingPreview, setShowClosingPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");

  const getClosingHtml = () => {
    const transactions = ((transactionsQ.data as any[]) || []).filter((tx) => {
      // Se não tem referência a venda, mantém (movimentação manual)
      if (tx.category !== "SALE" || !tx.reference_id) return true;
      // Se tem referência, só mantém se a venda estiver concluída
      return tx.sales?.status === "concluida";
    });
    const sales = currentSessionSalesQ.data || [];

    // Group transactions by payment method and calculate totals
    const methodsSummary = transactions.reduce((acc: any, tx: any) => {
      const m = tx.payment_method;
      const method =
        m === "CASH"
          ? "DINHEIRO"
          : m === "PIX"
            ? "PIX"
            : m === "CREDIT_CARD"
              ? "C. CRÉDITO"
              : m === "DEBIT_CARD"
                ? "C. DÉBITO"
                : m === "BOLETO"
                  ? "BOLETO"
                  : m.toUpperCase();

      if (!acc[method]) acc[method] = 0;
      acc[method] += tx.type === "IN" ? Number(tx.amount) : -Number(tx.amount);
      return acc;
    }, {});

    // Filter out zero totals
    const activeMethods = Object.entries(methodsSummary)
      .filter(([_, amount]) => (amount as number) !== 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    const fiscal = fiscalSettingsQ.data;
    const fiscalHtml =
      printSettings.showCnpjAddress && fiscal
        ? `<div class="center" style="font-size: 10px; margin-bottom: 5px;">
          ${fiscal.razao_social ? `<div>${fiscal.razao_social}</div>` : ""}
          ${fiscal.cnpj ? `<div>CNPJ: ${fiscal.cnpj}</div>` : ""}
          ${fiscal.endereco ? `<div>${fiscal.endereco}</div>` : ""}
         </div>`
        : "";

    const totalIn = transactions
      .filter((t) => t.type === "IN")
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const totalOut = transactions
      .filter((t) => t.type === "OUT")
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const currentCashBalance = (currentRegister?.initial_balance || 0) + totalIn - totalOut;

    return `
      <html>
        <head>
          <title>Resumo de Fechamento de Caixa</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px; 
              line-height: 1.2; 
              padding: 15px; 
              width: ${printSettings.receiptWidth || "280"}px; 
              margin: 0 auto; 
              color: #000; 
            }
            h2 { text-align: center; margin: 0 0 5px 0; font-size: 16px; text-transform: uppercase; }
            .header-text { text-align: center; margin-bottom: 5px; font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .bold { font-weight: bold; }
            .center { text-align: center; }
            .mt { margin-top: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            th { text-align: left; border-bottom: 1px solid #000; font-size: 10px; }
            td { font-size: 10px; padding: 2px 0; }
            .footer { margin-top: 25px; text-align: center; font-size: 10px; }
            .signature { margin-top: 40px; border-top: 1px solid #000; width: 80%; margin-left: auto; margin-right: auto; }
          </style>
        </head>
        <body>
          <h2>RELATÓRIO DE CAIXA</h2>
          ${printSettings.header ? `<div class="header-text">${printSettings.header}</div>` : ""}
          ${fiscalHtml}
          
          <div class="center">Data: ${new Date().toLocaleString("pt-BR")}</div>
          <div class="center">Operador: ${currentUser?.email || "N/A"}</div>
          <div class="divider"></div>
          
          <div class="bold">RESUMO POR MÉTODO</div>
          ${activeMethods
            .map(
              ([method, amount]) => `
            <div class="row"><span>${method}:</span> <span>${brl(amount as number)}</span></div>
          `,
            )
            .join("")}

          
          ${
            printSettings.showSummary
              ? `
          <div class="divider"></div>
          <div class="bold">LISTA DE VENDAS</div>
          <table>
            <thead>
              <tr>
                <th>HORA</th>
                <th>VENDA</th>
                <th style="text-align: right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${
                sales.length === 0
                  ? '<tr><td colspan="3" class="center">Nenhuma venda</td></tr>'
                  : sales
                      .map(
                        (s) => `
                <tr>
                  <td>${new Date(s.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>#${s.number ?? s.id.slice(0, 6)}</td>
                  <td style="text-align: right">${brl(s.total)}</td>
                </tr>
              `,
                      )
                      .join("")
              }
            </tbody>
          </table>`
              : ""
          }
          
          <div class="divider"></div>
          
          <div class="row bold"><span>SALDO INICIAL:</span> <span>${brl(currentRegister?.initial_balance || 0)}</span></div>
          <div class="row bold mt"><span>SALDO FINAL:</span> <span>${brl(currentCashBalance)}</span></div>
          
          <div class="footer">
            <div class="signature"></div>
            <div>Assinatura do Operador</div>
            <div class="mt" style="font-size: 8px;">${printSettings.footerMessage}</div>
            <div style="font-size: 8px;">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintClosing = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const html = getClosingHtml();
    win.document.write(
      html +
        `
      <script>
        window.onload = function() {
          window.print();
          setTimeout(() => window.close(), 500);
        };
      </script>
    `,
    );
    win.document.close();
  };

  // Fetch transactions for current register
  const transactionsQ = useQuery({
    queryKey: ["cash-transactions", currentRegister?.id],
    queryFn: async () => {
      if (!currentRegister) return [];
      const { data, error } = await (appwrite as any)
        .from("cash_transactions")
        .select(
          `
          *,
          sales!reference_id(status)
        `,
        )
        .eq("cash_register_id", currentRegister.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!currentRegister?.id,
  });

  const currentTransactions = useMemo(() => {
    const data = (transactionsQ.data as any[]) || [];
    return data.filter((tx) => {
      if (tx.category !== "SALE" || !tx.reference_id) return true;
      return tx.sales?.status === "concluida";
    });
  }, [transactionsQ.data]);

  const handleAddTransaction = async () => {
    const amount = Number(newTx.amount.replace(",", "."));
    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }

    try {
      await addTransaction({
        ...newTx,
        amount,
      });
      setShowAddTxModal(false);
      setNewTx({
        type: "IN",
        category: "SALE",
        amount: "0,00",
        paymentMethod: "CASH",
        description: "",
      });
      toast.success("Movimentação registrada.");
    } catch (err) {
      // toast handled in hook
    }
  };

  const handleCancelRegister = async (id?: string) => {
    if (
      await confirm({
        title: "Excluir sessão de caixa?",
        description:
          "Esta ação é irreversível. A sessão será excluída permanentemente. Apenas use se o caixa não possui nenhuma movimentação ou venda realizada.",
        confirmLabel: "Sim, Excluir",
        variant: "destructive",
      })
    ) {
      try {
        await cancelRegister(id);
      } catch (err: any) {
        // toast handled in hook
      }
    }
  };

  const totalsByMethod = useMemo(() => {
    const summary = filteredHistory.reduce((acc: any, tx: any) => {
      const m = tx.payment_method;
      const method =
        m === "CASH"
          ? "Dinheiro"
          : m === "PIX"
            ? "PIX"
            : m === "CREDIT_CARD"
              ? "C. Crédito"
              : m === "DEBIT_CARD"
                ? "C. Débito"
                : m === "BOLETO"
                  ? "Boleto"
                  : m;

      if (!acc[method]) acc[method] = 0;
      acc[method] += tx.type === "IN" ? Number(tx.amount) : -Number(tx.amount);
      return acc;
    }, {});

    return Object.fromEntries(
      Object.entries(summary).filter(([_, amount]) => (amount as number) !== 0),
    );
  }, [filteredHistory]);

  const filteredTotals = useMemo(() => {
    const totalIn = filteredHistory
      .filter((t: any) => t.type === "IN")
      .reduce((acc: number, t: any) => acc + Number(t.amount), 0);
    const totalOut = filteredHistory
      .filter((t: any) => t.type === "OUT")
      .reduce((acc: number, t: any) => acc + Number(t.amount), 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [filteredHistory]);

  // Lista de caixas únicos presentes nas movimentações para o filtro
  const registersForFilter = useMemo(() => {
    const map = new Map<string, string>();
    (allTransactionsQ.data || []).forEach((t: any) => {
      if (t.cash_register_id && !map.has(t.cash_register_id)) {
        const op = t.cash_registers?.profiles?.name || "Operador";
        const dt = t.cash_registers?.opened_at
          ? new Date(t.cash_registers.opened_at).toLocaleDateString()
          : "";
        map.set(t.cash_register_id, `${op}${dt ? ` — ${dt}` : ""}`);
      }
    });
    return Array.from(map.entries());
  }, [allTransactionsQ.data]);

  const groupedBySession = useMemo(() => {
    const regs = registersQ.data || [];
    const regById = new Map<string, any>();
    regs.forEach((r: any) => regById.set(r.id, r));

    const groups = new Map<string, { register: any; txs: any[] }>();
    filteredHistory.forEach((tx: any) => {
      const rid = tx.cash_register_id;
      if (!groups.has(rid)) {
        const reg = regById.get(rid) || {
          id: rid,
          opened_at: tx.cash_registers?.opened_at,
          status: "UNKNOWN",
          profiles: tx.cash_registers?.profiles,
          initial_balance: 0,
        };
        groups.set(rid, { register: reg, txs: [] });
      }
      groups.get(rid)!.txs.push(tx);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const da = new Date(a.register.opened_at || 0).getTime();
      const db = new Date(b.register.opened_at || 0).getTime();
      return db - da;
    });
  }, [filteredHistory, registersQ.data]);

  const filteredSessions = useMemo(() => {
    const list = registersQ.data || [];
    if (sessionsStatusFilter === "all") return list;
    return list.filter((r: any) => r.status === sessionsStatusFilter);
  }, [registersQ.data, sessionsStatusFilter]);

  const getTransactionHtml = (tx: any) => {
    const fiscal = fiscalSettingsQ.data;
    const fiscalHtml =
      printSettings.showCnpjAddress && fiscal
        ? `<div class="center" style="font-size: 10px; margin-bottom: 5px;">
          ${fiscal.razao_social ? `<div>${fiscal.razao_social}</div>` : ""}
          ${fiscal.cnpj ? `<div>CNPJ: ${fiscal.cnpj}</div>` : ""}
          ${fiscal.endereco ? `<div>${fiscal.endereco}</div>` : ""}
         </div>`
        : "";
    const methodLabel =
      tx.payment_method === "CASH"
        ? "Dinheiro"
        : tx.payment_method === "PIX"
          ? "PIX"
          : tx.payment_method === "CREDIT_CARD"
            ? "C. Crédito"
            : tx.payment_method === "DEBIT_CARD"
              ? "C. Débito"
              : tx.payment_method === "BOLETO"
                ? "Boleto"
                : tx.payment_method;
    return `
      <html>
        <head>
          <title>Comprovante de Movimentação</title>
          <style>
            @page { margin: 0; }
            body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.3; padding: 15px; width: ${printSettings.receiptWidth || "280"}px; margin: 0 auto; color: #000; }
            h2 { text-align: center; margin: 0 0 5px 0; font-size: 14px; text-transform: uppercase; }
            .header-text { text-align: center; margin-bottom: 5px; font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .bold { font-weight: bold; }
            .center { text-align: center; }
            .big { font-size: 16px; font-weight: bold; }
          </style>
        </head>
        <body>
          <h2>COMPROVANTE DE ${tx.type === "IN" ? "ENTRADA" : "SAÍDA"}</h2>
          ${printSettings.header ? `<div class="header-text">${printSettings.header}</div>` : ""}
          ${fiscalHtml}
          <div class="divider"></div>
          <div class="row"><span>Data/Hora:</span><span>${new Date(tx.created_at).toLocaleString("pt-BR")}</span></div>
          <div class="row"><span>Operador:</span><span>${tx.cash_registers?.profiles?.name || "N/A"}</span></div>
          <div class="row"><span>Categoria:</span><span>${tx.category}</span></div>
          <div class="row"><span>Método:</span><span>${methodLabel}</span></div>
          ${tx.description ? `<div class="divider"></div><div><span class="bold">Descrição:</span><br/>${tx.description}</div>` : ""}
          <div class="divider"></div>
          <div class="row big"><span>${tx.type === "IN" ? "VALOR (+)" : "VALOR (-)"}:</span><span>${brl(tx.amount)}</span></div>
          <div class="divider"></div>
          <div class="center" style="font-size: 9px; margin-top: 15px;">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
        </body>
      </html>
    `;
  };

  const handlePrintTransaction = (tx: any) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      getTransactionHtml(tx) +
        `<script>window.onload=function(){window.print();setTimeout(()=>window.close(),500);};<\/script>`,
    );
    win.document.close();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeading
          icon={Wallet}
          title="Gestão de Caixa"
          subtitle="Acompanhe movimentações, aberturas e fechamentos."
        />
        <div className="flex gap-2 items-center">
          <ValueVisibilityToggle hidden={hidden} canToggle={canToggle} onToggle={toggle} />
          {currentRegister && (
            <Button
              onClick={() => setShowAddTxModal(true)}
              className="bg-brand-orange hover:bg-brand-orange/90"
            >
              <Plus className="mr-2 size-4" /> Nova Movimentação
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-card border border-border h-auto flex-wrap justify-start">
          <TabsTrigger value="history-transactions" className="flex items-center gap-2">
            <ArrowRight className="size-4" /> Movimentações
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="size-4" /> Sessões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history-transactions" className="space-y-4 pt-4">
          <Card className="p-4">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por descrição, categoria, método ou operador..."
                  className="pl-8"
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2 w-full lg:w-auto">
                <Input
                  type="date"
                  className="w-full lg:w-[170px]"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  title="Filtrar por data"
                />
                {historyDateFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setHistoryDateFilter("");
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
              <Select value={historyRegisterFilter} onValueChange={setHistoryRegisterFilter}>
                <SelectTrigger className="w-full lg:w-[220px]">
                  <SelectValue placeholder="Caixa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os caixas</SelectItem>
                  {registersForFilter.map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={historyRegisterStatusFilter}
                onValueChange={(v) => setHistoryRegisterStatusFilter(v as any)}
              >
                <SelectTrigger className="w-full lg:w-[170px]">
                  <SelectValue placeholder="Status do caixa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="OPEN">Caixas abertos</SelectItem>
                  <SelectItem value="CLOSED">Caixas fechados</SelectItem>
                </SelectContent>
              </Select>
              <Select value={historyTypeFilter} onValueChange={setHistoryTypeFilter}>
                <SelectTrigger className="w-full lg:w-[160px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="IN">Entradas (+)</SelectItem>
                  <SelectItem value="OUT">Saídas (-)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={showGroupedBySession ? "default" : "outline"}
                size="sm"
                onClick={() => setShowGroupedBySession((v) => !v)}
                className={showGroupedBySession ? "bg-brand-orange hover:bg-brand-orange/90" : ""}
                title="Agrupar movimentações por sessão de caixa"
              >
                <History className="mr-2 size-4" />
                {showGroupedBySession ? "Ver lista" : "Por sessão"}
              </Button>
            </div>
          </Card>

          {/* Resumo dos filtrados */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 space-y-1 border-l-4 border-success">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold text-success">
                Entradas
              </p>
              <p className="text-base sm:text-lg font-bold text-success">
                {mask(brl(filteredTotals.totalIn))}
              </p>
            </Card>
            <Card className="p-4 space-y-1 border-l-4 border-destructive">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold text-destructive">
                Saídas
              </p>
              <p className="text-base sm:text-lg font-bold text-destructive">
                {mask(brl(filteredTotals.totalOut))}
              </p>
            </Card>
            <Card className="p-4 space-y-1 bg-brand-orange/5 border-brand-orange/20">
              <p className="text-[10px] text-brand-orange uppercase font-semibold">Saldo Líquido</p>
              <p className="text-base sm:text-lg font-bold text-brand-orange">
                {mask(brl(filteredTotals.net))}
              </p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                Lançamentos
              </p>
              <p className="text-base sm:text-lg font-bold">{filteredHistory.length}</p>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-0 overflow-hidden lg:col-span-2">
              <div className="p-4 border-b bg-muted/30">
                <h3 className="font-semibold flex items-center gap-2">
                  {showGroupedBySession ? (
                    <History className="size-4" />
                  ) : (
                    <ArrowRight className="size-4" />
                  )}
                  {showGroupedBySession ? "Movimentações por Sessão" : "Movimentações"}
                </h3>
              </div>
              {showGroupedBySession ? (
                <div className="divide-y">
                  {allTransactionsQ.isLoading ? (
                    <div className="p-8 text-center">Carregando...</div>
                  ) : groupedBySession.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      Nenhuma movimentação encontrada.
                    </div>
                  ) : (
                    groupedBySession.map(({ register, txs }) => {
                      const totIn = txs
                        .filter((t: any) => t.type === "IN")
                        .reduce((a: number, t: any) => a + Number(t.amount), 0);
                      const totOut = txs
                        .filter((t: any) => t.type === "OUT")
                        .reduce((a: number, t: any) => a + Number(t.amount), 0);
                      return (
                        <div key={register.id} className="bg-background">
                          <div className="p-3 bg-muted/30 border-b flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <User className="size-3.5" />
                                {register.profiles?.name || "Operador"}
                                {register.status === "OPEN" ? (
                                  <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                                    ABERTO
                                  </span>
                                ) : register.status === "CLOSED" ? (
                                  <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 text-[10px] font-bold">
                                    FECHADO
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Abertura:{" "}
                                {register.opened_at
                                  ? new Date(register.opened_at).toLocaleString()
                                  : "—"}
                                {register.closed_at && (
                                  <>
                                    {" "}
                                    · Fechamento: {new Date(register.closed_at).toLocaleString()}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-success font-semibold">+ {brl(totIn)}</span>
                              <span className="text-destructive font-semibold">
                                - {brl(totOut)}
                              </span>
                              <span className="font-bold">= {brl(totIn - totOut)}</span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <tbody>
                                {txs.map((tx: any) => (
                                  <tr key={tx.id} className="border-b hover:bg-muted/10">
                                    <td className="p-2 text-xs text-muted-foreground whitespace-nowrap w-[140px]">
                                      {new Date(tx.created_at).toLocaleString()}
                                    </td>
                                    <td className="p-2">
                                      <span className="flex items-center gap-2 text-xs">
                                        {tx.type === "IN" ? (
                                          <ArrowUpCircle className="size-3 text-green-500" />
                                        ) : (
                                          <ArrowDownCircle className="size-3 text-red-500" />
                                        )}
                                        {tx.category}
                                      </span>
                                      {tx.description && (
                                        <p className="text-[10px] text-muted-foreground">
                                          {tx.description}
                                        </p>
                                      )}
                                    </td>
                                    <td className="p-2 text-xs">{tx.payment_method}</td>
                                    <td
                                      className={`p-2 text-right font-medium whitespace-nowrap ${tx.type === "IN" ? "text-green-600" : "text-red-600"}`}
                                    >
                                      {tx.type === "IN" ? "+" : "-"} {brl(tx.amount)}
                                    </td>
                                    <td className="p-2 text-center w-[40px]">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-7"
                                        title="Imprimir comprovante"
                                        onClick={() => handlePrintTransaction(tx)}
                                      >
                                        <Receipt className="size-3.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y">
                    {allTransactionsQ.isLoading ? (
                      <div className="p-8 text-center">Carregando...</div>
                    ) : filteredHistory.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        Nenhuma movimentação encontrada.
                      </div>
                    ) : (
                      filteredHistory.map((tx: any) => (
                        <div key={tx.id} className="p-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              {tx.type === "IN" ? (
                                <ArrowUpCircle className="size-4 text-green-500" />
                              ) : (
                                <ArrowDownCircle className="size-4 text-red-500" />
                              )}
                              {tx.category}
                            </div>
                            <div
                              className={`text-sm font-bold whitespace-nowrap ${tx.type === "IN" ? "text-green-600" : "text-red-600"}`}
                            >
                              {tx.type === "IN" ? "+" : "-"} {brl(tx.amount)}
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                            <span>{new Date(tx.created_at).toLocaleString()}</span>
                            <span>· {tx.payment_method}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Operador: {tx.cash_registers?.profiles?.name || "N/A"}
                          </div>
                          {tx.description && <p className="text-xs">{tx.description}</p>}
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7"
                              onClick={() => handlePrintTransaction(tx)}
                            >
                              <Receipt className="mr-1 size-3.5" /> Imprimir
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/20 border-b">
                          <th className="p-3 text-left">Data/Hora</th>
                          <th className="p-3 text-left">Operador</th>
                          <th className="p-3 text-left">Categoria</th>
                          <th className="p-3 text-left">Método</th>
                          <th className="p-3 text-right">Valor</th>
                          <th className="p-3 text-center w-[60px]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTransactionsQ.isLoading ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center">
                              Carregando...
                            </td>
                          </tr>
                        ) : filteredHistory.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              Nenhuma movimentação encontrada.
                            </td>
                          </tr>
                        ) : (
                          filteredHistory.map((tx: any) => (
                            <tr key={tx.id} className="border-b hover:bg-muted/10">
                              <td className="p-3 text-muted-foreground whitespace-nowrap">
                                {new Date(tx.created_at).toLocaleString()}
                              </td>
                              <td className="p-3">{tx.cash_registers?.profiles?.name || "N/A"}</td>
                              <td className="p-3">
                                <span className="flex items-center gap-2">
                                  {tx.type === "IN" ? (
                                    <ArrowUpCircle className="size-3 text-green-500" />
                                  ) : (
                                    <ArrowDownCircle className="size-3 text-red-500" />
                                  )}
                                  {tx.category}
                                </span>
                                {tx.description && (
                                  <p className="text-[10px] text-muted-foreground">
                                    {tx.description}
                                  </p>
                                )}
                              </td>
                              <td className="p-3 text-xs">{tx.payment_method}</td>
                              <td
                                className={`p-3 text-right font-medium whitespace-nowrap ${tx.type === "IN" ? "text-green-600" : "text-red-600"}`}
                              >
                                {tx.type === "IN" ? "+" : "-"} {brl(tx.amount)}
                              </td>
                              <td className="p-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7"
                                  title="Imprimir comprovante"
                                  onClick={() => handlePrintTransaction(tx)}
                                >
                                  <Receipt className="size-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card className="h-fit">
              <div className="p-4 border-b bg-muted/30">
                <h3 className="font-semibold text-sm">Total por Forma de Pagamento</h3>
              </div>
              <div className="p-4 space-y-3">
                {Object.entries(totalsByMethod).length === 0 ? (
                  <p className="text-center py-4 text-sm text-muted-foreground">
                    Nenhum dado disponível.
                  </p>
                ) : (
                  Object.entries(totalsByMethod).map(([method, amount]: [any, any]) => (
                    <div key={method} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{method}</span>
                      <span className={`font-semibold ${amount >= 0 ? "" : "text-destructive"}`}>
                        {brl(amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold flex items-center gap-2">
                <History className="size-4" /> Histórico de Sessões (Aberturas/Fechamentos)
              </h3>
              <Select
                value={sessionsStatusFilter}
                onValueChange={(v) => setSessionsStatusFilter(v as any)}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os caixas</SelectItem>
                  <SelectItem value="OPEN">Em aberto</SelectItem>
                  <SelectItem value="CLOSED">Fechados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {registersQ.isLoading ? (
                <div className="p-8 text-center">Carregando...</div>
              ) : filteredSessions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  Nenhum histórico encontrado.
                </div>
              ) : (
                filteredSessions.map((reg: any) => (
                  <div key={reg.id} className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <User className="size-3.5" /> {reg.profiles?.name || "N/A"}
                      </div>
                      {reg.is_locked ? (
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                          BLOQUEADO
                        </span>
                      ) : reg.status === "OPEN" ? (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                          ABERTO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-bold">
                          FECHADO
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Abertura: {new Date(reg.opened_at).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Fechamento: {reg.closed_at ? new Date(reg.closed_at).toLocaleString() : "—"}
                    </div>
                    <div className="flex justify-between text-xs pt-1">
                      <span>
                        S. Inicial: <strong>{brl(reg.initial_balance)}</strong>
                      </span>
                      <span>
                        S. Final:{" "}
                        <strong>
                          {reg.final_balance_informed ? brl(reg.final_balance_informed) : "—"}
                        </strong>
                      </span>
                    </div>
                    {isSAdmin && (
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => handleCancelRegister(reg.id)}
                          disabled={isCancelling}
                        >
                          <Trash2 className="mr-1 size-3" /> Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 border-b">
                    <th className="p-3 text-left">Abertura</th>
                    <th className="p-3 text-left">Fechamento</th>
                    <th className="p-3 text-left">Operador</th>
                    <th className="p-3 text-right">S. Inicial</th>
                    <th className="p-3 text-right">S. Final (Inf.)</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {registersQ.isLoading ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center">
                        Carregando...
                      </td>
                    </tr>
                  ) : filteredSessions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Nenhum histórico encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredSessions.map((reg: any) => (
                      <tr key={reg.id} className="border-b hover:bg-muted/10">
                        <td className="p-3">{new Date(reg.opened_at).toLocaleString()}</td>
                        <td className="p-3">
                          {reg.closed_at ? new Date(reg.closed_at).toLocaleString() : "—"}
                        </td>
                        <td className="p-3">{reg.profiles?.name || "N/A"}</td>
                        <td className="p-3 text-right">{brl(reg.initial_balance)}</td>
                        <td className="p-3 text-right font-medium">
                          {reg.final_balance_informed ? brl(reg.final_balance_informed) : "—"}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {reg.is_locked ? (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                                BLOQUEADO
                              </span>
                            ) : reg.status === "OPEN" ? (
                              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">
                                ABERTO
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[10px] font-bold">
                                FECHADO
                              </span>
                            )}
                            {isSAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleCancelRegister(reg.id)}
                                disabled={isCancelling}
                                title="Excluir Sessão"
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal: Nova Movimentação Manual */}
      <Dialog open={showAddTxModal} onOpenChange={setShowAddTxModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lançamento Manual de Caixa</DialogTitle>
            <DialogDescription>
              Registre entradas (recebimentos) ou saídas (sangrias/despesas).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select
                  className="w-full h-10 px-3 border rounded-md"
                  value={newTx.type}
                  onChange={(e) => setNewTx({ ...newTx, type: e.target.value as TransactionType })}
                >
                  <option value="IN">Entrada (+)</option>
                  <option value="OUT">Saída (-)</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <select
                  className="w-full h-10 px-3 border rounded-md"
                  value={newTx.category}
                  onChange={(e) =>
                    setNewTx({ ...newTx, category: e.target.value as TransactionCategory })
                  }
                >
                  <option value="SALE">Venda</option>
                  <option value="PAYMENT_RECEIVED">Recebimento</option>
                  <option value="ADJUSTMENT">Ajuste</option>
                  <option value="WITHDRAWAL">Sangria (Saída)</option>
                  <option value="EXPENSE">Despesa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <select
                  className="w-full h-10 px-3 border rounded-md"
                  value={newTx.paymentMethod}
                  onChange={(e) =>
                    setNewTx({ ...newTx, paymentMethod: e.target.value as PaymentMethodType })
                  }
                >
                  <option value="CASH">Dinheiro</option>
                  <option value="PIX">PIX</option>
                  <option value="CREDIT_CARD">Cartão de Crédito</option>
                  <option value="DEBIT_CARD">Cartão de Débito</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input
                  value={newTx.amount}
                  onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição / Observação</Label>
              <Input
                value={newTx.description}
                onChange={(e) => setNewTx({ ...newTx, description: e.target.value })}
                placeholder="Ex: Sangria para troco"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTxModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddTransaction} disabled={isAddingTransaction}>
              {isAddingTransaction ? "Salvando..." : "Confirmar Lançamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PrintPreviewDialog
        open={showClosingPreview}
        onOpenChange={setShowClosingPreview}
        title={previewTitle}
        content={previewContent}
      />
    </div>
  );
}
