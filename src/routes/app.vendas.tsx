import { PageHeading } from "@/components/page-header";
import { RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useAuth } from "@/lib/auth-context";
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
  cancelSale,
  deleteSale,
  updateSaleItems,
  hasPermission,
  finalizeOpenSale,
  updateProduct,
  fetchCurrentOpenRegister,
  addCashTransaction,
  fetchProductReferencesByCompany,
} from "@/lib/db";
import { buildRefsSearchMap, buildRefsBrandMap, productMatchesBrand } from "@/lib/product-search";
import { generateStockCode, validateStockCode } from "@/lib/stock-code";
import { appwrite as supabase } from "@/integrations/appwrite/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SmartPagination } from "@/components/smart-pagination";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  User,
  CalendarClock,
  CreditCard,
  Lock as LockIcon,
  Barcode,
  X,
  Pencil,
  Ban,
  History,
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
import { useCashRegister, PaymentMethodType } from "@/hooks/use-cash-register";
import { PrintPreviewDialog } from "@/components/print-preview-dialog";
import { AdminAuthDialog } from "@/components/admin-auth-dialog";
import { EditSaleDialog } from "@/components/edit-sale-dialog";
import { useStockReservation } from "@/hooks/use-stock-reservation";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export const Route = createFileRoute("/app/vendas")({
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

function SalesPage() {
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [finalizeStep, setFinalizeStep] = useState<string | null>(null);

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

  const availableUsers = useMemo(() => {
    if (!teamQ.data || !allOpenRegisters) return [];
    const openUserIds = new Set(allOpenRegisters.map((r: any) => r.user_id_open));
    return teamQ.data.filter((m) => !openUserIds.has(m.user_id));
  }, [teamQ.data, allOpenRegisters]);

  const isCashOpen = currentRegister?.status === "OPEN";
  const isLocked = currentRegister?.is_locked;

  const currentSessionSalesQ = useQuery({
    queryKey: ["current-session-sales", cid, currentRegister?.id],
    queryFn: async () => {
      if (!isCashOpen || !currentRegister) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*, profiles(name)")
        .eq("company_id", cid)
        .eq("created_by", currentRegister.user_id_open)
        .gte("created_at", currentRegister.opened_at)
        .eq("status", "concluida")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isCashOpen && !!cid && !!user?.id,
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
  });

  const currentCashBalance = useMemo(() => {
    if (!currentRegister) return 0;
    const openingBalance = Number(currentRegister.initial_balance || 0);
    const txTotal =
      (currentTransactionsQ.data as any[])?.reduce((acc, t) => {
        // O financeiro só trabalha com vendas efetivadas (concluídas).
        // Se a transação for do tipo SALE, verificamos se a venda está concluída.
        if (t.category === "SALE" && t.reference_id) {
          const sale = currentSessionSalesQ.data?.find((s) => s.id === t.reference_id);
          if (currentSessionSalesQ.isSuccess && (!sale || sale.status !== "concluida")) {
            return acc;
          }
        }
        return acc + (t.type === "IN" ? Number(t.amount) : -Number(t.amount));
      }, 0) || 0;
    return openingBalance + txTotal;
  }, [
    currentRegister,
    currentTransactionsQ.data,
    currentSessionSalesQ.data,
    currentSessionSalesQ.isSuccess,
  ]);

  const [openingBalanceRaw, setOpeningBalanceRaw] = useState("0,00");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [managerWantsToOpen, setManagerWantsToOpen] = useState(false);
  const [viewingProductDesc, setViewingProductDesc] = useState<any>(null);

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

  const handleCloseRegister = async () => {
    if (!validateSessionAction()) return;

    const openSalesCount =
      currentSessionSalesQ.data?.filter((s) => s.status === "aberta").length || 0;
    if (openSalesCount > 0) {
      toast.error(
        `Não é possível fechar o caixa pois existem ${openSalesCount} venda(s) em aberto.`,
      );
      return;
    }

    if (!password && !hasSpecialAccess) {
      toast.error("Digite sua senha para confirmar.");
      return;
    }

    setIsVerifying(true);
    try {
      if (!hasSpecialAccess) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user?.email!,
          password: password,
        });

        if (authError) throw new Error("Senha incorreta.");
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
            // You could split card between credit/debit if needed, but the current state uses counts.card
            counts.card += val;
          } else {
            // Fallback
            counts.cash += val;
          }
        });

      await closeRegister({
        informedBalance: totalInformed,
        counts,
      });

      setShowCloseModal(false);
      setPassword("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const getClosingHtml = () => {
    if (!currentRegister) return "Nenhum caixa aberto";

    // Reutilizando a lógica do app.fechamento-caixa.tsx para consistência
    const sales = currentSessionSalesQ.data || [];

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
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; padding: 10px; width: 280px; margin: 0 auto; }
            h2 { text-align: center; margin-bottom: 5px; font-size: 16px; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; }
            .bold { font-weight: bold; }
            .center { text-align: center; }
            .mt { margin-top: 10px; }
            table { width: 100%; font-size: 10px; }
            th { text-align: left; border-bottom: 1px solid #000; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; }
          </style>
        </head>
        <body>
          <h2>FECHAMENTO DE CAIXA</h2>
          <div class="center">Data: ${new Date().toLocaleString("pt-BR")}</div>
          <div class="center">Operador: ${user?.email || "N/A"}</div>
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
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      getClosingHtml() +
        `<script>window.onload = function() { window.print(); setTimeout(() => window.close(), 500); };</script>`,
    );
    win.document.close();
  };

  const cancelSaleMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelSale(id, reason),
    onSuccess: (_, variables) => {
      toast.success("Venda cancelada com sucesso!");
      if (variables.id === currentSaleId) {
        setItems([]);
        setCurrentSaleId(null);
        localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
        stockReservation.releaseAll();
      }
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
      qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: any) => toast.error(e.message),
  });

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
    },
    onError: (e: any) => toast.error(e.message || "Erro ao excluir venda"),
  });

  const finalizeOpenMut = useMutation({
    mutationFn: (saleId: string) => finalizeOpenSale(saleId, selectedPaymentMethod?.name, total),
    onSuccess: () => {
      const soldItems = items.map((i) => ({
        product_id: i.product_id,
        unit_price: i.unit_price,
        name: i.name,
      }));
      void syncMissingProductPrices(soldItems);
      setFinalizeStep("Emitindo comprovante...");
      setTimeout(() => {
        toast.success("Venda finalizada com sucesso!");

        localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_customerId`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_discountMode`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_discountValueRaw`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_discountPctRaw`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_paymentMethodId`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_dueDate`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_amountReceivedRaw`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);

        setItems([]);
        setCurrentSaleId(null);
        setDiscountValueRaw("0,00");
        setDiscountPctRaw("0");
        setShowDiscountFields(false);
        setAmountReceivedRaw("0,00");
        setCustomerId("none");
        setDueDate("");
        setPaymentMethodId("");
        setCurrentPage(1);
        stockReservation.releaseAll();

        qc.invalidateQueries({ queryKey: ["sales", cid] });
        qc.invalidateQueries({ queryKey: ["sales-paginated", cid] });
        qc.invalidateQueries({ queryKey: ["products", cid] });
        qc.invalidateQueries({ queryKey: ["payables", cid] });
        qc.invalidateQueries({ queryKey: ["movements", cid] });
        qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
        qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
        setFinalizeStep(null);
      }, 500);
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

  const [cancelSaleId, setCancelSaleId] = useState<string | null>(null);
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

    const concludedSales =
      currentSessionSalesQ.data?.filter((s) => s.status === "concluida").length || 0;
    if (concludedSales > 0) {
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

  const products = productsQ.data ?? [];
  const productRefsMap = useMemo(
    () => buildRefsSearchMap(productRefsQ.data ?? [], new Map(brands.map((b) => [b.id, b.name]))),
    [productRefsQ.data, brands],
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

  const methodCalculatedBalances = useMemo(() => {
    if (!currentRegister || !currentTransactionsQ.data) return {};
    const balances: Record<string, number> = {};

    paymentMethods.forEach((pm) => {
      balances[pm.id] = 0;
      const name = pm.name.toLowerCase();
      // Somente o saldo inicial entra no dinheiro
      if (name.includes("dinheiro")) {
        balances[pm.id] = Number(currentRegister.initial_balance || 0);
      }
    });

    (currentTransactionsQ.data as any[])?.forEach((t) => {
      const pm = paymentMethods.find((p) => {
        const name = p.name.toLowerCase();
        const m = t.payment_method;
        if (m === "CASH" && (name.includes("dinheiro") || name.includes("cash"))) return true;
        if (m === "PIX" && name.includes("pix")) return true;
        if (
          m === "CREDIT_CARD" &&
          (name.includes("crédito") ||
            name.includes("credito") ||
            ((name.includes("cartão") || name.includes("catão")) &&
              !name.includes("débito") &&
              !name.includes("debito")))
        )
          return true;
        if (
          m === "DEBIT_CARD" &&
          (name.includes("débito") ||
            name.includes("debito") ||
            ((name.includes("cartão") || name.includes("catão")) &&
              !name.includes("crédito") &&
              !name.includes("credito")))
        )
          return true;
        if (m === "BOLETO" && name.includes("boleto")) return true;
        return false;
      });
      if (pm) {
        balances[pm.id] += t.type === "IN" ? Number(t.amount) : -Number(t.amount);
      }
    });
    return balances;
  }, [currentRegister, currentTransactionsQ.data, paymentMethods]);

  const [currentPage, setCurrentPage] = useState(1);
  // pageSize state is used directly
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({
    key: "created_at",
    direction: "desc",
  });
  const [statusFilter, setStatusFilter] = useState<string>("concluida");
  const [dateFromFilter, setDateFromFilter] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );
  const [dateToFilter, setDateToFilter] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );

  const salesQ = useQuery({
    queryKey: [
      "sales-paginated",
      cid,
      saleSearchTerm,
      statusFilter,
      dateFromFilter,
      dateToFilter,
      activeRegisterUserId,
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
        userId: activeRegisterUserId && !hasSpecialAccess ? activeRegisterUserId : undefined,
      }),
    enabled: !!cid && activeTab === "historico",
  });

  const sales = useMemo(() => {
    return salesQ.data?.data ?? [];
  }, [salesQ.data]);

  const totalSalesCount = salesQ.data?.count ?? 0;

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") direction = "desc";
    setSortConfig({ key, direction });
  };

  const filteredSales = sales; // Agora o filtro é feito no servidor
  const paginatedSales = sales;
  const totalPages = Math.ceil(totalSalesCount / pageSize);

  const [customerId, setCustomerId] = useState<string>(
    () => localStorage.getItem(`${SAVED_SALE_KEY}_customerId`) || "none",
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
  const hasOpenSales = useMemo(() => {
    return currentSessionSalesQ.data?.some((s) => s.status === "aberta") || items.length > 0;
  }, [currentSessionSalesQ.data, items]);

  const hasAnySalesInSession = useMemo(() => {
    return (currentSessionSalesQ.data?.length || 0) > 0 || items.length > 0;
  }, [currentSessionSalesQ.data, items]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
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
  const [previewContent, setPreviewContent] = useState("");
  const [previewTitle, setPreviewTitle] = useState("");
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
  const [autoPrintCoupon, setAutoPrintCoupon] = useState(
    () => localStorage.getItem(`auto_print_coupon_${cid}`) === "true",
  );
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
    setCurrentSaleId(localStorage.getItem(`${SAVED_SALE_KEY}_saleId`));

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
        };
  }, [cid]);

  const getSaleHtml = (saleData: any) => {
    const fiscal = fiscalSettingsQ.data;
    const customer = customers.find((c) => c.id === saleData.customer_id);
    const fiscalHtml =
      printSettings.showCnpjAddress && fiscal
        ? `<div class="center" style="font-size: 10px; margin-bottom: 5px;">${fiscal.razao_social ? `<div>${fiscal.razao_social}</div>` : ""}${fiscal.cnpj ? `<div>CNPJ: ${fiscal.cnpj}</div>` : ""}${fiscal.endereco ? `<div>${fiscal.endereco}</div>` : ""}</div>`
        : "";
    const customerHtml =
      printSettings.showCustomerData && customer
        ? `<div class="divider"></div><div style="font-size: 10px; margin-bottom: 5px;"><div class="bold">CLIENTE:</div><div>${customer.name}</div>${customer.doc ? `<div>DOC: ${customer.doc}</div>` : ""}</div>`
        : "";
    const itemsHtml = printSettings.showColumns
      ? `<table style="margin-top: 5px;"><thead><tr><th style="text-align: left">PROD</th><th style="text-align: left">QTD</th><th style="text-align: right">TOTAL</th></tr></thead><tbody>${(saleData.items || []).map((i: any) => `<tr><td>${i.name}</td><td>${i.quantity}</td><td style="text-align: right">${brl(i.quantity * i.unit_price)}</td></tr>`).join("")}</tbody></table>`
      : "";
    const discountHtml =
      saleData.discount > 0
        ? `<div class="row"><span>DESCONTO:</span> <span>${brl(saleData.discount)}</span></div>`
        : "";
    const summaryHtml = printSettings.showSummary
      ? `<div class="divider"></div><div class="row"><span>SUBTOTAL:</span> <span>${brl(saleData.subtotal)}</span></div>${discountHtml}`
      : "";
    const totalsHtml = printSettings.showTotals
      ? `<div class="row bold mt"><span>TOTAL:</span> <span>${brl(saleData.total)}</span></div><div class="divider"></div><div class="row"><span>MÉTODO:</span> <span>${saleData.paymentMethod || "---"}</span></div>`
      : "";
    const installmentsHtml =
      printSettings.showDetailedInstallments &&
      saleData.installments &&
      saleData.installments.length > 0
        ? `<div style="font-size: 10px; padding-left: 10px; margin-top: 2px;">${saleData.installments.map((inst: any, idx: number) => `<div>- ${idx + 1}/${saleData.installments.length}: ${brl(inst.amount)} (${new Date(inst.due_date).toLocaleDateString("pt-BR")})</div>`).join("")}</div>`
        : "";
    return `<html><head><title>Cupom de Venda</title><style>@page { margin: 0; } body { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.2; padding: 15px; width: ${printSettings.receiptWidth || "280"}px; margin: 0 auto; color: #000; } h2 { text-align: center; margin: 0 0 5px 0; font-size: 16px; text-transform: uppercase; } .header-text { text-align: center; margin-bottom: 5px; font-weight: bold; } .divider { border-bottom: 1px dashed #000; margin: 8px 0; } .row { display: flex; justify-content: space-between; margin-bottom: 2px; } .bold { font-weight: bold; } .center { text-align: center; } .mt { margin-top: 10px; } table { width: 100%; border-collapse: collapse; } th { text-align: left; border-bottom: 1px solid #000; font-size: 10px; } td { font-size: 10px; padding: 2px 0; } .footer { margin-top: 25px; text-align: center; font-size: 10px; } </style></head><body><h2>COMPROVANTE DE VENDA</h2>${printSettings.header ? `<div class="header-text">${printSettings.header}</div>` : ""}${fiscalHtml}<div class="center">Data: ${new Date().toLocaleString("pt-BR")}</div><div class="center">Venda: #${saleData.number || saleData.id?.slice(0, 6) || "---"}</div>${customerHtml}<div class="divider"></div>${itemsHtml}${summaryHtml}${totalsHtml}${installmentsHtml}<div class="footer"><div>${printSettings.footerMessage}</div><div class="mt" style="font-size: 8px;">Gerado em ${new Date().toLocaleString("pt-BR")}</div></div></body></html>`;
  };

  const handlePrintSale = (saleData: any) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      getSaleHtml(saleData) +
        `<script>window.onload = function() { window.print(); setTimeout(() => window.close(), 500); };</script>`,
    );
    win.document.close();
  };

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.quantity * i.unit_price, 0), [items]);
  const discountAmount = useMemo(() => {
    if (discountMode === "valor") return Math.min(parseCurrencyInput(discountValueRaw), subtotal);
    const pct = Math.max(0, Math.min(100, Number((discountPctRaw || "0").replace(",", ".")) || 0));
    return (subtotal * pct) / 100;
  }, [discountMode, discountValueRaw, discountPctRaw, subtotal]);
  const total = Math.max(subtotal - discountAmount, 0);
  const change = Math.max(parseCurrencyInput(amountReceivedRaw) - total, 0);

  const sellMut = useMutation({
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
        paymentMethod: selectedPaymentMethod?.name ?? "",
        dueDate: requiresDueDate ? dueDate || null : null,
        userId: activeRegisterUserId,
      });
      return saleId;
    },
    onSuccess: (saleId) => {
      const soldItems = items.map((i) => ({
        product_id: i.product_id,
        unit_price: i.unit_price,
        name: i.name,
      }));
      void syncMissingProductPrices(soldItems);
      setFinalizeStep("Emitindo comprovante...");
      setTimeout(() => {
        toast.success("Sucesso! Venda registrada.");
        if (autoPrintCoupon)
          handlePrintSale({
            id: saleId,
            items,
            subtotal,
            discount: discountAmount,
            total,
            paymentMethod: selectedPaymentMethod?.name ?? "Dinheiro",
          });

        localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_customerId`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_discountMode`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_discountValueRaw`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_discountPctRaw`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_paymentMethodId`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_dueDate`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_amountReceivedRaw`);
        localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);

        setItems([]);
        setCurrentSaleId(null);
        setDiscountValueRaw("0,00");
        setDiscountPctRaw("0");
        setShowDiscountFields(false);
        setAmountReceivedRaw("0,00");
        setCustomerId("none");
        setDueDate("");
        setPaymentMethodId("");
        setCurrentPage(1);
        stockReservation.releaseAll();
        qc.invalidateQueries({ queryKey: ["sales", cid] });
        qc.invalidateQueries({ queryKey: ["products", cid] });
        qc.invalidateQueries({ queryKey: ["payables", cid] });
        qc.invalidateQueries({ queryKey: ["movements", cid] });
        qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
        qc.invalidateQueries({ queryKey: ["cash-transactions", currentRegister?.id] });
        setFinalizeStep(null);
      }, 500);
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
        paymentMethod: selectedPaymentMethod?.name ?? "",
        dueDate: requiresDueDate ? dueDate || null : null,
        userId: activeRegisterUserId,
        status: "aberta",
      });
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

      setItems([]);
      setDiscountValueRaw("0,00");
      setDiscountPctRaw("0");
      setShowDiscountFields(false);
      setAmountReceivedRaw("0,00");
      setCustomerId("none");
      setDueDate("");
      setPaymentMethodId("");
      setCurrentPage(1);
      stockReservation.releaseAll();
      qc.invalidateQueries({ queryKey: ["sales", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["movements", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
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

    if (total <= 0) {
      toast.error("O valor da venda deve ser maior que zero.");
      return;
    }

    if (!paymentMethodId) {
      toast.error("Selecione uma forma de pagamento para finalizar a venda.");
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
      setFinalizeStep("Validando pagamento...");
      setTimeout(() => {
        setFinalizeStep("Registrando venda...");
        if (currentSaleId) {
          updateSaleMut.mutate({
            saleId: currentSaleId,
            items,
            discount: discountAmount,
            reason: "Finalização automática",
          });
          setTimeout(() => {
            setFinalizeStep("Abatendo estoque...");
            finalizeOpenMut.mutate(currentSaleId);
          }, 600);
        } else {
          setTimeout(() => {
            setFinalizeStep("Abatendo estoque...");
            sellMut.mutate();
          }, 600);
        }
      }, 600);
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
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["current-session-sales", cid, currentRegister?.id] });
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

  const handleBarcodeSubmit = (val: string) => {
    const code = val.trim();
    if (!code) return;
    const product = products.find(
      (p: any) =>
        (p.sku && p.sku.trim() === code) ||
        (p.alternative_code && p.alternative_code.trim() === code) ||
        p.id === code,
    );
    if (product) {
      const hasStockCode = !!(product.alternative_code && product.alternative_code.trim());
      addItem(product);
      if (hasStockCode) toast.success(`${product.name} adicionado!`);
    } else {
      toast.error("Produto não encontrado.");
    }
  };

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
        {!isCashOpen && (
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
                variant={isCashOpen ? "default" : "secondary"}
                className={cn(
                  "text-[10px] md:text-xs",
                  isCashOpen
                    ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20"
                    : "",
                )}
              >
                {isCashOpen ? "Caixa Aberto" : "Caixa Fechado"}
              </Badge>
              {isLocked && (
                <Badge
                  variant="outline"
                  className="text-[10px] md:text-xs border-brand-red text-brand-red"
                >
                  Bloqueado
                </Badge>
              )}
              {isCashOpen && (
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
            {allOpenRegisters && allOpenRegisters.length > 0 && (
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
            {isCashOpen && (
              <Badge
                variant="outline"
                className="h-10 px-3 flex items-center gap-2 border-green-200 bg-green-50 text-green-700 shrink-0"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Saldo: {brl(currentCashBalance)}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {!isCashOpen && canOpenCash && (
            <Button
              size="sm"
              className="bg-brand-red hover:bg-brand-red/90"
              onClick={() => setManagerWantsToOpen(true)}
              disabled={isOpening}
            >
              {isOpening ? "Abrindo..." : "Abrir Caixa"}
            </Button>
          )}
          {isCashOpen && (
            <>
              {items.length === 0 && (
                <Button variant="outline" size="sm" onClick={handleToggleLock}>
                  <LockIcon className="mr-2 size-4" /> Bloquear
                </Button>
              )}
              {!hasOpenSales && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-brand-red border-brand-red/20 hover:bg-brand-red/5"
                  onClick={() => setShowCloseModal(true)}
                >
                  <Ban className="mr-2 size-4" /> Fechar Caixa
                </Button>
              )}
              {!hasOpenSales &&
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
          open={(managerWantsToOpen || (!isCashOpen && !hasSpecialAccess)) && !isCashLoading}
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
              {canOpenCash && (
                <Button
                  className="w-full sm:w-auto bg-brand-red hover:bg-brand-red/90"
                  onClick={handleOpenRegister}
                  disabled={isOpening}
                >
                  {isOpening ? "Abrindo..." : "Confirmar Abertura"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isCashOpen && (
          <>
            <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">
              <Card className="p-4 sm:p-5 lg:col-span-2 space-y-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="size-4 text-brand-red" />
                  <h3 className="font-semibold">Nova venda</h3>
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
                    <div className="relative">
                      <Barcode className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleBarcodeSubmit(barcodeInput);
                        }}
                        placeholder="Código SKU…"
                        className="pl-9 pr-9"
                      />
                      {barcodeInput && (
                        <button
                          type="button"
                          onClick={() => setBarcodeInput("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
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
                        Pesquisa em nome, código (SKU/Alternativo), marca e detalhes do produto.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="px-5 pb-3 flex gap-2">
                      <div className="relative flex-1">
                        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Digite qualquer termo…"
                          className="pl-9"
                        />
                      </div>
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
                        <div className="p-12 text-center text-muted-foreground">
                          Carregando produtos...
                        </div>
                      ) : productsQ.isError ? (
                        <div className="p-12 text-center text-destructive font-medium">
                          Erro ao carregar produtos.
                        </div>
                      ) : (
                        (() => {
                          const term = normalize(productSearch.trim());
                          const tokens = term.split(/\s+/).filter(Boolean);
                          const filtered = products
                            .filter((p: any) => {
                              if (
                                !productMatchesBrand(
                                  p.id,
                                  p.brand_id,
                                  productBrandFilter,
                                  productRefsBrandMap,
                                )
                              )
                                return false;
                              if (!tokens.length) return true;
                              const brandName =
                                brands.find((b) => b.id === p.brand_id)?.name || p.brand || "";
                              const haystack = normalize(
                                [
                                  p.name,
                                  p.sku,
                                  p.alternative_code,
                                  (p as any).barcode,
                                  brandName,
                                  p.description,
                                  p.unit,
                                  productRefsMap.get(p.id) || "",
                                ]
                                  .filter(Boolean)
                                  .join(" "),
                              );
                              return tokens.every((t) => haystack.includes(t));
                            })
                            .sort((a: any, b: any) => compareProductNames(a.name, b.name));

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
                      {items.length === 0 ? (
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
                  {items.length === 0 ? (
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
                  <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods
                        .filter((pm) => pm.active)
                        .map((pm) => (
                          <SelectItem key={pm.id} value={pm.id}>
                            {pm.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {requiresDueDate && (
                  <div className="space-y-2">
                    <Label>Vencimento</Label>
                    <Input
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                )}
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
                    onCheckedChange={setAutoPrintCoupon}
                  />
                </div>
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
                          paymentMethod: selectedPaymentMethod?.name ?? "Dinheiro",
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
                          setDiscountValueRaw("0,00");
                          setDiscountPctRaw("0");
                          setCustomerId("none");
                          setPaymentMethodId("");
                          localStorage.removeItem(`${SAVED_SALE_KEY}_items`);
                          localStorage.removeItem(`${SAVED_SALE_KEY}_saleId`);
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
                        !paymentMethodId ||
                        !isCashOpen
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
              </Card>
            </div>

            {/* Seção de Vendas Recentes Removida e integrada ao Histórico abaixo */}

            <div id="historico" className="mt-6">
              <Card className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-brand-red" />
                    <h3 className="font-semibold">Histórico de Vendas</h3>
                    <PrintButton
                      onClick={handlePrint}
                      disabled={filteredSales.length === 0}
                      className="h-7 px-2 text-[10px]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
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
                        <SelectItem value="aberta">Abertas</SelectItem>
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
                          return (
                            <TableRow key={s.id}>
                              <TableCell className="text-sm">{dt(s.created_at)}</TableCell>
                              <TableCell className="font-mono text-xs">#{s.number}</TableCell>
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
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-amber-600"
                                      title="Cancelar venda concluída"
                                      onClick={() =>
                                        requestSaleAuthorization({
                                          title: "Cancelar",
                                          description:
                                            "Esta ação altera o status para CANCELADA e devolve os itens ao estoque.",
                                          onAuthorized: (r) =>
                                            cancelSaleMut.mutate({ id: s.id, reason: r }),
                                        })
                                      }
                                    >
                                      <Ban className="size-4" />
                                    </Button>
                                  ) : null}

                                  {isSAdmin && s.status !== "aberta" && (
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
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
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

        {/* Drawer do Carrinho Mobile */}
        <Dialog open={showMobileCart} onOpenChange={setShowMobileCart}>
          <DialogContent className="max-w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden sm:max-w-md">
            <DialogHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <ShoppingCart className="size-5 text-brand-red" />
                  Seu Carrinho
                </DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowMobileCart(false)}>
                  <X className="size-5" />
                </Button>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {items.length === 0 ? (
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
          </DialogContent>
        </Dialog>

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
              {!hasSpecialAccess && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label>Sua Senha (para confirmar)</Label>
                  <Input
                    type="password"
                    placeholder="Digite sua senha"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
            </div>
            <DialogFooter className="p-6 pt-3 flex-col sm:flex-row gap-2 border-t shrink-0">
              <Button
                variant="ghost"
                onClick={handlePrintClosing}
                className="w-full sm:w-auto sm:mr-auto"
              >
                <Receipt className="size-4 mr-2" /> Imprimir Relatório
              </Button>
              <div className="flex gap-2 justify-end w-full sm:w-auto">
                <Button variant="outline" onClick={() => setShowCloseModal(false)}>
                  Cancelar
                </Button>
                <Button
                  className="bg-brand-red hover:bg-brand-red/90"
                  onClick={handleCloseRegister}
                  disabled={isVerifying}
                >
                  {isVerifying ? "Processando..." : "Fechar Caixa Agora"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          onSave={(items, discount, reason) => {
            updateSaleMut.mutate({ saleId: editingSale.id, items, discount, reason });
          }}
          products={products}
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
          onOpenChange={setShowClosingPreview}
          title={previewTitle}
          content={previewContent}
        />
        <SaleDetailDialog
          saleId={detailSaleId}
          onClose={() => setDetailSaleId(null)}
          onReprint={(saleData) => handlePrintSale(saleData)}
          isSAdmin={isSAdmin}
          onDelete={(id) => deleteSaleMut.mutate(id)}
          isDeleting={deleteSaleMut.isPending}
          isCashOpen={isCashOpen}
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
}: {
  saleId: string | null;
  onClose: () => void;
  onReprint?: (saleData: any) => void;
  isSAdmin?: boolean;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
  isCashOpen?: boolean;
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

      return { sale, items: items ?? [], creator, customer, cancellationLog };
    },
  });
  const data = detailQ.data;
  const isCancelled = data?.sale?.status === "cancelada";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-brand-orange" />
            Detalhes da venda {data?.sale ? `#${data.sale.number}` : ""}
            {isCancelled && (
              <Badge variant="destructive" className="ml-2 uppercase">
                Cancelada
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
              <div className="rounded-md border border-border overflow-hidden">
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
          </div>
        )}
        <DialogFooter>
          {data && isSAdmin && (
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
          {data && onReprint && !isCancelled && (
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
              disabled={!isCashOpen}
            >
              <Receipt className="size-4 mr-2" /> Reimprimir cupom
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
