import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useAuth } from "@/lib/auth-context";
import { useValueVisibility } from "@/hooks/use-value-visibility";
import {
  fetchProducts,
  fetchPartners,
  fetchSalesPaginated,
  fetchBrands,
  registerSale,
  fetchPaymentMethods,
  upsertPaymentMethod,
  upsertPartner,
  isSuperAdmin,
  fetchMyMembership,
  fetchTeam,
  
  deleteSale,
  cancelSale,
  updateSaleItems,
  editSaleFull,
  hasPermission,
  finalizeOpenSale,
  reopenSaleToCart,
  updateProduct,
  fetchCurrentOpenRegister,
  addCashTransaction,
  fetchProductReferencesByCompany,
} from "@/lib/db";
import { getCustomerCreditBalance, applyCustomerCredit } from "@/lib/customer-credits";
import { CancelSaleDialog } from "@/components/cancel-sale-dialog";
import { buildRefsSearchMap, buildRefsBrandMap, productMatchesBrand } from "@/lib/product-search";
import { SalePaymentsEditor, type PaymentRow, findVoucherMethodId, redistributeAfterVoucher } from "@/components/sale-payments-editor";
import type { SalePaymentInput } from "@/lib/db-types";
import { BarcodeScanInput } from "@/components/barcode-scan-input";
import { generateStockCode, validateStockCode } from "@/lib/stock-code";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SmartPagination } from "@/components/smart-pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus,
  Trash2,
  ShoppingCart,
  Receipt,
  Search,
  Check,
  AlertCircle,
  ArrowDownUp,
  Eye,
  EyeOff,
  User,
  CalendarClock,
  CreditCard,
  Lock as LockIcon,
  Barcode,
  X,
  Pencil,
  Ban,
  History,
  Printer,
  Loader2,
  ArrowLeft,
  MailCheck,
  MailX,
  MailWarning,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PrintButton } from "@/components/print-button";

import { printList } from "@/lib/print-list";
import { brl, dt, brlNumber, parseCurrencyInput, formatCurrencyInput } from "@/lib/format";
import { maskPhone, maskCpfCnpj } from "@/lib/masks";
import { toast } from "sonner";
import { cn, normalize, compareProductNames } from "@/lib/utils";
import type { Product } from "@/lib/db-types";
import { ClampedDescription } from "@/components/clamped-description";
import { useConfirm } from "@/components/confirm-dialog";
import { OverdueTasksDialog, useOverdueTasks } from "@/components/overdue-tasks-dialog";

import { useCashRegister, PaymentMethodType } from "@/hooks/use-cash-register";
import { SangriaButton } from "@/components/sangria-actions";
import { PrintPreviewDialog } from "@/components/print-preview-dialog";
import { SaleProgressDialog, type ProgressStep } from "@/components/sale-progress-dialog";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";
import { qzEnabled, qzPrinterName, qzPrintHtml80mm, qzConnect, qzPrintTestReceipt } from "@/lib/qz-print";
import { receiptStyle } from "@/lib/receipt-style";
import { EditSaleDialog } from "@/components/edit-sale-dialog";
import { SaleEditTimeline } from "@/components/sale-edit-timeline";
import { NfceButton } from "@/components/nfce-button";
import { useServerFn } from "@tanstack/react-start";
import { emitNfce, fetchNfceReceipt80mm } from "@/lib/nfce.functions";
import { printNfceReceipt80mm } from "@/lib/print-danfe";

import { useStockReservation } from "@/hooks/use-stock-reservation";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

type VendasSearch = { from?: string; to?: string; rid?: string; close?: string };
export const Route = createFileRoute("/app/vendas")({
  validateSearch: (search: Record<string, unknown>): VendasSearch => {
    const out: VendasSearch = {};
    if (typeof search.from === "string") out.from = search.from;
    if (typeof search.to === "string") out.to = search.to;
    if (typeof search.rid === "string") out.rid = search.rid;
    if (typeof search.close === "string") out.close = search.close;
    return out;
  },

  loader: makePrefetchLoader(["clients", "paymentMethods", "locations"]),
  component: SalesPage,
});

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  stock: number;
  description?: string | null;
}

interface OpenCartSaleItem {
  product_id: string;
  quantity: number | string;
  unit_price: number | string;
  products?: { name?: string | null; sku?: string | null } | null;
}

interface OpenCartSale {
  id: string;
  number?: number | string | null;
  status?: string | null;
  customer_id?: string | null;
  discount?: number | string | null;
  sale_items?: OpenCartSaleItem[];
}

type DiscountMode = "valor" | "percentual";

interface PaymentMethodForm {
  name: string;
  requires_due_date: boolean;
  active: boolean;
}

const emptyPaymentMethod: PaymentMethodForm = {
  name: "",
  requires_due_date: false,
  active: true,
};

function ProductPickerSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="w-full px-5 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function CartItemSkeleton() {
  return (
    <TableRow>
      <TableCell className="align-top">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20 mt-1" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-8 w-16" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-8 w-24 ml-auto" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-8 w-8" />
      </TableCell>
    </TableRow>
  );
}

function CartItemSkeletonMobile() {
  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-8 w-8 shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}

function CartDialogItemSkeleton() {
  return (
    <div className="bg-muted/30 rounded-xl border border-muted-foreground/10 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-8 w-8 shrink-0" />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 space-y-1 text-right">
          <Skeleton className="h-3 w-12 ml-auto" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      </div>
    </div>
  );
}

