import { makePrefetchLoader } from "@/lib/route-prefetch";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { PageHeading } from "@/components/page-header";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { isSuperAdmin, hasPermission } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/format";
import { qzEnabled, qzPrinterName, qzPrintHtml80mm } from "@/lib/qz-print";
import { receiptStyle } from "@/lib/receipt-style";
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
  ChevronDown,
  ChevronRight,
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
import { Checkbox } from "@/components/ui/checkbox";

import { SmartPagination } from "@/components/smart-pagination";
import { Eye, Receipt } from "lucide-react";
import { SangriaButton, CancelSangriaButton } from "@/components/sangria-actions";

const WEEKDAYS_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function weekdayLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return WEEKDAYS_PT[d.getDay()];
}

export const Route = createFileRoute("/app/fechamento-caixa")({
  loader: makePrefetchLoader(["paymentMethods"]),
  component: CashManagementPage,
});

function CashManagementPage() {
  const { currentCompanyId, user: currentUser } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const goToSalesOfRegister = (reg: any) => {
    const from = (reg.opened_at ? new Date(reg.opened_at) : new Date()).toISOString().slice(0, 10);
    const to = (reg.closed_at ? new Date(reg.closed_at) : new Date()).toISOString().slice(0, 10);
    navigate({
      to: "/app/vendas",
      search: {
        from,
        to,
        rid: reg.id,
      },
    });
  };

  const goToCloseRegister = (reg: any) => {
    navigate({
      to: "/app/vendas",
      search: { close: reg.user_id_open },
    });
  };


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
  const [sessionsOperatorFilter, setSessionsOperatorFilter] = useState<string>("all");
  const [sessionsDateFrom, setSessionsDateFrom] = useState<string>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [sessionsDateTo, setSessionsDateTo] = useState<string>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [sessionsSearch, setSessionsSearch] = useState<string>("");
  const [sessionsFiscalFilter, setSessionsFiscalFilter] = useState<"all" | "with" | "without">("all");
  const [sessionsSort, setSessionsSort] = useState<"opened_desc" | "opened_asc" | "closed_desc" | "closed_asc">("opened_desc");
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsPageSize, setSessionsPageSize] = useState<number>(10);
  const [showGroupedBySession, setShowGroupedBySession] = useState(false);

  const registersQ = useQuery({
    queryKey: ["cash-registers", cid, canSeeAll, currentUser?.id],
    queryFn: async () => {
      let query = (supabase as any)
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

  const fiscalSalesQ = useQuery({
    queryKey: ["fiscal-sales-by-register", cid],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("id, created_at, created_by, fiscal_notes!inner(id, status)")
        .eq("company_id", cid)
        .eq("fiscal_notes.status", "autorizada");
      if (error) throw error;
      return data || [];
    },
    enabled: !!cid,
  });

  const fiscalCountByRegister = useMemo(() => {
    const map: Record<string, number> = {};
    const regs = (registersQ.data as any[]) || [];
    const sales = (fiscalSalesQ.data as any[]) || [];
    for (const s of sales) {
      const ts = new Date(s.created_at).getTime();
      const reg = regs.find(
        (r: any) =>
          r.user_id_open === s.created_by &&
          ts >= new Date(r.opened_at).getTime() &&
          (!r.closed_at || ts <= new Date(r.closed_at).getTime()),
      );
      if (reg) map[reg.id] = (map[reg.id] || 0) + 1;
    }
    return map;
  }, [registersQ.data, fiscalSalesQ.data]);

  const allTransactionsQ = useQuery({
    queryKey: ["all-cash-transactions", cid, canSeeAll, currentUser?.id],
    queryFn: async () => {
      let query = (supabase as any)
        .from("cash_transactions")
        .select("*, cash_registers(opened_at, status, profiles!user_id_open(name))")
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
      const { data } = await supabase
        .from("fiscal_settings")
        .select("*")
        .eq("company_id", cid)
        .maybeSingle();
      return data;
    },
    enabled: !!cid,
  });
  const companyInfoQ = useQuery({
    queryKey: ["company-info", cid],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("name, phone")
        .eq("id", cid)
        .maybeSingle();
      return data;
    },
    enabled: !!cid,
  });
  const buildCompanyHeaderHtml = () => {
    const fiscal = fiscalSettingsQ.data as any;
    const company = companyInfoQ.data as any;
    const name = (company?.name || fiscal?.razao_social || printSettings.header || "").trim();
    const addr = (fiscal?.endereco || "").trim();
    const phone = (company?.phone || "").trim();
    if (!name && !addr && !phone) return "";
    return `${name ? `<div class="header-text">${name}</div>` : ""}${addr ? `<div class="company-sub">${addr}</div>` : ""}${phone ? `<div class="company-sub">Tel: ${phone}</div>` : ""}`;
  };
  const buildReviewHtml = () => {
    const qrUrl = `${window.location.origin}/__l5e/assets-v1/39befd4c-2c54-4182-b44d-7642d3876149/google-review-qr.png`;
    return `<div class="review"><div class="review-text">Faça sua avaliação</div><div class="review-sub">Conte-nos como foi a sua experiência</div><img src="${qrUrl}" alt="QR Avaliação" class="review-qr" /></div>`;
  };
  const REVIEW_CSS = `.company-sub{text-align:center;font-size:10px;margin-bottom:1px}.review{margin-top:15px;padding-top:8px;border-top:1px dashed #000;text-align:center}.review-text{font-size:11px;font-weight:bold;margin-bottom:2px}.review-sub{font-size:10px;margin-bottom:4px}.review-qr{width:110px;height:110px;display:block;margin:0 auto}`;

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
      const { data, error } = await supabase
        .from("sales")
        .select("*, profiles(name)")
        .eq("company_id", cid)
        .in("status", ["concluida", "cancelada"])
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
  const [includeSalesInClosing, setIncludeSalesInClosing] = useState(true);
  const [pendingReprintCtx, setPendingReprintCtx] = useState<{ reg: any; sales: any[] } | null>(null);


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
      printSettings.showCnpjAddress && fiscal && fiscal.cnpj
        ? `<div class="center" style="font-size: 10px; margin-bottom: 5px;"><div>CNPJ: ${fiscal.cnpj}</div></div>`
        : "";
    const headerHtml = buildCompanyHeaderHtml();

    const totalIn = transactions
      .filter((t) => t.type === "IN")
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const totalOut = transactions
      .filter((t) => t.type === "OUT")
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const currentCashBalance = (currentRegister?.initial_balance || 0) + totalIn - totalOut;

    const cancelledSales = sales.filter((s: any) => s.status === "cancelada");
    const totalCanceladas = cancelledSales.reduce((a: number, s: any) => a + Number(s.total || 0), 0);

    return `
      <html>
        <head>
          <title>Resumo de Fechamento de Caixa</title>
          <style>${receiptStyle({ widthPx: printSettings.receiptWidth || "280", fontSizePx: printSettings.fontSizePx, lineHeight: printSettings.lineHeight, boldStrength: printSettings.boldStrength })}</style>
        </head>
        <body>
          <h2>RELATÓRIO DE CAIXA</h2>
          ${headerHtml}
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
                      .map((s) => {
                        const isCancelled = s.status === "cancelada";
                        const style = isCancelled
                          ? ' style="color:#b00020; text-decoration:line-through"'
                          : "";
                        const tag = isCancelled ? " [CANCELADA]" : "";
                        return `
                <tr${style}>
                  <td>${new Date(s.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>#${s.number ?? s.id.slice(0, 6)}${tag}</td>
                  <td style="text-align: right">${brl(s.total)}</td>
                </tr>
              `;
                      })
                      .join("")
              }
            </tbody>
          </table>`
              : ""
          }
          
          <div class="divider"></div>
          
          <div class="row bold"><span>SALDO INICIAL:</span> <span>${brl(currentRegister?.initial_balance || 0)}</span></div>
          ${cancelledSales.length ? `<div class="row" style="color:#b00020"><span>VENDAS CANCELADAS (${cancelledSales.length}):</span> <span>${brl(totalCanceladas)}</span></div>` : ""}
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
      const { data, error } = await (supabase as any)
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

  const groupedByOperator = useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; sessions: typeof groupedBySession; totIn: number; totOut: number }
    >();
    groupedBySession.forEach((s) => {
      const key =
        s.register?.user_id_open ||
        s.register?.profiles?.id ||
        s.register?.profiles?.name ||
        "—";
      const name = s.register?.profiles?.name || "Operador";
      if (!map.has(key)) map.set(key, { key, name, sessions: [], totIn: 0, totOut: 0 });
      const g = map.get(key)!;
      g.sessions.push(s);
      s.txs.forEach((t: any) => {
        if (t.type === "IN") g.totIn += Number(t.amount);
        else if (t.type === "OUT") g.totOut += Number(t.amount);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [groupedBySession]);

  const [expandedOperators, setExpandedOperators] = useState<Set<string>>(new Set());
  const toggleOperator = (k: string) =>
    setExpandedOperators((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const filteredSessions = useMemo(() => {
    let list = registersQ.data || [];
    if (sessionsStatusFilter !== "all") {
      list = list.filter((r: any) => r.status === sessionsStatusFilter);
    }
    if (sessionsOperatorFilter !== "all") {
      list = list.filter((r: any) => r.user_id_open === sessionsOperatorFilter);
    }
    if (sessionsDateFrom) {
      const from = new Date(`${sessionsDateFrom}T00:00:00`).getTime();
      list = list.filter((r: any) => new Date(r.opened_at).getTime() >= from);
    }
    if (sessionsDateTo) {
      const to = new Date(`${sessionsDateTo}T23:59:59`).getTime();
      list = list.filter((r: any) => new Date(r.opened_at).getTime() <= to);
    }
    if (sessionsSearch.trim()) {
      const s = sessionsSearch.trim().toLowerCase();
      list = list.filter((r: any) =>
        (r.profiles?.name || "").toLowerCase().includes(s) ||
        String(r.id).toLowerCase().includes(s),
      );
    }
    if (sessionsFiscalFilter !== "all") {
      list = list.filter((r: any) => {
        const has = (fiscalCountByRegister[r.id] || 0) > 0;
        return sessionsFiscalFilter === "with" ? has : !has;
      });
    }
    const ts = (v: any) => (v ? new Date(v).getTime() : 0);
    list = [...list].sort((a: any, b: any) => {
      switch (sessionsSort) {
        case "opened_asc": return ts(a.opened_at) - ts(b.opened_at);
        case "closed_desc": return ts(b.closed_at) - ts(a.closed_at);
        case "closed_asc": return ts(a.closed_at) - ts(b.closed_at);
        case "opened_desc":
        default: return ts(b.opened_at) - ts(a.opened_at);
      }
    });
    return list;
  }, [
    registersQ.data,
    sessionsStatusFilter,
    sessionsOperatorFilter,
    sessionsDateFrom,
    sessionsDateTo,
    sessionsSearch,
    sessionsFiscalFilter,
    fiscalCountByRegister,
    sessionsSort,
  ]);

  const sessionsTotalPages = Math.max(1, Math.ceil(filteredSessions.length / sessionsPageSize));
  useEffect(() => {
    if (sessionsPage > sessionsTotalPages) setSessionsPage(1);
  }, [sessionsPage, sessionsTotalPages]);
  useEffect(() => {
    setSessionsPage(1);
  }, [sessionsStatusFilter, sessionsOperatorFilter, sessionsDateFrom, sessionsDateTo, sessionsSearch, sessionsSort, sessionsPageSize]);
  const pagedSessions = useMemo(() => {
    const start = (sessionsPage - 1) * sessionsPageSize;
    return filteredSessions.slice(start, start + sessionsPageSize);
  }, [filteredSessions, sessionsPage, sessionsPageSize]);

  const sessionsOperators = useMemo(() => {
    const map = new Map<string, string>();
    (registersQ.data || []).forEach((r: any) => {
      if (r.user_id_open) {
        map.set(r.user_id_open, r.profiles?.name || "Operador");
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [registersQ.data]);

  const getTransactionHtml = (tx: any) => {
    const fiscal = fiscalSettingsQ.data;
    const fiscalHtml =
      printSettings.showCnpjAddress && fiscal && fiscal.cnpj
        ? `<div class="center" style="font-size: 10px; margin-bottom: 5px;"><div>CNPJ: ${fiscal.cnpj}</div></div>`
        : "";
    const headerHtml = buildCompanyHeaderHtml();
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
          <style>${receiptStyle({ widthPx: printSettings.receiptWidth || "280", fontSizePx: printSettings.fontSizePx, lineHeight: printSettings.lineHeight, boldStrength: printSettings.boldStrength })}</style>
        </head>
        <body>
          <h2>COMPROVANTE DE ${tx.type === "IN" ? "ENTRADA" : "SAÍDA"}</h2>
          ${headerHtml}
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

  const buildClosingHtmlForRegister = (
    reg: any,
    sales: any[],
    opts?: { includeSales?: boolean },
  ) => {
    const includeSales = opts?.includeSales !== false;
    const validSales = sales.filter((s: any) => s.status !== "cancelada");
    const cancelledSales = sales.filter((s: any) => s.status === "cancelada");
    const methodsSummary = validSales.reduce((acc: any, s: any) => {
      const m = (s.payment_method || "Dinheiro").toUpperCase();
      acc[m] = (acc[m] || 0) + Number(s.total);
      return acc;
    }, {});
    const activeMethods = Object.entries(methodsSummary)
      .filter(([, amount]) => (amount as number) !== 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));
    const totalVendas = validSales.reduce((a, s) => a + Number(s.total || 0), 0);
    const totalCanceladas = cancelledSales.reduce((a, s) => a + Number(s.total || 0), 0);
    const closedAt = reg.closed_at ? new Date(reg.closed_at).toLocaleString("pt-BR") : "—";
    const operator = reg.profiles?.name || reg.profiles?.email || "N/A";
    const headerHtml = buildCompanyHeaderHtml();
    const salesHtml = includeSales
      ? `
      <div class="bold">VENDAS DETALHADAS</div>
      ${sales.length === 0 ? '<div class="center">Nenhuma venda na sessão</div>' : sales.slice().reverse().map((s: any) => {
        const tm = new Date(s.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
        const num = s.number ?? s.id?.slice(0,8) ?? "-";
        const isCancelled = s.status === "cancelada";
        const wrapperStyle = isCancelled ? 'margin-top:6px;color:#b00020;text-decoration:line-through' : 'margin-top:6px';
        const tag = isCancelled ? ' [CANCELADA]' : '';
        const items = (s.sale_items || []) as any[];
        const itemsHtml = items.map((it) => {
          const name = it?.products?.name || "Item";
          const qty = Number(it.quantity || 0);
          const unit = it?.products?.unit || "un";
          const tot = Number(it.total || 0);
          return `<div class="row"><span>${qty} ${unit} x ${name}</span><span>${brl(tot)}</span></div>`;
        }).join("");
        return `<div style="${wrapperStyle}"><div class="row bold"><span>#${num} ${tm}${tag}</span><span>${brl(Number(s.total||0))}</span></div><div style="font-size:10px">Pgto: ${s.payment_method || "-"}</div>${itemsHtml}</div>`;
      }).join("")}
      <div class="divider"></div>`
      : `<div class="center" style="font-size:10px">Total de vendas: ${validSales.length}${cancelledSales.length ? ` (+ ${cancelledSales.length} cancelada${cancelledSales.length > 1 ? "s" : ""})` : ""}</div><div class="divider"></div>`;
    return `
      <html><head><title>Resumo de Fechamento de Caixa</title>
      <style>${receiptStyle({ widthPx: printSettings.receiptWidth || "280", fontSizePx: printSettings.fontSizePx, lineHeight: printSettings.lineHeight, boldStrength: printSettings.boldStrength })}</style>
      </head><body>
      <h2>FECHAMENTO DE CAIXA</h2>
      ${headerHtml}
      <div class="center">Fechado em: ${closedAt}</div>
      <div class="center">Operador: ${operator}</div>
      <div class="center" style="font-size:10px">(reimpressão)</div>
      <div class="divider"></div>
      ${salesHtml}
      <div class="bold">RESUMO POR MÉTODO</div>
      ${activeMethods.map(([m, a]) => `<div class="row"><span>${m}:</span><span>${brl(a as number)}</span></div>`).join("")}
      <div class="divider"></div>
      <div class="row bold"><span>SALDO INICIAL:</span><span>${brl(Number(reg.initial_balance||0))}</span></div>
      <div class="row bold"><span>TOTAL VENDAS:</span><span>${brl(totalVendas)}</span></div>
      ${cancelledSales.length ? `<div class="row" style="color:#b00020"><span>CANCELADAS (${cancelledSales.length}):</span><span>${brl(totalCanceladas)}</span></div>` : ""}
      <div class="row bold mt"><span>SALDO TOTAL:</span><span>${brl(Number(reg.initial_balance||0) + totalVendas)}</span></div>
      <div class="footer"><div style="margin-top:30px;border-top:1px solid #000;width:80%;margin-left:auto;margin-right:auto"></div><div>Assinatura do Operador</div></div>
      
      </body></html>`;
  };


  const [pendingReprintHtml, setPendingReprintHtml] = useState<string | null>(null);

  const doPrintHtml = async (html: string) => {
    if (qzEnabled(cid) && qzPrinterName(cid)) {
      await qzPrintHtml80mm(html, { widthPx: printSettings.receiptWidth || "280" });
      toast.success("Fechamento enviado para a impressora.");
    } else {
      const win = window.open("", "_blank");
      if (!win) throw new Error("Bloqueio de popup impede a impressão.");
      win.document.write(html + `<script>window.onload=function(){window.print();setTimeout(()=>window.close(),500);};<\/script>`);
      win.document.close();
    }
  };

  const reprintClosingForRegister = async (reg: any) => {
    try {
      const { data: sales, error } = await supabase
        .from("sales")
        .select("id, number, created_at, total, payment_method, status, sale_items(id, quantity, unit_price, total, products(name, sku, unit))")
        .eq("company_id", reg.company_id)
        .eq("created_by", reg.user_id_open)
        .gte("created_at", reg.opened_at)
        .lte("created_at", reg.closed_at)
        .in("status", ["concluida", "cancelada"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      const salesArr = sales || [];
      setIncludeSalesInClosing(true);
      const html = buildClosingHtmlForRegister(reg, salesArr, { includeSales: true });
      const opened = reg.opened_at ? new Date(reg.opened_at).toLocaleString() : "";
      setPreviewTitle(`Reimpressão — Fechamento ${opened}`);
      setPreviewContent(html);
      setPendingReprintHtml(html);
      setPendingReprintCtx({ reg, sales: salesArr });
      setShowClosingPreview(true);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar fechamento.");
    }
  };

  // Regenera preview quando o usuário alterna a inclusão da lista de vendas
  useEffect(() => {
    if (!showClosingPreview || !pendingReprintCtx) return;
    const html = buildClosingHtmlForRegister(
      pendingReprintCtx.reg,
      pendingReprintCtx.sales,
      { includeSales: includeSalesInClosing },
    );
    setPreviewContent(html);
    setPendingReprintHtml(html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSalesInClosing]);

  const confirmReprint = async () => {
    if (!pendingReprintHtml) return;
    const ok = await confirm({
      title: "Reimprimir fechamento?",
      description: "Um novo cupom será enviado para a impressora configurada.",
      confirmLabel: "Reimprimir",
    });
    if (!ok) return;
    try {
      await doPrintHtml(pendingReprintHtml);
      setShowClosingPreview(false);
      setPendingReprintHtml(null);
      setPendingReprintCtx(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reimprimir fechamento.");
    }
  };


  const mapPmToCash = (method: string): "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO" => {
    const m = (method || "dinheiro").toLowerCase();
    if (m.includes("pix")) return "PIX";
    if (m.includes("boleto")) return "BOLETO";
    if (m.includes("débito") || m.includes("debito")) return "DEBIT_CARD";
    if (m.includes("crédito") || m.includes("credito")) return "CREDIT_CARD";
    if (m.includes("cartão") || m.includes("cartao")) return "CREDIT_CARD";
    return "CASH";
  };

  const resyncCashMut = useMutation({
    mutationFn: async (reg: any) => {
      if (!reg) throw new Error("Caixa não informado.");
      let q = supabase
        .from("sales")
        .select("id, created_by, payment_method, total, due_date, status")
        .eq("company_id", cid)
        .eq("status", "concluida")
        .eq("created_by", reg.user_id_open)
        .gte("created_at", reg.opened_at);
      if (reg.closed_at) q = q.lte("created_at", reg.closed_at);
      const { data: sales, error } = await q;
      if (error) throw error;

      let inserted = 0;
      let removed = 0;
      for (const s of sales || []) {
        const { data: payments } = await supabase
          .from("sale_payments")
          .select("method, amount, first_due_date")
          .eq("sale_id", s.id);

        const { data: deleted } = await supabase
          .from("cash_transactions")
          .delete()
          .eq("reference_id", s.id)
          .eq("category", "SALE")
          .select("id");
        removed += deleted?.length || 0;

        const rows: any[] = [];
        if (payments && payments.length > 0) {
          for (const p of payments) {
            if (p.first_due_date) continue;
            if (Number(p.amount) <= 0) continue;
            rows.push({
              company_id: cid,
              cash_register_id: reg.id,
              type: "IN",
              category: "SALE",
              amount: Number(p.amount),
              payment_method: mapPmToCash(p.method),
              description: `Venda #${s.id.slice(0, 8)} - ${p.method}`,
              reference_id: s.id,
              user_id: s.created_by,
            });
          }
        } else if (!s.due_date && Number(s.total) > 0) {
          rows.push({
            company_id: cid,
            cash_register_id: reg.id,
            type: "IN",
            category: "SALE",
            amount: Number(s.total),
            payment_method: mapPmToCash(s.payment_method || "dinheiro"),
            description: `Venda #${s.id.slice(0, 8)}`,
            reference_id: s.id,
            user_id: s.created_by,
          });
        }

        if (rows.length > 0) {
          const { error: insErr } = await supabase.from("cash_transactions").insert(rows);
          if (insErr) throw insErr;
          inserted += rows.length;
        }
      }
      return { sales: sales?.length || 0, inserted, removed };
    },
    onSuccess: (r) => {
      toast.success(
        `Ressincronizado: ${r.sales} venda(s), ${r.removed} removida(s), ${r.inserted} criada(s).`,
      );
      qc.invalidateQueries({ queryKey: ["cash-transactions"] });
      qc.invalidateQueries({ queryKey: ["all-cash-transactions", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid] });
      // Financeiro
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["bank-transactions", cid] });
      // Relatórios
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sale-items-detailed", cid] });
      qc.invalidateQueries({ queryKey: ["movements", cid] });
      qc.invalidateQueries({ queryKey: ["fiscal-notes", cid] });
      qc.invalidateQueries({ queryKey: ["activity-logs", cid] });
    },
    onError: (e: any) => toast.error(e?.message || "Falha ao ressincronizar."),
  });

  const fmtDT = (s?: string | null) =>
    s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

  const handleResyncRegister = async (reg: any) => {
    if (!reg) return;
    const isClosed = !!reg.closed_at;
    const label = isClosed ? "caixa fechado" : "caixa aberto";

    // Preview: contar vendas e transações que serão recriadas
    let salesCount = 0;
    let txToRemove = 0;
    let txToInsert = 0;
    try {
      let q = supabase
        .from("sales")
        .select("id, payment_method, total, due_date")
        .eq("company_id", cid)
        .eq("status", "concluida")
        .eq("created_by", reg.user_id_open)
        .gte("created_at", reg.opened_at);
      if (reg.closed_at) q = q.lte("created_at", reg.closed_at);
      const { data: sales } = await q;
      const ids = (sales || []).map((s) => s.id);
      salesCount = ids.length;

      if (ids.length > 0) {
        const { count } = await supabase
          .from("cash_transactions")
          .select("id", { count: "exact", head: true })
          .eq("category", "SALE")
          .in("reference_id", ids);
        txToRemove = count || 0;

        const { data: pays } = await supabase
          .from("sale_payments")
          .select("sale_id, amount, first_due_date")
          .in("sale_id", ids);
        const bySale = new Map<string, { hasPay: boolean; rows: number }>();
        for (const p of pays || []) {
          const cur = bySale.get(p.sale_id) || { hasPay: false, rows: 0 };
          cur.hasPay = true;
          if (!p.first_due_date && Number(p.amount) > 0) cur.rows += 1;
          bySale.set(p.sale_id, cur);
        }
        for (const s of sales || []) {
          const info = bySale.get(s.id);
          if (info?.hasPay) txToInsert += info.rows;
          else if (!s.due_date && Number(s.total) > 0) txToInsert += 1;
        }
      }
    } catch {
      // segue sem preview
    }

    const periodo = `Período: ${fmtDT(reg.opened_at)} → ${fmtDT(reg.closed_at)}`;
    const resumo = `Resumo do reprocessamento:\n• ${periodo}\n• Vendas concluídas: ${salesCount}\n• Transações a remover: ${txToRemove}\n• Transações a recriar: ${txToInsert}`;
    const aviso = isClosed
      ? "\n\nAtenção: este caixa já foi fechado. Isso pode alterar totais de fechamentos anteriores e relatórios dependentes."
      : "\n\nNão altera vendas nem contas — apenas movimentações de caixa (cash_transactions).";

    const ok = await confirm({
      title: `Ressincronizar ${label}?`,
      description: `${resumo}${aviso}`,
      confirmLabel: "Ressincronizar",
      variant: isClosed ? "destructive" : undefined,
    });
    if (!ok) return;
    resyncCashMut.mutate(reg);
  };


  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeading
          icon={Wallet}
          title="Gestão de Caixa"
          subtitle="Acompanhe movimentações, aberturas e fechamentos."
        />
        <div className="flex gap-2 items-center flex-wrap">
          <ValueVisibilityToggle hidden={hidden} canToggle={canToggle} onToggle={toggle} />
          {isSAdmin && currentRegister && (
            <Button
              variant="outline"
              onClick={() => handleResyncRegister(currentRegister)}
              disabled={resyncCashMut.isPending}
              title="Super admin: regenera cash_transactions retroativos do caixa atual"
            >
              <History className="mr-2 size-4" />
              {resyncCashMut.isPending ? "Ressincronizando..." : "Ressincronizar caixa"}
            </Button>
          )}
          {currentRegister && (
            <SangriaButton
              currentRegister={currentRegister}
              transactions={(transactionsQ.data as any[]) || []}
              addTransaction={addTransaction as any}
            />
          )}
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
                  ) : groupedByOperator.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      Nenhuma movimentação encontrada.
                    </div>
                  ) : (
                    groupedByOperator.map((opGroup) => {
                      const isOpen = expandedOperators.has(opGroup.key);
                      return (
                        <div key={opGroup.key} className="bg-background">
                          <button
                            type="button"
                            onClick={() => toggleOperator(opGroup.key)}
                            className="w-full p-3 bg-muted/50 border-b flex flex-wrap items-center justify-between gap-2 hover:bg-muted/70 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              {isOpen ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                              <User className="size-3.5" />
                              {opGroup.name}
                              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                                {opGroup.sessions.length} sessão(ões)
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-success font-semibold">
                                + {brl(opGroup.totIn)}
                              </span>
                              <span className="text-destructive font-semibold">
                                - {brl(opGroup.totOut)}
                              </span>
                              <span className="font-bold">
                                = {brl(opGroup.totIn - opGroup.totOut)}
                              </span>
                            </div>
                          </button>
                          {isOpen &&
                            opGroup.sessions.map(({ register, txs }) => {
                              const totIn = txs
                                .filter((t: any) => t.type === "IN")
                                .reduce((a: number, t: any) => a + Number(t.amount), 0);
                              const totOut = txs
                                .filter((t: any) => t.type === "OUT")
                                .reduce((a: number, t: any) => a + Number(t.amount), 0);
                              return (
                                <div key={register.id} className="bg-background border-b">
                                  <div className="p-3 pl-8 bg-muted/20 border-b flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-2 text-sm font-medium">
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
                                        {register.opened_at ? (
                                          <>
                                            {new Date(register.opened_at).toLocaleString()}
                                            <div className="opacity-70">{weekdayLabel(register.opened_at)}</div>
                                          </>
                                        ) : "—"}
                                        {register.closed_at && (
                                          <>
                                            {" "}
                                            · Fechamento:{" "}
                                            {new Date(register.closed_at).toLocaleString()}
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs">
                                      <span className="text-success font-semibold">
                                        + {brl(totIn)}
                                      </span>
                                      <span className="text-destructive font-semibold">
                                        - {brl(totOut)}
                                      </span>
                                      <span className="font-bold">= {brl(totIn - totOut)}</span>
                                      {register.status === "CLOSED" && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7"
                                          title="Reimprimir fechamento desta sessão"
                                          onClick={() => void reprintClosingForRegister(register)}
                                        >
                                          <Receipt className="mr-1 size-3.5" /> Reimprimir
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <tbody>
                                        {txs.map((tx: any) => (
                                          <tr key={tx.id} className="border-b hover:bg-muted/10">
                                            <td className="p-2 text-xs text-muted-foreground whitespace-nowrap w-[140px]">
                                              {new Date(tx.created_at).toLocaleString()}
                                              <div className="opacity-70">{weekdayLabel(tx.created_at)}</div>
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
                                            <td className="p-2 text-center w-[80px]">
                                              <div className="flex items-center justify-end gap-1">
                                                <CancelSangriaButton
                                                  tx={tx}
                                                  registerStatus={register.status}
                                                />
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="size-7"
                                                  title="Imprimir comprovante"
                                                  onClick={() => handlePrintTransaction(tx)}
                                                >
                                                  <Receipt className="size-3.5" />
                                                </Button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
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
                            <span>{new Date(tx.created_at).toLocaleString()}<span className="opacity-70 block">{weekdayLabel(tx.created_at)}</span></span>
                            <span>· {tx.payment_method}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Operador: {tx.cash_registers?.profiles?.name || "N/A"}
                          </div>
                          {tx.description && <p className="text-xs">{tx.description}</p>}
                          <div className="flex justify-end gap-2">
                            <CancelSangriaButton
                              tx={tx}
                              registerStatus={tx.cash_registers?.status}
                              size="sm"
                              variant="outline"
                              label="Cancelar"
                            />
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
                          <th className="p-3 text-center w-[120px]">Ações</th>
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
                                <div className="opacity-70">{weekdayLabel(tx.created_at)}</div>
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
                                <div className="flex items-center justify-end gap-1">
                                  <CancelSangriaButton
                                    tx={tx}
                                    registerStatus={tx.cash_registers?.status}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    title="Imprimir comprovante"
                                    onClick={() => handlePrintTransaction(tx)}
                                  >
                                    <Receipt className="size-3.5" />
                                  </Button>
                                </div>
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
            <div className="p-4 border-b bg-muted/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <History className="size-4" /> Histórico de Sessões (Aberturas/Fechamentos)
                </h3>
                <div className="text-xs text-muted-foreground">
                  {filteredSessions.length} sessão(ões)
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por operador ou ID..."
                  className="pl-8"
                  value={sessionsSearch}
                  onChange={(e) => setSessionsSearch(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <Select
                  value={sessionsOperatorFilter}
                  onValueChange={(v) => setSessionsOperatorFilter(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Caixa (operador)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os caixas</SelectItem>
                    {sessionsOperators.map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={sessionsStatusFilter}
                  onValueChange={(v) => setSessionsStatusFilter(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="OPEN">Em aberto</SelectItem>
                    <SelectItem value="CLOSED">Fechados</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={sessionsFiscalFilter}
                  onValueChange={(v) => setSessionsFiscalFilter(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="NFC-e" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">NFC-e: todos</SelectItem>
                    <SelectItem value="with">Com NFC-e emitida</SelectItem>
                    <SelectItem value="without">Sem NFC-e</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Input
                    type="date"
                    value={sessionsDateFrom}
                    onChange={(e) => setSessionsDateFrom(e.target.value)}
                    aria-label="Data inicial"
                  />
                  <Input
                    type="date"
                    value={sessionsDateTo}
                    onChange={(e) => setSessionsDateTo(e.target.value)}
                    aria-label="Data final"
                  />
                </div>
                <Select value={sessionsSort} onValueChange={(v) => setSessionsSort(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ordenar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opened_desc">Abertura (mais recente)</SelectItem>
                    <SelectItem value="opened_asc">Abertura (mais antiga)</SelectItem>
                    <SelectItem value="closed_desc">Fechamento (mais recente)</SelectItem>
                    <SelectItem value="closed_asc">Fechamento (mais antigo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(sessionsSearch ||
                sessionsOperatorFilter !== "all" ||
                sessionsStatusFilter !== "all" ||
                sessionsFiscalFilter !== "all" ||
                sessionsDateFrom ||
                sessionsDateTo) && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setSessionsSearch("");
                      setSessionsOperatorFilter("all");
                      setSessionsStatusFilter("all");
                      setSessionsFiscalFilter("all");
                      setSessionsDateFrom("");
                      setSessionsDateTo("");
                    }}
                  >
                    Limpar filtros
                  </Button>
                </div>
              )}
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
                pagedSessions.map((reg: any) => (
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
                      <div className="opacity-70">{weekdayLabel(reg.opened_at)}</div>
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
                    <div className="flex justify-end gap-2">
                      {reg.status === "OPEN" &&
                        (reg.user_id_open === currentUser?.id || isSAdmin) && (
                          <Button
                            size="sm"
                            className="h-7 bg-brand-red hover:bg-brand-red/90"
                            onClick={() => goToCloseRegister(reg)}
                          >
                            <Lock className="mr-1 size-3" /> Fechar caixa
                          </Button>
                        )}
                      {reg.status === "CLOSED" && (

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => void reprintClosingForRegister(reg)}
                        >
                          <Receipt className="mr-1 size-3" /> Reimprimir
                        </Button>
                      )}
                      {isSAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => handleResyncRegister(reg)}
                          disabled={resyncCashMut.isPending}
                          title="Ressincronizar cash_transactions desta sessão"
                        >
                          <History className="mr-1 size-3" /> Ressinc.
                        </Button>
                      )}
                      {isSAdmin && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => handleCancelRegister(reg.id)}
                          disabled={isCancelling}
                        >
                          <Trash2 className="mr-1 size-3" /> Excluir
                        </Button>
                      )}
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
                    pagedSessions.map((reg: any) => {
                      const accent = reg.is_locked
                        ? "border-l-red-700"
                        : reg.status === "OPEN"
                          ? "border-l-green-500"
                          : "border-l-red-500";
                      const fiscalCount = fiscalCountByRegister[reg.id] || 0;
                      return (
                      <tr key={reg.id} className="border-b hover:bg-muted/10">
                        <td className={`p-3 border-l-4 ${accent}`}>
                          {new Date(reg.opened_at).toLocaleString()}
                          <div className="text-muted-foreground opacity-70 text-xs flex items-center gap-2">
                            <span>{weekdayLabel(reg.opened_at)}</span>
                            {fiscalCount > 0 && (
                              <span
                                className="inline-flex items-center gap-1 text-blue-700"
                                title={`${fiscalCount} venda(s) com NFC-e autorizada nesta sessão`}
                              >
                                <Receipt className="size-3" />
                                {fiscalCount} NFC-e
                              </span>
                            )}
                          </div>
                        </td>
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
                            {reg.is_locked && (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                                BLOQUEADO
                              </span>
                            )}

                            {reg.status === "OPEN" &&
                              (reg.user_id_open === currentUser?.id || isSAdmin) && (
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-[11px] bg-brand-red hover:bg-brand-red/90"
                                  onClick={() => goToCloseRegister(reg)}
                                  title="Fechar este caixa"
                                >
                                  <Lock className="mr-1 size-3" /> Fechar
                                </Button>
                              )}
                            {reg.status === "CLOSED" && (

                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6"
                                  onClick={() => goToSalesOfRegister(reg)}
                                  title="Ver vendas deste caixa (para emitir NFC-e pendentes)"
                                >
                                  <Eye className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-6"
                                  onClick={() => void reprintClosingForRegister(reg)}
                                  title="Reimprimir fechamento"
                                >
                                  <Receipt className="size-3" />
                                </Button>
                              </>
                            )}
                            {isSAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={() => handleResyncRegister(reg)}
                                disabled={resyncCashMut.isPending}
                                title="Ressincronizar cash_transactions"
                              >
                                <History className="size-3" />
                              </Button>
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
                      );
                    })
                  )}
                </tbody>
                {filteredSessions.length > 0 && (() => {
                  const totInit = filteredSessions.reduce((s: number, r: any) => s + Number(r.initial_balance || 0), 0);
                  const totFinal = filteredSessions.reduce((s: number, r: any) => s + Number(r.final_balance_informed || 0), 0);
                  const totNet = totFinal - totInit;
                  return (
                    <tfoot>
                      <tr className="bg-muted/30 border-t font-semibold">
                        <td className="p-3" colSpan={3}>
                          Totais ({filteredSessions.length} sessão(ões))
                        </td>
                        <td className="p-3 text-right">{brl(totInit)}</td>
                        <td className="p-3 text-right">{brl(totFinal)}</td>
                        <td className="p-3 text-right text-brand-orange">
                          <div className="text-[10px] font-normal text-muted-foreground">Líquido (Final − Inicial)</div>
                          {brl(totNet)}
                        </td>
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>
            {filteredSessions.length > 0 && (() => {
              const totInit = filteredSessions.reduce((s: number, r: any) => s + Number(r.initial_balance || 0), 0);
              const totFinal = filteredSessions.reduce((s: number, r: any) => s + Number(r.final_balance_informed || 0), 0);
              const totNet = totFinal - totInit;
              return (
                <div className="md:hidden p-3 border-t bg-muted/30 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">S. Inicial</div>
                    <div className="font-semibold">{brl(totInit)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">S. Final</div>
                    <div className="font-semibold">{brl(totFinal)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Líquido</div>
                    <div className="font-semibold text-brand-orange">{brl(totNet)}</div>
                  </div>
                </div>
              );
            })()}
            {filteredSessions.length > 0 && (
              <div className="p-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Mostrando {(sessionsPage - 1) * sessionsPageSize + 1}–
                    {Math.min(sessionsPage * sessionsPageSize, filteredSessions.length)} de{" "}
                    {filteredSessions.length}
                  </span>
                  <Select
                    value={String(sessionsPageSize)}
                    onValueChange={(v) => setSessionsPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-7 w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} / pág.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <SmartPagination
                  currentPage={sessionsPage}
                  totalPages={sessionsTotalPages}
                  onPageChange={setSessionsPage}
                />
              </div>
            )}
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
        onOpenChange={(o) => {
          setShowClosingPreview(o);
          if (!o) {
            setPendingReprintHtml(null);
            setPendingReprintCtx(null);
          }
        }}
        title={previewTitle}
        content={previewContent}
        onConfirm={pendingReprintHtml ? confirmReprint : undefined}
        extras={
          pendingReprintCtx ? (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={includeSalesInClosing}
                onCheckedChange={(v) => setIncludeSalesInClosing(v === true)}
              />
              <span>Incluir lista detalhada de vendas no cupom</span>
            </label>
          ) : null
        }
      />

    </div>
  );
}
