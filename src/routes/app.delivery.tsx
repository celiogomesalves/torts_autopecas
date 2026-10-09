import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchPartners,
  fetchSales,
  fetchDrivers,
  upsertDriver,
  deleteDriver,
  fetchDeliveryOrders,
  upsertDeliveryOrder,
  deleteDeliveryOrder,
  fetchProducts,
  upsertPartner,
  fetchPartnerAddresses,
  upsertPartnerAddress,
  deletePartnerAddress,
} from "@/lib/db";
import {
  fetchDeliveryBusinessHours,
  upsertDeliveryBusinessHour,
  fetchDeliveryFeesByKm,
  upsertDeliveryFeeByKm,
  deleteDeliveryFeeByKm,
} from "@/lib/delivery-db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { SmartPagination } from "@/components/smart-pagination";
import {
  Truck,
  Plus,
  Trash2,
  ArrowRight,
  Hash,
  Search,
  UserPlus,
  Eye,
  MoreVertical,
  ChevronDown,
  Lock,
  Clock,
  MapPin,
  Calculator,
  Edit2,
  ToggleRight,
  ToggleLeft,
  Printer,
} from "lucide-react";
import {
  printDeliveryOrder,
  getDeliveryPrintSettings,
  setDeliveryPrintSettings,
} from "@/lib/print-delivery-order";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { brl, dt, brlNumber, parseCurrencyInput, formatCurrencyInput } from "@/lib/format";
import { maskPhone, maskCpfCnpj } from "@/lib/masks";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import type { Driver, DeliveryOrder, DeliveryStatus, Partner, Product } from "@/lib/db-types";
import { SearchInput } from "@/components/search-input";
import { matchSearch, cn } from "@/lib/utils";
import { EntitySelectorDialog } from "@/components/entity-selector-dialog";

export const Route = createFileRoute("/app/delivery")({
  loader: makePrefetchLoader(["deliveryOrders", "drivers", "clients"]),
  component: DeliveryPage,
});

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  aguardando_confirmacao: "Aguardando confirmação",
  preparo: "Em preparo",
  rota: "Em rota",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const STATUS_VARIANT: Record<DeliveryStatus, "default" | "secondary" | "outline" | "destructive"> =
  {
    aguardando_confirmacao: "outline",
    preparo: "secondary",
    rota: "default",
    entregue: "outline",
    cancelado: "destructive",
  };