function SalesPage() {
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [finalizeStep, setFinalizeStep] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressSaleId, setProgressSaleId] = useState<string | null>(null);
  const updateProgressStep = (id: string, patch: Partial<ProgressStep>) =>
    setProgressSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const startProgress = (steps: ProgressStep[], saleId?: string) => {
    setProgressSteps(steps);
    setProgressSaleId(saleId ?? null);
    setProgressOpen(true);
  };


  const superAdminQ = useQuery({ queryKey: ["is-super-admin"], queryFn: isSuperAdmin });
  const membershipQ = useQuery({
    queryKey: ["my-membership", cid],
    queryFn: async () => {
      const m = await fetchMyMembership(cid);
      if (!m || !user?.id) return m;
      const { data: prof } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      return { ...m, profile: prof } as any;
    },
    enabled: !!cid && !!user?.id,
  });

  const vendasPermQ = useQuery({
    queryKey: ["has_permission", cid, "vendas", "edit", user?.id],
    queryFn: () => hasPermission(cid, "vendas", "edit"),
    enabled: !!cid && !!user,
  });

  const canOpenCashQ = useQuery({
    queryKey: ["has_permission", cid, "fechamento-caixa-abrir", "view", user?.id],
    queryFn: () => hasPermission(cid, "fechamento-caixa-abrir", "view"),
    enabled: !!cid && !!user,
  });

  const isManager = !!vendasPermQ.data;
  const isSAdmin = !!superAdminQ.data;
  const canOpenCash = isSAdmin || !!canOpenCashQ.data;
  const hasSpecialAccess = isManager || isSAdmin;

  const [saleSearchTerm, setSaleSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("venda");
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("sales_pageSize");
    return saved ? Number(saved) : 50;
  });
  // State and Query moved further down after activeRegisterUserId is declared

  // Manter fetchProducts por enquanto para o seletor de produtos (carrinho) que precisa de busca local rápida/offline
  const productsQ = useQuery({
    queryKey: ["products-all", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
  });
  const productRefsQ = useQuery({
    queryKey: ["product_references", cid],
    queryFn: () => fetchProductReferencesByCompany(cid),
    enabled: !!cid,
  });
  const stockReservation = useStockReservation(cid);
  const companySettingsQ = useQuery({
    queryKey: ["company-settings", cid],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings" as any)
        .select("*")
        .eq("company_id", cid)
        .maybeSingle();
      return data;
    },
    enabled: !!cid,
  });
  const customersQ = useQuery({
    queryKey: ["partners", cid],
    queryFn: () => fetchPartners(cid),
    enabled: !!cid,
  });
  const brandsQ = useQuery({
    queryKey: ["brands", cid],
    queryFn: () => fetchBrands(cid),
    enabled: !!cid,
  });
  // const salesQ = useQuery({ queryKey: ["sales", cid], queryFn: () => fetchSales(cid, 300), enabled: !!cid });
  const paymentMethodsQ = useQuery({
    queryKey: ["payment_methods", cid],
    queryFn: () => fetchPaymentMethods(cid),
    enabled: !!cid,
  });
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

  const [selectedOpeningUserId, setSelectedOpeningUserId] = useState<string>("");

  const teamQ = useQuery({
    queryKey: ["team", cid],
    queryFn: () => fetchTeam(cid),
    enabled: !!cid && hasSpecialAccess,
  });

  const SELECTED_CAIXA_USER_KEY = `selected_caixa_user_${cid}`;
  const [activeRegisterUserId, setActiveRegisterUserId] = useState<string | undefined>(() => {
    const saved = localStorage.getItem(SELECTED_CAIXA_USER_KEY);
    return saved || user?.id;
  });
  const SAVED_SALE_KEY = `saved_sale_${cid}_${activeRegisterUserId || "default"}`;
  const loadedKey = useRef<string | null>(null);
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem(`${SAVED_SALE_KEY}_items`);
    try {
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [currentSaleId, setCurrentSaleId] = useState<string | null>(() => {
    return localStorage.getItem(`${SAVED_SALE_KEY}_saleId`);
  });
  const [reopenedFromNumber, setReopenedFromNumber] = useState<string | null>(() => {
    return localStorage.getItem(`${SAVED_SALE_KEY}_reopenedNumber`);
  });

  const validateSessionAction = () => {
    if (items.length > 0) {
      toast.error("Não é possível realizar esta ação com itens no carrinho (venda em aberto).");
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (user?.id && !activeRegisterUserId) {
      setActiveRegisterUserId(user.id);
    }
  }, [user?.id, activeRegisterUserId]);

  const { hidden: cashHidden, canToggle: cashCanToggle, toggle: cashToggle, mask: cashMask } = useValueVisibility("fluxo-caixa");


  const {
    currentRegister,
    isLoading: isCashLoading,
    allOpenRegisters,
    openRegister,
    isOpening,
    addTransaction,
    lockRegister,
    unlockRegister,
    closeRegister,
    isClosing,
    isUnlocking,
    cancelRegister,
    isCancelling,
  } = useCashRegister(activeRegisterUserId);

  const [isCartHydrated, setIsCartHydrated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIsCartHydrated(true), 0);
    return () => clearTimeout(t);
  }, []);


  const availableUsers = useMemo(() => {
    if (!teamQ.data || !allOpenRegisters) return [];
    const openUserIds = new Set(allOpenRegisters.map((r: any) => r.user_id_open));
    return teamQ.data.filter((m) => !openUserIds.has(m.user_id) && !(m as any).is_blocked);
  }, [teamQ.data, allOpenRegisters]);

  // Pré-seleciona o usuário logado no dropdown de abertura de caixa
  useEffect(() => {
    if (!selectedOpeningUserId && user?.id && availableUsers.some((m) => m.user_id === user.id)) {
      setSelectedOpeningUserId(user.id);
    }
  }, [user?.id, availableUsers, selectedOpeningUserId]);

  const isCashOpen = currentRegister?.status === "OPEN";
  const isLocked = currentRegister?.is_locked;

  const currentSessionSalesQ = useQuery({
    queryKey: ["current-session-sales", cid, currentRegister?.id],
    queryFn: async () => {
      if (!isCashOpen || !currentRegister) return [];
      const { data, error } = await supabase
        .from("sales")
        .select(
          "*, profiles(name), sale_items(id, product_id, quantity, unit_price, total, products(name, sku, unit)), fiscal_notes(id,status)",
        )
        .eq("company_id", cid)
        .eq("created_by", currentRegister.user_id_open)
        .gte("created_at", currentRegister.opened_at)
        .in("status", ["concluida", "cancelada"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isCashOpen && !!cid && !!user?.id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentSessionOpenSalesQ = useQuery({
    queryKey: ["current-session-open-sales", cid, currentRegister?.id],
    queryFn: async () => {
      if (!isCashOpen || !currentRegister) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("id,status,created_at")
        .eq("company_id", cid)
        .eq("created_by", currentRegister.user_id_open)
        .gte("created_at", currentRegister.opened_at)
        .eq("status", "aberta");
      if (error) throw error;
      return data;
    },
    enabled: isCashOpen && !!cid && !!user?.id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentSessionSaleIds = useMemo(
    () => ((currentSessionSalesQ.data as any[]) || []).map((s) => s.id).filter(Boolean),
    [currentSessionSalesQ.data],
  );

  const currentSessionFiscalNotesQ = useQuery({
    queryKey: ["current-session-fiscal-notes", cid, currentRegister?.id, currentSessionSaleIds],
    queryFn: async () => {
      if (!isCashOpen || !currentRegister || currentSessionSaleIds.length === 0) return [];
      const { data, error } = await supabase
        .from("fiscal_notes")
        .select("id,status,sale_id")
        .eq("company_id", cid)
        .in("sale_id", currentSessionSaleIds)
        .in("status", ["autorizada", "processando", "cancelada", "rejeitada"]);
      if (error) throw error;
      return data || [];
    },
    enabled: isCashOpen && !!cid && !!currentRegister && currentSessionSaleIds.length > 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentTransactionsQ = useQuery({
    queryKey: ["cash-transactions", currentRegister?.id],
    queryFn: async () => {
      if (!currentRegister) return [];
      const { data, error } = await (supabase as any)
        .from("cash_transactions")
        .select("*")
        .eq("cash_register_id", currentRegister.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentRegister?.id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentSessionCashSalesQ = useQuery({
    queryKey: ["current-session-cash-sales", cid, currentRegister?.id],
    queryFn: async () => {
      if (!isCashOpen || !currentRegister || !cid) return [];
      const { data, error } = await (supabase as any)
        .from("sales")
        .select("id,status,total,type,cash_register_id,created_by,created_at,payment_method")
        .eq("company_id", cid)
        .gte("created_at", currentRegister.opened_at)
        .in("status", ["concluida", "cancelada"])
        .or(`cash_register_id.eq.${currentRegister.id},created_by.eq.${currentRegister.user_id_open}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: isCashOpen && !!cid && !!currentRegister?.id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const currentCashSummary = useMemo(() => {
    if (!currentRegister) {
      return { openingBalance: 0, grossSales: 0, returns: 0, withdrawals: 0, netSales: 0, balance: 0 };
    }
    const openingBalance = Number(currentRegister.initial_balance || 0);
    const sales = (currentSessionCashSalesQ.isSuccess
      ? (currentSessionCashSalesQ.data as any[])
      : (currentSessionSalesQ.data as any[])) || [];
    const saleById = new Map(sales.map((s) => [String(s.id), s]));
    const hasSalesSnapshot = currentSessionCashSalesQ.isSuccess || currentSessionSalesQ.isSuccess;
    const grossSales = sales
      .filter((s) => s.status === "concluida" && s.type !== "devolucao")
      .reduce((acc, s) => acc + Number(s.total || 0), 0);
    const returns = sales
      .filter((s) => s.type === "devolucao" && s.status === "concluida")
      .reduce((acc, s) => acc + Number(s.total || 0), 0);
    const withdrawals = ((currentTransactionsQ.data as any[]) || [])
      .filter((t) => t.type === "OUT" && t.category === "WITHDRAWAL")
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const txTotal =
      (currentTransactionsQ.data as any[])?.reduce((acc, t) => {
        // O financeiro só trabalha com vendas efetivadas (concluídas).
        // Se a transação for do tipo SALE, verificamos se a venda está concluída.
        if (t.category === "SALE" && t.reference_id) {
          const sale = saleById.get(String(t.reference_id));
          if (hasSalesSnapshot && (!sale || sale.status !== "concluida" || sale.type === "devolucao")) {
            return acc;
          }
        }
        return acc + (t.type === "IN" ? Number(t.amount) : -Number(t.amount));
      }, 0) || 0;
    const netSales = grossSales - returns - withdrawals;
    return {
      openingBalance,
      grossSales,
      returns,
      withdrawals,
      netSales,
      balance: openingBalance + txTotal - returns,
    };
  }, [
    currentRegister,
    currentTransactionsQ.data,
    currentSessionCashSalesQ.data,
    currentSessionCashSalesQ.isSuccess,
    currentSessionSalesQ.data,
    currentSessionSalesQ.isSuccess,
  ]);
  const currentCashBalance = currentCashSummary.balance;


  const [openingBalanceRaw, setOpeningBalanceRaw] = useState("0,00");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [managerWantsToOpen, setManagerWantsToOpen] = useState(false);
  const [viewingProductDesc, setViewingProductDesc] = useState<any>(null);
  const lastClosingKey = cid ? `ap.lastClosingHtml.${cid}` : "ap.lastClosingHtml";
  const [lastClosingHtml, setLastClosingHtmlState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(lastClosingKey);
    } catch {
      return null;
    }
  });
  const setLastClosingHtml = (html: string | null) => {
    setLastClosingHtmlState(html);
    try {
      if (html) localStorage.setItem(lastClosingKey, html);
      else localStorage.removeItem(lastClosingKey);
    } catch {
      /* noop */
    }
  };
  useEffect(() => {
    try {
      setLastClosingHtmlState(localStorage.getItem(lastClosingKey));
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastClosingKey]);
  const [closingAuthOpen, setClosingAuthOpen] = useState(false);

  const handleOpenRegister = async () => {
    if (!canOpenCash) {
      toast.error("Você não tem permissão para abrir caixa.");
      return;
    }
    const val = parseCurrencyInput(openingBalanceRaw);
    if (val <= 0) {
      toast.error("O saldo inicial deve ser maior que zero.");
      return;
    }
    const targetUid = hasSpecialAccess ? selectedOpeningUserId : user?.id;
    await openRegister({
      initialBalance: val,
      userId: targetUid,
    });
    if (targetUid) {
      setActiveRegisterUserId(targetUid);
      localStorage.setItem(SELECTED_CAIXA_USER_KEY, targetUid);
    }
    setManagerWantsToOpen(false);
  };

  const printClosing80mm = async (html: string) => {
    try {
      if (qzEnabled(cid) && qzPrinterName(cid)) {
        await qzPrintHtml80mm(html, { widthPx: printSettings.receiptWidth || "280" });
        toast.success("Fechamento enviado para a impressora.");
      } else {
        const win = window.open("", "_blank");
        if (!win) throw new Error("Bloqueio de popup impede a impressão.");
        win.document.write(
          html +
            `<script>window.onload=function(){window.print();setTimeout(()=>window.close(),500);};<\/script>`,
        );
        win.document.close();
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha ao imprimir o fechamento.", {
        duration: 15000,
        action: { label: "Reimprimir", onClick: () => void printClosing80mm(html) },
      });
    }
  };

  const buildClosingHtmlFromRegister = (
    reg: any,
    sales: any[],
    operatorEmail?: string | null,
    opts?: { includeSales?: boolean; reprint?: boolean },
  ) => {
    const includeSales = opts?.includeSales !== false;
    const isReprint = opts?.reprint === true;
    const validSales = sales.filter((s: any) => s.status !== "cancelada");
    const methodsSummary = validSales.reduce((acc: any, s: any) => {
      const m = (s.payment_method || "Dinheiro").toUpperCase();
      acc[m] = (acc[m] || 0) + Number(s.total);
      return acc;
    }, {});
    const activeMethods = Object.entries(methodsSummary)
      .filter(([, amount]) => (amount as number) !== 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));
    const totalVendas = validSales.reduce((a, s) => a + Number(s.total || 0), 0);
    const closedAt = reg.closed_at ? new Date(reg.closed_at).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
    const salesHtml = includeSales
      ? `
      <div class="bold">VENDAS DETALHADAS</div>
      ${sales.length === 0 ? '<div class="center">Nenhuma venda na sessão</div>' : sales.slice().reverse().map((s: any) => {
        const tm = new Date(s.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
        const num = s.number ?? s.sale_number ?? s.id?.slice(0,8) ?? "-";
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
      : `<div class="center" style="font-size:10px">Total de vendas: ${validSales.length}</div><div class="divider"></div>`;
    return `
      <html><head><title>Resumo de Fechamento de Caixa</title>
      <style>${receiptStyle({ widthPx: printSettings.receiptWidth || "280", fontSizePx: printSettings.fontSizePx, lineHeight: printSettings.lineHeight, boldStrength: printSettings.boldStrength })}</style>
      </head><body>
      <h2>FECHAMENTO DE CAIXA</h2>
      <div class="center">Data: ${closedAt}</div>
      <div class="center">Operador: ${operatorEmail || "N/A"}</div>
      ${isReprint ? '<div class="center" style="font-size:10px">(reimpressão)</div>' : ''}
      <div class="divider"></div>
      ${salesHtml}
      <div class="bold">RESUMO POR MÉTODO</div>
      ${activeMethods.map(([m, a]) => `<div class="row"><span>${m}:</span><span>${brl(a as number)}</span></div>`).join("")}
      <div class="divider"></div>
      <div class="row bold"><span>SALDO INICIAL:</span><span>${brl(Number(reg.initial_balance||0))}</span></div>
      <div class="row bold"><span>TOTAL VENDAS:</span><span>${brl(totalVendas)}</span></div>
      <div class="row bold mt"><span>SALDO TOTAL:</span><span>${brl(Number(reg.initial_balance||0) + totalVendas)}</span></div>
      <div class="footer"><div style="margin-top:30px;border-top:1px solid #000;width:80%;margin-left:auto;margin-right:auto"></div><div>Assinatura do Operador</div></div>
      </body></html>`;
  };


  const reprintLastClosing = async () => {
    try {
      if (lastClosingHtml) {
        await printClosing80mm(lastClosingHtml);
        return;
      }
      if (!cid) return;
      const { data: reg, error } = await supabase
        .from("cash_registers")
        .select("id, opened_at, closed_at, initial_balance, user_id_open")
        .eq("company_id", cid)
        .eq("status", "CLOSED")
        .order("closed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!reg) {
        toast.error("Nenhum fechamento anterior encontrado.");
        return;
      }
      const { data: sales, error: e2 } = await supabase
        .from("sales")
        .select("id, created_at, total, payment_method, status, sale_items(id, quantity, unit_price, total, products(name, sku, unit))")
        .eq("company_id", cid)
        .eq("created_by", reg.user_id_open)
        .gte("created_at", reg.opened_at)
        .lte("created_at", reg.closed_at)
        .neq("status", "cancelada")
        .order("created_at", { ascending: true });
      if (e2) throw e2;
      const html = buildClosingHtmlFromRegister(reg, sales || [], user?.email);
      setLastClosingHtml(html);
      await printClosing80mm(html);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao reimprimir fechamento.");
    }
  };

  const performCloseAndPrint = async () => {
    const openSalesCount =
      currentSessionOpenSalesQ.data?.length || 0;
    if (openSalesCount > 0) {
      toast.error(
        `Não é possível fechar o caixa pois existem ${openSalesCount} venda(s) em aberto.`,
      );
      return;
    }

    setIsVerifying(true);
    try {
      // Sangria de recolhimento: zera o saldo de caixa deixando o saldo inicial
      const initial = Number(currentRegister?.initial_balance || 0);
      const remaining = Number((currentCashBalance - initial).toFixed(2));
      if (remaining > 0) {
        try {
          await addTransaction({
            type: "OUT",
            category: "WITHDRAWAL",
            amount: remaining,
            paymentMethod: "CASH",
            description: "Recolhimento de fechamento — saldo consolidado",
          });
        } catch (e: any) {
          // não bloqueia o fechamento, apenas avisa
          toast.warning(`Não foi possível registrar a sangria final: ${e?.message || e}`);
        }
      }

      const counts = { cash: 0, pix: 0, card: 0 };
      let totalInformed = 0;
      paymentMethods
        .filter((pm) => pm.active)
        .forEach((pm) => {
          const raw = methodCounts[pm.id] || "0,00";
          const val = parseCurrencyInput(raw);
          totalInformed += val;
          const name = pm.name.toLowerCase();
          if (name.includes("dinheiro") || name === "cash") counts.cash += val;
          else if (name.includes("pix")) counts.pix += val;
          else if (
            name.includes("cartão") ||
            name.includes("credito") ||
            name.includes("débito") ||
            name.includes("card")
          ) {
            counts.card += val;
          } else {
            counts.cash += val;
          }
        });

      const regSnapshot = currentRegister;
      await closeRegister({ informedBalance: totalInformed, counts });

      // Buscar dados frescos para montar o fechamento completo (evita usar cache vazio)
      let html = getClosingHtml();
      let salesForCtx: any[] = [];
      let regForCtx: any = regSnapshot;
      try {
        if (regSnapshot?.id && cid) {
          const { data: regFresh } = await supabase
            .from("cash_registers")
            .select("id, opened_at, closed_at, initial_balance, user_id_open")
            .eq("id", regSnapshot.id)
            .maybeSingle();
          const reg = regFresh || regSnapshot;
          const { data: salesFresh } = await supabase
            .from("sales")
            .select(
              "id, number, created_at, total, payment_method, status, sale_items(id, quantity, unit_price, total, products(name, sku, unit))",
            )
            .eq("company_id", cid)
            .eq("created_by", reg.user_id_open)
            .gte("created_at", reg.opened_at)
            .lte("created_at", reg.closed_at || new Date().toISOString())
            .in("status", ["concluida", "cancelada"])
            .order("created_at", { ascending: true });
          salesForCtx = salesFresh || [];
          regForCtx = reg;
          html = buildClosingHtmlFromRegister(reg, salesForCtx, user?.email, { includeSales: true });
        }
      } catch (fetchErr) {
        console.warn("Falha ao buscar dados frescos do fechamento, usando cache.", fetchErr);
      }

      setLastClosingHtml(html);
      setShowCloseModal(false);
      setPassword("");
      const nowStr = new Date().toLocaleString("pt-BR");
      setPreviewTitle(`Fechamento — ${nowStr}`);
      setPreviewContent(html);
      setPendingClosingHtml(html);
      setPendingClosingCtx({ reg: regForCtx, sales: salesForCtx, operatorEmail: user?.email });
      setIncludeSalesClosing(true);
      setShowClosingPreview(true);

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCloseRegister = () => {
    if (!validateSessionAction()) return;
    if (hasSpecialAccess) {
      void performCloseAndPrint();
    } else {
      setClosingAuthOpen(true);
    }
  };

  const getClosingHtml = () => {
    if (!currentRegister) return "Nenhum caixa aberto";

    // Reutilizando a lógica do app.fechamento-caixa.tsx para consistência
      const sales = (currentSessionSalesQ.data || []).filter((s) => s.status === "concluida");

    // Agrupar por método
    const methodsSummary = sales.reduce((acc: any, s: any) => {
      const m = (s.payment_method || "Dinheiro").toUpperCase();
      if (!acc[m]) acc[m] = 0;
      acc[m] += Number(s.total);
      return acc;
    }, {});

    const activeMethods = Object.entries(methodsSummary)
      .filter(([_, amount]) => (amount as number) !== 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    const totalVendas = sales.reduce((acc, s) => acc + Number(s.total), 0);

    return `
      <html>
        <head>
          <title>Resumo de Fechamento de Caixa</title>
          <style>${receiptStyle({ widthPx: printSettings.receiptWidth || "280", fontSizePx: printSettings.fontSizePx, lineHeight: printSettings.lineHeight, boldStrength: printSettings.boldStrength })}</style>
        </head>
        <body>
          <h2>FECHAMENTO DE CAIXA</h2>
          <div class="center">Data: ${new Date().toLocaleString("pt-BR")}</div>
          <div class="center">Operador: ${user?.email || "N/A"}</div>
          <div class="divider"></div>
          <div class="bold">VENDAS DETALHADAS</div>
          ${sales.length === 0 ? '<div class="center">Nenhuma venda na sessão</div>' : sales.slice().reverse().map((s: any) => {
            const dt = new Date(s.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            const num = s.sale_number || s.id?.slice(0, 8) || "-";
            const items = (s.sale_items || []) as any[];
            const itemsHtml = items.map((it) => {
              const name = it?.products?.name || "Item";
              const qty = Number(it.quantity || 0);
              const unit = it?.products?.unit || "un";
              const tot = Number(it.total || 0);
              return `<div class="row"><span>${qty} ${unit} x ${name}</span><span>${brl(tot)}</span></div>`;
            }).join("");
            return `
              <div style="margin-top:6px;">
                <div class="row bold"><span>#${num} ${dt}</span><span>${brl(Number(s.total || 0))}</span></div>
                <div style="font-size:10px;">Pgto: ${(s.payment_method || "-")}</div>
                ${itemsHtml}
              </div>
            `;
          }).join("")}
          <div class="divider"></div>
          <div class="bold">RESUMO POR MÉTODO</div>
          ${activeMethods.map(([method, amount]) => `<div class="row"><span>${method}:</span> <span>${brl(amount as number)}</span></div>`).join("")}
          <div class="divider"></div>
          <div class="row bold"><span>SALDO INICIAL:</span> <span>${brl(currentRegister.initial_balance)}</span></div>
          <div class="row bold"><span>TOTAL VENDAS:</span> <span>${brl(totalVendas)}</span></div>
          <div class="row bold mt"><span>SALDO TOTAL:</span> <span>${brl(currentRegister.initial_balance + totalVendas)}</span></div>
          <div class="footer">
            <div style="margin-top: 30px; border-top: 1px solid #000; width: 80%; margin-left: auto; margin-right: auto;"></div>
            <div>Assinatura do Operador</div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintClosing = () => {
    void printClosing80mm(getClosingHtml());
  };

  // Prévia/teste do cupom de fechamento, usando exatamente as configurações
  // de impressão salvas em Configurações → Impressão.
  const handleTestClosingReceipt = () => {
    const html = currentRegister
      ? getClosingHtml().replace(
          "<h2>FECHAMENTO DE CAIXA</h2>",
          '<h2>FECHAMENTO DE CAIXA</h2><div class="center" style="font-size:10px">*** PRÉVIA / TESTE ***</div>',
        )
      : `<html><head><title>Prévia de Fechamento</title><style>${receiptStyle({ widthPx: printSettings.receiptWidth || "280", fontSizePx: printSettings.fontSizePx, lineHeight: printSettings.lineHeight, boldStrength: printSettings.boldStrength })}</style></head><body>
          <h2>FECHAMENTO DE CAIXA</h2>
          <div class="center" style="font-size:10px">*** PRÉVIA / TESTE ***</div>
          <div class="center">Data: ${new Date().toLocaleString("pt-BR")}</div>
          <div class="center">Operador: ${user?.email || "N/A"}</div>
          <div class="divider"></div>
          <div class="bold">VENDAS DETALHADAS</div>
          <div style="margin-top:6px"><div class="row bold"><span>#0001 10:00</span><span>${brl(58)}</span></div><div style="font-size:10px">Pgto: DINHEIRO</div><div class="row"><span>1 un x Produto exemplo</span><span>${brl(58)}</span></div></div>
          <div class="divider"></div>
          <div class="bold">RESUMO POR MÉTODO</div>
          <div class="row"><span>DINHEIRO:</span><span>${brl(58)}</span></div>
          <div class="divider"></div>
          <div class="row bold"><span>SALDO INICIAL:</span><span>${brl(100)}</span></div>
          <div class="row bold"><span>TOTAL VENDAS:</span><span>${brl(58)}</span></div>
          <div class="row bold mt"><span>SALDO TOTAL:</span><span>${brl(158)}</span></div>
          <div class="footer"><div class="signature"></div><div>Assinatura do Operador</div></div>
        </body></html>`;
    void printClosing80mm(html);
  };

  // Cancelamento de venda agora usa o CancelSaleDialog (motivo + escolha ressarcir/crédito num único modal).

  const deleteSaleMut = useMutation({
    mutationFn: (id: string) => deleteSale(id),
    onSuccess: () => {
      toast.success("Venda excluída e estoque/financeiro restaurados.");
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["movements", cid] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-open-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-cash-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-cash-register", cid] });
      qc.invalidateQueries({ queryKey: ["all-open-registers", cid] });
      qc.invalidateQueries({ queryKey: ["cash-registers", cid] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir venda"),
  });

  const paymentsHaveAutoNfce = (pmts: typeof payments) => {
    const usedMethodIds = new Set(
      pmts.map((p) => p.payment_method_id).filter(Boolean) as string[],
    );
    const usedMethods = paymentMethods.filter((m) => usedMethodIds.has(m.id));
    const nonVoucherMethods = usedMethods.filter((m) => m.id !== voucherMethodId);
    return (
      nonVoucherMethods.length > 0 &&
      nonVoucherMethods.some((m) => !!(m as any).auto_issue_nfce)
    );
  };

  const finalizeOpenMut = useMutation({
    mutationFn: async (saleId: string) => {
      const showNfceStep = nfType === "nfce" && paymentsHaveAutoNfce(payments);
      const initialSteps: ProgressStep[] = [
        { id: "register", label: "Finalizando venda em aberto", status: "running" },
        { id: "credit", label: "Aplicando crédito do cliente", status: "skipped" },
        ...(showNfceStep
          ? ([{ id: "nfce", label: "Emitindo NFC-e", status: "pending" }] as ProgressStep[])
          : []),
        { id: "print", label: "Imprimindo comprovante", status: "pending" },
      ];
      startProgress(initialSteps, saleId);

      try {
        await finalizeOpenSale(
          saleId,
          selectedPaymentMethod?.name ?? payments[0]?.method,
          total,
          payments.length > 0 ? (payments as SalePaymentInput[]) : undefined,
        );
        try {
          await supabase.from("sales").update({ nf_type: nfType } as any).eq("id", saleId);
        } catch (e) {
          console.warn("Falha ao persistir nf_type na finalização", e);
        }
        updateProgressStep("register", { status: "done", detail: "Venda finalizada." });
        return saleId;
      } catch (e: any) {
        updateProgressStep("register", { status: "error", detail: e?.message || "Falha ao finalizar." });
        updateProgressStep("nfce", { status: "skipped" });
        updateProgressStep("print", { status: "skipped" });
        throw e;
      }
    },
    onSuccess: async (saleId) => {
      const soldItems = items.map((i) => ({
        product_id: i.product_id,
        unit_price: i.unit_price,
        name: i.name,
      }));
      void syncMissingProductPrices(soldItems);
      const paymentsSnapshot = [...payments];

      // Dispara a impressão do cupom EM PARALELO com a emissão da NFC-e,
      // para não travar o operador enquanto a nota é gerada.
      const persistedAutoPrint =
        typeof window !== "undefined" &&
        localStorage.getItem(`auto_print_coupon_${cid}`) === "true";
      const shouldAutoPrint = persistedAutoPrint || autoPrintCoupon;
      const printPromise: Promise<void> = shouldAutoPrint
        ? (async () => {
            updateProgressStep("print", { status: "running", detail: "Imprimindo cupom de vendas..." });
            try {
              await Promise.resolve(
                handlePrintSale(
                  {
                    id: saleId,
                    items,
                    subtotal,
                    discount: discountAmount,
                    total,
                    paymentMethod:
                      paymentsSnapshot
                        .map((p: any) => p?.method)
                        .filter(Boolean)
                        .join(" + ") ||
                      selectedPaymentMethod?.name ||
                      "Dinheiro",
                    payments: paymentsSnapshot,
                  },
                  { auto: true },
                ),
              );
              updateProgressStep("print", { status: "done", detail: "Impressão enviada." });
            } catch (e: any) {
              updateProgressStep("print", { status: "error", detail: e?.message || "Falha ao imprimir." });
            }
          })()
        : (updateProgressStep("print", {
            status: "skipped",
            detail: "Impressão automática desativada nas configurações desta venda.",
          }),
          Promise.resolve());

      // Roda emissão da NFC-e e impressão em paralelo
      await Promise.allSettled([
        triggerAutoOrAskNfce(saleId, paymentsSnapshot),
        printPromise,
      ]);





      localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_customerId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountMode`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountValueRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountPctRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_paymentMethodId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_dueDate`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_amountReceivedRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_payments`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_reopenedNumber`);

      setItems([]);
      setCurrentSaleId(null);
      setReopenedFromNumber(null);
      setDiscountValueRaw("0,00");
      setDiscountPctRaw("0");
      setShowDiscountFields(false);
      setAmountReceivedRaw("0,00");
      setCustomerId("none"); setNfType("nfce"); localStorage.removeItem(`${SAVED_SALE_KEY}_nfType`);
      setDueDate("");
      setPaymentMethodId("");
      setPayments([]);
      setCurrentPage(1);
      stockReservation.releaseAll();

      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["movements", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-cash-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-open-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
      setFinalizeStep(null);
    },

    onError: (e: any) => {
      setFinalizeStep(null);
      toast.error(e.message);
    },
  });

  const updateSaleMut = useMutation({
    mutationFn: (data: { saleId: string; items: CartItem[]; discount: number; reason: string }) =>
      updateSaleItems(data.saleId, cid, data.items, data.discount, data.reason),
    onSuccess: () => {
      toast.success("Venda atualizada com sucesso!");
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
      setEditingSale(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editSaleFullMut = useMutation({
    mutationFn: ({ saleId, payload }: { saleId: string; payload: any }) =>
      editSaleFull(saleId, payload),
    onSuccess: () => {
      toast.success("Venda atualizada com sucesso!");
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["sale-edit-logs"] });
      qc.invalidateQueries({ queryKey: ["sale-detail"] });
      setEditingSale(null);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao editar venda"),
  });

  // Reabre uma venda concluída para o carrinho (modo edição)
  const reopenToCartMut = useMutation({
    mutationFn: async (sale: any) => {
      await reopenSaleToCart(sale.id, currentRegister?.user_id_open || activeRegisterUserId);
      // Sempre buscar itens do banco — o objeto da lista não traz sale_items
      const { data: itemsData, error: itemsErr } = await supabase
        .from("sale_items")
        .select("product_id, quantity, unit_price, products(name, sku)")
        .eq("sale_id", sale.id);
      if (itemsErr) throw itemsErr;
      return { ...sale, sale_items: itemsData ?? [] };
    },
    onSuccess: (sale: any) => {
      void restoreOpenSaleToCart(sale, { highlight: true, switchTab: true, notify: true });

      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-cash-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-open-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });

      // Rola para o topo / abre o carrinho
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    },
    onError: (e: any) => toast.error(e.message || "Erro ao reabrir venda"),
  });



  
  const [cancelDialogSale, setCancelDialogSale] = useState<any | null>(null);
  const [creditApplied, setCreditApplied] = useState<number>(0);
  const [editingSale, setEditingSale] = useState<any | null>(null);
  const [authDialog, setAuthDialog] = useState<{
    isOpen: boolean;
    onSuccess: (reason: string) => void;
    title: string;
    description: string;
    requireReason: boolean;
    skipAuth: boolean;
    module?: string;
    action?: "edit" | "delete" | "view" | "create";
  }>({
    isOpen: false,
    onSuccess: (_reason: string) => {},
    title: "",
    description: "",
    requireReason: false,
    skipAuth: false,
  });

  const handleToggleLock = async () => {
    if (!validateSessionAction()) return;
    if (
      await confirm({
        title: "Bloquear caixa?",
        description: "O caixa ficará pausado até que seja desbloqueado com senha.",
        confirmLabel: "Bloquear",
      })
    ) {
      try {
        await lockRegister();
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const handleCancelRegister = async () => {
    if (!validateSessionAction()) return;

    const fiscalNotesResult = await currentSessionFiscalNotesQ.refetch();
    const hasFiscalNote =
      sessionHasFiscalNote ||
      ((fiscalNotesResult.data as any[]) || []).some((n) =>
        ["autorizada", "processando", "cancelada", "rejeitada"].includes(
          String(n.status || "").toLowerCase(),
        ),
      );
    if (hasFiscalNote) {
      toast.error(
        "Não é possível cancelar a abertura porque já existe venda com nota fiscal emitida nesta sessão.",
      );
      return;
    }

    const concludedSales =
      currentSessionSalesQ.data?.filter((s) => s.status === "concluida").length || 0;
    if (concludedSales > 0 && !isSAdmin) {
      toast.error(
        "Não é possível cancelar a abertura pois já existem vendas concluídas neste caixa.",
      );
      return;
    }


    if (
      await confirm({
        title: "Cancelar abertura de caixa?",
        description:
          "Esta ação é irreversível. Todos os lançamentos manuais vinculados a este caixa aberto serão excluídos permanentemente. Apenas use se o caixa foi aberto por engano e não houver nenhuma venda realizada.",
        confirmLabel: "Sim, Cancelar e Excluir",
        variant: "destructive",
      })
    ) {
      try {
        await cancelRegister(undefined);
      } catch (err: any) {}
    }
  };

  // Authorization helper for sale actions (cancel/edit/delete).
  // Rule: Admin / Gerente / Super Admin sempre pulam a senha (apenas informam motivo).
  // Usuário comum precisa de credenciais de admin/gerente para autorizar.
  const requestSaleAuthorization = (opts: {
    title: string;
    description: string;
    module?: string;
    action?: "edit" | "delete" | "view" | "create";
    requireReason?: boolean;
    onAuthorized: (reason: string) => void;
  }) => {
    const skipAuth = hasSpecialAccess;
    setAuthDialog({
      isOpen: true,
      title: opts.title,
      description: skipAuth ? "Confirme esta ação informando o motivo." : opts.description,
      requireReason: opts.requireReason ?? true,
      skipAuth,
      module: opts.module,
      action: opts.action,
      onSuccess: (reason) => opts.onAuthorized(reason),
    });
  };
  const brands = brandsQ.data ?? [];
  const brandsById = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);

  const products = productsQ.data ?? [];
  const restoreOpenSaleToCart = useMemo(
    () => async (
      sale: OpenCartSale,
      opts?: { highlight?: boolean; switchTab?: boolean; notify?: boolean },
    ) => {
      const rawItems = Array.isArray(sale.sale_items) ? sale.sale_items : [];
      const cartItems: CartItem[] = rawItems.map((si) => {
        const prod = products.find((p) => p.id === si.product_id);
        return {
          product_id: si.product_id,
          name: prod?.name ?? si.products?.name ?? "Produto",
          sku: prod?.sku ?? si.products?.sku ?? "",
          quantity: Number(si.quantity),
          unit_price: Number(si.unit_price),
          stock: Number(prod?.stock ?? 0) + Number(si.quantity),
          description: prod?.description ?? null,
        };
      });

      setItems(cartItems);
      setCurrentSaleId(sale.id);
      setCustomerId(sale.customer_id || "none");

      const disc = Number(sale.discount ?? 0);
      if (disc > 0) {
        setDiscountMode("valor");
        setDiscountValueRaw(disc.toFixed(2).replace(".", ","));
        setShowDiscountFields(true);
      } else {
        setDiscountValueRaw("0,00");
        setDiscountPctRaw("0");
        setShowDiscountFields(false);
      }

      setPayments([]);
      setPaymentMethodId("");
      setAmountReceivedRaw("0,00");
      setDueDate("");

      const num = sale.number ? String(sale.number) : (sale.id?.slice(0, 6) ?? "");
      if (opts?.highlight !== false) setReopenedFromNumber(num);
      try {
        if (opts?.highlight !== false) localStorage.setItem(`${SAVED_SALE_KEY}_reopenedNumber`, num);
        localStorage.setItem(`${SAVED_SALE_KEY}_items`, JSON.stringify(cartItems));
        localStorage.setItem(`${SAVED_SALE_KEY}_saleId`, sale.id);
        localStorage.setItem(`${SAVED_SALE_KEY}_customerId`, sale.customer_id || "none");
        localStorage.setItem(`${SAVED_SALE_KEY}_discountMode`, "valor");
        localStorage.setItem(
          `${SAVED_SALE_KEY}_discountValueRaw`,
          disc > 0 ? disc.toFixed(2).replace(".", ",") : "0,00",
        );
        localStorage.setItem(`${SAVED_SALE_KEY}_discountPctRaw`, "0");
        localStorage.setItem(`${SAVED_SALE_KEY}_paymentMethodId`, "");
        localStorage.setItem(`${SAVED_SALE_KEY}_dueDate`, "");
        localStorage.setItem(`${SAVED_SALE_KEY}_amountReceivedRaw`, "0,00");
        localStorage.setItem(`${SAVED_SALE_KEY}_payments`, JSON.stringify([]));
      } catch {}

      if (opts?.switchTab !== false) setActiveTab("venda");
      if (opts?.notify) {
        toast.success(
          `Venda #${num} reaberta no carrinho. Finalize novamente quando concluir as alterações.`,
        );
      }
      return cartItems;
    },
    [SAVED_SALE_KEY, products],
  );
  useEffect(() => {
    if (!currentSaleId || !isCashOpen || items.length > 0 || productsQ.isLoading) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, number, status, customer_id, discount, sale_items(product_id, quantity, unit_price, products(name, sku))",
        )
        .eq("id", currentSaleId)
        .eq("status", "aberta")
        .maybeSingle();
      if (cancelled || error || !data) return;
      void restoreOpenSaleToCart(data as unknown as OpenCartSale, {
        highlight: true,
        switchTab: true,
        notify: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSaleId, isCashOpen, items.length, productsQ.isLoading, restoreOpenSaleToCart]);

  const productRefsMap = useMemo(
    () => buildRefsSearchMap(productRefsQ.data ?? [], brandsById),
    [productRefsQ.data, brandsById],
  );
  const productRefsBrandMap = useMemo(
    () => buildRefsBrandMap(productRefsQ.data ?? []),
    [productRefsQ.data],
  );
  const [productBrandFilter, setProductBrandFilter] = useState<string>("all");
  const customers = (customersQ.data ?? []).filter(
    (p) => p.type === "cliente" || p.type === "ambos",
  );
  // O array sales já é populado pelo infinite query acima
  // const sales = salesQ.data ?? [];
  const paymentMethods = paymentMethodsQ.data ?? [];
  const [methodCounts, setMethodCounts] = useState<Record<string, string>>({});

  const sessionHasFiscalNote = useMemo(() => {
    const validStatuses = ["autorizada", "processando", "cancelada", "rejeitada"];
    const notes = (currentSessionFiscalNotesQ.data as any[]) || [];
    if (notes.some((n) => validStatuses.includes(String(n.status || "").toLowerCase()))) {
      return true;
    }
    const list = (currentSessionSalesQ.data as any[]) || [];
    return list.some((s) =>
      Array.isArray(s.fiscal_notes) &&
      s.fiscal_notes.some((n: any) => validStatuses.includes(String(n.status || "").toLowerCase())),
    );
  }, [currentSessionFiscalNotesQ.data, currentSessionSalesQ.data]);

  const methodCalculatedBalances = useMemo(() => {
    if (!currentRegister) return {};
    const balances: Record<string, number> = {};
    const norm = (s: string) =>
      (s || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const paymentMethodMatches = (pm: any, value: unknown) => {
      const target = norm(String(value || ""));
      if (!target) return false;
      const name = norm(pm.name);
      if (name === target || name.includes(target) || target.includes(name)) return true;
      if (target === "cash" && (name.includes("dinheiro") || name.includes("cash"))) return true;
      if (target === "pix" && name.includes("pix")) return true;
      if (
        target === "credit_card" &&
        (name.includes("credito") || (name.includes("cartao") && !name.includes("debito")))
      ) {
        return true;
      }
      if (
        target === "debit_card" &&
        (name.includes("debito") || (name.includes("cartao") && !name.includes("credito")))
      ) {
        return true;
      }
      if (target === "boleto" && name.includes("boleto")) return true;
      return false;
    };

    paymentMethods.forEach((pm) => {
      balances[pm.id] = 0;
    });

    // O saldo inicial entra UMA única vez, no método "Dinheiro" principal
    // (evita duplicar quando existem variações como "Dinheiro - Sem Nota").
    const cashMethods = paymentMethods.filter((pm) => norm(pm.name).includes("dinheiro"));
    const primaryCash =
      cashMethods.find((pm) => norm(pm.name) === "dinheiro") || cashMethods[0];
    if (primaryCash) {
      balances[primaryCash.id] = Number(currentRegister.initial_balance || 0);
    }


    const cashSales = (currentSessionCashSalesQ.isSuccess
      ? (currentSessionCashSalesQ.data as any[])
      : (currentSessionSalesQ.data as any[])) || [];
    const cashSaleById = new Map(cashSales.map((s) => [String(s.id), s]));
    const hasCashSalesSnapshot = currentSessionCashSalesQ.isSuccess || currentSessionSalesQ.isSuccess;

    // Soma movimentações reais do caixa por método; SALE usa o enum salvo na transação.
    (currentTransactionsQ.data as any[])?.forEach((t) => {
      if (t.category === "SALE" && t.reference_id) {
        const sale = cashSaleById.get(String(t.reference_id));
        if (hasCashSalesSnapshot && (!sale || sale.status !== "concluida" || sale.type === "devolucao")) {
          return;
        }
      }
      const pm = paymentMethods.find((p) => paymentMethodMatches(p, t.payment_method));
      if (pm) balances[pm.id] += t.type === "IN" ? Number(t.amount) : -Number(t.amount);
    });

    // Fallback para vendas sem cash_transaction vinculada.
    const seenSaleTx = new Set(
      ((currentTransactionsQ.data as any[]) || [])
        .filter((t) => t.category === "SALE" && t.reference_id)
        .map((t) => String(t.reference_id)),
    );
    cashSales.forEach((s) => {
      if (s.status !== "concluida") return;
      if (s.type === "devolucao") return;
      if (seenSaleTx.has(String(s.id))) return;
      const pm = paymentMethods.find((p) => paymentMethodMatches(p, s.payment_method));
      if (pm) balances[pm.id] = (balances[pm.id] || 0) + Number(s.total || 0);
    });
    cashSales.forEach((s) => {
      if (s.status !== "concluida" || s.type !== "devolucao") return;
      const pm = paymentMethods.find((p) => paymentMethodMatches(p, s.payment_method));
      if (pm) balances[pm.id] = (balances[pm.id] || 0) - Number(s.total || 0);
    });
    return balances;
  }, [
    currentRegister,
    currentTransactionsQ.data,
    currentSessionCashSalesQ.data,
    currentSessionCashSalesQ.isSuccess,
    currentSessionSalesQ.data,
    currentSessionSalesQ.isSuccess,
    paymentMethods,
  ]);

  useEffect(() => {
    if (!showCloseModal) return;
    const counts: Record<string, string> = {};
    paymentMethods
      .filter((pm) => pm.active)
      .forEach((pm) => {
        counts[pm.id] = formatCurrencyInput(
          String((methodCalculatedBalances[pm.id] || 0).toFixed(2)),
        );
      });
    setMethodCounts(counts);
  }, [showCloseModal, methodCalculatedBalances, paymentMethods]);

  const [currentPage, setCurrentPage] = useState(1);
  // pageSize state is used directly
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({
    key: "created_at",
    direction: "desc",
  });
  const [statusFilter, setStatusFilter] = useState<string>("todas");
  const routeSearch = Route.useSearch();
  const viewingClosedRegister = Boolean(routeSearch.rid);
  const [dateFromFilter, setDateFromFilter] = useState<string>(
    () => routeSearch.from ?? new Date().toISOString().split("T")[0],
  );
  const [dateToFilter, setDateToFilter] = useState<string>(
    () => routeSearch.to ?? new Date().toISOString().split("T")[0],
  );
  // Sincroniza quando navegação altera o range (ex.: vindo do fechamento de caixa)
  useEffect(() => {
    if (routeSearch.from) setDateFromFilter(routeSearch.from);
    if (routeSearch.to) setDateToFilter(routeSearch.to);
    if (routeSearch.from || routeSearch.to || routeSearch.rid) {
      setStatusFilter("todas");
      setCurrentPage(1);
    }
    if (routeSearch.rid) {
      setTimeout(() => document.getElementById("historico")?.scrollIntoView({ behavior: "smooth" }), 0);
    }
  }, [routeSearch.from, routeSearch.to, routeSearch.rid]);

  const salesQ = useQuery({
    queryKey: [
      "sales-paginated",
      cid,
      saleSearchTerm,
      statusFilter,
      dateFromFilter,
      dateToFilter,
      activeRegisterUserId,
      routeSearch.rid,
      currentPage,
      pageSize,
    ],
    queryFn: () =>
      fetchSalesPaginated({
        companyId: cid,
        page: currentPage - 1,
        pageSize: pageSize,
        search: saleSearchTerm,
        status: statusFilter,
        dateFrom: dateFromFilter,
        dateTo: dateToFilter,
        userId: viewingClosedRegister ? undefined : (activeRegisterUserId && !hasSpecialAccess ? activeRegisterUserId : undefined),
        cashRegisterId: routeSearch.rid,
      }),
    enabled: !!cid,
  });

  const sales = useMemo(() => {
    return salesQ.data?.data ?? [];
  }, [salesQ.data]);

  const totalSalesCount = salesQ.data?.count ?? 0;

  // Map de NFC-e ativas (autorizada/processando) por venda → bloqueia
  // edição/cancelamento até que a nota seja cancelada na SEFAZ.
  const saleIds = useMemo(() => sales.map((s: any) => s.id), [sales]);
  const activeFiscalNotesQ = useQuery({
    queryKey: ["sales-active-fiscal-notes", cid, saleIds],
    queryFn: async () => {
      if (!cid || saleIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase
        .from("fiscal_notes")
        .select("sale_id, status")
        .eq("company_id", cid)
        .in("sale_id", saleIds)
        .in("status", ["autorizada", "processando", "cancelada"]);
      const map: Record<string, string> = {};
      for (const r of (data as any[]) ?? []) {
        if (r.sale_id) map[r.sale_id] = r.status;
      }
      return map;
    },
    enabled: !!cid && saleIds.length > 0,
  });
  const activeNoteMap = activeFiscalNotesQ.data ?? {};

  // Map: venda → ref da NFC-e, para verificar se o e-mail (XML+PDF) foi enviado
  const fiscalNoteRefsQ = useQuery({
    queryKey: ["sales-fiscal-note-refs", cid, saleIds],
    queryFn: async () => {
      if (!cid || saleIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase
        .from("fiscal_notes")
        .select("sale_id, ref")
        .eq("company_id", cid)
        .in("sale_id", saleIds);
      const map: Record<string, string> = {};
      for (const r of (data as any[]) ?? []) {
        if (r.sale_id && r.ref) map[r.sale_id] = r.ref;
      }
      return map;
    },
    enabled: !!cid && saleIds.length > 0,
  });
  const noteRefBySale = useMemo(() => fiscalNoteRefsQ.data ?? {}, [fiscalNoteRefsQ.data]);

  const sentNoteEmailsQ = useQuery({
    queryKey: ["sales-nfce-email-sent", cid, noteRefBySale],
    queryFn: async () => {
      const refs = Object.values(noteRefBySale);
      if (!cid || refs.length === 0) return { sent: {} as Record<string, true>, failed: {} as Record<string, true> };
      const { data } = await supabase
        .from("email_logs")
        .select("context, status")
        .eq("company_id", cid)
        .in("context", refs.map((r) => `nfce:${r}`));
      const sentRefs = new Set<string>();
      const failedRefs = new Set<string>();
      for (const r of (data as any[]) ?? []) {
        const ref = String(r.context ?? "").replace(/^nfce:/, "");
        if (!ref) continue;
        if (r.status === "sent") sentRefs.add(ref);
        else if (r.status === "error" || r.status === "failed") failedRefs.add(ref);
      }
      const sent: Record<string, true> = {};
      const failed: Record<string, true> = {};
      for (const [saleId, ref] of Object.entries(noteRefBySale)) {
        if (sentRefs.has(ref)) sent[saleId] = true;
        else if (failedRefs.has(ref)) failed[saleId] = true;
      }
      return { sent, failed };
    },
    enabled: !!cid && Object.keys(noteRefBySale).length > 0,
  });
  const emailSentMap = (sentNoteEmailsQ.data?.sent) ?? {};
  const emailFailedMap = (sentNoteEmailsQ.data?.failed) ?? {};

  // Map: id da venda original → devolução (id, number) que já foi criada
  const returnsMapQ = useQuery({
    queryKey: ["sales-returns-map", cid, saleIds],
    queryFn: async () => {
      if (!cid || saleIds.length === 0) return {} as Record<string, { id: string; number: number }>;
      const { data } = await supabase
        .from("sales")
        .select("id, number, origin_sale_id")
        .eq("company_id", cid)
        .eq("type", "devolucao")
        .eq("status", "concluida")
        .in("origin_sale_id", saleIds);
      const map: Record<string, { id: string; number: number }> = {};
      for (const r of (data as any[]) ?? []) {
        if (r.origin_sale_id) map[r.origin_sale_id] = { id: r.id, number: r.number };
      }
      return map;
    },
    enabled: !!cid && saleIds.length > 0,
  });
  const returnsMap = returnsMapQ.data ?? {};

  // Para linhas de devolução, mapa: id da venda original → número
  const originIds = useMemo(
    () => sales.filter((s: any) => s.type === "devolucao" && s.origin_sale_id).map((s: any) => s.origin_sale_id),
    [sales],
  );
  const originsMapQ = useQuery({
    queryKey: ["sales-origins-map", cid, originIds],
    queryFn: async () => {
      if (!cid || originIds.length === 0) return {} as Record<string, number>;
      const { data } = await supabase.from("sales").select("id, number").in("id", originIds as string[]);
      const map: Record<string, number> = {};
      for (const r of (data as any[]) ?? []) map[r.id] = r.number;
      return map;
    },
    enabled: !!cid && originIds.length > 0,
  });
  const originsMap = originsMapQ.data ?? {};



  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const sortedSales = useMemo(() => {
    if (!sortConfig) return sales;
    const { key, direction } = sortConfig;
    const dir = direction === "asc" ? 1 : -1;
    const getVal = (s: any) => {
      if (key === "customer_name") return (s.customer?.name ?? "").toString().toLowerCase();
      if (key === "created_at") return new Date(s.created_at).getTime();
      if (key === "total") return Number(s.total ?? 0);
      if (key === "number") return Number(s.number ?? 0);
      const v = s[key];
      return typeof v === "string" ? v.toLowerCase() : v ?? "";
    };
    return [...sales].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [sales, sortConfig]);
  const filteredSales = sortedSales;
  const paginatedSales = sortedSales;
  const totalPages = Math.ceil(totalSalesCount / pageSize);

  const [customerId, setCustomerId] = useState<string>(
    () => localStorage.getItem(`${SAVED_SALE_KEY}_customerId`) || "none",
  );
  const [nfType, setNfType] = useState<"nfce" | "nfe">(
    () => (localStorage.getItem(`${SAVED_SALE_KEY}_nfType`) as any) || "nfce",
  );
  useEffect(() => {
    localStorage.setItem(`${SAVED_SALE_KEY}_nfType`, nfType);
  }, [nfType]);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );
  const handlePrint = () => {
    printList({
      title: "Histórico de Vendas",
      subtitle: saleSearchTerm ? `Filtro: "${saleSearchTerm}"` : undefined,
      columns: [
        { header: "Data", accessor: (s: any) => dt(s.created_at) },
        { header: "Nº", accessor: (s: any) => `#${s.number}` },
        {
          header: "Cliente",
          accessor: (s: any) =>
            customers.find((x) => x.id === s.customer_id)?.name ?? "Consumidor final",
        },
        { header: "Vendedor", accessor: (s: any) => s.profiles?.name || s.profiles?.email || "—" },
        { header: "Pgto", accessor: (s: any) => s.payment_method },
        { header: "Status", accessor: (s: any) => s.status, align: "center" },
        { header: "Total", accessor: (s: any) => brl(Number(s.total)), align: "right" },
      ],
      rows: filteredSales,
    });
  };
  // Vendas "aberta" órfãs (sem carrinho) são descartadas apenas se antigas,
  // evitando cancelar vendas recém-criadas que ainda estão sendo processadas.
  const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;
  useEffect(() => {
    const now = Date.now();
    const candidates = ((currentSessionOpenSalesQ.data as any[]) || []).filter(
      (s) =>
        s.id !== currentSaleId &&
        s.status === "aberta" &&
        s.created_at &&
        now - new Date(s.created_at).getTime() > ORPHAN_MIN_AGE_MS,
    );
    if (candidates.length === 0) return;
    (async () => {
      try {
        const sb = supabase as any;
        for (const s of candidates) {
          // Revalida o status no banco antes de cancelar: a lista pode estar
          // desatualizada e a venda já ter sido concluída nesse meio-tempo.
          const { data: fresh } = await sb
            .from("sales")
            .select("id, status")
            .eq("id", s.id)
            .maybeSingle();
          if (!fresh || fresh.status !== "aberta") continue;
          await cancelSale(s.id, "Venda em aberto descartada automaticamente (sem carrinho)", { onlyIfStatus: "aberta" });
        }
        await currentSessionOpenSalesQ.refetch();
        await currentSessionSalesQ.refetch();
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionOpenSalesQ.data, currentSaleId]);


  const hasOpenSales = useMemo(() => {
    return items.length > 0;
  }, [items]);


  const hasAnySalesInSession = useMemo(() => {
    return (currentSessionSalesQ.data?.length || 0) > 0 || hasOpenSales;
  }, [currentSessionSalesQ.data, hasOpenSales]);

  // Fechar caixa mesmo com pendências: cancela vendas em aberto e limpa o carrinho
  const proceedCloseCash = async () => {
    if (!hasOpenSales) {
      setShowCloseModal(true);
      return;
    }

    const pendentes = (currentSessionOpenSalesQ.data as any[]) || [];
    const ok = await confirm({
      title: "Existem pendências nesta sessão",
      description: `${pendentes.length > 0 ? `${pendentes.length} venda(s) em aberto serão canceladas. ` : ""}${items.length > 0 ? "A venda em andamento (carrinho) será descartada. " : ""}Deseja continuar e fechar o caixa?`,
      confirmLabel: "Cancelar pendências e fechar",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      for (const s of pendentes) {
        await cancelSale(s.id, "Cancelada automaticamente no fechamento do caixa");
      }
      if (items.length > 0) {
        setItems([]);
        setCurrentSaleId(null);
        try {
          localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
          localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
          localStorage.removeItem(`${SAVED_SALE_KEY}_payments`);
        } catch {
          /* ignore */
        }
      }
      await currentSessionOpenSalesQ.refetch();
      await currentSessionSalesQ.refetch();
      setShowCloseModal(true);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível cancelar as vendas em aberto.");
    }
  };

  const [overdueCloseOpen, setOverdueCloseOpen] = useState(false);
  const overdueForCloseQ = useOverdueTasks(cid, user?.id);

  const handleCloseCashClick = async () => {
    if ((overdueForCloseQ.data?.length || 0) > 0) {
      setOverdueCloseOpen(true);
      return;
    }
    await proceedCloseCash();
  };




  // Caixa em aberto pertencente ao usuário logado (mesmo que não seja o caixa selecionado)
  const myOpenRegister = useMemo(
    () => (allOpenRegisters || []).find((r: any) => r.user_id_open === user?.id) || null,
    [allOpenRegisters, user?.id],
  );

  // Caixa aberto do operador selecionado na abertura (bloqueia nova abertura)
  const selectedOperatorOpenRegister = useMemo(
    () =>
      (allOpenRegisters || []).find((r: any) => r.user_id_open === selectedOpeningUserId) || null,
    [allOpenRegisters, selectedOpeningUserId],
  );

  // Abre direto o modal de fechamento quando vem de "Fechar caixa" na Gestão de Caixa
  const handledCloseParam = useRef(false);
  useEffect(() => {
    if (handledCloseParam.current) return;
    const target = routeSearch.close;
    if (!target) return;
    handledCloseParam.current = true;
    const uid = target === "1" ? user?.id : target;
    if (uid) {
      setActiveRegisterUserId(uid);
      try {
        localStorage.setItem(SELECTED_CAIXA_USER_KEY, uid);
      } catch {
        /* ignore */
      }
    }
    setShowCloseModal(true);
    navigate({ to: "/app/vendas", search: {}, replace: true });
  }, [routeSearch.close, user?.id, SELECTED_CAIXA_USER_KEY, navigate]);



  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const productSearchDeferred = useDeferredValue(productSearch);
  // Normalização agressiva: lowercase, sem acento, sem pontuação, sem espaços,
  // e com dígitos/letras intercambiáveis (0↔o, 1↔i) para encontrar "0W-20",
  // "0 W 20", "ow20" todos como equivalentes.
  const fuzzify = (s: string) => {
    const base = normalize(s).replace(/\s+/g, "");
    return base.replace(/0/g, "o").replace(/1/g, "i");
  };
  // Para cada palavra digitada, geramos variantes (normalizada e fuzzificada).
  // Um produto casa quando, para CADA palavra, AO MENOS UMA variante aparece
  // no texto indexado. Isso garante encontrar "0534" mesmo em SKUs como
  // "EK.0534", "EK-0534" ou "EK 0534".
  const productSearchTerms = useMemo<string[][]>(() => {
    const n = normalize(productSearchDeferred);
    if (!n) return [];
    const words = n.split(" ").filter(Boolean);
    const variantSets: string[][] = words.map((w) =>
      Array.from(new Set([w, fuzzify(w)].filter(Boolean))),
    );
    const compactRaw = n.replace(/\s+/g, "");
    const compactFz = fuzzify(n);
    const compactVariants = Array.from(
      new Set([compactRaw, compactFz].filter(Boolean)),
    );
    if (compactVariants.length > 0) variantSets.push(compactVariants);
    return variantSets;
  }, [productSearchDeferred]);
  const productSearchIndex = useMemo(() => {
    return (products as any[])
      .map((p: any) => {
        const refs = productRefsMap.get(p.id) || "";
        const brandName = p.brand_id ? brandsById.get(p.brand_id) || "" : "";
        const joined = [
          p.name,
          p.sku,
          p.alternative_code,
          p.gtin,
          p.gtin_tributavel,
          p.description,
          p.unit,
          brandName,
          refs,
        ]
          .filter(Boolean)
          .join(" ");
        const norm = normalize(joined);
        const normCompact = norm.replace(/\s+/g, "");
        const fz = fuzzify(joined);
        return {
          product: p,
          // Indexa em 3 variantes: normalizada, normalizada sem espaços e fuzzificada
          searchText: `${norm} ${normCompact} ${fz}`,
        };
      })
      .sort((a: any, b: any) => compareProductNames(a.product.name, b.product.name));
  }, [products, productRefsMap, brandsById]);
  const productPickerResults = useMemo(() => {
    const filtered: any[] = [];
    for (const entry of productSearchIndex) {
      const p = entry.product;
      if (!productMatchesBrand(p.id, p.brand_id, productBrandFilter, productRefsBrandMap)) continue;
      if (
        productSearchTerms.length > 0 &&
        !productSearchTerms.every((variants) =>
          variants.some((v) => entry.searchText.includes(v)),
        )
      )
        continue;
      filtered.push(p);
      if (filtered.length >= 120) break;
    }
    return filtered;
  }, [productSearchIndex, productBrandFilter, productRefsBrandMap, productSearchTerms]);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  const [discountMode, setDiscountMode] = useState<DiscountMode>(
    () => (localStorage.getItem(`${SAVED_SALE_KEY}_discountMode`) as DiscountMode) || "valor",
  );
  const [discountValueRaw, setDiscountValueRaw] = useState(
    () => localStorage.getItem(`${SAVED_SALE_KEY}_discountValueRaw`) || "0,00",
  );
  const [showSalePreview, setShowSalePreview] = useState(false);
  const [showClosingPreview, setShowClosingPreview] = useState(false);
  const [pendingClosingHtml, setPendingClosingHtml] = useState<string | null>(null);
  const [pendingClosingCtx, setPendingClosingCtx] = useState<{ reg: any; sales: any[]; operatorEmail?: string | null } | null>(null);
  const [includeSalesClosing, setIncludeSalesClosing] = useState(true);
  const [previewContent, setPreviewContent] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");

  // Regenera preview de fechamento quando o usuário alterna a inclusão da lista detalhada
  useEffect(() => {
    if (!showClosingPreview || !pendingClosingCtx) return;
    const html = buildClosingHtmlFromRegister(
      pendingClosingCtx.reg,
      pendingClosingCtx.sales,
      pendingClosingCtx.operatorEmail,
      { includeSales: includeSalesClosing },
    );
    setPreviewContent(html);
    setPendingClosingHtml(html);
    setLastClosingHtml(html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeSalesClosing]);


  const [discountPctRaw, setDiscountPctRaw] = useState(
    () => localStorage.getItem(`${SAVED_SALE_KEY}_discountPctRaw`) || "0",
  );
  const [showDiscountFields, setShowDiscountFields] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string>(
    () => localStorage.getItem(`${SAVED_SALE_KEY}_paymentMethodId`) || "",
  );
  const [dueDate, setDueDate] = useState(
    () => localStorage.getItem(`${SAVED_SALE_KEY}_dueDate`) || "",
  );
  const [amountReceivedRaw, setAmountReceivedRaw] = useState(
    () => localStorage.getItem(`${SAVED_SALE_KEY}_amountReceivedRaw`) || "0,00",
  );
  const [payments, setPayments] = useState<PaymentRow[]>(() => {
    try {
      const raw = localStorage.getItem(`${SAVED_SALE_KEY}_payments`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    if (!currentSaleId) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,status")
        .eq("id", currentSaleId)
        .maybeSingle();
      if (cancelled || error || data?.status === "aberta") return;

      setItems([]);
      setCurrentSaleId(null);
      setReopenedFromNumber(null);
      setCustomerId("none");
      setDiscountValueRaw("0,00");
      setDiscountPctRaw("0");
      setPaymentMethodId("");
      setDueDate("");
      setAmountReceivedRaw("0,00");
      setPayments([]);
      localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_customerId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountMode`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountValueRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountPctRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_paymentMethodId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_dueDate`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_amountReceivedRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_payments`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_reopenedNumber`);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSaleId, SAVED_SALE_KEY]);

  const [autoPrintCoupon, setAutoPrintCoupon] = useState(
    () => localStorage.getItem(`auto_print_coupon_${cid}`) === "true",
  );
  // Resincroniza quando a empresa ativa muda (cid pode chegar vazio no 1º render)
  useEffect(() => {
    setAutoPrintCoupon(localStorage.getItem(`auto_print_coupon_${cid}`) === "true");
  }, [cid]);

  const [testingPrinter, setTestingPrinter] = useState(false);

  const handleTestPrinter = async () => {
    const printer = qzPrinterName(cid);
    if (!qzEnabled(cid) || !printer) {
      toast.warning(
        "QZ Tray não configurado. Habilite e selecione uma impressora em Ajustes › Impressão.",
      );
      return;
    }
    try {
      setTestingPrinter(true);
      await qzConnect();
      await qzPrintTestReceipt(printer);
      toast.success(`Cupom de teste enviado para ${printer}.`);
    } catch (e: any) {
      toast.error(
        `QZ Tray indisponível: ${e?.message || "verifique se o serviço está em execução."}`,
      );
    } finally {
      setTestingPrinter(false);
    }
  };
  const selectedPaymentMethod = paymentMethods.find((pm) => pm.id === paymentMethodId);
  const requiresDueDate = selectedPaymentMethod?.requires_due_date ?? false;
  const isCashPayment = selectedPaymentMethod?.name?.toLowerCase().includes("dinheiro");

  useEffect(() => {
    localStorage.setItem(`auto_print_coupon_${cid}`, String(autoPrintCoupon));
  }, [autoPrintCoupon, cid]);

  useEffect(() => {
    if (!activeRegisterUserId) return;
    const savedItems = localStorage.getItem(`${SAVED_SALE_KEY}_items`);
    const parsedItems = savedItems ? JSON.parse(savedItems) : [];
    setItems(parsedItems);
    setCustomerId(localStorage.getItem(`${SAVED_SALE_KEY}_customerId`) || "none");
    setDiscountMode(
      (localStorage.getItem(`${SAVED_SALE_KEY}_discountMode`) as DiscountMode) || "valor",
    );
    setDiscountValueRaw(localStorage.getItem(`${SAVED_SALE_KEY}_discountValueRaw`) || "0,00");
    setDiscountPctRaw(localStorage.getItem(`${SAVED_SALE_KEY}_discountPctRaw`) || "0");
    setPaymentMethodId(localStorage.getItem(`${SAVED_SALE_KEY}_paymentMethodId`) || "");
    setDueDate(localStorage.getItem(`${SAVED_SALE_KEY}_dueDate`) || "");
    setAmountReceivedRaw(localStorage.getItem(`${SAVED_SALE_KEY}_amountReceivedRaw`) || "0,00");
    try {
      const raw = localStorage.getItem(`${SAVED_SALE_KEY}_payments`);
      setPayments(raw ? JSON.parse(raw) : []);
    } catch { setPayments([]); }
    setCurrentSaleId(localStorage.getItem(`${SAVED_SALE_KEY}_saleId`));
    setReopenedFromNumber(localStorage.getItem(`${SAVED_SALE_KEY}_reopenedNumber`));

    // Reset transient UI state
    setShowDiscountFields(false);
    setMethodCounts({});

    loadedKey.current = SAVED_SALE_KEY;
  }, [SAVED_SALE_KEY, activeRegisterUserId]);

  useEffect(() => {
    if (!activeRegisterUserId || loadedKey.current !== SAVED_SALE_KEY) return;
    localStorage.setItem(`${SAVED_SALE_KEY}_items`, JSON.stringify(items));
    localStorage.setItem(`${SAVED_SALE_KEY}_customerId`, customerId);
    localStorage.setItem(`${SAVED_SALE_KEY}_discountMode`, discountMode);
    localStorage.setItem(`${SAVED_SALE_KEY}_discountValueRaw`, discountValueRaw);
    localStorage.setItem(`${SAVED_SALE_KEY}_discountPctRaw`, discountPctRaw);
    localStorage.setItem(`${SAVED_SALE_KEY}_paymentMethodId`, paymentMethodId);
    localStorage.setItem(`${SAVED_SALE_KEY}_dueDate`, dueDate);
    localStorage.setItem(`${SAVED_SALE_KEY}_amountReceivedRaw`, amountReceivedRaw);
    localStorage.setItem(`${SAVED_SALE_KEY}_payments`, JSON.stringify(payments));
    if (currentSaleId) {
      localStorage.setItem(`${SAVED_SALE_KEY}_saleId`, currentSaleId);
    } else {
      localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
    }

    if (
      items.length > 0 &&
      !window.sessionStorage.getItem(`sale_restored_${cid}_${activeRegisterUserId}`)
    ) {
      toast.info("Venda em andamento restaurada automaticamente.");
      window.sessionStorage.setItem(`sale_restored_${cid}_${activeRegisterUserId}`, "true");
    }
  }, [
    items,
    customerId,
    discountMode,
    discountValueRaw,
    discountPctRaw,
    paymentMethodId,
    dueDate,
    amountReceivedRaw,
    payments,
    currentSaleId,
    SAVED_SALE_KEY,
    activeRegisterUserId,
    cid,
  ]);

  const printSettings = useMemo(() => {
    const saved = localStorage.getItem(`print_settings_${cid}`);
    return saved
      ? JSON.parse(saved)
      : {
          header: "AUTO PEÇAS ERP",
          showColumns: true,
          showSummary: true,
          showTotals: true,
          footerMessage: "Obrigado pela preferência!",
          showCnpjAddress: false,
          showCustomerData: false,
          showDetailedInstallments: false,
          receiptWidth: "280",
          fontSizePx: "12",
          lineHeight: "1.35",
          boldStrength: "0.4",
        };
  }, [cid]);

  const getSaleHtml = (saleData: any) => {
    const fiscal = fiscalSettingsQ.data;
    const company = companyInfoQ.data as any;
    const customer = customers.find((c) => c.id === saleData.customer_id);
    const companyName = (company?.name || fiscal?.razao_social || printSettings.header || "").trim();
    const companyAddr = (fiscal?.endereco || "").trim();
    const companyPhone = (company?.phone || "").trim();
    const headerHtml = companyName
      ? `<div class="header-text">${companyName}</div>${companyAddr ? `<div class="company-sub">${companyAddr}</div>` : ""}${companyPhone ? `<div class="company-sub">Tel: ${companyPhone}</div>` : ""}`
      : "";
    const fiscalHtml =
      printSettings.showCnpjAddress && fiscal
        ? `<div class="center" style="font-size: 10px; margin-bottom: 5px;">${fiscal.cnpj ? `<div>CNPJ: ${fiscal.cnpj}</div>` : ""}</div>`
        : "";
    const customerHtml =
      printSettings.showCustomerData && customer
        ? `<div class="divider"></div><div style="font-size: 10px; margin-bottom: 5px;"><div class="bold">CLIENTE:</div><div>${customer.name}</div>${customer.doc ? `<div>DOC: ${customer.doc}</div>` : ""}</div>`
        : "";
    const itemsHtml = printSettings.showColumns
      ? `<table style="margin-top: 5px;"><thead><tr><th style="text-align: left">PROD</th><th style="text-align: center">QTD</th><th style="text-align: right">UNIT</th><th style="text-align: right">TOTAL</th></tr></thead><tbody>${(saleData.items || []).map((i: any) => `<tr><td>${i.name}</td><td style="text-align: center">${i.quantity}</td><td style="text-align: right">${brl(Number(i.unit_price || 0))}</td><td style="text-align: right">${brl(Number(i.quantity || 0) * Number(i.unit_price || 0))}</td></tr>`).join("")}</tbody></table>`
      : "";
    const discountHtml =
      saleData.discount > 0
        ? `<div class="row"><span>DESCONTO:</span> <span>${brl(saleData.discount)}</span></div>`
        : "";
    const summaryHtml = printSettings.showSummary
      ? `<div class="divider"></div><div class="row"><span>SUBTOTAL:</span> <span>${brl(saleData.subtotal)}</span></div>${discountHtml}`
      : "";
    const paymentsList = Array.isArray(saleData.payments)
      ? saleData.payments.filter((p: any) => p?.method)
      : [];
    const paymentsHtml =
      paymentsList.length > 1
        ? `<div class="divider"></div><div class="row bold"><span>PAGAMENTOS:</span><span></span></div>${paymentsList
            .map(
              (p: any) =>
                `<div class="row"><span>${p.method}:</span> <span>${brl(Number(p.amount || 0))}</span></div>`,
            )
            .join("")}`
        : `<div class="divider"></div><div class="row"><span>MÉTODO:</span> <span>${
            paymentsList[0]?.method || saleData.paymentMethod || "---"
          }</span></div>`;
    const totalsHtml = printSettings.showTotals
      ? `<div class="row bold mt"><span>TOTAL:</span> <span>${brl(saleData.total)}</span></div>${paymentsHtml}`
      : "";
    const installmentsHtml =
      printSettings.showDetailedInstallments &&
      saleData.installments &&
      saleData.installments.length > 0
        ? `<div style="font-size: 10px; padding-left: 10px; margin-top: 2px;">${saleData.installments.map((inst: any, idx: number) => `<div>- ${idx + 1}/${saleData.installments.length}: ${brl(inst.amount)} (${new Date(inst.due_date).toLocaleDateString("pt-BR")})</div>`).join("")}</div>`
        : "";
    const qrUrl = `${window.location.origin}/__l5e/assets-v1/39befd4c-2c54-4182-b44d-7642d3876149/google-review-qr.png`;
    const reviewHtml = `<div class="review"><div class="review-text">Faça sua avaliação</div><div class="review-sub">Conte-nos como foi a sua experiência</div><img src="${qrUrl}" alt="QR Avaliação" class="review-qr" /></div>`;
    return `<html><head><title>Cupom de Venda</title><style>${receiptStyle({ widthPx: printSettings.receiptWidth || "280", fontSizePx: printSettings.fontSizePx, lineHeight: printSettings.lineHeight, boldStrength: printSettings.boldStrength })}</style></head><body><h2>COMPROVANTE DE VENDA</h2>${headerHtml}${fiscalHtml}<div class="center">Data: ${new Date().toLocaleString("pt-BR")}</div><div class="center">Venda: #${saleData.number || saleData.id?.slice(0, 6) || "---"}</div>${customerHtml}<div class="divider"></div>${itemsHtml}${summaryHtml}${totalsHtml}${installmentsHtml}<div class="footer"><div>${printSettings.footerMessage}</div></div>${reviewHtml}</body></html>`;
  };

  const handlePrintSale = (saleData: any, opts?: { auto?: boolean }) => {
    const html = getSaleHtml(saleData);
    // Se o QZ Tray estiver habilitado e com impressora configurada,
    // tenta enviar direto para a impressora térmica. Em qualquer falha
    // (serviço fora do ar, timeout, impressora indisponível), cai para
    // a impressão do navegador — inclusive em emissão automática, usando
    // iframe oculto que não depende de gesto do usuário nem popup.
    if (qzEnabled(cid) && qzPrinterName(cid)) {
      qzPrintHtml80mm(html, { widthPx: printSettings.receiptWidth || "280" }).catch((e) => {
        console.error("[QZ] impressão falhou, caindo para navegador", e);
        toast.warning(
          `QZ Tray falhou (${e?.message || "erro desconhecido"}). Usando impressão pelo navegador.`,
        );
        fallbackBrowserPrint(html);
      });
      return;
    }
    fallbackBrowserPrint(html);
  };


  const fallbackBrowserPrint = (html: string) => {
    // Tenta primeiro abrir uma nova janela (melhor UX quando permitido).
    // Se o navegador bloquear (popup blocker — comum quando a chamada vem
    // de dentro de um setTimeout, fora do gesto direto do usuário), cai
    // para um iframe oculto, que não depende de gesto do usuário.
    try {
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(
          html +
            `<script>window.onload = function() { window.print(); setTimeout(() => window.close(), 500); };</script>`,
        );
        win.document.close();
        return;
      }
    } catch {
      /* fallback abaixo */
    }
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* noop */
        }
      }, 1000);
    };
    let printed = false;
    const trigger = () => {
      if (printed) return;
      printed = true;
      try {
        if (!iframe.isConnected) return;
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.warn("print ignorado (iframe indisponível)", e);
      } finally {
        cleanup();
      }
    };
    if (iframe.contentWindow?.document.readyState === "complete") {
      setTimeout(trigger, 100);
    } else {
      iframe.onload = () => setTimeout(trigger, 100);
    }

  };

  const customerCreditBalanceQ = useQuery({
    queryKey: ["customer-credit-balance", customerId],
    queryFn: () => getCustomerCreditBalance(customerId),
    enabled: !!customerId && customerId !== "none",
    staleTime: 10_000,
  });
  const availableCredit = Number(customerCreditBalanceQ.data ?? 0);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [items]);
  const discountAmount = useMemo(() => {
    if (discountMode === "valor") return Math.min(parseCurrencyInput(discountValueRaw), subtotal);
    const pct = Math.max(0, Math.min(100, Number((discountPctRaw || "0").replace(",", ".")) || 0));
    return (subtotal * pct) / 100;
  }, [discountMode, discountValueRaw, discountPctRaw, subtotal]);
  const total = Math.max(subtotal - discountAmount, 0);
  // ID da forma de pagamento "Voucher" cadastrada pelo usuário
  const voucherMethodId = useMemo(() => findVoucherMethodId(paymentMethods), [paymentMethods]);
  // Crédito aplicado = soma das linhas de pagamento do tipo "Voucher"
  const effectiveCredit = useMemo(
    () => (!voucherMethodId
      ? 0
      : payments.filter((p) => p.payment_method_id === voucherMethodId)
                .reduce((s, p) => s + Number(p.amount || 0), 0)),
    [payments, voucherMethodId],
  );
  // Remove a linha de voucher automaticamente quando o cliente troca/zera carrinho
  useEffect(() => {
    if (!voucherMethodId) return;
    setPayments((prev) => prev.filter((p) => p.payment_method_id !== voucherMethodId));
    setCreditApplied(0);
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-injeta / recalcula / limita a linha de Voucher conforme cliente,
  // crédito disponível e total. Sempre fixada no topo da lista (a UI reordena
  // para exibição, mas garantimos aqui que a linha existe e tem valor correto).
  useEffect(() => {
    if (!voucherMethodId) return;
    setPayments((prev) => {
      const others = prev.filter((p) => p.payment_method_id !== voucherMethodId);
      const shouldHave =
        !!customerId && customerId !== "none" && availableCredit > 0;
      if (!shouldHave) {
        // Remove voucher se existir
        if (others.length === prev.length) return prev;
        return others;
      }
      const voucherMethod = paymentMethods.find((m) => m.id === voucherMethodId);
      const desired = Math.max(0, Number(Math.min(availableCredit, Math.max(total, 0)).toFixed(2)));
      const voucherRow: PaymentRow = {
        payment_method_id: voucherMethodId,
        method: voucherMethod?.name ?? "Voucher",
        amount: desired,
        installments: 1,
        first_due_date: null,
      };
      const next = redistributeAfterVoucher([voucherRow, ...others], total, voucherMethodId);
      const same =
        next.length === prev.length &&
        next.every(
          (p, i) =>
            p.payment_method_id === prev[i].payment_method_id &&
            Number(p.amount || 0) === Number(prev[i].amount || 0),
        );
      return same ? prev : next;
    });
  }, [customerId, total, items.length, availableCredit, voucherMethodId, paymentMethods]); // eslint-disable-line react-hooks/exhaustive-deps

  // Salvaguarda: garante no máximo UMA linha de voucher, somando valores caso
  // o editor adicione manualmente uma duplicata.
  useEffect(() => {
    if (!voucherMethodId) return;
    const voucherRows = payments.filter((p) => p.payment_method_id === voucherMethodId);
    if (voucherRows.length <= 1) return;
    setPayments((prev) => {
      const vs = prev.filter((p) => p.payment_method_id === voucherMethodId);
      if (vs.length <= 1) return prev;
      const merged: PaymentRow = {
        ...vs[0],
        amount: Number(
          vs.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2),
        ),
      };
      const others = prev.filter((p) => p.payment_method_id !== voucherMethodId);
      return [merged, ...others];
    });
  }, [payments, voucherMethodId]);

  const change = Math.max(parseCurrencyInput(amountReceivedRaw) - total, 0);

  // Inicializa uma linha default quando há itens mas pagamentos vazios
  useEffect(() => {
    if (items.length > 0 && payments.length === 0 && total > 0) {
      const def = paymentMethods.find((m) => m.active);
      setPayments([{
        payment_method_id: def?.id ?? null,
        method: def?.name ?? "Dinheiro",
        amount: total,
        installments: 1,
        first_due_date: def?.requires_due_date ? new Date().toISOString().slice(0, 10) : null,
      }]);
    }
  }, [items.length, paymentMethods, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const paymentsTotal = useMemo(() => payments.reduce((s, p) => s + Number(p.amount || 0), 0), [payments]);
  // Considera quitado quando a soma dos pagamentos >= total (excedente em dinheiro = troco)
  const paymentsBalanced = paymentsTotal + 0.01 >= total && payments.length > 0 && total > 0;

  const emitNfceFn = useServerFn(emitNfce);
  const fetchNfceReceiptFn = useServerFn(fetchNfceReceipt80mm);


  const doEmitNfce = async (saleId: string) => {
    const ambiente = (fiscalSettingsQ.data as any)?.ambiente as string | undefined;
    updateProgressStep("nfce", { status: "running", detail: "Enviando para a SEFAZ..." });
    // Não resetar o passo "print" aqui — ele é gerenciado pelo fluxo de impressão em paralelo.

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        updateProgressStep("nfce", { status: "error", detail: "Sessão expirada. Emita manualmente." });
        updateProgressStep("print", { status: "skipped" });
        return;
      }
      if (!ambiente) {
        updateProgressStep("nfce", { status: "error", detail: "Ambiente fiscal não configurado." });
        updateProgressStep("print", { status: "skipped" });
        return;
      }
      const r: any = await emitNfceFn({ data: { saleId, accessToken, expectedAmbiente: ambiente } });
      qc.invalidateQueries({ queryKey: ["sales-active-fiscal-notes"] });
      qc.invalidateQueries({ queryKey: ["current-session-fiscal-notes"] });
      qc.invalidateQueries({ queryKey: ["fiscal-note-by-sale", saleId] });
      if (r?.status === "autorizada") {
        updateProgressStep("nfce", { status: "done", detail: "NFC-e autorizada." });
        // Cupom de vendas é impresso pelo fluxo externo (sempre que autoPrintCoupon estiver ativo).
        // A DANFE não é impressa automaticamente — o usuário imprime pelo histórico se quiser.
      } else if (r?.status === "processando") {
        updateProgressStep("nfce", { status: "done", detail: "NFC-e em processamento." });
        updateProgressStep("print", { status: "skipped" });
      } else {
        updateProgressStep("nfce", {
          status: "error",
          detail: "NFC-e: " + (r?.motivo_rejeicao || r?.status || "falha"),
        });
        updateProgressStep("print", { status: "skipped" });
      }
    } catch (e: any) {
      updateProgressStep("nfce", { status: "error", detail: e?.message || "Falha ao emitir NFC-e" });
      updateProgressStep("print", { status: "skipped" });
    }
  };

  const triggerAutoOrAskNfce = async (
    saleId: string,
    paymentsSnapshot: typeof payments,
  ): Promise<{ willEmit: boolean }> => {
    if (nfType !== "nfce") {
      updateProgressStep("nfce", { status: "skipped", detail: "NFC-e não solicitada" });
      updateProgressStep("print", { status: "skipped" });
      return { willEmit: false };
    }
    const usedMethodIds = new Set(
      paymentsSnapshot.map((p) => p.payment_method_id).filter(Boolean) as string[],
    );
    const usedMethods = paymentMethods.filter((m) => usedMethodIds.has(m.id));
    const nonVoucherMethods = usedMethods.filter((m) => m.id !== voucherMethodId);
    const anyAuto =
      nonVoucherMethods.length > 0 &&
      nonVoucherMethods.some((m) => !!(m as any).auto_issue_nfce);

    if (anyAuto) {
      await doEmitNfce(saleId);
      return { willEmit: true };
    }
    updateProgressStep("nfce", {
      status: "skipped",
      detail: "Emissão manual disponível no histórico da venda.",
    });
    updateProgressStep("print", { status: "skipped" });
    return { willEmit: false };
  };







  const sellMut = useMutation({
    mutationFn: async () => {
      if (!paymentsBalanced) {
        throw new Error("A soma dos pagamentos deve ser maior ou igual ao total da venda.");
      }
      const voucherAmount = !voucherMethodId
        ? 0
        : payments
            .filter((p) => p.payment_method_id === voucherMethodId)
            .reduce((s, p) => s + Number(p.amount || 0), 0);
      if (voucherAmount > 0 && (!customerId || customerId === "none")) {
        throw new Error("Selecione o cliente para usar o crédito (voucher).");
      }
      if (voucherAmount > availableCredit + 0.01) {
        throw new Error(`Voucher excede o crédito disponível (${brl(availableCredit)}).`);
      }
      // Inicia modal de progresso
      const showNfceStep = nfType === "nfce" && paymentsHaveAutoNfce(payments);
      const initialSteps: ProgressStep[] = [
        { id: "register", label: "Registrando venda", status: "running" },
        {
          id: "credit",
          label: "Aplicando crédito do cliente",
          status: effectiveCredit > 0 && customerId && customerId !== "none" ? "pending" : "skipped",
        },
        ...(showNfceStep
          ? ([{ id: "nfce", label: "Emitindo NFC-e", status: "pending" }] as ProgressStep[])
          : []),
        { id: "print", label: "Imprimindo comprovante", status: "pending" },
      ];
      startProgress(initialSteps);

      const realPayments = voucherMethodId
        ? payments.filter((p) => p.payment_method_id !== voucherMethodId)
        : payments;
      const firstReal = realPayments[0];
      try {
        const saleId = await registerSale({
          companyId: cid,
          customerId: customerId === "none" ? null : customerId,
          items: items.map((i) => ({
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
          discount: discountAmount + voucherAmount,
          paymentMethod: selectedPaymentMethod?.name ?? firstReal?.method ?? (voucherAmount > 0 ? "Voucher" : ""),
          dueDate: requiresDueDate ? dueDate || null : null,
          payments: realPayments.length > 0 ? (realPayments as SalePaymentInput[]) : undefined,
          userId: activeRegisterUserId,
        });
        try {
          await supabase.from("sales").update({ nf_type: nfType } as any).eq("id", saleId);
        } catch (e) {
          console.warn("Falha ao persistir nf_type", e);
        }
        updateProgressStep("register", { status: "done", detail: "Venda registrada com sucesso." });
        setProgressSaleId(saleId);
        return saleId;

      } catch (e: any) {
        updateProgressStep("register", { status: "error", detail: e?.message || "Falha ao registrar venda." });
        updateProgressStep("credit", { status: "skipped" });
        updateProgressStep("nfce", { status: "skipped" });
        updateProgressStep("print", { status: "skipped" });
        throw e;
      }
    },
    onSuccess: async (saleId) => {
      const soldItems = items.map((i) => ({
        product_id: i.product_id,
        unit_price: i.unit_price,
        name: i.name,
      }));
      void syncMissingProductPrices(soldItems);
      // Aplica crédito (se houver) — debita FIFO e registra usages
      if (effectiveCredit > 0 && customerId && customerId !== "none") {
        updateProgressStep("credit", { status: "running", detail: `Debitando ${brl(effectiveCredit)}...` });
        try {
          await applyCustomerCredit(saleId, customerId, effectiveCredit);
          qc.invalidateQueries({ queryKey: ["customer-credit-balance", customerId] });
          updateProgressStep("credit", { status: "done", detail: "Crédito aplicado." });
        } catch (e: any) {
          updateProgressStep("credit", {
            status: "error",
            detail: "Crédito não aplicado: " + (e?.message ?? "erro"),
          });
        }
      }
      // Aguarda emissão/decisão da NFC-e antes de atualizar o histórico
      const paymentsSnapshot = [...payments];
      await triggerAutoOrAskNfce(saleId, paymentsSnapshot);
      // Sempre imprime o cupom de vendas quando autoPrintCoupon estiver ativo,
      // mesmo que a NFC-e tenha sido emitida. A DANFE fica disponível no histórico.
      if (autoPrintCoupon) {
        updateProgressStep("print", { status: "running", detail: "Imprimindo cupom de vendas..." });
        try {
          handlePrintSale(
            {
              id: saleId,
              items,
              subtotal,
              discount: discountAmount,
              total,
              paymentMethod:
                paymentsSnapshot
                  .map((p: any) => p?.method)
                  .filter(Boolean)
                  .join(" + ") ||
                selectedPaymentMethod?.name ||
                "Dinheiro",
              payments: paymentsSnapshot,
            },
            { auto: true },
          );
          updateProgressStep("print", { status: "done", detail: "Impressão enviada." });
        } catch (e: any) {
          updateProgressStep("print", { status: "error", detail: e?.message || "Falha ao imprimir." });
        }
      } else {
        updateProgressStep("print", { status: "skipped", detail: "Impressão automática desativada." });
      }



      localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_customerId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountMode`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountValueRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountPctRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_paymentMethodId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_dueDate`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_amountReceivedRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_payments`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_reopenedNumber`);

      setItems([]);
      setCurrentSaleId(null);
      setReopenedFromNumber(null);
      setDiscountValueRaw("0,00");
      setDiscountPctRaw("0");
      setShowDiscountFields(false);
      setAmountReceivedRaw("0,00");
      setCustomerId("none"); setNfType("nfce"); localStorage.removeItem(`${SAVED_SALE_KEY}_nfType`);
      setDueDate("");
      setPaymentMethodId("");
      setPayments([]);
      setCurrentPage(1);
      stockReservation.releaseAll();
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["movements", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-cash-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
      setFinalizeStep(null);
    },

    onError: (e: any) => {
      setFinalizeStep(null);
      toast.error("Falha ao finalizar venda. O carrinho foi mantido para nova tentativa.");
    },
  });

  const saveOpenMut = useMutation({
    mutationFn: async () => {
      const saleId = await registerSale({
        companyId: cid,
        customerId: customerId === "none" ? null : customerId,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        discount: discountAmount,
        paymentMethod: selectedPaymentMethod?.name ?? payments[0]?.method ?? "",
        dueDate: requiresDueDate ? dueDate || null : null,
        payments: payments.length > 0 ? (payments as SalePaymentInput[]) : undefined,
        userId: activeRegisterUserId,
        status: "aberta",
      });
      try {
        await supabase.from("sales").update({ nf_type: nfType } as any).eq("id", saleId);
      } catch (e) {
        console.warn("Falha ao persistir nf_type", e);
      }
      return saleId;
    },
    onSuccess: () => {
      toast.success("Venda salva em aberto! O estoque foi reservado.");

      localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_customerId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountMode`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountValueRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_discountPctRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_paymentMethodId`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_dueDate`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_amountReceivedRaw`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_payments`);
      localStorage.removeItem(`${SAVED_SALE_KEY}_reopenedNumber`);

      setItems([]);
      setReopenedFromNumber(null);
      setDiscountValueRaw("0,00");
      setDiscountPctRaw("0");
      setShowDiscountFields(false);
      setAmountReceivedRaw("0,00");
      setCustomerId("none"); setNfType("nfce"); localStorage.removeItem(`${SAVED_SALE_KEY}_nfType`);
      setDueDate("");
      setPaymentMethodId("");
      setPayments([]);
      setCurrentPage(1);
      stockReservation.releaseAll();
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["movements", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-cash-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-open-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
    },
    onError: (e: any) => {
      toast.error("Falha ao salvar venda em aberto.");
    },
  });

  const handleFinalizeSale = async () => {
    if (items.length === 0) {
      toast.error("Adicione pelo menos um item ao carrinho.");
      return;
    }
    if (nfType === "nfe") {
      if (!selectedCustomer) {
        toast.error("Para Nota Fiscal (NF-e) é obrigatório selecionar um cliente cadastrado.");
        return;
      }
      if (!selectedCustomer.doc || selectedCustomer.doc.replace(/\D/g, "").length < 11) {
        toast.error("O cliente selecionado precisa ter CPF/CNPJ cadastrado para emissão de NF-e.");
        return;
      }
    }


    if (total <= 0) {
      toast.error("O valor da venda deve ser maior que zero.");
      return;
    }

    if (payments.length === 0) {
      toast.error("Adicione ao menos uma forma de pagamento.");
      return;
    }

    // Validação por linha de pagamento
    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      const m = paymentMethods.find((x) => x.id === p.payment_method_id);
      const label = `Pagamento ${i + 1}`;
      if (!p.payment_method_id) {
        toast.error(`${label}: selecione a forma de pagamento.`);
        return;
      }
      if (!(Number(p.amount || 0) > 0)) {
        toast.error(`${label}: informe um valor maior que zero.`);
        return;
      }
      if (m?.requires_due_date && !p.first_due_date) {
        toast.error(`${label}: informe a data de vencimento.`);
        return;
      }
    }

    // Soma efetiva (excedente em dinheiro vira troco)
    let effectivePaid = 0;
    let remainingForCash = total;
    for (const p of payments) {
      const m = paymentMethods.find((x) => x.id === p.payment_method_id);
      const isCash = /dinheiro|cash|especie|espécie/i.test(m?.name ?? p.method ?? "");
      const amt = Number(p.amount || 0);
      const eff = isCash ? Math.min(amt, Math.max(0, remainingForCash)) : amt;
      effectivePaid += eff;
      remainingForCash -= eff;
    }
    const missing = Number((total - effectivePaid).toFixed(2));
    if (missing > 0.01) {
      toast.error(`Faltam ${brl(missing)} para cobrir o total da venda (${brl(total)}).`);
      return;
    }
    if (!paymentsBalanced) {
      toast.error("A soma dos pagamentos deve ser maior ou igual ao total da venda.");
      return;
    }

    if (
      await confirm({
        title: "Finalizar venda?",
        description: `Confirmar registro da venda no valor de ${brl(total)}?`,
        confirmLabel: "Sim, Finalizar",
        cancelLabel: "Não, Voltar",
      })
    ) {
      try {
        setFinalizeStep("Validando pagamento...");
        if (currentSaleId) {
          const { data: existingSale, error } = await supabase
            .from("sales")
            .select("id")
            .eq("id", currentSaleId)
            .maybeSingle();
          if (error) throw error;

          if (!existingSale) {
            setCurrentSaleId(null);
            localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
            setFinalizeStep("Registrando venda...");
            await sellMut.mutateAsync();
            return;
          }

          setFinalizeStep("Atualizando venda...");
          await updateSaleMut.mutateAsync({
            saleId: currentSaleId,
            items,
            discount: discountAmount,
            reason: "Finalização automática",
          });
          setFinalizeStep("Abatendo estoque...");
          await finalizeOpenMut.mutateAsync(currentSaleId);
        } else {
          setFinalizeStep("Registrando venda...");
          await sellMut.mutateAsync();
        }
      } catch (e: unknown) {
        setFinalizeStep(null);
        if (!updateSaleMut.isError && !finalizeOpenMut.isError && !sellMut.isError) {
          toast.error(e instanceof Error ? e.message : "Falha ao finalizar venda.");
        }
      }
    }
  };

  // Sincronização automática para reserva de estoque
  const isSyncingRef = useRef(false);
  const syncOpenSaleMut = useMutation({
    mutationFn: async () => {
      if (isSyncingRef.current || !activeRegisterUserId) return currentSaleId;
      isSyncingRef.current = true;
      try {
        if (!currentSaleId) {
          // Double check before creating to prevent race conditions
          const { data: existingOpen } = await supabase
            .from("sales")
            .select("id")
            .eq("company_id", cid)
            .eq("status", "aberta")
            .eq("created_by", activeRegisterUserId)
            .maybeSingle();

          if (existingOpen) {
            setCurrentSaleId(existingOpen.id);
            await updateSaleItems(
              existingOpen.id,
              cid,
              items,
              discountAmount,
              "Reserva automática",
            );
            return existingOpen.id;
          }

          const id = await registerSale({
            companyId: cid,
            customerId: customerId === "none" ? null : customerId,
            items: items.map((i) => ({
              product_id: i.product_id,
              quantity: i.quantity,
              unit_price: i.unit_price,
            })),
            discount: discountAmount,
            paymentMethod: selectedPaymentMethod?.name ?? "dinheiro",
            dueDate: requiresDueDate ? dueDate || null : null,
            userId: activeRegisterUserId,
            status: "aberta",
          });
          return id;
        } else {
          await updateSaleItems(currentSaleId, cid, items, discountAmount, "Reserva automática");
          return currentSaleId;
        }
      } finally {
        isSyncingRef.current = false;
      }
    },
    onSuccess: (id) => {
      if (!currentSaleId && id) {
        setCurrentSaleId(id);
      }
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-cash-sales", cid, currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["current-session-open-sales", cid, currentRegister?.id] });
    },
  });

  const lastSyncRef = useRef<string>("");
  useEffect(() => {
    if (items.length === 0) return;

    // Evitar sync se os itens não mudaram (comparação simples por JSON)
    const currentItemsStr = JSON.stringify({ items, customerId, discountAmount });
    if (lastSyncRef.current === currentItemsStr) return;

    const timer = setTimeout(() => {
      syncOpenSaleMut.mutate();
      lastSyncRef.current = currentItemsStr;
    }, 400);

    return () => clearTimeout(timer);
  }, [items, customerId, discountAmount, discountMode, currentSaleId]);

  const handleSaveOpen = async () => {
    if (
      await confirm({
        title: "Salvar como venda em aberto?",
        description:
          "Esta venda ficará salva no sistema e o estoque dos produtos será reservado (abatido) imediatamente. Você poderá finalizá-la ou editá-la mais tarde.",
        confirmLabel: "Sim, Salvar em Aberto",
        cancelLabel: "Voltar",
      })
    ) {
      saveOpenMut.mutate();
    }
  };

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentMethodForm>(emptyPaymentMethod);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", doc: "" });

  const saveCustomerMut = useMutation({
    mutationFn: () =>
      upsertPartner(cid, {
        name: customerForm.name.trim(),
        type: "cliente",
        phone: customerForm.phone || null,
        doc: customerForm.doc || null,
        userId: user?.id,
      }),
    onSuccess: (p) => {
      toast.success("Sucesso! Cliente cadastrado.");
      qc.invalidateQueries({ queryKey: ["partners", cid] });
      setCustomerDialogOpen(false);
      setCustomerForm({ name: "", phone: "", doc: "" });
      setCustomerId(p.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePaymentMut = useMutation({
    mutationFn: () => upsertPaymentMethod(cid, paymentForm),
    onSuccess: () => {
      toast.success("Sucesso! Forma de pagamento criada.");
      qc.invalidateQueries({ queryKey: ["payment_methods", cid] });
      setPaymentDialogOpen(false);
      setPaymentForm(emptyPaymentMethod);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = async (p: Product) => {
    const physical = Number(p.stock);
    const available = stockReservation.availableFor(p.id, physical);
    if (available <= 0) {
      toast.error(`Sem estoque disponível: ${p.name} (reservado por outro caixa)`);
      return;
    }

    // Bloqueia produto sem código de estoque — abre dialog para gerar/informar
    // O "Código de Estoque" é especificamente o alternative_code para etiquetas
    const hasStockCode = !!(p.alternative_code && p.alternative_code.trim());

    if (!hasStockCode) {
      console.log("Produto sem código de estoque detectado:", p.name);
      setStockCodeProduct(p);
      setStockCodeInput("");
      setPickerOpen(false);
      // O useEffect cuidará de abrir o modal após o fechamento do picker
      return;
    }
    const existing = items.find((i) => i.product_id === p.id);
    const newQty = (existing?.quantity ?? 0) + 1;
    if (newQty > available) {
      toast.error(`Estoque máximo disponível (${available}) atingido para ${p.name}`);
      return;
    }
    try {
      await stockReservation.reserve(p.id, newQty);
    } catch (e: any) {
      toast.error(e.message || "Não foi possível reservar o estoque");
      return;
    }
    setItems((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (ex) {
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, quantity: newQty, stock: available } : i,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: 1,
          unit_price: Number(p.sale_price),
          stock: available,
          description: p.description ?? null,
        },
      ];
    });
    // Limpa a busca e o leitor para agilizar a próxima seleção
    setPickerOpen(false);
    setProductSearch("");
    setBarcodeInput("");
  };

  // Dialog para informar/gerar código de estoque ao adicionar produto sem código
  const [stockCodeOpen, setStockCodeOpen] = useState(false);
  const [stockCodeProduct, setStockCodeProduct] = useState<Product | null>(null);
  const [stockCodeInput, setStockCodeInput] = useState("");

  // Efeito para abrir o modal de código de estoque assim que o produto for selecionado e o seletor fechado
  useEffect(() => {
    if (stockCodeProduct && !pickerOpen && !stockCodeOpen) {
      // Pequeno delay para garantir que o Radix limpou o estado do modal anterior e o DOM está pronto
      const timer = setTimeout(() => {
        setStockCodeOpen(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [stockCodeProduct, pickerOpen, stockCodeOpen]);
  const stockCodeMut = useMutation({
    mutationFn: async ({ id, code }: { id: string; code: string }) =>
      updateProduct(id, { alternative_code: code } as Partial<Product>, user?.id),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["products", cid] });
      setStockCodeOpen(false);
      // Adiciona ao carrinho com o novo código
      const p = { ...(stockCodeProduct as Product), alternative_code: updated.alternative_code };
      setStockCodeProduct(null);
      addItem(p);
      toast.success("Código de estoque salvo!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // Validação em tempo real do código de estoque
  const stockCodeValidation = useMemo(() => {
    const code = stockCodeInput.trim().toUpperCase();
    if (!code)
      return { valid: true, message: null as string | null, type: "info" as "info" | "error" };
    const formatErr = validateStockCode(code);
    if (formatErr) return { valid: false, message: formatErr, type: "error" as const };
    const dup = products.find(
      (p: any) =>
        p.id !== stockCodeProduct?.id &&
        ((p.alternative_code || "").toUpperCase() === code || (p.sku || "").toUpperCase() === code),
    );
    if (dup)
      return {
        valid: false,
        message: `Código já usado por: ${dup.name} (${dup.alternative_code === code ? "Código" : "SKU"})`,
        type: "error" as const,
      };
    return { valid: true, message: "Código disponível ✓", type: "info" as const };
  }, [stockCodeInput, products, stockCodeProduct]);

  const handleSaveStockCode = () => {
    if (!stockCodeProduct) return;
    let code = stockCodeInput.trim().toUpperCase();
    if (!code) {
      const prefix = (companySettingsQ.data as any)?.stock_code_prefix || "EST";
      code = generateStockCode(
        products.map((p: any) => p.alternative_code),
        prefix,
      );
    } else {
      if (!stockCodeValidation.valid) {
        toast.error(stockCodeValidation.message || "Código inválido");
        return;
      }
    }
    stockCodeMut.mutate({ id: stockCodeProduct.id, code });
  };

  const removeItem = async (id: string) => {
    if (
      await confirm({
        title: "Remover item do carrinho?",
        description:
          "Tem certeza que deseja remover este item do carrinho? A reserva de estoque será liberada.",
        confirmLabel: "Remover",
      })
    ) {
      try {
        await stockReservation.reserve(id, 0);
        // Garante que o banco de dados seja atualizado imediatamente se houver uma venda em aberto (reserva persistida)
        if (currentSaleId) {
          const newItems = items.filter((x) => x.product_id !== id);
          if (newItems.length === 0) {
            // Se o carrinho ficar vazio, deletamos a venda
            deleteSaleMut.mutate(currentSaleId);
            setCurrentSaleId(null);
            localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
          } else {
            await updateSaleItems(currentSaleId, cid, newItems, discountAmount, "Remoção de item");
          }
          qc.invalidateQueries({ queryKey: ["products", cid] });
        }
      } catch (err) {
        console.error("Erro ao liberar reserva:", err);
      }
      setItems((prev) => prev.filter((x) => x.product_id !== id));
    }
  };

  const updateItemQuantity = async (id: string, newQty: number) => {
    const product = products.find((p: any) => p.id === id);
    if (!product) return;
    const available = stockReservation.availableFor(id, Number(product.stock));
    const q = Math.min(Math.max(1, newQty), available);
    try {
      await stockReservation.reserve(id, q);
    } catch (e: any) {
      toast.error(e.message || "Falha ao atualizar reserva");
      return;
    }
    setItems((prev) =>
      prev.map((x) => (x.product_id === id ? { ...x, quantity: q, stock: available } : x)),
    );
  };

  const updateProductPrice = (id: string, newPrice: number) => {
    // Atualiza o preço apenas no carrinho. A persistência no cadastro do produto
    // só acontece se a venda for finalizada (e somente para produtos sem preço de venda).
    setItems((prev) => prev.map((x) => (x.product_id === id ? { ...x, unit_price: newPrice } : x)));
  };

  // Sincroniza no cadastro do produto o preço de venda informado durante a venda,
  // somente para produtos cujo sale_price atual seja 0/nulo. Chamada após finalizar a venda.
  const syncMissingProductPrices = async (
    soldItems: { product_id: string; unit_price: number; name?: string }[],
  ) => {
    const updates = soldItems.filter((it) => {
      const p = products.find((pr: any) => pr.id === it.product_id);
      return p && (!p.sale_price || Number(p.sale_price) === 0) && Number(it.unit_price) > 0;
    });
    if (updates.length === 0) return;
    await Promise.allSettled(
      updates.map((it) =>
        updateProduct(it.product_id, { sale_price: it.unit_price } as Partial<Product>, user?.id),
      ),
    );
    qc.invalidateQueries({ queryKey: ["products-all", cid] });
  };

  // Índice de códigos de sub-marca (product_references) por produto.
  // Usa a query dedicada productRefsQ como fonte da verdade (independente do
  // que veio agregado em `products`), garantindo que a busca no PDV encontre
  // o produto por qualquer código de marca cadastrado.
  const refsByProductId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of (productRefsQ.data ?? []) as any[]) {
      const code = (r?.manufacturer_code || "").trim();
      if (!code || !r?.product_id) continue;
      const arr = map.get(r.product_id) ?? [];
      arr.push(code);
      map.set(r.product_id, arr);
    }
    return map;
  }, [productRefsQ.data]);

  const handleBarcodeSubmit = (val: string) => {
    const code = val.trim();
    if (!code) return;
    const upper = code.toUpperCase();
    const product = products.find((p: any) => {
      if (p.id === code) return true;
      if (p.sku && p.sku.trim().toUpperCase() === upper) return true;
      if (p.alternative_code && p.alternative_code.trim().toUpperCase() === upper) return true;
      const refs = refsByProductId.get(p.id) ?? [];
      if (refs.some((r) => r.toUpperCase() === upper)) return true;
      const attached = (p.product_references || []) as any[];
      return attached.some((r) => (r?.manufacturer_code || "").trim().toUpperCase() === upper);
    });

    if (product) {
      const hasStockCode = !!(product.alternative_code && product.alternative_code.trim());
      addItem(product);
      if (hasStockCode) toast.success(`${product.name} adicionado!`);
    } else {
      toast.error("Produto não encontrado.");
    }
  };

  // Busca incremental para autocomplete do leitor (matching local em memória).
  // Prioriza match exato e prefixo em alternative_code/sku e códigos de marca.
  const barcodeSearch = useMemo(
    () => (term: string) => {
      const t = term.trim().toUpperCase();
      if (t.length < 2) return [] as any[];
      const out: { score: number; item: any }[] = [];
      for (const p of products as any[]) {
        const alt = (p.alternative_code || "").toUpperCase();
        const sku = (p.sku || "").toUpperCase();
        const name = (p.name || "").toUpperCase();
        const attached: string[] = ((p.product_references || []) as any[])
          .map((r) => (r?.manufacturer_code || "").toUpperCase())
          .filter(Boolean);
        const fromMap = (refsByProductId.get(p.id) ?? []).map((r) => r.toUpperCase());
        const refs = Array.from(new Set([...attached, ...fromMap]));
        let score = 0;
        let matchedRef = "";
        if (alt === t || sku === t) score = 100;
        else if (refs.some((r) => r === t)) {
          score = 95;
          matchedRef = refs.find((r) => r === t) || "";
        } else if (alt.startsWith(t)) score = 80;
        else if (sku.startsWith(t)) score = 70;
        else if (refs.some((r) => r.startsWith(t))) {
          score = 65;
          matchedRef = refs.find((r) => r.startsWith(t)) || "";
        } else if (alt.includes(t)) score = 50;
        else if (sku.includes(t)) score = 40;
        else if (refs.some((r) => r.includes(t))) {
          score = 35;
          matchedRef = refs.find((r) => r.includes(t)) || "";
        } else if (name.includes(t)) score = 20;
        if (score > 0) {
          const sublabelParts = [
            p.sku && `SKU ${p.sku}`,
            matchedRef && `REF ${matchedRef}`,
            `Estoque: ${p.stock ?? 0}`,
          ].filter(Boolean);
          out.push({
            score,
            item: {
              id: p.id,
              label: `${p.alternative_code || p.sku || "—"} · ${p.name}`,
              sublabel: sublabelParts.join(" · "),
              payload: p,
            },
          });
        }
        if (out.length > 64) break;
      }
      out.sort((a, b) => b.score - a.score);
      return out.map((o) => o.item);
    },
    [products, refsByProductId],
  );

  const handleUnlock = async () => {
    try {
      await unlockRegister(hasSpecialAccess ? "" : unlockPassword);
      setUnlockPassword("");
      setShowUnlockDialog(false);
    } catch (err) {}
  };
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);

  if (isLocked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full p-8 text-center space-y-6 border-2 border-brand-red/20 shadow-xl">
          <div className="mx-auto size-20 rounded-full bg-brand-red/10 flex items-center justify-center">
            <LockIcon className="size-10 text-brand-red animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Caixa Bloqueado</h1>
            <p className="text-muted-foreground text-sm">
              {hasSpecialAccess
                ? "Terminal bloqueado por segurança. Clique para desbloquear."
                : "Terminal bloqueado por segurança. Informe sua senha para continuar."}
            </p>
          </div>
          <div className="space-y-4">
            {!hasSpecialAccess && (
              <Input
                type="password"
                placeholder="Sua senha de login"
                className="text-center"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              />
            )}
            <Button className="w-full h-12 text-lg" onClick={handleUnlock} disabled={isUnlocking}>
              <LockIcon className="mr-2 size-5" /> {isUnlocking ? "Verificando..." : "Desbloquear"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const [showMobileCart, setShowMobileCart] = useState(false);

  return (
    <>
      <div className="space-y-4 md:space-y-6 pb-24 md:pb-12 pdv-container">
        {!isCashOpen && !viewingClosedRegister && !isCashLoading && (
          <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center justify-center gap-2 font-bold animate-in fade-in slide-in-from-top duration-300 rounded-lg shadow-md mb-4 sticky top-0 z-50">
            <AlertCircle className="size-5" />
            <span>CAIXA FECHADO - ABRA O CAIXA PARA INICIAR AS VENDAS</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <PageHeading
              icon={ShoppingCart}
              title="Vendas (PDV)"
              subtitle="Registre vendas e baixe estoque automaticamente."
            />
            <div className="flex items-center gap-2">
              <Badge
                variant={isCashOpen && !viewingClosedRegister ? "default" : "secondary"}
                className={cn(
                  "text-[10px] md:text-xs",
                  isCashOpen && !viewingClosedRegister
                    ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20"
                    : "",
                )}
              >
                {viewingClosedRegister ? "Visualizando caixa fechado" : isCashOpen ? "Caixa Aberto" : "Caixa Fechado"}
              </Badge>
              {isLocked && (
                <Badge
                  variant="outline"
                  className="text-[10px] md:text-xs border-brand-red text-brand-red"
                >
                  Bloqueado
                </Badge>
              )}
              {isCashOpen && !viewingClosedRegister && (
                <Badge
                  variant="outline"
                  className="text-[10px] md:text-xs border-green-500 text-green-600"
                >
                  Venda Ativa
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {!viewingClosedRegister && allOpenRegisters && allOpenRegisters.length > 0 && (
              <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border shrink-0">
                <User className="size-4 ml-2 text-muted-foreground" />
                <Select
                  value={activeRegisterUserId}
                  onValueChange={(id) => {
                    setActiveRegisterUserId(id);
                    localStorage.setItem(SELECTED_CAIXA_USER_KEY, id);
                  }}
                >
                  <SelectTrigger className="w-[140px] md:w-[180px] h-8 border-none bg-transparent shadow-none focus:ring-0">
                    <SelectValue placeholder="Selecionar Caixa" />
                  </SelectTrigger>
                  <SelectContent>
                    {user?.id && (
                      <SelectItem value={user.id}>
                        {membershipQ.data?.profile?.name ||
                          user?.user_metadata?.full_name ||
                          user?.user_metadata?.name ||
                          user?.email?.split("@")[0] ||
                          "Meu Caixa"}
                      </SelectItem>
                    )}
                    {allOpenRegisters
                      .filter((reg: any) => reg.user_id_open !== user?.id)
                      .map((reg: any) => (
                        <SelectItem key={reg.user_id_open} value={reg.user_id_open}>
                          {reg.profiles?.name || reg.profiles?.email || "Operador"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isCashOpen && !viewingClosedRegister && (
              <Badge
                variant="outline"
                className="h-10 px-3 flex items-center gap-2 border-green-200 bg-green-50 text-green-700 shrink-0"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Saldo: {cashMask(brl(currentCashBalance))}
                {cashCanToggle && (
                  <button
                    type="button"
                    onClick={cashToggle}
                    className="ml-1 inline-flex items-center justify-center text-green-700 hover:text-green-900"
                    title={cashHidden ? "Mostrar saldo" : "Ocultar saldo"}
                  >
                    {cashHidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                )}
              </Badge>
            )}

            {isCashOpen && !viewingClosedRegister && items.length > 0 && (
              <Badge
                variant="outline"
                className="h-10 px-3 flex items-center gap-2 border-amber-300 bg-amber-50 text-amber-800 shrink-0"
                title="Venda em andamento no carrinho — finalize ou descarte para fechar o caixa"
              >
                <ShoppingCart className="size-4" />
                Venda em andamento: {items.length} item(ns) · {brl(total)}
              </Badge>
            )}




          </div>

        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {!isCashOpen && !viewingClosedRegister && canOpenCash && (
            <Button
              size="sm"
              className="bg-brand-red hover:bg-brand-red/90"
              onClick={() => {
                setManagerWantsToOpen(true);
              }}
              disabled={isOpening}
            >
              {isOpening ? "Abrindo..." : "Abrir Caixa"}
            </Button>
          )}





          {isCashOpen && !viewingClosedRegister && (
            <>
              {items.length === 0 && (
                <Button variant="outline" size="sm" onClick={handleToggleLock}>
                  <LockIcon className="mr-2 size-4" /> Bloquear
                </Button>
              )}
              <SangriaButton
                currentRegister={currentRegister}
                transactions={(currentTransactionsQ.data as any[]) || []}
                addTransaction={addTransaction as any}
                size="sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="text-brand-red border-brand-red/20 hover:bg-brand-red/5"
                title="Fechar o caixa atual"
                onClick={handleCloseCashClick}

              >
                <Ban className="mr-2 size-4" /> Fechar Caixa
              </Button>

              <OverdueTasksDialog
                open={overdueCloseOpen}
                onOpenChange={setOverdueCloseOpen}
                companyId={cid}
                userId={user?.id}
                continueLabel="Continuar fechamento"
                onContinue={() => void proceedCloseCash()}
              />


              <Button
                variant="outline"
                size="sm"
                onClick={handleTestClosingReceipt}
                title="Imprimir uma prévia/teste do cupom de fechamento com as configurações atuais de impressão"
              >
                <Receipt className="mr-2 size-4" /> Testar cupom de fechamento
              </Button>



              {currentRegister?.user_id_open === user?.id &&
                !hasOpenSales &&
                !sessionHasFiscalNote &&
                (currentSessionSalesQ.data?.length || 0) === 0 &&
                (currentTransactionsQ.data?.length || 0) === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/20 hover:bg-destructive/5"
                    onClick={handleCancelRegister}
                    title="Cancelar a abertura desta sessão (sem vendas/movimentações)"
                  >
                    <Trash2 className="mr-2 size-4" /> Cancelar Abertura
                  </Button>
                )}

            </>
          )}
        </div>

        <Dialog
          open={(managerWantsToOpen || (!isCashOpen && !viewingClosedRegister && !hasSpecialAccess)) && !isCashLoading}
          onOpenChange={(open) => {
            if (!open) {
              setManagerWantsToOpen(false);
              if (!isCashOpen && !hasSpecialAccess) navigate({ to: "/app" });
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LockIcon className="size-5 text-brand-red" />{" "}
                {canOpenCash ? "Abertura de Caixa Necessária" : "Caixa Fechado"}
              </DialogTitle>
              <DialogDescription>
                {canOpenCash
                  ? "Para iniciar as vendas, você precisa abrir o caixa informando o saldo inicial."
                  : "Você não tem permissão para abrir o caixa. Contate um administrador."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!canOpenCash ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <Ban className="size-12 text-destructive opacity-50" />
                  <p className="text-center text-sm text-muted-foreground max-w-[200px]">
                    Consulte um administrador para liberar seu acesso.
                  </p>
                </div>
              ) : myOpenRegister ? (
                <div className="space-y-3 rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950/20 p-3">
                  <p className="text-sm text-amber-900 dark:text-amber-100">
                    <strong>Você já possui um caixa aberto</strong> desde{" "}
                    {new Date(myOpenRegister.opened_at).toLocaleString("pt-BR")}. Feche-o antes de
                    abrir um novo.
                  </p>
                  <Button
                    className="w-full bg-brand-red hover:bg-brand-red/90"
                    onClick={() => {
                      setManagerWantsToOpen(false);
                      setActiveRegisterUserId(user!.id);
                      try {
                        localStorage.setItem(SELECTED_CAIXA_USER_KEY, user!.id);
                      } catch {
                        /* ignore */
                      }
                      setShowCloseModal(true);
                    }}
                  >
                    <Ban className="mr-2 size-4" /> Fechar caixa aberto
                  </Button>
                </div>
              ) : (
                <>
                  {hasSpecialAccess ? (

                    <div className="space-y-2">
                      <Label htmlFor="opening-user">Operador do Caixa</Label>
                      <Select
                        value={selectedOpeningUserId}
                        onValueChange={setSelectedOpeningUserId}
                      >
                        <SelectTrigger id="opening-user">
                          <SelectValue placeholder="Selecione um operador" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUsers.map((m) => (
                            <SelectItem key={m.user_id} value={m.user_id}>
                              {m.profile?.name || m.profile?.email || "Sem nome"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Operador do Caixa</Label>
                      <Input value={user?.email || ""} disabled className="bg-muted" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="opening-balance">Saldo Inicial em Dinheiro</Label>
                    <Input
                      id="opening-balance"
                      value={openingBalanceRaw}
                      onChange={(e) => setOpeningBalanceRaw(formatCurrencyInput(e.target.value))}
                      className="text-lg font-semibold"
                      autoFocus={!hasSpecialAccess}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/app" })}
                disabled={isOpening}
                className="w-full sm:w-auto"
              >
                Voltar para Início
              </Button>
              {canOpenCash && !myOpenRegister && (
                <Button
                  className="w-full sm:w-auto bg-brand-red hover:bg-brand-red/90"
                  onClick={handleOpenRegister}
                  disabled={isOpening || !!selectedOperatorOpenRegister}
                >

                  {isOpening ? "Abrindo..." : "Confirmar Abertura"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {(isCashOpen || viewingClosedRegister) && (
          <>
            {isCashOpen && !viewingClosedRegister && (
            <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
              <Card className={`p-4 sm:p-5 lg:col-span-2 space-y-4 ${reopenedFromNumber ? "border-2 border-amber-500 ring-2 ring-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20" : ""}`}>
                <div className="flex items-center gap-2">
                  <ShoppingCart className="size-4 text-brand-red" />
                  <h3 className="font-semibold">{reopenedFromNumber ? `Editando venda #${reopenedFromNumber}` : "Nova venda"}</h3>
                </div>
                {reopenedFromNumber && (
                  <div className="rounded-md border-2 border-amber-500 bg-amber-100/70 dark:bg-amber-900/30 px-3 py-2 flex items-start gap-2 text-amber-900 dark:text-amber-100">
                    <CalendarClock className="size-4 mt-0.5 shrink-0" />
                    <div className="text-sm flex-1">
                      <strong>Venda #{reopenedFromNumber} reaberta.</strong> Os itens originais foram carregados no carrinho. Ajuste e finalize novamente para gerar os recebíveis atualizados.
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-amber-900 dark:text-amber-100 hover:bg-amber-200/60"
                      onClick={() => {
                        setReopenedFromNumber(null);
                        try { localStorage.removeItem(`${SAVED_SALE_KEY}_reopenedNumber`); } catch {}
                      }}
                    >
                      Ocultar
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Tipo de Nota Fiscal</Label>
                  <Select value={nfType} onValueChange={(v) => setNfType(v as any)}>
                    <SelectTrigger className="w-full sm:max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      
                      <SelectItem value="nfce">Cupom Fiscal (NFC-e)</SelectItem>
                      <SelectItem value="nfe">Nota Fiscal (NF-e) — exige cliente</SelectItem>
                    </SelectContent>
                  </Select>
                  {nfType === "nfe" && (!selectedCustomer || !selectedCustomer.doc) && (
                    <p className="text-xs text-destructive">
                      Selecione um cliente cadastrado com CPF/CNPJ para emitir NF-e.
                    </p>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between min-h-7">
                      <Label>Cliente</Label>
                      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-brand-red hover:text-brand-red hover:bg-brand-red/10"
                            onClick={() => setCustomerForm({ name: "", phone: "", doc: "" })}
                          >
                            <Plus className="size-3" /> Novo
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Novo cliente</DialogTitle>
                            <DialogDescription>Cadastro rápido para esta venda</DialogDescription>
                          </DialogHeader>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!customerForm.name.trim()) return;
                              saveCustomerMut.mutate();
                            }}
                            className="space-y-4 pt-2"
                          >
                            <div className="space-y-2">
                              <Label htmlFor="cust-name">Nome *</Label>
                              <Input
                                id="cust-name"
                                required
                                autoFocus
                                placeholder="Nome do cliente"
                                value={customerForm.name}
                                onChange={(e) =>
                                  setCustomerForm({ ...customerForm, name: e.target.value })
                                }
                              />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="cust-phone">Telefone</Label>
                                <Input
                                  id="cust-phone"
                                  inputMode="tel"
                                  placeholder="(00) 00000-0000"
                                  value={customerForm.phone}
                                  onChange={(e) =>
                                    setCustomerForm({
                                      ...customerForm,
                                      phone: maskPhone(e.target.value),
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="cust-doc">CPF/CNPJ</Label>
                                <Input
                                  id="cust-doc"
                                  inputMode="numeric"
                                  placeholder="000.000.000-00"
                                  value={customerForm.doc}
                                  onChange={(e) =>
                                    setCustomerForm({
                                      ...customerForm,
                                      doc: maskCpfCnpj(e.target.value),
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCustomerDialogOpen(false)}
                              >
                                Cancelar
                              </Button>
                              <Button
                                type="submit"
                                disabled={saveCustomerMut.isPending}
                                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
                              >
                                {saveCustomerMut.isPending ? "Salvando..." : "Salvar"}
                              </Button>
                            </DialogFooter>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Consumidor final</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {customerId !== "none" && availableCredit > 0 && (
                      <div className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                        Cliente possui <strong>{brl(availableCredit)}</strong> em crédito.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center min-h-7">
                      <Label>Buscar produto</Label>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setProductSearch("");
                        setPickerOpen(true);
                      }}
                      className="w-full justify-between font-normal"
                    >
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Search className="size-4" /> Buscar…
                      </span>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center min-h-7">
                      <Label>Leitor de Código (SKU)</Label>
                    </div>
                    <BarcodeScanInput
                      onSubmit={handleBarcodeSubmit}
                      search={barcodeSearch}
                      onPick={(s) => addItem(s.payload)}
                    />
                  </div>
                </div>
                <Dialog
                  open={pickerOpen}
                  onOpenChange={(o) => {
                    setPickerOpen(o);
                    if (!o) setProductSearch("");
                  }}
                >
                  <DialogContent
                    className="max-w-2xl p-0 gap-0 overflow-hidden"
                    onPointerDownOutside={(e) => {
                      if (stockCodeOpen) e.preventDefault();
                    }}
                    onInteractOutside={(e) => {
                      if (stockCodeOpen) e.preventDefault();
                    }}
                  >
                    <DialogHeader className="px-5 pt-5 pb-3">
                      <DialogTitle>Buscar produto</DialogTitle>
                      <DialogDescription>
                        Pesquisa instantânea em nome, SKU, código alternativo, marca, código do fabricante e demais campos.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="px-5 pb-3 flex gap-2">
                      <div className="relative flex-1">
                        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape" && productSearch) {
                              e.preventDefault();
                              setProductSearch("");
                            }
                          }}
                          placeholder="Digite para buscar…"
                          className="pl-9"
                        />
                      </div>
                      {productSearch && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setProductSearch("");
                          }}
                        >
                          Limpar
                        </Button>
                      )}
                      <Select value={productBrandFilter} onValueChange={setProductBrandFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Marca" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas marcas</SelectItem>
                          {brands.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto border-t">
                      {productsQ.isLoading ? (
                        <ProductPickerSkeleton />
                      ) : productsQ.isError ? (
                        <div className="p-12 text-center text-destructive font-medium">
                          Erro ao carregar produtos.
                        </div>
                      ) : (
                        (() => {
                          const filtered = productPickerResults;

                          if (filtered.length === 0)
                            return (
                              <div className="p-8 text-center text-sm text-muted-foreground">
                                Nenhum produto encontrado.
                              </div>
                            );

                          return (
                            <ul className="divide-y">
                              {filtered.map((p: any) => {
                                const inCart = items.find((i) => i.product_id === p.id);
                                const available = stockReservation.availableFor(
                                  p.id,
                                  Number(p.stock),
                                );
                                const remaining = available - (inCart?.quantity ?? 0);
                                const disabled = remaining <= 0;
                                const reservedByOthers =
                                  stockReservation.reservedByOthersMap.get(p.id) ?? 0;

                                return (
                                  <li key={p.id}>
                                    <div
                                      className={cn(
                                        "w-full px-5 py-3 flex items-start justify-between gap-3 transition-colors text-left",
                                        disabled
                                          ? "opacity-50 cursor-not-allowed"
                                          : "hover:bg-muted/60 cursor-pointer",
                                      )}
                                      role="button"
                                      onClick={() => {
                                        if (!disabled) addItem(p);
                                      }}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="font-medium flex items-center gap-2 overflow-hidden">
                                          <span className="truncate">{p.name}</span>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="size-6 text-muted-foreground hover:text-foreground"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setViewingProductDesc(p);
                                              }}
                                            >
                                              <AlertCircle className="size-4" />
                                            </Button>
                                            {inCart && (
                                              <Check className="size-3 text-brand-red shrink-0" />
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                            <span className="font-mono">
                                              {p.sku}
                                              {p.alternative_code ? ` / ${p.alternative_code}` : ""}
                                            </span>
                                            <span>·</span>
                                            <span>
                                              Disponível: {available}
                                              {p.unit}
                                            </span>
                                            {reservedByOthers > 0 && (
                                              <>
                                                <span>·</span>
                                                <span className="text-amber-600">
                                                  {reservedByOthers} reservado(s) por outro caixa
                                                </span>
                                              </>
                                            )}
                                            {p.profiles?.name && (
                                              <>
                                                <span>·</span>
                                                <span className="text-blue-600 flex items-center gap-1">
                                                  <User className="size-3" />
                                                  {p.profiles.name}
                                                  <span className="text-muted-foreground/50">
                                                    ·
                                                  </span>
                                                  <span className="text-muted-foreground font-normal">
                                                    {new Date(p.updated_at).toLocaleString(
                                                      "pt-BR",
                                                      { dateStyle: "short", timeStyle: "short" },
                                                    )}
                                                  </span>
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <div className="font-semibold">
                                          {brl(Number(p.sale_price))}
                                        </div>
                                        {disabled && (
                                          <div className="text-[10px] text-destructive mt-0.5">
                                            {Number(p.stock) > 0 ? "Reservado" : "Sem estoque"}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          );
                        })()
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={!!viewingProductDesc}
                  onOpenChange={(open) => !open && setViewingProductDesc(null)}
                >
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>{viewingProductDesc?.name}</DialogTitle>
                      <DialogDescription>Detalhes e descrição do produto</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Descrição</Label>
                        <div className="text-sm bg-muted/50 p-3 rounded-md min-h-[100px] whitespace-pre-wrap">
                          {viewingProductDesc?.description || "Sem descrição disponível."}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs uppercase text-muted-foreground">
                            Código (SKU)
                          </Label>
                          <div className="text-sm font-mono">{viewingProductDesc?.sku}</div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs uppercase text-muted-foreground">
                            Preço de Venda
                          </Label>
                          <div className="text-sm font-semibold text-brand-red">
                            {brl(Number(viewingProductDesc?.sale_price || 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                      <Button variant="outline" onClick={() => setViewingProductDesc(null)}>
                        Fechar
                      </Button>
                      <Button
                        onClick={() => {
                          const p = viewingProductDesc;
                          setViewingProductDesc(null);
                          const available = stockReservation.availableFor(p.id, Number(p.stock));
                          const inCart = items.find((i) => i.product_id === p.id);
                          const remaining = available - (inCart?.quantity ?? 0);
                          if (remaining > 0) {
                            addItem(p);
                            setPickerOpen(false);
                          } else {
                            toast.error("Produto sem estoque disponível.");
                          }
                        }}
                      >
                        Adicionar ao carrinho
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <div className="hidden sm:block rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead className="w-24">Qtd</TableHead>
                        <TableHead className="w-36 text-right">Preço unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!isCartHydrated ? (
                        Array.from({ length: 3 }).map((_, idx) => (
                          <CartItemSkeleton key={idx} />
                        ))
                      ) : items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Carrinho vazio
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((i) => (
                          <TableRow key={i.product_id}>
                            <TableCell className="font-medium align-top">
                              {i.name}
                              <div className="text-xs text-muted-foreground font-normal">
                                {i.sku} · disponível {i.stock}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                max={i.stock}
                                value={i.quantity}
                                onChange={(e) => {
                                  const raw = Math.max(1, Number(e.target.value) || 1);
                                  updateItemQuantity(i.product_id, raw);
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                inputMode="numeric"
                                value={brlNumber(i.unit_price)}
                                onChange={(e) => {
                                  const v = parseCurrencyInput(e.target.value);
                                  updateProductPrice(i.product_id, v);
                                }}
                                className="text-right"
                              />
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {brl(i.quantity * i.unit_price)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeItem(i.product_id)}
                              >
                                <Trash2 className="size-4 text-brand-red" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="sm:hidden space-y-2">
                  {!isCartHydrated ? (
                    Array.from({ length: 3 }).map((_, idx) => (
                      <CartItemSkeletonMobile key={idx} />
                    ))
                  ) : items.length === 0 ? (
                    <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
                      Carrinho vazio
                    </div>
                  ) : (
                    items.map((i) => (
                      <div
                        key={i.product_id}
                        className="rounded-md border border-border p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{i.name}</div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {i.sku} · disponível {i.stock}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeItem(i.product_id)}
                          >
                            <Trash2 className="size-4 text-brand-red" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Qtd
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={i.stock}
                              value={i.quantity}
                              onChange={(e) => {
                                const raw = Math.max(1, Number(e.target.value) || 1);
                                updateItemQuantity(i.product_id, raw);
                              }}
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Preço unit.
                            </Label>
                            <Input
                              inputMode="numeric"
                              value={brlNumber(i.unit_price)}
                              onChange={(e) => {
                                const v = parseCurrencyInput(e.target.value);
                                updateProductPrice(i.product_id, v);
                              }}
                              className="h-8 text-right"
                            />
                          </div>
                        </div>
                        <div className="flex justify-between items-center border-t pt-2">
                          <span className="text-xs text-muted-foreground">Total</span>
                          <span className="font-semibold text-sm">
                            {brl(i.quantity * i.unit_price)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Receipt className="size-4 text-brand-orange" />
                  <h3 className="font-semibold">Resumo</h3>
                </div>
                {items.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
                    Adicione produtos ao carrinho para concluir a venda.
                  </div>
                ) : (<>
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1 text-brand-red hover:text-brand-red hover:bg-brand-red/10"
                        onClick={() => setPaymentForm(emptyPaymentMethod)}
                      >
                        <Plus className="size-3" /> Novo
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Nova forma de pagamento</DialogTitle>
                      </DialogHeader>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!paymentForm.name.trim()) return;
                          savePaymentMut.mutate();
                        }}
                        className="space-y-4 pt-4"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="pm-name">Nome</Label>
                          <Input
                            id="pm-name"
                            required
                            placeholder="Ex: Cartão de Crédito, PIX..."
                            value={paymentForm.name}
                            onChange={(e) =>
                              setPaymentForm({ ...paymentForm, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                          <div className="space-y-0.5">
                            <Label>Exigir vencimento</Label>
                            <p className="text-xs text-muted-foreground">
                              Útil para boletos/promissórias
                            </p>
                          </div>
                          <Switch
                            checked={paymentForm.requires_due_date}
                            onCheckedChange={(v) =>
                              setPaymentForm({ ...paymentForm, requires_due_date: v })
                            }
                          />
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPaymentDialogOpen(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="submit"
                            disabled={savePaymentMut.isPending}
                            className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
                          >
                            {savePaymentMut.isPending ? "Salvando..." : "Salvar"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <SalePaymentsEditor
                    total={total}
                    paymentMethods={paymentMethods}
                    payments={payments}
                    onChange={setPayments}
                    voucherMethodId={voucherMethodId}
                    maxVoucher={customerId !== "none" ? availableCredit : 0}
                  />
                </div>
                {!showDiscountFields && discountAmount === 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => setShowDiscountFields(true)}
                  >
                    <Plus className="size-3" /> Adicionar desconto
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Desconto</Label>
                      {discountAmount === 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowDiscountFields(false)}
                        >
                          <X className="size-3" />
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={discountMode}
                        onValueChange={(v) => setDiscountMode(v as DiscountMode)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="valor">R$ Valor</SelectItem>
                          <SelectItem value="percentual">% Percentual</SelectItem>
                        </SelectContent>
                      </Select>
                      {discountMode === "valor" ? (
                        <Input
                          inputMode="numeric"
                          value={discountValueRaw}
                          onChange={(e) => {
                            const val = parseCurrencyInput(e.target.value);
                            if (val > subtotal) {
                              setDiscountValueRaw(formatCurrencyInput(String(subtotal)));
                              toast.warning(`Desconto limitado ao subtotal: ${brl(subtotal)}`);
                            } else {
                              setDiscountValueRaw(formatCurrencyInput(e.target.value));
                            }
                          }}
                          className="text-right"
                        />
                      ) : (
                        <Input
                          inputMode="decimal"
                          value={discountPctRaw}
                          onChange={(e) => {
                            const val = Number(e.target.value.replace(",", "."));
                            if (val > 100) {
                              setDiscountPctRaw("100");
                              toast.warning("Desconto limitado a 100%");
                            } else {
                              setDiscountPctRaw(e.target.value.replace(/[^\d.,]/g, ""));
                            }
                          }}
                          className="text-right"
                          placeholder="0"
                        />
                      )}
                    </div>
                  </div>
                )}
                {isCashPayment && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Recebido</Label>
                      <Input
                        inputMode="numeric"
                        value={amountReceivedRaw}
                        onChange={(e) => setAmountReceivedRaw(formatCurrencyInput(e.target.value))}
                        className="text-right"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Troco</Label>
                      <div className="h-10 flex items-center justify-end px-3 border rounded-md bg-muted/50 font-semibold text-green-600">
                        {brl(change)}
                      </div>
                    </div>
                  </div>
                )}
                <div className="border-t border-border pt-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{brl(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Desconto</span>
                      <span>- {brl(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-2">
                    <span>Total</span>
                    <span className="text-brand-red">{brl(total)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-md border border-border mb-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-muted-foreground" />
                    <Label htmlFor="auto_print" className="text-sm cursor-pointer">
                      Emitir cupom automaticamente
                    </Label>
                  </div>
                  <Switch
                    id="auto_print"
                    checked={autoPrintCoupon}
                    onCheckedChange={(v) => {
                      setAutoPrintCoupon(v);
                      // Persiste sincronamente para garantir leitura correta na finalização imediata
                      try {
                        localStorage.setItem(`auto_print_coupon_${cid}`, String(v));
                      } catch {}
                    }}
                  />

                </div>
                {autoPrintCoupon && (
                  <div className="flex items-center justify-between gap-2 -mt-1 mb-3 px-1">
                    <span className="text-xs text-muted-foreground">
                      {qzEnabled(cid) && qzPrinterName(cid)
                        ? `Impressora: ${qzPrinterName(cid)}`
                        : "QZ Tray não configurado nesta máquina"}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleTestPrinter}
                      disabled={testingPrinter}
                    >
                      {testingPrinter ? (
                        <Loader2 className="size-3.5 mr-1 animate-spin" />
                      ) : (
                        <Printer className="size-3.5 mr-1" />
                      )}
                      Testar impressora
                    </Button>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        const saleData = {
                          customer_id: customerId === "none" ? null : customerId,
                          items: items,
                          subtotal: subtotal,
                          discount: discountAmount,
                          total: total,
                          paymentMethod:
                            payments
                              .map((p: any) => p?.method)
                              .filter(Boolean)
                              .join(" + ") ||
                            selectedPaymentMethod?.name ||
                            "Dinheiro",
                          payments,
                          number: "PRÉVIA",
                        };
                        setPreviewTitle("Prévia do Cupom");
                        setPreviewContent(getSaleHtml(saleData));
                        setShowSalePreview(true);
                      }}
                      disabled={sellMut.isPending || items.length === 0}
                      className="flex-1 border-brand-red/20 text-brand-red hover:bg-brand-red/5"
                    >
                      <Eye className="size-4 mr-2" /> Prévia
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Limpar carrinho?",
                            description:
                              "O carrinho será limpo. Se houver uma venda em aberto no banco de dados, ela será excluída e o estoque será devolvido.",
                            confirmLabel: "Sim, Limpar",
                            variant: "destructive",
                          })
                        ) {
                          if (currentSaleId) {
                            // Se existe uma venda "aberta" no banco, excluimos permanentemente
                            deleteSaleMut.mutate(currentSaleId);
                          }
                          // Limpa estado local do carrinho
                          setItems([]);
                          setCurrentSaleId(null);
                          setReopenedFromNumber(null);
                          setDiscountValueRaw("0,00");
                          setDiscountPctRaw("0");
                          setCustomerId("none"); setNfType("nfce"); localStorage.removeItem(`${SAVED_SALE_KEY}_nfType`);
                          setPaymentMethodId("");
                          setPayments([]);
                          localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
                          localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
                          localStorage.removeItem(`${SAVED_SALE_KEY}_reopenedNumber`);
                          stockReservation.releaseAll();
                        }
                      }}
                      disabled={sellMut.isPending || items.length === 0}
                      className="flex-1 border-destructive/20 text-destructive hover:bg-destructive/5"
                    >
                      <Ban className="size-4 mr-2" /> Cancelar
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {finalizeStep && (
                      <div className="w-full bg-brand-red/10 border border-brand-red/20 rounded-md p-2 flex items-center justify-center gap-2">
                        <div className="size-2 bg-brand-red rounded-full animate-ping" />
                        <span className="text-xs font-medium text-brand-red">{finalizeStep}</span>
                      </div>
                    )}
                    <Button
                      onClick={handleFinalizeSale}
                      disabled={
                        sellMut.isPending ||
                        finalizeOpenMut.isPending ||
                        updateSaleMut.isPending ||
                        items.length === 0 ||
                        !paymentsBalanced ||
                        !isCashOpen ||
                        (nfType === "nfe" && (!selectedCustomer || !selectedCustomer.doc))
                      }
                      className="w-full bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground py-6 text-lg"
                    >
                      <Plus className="size-5 mr-2" />
                      {sellMut.isPending || finalizeOpenMut.isPending || updateSaleMut.isPending
                        ? "Finalizando..."
                        : "Finalizar venda"}
                    </Button>
                  </div>
                </div>
                </>)}
              </Card>
            </div>
            )}

            {/* Seção de Vendas Recentes Removida e integrada ao Histórico abaixo */}

            <div id="historico" className="mt-6">
              <Card className="p-4">
                {viewingClosedRegister && (
                  <div className="mb-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => navigate({ to: "/app/fechamento-caixa" })}
                      className="h-8"
                    >
                      <ArrowLeft className="size-3.5 mr-1" />
                      Voltar para Gestão de Caixa
                    </Button>
                  </div>
                )}
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 mb-4">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Receipt className="size-4 text-brand-red" />
                      <h3 className="font-semibold">Histórico de Vendas</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => {
                          qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
                          qc.invalidateQueries({ queryKey: ["sales", cid] });
                          toast.success("Histórico atualizado");
                        }}
                        disabled={salesQ.isFetching}
                        title="Atualizar histórico"
                      >
                        <RefreshCw className={cn("size-3.5 mr-1", salesQ.isFetching && "animate-spin")} />
                        Atualizar
                      </Button>
                      <PrintButton
                        onClick={handlePrint}
                        disabled={filteredSales.length === 0}
                        className="h-7 px-2 text-[10px]"
                      />
                    </div>
                    <div className="ml-6 space-y-0.5">
                      <p className="text-[11px] text-muted-foreground">
                        {totalSalesCount} {totalSalesCount === 1 ? "registro" : "registros"}
                        {totalPages > 1 && ` • página ${currentPage} de ${totalPages}`}
                      </p>
                      {paginatedSales.length > 0 && (() => {
                        const bruto = paginatedSales
                          .filter((s: any) => s.status === "concluida" && s.type !== "devolucao")
                          .reduce((a: number, s: any) => a + Number(s.total ?? 0), 0);
                        const cancelado = paginatedSales
                          .filter((s: any) => s.status === "cancelada")
                          .reduce((a: number, s: any) => a + Number(s.total ?? 0), 0);
                        const devolvido = paginatedSales
                          .filter((s: any) => s.type === "devolucao" && s.status === "concluida")
                          .reduce((a: number, s: any) => a + Number(s.total ?? 0), 0);
                        const sangrias = isCashOpen && !viewingClosedRegister ? currentCashSummary.withdrawals : 0;
                        const liquido = bruto - devolvido - sangrias;
                        return (
                          <p className="text-[11px] flex flex-wrap gap-x-3 gap-y-0.5">
                            <span className="text-muted-foreground">Bruto: <span className="font-medium text-foreground">{brl(bruto)}</span></span>
                            {cancelado > 0 && (
                              <span className="text-destructive">Canceladas: - {brl(cancelado)}</span>
                            )}
                            {devolvido > 0 && (
                              <span className="text-orange-600">Devoluções: - {brl(devolvido)}</span>
                            )}
                            {sangrias > 0 && (
                              <span className="text-muted-foreground">Sangrias: - {brl(sangrias)}</span>
                            )}
                            <span className="text-muted-foreground">Líquido: <span className="font-semibold text-success">{brl(liquido)}</span></span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full lg:w-auto">
                    <div className="relative col-span-2 sm:col-span-1 sm:flex-1 sm:min-w-[200px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar Nº venda, cliente..."
                        className="h-8 pl-8 text-xs bg-muted/50 border-none focus:ring-0"
                        value={saleSearchTerm}
                        onChange={(e) => setSaleSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">De:</Label>
                      <Input
                        type="date"
                        value={dateFromFilter}
                        onChange={(e) => setDateFromFilter(e.target.value)}
                        className="h-8 w-full sm:w-[130px] text-[10px] bg-muted/50 border-none focus:ring-0"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground">Até:</Label>
                      <Input
                        type="date"
                        value={dateToFilter}
                        onChange={(e) => setDateToFilter(e.target.value)}
                        className="h-8 w-full sm:w-[130px] text-[10px] bg-muted/50 border-none focus:ring-0"
                      />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs bg-muted/50 border-none focus:ring-0">
                        <SelectValue placeholder="Todos status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todos status</SelectItem>
                        <SelectItem value="concluida">Concluídas</SelectItem>
                        <SelectItem value="cancelada">Canceladas</SelectItem>
                        <SelectItem value="aguardando">Aguardando Confirmação</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => {
                        const newSize = Number(v);
                        setPageSize(newSize);
                        setCurrentPage(1);
                        localStorage.setItem("sales_pageSize", String(newSize));
                      }}
                    >
                      <SelectTrigger
                        className="h-8 w-[70px] text-xs bg-muted/50 border-none focus:ring-0"
                        title="Itens por página"
                      >
                        <SelectValue placeholder="50" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {salesQ.isLoading ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">Carregando...</div>
                  ) : paginatedSales.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 text-sm">Nenhuma venda encontrada</div>
                  ) : (
                    paginatedSales.map((s: any) => {
                      const c = customers.find((x) => x.id === s.customer_id);
                      const hasNote = !!activeNoteMap[s.id];
                      const isReturn = s.type === "devolucao";
                      const returnedBy = returnsMap[s.id];
                      const originNumber = isReturn ? originsMap[s.origin_sale_id] : null;
                      return (
                        <div key={s.id} className={cn(
                          "rounded-lg border border-border bg-card p-3 flex flex-col gap-2 border-l-4",
                          isReturn ? "border-l-orange-500 bg-orange-50/30" :
                          returnedBy ? "border-l-orange-400" :
                          hasNote ? "border-l-green-500" : "border-l-red-500",
                        )}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                                <span className="font-mono">#{s.number}</span>
                                {emailSentMap[s.id] && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span><MailCheck className="size-3.5 text-green-600" aria-label="E-mail da nota enviado com sucesso" /></span>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-green-600 text-white">E-mail da nota (XML + PDF) enviado com sucesso</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {emailFailedMap[s.id] && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span><MailX className="size-3.5 text-red-600" aria-label="Falha no envio do e-mail da nota" /></span>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-red-600 text-white">Falha no envio do e-mail da nota (XML + PDF)</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <span>•</span>
                                <span>{dt(s.created_at)}</span>
                                {isReturn && (
                                  <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50 text-[9px] px-1 py-0">
                                    Devolução de #{originNumber ?? "?"}
                                  </Badge>
                                )}
                                {returnedBy && (
                                  <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50 text-[9px] px-1 py-0">
                                    Devolvida por #{returnedBy.number}
                                  </Badge>
                                )}
                                {s.origin === "delivery" && (
                                  <Badge variant="outline" className="border-orange-500 text-orange-600 bg-orange-50 text-[9px] px-1 py-0">
                                    Delivery
                                  </Badge>
                                )}
                              </div>

                              <div className="font-semibold truncate mt-0.5">{c?.name ?? "Consumidor final"}</div>
                              <div className="text-[11px] text-muted-foreground truncate capitalize">
                                {s.payment_method} • {s.profiles?.name || s.profiles?.email || "—"}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "capitalize text-[10px]",
                                  s.status === "aberta" && "border-amber-500 text-amber-600 bg-amber-50",
                                  s.status === "concluida" && "border-green-500 text-green-600 bg-green-50",
                                  s.status === "cancelada" && "border-destructive text-destructive bg-destructive/5",
                                  s.status === "aguardando" && "border-blue-500 text-blue-600 bg-blue-50",
                                )}
                              >
                                {s.status === "aguardando" ? "Aguardando" : s.status}
                              </Badge>
                              <div className="font-bold mt-1">{brl(Number(s.total))}</div>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-1 -mr-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailSaleId(s.id)} title="Ver detalhes">
                              <Eye className="size-4" />
                            </Button>
                            {s.status === "aberta" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600"
                                onClick={async () => {
                                  if (await confirm({ title: "Finalizar venda?", description: `Confirmar conclusão da venda #${s.number}?` }))
                                    finalizeOpenMut.mutate(s.id);
                                }}
                                disabled={!isCashOpen}
                              >
                                <Check className="size-4" />
                              </Button>
                            )}
                            {s.status === "concluida" && !isReturn && <NfceButton saleId={s.id} />}
                            {s.status === "aberta" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={async () => {
                                  if (await confirm({
                                    title: "Excluir venda aberta permanentemente?",
                                    description: "Esta ação é IRREVERSÍVEL. A venda será removida do banco de dados e as reservas de estoque serão liberadas.",
                                    confirmLabel: "Sim, Excluir",
                                    variant: "destructive",
                                  })) deleteSaleMut.mutate(s.id);
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                            {s.status === "concluida" && !isReturn && !returnedBy && (activeNoteMap[s.id] !== "processando") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-600"
                                title="Cancelar venda concluída"
                                onClick={() => {
                                  setCancelDialogSale({
                                    id: s.id,
                                    number: s.number,
                                    total: Number(s.total ?? 0),
                                    customer_id: s.customer_id ?? null,
                                    customer_name: s.customer?.name ?? null,
                                    customer_doc: s.customer?.doc ?? null,
                                  });
                                }}
                              >
                                <Ban className="size-4" />
                              </Button>
                            )}

                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="hidden md:block rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                          onClick={() => handleSort("created_at")}
                        >
                          <div className="flex items-center gap-1">
                            Data{" "}
                            <ArrowDownUp
                              className={cn(
                                "size-3",
                                sortConfig?.key === "created_at"
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-50",
                              )}
                            />
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                          onClick={() => handleSort("number")}
                        >
                          <div className="flex items-center gap-1">
                            Nº{" "}
                            <ArrowDownUp
                              className={cn(
                                "size-3",
                                sortConfig?.key === "number"
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-50",
                              )}
                            />
                          </div>
                        </TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                          onClick={() => handleSort("customer_name")}
                        >
                          <div className="flex items-center gap-1">
                            Cliente{" "}
                            <ArrowDownUp
                              className={cn(
                                "size-3",
                                sortConfig?.key === "customer_name"
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-50",
                              )}
                            />
                          </div>
                        </TableHead>
                        <TableHead>Vendedor</TableHead>
                        <TableHead
                          className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                          onClick={() => handleSort("payment_method")}
                        >
                          <div className="flex items-center gap-1">
                            Pgto{" "}
                            <ArrowDownUp
                              className={cn(
                                "size-3",
                                sortConfig?.key === "payment_method"
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-50",
                              )}
                            />
                          </div>
                        </TableHead>
                        <TableHead className="select-none">
                          <div
                            className="flex items-center gap-1 cursor-pointer hover:underline text-xs"
                            onClick={() => handleSort("status")}
                          >
                            Status{" "}
                            <ArrowDownUp
                              className={cn(
                                "size-3",
                                sortConfig?.key === "status" ? "opacity-100" : "opacity-30",
                              )}
                            />
                          </div>
                        </TableHead>
                        <TableHead
                          className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                          onClick={() => handleSort("total")}
                        >
                          <div className="flex items-center justify-end gap-1">
                            Total{" "}
                            <ArrowDownUp
                              className={cn(
                                "size-3",
                                sortConfig?.key === "total"
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-50",
                              )}
                            />
                          </div>
                        </TableHead>
                        <TableHead className="w-24 text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesQ.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Carregando vendas...
                          </TableCell>
                        </TableRow>
                      ) : paginatedSales.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Nenhuma venda encontrada.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedSales.map((s: any) => {
                          const c = customers.find((x) => x.id === s.customer_id);
                          const hasNote = !!activeNoteMap[s.id];
                          const isReturn = s.type === "devolucao";
                          const returnedBy = returnsMap[s.id];
                          const originNumber = isReturn ? originsMap[s.origin_sale_id] : null;
                          return (
                            <TableRow key={s.id} className={cn(
                              "border-l-4! ",
                              isReturn ? "border-l-orange-500! bg-orange-50/30" :
                              returnedBy ? "border-l-orange-400!" :
                              hasNote ? "border-l-green-500!" : "border-l-red-500!",
                            )}>
                              <TableCell className="text-sm">{dt(s.created_at)}</TableCell>
                              <TableCell className="font-mono text-xs">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span>#{s.number}</span>
                                  {emailSentMap[s.id] && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span><MailCheck className="size-3.5 text-green-600" aria-label="E-mail da nota enviado com sucesso" /></span>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-green-600 text-white">E-mail da nota (XML + PDF) enviado com sucesso</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {emailFailedMap[s.id] && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span><MailX className="size-3.5 text-red-600" aria-label="Falha no envio do e-mail da nota" /></span>
                                        </TooltipTrigger>
                                        <TooltipContent className="bg-red-600 text-white">Falha no envio do e-mail da nota (XML + PDF)</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {isReturn && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50 text-[9px] px-1 py-0">
                                      Devolução de #{originNumber ?? "?"}
                                    </Badge>
                                  )}
                                  {returnedBy && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-700 bg-orange-50 text-[9px] px-1 py-0" title={`Devolvida na venda #${returnedBy.number}`}>
                                      Devolvida por #{returnedBy.number}
                                    </Badge>
                                  )}
                                  {s.origin === "delivery" && (

                                    <Badge variant="outline" className="border-orange-500 text-orange-600 bg-orange-50 text-[9px] px-1 py-0">
                                      Delivery
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{c?.name ?? "Consumidor final"}</TableCell>

                              <TableCell className="text-sm font-medium">
                                {s.profiles?.name || s.profiles?.email || "—"}
                              </TableCell>
                              <TableCell className="capitalize text-sm">
                                {s.payment_method}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "capitalize",
                                    s.status === "aberta" &&
                                      "border-amber-500 text-amber-600 bg-amber-50",
                                    s.status === "concluida" &&
                                      "border-green-500 text-green-600 bg-green-50",
                                    s.status === "cancelada" &&
                                      "border-destructive text-destructive bg-destructive/5",
                                    s.status === "aguardando" &&
                                      "border-blue-500 text-blue-600 bg-blue-50",
                                  )}
                                >
                                  {s.status === "aguardando" ? "Aguardando" : s.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {brl(Number(s.total))}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setDetailSaleId(s.id)}
                                    title="Ver detalhes da venda"
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                  {s.status === "aberta" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-green-600"
                                      onClick={async () => {
                                        if (
                                          await confirm({
                                            title: "Finalizar venda?",
                                            description: `Confirmar conclusão da venda #${s.number}?`,
                                          })
                                        )
                                          finalizeOpenMut.mutate(s.id);
                                      }}
                                      disabled={!isCashOpen}
                                    >
                                      <Check className="size-4" />
                                    </Button>
                                  )}
                                  {s.status === "aberta" ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                      title="Remover venda aberta permanentemente"
                                      onClick={async () => {
                                        if (
                                          await confirm({
                                            title: "Excluir venda aberta permanentemente?",
                                            description:
                                              "Esta ação é IRREVERSÍVEL. A venda será removida do banco de dados e as reservas de estoque serão liberadas.",
                                            confirmLabel: "Sim, Excluir",
                                            variant: "destructive",
                                          })
                                        ) {
                                          deleteSaleMut.mutate(s.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  ) : s.status === "concluida" ? (
                                    isReturn ? null : (
                                    <>
                                      <NfceButton saleId={s.id} />
                                      {isManager && !returnedBy && (() => {
                                        const noteStatus = activeNoteMap[s.id];
                                        if (noteStatus) return null;
                                        return (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-blue-600"
                                            title="Editar venda"
                                            onClick={async () => {
                                              if (!isCashOpen) {
                                                toast.error("Abra o caixa para reabrir a venda no carrinho.");
                                                return;
                                              }
                                              if (items.length > 0) {
                                                const ok = await confirm({
                                                  title: "Descartar venda em andamento?",
                                                  description:
                                                    "Há itens no carrinho atual. Eles serão descartados para reabrir esta venda no carrinho. Deseja continuar?",
                                                  confirmLabel: "Descartar e reabrir",
                                                  variant: "destructive",
                                                });
                                                if (!ok) return;
                                                if (currentSaleId) {
                                                  try { deleteSaleMut.mutate(currentSaleId); } catch {}
                                                }
                                              }
                                               const okReopen = await confirm({
                                                 title: `Reabrir venda #${s.sale_number ?? ""} para edição?`,
                                                 description: (
                                                   <div className="space-y-3 text-sm">
                                                     <p>
                                                       Esta venda voltará ao status <strong>ABERTA</strong> e será carregada novamente no carrinho. Ao confirmar, o sistema fará automaticamente:
                                                     </p>
                                                     <ul className="list-disc pl-5 space-y-1.5">
                                                       <li>
                                                         <strong>Histórico:</strong> a venda sai da lista de vendas concluídas até ser finalizada novamente.
                                                       </li>
                                                       <li>
                                                         <strong>Estoque:</strong> as reservas/baixas dos itens são restabelecidas e serão recalculadas com base nos itens finais.
                                                       </li>
                                                       <li>
                                                         <strong>Financeiro:</strong> os recebíveis, lançamentos de caixa e pagamentos vinculados são removidos e recriados ao finalizar a venda.
                                                       </li>
                                                       <li>
                                                         <strong>Itens, cliente e desconto:</strong> ficam disponíveis no carrinho para alteração livre.
                                                       </li>
                                                     </ul>
                                                     <p className="text-muted-foreground">
                                                       Nenhuma alteração definitiva ocorre até você finalizar a venda novamente.
                                                     </p>
                                                   </div>
                                                 ),
                                                 confirmLabel: "Reabrir venda",
                                                 cancelLabel: "Cancelar",
                                                 variant: "default",
                                               });
                                               if (!okReopen) return;
                                               reopenToCartMut.mutate(s);
                                            }}
                                          >
                                            <Pencil className="size-4" />
                                          </Button>
                                        );
                                      })()}
                                      {!returnedBy && (() => {
                                        const noteStatus = activeNoteMap[s.id];
                                        if (noteStatus === "processando") return null;
                                        return (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-amber-600"
                                            title="Cancelar venda concluída"
                                            onClick={() => {
                                              setCancelDialogSale({
                                                id: s.id,
                                                number: s.number,
                                                total: Number(s.total ?? 0),
                                                customer_id: s.customer_id ?? null,
                                                customer_name: s.customer?.name ?? null,
                                                customer_doc: s.customer?.doc ?? null,
                                              });
                                            }}
                                          >
                                            <Ban className="size-4" />
                                          </Button>
                                        );
                                      })()}
                                    </>
                                    )
                                  ) : null}


                                  {isSAdmin && s.status !== "aberta" && (() => {
                                    const noteStatus = activeNoteMap[s.id];
                                    if (noteStatus) return null;
                                    return (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/10 opacity-50 hover:opacity-100"
                                        title="Exclusão administrativa (SAdmin)"
                                        onClick={async () => {
                                          if (
                                            await confirm({
                                              title: "Excluir venda permanentemente (SAdmin)?",
                                              description:
                                                "Esta ação é IRREVERSÍVEL. A venda será removida do banco de dados e o estoque/financeiro serão restaurados. Use apenas para erros graves ou limpeza de testes.",
                                              confirmLabel: "Sim, Excluir Definitivamente",
                                              variant: "destructive",
                                            })
                                          ) {
                                            deleteSaleMut.mutate(s.id);
                                          }
                                        }}
                                      >
                                        <Trash2 className="size-4" />
                                      </Button>
                                    );
                                  })()}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                    {paginatedSales.length > 0 && (() => {
                      const bruto = paginatedSales
                        .filter((s: any) => s.status === "concluida" && s.type !== "devolucao")
                        .reduce((a: number, s: any) => a + Number(s.total ?? 0), 0);
                      const cancelado = paginatedSales
                        .filter((s: any) => s.status === "cancelada")
                        .reduce((a: number, s: any) => a + Number(s.total ?? 0), 0);
                      const devolvido = paginatedSales
                        .filter((s: any) => s.type === "devolucao" && s.status === "concluida")
                        .reduce((a: number, s: any) => a + Number(s.total ?? 0), 0);
                      const sangrias = isCashOpen && !viewingClosedRegister ? currentCashSummary.withdrawals : 0;
                      const liquido = bruto - devolvido - sangrias;
                      return (
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={6} className="font-semibold">
                              Totais ({paginatedSales.length} {paginatedSales.length === 1 ? "venda" : "vendas"})
                              {(cancelado > 0 || devolvido > 0 || sangrias > 0) && (
                                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                                  Bruto {brl(bruto)}
                                  {cancelado > 0 && <span className="text-destructive"> • Canc. -{brl(cancelado)}</span>}
                                  {devolvido > 0 && <span className="text-orange-600"> • Dev. -{brl(devolvido)}</span>}
                                  {sangrias > 0 && <span> • Sangrias -{brl(sangrias)}</span>}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="text-[10px] font-normal text-muted-foreground leading-none">Líquido</div>
                              <div className="font-bold text-brand-orange">{brl(liquido)}</div>
                            </TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      );
                    })()}
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="mt-4">
                    <SmartPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {/* Atalhos Mobile */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-muted-foreground/10 px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
          <Button
            variant="outline"
            className="flex-1 h-14 flex flex-col items-center justify-center gap-1 border-muted-foreground/20 hover:bg-muted/5 rounded-xl transition-all active:scale-95"
            onClick={() => {
              setBarcodeInput("");
              setPickerOpen(true);
            }}
          >
            <Barcode className="size-6 text-brand-red" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Buscar</span>
          </Button>

          <div className="relative flex-1 h-14">
            <Button
              variant="outline"
              className="w-full h-full flex flex-col items-center justify-center gap-1 border-muted-foreground/20 hover:bg-muted/5 rounded-xl transition-all active:scale-95"
              onClick={() => setShowMobileCart(true)}
            >
              <ShoppingCart className="size-6 text-brand-red" />
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                Carrinho
              </span>
            </Button>
            {items.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-red text-white text-[10px] font-bold size-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                {items.reduce((acc, i) => acc + i.quantity, 0)}
              </span>
            )}
          </div>

          <Button
            className="flex-[1.5] h-14 flex items-center justify-center gap-2 bg-brand-red hover:bg-brand-red/90 rounded-xl shadow-lg shadow-brand-red/20 transition-all active:scale-95"
            onClick={handleFinalizeSale}
            disabled={
              sellMut.isPending ||
              finalizeOpenMut.isPending ||
              items.length === 0 ||
              !paymentMethodId ||
              !isCashOpen
            }
          >
            <Check className="size-6" />
            <div className="flex flex-col items-start leading-none">
              <span className="text-[10px] font-bold uppercase text-white/80">Finalizar</span>
              <span className="text-sm font-bold">{brl(total)}</span>
            </div>
          </Button>
        </div>

        {/* Drawer do Carrinho Mobile (bottom sheet estilo PDV) */}
        <Drawer open={showMobileCart} onOpenChange={setShowMobileCart}>
          <DrawerContent className="max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DrawerHeader className="p-4 border-b shrink-0">
              <div className="flex items-center justify-between">
                <DrawerTitle className="flex items-center gap-2">
                  <ShoppingCart className="size-5 text-brand-red" />
                  Seu Carrinho
                </DrawerTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowMobileCart(false)}>
                  <X className="size-5" />
                </Button>
              </div>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {!isCartHydrated ? (
                  Array.from({ length: 3 }).map((_, idx) => (
                    <CartDialogItemSkeleton key={idx} />
                  ))
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                    <ShoppingCart className="size-12 opacity-20" />
                    <p>Carrinho está vazio</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowMobileCart(false);
                        setPickerOpen(true);
                      }}
                    >
                      Adicionar Produtos
                    </Button>
                  </div>
                ) : (
                  items.map((i) => (
                    <div
                      key={i.product_id}
                      className="bg-muted/30 rounded-xl border border-muted-foreground/10 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate">{i.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">
                            {i.sku}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => removeItem(i.product_id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                            Quantidade
                          </Label>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateItemQuantity(i.product_id, i.quantity - 1)}
                              disabled={i.quantity <= 1}
                            >
                              -
                            </Button>
                            <Input
                              type="number"
                              value={i.quantity}
                              onChange={(e) =>
                                updateItemQuantity(i.product_id, Number(e.target.value))
                              }
                              className="h-8 text-center font-bold"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateItemQuantity(i.product_id, i.quantity + 1)}
                              disabled={i.quantity >= i.stock}
                            >
                              +
                            </Button>
                          </div>
                        </div>
                        <div className="flex-1 space-y-1 text-right">
                          <Label className="text-[10px] font-bold uppercase text-muted-foreground">
                            Preço
                          </Label>
                          <div className="text-sm font-bold">{brl(i.unit_price)}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-muted/20 space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{brl(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-brand-red">
                    <span>Desconto</span>
                    <span>- {brl(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-black pt-1 border-t border-muted-foreground/10 mt-1">
                  <span>Total</span>
                  <span className="text-brand-red">{brl(total)}</span>
                </div>
              </div>
              <Button
                className="w-full h-12 bg-brand-red hover:bg-brand-red/90 text-white font-bold rounded-xl"
                onClick={() => setShowMobileCart(false)}
              >
                Continuar Comprando
              </Button>
            </div>
          </DrawerContent>
        </Drawer>

        <Dialog
          open={showCloseModal}
          onOpenChange={(o) => {
            setShowCloseModal(o);
            if (o) {
              const counts: Record<string, string> = {};
              paymentMethods
                .filter((pm) => pm.active)
                .forEach((pm) => {
                  counts[pm.id] = formatCurrencyInput(
                    String((methodCalculatedBalances[pm.id] || 0).toFixed(2)),
                  );
                });
              setMethodCounts(counts);
            }
          }}
        >
          <DialogContent className="max-w-md w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-6 pb-3 shrink-0">
              <DialogTitle>Fechamento de Caixa</DialogTitle>
              <DialogDescription>
                Confira os totais calculados por método de pagamento.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4 min-h-0">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2 border border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo Inicial:</span>
                  <span>{brl(currentRegister?.initial_balance || 0)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vendas na Sessão:</span>
                  <span>{brl(currentCashBalance - (currentRegister?.initial_balance || 0))}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>Saldo Calculado:</span>
                  <span className="text-brand-red">{brl(currentCashBalance)}</span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Valores por Método</h4>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Calculado das vendas
                  </Badge>
                </div>
                <div className="space-y-2">
                  {paymentMethods
                    .filter((pm) => pm.active)
                    .map((pm) => (
                      <div
                        key={pm.id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-md border border-border bg-background"
                      >
                        <Label className="text-sm font-medium flex-1 truncate">{pm.name}</Label>
                        <Input
                          value={methodCounts[pm.id] || "0,00"}
                          readOnly
                          tabIndex={-1}
                          className="text-right w-32 bg-muted/40 border-muted font-semibold text-brand-red cursor-not-allowed"
                        />
                      </div>
                    ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Vendas da Sessão</h4>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {currentSessionSalesQ.data?.length || 0} venda(s)
                  </Badge>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                  {(currentSessionSalesQ.data?.length || 0) === 0 ? (
                    <div className="p-3 text-xs text-center text-muted-foreground">
                      Nenhuma venda registrada nesta sessão.
                    </div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Hora</th>
                          <th className="text-left p-2">Venda</th>
                          <th className="text-left p-2">Pagamento</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-right p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(currentSessionSalesQ.data || []).map((s: any) => (
                          <tr key={s.id} className={cn("border-t", s.status === "cancelada" && "opacity-70")}>
                            <td className="p-2 whitespace-nowrap">
                              {new Date(s.created_at).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="p-2">#{s.number ?? s.id.slice(0, 6)}</td>
                            <td className="p-2 truncate">{s.payment_method || "—"}</td>
                            <td className="p-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "capitalize text-[10px] px-1.5 py-0",
                                  s.status === "concluida" && "border-green-500 text-green-600 bg-green-50",
                                  s.status === "cancelada" && "border-destructive text-destructive bg-destructive/5",
                                )}
                              >
                                {s.status}
                              </Badge>
                            </td>
                            <td className={cn("p-2 text-right font-semibold", s.status === "cancelada" && "line-through text-muted-foreground")}>
                              {brl(s.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              {!hasSpecialAccess && (
                <div className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
                  Você não tem permissão para fechar o caixa. Ao confirmar, será
                  solicitada a autenticação de um usuário autorizado.
                </div>
              )}
            </div>
            <DialogFooter className="p-6 pt-3 flex-col sm:flex-row gap-2 border-t shrink-0">
              {lastClosingHtml && (
                <Button
                  variant="ghost"
                  onClick={() => void printClosing80mm(lastClosingHtml)}
                  className="w-full sm:w-auto sm:mr-auto"
                  title="Reimprimir último fechamento"
                >
                  <Receipt className="size-4 mr-2" /> Reimprimir último
                </Button>
              )}
              <div className="flex gap-2 justify-end w-full sm:w-auto sm:ml-auto">
                <Button variant="outline" onClick={() => setShowCloseModal(false)}>
                  Cancelar
                </Button>
                <Button
                  className="bg-brand-red hover:bg-brand-red/90"
                  onClick={handleCloseRegister}
                  disabled={isVerifying}
                >
                  <Receipt className="size-4 mr-2" />
                  {isVerifying ? "Processando..." : "Fechar e Imprimir"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AdminAuthDialog
          isOpen={closingAuthOpen}
          onClose={() => setClosingAuthOpen(false)}
          onSuccess={() => {
            setClosingAuthOpen(false);
            void performCloseAndPrint();
          }}
          title="Autorizar Fechamento de Caixa"
          description="Informe as credenciais de um usuário com permissão para fechar o caixa."
          module="fechamento-caixa"
          action="edit"
          requireReason={false}
        />
        <AdminAuthDialog
          isOpen={authDialog.isOpen}
          onClose={() => setAuthDialog((prev) => ({ ...prev, isOpen: false }))}
          onSuccess={authDialog.onSuccess}
          title={authDialog.title}
          description={authDialog.description}
          requireReason={authDialog.requireReason}
          skipAuth={authDialog.skipAuth}
          module={authDialog.module}
          action={authDialog.action}
        />
        <EditSaleDialog
          sale={editingSale}
          isOpen={!!editingSale}
          onClose={() => setEditingSale(null)}
          onSave={(payload) => {
            editSaleFullMut.mutate({ saleId: editingSale.id, payload });
          }}
          products={products}
          partners={(customers as any[]) || []}
          paymentMethods={(paymentMethods as any[]) || []}
          isSaving={editSaleFullMut.isPending}
        />
        <PrintPreviewDialog
          open={showSalePreview}
          onOpenChange={setShowSalePreview}
          title={previewTitle}
          content={previewContent}
          onConfirm={() => {
            setShowSalePreview(false);
            sellMut.mutate();
          }}
        />
        <PrintPreviewDialog
          open={showClosingPreview}
          onOpenChange={(o) => {
            setShowClosingPreview(o);
            if (!o) {
              setPendingClosingHtml(null);
              setPendingClosingCtx(null);
            }
          }}
          title={previewTitle}
          content={previewContent}
          onConfirm={
            pendingClosingHtml
              ? async () => {
                  const html = pendingClosingHtml;
                  setShowClosingPreview(false);
                  setPendingClosingHtml(null);
                  setPendingClosingCtx(null);
                  await printClosing80mm(html);
                }
              : undefined
          }
          extras={
            pendingClosingCtx ? (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={includeSalesClosing}
                  onCheckedChange={(v) => setIncludeSalesClosing(v === true)}
                />
                <span>Incluir lista detalhada de vendas no cupom</span>
              </label>
            ) : null
          }
        />

        <SaleProgressDialog
          open={progressOpen}
          steps={progressSteps}
          onClose={() => setProgressOpen(false)}
        />


        <SaleDetailDialog
          saleId={detailSaleId}
          onClose={() => setDetailSaleId(null)}
          onReprint={(saleData) => handlePrintSale(saleData)}
          isSAdmin={isSAdmin}
          onDelete={(id) => deleteSaleMut.mutate(id)}
          isDeleting={deleteSaleMut.isPending}
          isCashOpen={isCashOpen}
          onRetryNfce={(id) => doEmitNfce(id)}
        />

        <CancelSaleDialog
          open={!!cancelDialogSale}
          onOpenChange={(o) => !o && setCancelDialogSale(null)}
          sale={cancelDialogSale}
          onSuccess={() => {
            if (cancelDialogSale?.id === currentSaleId) {
              setItems([]);
              setCurrentSaleId(null);
              setReopenedFromNumber(null);
              localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
              localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
              localStorage.removeItem(`${SAVED_SALE_KEY}_reopenedNumber`);
              stockReservation.releaseAll();
            }
            setCancelDialogSale(null);
            qc.invalidateQueries({ queryKey: ["sales", cid] });
            qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
            qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
            qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
            qc.invalidateQueries({ queryKey: ["current-session-cash-sales", cid, currentRegister?.id] });
            qc.invalidateQueries({ queryKey: ["current-session-open-sales", cid, currentRegister?.id] });
            qc.invalidateQueries({ queryKey: ["current-cash-register", cid, user?.id] });
            qc.invalidateQueries({ queryKey: ["products", cid] });
            qc.invalidateQueries({ queryKey: ["partners", cid] });
            qc.invalidateQueries({ queryKey: ["customer-credit-balance"] });
          }}
        />

        <Dialog
          open={stockCodeOpen}
          onOpenChange={(o) => {
            if (!stockCodeMut.isPending) {
              setStockCodeOpen(o);
              if (!o) setStockCodeProduct(null);
            }
          }}
        >
          <DialogContent
            className="max-w-md"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Informe o Código Estoque</DialogTitle>
              <DialogDescription>
                {stockCodeProduct?.name} ainda não possui Código Estoque. Informe um código (apenas
                A-Z e 0-9) ou deixe em branco para gerar automaticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="stock-code-input">Código Estoque</Label>
                <Input
                  id="stock-code-input"
                  autoFocus
                  placeholder="Deixe em branco para gerar"
                  value={stockCodeInput}
                  onChange={(e) => setStockCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (stockCodeValidation.valid) handleSaveStockCode();
                    }
                  }}
                  className={cn(
                    "font-mono uppercase",
                    !stockCodeValidation.valid &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
                {stockCodeInput.trim() && stockCodeValidation.message ? (
                  <p
                    className={cn(
                      "text-xs flex items-center gap-1",
                      stockCodeValidation.valid ? "text-green-600" : "text-destructive font-medium",
                    )}
                  >
                    {stockCodeValidation.valid ? (
                      <Check className="size-3" />
                    ) : (
                      <AlertCircle className="size-3" />
                    )}
                    {stockCodeValidation.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Será salvo no cadastro do produto e usado para gerar etiquetas Code 128.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStockCodeOpen(false);
                    setStockCodeProduct(null);
                  }}
                  disabled={stockCodeMut.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveStockCode}
                  disabled={stockCodeMut.isPending || !stockCodeValidation.valid}
                  className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
                >
                  {stockCodeMut.isPending
                    ? "Salvando..."
                    : stockCodeInput.trim()
                      ? "Salvar e adicionar"
                      : "Gerar e adicionar"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function SaleDetailDialog({
  saleId,
  onClose,
  onReprint,
  isSAdmin,
  onDelete,
  isDeleting,
  isCashOpen,
  onRetryNfce,
}: {
  saleId: string | null;
  onClose: () => void;
  onReprint?: (saleData: any) => void;
  isSAdmin?: boolean;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
  isCashOpen?: boolean;
  onRetryNfce?: (saleId: string) => void | Promise<void>;
}) {

  const confirm = useConfirm();
  const open = !!saleId;
  const detailQ = useQuery({
    queryKey: ["sale-detail", saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const sb = supabase as any;
      const { data: sale, error: sErr } = await sb
        .from("sales")
        .select("*")
        .eq("id", saleId!)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!sale) return null;
      const { data: items, error: iErr } = await sb
        .from("sale_items")
        .select("id, quantity, unit_price, total, products(name, sku, unit)")
        .eq("sale_id", saleId!);
      if (iErr) throw iErr;
      let creator: { name: string; email: string } | null = null;
      if (sale.created_by) {
        const { data: prof } = await sb
          .from("profiles")
          .select("name, email")
          .eq("id", sale.created_by)
          .maybeSingle();
        creator = prof ?? null;
      }
      let customer: { name: string } | null = null;
      if (sale.customer_id) {
        const { data: c } = await sb
          .from("partners")
          .select("name")
          .eq("id", sale.customer_id)
          .maybeSingle();
        customer = c ?? null;
      }

      let cancellationLog: any = null;
      if (sale.status === "cancelada") {
        const { data: logs } = await sb
          .from("activity_logs")
          .select("*, profiles(name)")
          .eq("entity_id", saleId!)
          .eq("action", "CANCEL")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        cancellationLog = logs;
      }

      const { data: noteRows } = await sb
        .from("fiscal_notes")
        .select("id, status, motivo_rejeicao, created_at")
        .eq("sale_id", saleId!)
        .in("type", ["NFC-e", "nfce", "NF-e", "nfe"] as any)
        .order("created_at", { ascending: false })
        .limit(1);
      let latestNote: any = noteRows?.[0] ?? null;
      if (!latestNote || (latestNote.status !== "autorizada" && latestNote.status !== "processando" && latestNote.status !== "cancelada")) {
        const { data: authAttempt } = await sb
          .from("fiscal_note_attempts" as never)
          .select("id, status, created_at")
          .eq("sale_id", saleId!)
          .eq("status", "autorizada")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (authAttempt) latestNote = { ...(authAttempt as any), motivo_rejeicao: null };
      }

      return { sale, items: items ?? [], creator, customer, cancellationLog, latestNote };
    },
  });
  const data = detailQ.data;
  const isCancelled = data?.sale?.status === "cancelada";
  const isReturn = data?.sale?.type === "devolucao";
  const returnQ = useQuery({
    queryKey: ["sale-detail-return", saleId],
    enabled: !!saleId && !isReturn,
    queryFn: async () => {
      const { data: r } = await supabase
        .from("sales")
        .select("id, number")
        .eq("origin_sale_id", saleId!)
        .eq("type", "devolucao")
        .eq("status", "concluida")
        .limit(1)
        .maybeSingle();
      return r as { id: string; number: number } | null;
    },
  });
  const returnedBy = returnQ.data;
  const isReadOnly = isCancelled || isReturn || !!returnedBy;
  const latestNote = data?.latestNote;
  const canRetryNfce =
    !!onRetryNfce &&
    !isReadOnly &&
    !!data?.sale &&
    (!latestNote || latestNote.status === "rejeitada" || latestNote.status === "erro");




  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            <Receipt className="size-5 text-brand-orange" />
            Detalhes da venda {data?.sale ? `#${data.sale.number}` : ""}
            {isCancelled && (
              <Badge variant="destructive" className="ml-2 uppercase">
                Cancelada
              </Badge>
            )}
            {isReturn && (
              <Badge variant="outline" className="ml-2 uppercase border-orange-500 text-orange-700 bg-orange-50">
                Devolução
              </Badge>
            )}
            {returnedBy && (
              <Badge variant="outline" className="ml-2 uppercase border-orange-500 text-orange-700 bg-orange-50">
                Devolvida por #{returnedBy.number}
              </Badge>
            )}

            {data?.sale?.status === "aguardando" && (
              <Badge variant="outline" className="ml-2 uppercase border-blue-500 text-blue-600">
                Provisória
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>Informações completas da venda registrada.</DialogDescription>
        </DialogHeader>
        {detailQ.isLoading ? (
          <div className="py-10 text-center text-muted-foreground">Carregando...</div>
        ) : !data ? (
          <div className="py-10 text-center text-muted-foreground">Venda não encontrada.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Card className="p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="size-3" /> Data e hora
                </div>
                <div className="text-sm font-medium">{dt(data.sale.created_at)}</div>
              </Card>
              <Card className="p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <User className="size-3" /> Vendedor
                </div>
                <div className="text-sm font-medium">
                  {data.creator?.name || data.creator?.email || "—"}
                </div>
                {data.creator?.email && data.creator?.name && (
                  <div className="text-[11px] text-muted-foreground">{data.creator.email}</div>
                )}
              </Card>
              <Card className="p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <User className="size-3" /> Cliente
                </div>
                <div className="text-sm font-medium">
                  {data.customer?.name || "Consumidor final"}
                </div>
              </Card>
              <Card className="p-3 space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <CreditCard className="size-3" /> Pagamento
                </div>
                <div className="text-sm font-medium capitalize">
                  {data.sale.payment_method || "—"}
                </div>
                {data.sale.due_date && (
                  <div className="text-[11px] text-muted-foreground">
                    Venc.: {dt(data.sale.due_date)}
                  </div>
                )}
              </Card>
            </div>
            {isCancelled && data.cancellationLog && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                  <Ban className="size-4" /> VENDA CANCELADA
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground block uppercase text-[10px]">
                      Motivo
                    </span>
                    <span className="font-medium">
                      {data.cancellationLog.meta?.reason || "Não informado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block uppercase text-[10px]">
                      Cancelado por
                    </span>
                    <span className="font-medium">
                      {data.cancellationLog.profiles?.name || "—"}
                    </span>
                  </div>
                </div>
                {data.sale.notes?.includes("Cancelamento:") && (
                  <div className="pt-2 border-t border-destructive/10 mt-2">
                    <span className="text-muted-foreground block uppercase text-[10px]">
                      Justificativa armazenada
                    </span>
                    <p className="text-sm italic text-destructive/80">
                      {data.sale.notes
                        .replace(/Cancelamento:.*?\((por.*?)\)/, "$1")
                        .replace("Cancelamento:", "")
                        .trim()}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Produtos ({data.items.length})</h4>
              <div className="rounded-md border border-border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="w-16 text-center">Qtd</TableHead>
                      <TableHead className="w-28 text-right">Unit.</TableHead>
                      <TableHead className="w-28 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          Sem itens.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.items.map((it: any) => (
                        <TableRow key={it.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{it.products?.name ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {it.products?.sku ?? ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {Number(it.quantity)}
                            {it.products?.unit ? ` ${it.products.unit}` : ""}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {brl(Number(it.unit_price))}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {brl(Number(it.total))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border-t pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{brl(Number(data.sale.subtotal))}</span>
              </div>
              {Number(data.sale.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desconto</span>
                  <span>- {brl(Number(data.sale.discount))}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-1">
                <span>Total</span>
                <span className="text-brand-red">{brl(Number(data.sale.total))}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={isCancelled ? "destructive" : "outline"} className="capitalize">
                  {data.sale.status}
                </Badge>
              </div>
            </div>

            {data.sale.notes && !isCancelled && (
              <div
                className={cn(
                  "rounded-md border p-3",
                  data.sale.notes.startsWith("Edição:")
                    ? "bg-orange-50 border-orange-100"
                    : "bg-muted/30 border-border",
                )}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {data.sale.notes.startsWith("Edição:") ? "Motivo da Edição" : "Observações"}
                </div>
                <div
                  className={cn(
                    "text-sm whitespace-pre-wrap",
                    data.sale.notes.startsWith("Edição:") ? "text-orange-700" : "text-foreground",
                  )}
                >
                  {data.sale.notes.replace(/^Edição: /, "")}
                </div>
              </div>
            )}

            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <CalendarClock className="size-4 text-orange-500" /> Histórico de alterações
              </h4>
              <SaleEditTimeline saleId={saleId} />
            </div>
          </div>
        )}
        <DialogFooter className="flex-col sm:flex-row sm:flex-wrap gap-2 sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
          {data && isSAdmin && !isReturn && !returnedBy && (
            <Button
              variant="outline"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Excluir venda permanentemente?",
                    description:
                      "Esta ação é IRREVERSÍVEL. O estoque e o financeiro serão restaurados.",
                    confirmLabel: "Sim, Excluir",
                    variant: "destructive",
                  })
                ) {
                  onDelete?.(data.sale.id);
                  onClose();
                }
              }}
              disabled={isDeleting}
              className="border-destructive/30 text-destructive hover:bg-destructive/5 mr-auto"
            >
              <Trash2 className="size-4 mr-2" />{" "}
              {isDeleting ? "Excluindo..." : "Excluir Definitivamente"}
            </Button>
          )}
          {data && onReprint && !isReadOnly && (
            <Button
              variant="outline"
              onClick={() =>
                onReprint({
                  id: data.sale.id,
                  number: data.sale.number,
                  subtotal: Number(data.sale.subtotal),
                  discount: Number(data.sale.discount),
                  total: Number(data.sale.total),
                  paymentMethod: data.sale.payment_method || "—",
                  items: data.items.map((it: any) => ({
                    name: it.products?.name ?? "—",
                    quantity: Number(it.quantity),
                    unit_price: Number(it.unit_price),
                  })),
                })
              }
              className="border-brand-orange/30 text-brand-orange hover:bg-brand-orange/5"
              disabled={!isCashOpen || isCancelled || isReturn}
              title={isCancelled || isReturn ? "Não é possível imprimir cupom de venda cancelada ou devolvida" : "Reimprimir cupom de venda"}
            >
              <Receipt className="size-4 mr-2" /> Reimprimir cupom
            </Button>
          )}
          {canRetryNfce && data && (
            <Button
              variant="outline"
              onClick={async () => {
                await onRetryNfce!(data.sale.id);
                onClose();
              }}
              className="border-brand-red/30 text-brand-red hover:bg-brand-red/5"
              title={latestNote?.motivo_rejeicao || "Tentar emitir NFC-e novamente"}
            >
              <RefreshCw className="size-4 mr-2" />{" "}
              {latestNote && (latestNote.status === "rejeitada" || latestNote.status === "erro")
                ? "Tentar emitir novamente"
                : "Emitir NFC-e"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