function DeliveryPage() {
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId ?? "";
  const qc = useQueryClient();
  const confirm = useConfirm();

  const companyQ = useQuery({
    queryKey: ["company-detail", cid],
    queryFn: async () => {
      const { data, error } = await (supabase.from("companies") as any)
        .select("id, delivery_enabled, pickup_enabled, zip_code")
        .eq("id", cid)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!cid,
  });

  const partnersQ = useQuery({
    queryKey: ["partners", cid],
    queryFn: () => fetchPartners(cid),
    enabled: !!cid,
  });
  const salesQ = useQuery({
    queryKey: ["sales", cid],
    queryFn: () => fetchSales(cid, 50),
    enabled: !!cid,
  });
  const driversQ = useQuery({
    queryKey: ["drivers", cid],
    queryFn: () => fetchDrivers(cid),
    enabled: !!cid,
  });
  const ordersQ = useQuery({
    queryKey: ["delivery-orders", cid],
    queryFn: () => fetchDeliveryOrders(cid),
    enabled: !!cid,
  });
  const productsQ = useQuery({
    queryKey: ["products", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
  });
  const hoursQ = useQuery({
    queryKey: ["delivery-hours", cid],
    queryFn: () => fetchDeliveryBusinessHours(cid),
    enabled: !!cid,
  });
  const feesQ = useQuery({
    queryKey: ["delivery-fees", cid],
    queryFn: () => fetchDeliveryFeesByKm(cid),
    enabled: !!cid,
  });
  const paymentMethodsQ = useQuery({
    queryKey: ["payment_methods", cid],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_methods")
        .select("id, name, active")
        .eq("company_id", cid)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
    enabled: !!cid,
  });
  const openRegistersQ = useQuery({
    queryKey: ["open-registers", cid],
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_registers")
        .select("id, user_id_open, opened_at, initial_balance")
        .eq("company_id", cid)
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!cid,
  });

  const partners = partnersQ.data ?? [];
  const sales = salesQ.data ?? [];
  const drivers = driversQ.data ?? [];
  const orders = ordersQ.data ?? [];
  const products = productsQ.data ?? [];
  const businessHours = hoursQ.data ?? [];
  const deliveryFees = feesQ.data ?? [];
  const paymentMethods = paymentMethodsQ.data ?? [];
  const openRegisters = (openRegistersQ.data ?? []) as any[];

  const openRegisterUserIds = Array.from(
    new Set(openRegisters.map((r: any) => r.user_id_open).filter(Boolean)),
  );
  const registerProfilesQ = useQuery({
    queryKey: ["register-profiles", openRegisterUserIds.sort().join(",")],
    queryFn: async () => {
      if (openRegisterUserIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", openRegisterUserIds);
      return data ?? [];
    },
    enabled: openRegisterUserIds.length > 0,
  });
  const registerProfiles = registerProfilesQ.data ?? [];
  const profileLabel = (uid: string | null | undefined) => {
    if (!uid) return "—";
    const p: any = registerProfiles.find((x: any) => x.id === uid);
    return p?.name || p?.email || uid.slice(0, 8);
  };
  const company = companyQ.data;
  const isDeliveryEnabled = (company as any)?.delivery_enabled ?? true;
  const isPickupEnabled = (company as any)?.pickup_enabled ?? true;

  // Pedidos de Retirada não passam por "Em rota"
  const isRetirada = (o: DeliveryOrder) =>
    !o.driver_id && /^retirada/i.test(o.address || "");
  const allowedStatusesFor = (o: DeliveryOrder): DeliveryStatus[] =>
    isRetirada(o)
      ? ["aguardando_confirmacao", "preparo", "entregue", "cancelado"]
      : ["aguardando_confirmacao", "preparo", "rota", "entregue", "cancelado"];


  // Driver mutations
  const driverMut = useMutation({
    mutationFn: (f: Partial<Driver>) =>
      upsertDriver(cid, {
        id: f.id,
        name: f.name!,
        phone: f.phone || null,
        vehicle: f.vehicle || null,
        active: f.active,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers", cid] });
      setDriverOpen(false);
      setDriverForm({});
      toast.success("Sucesso! Entregador salvo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delDriverMut = useMutation({
    mutationFn: deleteDriver,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers", cid] });
      toast.success("Sucesso! Entregador removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Order mutations
  const orderMut = useMutation({
    mutationFn: (f: Partial<DeliveryOrder>) =>
      upsertDeliveryOrder(cid, {
        id: f.id,
        customer_name: f.customer_name!,
        address: f.address!,
        sale_id: f.sale_id,
        sale_number: f.sale_number,
        customer_id: f.customer_id,
        total: f.total,
        driver_id: f.driver_id,
        status: f.status,
        notes: f.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-orders", cid] });
      setOrderOpen(false);
      setOrderForm({});
      toast.success("Sucesso! Pedido de entrega salvo.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delOrderMut = useMutation({
    mutationFn: deleteDeliveryOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-orders", cid] });
      toast.success("Sucesso! Pedido removido.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Hours & Fees mutations
  const hoursMut = useMutation({
    mutationFn: (h: Partial<import("@/lib/db-types").DeliveryBusinessHour>) =>
      upsertDeliveryBusinessHour(cid, h),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-hours", cid] });
      toast.success("Horário salvo!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const feeMut = useMutation({
    mutationFn: (f: Partial<import("@/lib/db-types").DeliveryFeeByKm>) =>
      upsertDeliveryFeeByKm(cid, f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-fees", cid] });
      setFeeForm({});
      toast.success("Taxa de entrega salva!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delFeeMut = useMutation({
    mutationFn: deleteDeliveryFeeByKm,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-fees", cid] });
      toast.success("Taxa de entrega removida.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [feeOpen, setFeeOpen] = useState(false);
  const [feeForm, setFeeForm] = useState<Partial<import("@/lib/db-types").DeliveryFeeByKm>>({});
  const [hoursDialogOpen, setHoursDialogOpen] = useState(false);
  const [lastManualAddress, setLastManualAddress] = useState("");
  const [autoPrintNew, setAutoPrintNew] = useState<boolean>(
    () => !!getDeliveryPrintSettings(cid).autoPrintNew,
  );

  const toggleAutoPrint = () => {
    const next = !autoPrintNew;
    setAutoPrintNew(next);
    setDeliveryPrintSettings(cid, { ...getDeliveryPrintSettings(cid), autoPrintNew: next });
    toast.success(
      next
        ? "Impressão automática ativada para novos pedidos."
        : "Impressão automática desativada.",
    );
  };

  // Realtime: imprime automaticamente quando um novo pedido é criado.
  useEffect(() => {
    if (!cid || !autoPrintNew) return;
    const channel = supabase
      .channel(`delivery-orders-print-${cid}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "delivery_orders", filter: `company_id=eq.${cid}` },
        (payload) => {
          const o = payload.new as DeliveryOrder;
          // Aguarda um instante para garantir sale_items gravados antes de imprimir.
          setTimeout(() => {
            printDeliveryOrder(cid, o).catch((e) =>
              console.error("[auto-print delivery] falhou", e),
            );
          }, 800);
          qc.invalidateQueries({ queryKey: ["delivery-orders", cid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cid, autoPrintNew, qc]);


  // Driver dialog
  const toggleDeliveryMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled && !(company as any)?.zip_code) {
        throw new Error(
          "Para habilitar o Delivery, você deve primeiro configurar o CEP da empresa nas configurações.",
        );
      }
      if (enabled) {
        const now = new Date();
        const today = now.getDay();
        const todayHour = businessHours.find((h) => h.day_of_week === today);
        if (!todayHour || todayHour.is_closed || !todayHour.open_time || !todayHour.close_time) {
          throw new Error(
            "Não é possível habilitar a entrega: o dia de hoje está marcado como fechado nos horários de funcionamento.",
          );
        }
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [oh, om] = todayHour.open_time.split(":").map(Number);
        const [ch, cm] = todayHour.close_time.split(":").map(Number);
        const openMinutes = oh * 60 + (om || 0);
        const closeMinutes = ch * 60 + (cm || 0);
        if (currentMinutes < openMinutes || currentMinutes >= closeMinutes) {
          throw new Error(
            `Não é possível habilitar a entrega: fora do horário de funcionamento de hoje (${todayHour.open_time.slice(0, 5)} - ${todayHour.close_time.slice(0, 5)}).`,
          );
        }
      }
      const { error } = await supabase
        .from("companies")
        .update({ delivery_enabled: enabled } as any)
        .eq("id", cid);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      qc.invalidateQueries({ queryKey: ["company-detail", cid] });
      if (enabled) {
        toast.success("Configuração de entrega atualizada!");
      } else {
        toast.info("Delivery desativado.");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Effect to verify ZIP code and disable delivery if missing
  useEffect(() => {
    if (companyQ.isSuccess && company) {
      const hasZip = !!(company as any).zip_code;
      const isEnabled = (company as any).delivery_enabled;

      if (!hasZip && isEnabled) {
        toggleDeliveryMut.mutate(false);
        toast.error("O Delivery foi desabilitado pois o CEP da empresa não está configurado.", {
          description: "Vá em Configurações > Empresa para definir o CEP.",
          duration: 6000,
        });
      }
    }
  }, [companyQ.isSuccess, company]);

  const [driverOpen, setDriverOpen] = useState(false);
  const [driverForm, setDriverForm] = useState<Partial<Driver>>({});

  const saveDriver = () => {
    if (!driverForm.name?.trim()) {
      toast.error("Nome obrigatório");
      return;
    }

    if (driverForm.id) {
      const hasCompletedDeliveries = orders.some(
        (o) => o.driver_id === driverForm.id && o.status === "entregue",
      );
      if (hasCompletedDeliveries) {
        toast.error(
          "Este entregador não pode ser alterado pois possui entregas finalizadas em seu nome.",
        );
        return;
      }
    }

    driverMut.mutate(driverForm);
  };

  // Selector Dialogs
  const [customerSelectorOpen, setCustomerSelectorOpen] = useState(false);
  const [driverSelectorOpen, setDriverSelectorOpen] = useState(false);
  const [productSelectorOpen, setProductSelectorOpen] = useState(false);

  // Product quantity handling
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQty, setPendingQty] = useState("1");

  const addProductWithQty = () => {
    if (!pendingProduct) return;
    const qty = parseInt(pendingQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("A quantidade deve ser um número inteiro positivo");
      return;
    }

    if (pendingProduct.stock !== null && qty > pendingProduct.stock) {
      toast.error(`Estoque insuficiente. Disponível: ${pendingProduct.stock}`);
      return;
    }

    const newItems = [...(orderForm.items || [])];
    const existingIdx = newItems.findIndex((i) => i.product_id === pendingProduct.id);

    if (existingIdx >= 0) {
      toast.warning(
        `O produto "${pendingProduct.name}" já está no pedido. Somando à quantidade existente.`,
      );
      const newQty = newItems[existingIdx].quantity + qty;
      if (pendingProduct.stock !== null && newQty > pendingProduct.stock) {
        toast.error(`Estoque total excederia o disponível. Disponível: ${pendingProduct.stock}`);
        return;
      }
      newItems[existingIdx].quantity = newQty;
    } else {
      newItems.push({
        product_id: pendingProduct.id,
        quantity: qty,
        unit_price: pendingProduct.sale_price,
      });
    }

    const newTotal = newItems.reduce((acc, item) => acc + item.unit_price * item.quantity, 0);

    setOrderForm((prev) => ({
      ...prev,
      items: newItems,
      total: newTotal,
    }));
    setPendingProduct(null);
    setPendingQty("1");
  };

  // Quick Registration Dialogs
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerForm, setQuickCustomerForm] = useState({ name: "", phone: "", address: "" });

  const [quickDriverOpen, setQuickDriverOpen] = useState(false);
  const [quickDriverForm, setQuickDriverForm] = useState({ name: "", phone: "", vehicle: "" });

  const quickCustomerMut = useMutation({
    mutationFn: (f: typeof quickCustomerForm) =>
      upsertPartner(cid, {
        name: f.name,
        phone: f.phone || null,
        address: f.address || null,
        type: "cliente",
      }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["partners", cid] });
      setOrderForm((prev) => {
        const newAddress =
          prev.type === "retirada" ? "Retirada no Local" : p.address || prev.address;
        if (p.address && prev.type === "entrega") {
          setLastManualAddress(p.address);
        }
        return {
          ...prev,
          customer_id: p.id,
          customer_name: p.name,
          address: newAddress,
        };
      });
      setQuickCustomerOpen(false);
      setQuickCustomerForm({ name: "", phone: "", address: "" });
      toast.success("Cliente cadastrado e selecionado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quickDriverMut = useMutation({
    mutationFn: (f: typeof quickDriverForm) =>
      upsertDriver(cid, {
        name: f.name,
        phone: maskPhone(f.phone) || null,
        vehicle: f.vehicle || null,
        active: true,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["drivers", cid] });
      setOrderForm((prev) => ({ ...prev, driver_id: d.id }));
      setQuickDriverOpen(false);
      setQuickDriverForm({ name: "", phone: "", vehicle: "" });
      toast.success("Entregador cadastrado e selecionado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Order dialog
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderForm, setOrderForm] = useState<
    Partial<DeliveryOrder & { type: "entrega" | "retirada"; isManual?: boolean }>
  >({
    type: isDeliveryEnabled ? "entrega" : "retirada",
    isManual: true, // Flag para marcar criação manual
  });
  const [viewOnly, setViewOnly] = useState(false);

  // Dialog de finalização ("Entregue"): exige forma de pagamento + caixa.
  const [finalizeOrder, setFinalizeOrder] = useState<DeliveryOrder | null>(null);
  const [finalizePayment, setFinalizePayment] = useState<string>("");
  const [finalizeRegisterId, setFinalizeRegisterId] = useState<string>("");
  const [finalizing, setFinalizing] = useState(false);

  const openFinalize = (o: DeliveryOrder) => {
    setFinalizeOrder(o);
    const myReg = openRegisters.find((r: any) => r.user_id_open === user?.id);
    setFinalizeRegisterId(myReg?.id ?? openRegisters[0]?.id ?? "");
    // Auto-detecta forma de pagamento informada pelo cliente (n8n)
    const orderPay = String((o as any)?.payment_method ?? "").trim();
    if (orderPay) {
      const match = paymentMethods.find(
        (m: any) => String(m.name).toLowerCase() === orderPay.toLowerCase(),
      );
      setFinalizePayment(match?.name ?? orderPay);
    } else {
      setFinalizePayment("");
    }
  };


  const partnerAddressesQ = useQuery({
    queryKey: ["partner-addresses", cid, orderForm?.customer_id],
    queryFn: () => fetchPartnerAddresses(cid, orderForm?.customer_id!),
    enabled: !!cid && !!orderForm?.customer_id && orderOpen,
  });

  const partnerAddresses = partnerAddressesQ.data ?? [];

  const [newAddressDialogOpen, setNewAddressDialogOpen] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState({ address: "", is_default: false });

  const addPartnerAddressMut = useMutation({
    mutationFn: (f: typeof newAddressForm) =>
      upsertPartnerAddress(cid, {
        partner_id: orderForm.customer_id!,
        address: f.address,
        is_default: f.is_default,
        company_id: cid,
      }),
    onSuccess: (newAddr) => {
      qc.invalidateQueries({ queryKey: ["partner-addresses", cid, orderForm.customer_id] });
      setOrderForm((prev) => ({ ...prev, address: newAddr.address }));
      setNewAddressDialogOpen(false);
      setNewAddressForm({ address: "", is_default: false });
      toast.success("Endereço adicionado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEditOrder = (o: DeliveryOrder) => {
    const isRetirada = o.address === "Retirada no Local";
    setOrderForm({
      ...o,
      type: isRetirada ? "retirada" : "entrega",
      items: o.items || [],
      isManual: false, // Edição não é uma nova criação manual
    });
    // Permitir edição apenas se aguardando ou preparo
    const canEdit = o.status === "aguardando_confirmacao" || o.status === "preparo";
    setViewOnly(!canEdit);
    setOrderOpen(true);
  };

  const saveOrder = async () => {
    if (!orderForm.customer_name?.trim() || !orderForm.customer_id) {
      toast.error("O cliente é obrigatório e deve ser selecionado na lista");
      return;
    }

    if (!orderForm.items || orderForm.items.length === 0) {
      // Edição com todos os itens removidos ou carrinho limpo → excluir pedido e venda vinculada
      if (orderForm.id) {
        if (
          !(await confirm({
            title: "Excluir pedido?",
            description:
              "Todos os itens foram removidos. O pedido e a venda vinculada serão excluídos do banco de dados e o estoque será devolvido.",
            confirmLabel: "Excluir",
            variant: "destructive",
          }))
        )
          return;
        try {
          if (orderForm.sale_id) {
            // delete_sale já remove o delivery_order vinculado via ON DELETE CASCADE ou lógica no RPC
            const { error: delErr } = await (supabase.rpc as any)("delete_sale", {
              _sale_id: orderForm.sale_id,
            });
            if (delErr) throw delErr;
          } else {
            // Se não havia sale_id (improvável no novo fluxo), garantir exclusão do pedido
            await supabase.from("delivery_orders").delete().eq("id", orderForm.id);
          }
          toast.success("Pedido e venda vinculada excluídos com sucesso");
          setOrderOpen(false);
          qc.invalidateQueries({ queryKey: ["delivery-orders", cid] });
          qc.invalidateQueries({ queryKey: ["payables", cid] });
          qc.invalidateQueries({ queryKey: ["sales", cid] });
          qc.invalidateQueries({ queryKey: ["products", cid] });
        } catch (e: any) {
          toast.error("Erro ao excluir pedido: " + e.message);
        }
        return;
      }
      toast.error("Adicione pelo menos um produto ao pedido");
      return;
    }

    if (orderForm.type === "entrega" && !orderForm.address?.trim()) {
      toast.error("O endereço é obrigatório para entregas");
      return;
    }

    try {
      const { type: _, isManual: __, ...cleanPayload } = orderForm;
      const payload: Partial<DeliveryOrder> = { ...cleanPayload };

      // Validação robusta de status
      // - Pedidos manuais (isManual=true) SEMPRE começam em "preparo"
      // - Edições mantêm o status existente (mas pode ser alterado via updateStatus)
      // - Fallback: se status vem vazio/undefined, assume manual→preparo
      if (!payload.id) {
        // Nova criação: sempre respecta isManual
        payload.status = orderForm.isManual ? "preparo" : "aguardando_confirmacao";
      } else if (!payload.status) {
        // Edição sem status explícito: assume preparo (seguro)
        payload.status = "preparo";
      }
      // Se já tem status (edição com status): mantém o existente

      if (orderForm.type === "retirada") {
        payload.address = "Retirada no Local";
        payload.driver_id = null;
      }

      // Se já houver venda vinculada, precisamos atualizar os itens da venda se for edição
      if (payload.sale_id && payload.items && payload.items.length > 0) {
        const { updateSaleItems } = await import("@/lib/db");
        await updateSaleItems(
          payload.sale_id,
          cid,
          payload.items,
          0,
          `Edição de pedido delivery #${payload.id}`,
        );
      }
      // Se não houver venda vinculada, precisamos criar uma venda provisória para bloquear estoque
      else if (!payload.sale_id && payload.items && payload.items.length > 0) {
        const { data: saleId, error: saleErr } = await (supabase.rpc as any)("register_sale", {
          _company: cid,
          _customer: payload.customer_id || null,
          _items: payload.items,
          _discount: 0,
          _payment_method: "outros",
          _notes: `[DELIVERY] Criado manualmente`,
          _status: "aguardando",
        });

        if (saleErr) throw saleErr;
        if (saleId) {
          payload.sale_id = String(saleId);
          // Marca venda como originada do delivery (aparece no histórico de todos)
          await supabase
            .from("sales")
            .update({ origin: "delivery" } as any)
            .eq("id", String(saleId));
        }
      }

      orderMut.mutate(payload);
    } catch (e: any) {
      toast.error("Erro ao salvar pedido: " + e.message);
    }
  };

  const updateStatus = async (o: DeliveryOrder, nextStatus: DeliveryStatus) => {
    // Retirada não usa "Em rota"
    if (nextStatus === "rota" && isRetirada(o)) {
      toast.error('"Em rota" é apenas para pedidos de Entrega.');
      return;
    }
    // Finalização: abrir diálogo para confirmar pagamento + caixa
    if (nextStatus === "entregue" && o.status !== "entregue") {
      openFinalize(o);
      return;
    }
    try {
      // Reabertura: sair de "entregue" sempre volta para "preparo" e reverte financeiro
      if (o.status === "entregue" && nextStatus !== "entregue") {
        if (o.sale_id) {
          await supabase.from("payables").delete().eq("sale_id", o.sale_id);
          await supabase.from("sale_payments").delete().eq("sale_id", o.sale_id);
          await supabase.from("cash_transactions").delete().eq("reference_id", o.sale_id);
        }
        nextStatus = "preparo";
      }



      // Se vai para Cancelado
      if (nextStatus === "cancelado") {
        // Lógica de cancelamento já existe no cancelOrder, mas vamos unificar aqui ou chamar lá
        await cancelOrder(o);
        return;
      }

      // Se sai de aguardando para preparo (Confirmação inicial)
      if (o.status === "aguardando_confirmacao" && nextStatus === "preparo") {
        if (o.sale_id) {
          await supabase.from("sales").update({ status: "concluida" }).eq("id", o.sale_id);
        }
      }

      orderMut.mutate({ ...o, status: nextStatus });
    } catch (e: any) {
      toast.error("Erro ao atualizar status: " + e.message);
    }
  };

  const advanceStatus = (o: DeliveryOrder) => {
    const flow: DeliveryStatus[] = isRetirada(o)
      ? ["aguardando_confirmacao", "preparo", "entregue"]
      : ["aguardando_confirmacao", "preparo", "rota", "entregue"];
    const idx = flow.indexOf(o.status);
    if (idx < flow.length - 1) {
      updateStatus(o, flow[idx + 1]);
    }
  };

  const regressStatus = (o: DeliveryOrder) => {
    const flow: DeliveryStatus[] = isRetirada(o)
      ? ["aguardando_confirmacao", "preparo", "entregue"]
      : ["aguardando_confirmacao", "preparo", "rota", "entregue"];
    const idx = flow.indexOf(o.status);
    if (idx > 0) {
      updateStatus(o, flow[idx - 1]);
    }
  };

  const submitFinalize = async () => {
    if (!finalizeOrder) return;
    if (!finalizePayment) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    if (!finalizeRegisterId) {
      toast.error("Selecione o caixa onde a venda será registrada");
      return;
    }
    if (!openRegisters.some((r: any) => r.id === finalizeRegisterId)) {
      toast.error("O caixa selecionado não está aberto para este operador");
      return;
    }
    const o = finalizeOrder;
    setFinalizing(true);
    try {
      if (o.sale_id) {
        const { error: upErr } = await supabase
          .from("sales")
          .update({
            status: "concluida",
            payment_method: finalizePayment,
            cash_register_id: finalizeRegisterId,
            origin: "delivery",
          } as any)
          .eq("id", o.sale_id);
        if (upErr) throw upErr;

        // sale_payments (idempotente: limpa antes)
        await supabase.from("sale_payments").delete().eq("sale_id", o.sale_id);
        await supabase.from("sale_payments").insert({
          company_id: cid,
          sale_id: o.sale_id,
          method: finalizePayment,
          amount: Number(o.total),
        } as any);

        // cash_transactions (idempotente)
        await supabase
          .from("cash_transactions")
          .delete()
          .eq("reference_id", o.sale_id)
          .eq("category", "SALE");
        await supabase.from("cash_transactions").insert({
          company_id: cid,
          cash_register_id: finalizeRegisterId,
          type: "IN",
          category: "SALE",
          amount: Number(o.total),
          payment_method: finalizePayment,
          description: `Delivery #${String(o.id).slice(0, 6)}${o.sale_number ? ` (Venda #${o.sale_number})` : ""}`,
          reference_id: o.sale_id,
          user_id: user?.id,
        } as any);

        // Conta a receber (pago)
        await supabase.from("payables").upsert(
          {
            company_id: cid,
            direction: "receber",
            partner_id: o.customer_id,
            sale_id: o.sale_id,
            description: `Venda Delivery${o.sale_number ? ` #${o.sale_number}` : ""}`,
            amount: o.total,
            due_date: new Date().toISOString().slice(0, 10),
            status: "pago",
            payment_method: finalizePayment,
            created_by: user?.id,
          },
          { onConflict: "sale_id" },
        );
      }
      orderMut.mutate({ ...o, status: "entregue" });
      setFinalizeOrder(null);
      qc.invalidateQueries({ queryKey: ["sales-paginated"] });
      qc.invalidateQueries({ queryKey: ["payables", cid] });
      qc.invalidateQueries({ queryKey: ["cash-transactions"] });
      toast.success("Pedido finalizado e venda registrada");
    } catch (e: any) {
      toast.error("Erro ao finalizar: " + e.message);
    } finally {
      setFinalizing(false);
    }
  };


  const cancelOrder = async (o: DeliveryOrder) => {
    if (o.status === "aguardando_confirmacao") {
      if (
        !(await confirm({
          title: "Rejeitar pedido?",
          description: "Isso cancelará a venda e devolverá os produtos ao estoque.",
          confirmLabel: "Rejeitar",
        }))
      )
        return;
    }

    try {
      if (o.sale_id) {
        // 1. Atualizar status da venda para cancelada
        const { error: saleErr } = await supabase
          .from("sales")
          .update({ status: "cancelada" })
          .eq("id", o.sale_id);
        if (saleErr) throw saleErr;

        // 2. Remover do financeiro
        await supabase.from("payables").delete().eq("sale_id", o.sale_id);

        // 3. Estornar estoque
        const { data: items } = await supabase
          .from("sale_items")
          .select("*")
          .eq("sale_id", o.sale_id);
        if (items) {
          for (const item of items) {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            await supabase.from("stock_movements").insert({
              company_id: cid,
              product_id: item.product_id,
              type: "entrada",
              quantity: item.quantity,
              reason: `Cancelamento de entrega #${o.id}`,
              created_by: user?.id,
            });
          }
        }
      }
      // 3. Marcar entrega como cancelada
      orderMut.mutate({ ...o, status: "cancelado" });
    } catch (e: any) {
      toast.error("Erro ao cancelar pedido: " + e.message);
    }
  };

  const removeOrder = async (o: DeliveryOrder) => {
    if (
      await confirm({
        title: "Excluir pedido?",
        description:
          "Tem certeza que deseja excluir este pedido? A venda vinculada (se houver) também será excluída, o estoque será devolvido e o lançamento financeiro removido.",
        confirmLabel: "Excluir",
        variant: "destructive",
      })
    ) {
      try {
        if (o.sale_id) {
          const { error: delErr } = await (supabase.rpc as any)("delete_sale", {
            _sale_id: o.sale_id,
          });
          if (delErr) throw delErr;
          // delete_sale já remove o delivery_order vinculado
          qc.invalidateQueries({ queryKey: ["delivery-orders", cid] });
          qc.invalidateQueries({ queryKey: ["payables", cid] });
          qc.invalidateQueries({ queryKey: ["sales", cid] });
          toast.success("Pedido e venda vinculada excluídos");
          return;
        }
        delOrderMut.mutate(o.id);
      } catch (e: any) {
        toast.error("Erro ao excluir pedido: " + e.message);
      }
    }
  };

  const removeDriver = async (id: string) => {
    const hasCompletedDeliveries = orders.some(
      (o) => o.driver_id === id && o.status === "entregue",
    );
    if (hasCompletedDeliveries) {
      toast.error(
        "Este entregador não pode ser excluído pois possui entregas finalizadas em seu nome.",
      );
      return;
    }

    if (
      await confirm({
        title: "Excluir entregador?",
        description:
          "Tem certeza que deseja excluir este entregador? Esta ação não pode ser desfeita.",
        confirmLabel: "Excluir",
      })
    ) {
      delDriverMut.mutate(id);
    }
  };

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== "entregue" && o.status !== "cancelado");
    return {
      aguardando: orders.filter((o) => o.status === "aguardando_confirmacao").length,
      preparo: orders.filter((o) => o.status === "preparo").length,
      rota: orders.filter((o) => o.status === "rota").length,
      entregue: orders.filter((o) => o.status === "entregue").length,
      activeTotal: active.reduce((s, o) => s + Number(o.total), 0),
    };
  }, [orders]);

  const [orderPage, setOrderPage] = useState(1);
  const [driverPage, setDriverPage] = useState(1);
  const [orderSearch, setOrderSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");
  const pageSize = 5;

  const filteredOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders;
    return orders.filter(
      (o) =>
        matchSearch(o.customer_name, orderSearch) ||
        matchSearch(o.address, orderSearch) ||
        matchSearch(String(o.sale_number ?? ""), orderSearch) ||
        matchSearch(STATUS_LABEL[o.status], orderSearch) ||
        matchSearch(drivers.find((d) => d.id === o.driver_id)?.name ?? "", orderSearch),
    );
  }, [orders, orderSearch, drivers]);

  const filteredDrivers = useMemo(() => {
    if (!driverSearch.trim()) return drivers;
    return drivers.filter(
      (d) =>
        matchSearch(d.name, driverSearch) ||
        matchSearch(d.phone ?? "", driverSearch) ||
        matchSearch(d.vehicle ?? "", driverSearch),
    );
  }, [drivers, driverSearch]);

  const paginatedOrders = useMemo(() => {
    const start = (orderPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, orderPage, pageSize]);

  const totalOrderPages = Math.ceil(filteredOrders.length / pageSize);

  const paginatedDrivers = useMemo(() => {
    const start = (driverPage - 1) * pageSize;
    return filteredDrivers.slice(start, start + pageSize);
  }, [filteredDrivers, driverPage, pageSize]);

  const totalDriverPages = Math.ceil(filteredDrivers.length / pageSize);

  // Reset page when filters change
  useMemo(() => setOrderPage(1), [orders.length, orderSearch]);
  useMemo(() => setDriverPage(1), [drivers.length, driverSearch]);

  const driverName = (id?: string | null) => drivers.find((d) => d.id === id)?.name ?? "—";

  const operatingStatus = useMemo(() => {
    const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const toMin = (t?: string) => {
      if (!t) return null;
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const fmt = (t: string) => t.slice(0, 5);
    const now = new Date();
    const today = now.getDay();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const todayHour = businessHours.find((h) => h.day_of_week === today);
    const openMin = toMin(todayHour?.open_time);
    const closeMin = toMin(todayHour?.close_time);
    const isOpenNow =
      !!todayHour &&
      !todayHour.is_closed &&
      openMin !== null &&
      closeMin !== null &&
      currentMin >= openMin &&
      currentMin < closeMin;

    let nextLabel = "";
    if (isOpenNow && todayHour) {
      nextLabel = `Fecha às ${fmt(todayHour.close_time)}`;
    } else {
      if (
        todayHour &&
        !todayHour.is_closed &&
        openMin !== null &&
        currentMin < openMin
      ) {
        nextLabel = `Abre hoje às ${fmt(todayHour.open_time)}`;
      } else {
        for (let i = 1; i <= 7; i++) {
          const d = (today + i) % 7;
          const h = businessHours.find((x) => x.day_of_week === d);
          if (h && !h.is_closed && h.open_time && h.close_time) {
            nextLabel =
              i === 1
                ? `Abre amanhã às ${fmt(h.open_time)}`
                : `Abre ${DAY_NAMES[d]} às ${fmt(h.open_time)}`;
            break;
          }
        }
        if (!nextLabel) nextLabel = "Nenhum horário configurado";
      }
    }
    return { isOpenNow, nextLabel };
  }, [businessHours]);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeading
          icon={Truck}
          title="Delivery"
          subtitle="Gestão de entregas, entregadores e roteirização básica."
        />
        <div className="flex gap-2 items-center flex-wrap">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm",
              operatingStatus.isOpenNow
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-900 dark:text-green-300"
                : "bg-muted border-border text-muted-foreground",
            )}
            title={operatingStatus.nextLabel}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                operatingStatus.isOpenNow ? "bg-green-500" : "bg-muted-foreground",
              )}
            />
            <span className="font-medium">
              {operatingStatus.isOpenNow ? "Aberto" : "Fechado"}
            </span>
            <span className="text-xs opacity-80">· {operatingStatus.nextLabel}</span>
          </div>
          <Button
            variant={isDeliveryEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => toggleDeliveryMut.mutate(!isDeliveryEnabled)}
            className={cn(
              "gap-2",
              isDeliveryEnabled ? "bg-green-600 hover:bg-green-700 text-white" : "",
            )}
          >
            {isDeliveryEnabled ? (
              <ToggleRight className="size-4" />
            ) : (
              <ToggleLeft className="size-4" />
            )}
            {isDeliveryEnabled ? "Entrega Ativa" : "Ativar Entrega"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled
            className="bg-muted opacity-80 cursor-default gap-2"
          >
            <ToggleRight className="size-4 text-green-600" />
            Retirada Ativa
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHoursDialogOpen(true)}>
            <Clock className="size-4 mr-2" /> Horários
          </Button>
          {isDeliveryEnabled && (
            <Button variant="outline" size="sm" onClick={() => setFeeOpen(true)}>
              <MapPin className="size-4 mr-2" /> Taxas por KM
            </Button>
          )}
          <Button
            variant={autoPrintNew ? "default" : "outline"}
            size="sm"
            onClick={toggleAutoPrint}
            className={cn("gap-2", autoPrintNew ? "bg-brand-orange hover:bg-brand-orange/90 text-white" : "")}
            title="Imprimir cupom automaticamente quando um novo pedido for registrado"
          >
            <Printer className="size-4" />
            {autoPrintNew ? "Auto-impressão ON" : "Auto-impressão OFF"}
          </Button>

        </div>
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-5 gap-3">
        <Card className="p-4 border-l-4 border-l-blue-500">
          <div className="text-xs text-muted-foreground uppercase">Aguardando</div>
          <div className="text-2xl font-bold">{stats.aguardando}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Em preparo</div>
          <div className="text-2xl font-bold">{stats.preparo}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-brand-orange">
          <div className="text-xs text-muted-foreground uppercase">Em rota</div>
          <div className="text-2xl font-bold">{stats.rota}</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-success">
          <div className="text-xs text-muted-foreground uppercase">Entregues</div>
          <div className="text-2xl font-bold">{stats.entregue}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase">Valor em aberto</div>
          <div className="text-2xl font-bold">{brl(stats.activeTotal)}</div>
        </Card>
      </div>

      {/* Pedidos */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-lg">Pedidos de entrega</h2>
          <Dialog
            open={orderOpen}
            onOpenChange={(open) => {
              if (!open) {
                setOrderOpen(false);
                setOrderForm({ type: "entrega" });
                setViewOnly(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                className="bg-brand-red hover:bg-brand-red/90"
                onClick={() => {
                  setOrderForm({ type: "entrega" });
                  setViewOnly(false);
                  setOrderOpen(true);
                }}
              >
                <Plus className="size-4 mr-2" /> Novo pedido
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {viewOnly ? "Visualizar" : orderForm.id ? "Editar" : "Novo"} pedido
                </DialogTitle>
                {orderForm.id && orderForm.created_at && (
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Clock className="size-3" /> Registrado em: {dt(orderForm.created_at)}
                  </div>
                )}
              </DialogHeader>
              <div className={cn("space-y-3", viewOnly && "opacity-90")}>
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Tipo de Pedido</label>
                  <Select
                    value={orderForm.type || "entrega"}
                    onValueChange={(v: "entrega" | "retirada") => {
                      let newAddress = orderForm.address;
                      if (v === "retirada") {
                        if (orderForm.address && orderForm.address !== "Retirada no Local") {
                          setLastManualAddress(orderForm.address);
                        }
                        newAddress = "Retirada no Local";
                      } else if (
                        v === "entrega" &&
                        (!orderForm.address || orderForm.address === "Retirada no Local")
                      ) {
                        if (lastManualAddress) {
                          newAddress = lastManualAddress;
                        } else {
                          // Prioridade: Endereço padrão na tabela partner_addresses -> endereço no cadastro do parceiro
                          const defaultAddr = partnerAddresses.find((pa) => pa.is_default);
                          if (defaultAddr) {
                            newAddress = defaultAddr.address;
                          } else {
                            const partner = partners.find((p) => p.id === orderForm.customer_id);
                            newAddress = partner?.address || "";
                          }
                        }
                      }
                      setOrderForm((p) => ({ ...p, type: v, address: newAddress }));
                    }}
                    disabled={viewOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {isDeliveryEnabled && <SelectItem value="entrega">🚚 Entrega</SelectItem>}
                      {isPickupEnabled && (
                        <SelectItem value="retirada">🏪 Retirada no Local</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                    Venda vinculada (opcional)
                    {!!orderForm.id && !!orderForm.sale_id && <Lock className="size-3" />}
                  </label>
                  <Select
                    value={orderForm.sale_id ?? "none"}
                    onValueChange={(v) => {
                      if (v === "none") {
                        setOrderForm((p) => ({ ...p, sale_id: null, sale_number: null }));
                        return;
                      }
                      const s = sales.find((x) => x.id === v);
                      if (s) {
                        const cust = partners.find((p) => p.id === s.customer_id);
                        setOrderForm((p) => ({
                          ...p,
                          sale_id: s.id,
                          sale_number: s.number,
                          customer_id: s.customer_id,
                          customer_name: cust?.name ?? p.customer_name ?? "",
                          address: cust?.address ?? p.address ?? "",
                          total: Number(s.total),
                          items: (s as any).sale_items || [],
                        }));
                      }
                    }}
                    disabled={viewOnly || (!!orderForm.id && !!orderForm.sale_id)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sem venda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem venda vinculada</SelectItem>
                      {sales
                        .filter((s) => s.status === "concluida" || s.id === orderForm.sale_id)
                        .slice(0, 30)
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            #{s.number} — {brl(Number(s.total))}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {(() => {
                  const isFromN8n = !!orderForm.notes && /Plataforma:/i.test(orderForm.notes);
                  const lockCustomer = viewOnly || isFromN8n;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                          Cliente
                          {isFromN8n && <Lock className="size-3" />}
                        </label>
                        <div
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 border rounded-md transition-colors",
                            lockCustomer
                              ? "bg-muted cursor-default"
                              : "cursor-pointer hover:bg-muted/50",
                          )}
                          onClick={() => !lockCustomer && setCustomerSelectorOpen(true)}
                          title={
                            isFromN8n
                              ? "Pedido vindo do n8n — cliente não pode ser alterado"
                              : undefined
                          }
                        >
                          <Search className="size-4 text-muted-foreground" />
                          <span
                            className={cn(
                              "flex-1 text-sm truncate",
                              !orderForm.customer_name && "text-muted-foreground",
                            )}
                          >
                            {orderForm.customer_name || "Localizar cliente..."}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs uppercase text-muted-foreground">
                          Entregador
                        </label>
                        <div
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 border rounded-md transition-colors",
                            orderForm.type === "retirada" || viewOnly
                              ? "bg-muted cursor-default opacity-50"
                              : "cursor-pointer hover:bg-muted/50",
                          )}
                          onClick={() =>
                            orderForm.type !== "retirada" &&
                            !viewOnly &&
                            setDriverSelectorOpen(true)
                          }
                        >
                          <Truck className="size-4 text-muted-foreground" />
                          <span
                            className={cn(
                              "flex-1 text-sm truncate",
                              !orderForm.driver_id && "text-muted-foreground",
                            )}
                          >
                            {orderForm.type === "retirada"
                              ? "Não aplicável"
                              : drivers.find((d) => d.id === orderForm.driver_id)?.name ||
                                "Selecionar entregador..."}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs uppercase text-muted-foreground">
                      Endereço de Entrega
                    </label>
                    {orderForm.type === "entrega" && !!orderForm.customer_id && !viewOnly && (
                      <Select
                        value={orderForm.address || ""}
                        onValueChange={(val) => {
                          if (val === "NEW") {
                            setNewAddressDialogOpen(true);
                            return;
                          }
                          setOrderForm((p) => ({ ...p, address: val }));
                        }}
                      >
                        <SelectTrigger className="h-6 w-auto text-[10px] py-0 px-2 border-none bg-transparent hover:bg-muted focus:ring-0">
                          <SelectValue placeholder="Endereços do cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NEW" className="text-[11px] font-bold text-brand-red">
                            <Plus className="size-3 mr-1 inline" /> Novo Endereço
                          </SelectItem>
                          <DropdownMenuSeparator />
                          {(() => {
                            const p = partners.find((x) => x.id === orderForm.customer_id);
                            const addresses = [
                              ...(p?.address ? [p.address] : []),
                              ...partnerAddresses.map((pa) => pa.address),
                            ];
                            const uniqueAddresses = Array.from(new Set(addresses));
                            if (uniqueAddresses.length === 0)
                              return (
                                <div className="text-[10px] p-2 italic text-muted-foreground">
                                  Nenhum endereço cadastrado
                                </div>
                              );
                            return uniqueAddresses.map((addr, i) => (
                              <SelectItem key={i} value={addr} className="text-[11px]">
                                {addr}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    placeholder={
                      orderForm.type === "retirada"
                        ? "Retirada no local selecionada"
                        : "Rua, número, bairro..."
                    }
                    value={orderForm.type === "retirada" ? "" : (orderForm.address ?? "")}
                    disabled={orderForm.type === "retirada" || viewOnly}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOrderForm((p) => ({ ...p, address: val }));
                      if (orderForm.type === "entrega" && val !== "Retirada no Local") {
                        setLastManualAddress(val);
                      }
                    }}
                    className={cn(
                      (orderForm.type === "retirada" || viewOnly) &&
                        "bg-muted cursor-not-allowed opacity-50",
                    )}
                  />
                </div>

                <div className="p-3 bg-muted rounded-md space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase text-muted-foreground">
                      Produtos (Para bloqueio de estoque)
                    </div>
                    {!viewOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] uppercase gap-1"
                        onClick={() => setProductSelectorOpen(true)}
                      >
                        <Plus className="size-3" /> Adicionar
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
                    {(orderForm.items || []).length === 0 ? (
                      <div className="text-[10px] text-muted-foreground text-center py-2 italic">
                        Nenhum produto adicionado.
                      </div>
                    ) : (
                      (orderForm.items || []).map((item, idx) => {
                        const p = products.find((x) => x.id === item.product_id);
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-[11px] p-1.5 bg-background rounded border"
                          >
                            <div className="flex-1 truncate pr-2">
                              <span className="font-medium">{p?.name || "Produto"}</span>
                              <div className="text-muted-foreground opacity-70 flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  className={cn(
                                    "w-12 bg-transparent border-b border-muted outline-none transition-colors",
                                    !viewOnly && "hover:border-brand-red focus:border-brand-red",
                                  )}
                                  value={item.quantity}
                                  readOnly={viewOnly}
                                  onChange={(e) => {
                                    if (viewOnly) return;
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val) || val <= 0) return;

                                    if (p && p.stock !== null && val > p.stock) {
                                      toast.error(`Estoque insuficiente. Disponível: ${p.stock}`);
                                      return;
                                    }

                                    const newItems = [...(orderForm.items || [])];
                                    newItems[idx].quantity = val;
                                    const newTotal = newItems.reduce(
                                      (acc, it) => acc + it.unit_price * it.quantity,
                                      0,
                                    );
                                    setOrderForm((prev) => ({
                                      ...prev,
                                      items: newItems,
                                      total: newTotal,
                                    }));
                                  }}
                                />
                                <span>x {brl(item.unit_price)}</span>
                              </div>
                            </div>
                            {!viewOnly && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-5 text-destructive"
                                onClick={() => {
                                  const newItems = [...(orderForm.items || [])];
                                  newItems.splice(idx, 1);
                                  const newTotal = newItems.reduce(
                                    (acc, it) => acc + it.unit_price * it.quantity,
                                    0,
                                  );
                                  setOrderForm((prev) => ({
                                    ...prev,
                                    items: newItems,
                                    total: newTotal,
                                  }));
                                }}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="pt-2 border-t mt-2 flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      Valor Total
                    </span>
                    <span className="text-sm font-bold text-brand-red">
                      {orderForm.total ? brl(orderForm.total) : brl(0)}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase text-muted-foreground">Observações</label>
                  <Textarea
                    rows={2}
                    value={orderForm.notes ?? ""}
                    readOnly={viewOnly}
                    onChange={(e) => setOrderForm((p) => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOrderOpen(false)}>
                  {viewOnly ? "Fechar" : "Cancelar"}
                </Button>
                {!viewOnly && <Button onClick={saveOrder}>Salvar Pedido</Button>}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Customer Selector */}
          <EntitySelectorDialog
            open={customerSelectorOpen}
            onOpenChange={setCustomerSelectorOpen}
            title="Localizar Cliente"
            items={partners
              .filter((p) => p.type === "cliente")
              .map((p) => ({ id: p.id, name: p.name }))}
            selectedId={orderForm.customer_id}
            onSelect={(id) => {
              const c = partners.find((x) => x.id === id);
              if (c) {
                const newAddress =
                  orderForm.type === "retirada" ? "Retirada no Local" : c.address || "";
                setOrderForm((prev) => ({
                  ...prev,
                  customer_id: c.id,
                  customer_name: c.name,
                  address: newAddress,
                }));
                if (c.address && orderForm.type === "entrega") {
                  setLastManualAddress(c.address);
                }
              }
              setCustomerSelectorOpen(false);
            }}
            onCreateNew={() => setQuickCustomerOpen(true)}
            emptyMessage="Nenhum cliente encontrado"
          />

          {/* Driver Selector */}
          <EntitySelectorDialog
            open={driverSelectorOpen}
            onOpenChange={setDriverSelectorOpen}
            title="Selecionar Entregador"
            items={drivers.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name }))}
            selectedId={orderForm.driver_id}
            onSelect={(id) =>
              setOrderForm((prev) => ({ ...prev, driver_id: id === "none" ? null : id }))
            }
            onCreateNew={() => setQuickDriverOpen(true)}
            allowClear
            clearLabel="Sem entregador (Retirada)"
            emptyMessage="Nenhum entregador encontrado"
          />

          {/* Product Selector */}
          <EntitySelectorDialog
            open={productSelectorOpen}
            onOpenChange={setProductSelectorOpen}
            title="Buscar Produto"
            items={products
              .filter((p) => p.active)
              .map((p) => ({ id: p.id, name: `${p.name} (${brl(p.sale_price)})` }))}
            onSelect={(id) => {
              const p = products.find((x) => x.id === id);
              if (p) {
                setPendingProduct(p);
                setPendingQty("1");
              }
            }}
            emptyMessage="Nenhum produto encontrado"
          />

          {/* New Address Modal */}
          <Dialog open={newAddressDialogOpen} onOpenChange={setNewAddressDialogOpen}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle className="text-sm">Novo Endereço</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-muted-foreground">
                    Endereço de Entrega
                  </label>
                  <Textarea
                    rows={3}
                    placeholder="Rua, número, bairro..."
                    value={newAddressForm.address}
                    onChange={(e) =>
                      setNewAddressForm((prev) => ({ ...prev, address: e.target.value }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={newAddressForm.is_default}
                    onChange={(e) =>
                      setNewAddressForm((prev) => ({ ...prev, is_default: e.target.checked }))
                    }
                    className="size-4"
                  />
                  <label htmlFor="is_default" className="text-xs">
                    Definir como endereço padrão
                  </label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setNewAddressDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={!newAddressForm.address.trim() || addPartnerAddressMut.isPending}
                  onClick={() => addPartnerAddressMut.mutate(newAddressForm)}
                >
                  {addPartnerAddressMut.isPending ? "Salvando..." : "Salvar Endereço"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Quantity Modal */}
          <Dialog open={!!pendingProduct} onOpenChange={(open) => !open && setPendingProduct(null)}>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle className="text-sm">Quantidade: {pendingProduct?.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Disponível em estoque:</span>
                  <span className="font-bold">{pendingProduct?.stock ?? "∞"}</span>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-muted-foreground">
                    Defina a quantidade
                  </label>
                  <Input
                    type="number"
                    autoFocus
                    min="1"
                    step="1"
                    value={pendingQty}
                    onChange={(e) => setPendingQty(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addProductWithQty()}
                  />
                </div>
              </div>
              <DialogFooter className="flex-row gap-2 flex">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setPendingProduct(null)}
                >
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={addProductWithQty}>
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Quick Customer Registration */}
          <Dialog open={quickCustomerOpen} onOpenChange={setQuickCustomerOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Cadastro Rápido de Cliente</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Nome Completo</label>
                  <Input
                    autoFocus
                    value={quickCustomerForm.name}
                    onChange={(e) => setQuickCustomerForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Telefone</label>
                  <Input
                    value={quickCustomerForm.phone}
                    onChange={(e) =>
                      setQuickCustomerForm((p) => ({ ...p, phone: maskPhone(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-muted-foreground">
                    Endereço Principal
                  </label>
                  <Textarea
                    rows={2}
                    value={quickCustomerForm.address}
                    onChange={(e) =>
                      setQuickCustomerForm((p) => ({ ...p, address: e.target.value }))
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setQuickCustomerOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => quickCustomerMut.mutate(quickCustomerForm)}
                  disabled={!quickCustomerForm.name.trim() || quickCustomerMut.isPending}
                >
                  Cadastrar e Selecionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Quick Driver Registration */}
          <Dialog open={quickDriverOpen} onOpenChange={setQuickDriverOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Cadastro Rápido de Entregador</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Nome</label>
                  <Input
                    autoFocus
                    value={quickDriverForm.name}
                    onChange={(e) => setQuickDriverForm((p) => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Telefone</label>
                  <Input
                    value={quickDriverForm.phone}
                    onChange={(e) =>
                      setQuickDriverForm((p) => ({ ...p, phone: maskPhone(e.target.value) }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Veículo</label>
                  <Input
                    placeholder="Ex: Moto, Carro..."
                    value={quickDriverForm.vehicle}
                    onChange={(e) => setQuickDriverForm((p) => ({ ...p, vehicle: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setQuickDriverOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => quickDriverMut.mutate(quickDriverForm)}
                  disabled={!quickDriverForm.name.trim() || quickDriverMut.isPending}
                >
                  Cadastrar e Selecionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-3">
          <SearchInput
            value={orderSearch}
            onChange={setOrderSearch}
            placeholder="Pesquisar pedidos por cliente, endereço, venda..."
          />
        </div>

        <div className="hidden md:block rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente / Venda</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Entregador</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum pedido de entrega.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="flex flex-col">
                        {o.sale_number && (
                          <div className="text-xs text-muted-foreground">
                            Venda #{o.sale_number}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground/60">
                          {dt(o.created_at)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">{o.address}</TableCell>
                    <TableCell className="text-xs">{driverName(o.driver_id)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {brl(Number(o.total))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 items-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditOrder(o)}
                          title="Visualizar/Editar"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => printDeliveryOrder(cid, o)}
                          title="Imprimir cupom do pedido"
                        >
                          <Printer className="size-4" />
                        </Button>


                        {o.status !== "entregue" && o.status !== "cancelado" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeOrder(o)}
                            title="Excluir"
                          >
                            <Trash2 className="size-3 text-brand-red" />
                          </Button>
                        )}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-1 h-8">
                              Status <ChevronDown className="size-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Alterar status para</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {allowedStatusesFor(o).map((s) => (

                              <DropdownMenuItem
                                key={s}
                                disabled={s === o.status}
                                onClick={() => updateStatus(o, s)}
                              >
                                {STATUS_LABEL[s]}
                                {s === o.status && (
                                  <span className="ml-auto text-[10px] text-muted-foreground">
                                    (atual)
                                  </span>
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {paginatedOrders.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">Nenhum pedido de entrega.</div>
          ) : (
            paginatedOrders.map((o) => (
              <Card
                key={o.id}
                className={`p-4 space-y-3 border-l-4 ${o.status === "entregue" ? "border-l-success" : o.status === "cancelado" ? "border-l-destructive" : "border-l-brand-orange"}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-base line-clamp-1">{o.customer_name}</div>
                    <div className="flex flex-col gap-0.5">
                      {o.sale_number && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Hash className="size-3" /> Venda #{o.sale_number}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                        <Clock className="size-3" /> {dt(o.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-bold text-base text-brand-red">
                    {brl(Number(o.total))}
                  </div>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-dashed pt-3">
                  <div className="space-y-1">
                    <div className="text-muted-foreground italic truncate max-w-[180px]">
                      {o.address}
                    </div>
                    <Badge variant={STATUS_VARIANT[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                  </div>
                  <div className="flex gap-1 items-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => openEditOrder(o)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => printDeliveryOrder(cid, o)}
                      title="Imprimir cupom"
                    >
                      <Printer className="size-4" />
                    </Button>


                    {o.status !== "entregue" && o.status !== "cancelado" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => removeOrder(o)}
                      >
                        <Trash2 className="size-3 text-brand-red" />
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1 h-8">
                          Status <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Alterar para</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {allowedStatusesFor(o).map((s) => (
                          <DropdownMenuItem
                            key={s}
                            disabled={s === o.status}
                            onClick={() => updateStatus(o, s)}
                          >
                            {STATUS_LABEL[s]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {totalOrderPages > 1 && (
          <div className="mt-4 border-t pt-4">
            <SmartPagination
              currentPage={orderPage}
              totalPages={totalOrderPages}
              onPageChange={setOrderPage}
            />
          </div>
        )}
      </Card>

      {/* Entregadores */}
      {isDeliveryEnabled && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-lg">Entregadores</h2>
            <Dialog open={driverOpen} onOpenChange={setDriverOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDriverForm({});
                    setDriverOpen(true);
                  }}
                >
                  <Plus className="size-4 mr-2" /> Novo entregador
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{driverForm.id ? "Editar" : "Novo"} entregador</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs uppercase text-muted-foreground">Nome</label>
                    <Input
                      value={driverForm.name ?? ""}
                      onChange={(e) => setDriverForm((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-muted-foreground">Telefone</label>
                    <Input
                      inputMode="tel"
                      placeholder="(00) 00000-0000"
                      value={maskPhone(driverForm.phone ?? "")}
                      onChange={(e) =>
                        setDriverForm((p) => ({ ...p, phone: maskPhone(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-muted-foreground">Veículo</label>
                    <Input
                      value={driverForm.vehicle ?? ""}
                      onChange={(e) => setDriverForm((p) => ({ ...p, vehicle: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDriverOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={saveDriver}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mb-3">
            <SearchInput
              value={driverSearch}
              onChange={setDriverSearch}
              placeholder="Pesquisar entregadores..."
            />
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDrivers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhum entregador cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDrivers.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell className="text-sm">{d.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm">{d.vehicle ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Editar entregador"
                          onClick={() => {
                            setDriverForm(d);
                            setDriverOpen(true);
                          }}
                        >
                          <Edit2 className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Excluir entregador"
                          onClick={() => removeDriver(d.id)}
                        >
                          <Trash2 className="size-3 text-brand-red" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Dialog for Business Hours */}
      <Dialog open={hoursDialogOpen} onOpenChange={setHoursDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Horários de Atendimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map(
              (day, idx) => {
                const hour = businessHours.find((h) => h.day_of_week === idx) || {
                  day_of_week: idx,
                  open_time: "08:00:00",
                  close_time: "22:00:00",
                  is_closed: false,
                };
                return (
                  <div key={idx} className="flex items-center gap-4 border-b pb-2 last:border-0">
                    <div className="w-24 font-medium">{day}</div>
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        className="w-32"
                        disabled={hour.is_closed}
                        value={hour.open_time.slice(0, 5)}
                        onChange={(e) =>
                          hoursMut.mutate({ ...hour, open_time: e.target.value + ":00" })
                        }
                      />
                      <span>até</span>
                      <Input
                        type="time"
                        className="w-32"
                        disabled={hour.is_closed}
                        value={hour.close_time.slice(0, 5)}
                        onChange={(e) =>
                          hoursMut.mutate({ ...hour, close_time: e.target.value + ":00" })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={hour.is_closed}
                        onChange={(e) => hoursMut.mutate({ ...hour, is_closed: e.target.checked })}
                      />
                      <span className="text-sm">Fechado</span>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog for Delivery Fees by KM */}
      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Taxas de Entrega por KM</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-4 gap-3 mb-4 items-end bg-muted/30 p-4 rounded-lg">
            <div>
              <label className="text-xs uppercase text-muted-foreground">KM Inicial</label>
              <Input
                type="number"
                step="0.1"
                value={feeForm.min_km ?? 0}
                onChange={(e) => setFeeForm((p) => ({ ...p, min_km: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">KM Final</label>
              <Input
                type="number"
                step="0.1"
                value={feeForm.max_km ?? ""}
                onChange={(e) => setFeeForm((p) => ({ ...p, max_km: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase text-muted-foreground">Taxa (R$)</label>
              <Input
                inputMode="numeric"
                value={formatCurrencyInput(String(Math.round(Number(feeForm.fee ?? 0) * 100)))}
                onChange={(e) =>
                  setFeeForm((p) => ({ ...p, fee: parseCurrencyInput(e.target.value) }))
                }
              />
            </div>
            <Button
              onClick={() => {
                if (feeForm.max_km === undefined || feeForm.fee === undefined) {
                  toast.error("Preencha o KM final e a taxa");
                  return;
                }
                feeMut.mutate(feeForm);
              }}
            >
              {feeForm.id ? "Atualizar" : "Adicionar"}
            </Button>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faixa (KM)</TableHead>
                  <TableHead>Taxa</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveryFees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Nenhuma taxa cadastrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  deliveryFees.map((f) => {
                    const isLinked = orders.some(
                      (o) =>
                        o.delivery_fee_id === f.id &&
                        o.status !== "entregue" &&
                        o.status !== "cancelado",
                    );
                    return (
                      <TableRow key={f.id}>
                        <TableCell>
                          {f.min_km} km a {f.max_km} km
                        </TableCell>
                        <TableCell className="font-bold text-brand-orange">{brl(f.fee)}</TableCell>
                        <TableCell className="text-right flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isLinked}
                            onClick={() => {
                              setFeeForm(f);
                              setFeeOpen(true);
                            }}
                          >
                            <Edit2 className="size-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isLinked}
                            onClick={() => delFeeMut.mutate(f.id)}
                          >
                            <Trash2 className="size-3 text-brand-red" />
                          </Button>
                          {isLinked && (
                            <span title="Vinculado a pedidos ativos">
                              <Lock className="size-3 text-muted-foreground self-center" />
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Finalizar pedido (Entregue) */}
      <Dialog open={!!finalizeOrder} onOpenChange={(o) => !o && setFinalizeOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Finalizar pedido como Entregue</DialogTitle>
          </DialogHeader>
          {finalizeOrder && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <div><strong>Cliente:</strong> {finalizeOrder.customer_name}</div>
                <div><strong>Total:</strong> {brl(Number(finalizeOrder.total))}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Forma de pagamento *</label>
                <Select value={finalizePayment} onValueChange={setFinalizePayment}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        Nenhuma forma de pagamento ativa cadastrada.
                      </div>
                    )}
                    {paymentMethods.map((m: any) => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Caixa onde registrar *</label>
                <Select value={finalizeRegisterId} onValueChange={setFinalizeRegisterId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um caixa aberto..." /></SelectTrigger>
                  <SelectContent>
                    {openRegisters.length === 0 && (
                      <div className="px-2 py-3 text-xs text-muted-foreground">
                        Nenhum caixa aberto. Abra um caixa antes de finalizar.
                      </div>
                    )}
                    {openRegisters.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>
                        {profileLabel(r.user_id_open)}
                        {r.user_id_open === user?.id ? " (você)" : ""} — aberto em {dt(r.opened_at)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setFinalizeOrder(null)} disabled={finalizing}>
                  Cancelar
                </Button>
                <Button onClick={submitFinalize} disabled={finalizing}>
                  {finalizing ? "Finalizando..." : "Confirmar entrega"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

