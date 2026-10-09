import { makePrefetchLoader } from "@/lib/route-prefetch";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { updateStockLocation } from "@/lib/db";
import { PageHeading } from "@/components/page-header";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import * as React from "react";
import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { createStockCount, deleteStockCount, fetchProducts, fetchProductsPaginated, fetchMovementsPaginated, fetchCategories, fetchBrands, fetchStockLocations, fetchPartners, fetchStockCounts, fetchStockCountItems, updateStockCountItemVerified, updateStockCountStatus, fetchProductReferencesByCompany, fetchStockCountTeams, createStockCountTeam, deleteStockCountTeam, updateStockCountTeamLocations, updateStockCountTeamStatus, updateStockCountItem, fetchTeam, updateStockCountTeamMembers, isAdmin, hasPermission, updateProduct, logActivity } from "@/lib/db";
import { maskCurrency, parseCurrency, formatCurrency } from "@/lib/masks";
import { buildRefsSearchMap, buildRefsBrandMap } from "@/lib/product-search";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SmartPagination } from "@/components/smart-pagination";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowUpRight, ArrowDownLeft, Settings2, Search, Package, AlertTriangle, TrendingUp, Boxes, Calendar, ArrowDownUp, MapPin, Eye, Plus, Download, ClipboardCheck, CheckCircle2, Check, Trash2, ChevronDown, ScanLine, Printer, X, LayoutGrid, RotateCw, ZoomIn, ZoomOut, RefreshCw, Users, Loader2, ChevronRight, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase as sb } from "@/integrations/supabase/client";
import { brl, dt } from "@/lib/format";
import { useValueVisibility, ValueVisibilityToggle } from "@/hooks/use-value-visibility";
import { cn, normalize, compareProductNames, matchSearch } from "@/lib/utils";
import type { Product, StockCount, StockCountTeam, StockCountItem } from "@/lib/db-types";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { PrintButton } from "@/components/print-button";
import { useConfirm } from "@/components/confirm-dialog";
import { printList } from "@/lib/print-list";
import { StockCountChartsDialog } from "@/components/stock-count-charts-dialog";

import { BarChart3 } from "lucide-react";


export const Route = createFileRoute("/app/estoque")({
  validateSearch: (search: Record<string, unknown>): { filter?: string } => {
    return {
      filter: (search.filter as string) || undefined,
    };
  },
  loader: makePrefetchLoader(["locations", "team", "stockCounts", "units"]),
  component: StockPage,
});

function StockPage() {
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const urlSearch = useSearch({ from: "/app/estoque" });
  const [activeTab, setActiveTab] = usePersistedState("estoque:tab", "posicao");
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [canManageTeams, setCanManageTeams] = useState(false);

  useEffect(() => {
    if (cid) {
      isAdmin(cid).then(setIsAdminUser);
      hasPermission(cid, "gerenciar_equipes_contagem", "view").then(setCanManageTeams);
    }
  }, [cid]);

  const canEditCounts = isAdminUser || canManageTeams;

  React.useEffect(() => {
    if (urlSearch.filter) {
      setStatusFilter(urlSearch.filter);
      setActiveTab("posicao");
    }
  }, [urlSearch.filter, setActiveTab]);

  const [search, setSearch] = useState("");
  const [posPage, setPosPage] = useState(1);
  const [histPage, setHistPage] = useState(1);
  const [countPage, setCountPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("stock_pageSize");
    return saved ? Number(saved) : 50;
  });
  
  useEffect(() => {
    localStorage.setItem("stock_pageSize", pageSize.toString());
  }, [pageSize]);

  const [catFilter, setCatFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>(urlSearch.filter || "all");
  const [hasRefsFilter, setHasRefsFilter] = useState(false);

  const productsQ = useQuery({
    queryKey: ["products-paginated-stock", cid, search, catFilter, brandFilter, locationFilter, statusFilter, hasRefsFilter, posPage, pageSize],
    queryFn: () => fetchProductsPaginated({
      companyId: cid,
      page: posPage - 1,
      pageSize: pageSize,
      search: search,
      categoryId: catFilter,
      brandId: brandFilter,
      locationId: locationFilter,
      status: statusFilter,
      hasAdditionalBrands: hasRefsFilter,
    }),
    enabled: !!cid,
  });

  const movementsQ = useQuery({
    queryKey: ["movements-paginated", cid, histPage, pageSize],
    queryFn: () => fetchMovementsPaginated({
      companyId: cid,
      page: histPage - 1,
      pageSize: pageSize,
    }),
    enabled: !!cid && activeTab === "historico",
  });

  const categoriesQ = useQuery({
    queryKey: ["categories", cid],
    queryFn: () => fetchCategories(cid),
    enabled: !!cid,
  });

  const brandsQ = useQuery({ queryKey: ["brands", cid], queryFn: () => fetchBrands(cid), enabled: !!cid });
  const locationsQ = useQuery({ queryKey: ["stock_locations", cid], queryFn: () => fetchStockLocations(cid), enabled: !!cid });
  const suppliersQ = useQuery({ queryKey: ["partners", cid, "fornecedor"], queryFn: () => fetchPartners(cid, "fornecedor"), enabled: !!cid });
  const countsQ = useQuery({ queryKey: ["stock_counts", cid], queryFn: () => fetchStockCounts(cid), enabled: !!cid });
  const refsQ = useQuery({ queryKey: ["product_references", cid], queryFn: () => fetchProductReferencesByCompany(cid), enabled: !!cid });



  const products = productsQ.data?.data ?? [];
  const totalProductsCount = productsQ.data?.count ?? 0;

  const movements = movementsQ.data?.data ?? [];
  const totalMovementsCount = movementsQ.data?.count ?? 0;

  const categories = categoriesQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const locations = locationsQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const counts = countsQ.data ?? [];
  const openCount = counts.find((count) => count.status === "aberta");
  const allProductsQ = useQuery({
    queryKey: ["all-products-for-map", cid],
    queryFn: async () => {
      const all = await fetchProducts(cid);
      return { data: all, count: all.length };
    },
    enabled: !!cid && activeTab === "mapa",
    staleTime: 0,
    refetchOnMount: "always",
  });

  const refsMap = useMemo(
    () => buildRefsSearchMap(refsQ.data ?? [], new Map(brands.map(b => [b.id, b.name]))),
    [refsQ.data, brands],
  );
  const refsBrandMap = useMemo(() => buildRefsBrandMap(refsQ.data ?? []), [refsQ.data]);

  const [teamFilter, setTeamFilter] = useState<string>("");
  const [countLocationFilter, setCountLocationFilter] = useState<string>("all");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamMembers, setNewTeamMembers] = useState<string[]>([]);
  const [newTeamLocations, setNewTeamLocations] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isChartsOpen, setIsChartsOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmingItem, setConfirmingItem] = useState<StockCountItem | null>(null);
  const [editQuantity, setEditQuantity] = useState<string>("");
  const [editPrice, setEditPrice] = useState<string>("");

  // Edição completa do produto a partir do modal de contagem
  const [editProductOpen, setEditProductOpen] = useState(false);
  const [editProductForm, setEditProductForm] = useState<{
    name: string;
    sku: string;
    location_id: string;
    sale_price: string;
    cost_price: string;
    min_stock: string;
    unit: string;
    description: string;
  } | null>(null);
  const [savingProductEdit, setSavingProductEdit] = useState(false);

  // Diálogo de ordenação da impressão da contagem
  const [printOrderOpen, setPrintOrderOpen] = useState(false);
  const [printOrderTarget, setPrintOrderTarget] = useState<"pdf" | "print" | null>(null);
  const [printOrderBy, setPrintOrderBy] = useState<"name" | "location">("name");




  const [countSearch, setCountSearch] = useState("");
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [gridSize, setGridSize] = usePersistedState("stock:grid-size", 40);
  const [selectedCount, setSelectedCount] = useState<StockCount | null>(null);
  const isCountClosed = selectedCount?.status === "concluida";
  const [finishingCountId, setFinishingCountId] = useState<string | null>(null);
  const teamsQ = useQuery({
    queryKey: ["stock_count_teams", selectedCount?.id],
    queryFn: () => fetchStockCountTeams(selectedCount!.id),
    enabled: !!selectedCount?.id
  });
  const [expandedCountId, setExpandedCountId] = useState<string | null>(null);
  const teamMembersQ = useQuery({
    queryKey: ["team", cid],
    queryFn: () => fetchTeam(cid),
    enabled: !!cid,
    select: (data) => (data || []).filter((m: any) => !m.is_blocked),
  });


  const [resizingLoc, setResizingLoc] = useState<{ id: string; type: "width" | "height"; startVal: number; startPos: number; currentVal: number } | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [bulkSelectedIds, setBulkSelectedIds] = useState<Set<string>>(new Set());

  const bulkVerifyEnabledQ = useQuery({
    queryKey: ["system-bulk-count-verification"],
    queryFn: async () => {
      const { data } = await sb
        .from("system_settings" as any)
        .select("bulk_count_verification_enabled")
        .maybeSingle();
      return Boolean((data as any)?.bulk_count_verification_enabled ?? false);
    },
    staleTime: 60_000,
  });
  const bulkVerifyEnabled = Boolean(bulkVerifyEnabledQ.data);

  useEffect(() => {
    setBulkSelectedIds(new Set());
  }, [selectedCount?.id, teamFilter, countLocationFilter]);

  const bulkVerifyMut = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await updateStockCountItem(id, { verified: true });
      }
      return ids;
    },
    onSuccess: (ids) => {
      toast.success(`${ids.length} ${ids.length === 1 ? "item marcado" : "itens marcados"} como verificado(s).`);
      setBulkSelectedIds(new Set());
      if (selectedCount) qc.invalidateQueries({ queryKey: ["stock_count_items", selectedCount.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (openCount && !selectedCount) {
      setSelectedCount(openCount);
      setExpandedCountId(openCount.id);
    }
  }, [openCount, selectedCount]);

  // Realtime: mantém Posição de Estoque alinhada com o estoque real
  useEffect(() => {
    if (!cid) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["products-paginated-stock"] });
      qc.invalidateQueries({ queryKey: ["all-products-for-count", cid] });
      qc.invalidateQueries({ queryKey: ["all-products-for-map", cid] });
    };
    const channel = sb
      .channel(`stock-sync-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `company_id=eq.${cid}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter: `company_id=eq.${cid}` }, invalidate)
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [cid, qc]);

  useEffect(() => {
    if (activeTab !== "mapa") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se estiver digitando em um input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "+" || e.key === "=") {
        setGridSize(prev => Math.min(100, prev + 10));
      } else if (e.key === "-" || e.key === "_") {
        setGridSize(prev => Math.max(20, prev - 10));
      } else if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setGridSize(50);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, setGridSize]);
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number; w: number; h: number; isValid: boolean; multiple?: { id: string; x: number; y: number; w: number; h: number }[] } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedLocIds, setSelectedLocIds] = useState<string[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const gridContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [scanModeOpen, setScanModeOpen] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanFound, setScanFound] = useState<null | {
    item: { id: string; product_name: string; sku: string; unit: string; expected_quantity: number; verified: boolean };
    locationName: string;
  }>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);


  const countItemsQ = useQuery({
    queryKey: ["stock_count_items", selectedCount?.id],
    queryFn: () => fetchStockCountItems(selectedCount!.id),
    enabled: !!selectedCount?.id,
  });

  const createCountMut = useMutation({
    mutationFn: async () => {
      if (!canEditCounts) throw new Error("Apenas administradores podem abrir contagens.");
      if (counts.some((count) => count.status === "aberta" && count.count_date === countDate)) {
        throw new Error("Já existe uma contagem em aberto para esta data. Finalize ou exclua antes de criar uma nova.");
      }
      if (counts.some((count) => count.count_date === countDate)) {
        throw new Error("Já existe uma contagem registrada para esta data.");
      }
      const allProducts = await fetchProducts(cid);
      return createStockCount({ companyId: cid, countDate, products: allProducts, userId: user?.id });
    },
    onSuccess: (count) => {
      toast.success("Contagem criada. Agora defina as equipes.");
      setSelectedCount(count);
      setExpandedCountId(count.id);
      setIsTeamModalOpen(true);
      qc.invalidateQueries({ queryKey: ["stock_counts", cid] });
      qc.invalidateQueries({ queryKey: ["stock_count_items", count.id] });
    },
    onError: (e: Error) => toast.error(e.message.includes("duplicate") ? "Já existe uma contagem para esta data." : e.message),
  });

  const finishCountMut = useMutation({
    mutationFn: (id: string) => updateStockCountStatus(id, "concluida"),
    onSuccess: () => {
      toast.success("Contagem finalizada.");
      qc.invalidateQueries({ queryKey: ["stock_counts", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCountMut = useMutation({
    mutationFn: (id: string) => deleteStockCount(id),
    onSuccess: (_, id) => {
      toast.success("Contagem excluída.");
      if (selectedCount?.id === id) setSelectedCount(null);
      if (expandedCountId === id) setExpandedCountId(null);
      qc.invalidateQueries({ queryKey: ["stock_counts", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyItemMut = useMutation({
    mutationFn: ({ id, verified, expected_quantity }: { id: string; verified: boolean; expected_quantity?: number }) => 
      updateStockCountItem(id, { verified, expected_quantity }),
    onMutate: async ({ id, verified, expected_quantity }) => {
      if (!selectedCount) return;
      const key = ["stock_count_items", selectedCount.id];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<StockCountItem[]>(key);
      if (prev) {
        qc.setQueryData<StockCountItem[]>(key, prev.map((it) =>
          it.id === id
            ? { ...it, verified, ...(expected_quantity !== undefined ? { expected_quantity } : {}), verified_at: verified ? new Date().toISOString() : it.verified_at }
            : it
        ));
      }
      return { prev, key };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev && ctx.key) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      if (selectedCount) qc.invalidateQueries({ queryKey: ["stock_count_items", selectedCount.id] });
    },
  });

  const createTeamMut = useMutation({
    mutationFn: async ({ name, members, locations }: { name: string; members: string[]; locations: string[] }) => {
      const team = await createStockCountTeam({ count_id: (selectedCount?.id || openCount?.id)!, company_id: cid, name });
      if (members.length > 0) {
        await updateStockCountTeamMembers(cid, (selectedCount?.id || openCount?.id)!, team.id, members);
      }
      if (locations.length > 0) {
        await updateStockCountTeamLocations(cid, (selectedCount?.id || openCount?.id)!, team.id, locations);
      }
      return team;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_count_teams"] });
      setNewTeamName("");
      setNewTeamMembers([]);
      setNewTeamLocations([]);
      toast.success("Equipe criada com sucesso.");
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const deleteTeamMut = useMutation({
    mutationFn: (id: string) => deleteStockCountTeam(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_count_teams"] });
      toast.success("Equipe excluída.");
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const updateTeamLocsMut = useMutation({
    mutationFn: ({ teamId, locationIds }: { teamId: string; locationIds: string[] }) =>
      updateStockCountTeamLocations(cid, selectedCount!.id, teamId, locationIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_count_teams"] });
      toast.success("Localizações atualizadas.");
    },
    onError: (e: Error) => toast.error(e.message)
  });


  const updateTeamStatusMut = useMutation({
    mutationFn: ({ teamId, status }: { teamId: string; status: "aberta" | "concluida" }) =>
      updateStockCountTeamStatus(teamId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_count_teams"] });
      toast.success("Status da equipe atualizado.");
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const updateTeamMembersMut = useMutation({
    mutationFn: ({ teamId, userIds }: { teamId: string; userIds: string[] }) =>
      updateStockCountTeamMembers(cid, selectedCount!.id, teamId, userIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_count_teams"] });
      toast.success("Usuários da equipe atualizados.");
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const handleConfirmVerification = async () => {
    if (!confirmingItem) return;
    if (isCountClosed) { toast.error("Contagem finalizada — não é possível alterar."); return; }
    const qty = parseFloat(editQuantity);
    if (isNaN(qty)) {
      toast.error("Quantidade inválida");
      return;
    }
    const price = parseCurrency(editPrice);
    try {
      const prod = allProductsForCount.find((p) => p.id === confirmingItem.product_id) || products.find((p) => p.id === confirmingItem.product_id);
      if (prod) {
        const patch: Partial<Product> = {};
        if (Number(prod.sale_price || 0) !== price) patch.sale_price = price;
        if (Number(prod.stock || 0) !== qty) patch.stock = qty;
        if (Object.keys(patch).length > 0) {
          await updateProduct(prod.id, patch, user?.id);
        }
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar produto");
      return;
    }
    verifyItemMut.mutate({
      id: confirmingItem.id,
      verified: true,
      expected_quantity: qty
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["products"] });
        qc.invalidateQueries({ queryKey: ["products-paginated-stock"] });
        qc.invalidateQueries({ queryKey: ["all-products-for-count", cid] });
        setIsConfirmModalOpen(false);
        setConfirmingItem(null);
      }
    });
  };


  const openEditProductFromCount = () => {
    if (!confirmingItem) return;
    const prod = allProductsForCount.find((p) => p.id === confirmingItem.product_id)
      || products.find((p) => p.id === confirmingItem.product_id);
    if (!prod) {
      toast.error("Produto não encontrado");
      return;
    }
    setEditProductForm({
      name: prod.name || "",
      sku: prod.sku || "",
      location_id: prod.location_id || "",
      sale_price: formatCurrency(Number(prod.sale_price || 0)),
      cost_price: formatCurrency(Number(prod.cost_price || 0)),
      min_stock: String(prod.min_stock ?? 0),
      unit: prod.unit || "UN",
      description: prod.description || "",
    });
    setEditProductOpen(true);
  };

  const handleSaveProductEdit = async () => {
    if (!confirmingItem || !editProductForm) return;
    if (isCountClosed) { toast.error("Contagem finalizada — não é possível alterar."); return; }
    const prod = allProductsForCount.find((p) => p.id === confirmingItem.product_id);
    if (!prod) {
      toast.error("Produto não encontrado");
      return;
    }
    const newLocId = editProductForm.location_id || null;
    const oldLocId = prod.location_id || null;
    const locationChanged = newLocId !== oldLocId;

    const teams = teamsQ.data || [];
    let currentTeamId = teamFilter;
    if (!currentTeamId && user?.id) {
      const myTeam = teams.find((t) => t.members?.includes(user.id));
      if (myTeam) currentTeamId = myTeam.id;
    }
    const destTeam = locationChanged && newLocId
      ? teams.find((t) => t.id !== currentTeamId && (t.locations || []).includes(newLocId))
      : null;

    if (locationChanged && destTeam) {
      if (destTeam.status === "concluida") {
        toast.error(`Não é possível transferir: a equipe "${destTeam.name}" já finalizou a contagem.`);
        return;
      }
      const ok = await confirm({
        title: "Transferir contagem do produto?",
        description: `A localização escolhida pertence à equipe "${destTeam.name}". O produto será transferido para a lista de contagem dela.`,
        confirmLabel: "Transferir",
      });
      if (!ok) return;
    }

    setSavingProductEdit(true);
    try {
      const patch: Partial<Product> = {
        name: editProductForm.name.trim(),
        sku: editProductForm.sku.trim(),
        location_id: newLocId,
        sale_price: parseCurrency(editProductForm.sale_price),
        cost_price: parseCurrency(editProductForm.cost_price),
        min_stock: Number(editProductForm.min_stock) || 0,
        unit: editProductForm.unit || "UN",
        description: editProductForm.description,
      };
      await updateProduct(prod.id, patch, user?.id);

      const itemPatch: any = {
        product_name: patch.name,
        sku: patch.sku,
        unit: patch.unit,
      };
      if (locationChanged && destTeam) {
        itemPatch.verified = false;
        itemPatch.verified_at = null;
      }
      await updateStockCountItem(confirmingItem.id, itemPatch);

      if (locationChanged && destTeam && selectedCount) {
        const key = `stock_count_transfers:${selectedCount.id}:${destTeam.id}`;
        try {
          const cur = JSON.parse(localStorage.getItem(key) || "[]") as string[];
          cur.push(patch.name as string);
          localStorage.setItem(key, JSON.stringify(cur));
        } catch { /* ignore */ }

        // Auditoria: registra a transferência
        const teams = teamsQ.data || [];
        const originTeam = teams.find((t) => (t.locations || []).includes(oldLocId || ""));
        const originLocName = locations.find((l) => l.id === oldLocId)?.name || null;
        const destLocName = locations.find((l) => l.id === newLocId)?.name || null;
        if (user?.id) {
          await logActivity({
            companyId: cid,
            userId: user.id,
            action: "STOCK_COUNT_TRANSFER",
            entity: "stock_count_items",
            entityId: confirmingItem.id,
            meta: {
              stock_count_id: selectedCount.id,
              product_id: prod.id,
              product_name: patch.name,
              from_team_id: originTeam?.id ?? null,
              from_team_name: originTeam?.name ?? null,
              from_location_id: oldLocId,
              from_location_name: originLocName,
              to_team_id: destTeam.id,
              to_team_name: destTeam.name,
              to_location_id: newLocId,
              to_location_name: destLocName,
              reason: "Edição de produto durante contagem (mudança de localização)",
              transferred_at: new Date().toISOString(),
            },
          });
        }

        toast.success(`Produto transferido para a equipe "${destTeam.name}".`);
      } else {
        toast.success("Produto atualizado.");
      }

      qc.invalidateQueries({ queryKey: ["all-products-for-count", cid] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products-paginated-stock"] });
      if (selectedCount) qc.invalidateQueries({ queryKey: ["stock_count_items", selectedCount.id] });

      setEditProductOpen(false);
      setEditProductForm(null);
      if (locationChanged && destTeam) {
        setIsConfirmModalOpen(false);
        setConfirmingItem(null);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar produto");
    } finally {
      setSavingProductEdit(false);
    }
  };



  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [countSortConfig, setCountSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const getProductLocationName = (productId: string, fallbackLocationId?: string | null) => {
    const product = allProductsForCount.find((p) => p.id === productId);
    const locationId = product?.location_id ?? fallbackLocationId;
    return locations.find((location) => location.id === locationId)?.name || "—";
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleCountSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (countSortConfig && countSortConfig.key === key && countSortConfig.direction === 'asc') direction = 'desc';
    setCountSortConfig({ key, direction });
  };


  const paginatedPos = useMemo(() => {
    if (!sortConfig) return products;
    const arr = [...products];
    const { key, direction } = sortConfig;
    const dir = direction === 'asc' ? 1 : -1;
    arr.sort((a: any, b: any) => {
      let va: any, vb: any;
      switch (key) {
        case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break;
        case 'sku': va = (a.sku || '').toLowerCase(); vb = (b.sku || '').toLowerCase(); break;
        case 'location': va = (getProductLocationName(a.id, a.location_id) || '').toLowerCase(); vb = (getProductLocationName(b.id, b.location_id) || '').toLowerCase(); break;
        case 'stock': va = Number(a.stock) || 0; vb = Number(b.stock) || 0; break;
        case 'min_stock': va = Number(a.min_stock) || 0; vb = Number(b.min_stock) || 0; break;
        case 'cost_price': va = Number(a.cost_price) || 0; vb = Number(b.cost_price) || 0; break;
        case 'total_cost': va = (Number(a.stock) || 0) * (Number(a.cost_price) || 0); vb = (Number(b.stock) || 0) * (Number(b.cost_price) || 0); break;
        case 'status': {
          const st = (p: any) => { const s = Number(p.stock) || 0; const m = Number(p.min_stock) || 0; return s === 0 ? 0 : s <= m ? 1 : 2; };
          va = st(a); vb = st(b); break;
        }
        default: va = 0; vb = 0;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [products, sortConfig, locations]);
  const totalPosPages = Math.ceil(totalProductsCount / pageSize);

  const paginatedHist = movements;
  const totalHistPages = Math.ceil(totalMovementsCount / pageSize);

  // Reset page when filters change
  useEffect(() => {
    setPosPage(1);
  }, [search, catFilter, brandFilter, statusFilter, locationFilter, hasRefsFilter]);

  const totals = useMemo(() => {
    let valorCusto = 0, valorVenda = 0, baixo = 0, zerado = 0;
    for (const p of products) {
      const stk = Number(p.stock); const min = Number(p.min_stock);
      valorCusto += stk * Number(p.cost_price);
      valorVenda += stk * Number(p.sale_price);
      if (stk === 0) zerado++;
      else if (stk <= min) baixo++;
    }
    return { valorCusto, valorVenda, baixo, zerado, total: products.length };
  }, [products]);

  const visibility = useValueVisibility("estoque");

  const countItems = countItemsQ.data ?? [];
  

  const allProductsForCountQ = useQuery({
    queryKey: ["all-products-for-count", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid && (!!openCount || !!selectedCount),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const allProductsForCount = allProductsForCountQ.data ?? [];
  const productsForCountReady = !allProductsForCountQ.isLoading && allProductsForCount.length > 0;

  const teamScopedItems = useMemo(() => {
    const teams = teamsQ.data || [];
    let effectiveTeamId = teamFilter;

    // Se não houver filtro manual, tenta encontrar a equipe do usuário logado
    if (!effectiveTeamId && user?.id) {
      const myTeam = teams.find(t => t.members?.includes(user.id));
      if (myTeam) {
        effectiveTeamId = myTeam.id;
      }
    }

    if (!effectiveTeamId) return [];
    // Evita esconder tudo enquanto os produtos ainda carregam
    if (!productsForCountReady) return countItems;
    if (effectiveTeamId === "all") {
      if (countLocationFilter !== "all") {
        return countItems.filter(item => {
          const product = allProductsForCount.find(p => p.id === item.product_id);
          if (!product?.location_id) return false;
          if (product.location_id !== countLocationFilter) return false;
          return true;
        });
      }
      return countItems;
    }
    const team = teams.find(t => t.id === effectiveTeamId);
    const teamLocIds = new Set(team?.locations || []);
    return countItems.filter(item => {
      const product = allProductsForCount.find(p => p.id === item.product_id);
      if (!product?.location_id || !teamLocIds.has(product.location_id)) return false;
      if (countLocationFilter !== "all" && product.location_id !== countLocationFilter) return false;
      return true;
    });
  }, [countItems, teamFilter, teamsQ.data, allProductsForCount, user?.id, productsForCountReady, countLocationFilter]);

  // Efeito para pré-selecionar a equipe do usuário se estiver vazia
  useEffect(() => {
    if (!teamFilter && user?.id && teamsQ.data) {
      const myTeam = teamsQ.data.find(t => t.members?.includes(user.id));
      if (myTeam) setTeamFilter(myTeam.id);
    }
  }, [teamFilter, user?.id, teamsQ.data]);

  // Resetar página de contagem quando filtros mudarem
  useEffect(() => {
    setCountPage(1);
  }, [countSearch, countLocationFilter, teamFilter]);
  useEffect(() => {
    if (!selectedCount?.id || !teamFilter) return;
    const key = `stock_count_transfers:${selectedCount.id}:${teamFilter}`;
    try {
      const items = JSON.parse(localStorage.getItem(key) || "[]") as string[];
      if (items.length > 0) {
        toast.info(
          items.length === 1
            ? `Novo produto transferido para sua equipe: ${items[0]}`
            : `${items.length} novos produtos transferidos para sua equipe`,
          { description: items.length > 1 ? items.join(", ") : undefined, duration: 6000 },
        );
        localStorage.removeItem(key);
      }
    } catch { /* ignore */ }
  }, [selectedCount?.id, teamFilter, countItemsQ.data]);

  const verifiedTotal = teamScopedItems.filter((item) => item.verified).length;
  const teamTotal = teamScopedItems.length;

  const sortedCountItems = useMemo(() => {
    let result = [...countItems];

    if (countSearch) {
      result = result.filter(item => {
        const p: any = allProductsForCount.find((pp) => pp.id === item.product_id) || {};
        const brandName = p.brand_id ? (brands.find((b) => b.id === p.brand_id)?.name || "") : (p.brand || "");
        const catName = p.category_id ? (categories.find((c) => c.id === p.category_id)?.name || "") : "";
        const locName = p.location_id ? (locations.find((l) => l.id === p.location_id)?.name || "") : "";
        const refs = refsMap.get(item.product_id) || "";
        const haystack = [
          item.product_name, item.sku,
          p.name, p.sku, p.alternative_code, p.gtin, p.gtin_tributavel,
          p.description, p.unit, brandName, catName, locName, refs,
        ].filter(Boolean).join(" ");
        return matchSearch(haystack, countSearch);
      });
    }


    const teams = teamsQ.data || [];
    let effectiveTeamId = teamFilter;
    if (!effectiveTeamId && user?.id) {
      const myTeam = teams.find((t) => t.members?.includes(user.id));
      if (myTeam) effectiveTeamId = myTeam.id;
    }
    if (effectiveTeamId && effectiveTeamId !== "all" && productsForCountReady) {
      const team = teams.find((t) => t.id === effectiveTeamId);
      const teamLocIds = new Set(team?.locations || []);
      result = result.filter((item) => {
        const product = allProductsForCount.find((p) => p.id === item.product_id);
        if (!product?.location_id || !teamLocIds.has(product.location_id)) return false;
        if (countLocationFilter !== "all" && product.location_id !== countLocationFilter) return false;
        return true;
      });
    } else if (effectiveTeamId === "all" && productsForCountReady && countLocationFilter !== "all") {
      result = result.filter((item) => {
        const product = allProductsForCount.find((p) => p.id === item.product_id);
        if (!product?.location_id) return false;
        if (product.location_id !== countLocationFilter) return false;
        return true;
      });
    }

    const effectiveSortConfig = countSortConfig || { key: 'product_name', direction: 'asc' };
    
    result.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (effectiveSortConfig.key === "location") {
        aValue = getProductLocationName(a.product_id);
        bValue = getProductLocationName(b.product_id);
      } else if (effectiveSortConfig.key === "sale_price") {
        const prodA = allProductsForCount.find((p) => p.id === a.product_id);
        const prodB = allProductsForCount.find((p) => p.id === b.product_id);
        aValue = Number(prodA?.sale_price || 0);
        bValue = Number(prodB?.sale_price || 0);
      } else {
        aValue = a[effectiveSortConfig.key as keyof typeof a];
        bValue = b[effectiveSortConfig.key as keyof typeof b];
      }

      if (aValue === null || aValue === undefined) aValue = "";
      if (bValue === null || bValue === undefined) bValue = "";

      const compareResult = (valA: any, valB: any) => {
        if (typeof valA === "string" && typeof valB === "string") {
          return compareProductNames(valA, valB);
        }
        if (valA < valB) return -1;
        if (valA > valB) return 1;
        return 0;
      };

      const mainCompare = compareResult(aValue, bValue);
      if (mainCompare !== 0) {
        return effectiveSortConfig.direction === "asc" ? mainCompare : -mainCompare;
      }

      // Desempate por nome do produto
      return compareProductNames(a.product_name, b.product_name);
    });

    return result;
  }, [countItems, countSortConfig, allProductsForCount, locations, countSearch, teamFilter, teamsQ.data, user?.id, productsForCountReady, countLocationFilter, brands, categories, refsMap]);

  const countPageSize = 50;
  const totalCountPages = Math.ceil(sortedCountItems.length / countPageSize) || 1;
  const paginatedCountItems = sortedCountItems.slice((countPage - 1) * countPageSize, countPage * countPageSize);


  const SortableCountHead = ({ sortKey, children, className }: { sortKey: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={cn("cursor-pointer hover:bg-muted/50 transition-colors group select-none", className)} onClick={() => handleCountSort(sortKey)}>
      <div className={cn("flex items-center gap-1", className?.includes("text-right") && "justify-end")}>{children}<ArrowDownUp className={cn("size-3", countSortConfig?.key === sortKey ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
    </TableHead>
  );

  const sortForPrint = (items: typeof sortedCountItems, by: "name" | "location") => {
    const arr = [...items];
    if (by === "location") {
      arr.sort((a, b) => {
        const la = getProductLocationName(a.product_id) || "";
        const lb = getProductLocationName(b.product_id) || "";
        const cmp = compareProductNames(la, lb);
        return cmp !== 0 ? cmp : compareProductNames(a.product_name, b.product_name);
      });
    } else {
      arr.sort((a, b) => compareProductNames(a.product_name, b.product_name));
    }
    return arr;
  };

  const exportCountPdf = (orderBy: "name" | "location" = "name") => {
    if (!selectedCount || !countItems.length) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Contagem de estoque", 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Data: ${new Date(`${selectedCount.count_date}T00:00:00`).toLocaleDateString("pt-BR")}`, pageWidth - 14, y, { align: "right" });
    y += 5;
    doc.setFontSize(8);
    doc.text(`Ordenação: ${orderBy === "location" ? "Localização" : "Nome"}`, 14, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Check", 14, y);
    doc.text("SKU", 30, y);
    doc.text("Produto", 50, y);
    doc.text("Local", 116, y);
    doc.text("UN", 152, y);
    doc.text("Qtd.", 172, y, { align: "right" });
    doc.text("Contado", 196, y, { align: "right" });
    y += 4;
    doc.line(14, y, 200, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const items = sortForPrint(sortedCountItems, orderBy);
    items.forEach((item) => {
      if (y > 280) {
        doc.addPage();
        y = 16;
      }
      const locationName = getProductLocationName(item.product_id);
      doc.rect(15, y - 3.5, 4, 4);
      doc.text(item.sku.slice(0, 14), 30, y);
      doc.text(doc.splitTextToSize(item.product_name, 62)[0], 50, y);
      doc.text(doc.splitTextToSize(locationName, 32)[0], 116, y);
      doc.text(String(item.unit || "UN").slice(0, 6), 152, y);
      doc.text(`${Number(item.expected_quantity)}`, 172, y, { align: "right" });
      doc.line(178, y + 1, 200, y + 1);
      y += 7;
    });
    doc.save(`contagem-estoque-${selectedCount.count_date}.pdf`);
  };

  // Modo conferência por código (leitor de código de barras / digitação)
  const handlePrintPosition = () => {
    const dataToPrint = products;
    const totalCusto = dataToPrint.reduce((s, p) => s + Number(p.cost_price) * Number(p.stock), 0);
    const totalVenda = dataToPrint.reduce((s, p) => s + Number(p.sale_price) * Number(p.stock), 0);
    
    printList({
      title: "Posição de Estoque",
      subtitle: search ? `Filtro: "${search}"` : undefined,
      columns: [
        { header: "SKU", accessor: (p: Product) => p.sku, width: "12%" },
        { header: "Produto", accessor: (p: Product) => p.name },
        { header: "Marca", accessor: (p: Product) => brands.find((b) => b.id === p.brand_id)?.name || p.brand || "—", width: "14%" },
        { header: "Local", accessor: (p: Product) => locations.find((l) => l.id === (p as any).location_id)?.name || "—", width: "12%" },
        { header: "Estoque", accessor: (p: Product) => `${Number(p.stock)} ${p.unit}`, align: "right" as const, width: "10%" },
        ...(visibility.hidden ? [] : [
          { header: "Custo", accessor: (p: Product) => brl(Number(p.cost_price)), align: "right" as const, width: "10%" },
          { header: "Subtotal", accessor: (p: Product) => brl(Number(p.cost_price) * Number(p.stock)), align: "right" as const, width: "12%" },
        ]),
      ],
      rows: dataToPrint,
      summary: visibility.hidden ? [] : [
        { label: "Valor de Custo", value: brl(totalCusto) },
        { label: "Valor de Venda", value: brl(totalVenda) },
      ],
    });
  };

  const handlePrintHistory = () => {
    printList({
      title: "Histórico de Movimentações de Estoque",
      columns: [
        { header: "Data", accessor: (m: any) => dt(m.created_at) },
        { header: "Produto", accessor: (m: any) => products.find((p) => p.id === m.product_id)?.name ?? "—" },
        { header: "Tipo", accessor: (m: any) => m.type },
        { header: "Qtd", accessor: (m: any) => String(m.quantity), align: "right" },
        { header: "Motivo", accessor: (m: any) => m.reason ?? "—" },
      ],
      rows: movements,
    });
  };

  const handlePrintCount = (orderBy: "name" | "location" = "name") => {
    if (!selectedCount) return;
    const dataToPrint = sortForPrint(sortedCountItems, orderBy);
    const verifiedCount = dataToPrint.filter((i) => i.verified).length;

    printList({
      title: "Contagem de Estoque",
      subtitle: `Data: ${new Date(`${selectedCount.count_date}T00:00:00`).toLocaleDateString("pt-BR")} · Status: ${selectedCount.status} · Ordenado por: ${orderBy === "location" ? "Localização" : "Nome"}`,
      columns: [
        { header: "✓", accessor: (i: any) => (i.verified ? "Sim" : ""), width: "6%", align: "center" },
        { header: "Código", accessor: (i: any) => i.sku, width: "14%" },
        { header: "Produto", accessor: (i: any) => i.product_name },
        { header: "Local", accessor: (i: any) => getProductLocationName(i.product_id), width: "16%" },
        { header: "UN", accessor: (i: any) => i.unit, width: "6%", align: "center" },
        { header: "Esperado", accessor: (i: any) => String(Number(i.expected_quantity)), align: "right", width: "10%" },
        { header: "Contado", accessor: () => "", align: "right", width: "12%" },
      ],
      rows: dataToPrint,
      summary: [
        { label: "Itens", value: String(dataToPrint.length) },
        { label: "Verificados", value: `${verifiedCount} (${dataToPrint.length ? Math.round((verifiedCount / dataToPrint.length) * 100) : 0}%)` },
      ],
    });
  };

  const openPrintOrderDialog = (target: "pdf" | "print") => {
    setPrintOrderTarget(target);
    setPrintOrderBy("name");
    setPrintOrderOpen(true);
  };

  const handleConfirmPrintOrder = () => {
    const target = printOrderTarget;
    const order = printOrderBy;
    setPrintOrderOpen(false);
    setPrintOrderTarget(null);
    if (target === "pdf") exportCountPdf(order);
    else if (target === "print") handlePrintCount(order);
  };

  const handleScanLookup = (raw: string) => {
    const code = (raw || "").trim().toUpperCase();
    if (!code) return;
    setScanError(null);
    if (!selectedCount) {
      setScanError("Selecione uma contagem primeiro.");
      return;
    }
    const product = products.find((p) =>
      (p.sku || "").toUpperCase() === code ||
      (p.alternative_code || "").toUpperCase() === code,
    );
    let item = product
      ? countItems.find((it) => it.product_id === product.id)
      : countItems.find((it) => (it.sku || "").toUpperCase() === code);
    if (!item) {
      setScanFound(null);
      setScanError(`Código "${code}" não encontrado nesta contagem.`);
      return;
    }
    setScanFound({
      item: {
        id: item.id,
        product_name: item.product_name,
        sku: item.sku,
        unit: item.unit,
        expected_quantity: Number(item.expected_quantity),
        verified: item.verified,
      },
      locationName: getProductLocationName(item.product_id),
    });
    setEditQuantity(item.expected_quantity.toString());

  };

  const confirmScanItem = () => {
    if (!scanFound) return;
    const qty = parseFloat(editQuantity);
    verifyItemMut.mutate(
      { id: scanFound.item.id, verified: true, expected_quantity: isNaN(qty) ? undefined : qty },
      {
        onSuccess: () => {
          toast.success(`${scanFound.item.product_name} conferido.`);
          setScanFound(null);
          setScanInput("");
          setScanError(null);
          setTimeout(() => scanInputRef.current?.focus(), 50);
        },
      },
    );
  };

  const skipScanItem = () => {
    setScanFound(null);
    setScanInput("");
    setScanError(null);
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  React.useEffect(() => {
    if (scanModeOpen) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [scanModeOpen]);

  const checkOverlap = (id: string, x: number, y: number, w: number, h: number, allLocations: any[]) => {
    return allLocations.some(loc => {
      if (loc.id === id) return false;
      const lx = loc.pos_x || 0;
      const ly = loc.pos_y || 0;
      const lw = loc.area_width || 3;
      const lh = loc.area_height || 2;
      return x < lx + lw && x + w > lx && y < ly + lh && y + h > ly;
    });
  };

  const processedLocations = useMemo(() => {
    const base = locations.map((loc, idx) => {
      const l = loc as any;
      const hasCoords = l.pos_x !== undefined && l.pos_x !== null && 
                       (l.pos_x !== 0 || (l.pos_y !== 0 && l.pos_y !== undefined && l.pos_y !== null));
      
      let posX = l.pos_x || 0;
      let posY = l.pos_y || 0;
      
      if (!hasCoords && idx > 0) {
        posX = (idx % 8) * 4;
        posY = Math.floor(idx / 8) * 3;
      }
      
      return {
        ...loc,
        pos_x: posX,
        pos_y: posY,
        area_width: l.area_width || 3,
        area_height: l.area_height || 2,
        is_vertical: !!l.is_vertical
      } as any;
    });

    return base.map(loc => ({
      ...loc,
      is_overlapping: checkOverlap(loc.id, loc.pos_x, loc.pos_y, loc.area_width, loc.area_height, base)
    }));
  }, [locations]);

  const handleReorganize = async () => {
    try {
      const promises = locations.map((loc, idx) => {
        const posX = (idx % 8) * 4;
        const posY = Math.floor(idx / 8) * 3;
        return updateStockLocation(loc.id, { pos_x: posX, pos_y: posY, area_width: 3, area_height: 2, is_vertical: false });
      });
      await Promise.all(promises);
      qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
      toast.success("Layout reorganizado!");
    } catch (error) {
      console.error("Erro ao reorganizar:", error);
      toast.error("Erro ao reorganizar. Verifique o banco de dados.");
    }
  };

  const handleRotate = async (locId: string) => {
    const loc = processedLocations.find(l => l.id === locId);
    if (!loc) return;
    
    const newIsVertical = !loc.is_vertical;
    const newW = loc.area_height;
    const newH = loc.area_width;

    if (checkOverlap(locId, loc.pos_x, loc.pos_y, newW, newH, processedLocations)) {
      toast.warning("Nota: A rotação resultou em sobreposição.");
    }

    try {
      await updateStockLocation(locId, { 
        is_vertical: newIsVertical,
        area_width: newW,
        area_height: newH
      });
      qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
      toast.success("Localização girada!");
    } catch (error) {
      toast.error("Erro ao girar.");
    }
  };

  const handleResizeMove = (e: React.MouseEvent) => {
    if (!resizingLoc) return;
    const isFreeMove = e.shiftKey;
    const delta = (resizingLoc.type === "width" ? e.clientX : e.clientY) - resizingLoc.startPos;
    const gridDelta = isFreeMove ? (delta / gridSize) : Math.round(delta / gridSize);
    const newVal = Math.max(0.5, resizingLoc.startVal + gridDelta);
    
    setResizingLoc(prev => prev ? { ...prev, currentVal: newVal } : null);

    const loc = processedLocations.find(l => l.id === resizingLoc.id);
    if (!loc) return;
    
    const x = loc.pos_x || 0;
    const y = loc.pos_y || 0;
    const w = resizingLoc.type === "width" ? newVal : (loc.area_width || 3);
    const h = resizingLoc.type === "height" ? newVal : (loc.area_height || 2);

    const isValid = !checkOverlap(loc.id, x, y, w, h, processedLocations);
    setDragPreview({ id: loc.id, x, y, w, h, isValid });
  };

  const handleResizeEnd = async () => {
    if (!resizingLoc) return;
    const locId = resizingLoc.id;
    const type = resizingLoc.type;
    const value = resizingLoc.currentVal;

    setResizingLoc(null);
    setDragPreview(null);

    const loc = processedLocations.find(l => l.id === locId);
    if (!loc) return;

    const x = loc.pos_x;
    const y = loc.pos_y;
    const w = type === "width" ? value : loc.area_width;
    const h = type === "height" ? value : loc.area_height;

    // Soft validation: alert but allow? Or block?
    // The user said "movimentação deve ser mais livre", so let's allow it but warn.
    const hasOverlap = checkOverlap(locId, x, y, w, h, processedLocations);
    if (hasOverlap) {
      toast.warning("Nota: Há uma sobreposição nesta posição.");
    }

    try {
      await updateStockLocation(locId, { [type === "width" ? "area_width" : "area_height"]: value });
      qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
    } catch (err) {
      console.error("Erro ao redimensionar:", err);
      toast.error("Erro ao salvar dimensões.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading icon={Boxes} title="Controle de Estoque" subtitle="Posição de estoque, movimentações e indicadores" />
        <div className="flex items-center gap-2">
          <ValueVisibilityToggle
            hidden={visibility.hidden}
            canToggle={visibility.canToggle}
            onToggle={visibility.toggle}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Itens cadastrados</div>
              <div className="text-2xl font-bold">{totalProductsCount}</div>
            </div>
            <Boxes className="size-8 text-brand-orange/70" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Valor em estoque (custo)</div>
              <div className="text-2xl font-bold">{visibility.mask(brl(totals.valorCusto))}</div>
            </div>
            <Package className="size-8 text-muted-foreground/60" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Valor potencial (venda)</div>
              <div className="text-2xl font-bold">{visibility.mask(brl(totals.valorVenda))}</div>
            </div>
            <TrendingUp className="size-8 text-success/70" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Alertas</div>
              <div className="text-2xl font-bold text-brand-red">{totals.baixo + totals.zerado}</div>
              <div className="text-[11px] text-muted-foreground">{totals.zerado} zerados · {totals.baixo} baixos</div>
            </div>
            <AlertTriangle className="size-8 text-brand-red/70" />
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border border-border h-auto flex-wrap justify-start">
          <TabsTrigger value="posicao">Posição de estoque</TabsTrigger>
          <TabsTrigger value="historico">Histórico de movimentações</TabsTrigger>
          <TabsTrigger value="contagem">Contagem</TabsTrigger>
          <TabsTrigger value="mapa">Mapa 2D</TabsTrigger>
        </TabsList>

        <TabsContent value="mapa" className="space-y-4" onMouseMove={handleResizeMove} onMouseUp={handleResizeEnd}>
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
              <div>
                <h3 className="text-lg font-semibold">Mapa Visual do Estoque</h3>
                <p className="text-sm text-muted-foreground">Arraste para mover, redimensione pelas bordas</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-md border">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7" 
                    onClick={() => setGridSize(prev => Math.max(20, prev - 10))}
                    disabled={gridSize <= 20}
                    title="Diminuir Zoom (-)"
                  >
                    <ZoomOut className="size-3.5" />
                  </Button>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Grid</span>
                    <Select value={String(gridSize)} onValueChange={(v) => setGridSize(Number(v))}>
                      <SelectTrigger className="h-7 w-16 text-[10px] border-none bg-transparent focus:ring-0 px-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="20">20px</SelectItem>
                        <SelectItem value="30">30px</SelectItem>
                        <SelectItem value="40">40px</SelectItem>
                        <SelectItem value="50">50px</SelectItem>
                        <SelectItem value="60">60px</SelectItem>
                        <SelectItem value="70">70px</SelectItem>
                        <SelectItem value="80">80px</SelectItem>
                        <SelectItem value="100">100px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7" 
                    onClick={() => setGridSize(prev => Math.min(100, prev + 10))}
                    disabled={gridSize >= 100}
                    title="Aumentar Zoom (+)"
                  >
                    <ZoomIn className="size-3.5" />
                  </Button>
                  <div className="w-px h-4 bg-border mx-1" />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7" 
                    onClick={() => setGridSize(50)}
                    title="Redefinir Zoom"
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="size-3 rounded-sm bg-muted border" />
                    <span>Vazio</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="size-3 rounded-sm bg-blue-100 border border-blue-200" />
                    <span>Com Estoque</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="size-3 rounded-sm bg-brand-orange/20 border border-brand-orange/30" />
                    <span>Estoque Baixo</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleReorganize} className="gap-2 h-8 text-xs">
                  <LayoutGrid className="size-3.5" />
                  Redefinir Layout
                </Button>
              </div>
            </div>

            <div 
              ref={gridContainerRef}
              className={cn(
                "relative overflow-auto border rounded-lg bg-muted/10 p-8 min-h-[600px] select-none",
                isPanning ? "cursor-grabbing" : "cursor-default"
              )}
              style={{
                backgroundImage: `radial-gradient(circle, #ccc 1px, transparent 1px)`,
                backgroundSize: `${gridSize}px ${gridSize}px`
              }}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedLocIds([]);
                  // Iniciar panning apenas se clicar no fundo do container
                  setIsPanning(true);
                  setPanStart({
                    x: e.clientX,
                    y: e.clientY,
                    scrollLeft: e.currentTarget.scrollLeft,
                    scrollTop: e.currentTarget.scrollTop
                  });
                }
              }}
              onMouseMove={(e) => {
                if (!isPanning || !gridContainerRef.current) return;
                
                const dx = e.clientX - panStart.x;
                const dy = e.clientY - panStart.y;
                
                gridContainerRef.current.scrollLeft = panStart.scrollLeft - dx;
                gridContainerRef.current.scrollTop = panStart.scrollTop - dy;
              }}
              onMouseUp={() => setIsPanning(false)}
              onMouseLeave={() => setIsPanning(false)}
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  if (e.deltaY < 0) {
                    setGridSize(prev => Math.min(100, prev + 10));
                  } else {
                    setGridSize(prev => Math.max(20, prev - 10));
                  }
                }
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setSelectedLocIds([]);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const idsString = e.dataTransfer.getData("locIds") || e.dataTransfer.getData("locId");
                if (!idsString) return;
                
                const ids = idsString.split(",");
                const rect = e.currentTarget.getBoundingClientRect();
                const scrollLeft = e.currentTarget.scrollLeft;
                const scrollTop = e.currentTarget.scrollTop;
                const isFreeMove = e.shiftKey;
                
                const mainId = ids[0];
                const mainLoc = processedLocations.find(l => l.id === mainId);
                if (!mainLoc) return;

                const rawMainX = (e.clientX - rect.left + scrollLeft - dragOffset.x) / gridSize;
                const rawMainY = (e.clientY - rect.top + scrollTop - dragOffset.y) / gridSize;
                
                const mainX = isFreeMove ? rawMainX : Math.round(rawMainX);
                const mainY = isFreeMove ? rawMainY : Math.round(rawMainY);

                const dx = mainX - (mainLoc.pos_x || 0);
                const dy = mainY - (mainLoc.pos_y || 0);

                const previews = ids.map(id => {
                  const loc = processedLocations.find(l => l.id === id);
                  if (!loc) return null;
                  const x = (loc.pos_x || 0) + dx;
                  const y = (loc.pos_y || 0) + dy;
                  const w = loc.area_width || 3;
                  const h = loc.area_height || 2;
                  return { id, x, y, w, h };
                }).filter(Boolean) as any[];

                const allValid = previews.every(p => !checkOverlap(p.id, p.x, p.y, p.w, p.h, processedLocations.filter(l => !ids.includes(l.id))));
                
                setDragPreview({ 
                  id: mainId, 
                  x: mainX, 
                  y: mainY, 
                  w: mainLoc.area_width || 3, 
                  h: mainLoc.area_height || 2, 
                  isValid: allValid,
                  multiple: previews
                });
              }}
              onDrop={(e) => {
                e.preventDefault();
                const idsString = e.dataTransfer.getData("locIds") || e.dataTransfer.getData("locId");
                if (!idsString) return;
                
                const ids = idsString.split(",");
                const rect = e.currentTarget.getBoundingClientRect();
                const scrollLeft = e.currentTarget.scrollLeft;
                const scrollTop = e.currentTarget.scrollTop;
                const isFreeMove = e.shiftKey;

                const mainId = ids[0];
                const mainLoc = processedLocations.find(l => l.id === mainId);
                if (!mainLoc) return;

                const rawMainX = (e.clientX - rect.left + scrollLeft - dragOffset.x) / gridSize;
                const rawMainY = (e.clientY - rect.top + scrollTop - dragOffset.y) / gridSize;
                
                const mainX = isFreeMove ? rawMainX : Math.round(rawMainX);
                const mainY = isFreeMove ? rawMainY : Math.round(rawMainY);

                const dx = mainX - (mainLoc.pos_x || 0);
                const dy = mainY - (mainLoc.pos_y || 0);

                setDragPreview(null);

                let hasOverlap = false;
                const updates = ids.map(id => {
                  const loc = processedLocations.find(l => l.id === id);
                  if (!loc) return null;
                  const x = (loc.pos_x || 0) + dx;
                  const y = (loc.pos_y || 0) + dy;
                  
                  if (checkOverlap(id, x, y, loc.area_width || 3, loc.area_height || 2, processedLocations.filter(l => !ids.includes(l.id)))) {
                    hasOverlap = true;
                  }
                  
                  return updateStockLocation(id, { pos_x: x, pos_y: y });
                }).filter(Boolean);

                if (hasOverlap) {
                  toast.warning("Nota: Algumas localizações ficaram sobrepostas.");
                }
                
                Promise.all(updates)
                  .then(() => {
                    qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
                  })
                  .catch(err => {
                    console.error("Erro ao mover:", err);
                    toast.error("Erro ao salvar posições.");
                  });
              }}
              onDragLeave={() => setDragPreview(null)}
              onDragEnd={() => setDragPreview(null)}
            >
              {/* Preview Outlines */}
              {dragPreview && (dragPreview.multiple || [dragPreview]).map(p => (
                <div 
                  key={`preview-${p.id}`}
                  className={cn(
                    "absolute border-2 z-50 pointer-events-none rounded-md transition-all duration-75",
                    dragPreview.isValid ? "border-brand-green bg-brand-green/20" : "border-brand-red bg-brand-red/20",
                    resizingLoc && "transition-none border-brand-orange bg-brand-orange/10 border-dashed"
                  )}
                  style={{
                    left: `${p.x * gridSize}px`,
                    top: `${p.y * gridSize}px`,
                    width: `${p.w * gridSize}px`,
                    height: `${p.h * gridSize}px`
                  }}
                />
              ))}
              {locations.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground italic">
                  Nenhuma localização configurada.
                </div>
              ) : (
                processedLocations.map((loc) => {
                  const locProducts = (allProductsQ.data?.data ?? []).filter(p => (p as any).location_id === loc.id);
                  const hasStock = locProducts.length > 0;
                  const hasLowStock = locProducts.some(p => Number(p.stock) <= Number(p.min_stock) && Number(p.stock) > 0);
                  const isEmpty = !hasStock;

                  const posX = loc.pos_x || 0;
                  const posY = loc.pos_y || 0;
                  const areaW = loc.area_width || 3;
                  const areaH = loc.area_height || 2;

                  return (
                    <div
                      key={loc.id}
                      draggable={!resizingLoc}
                      onDragStart={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setDragOffset({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top
                        });
                        
                        // Se o item arrastado já estiver selecionado, movemos toda a seleção.
                        // Caso contrário, movemos apenas ele e o selecionamos.
                        let idsToDrag = [loc.id];
                        if (selectedLocIds.includes(loc.id)) {
                          idsToDrag = selectedLocIds;
                        } else {
                          setSelectedLocIds([loc.id]);
                        }
                        
                        e.dataTransfer.setData("locIds", idsToDrag.join(","));
                        e.dataTransfer.setData("locId", loc.id); // Compatibilidade
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "absolute group rounded-md border p-2 transition-shadow cursor-move hover:ring-2 hover:ring-brand-orange/50 hover:shadow-lg z-10",
                        isEmpty && "bg-background border-dashed",
                        hasStock && "bg-blue-50 border-blue-200",
                        hasLowStock && "bg-brand-orange/5 border-brand-orange/20",
                        loc.is_overlapping && "ring-2 ring-brand-red border-brand-red shadow-[0_0_10px_rgba(239,68,68,0.2)]",
                        selectedLocIds.includes(loc.id) && "ring-2 ring-brand-orange shadow-xl z-20",
                        resizingLoc?.id === loc.id && "ring-2 ring-brand-red shadow-xl z-20 transition-none",
                        resizingLoc?.id === loc.id && "opacity-50 border-dashed"
                      )}
                      style={{
                        left: `${posX * gridSize}px`,
                        top: `${posY * gridSize}px`,
                        width: `${areaW * gridSize}px`,
                        height: `${areaH * gridSize}px`
                      }}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          e.stopPropagation();
                          setSelectedLocIds(prev => 
                            prev.includes(loc.id) ? prev.filter(id => id !== loc.id) : [...prev, loc.id]
                          );
                          return;
                        }
                        
                        setSelectedLocIds([loc.id]);
                        setLocationFilter(loc.id);
                      }}
                    >
                      <div className="flex flex-col h-full justify-between gap-0.5 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate pr-1">
                            {loc.name}
                          </span>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleRotate(loc.id); }}
                              className="p-1 hover:bg-muted rounded-full transition-colors"
                              title="Girar"
                            >
                              <RotateCw className="size-2.5 text-muted-foreground" />
                            </button>
                            <MapPin className="size-2.5 text-muted-foreground opacity-50 shrink-0" />
                          </div>
                        </div>
                        
                        <div className="flex flex-col">
                          <span className="text-lg font-bold leading-tight">
                            {locProducts.length}
                          </span>
                          <span className="text-[8px] text-muted-foreground uppercase">
                            Produtos
                          </span>
                        </div>
                      </div>

                      {/* Resize Handles */}
                      <div 
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-brand-orange/30 group-hover:bg-brand-orange/10 z-20" 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingLoc({ id: loc.id, type: "width", startVal: areaW, startPos: e.clientX, currentVal: areaW });
                        }}
                      />
                      <div 
                        className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-brand-orange/30 group-hover:bg-brand-orange/10 z-20" 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizingLoc({ id: loc.id, type: "height", startVal: areaH, startPos: e.clientY, currentVal: areaH });
                        }}
                      />

                      {/* Hover Preview */}
                      <div className="absolute z-30 invisible group-hover:visible bg-popover text-popover-foreground border rounded shadow-xl p-3 w-48 left-1/2 -translate-x-1/2 top-full mt-2 pointer-events-none">
                        <div className="text-xs font-bold border-bottom pb-1 mb-2 border-b uppercase">{loc.name}</div>
                        <div className="space-y-1.5">
                          {locProducts.slice(0, 5).map(p => (
                            <div key={p.id} className="flex justify-between items-center gap-2 text-[10px]">
                              <span className="truncate">{p.name}</span>
                              <span className="font-bold shrink-0">{Number(p.stock)} {p.unit}</span>
                            </div>
                          ))}
                          {locProducts.length > 5 && (
                            <div className="text-[9px] text-muted-foreground italic pt-1">
                              + {locProducts.length - 5} outros itens...
                            </div>
                          )}
                          {locProducts.length === 0 && (
                            <div className="text-[10px] text-muted-foreground italic">Sem produtos</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="mt-4 p-4 rounded-lg bg-blue-50/50 border border-blue-100/50 flex items-start gap-3">
              <AlertTriangle className="size-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold">Controles Avançados</p>
                <p>• <b>Seleção Múltipla:</b> Segure <b>Ctrl</b> (ou <b>Cmd</b>) e clique para selecionar vários itens.<br/>• <b>Movimentação Livre:</b> Segure <b>Shift</b> enquanto arrasta para ignorar o alinhamento da grade.<br/>• <b>Sobreposição:</b> O sistema permite sobreposições, exibindo um alerta visual nos blocos sobrepostos.</p>

              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="posicao" className="space-y-4">
          <Card className="p-4 space-y-3">

            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <div className="relative">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Pesquisar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase ml-1">Categoria</Label>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas categorias</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase ml-1">Marca</Label>
                <Select value={brandFilter} onValueChange={setBrandFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Marca" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas marcas</SelectItem>
                    {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase ml-1">Localização</Label>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Localização" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas localizações</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase ml-1">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="ok">Ok</SelectItem>
                    <SelectItem value="baixo">Baixo</SelectItem>
                    <SelectItem value="zerado">Zerado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-muted-foreground uppercase ml-1">Extras</Label>
                <div 
                  className="flex items-center gap-2 border rounded-md px-3 h-9 bg-background hover:bg-muted/50 transition-colors cursor-pointer select-none" 
                  onClick={() => setHasRefsFilter(!hasRefsFilter)}
                >
                  <Checkbox id="has-refs-stock" checked={hasRefsFilter} onCheckedChange={(v) => setHasRefsFilter(!!v)} onClick={(e) => e.stopPropagation()} />
                  <Label htmlFor="has-refs-stock" className="text-[10px] cursor-pointer whitespace-nowrap uppercase">Marcas Adicionais</Label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1 bg-muted/20 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-muted-foreground">
                  Exibindo <span className="font-bold text-foreground">{paginatedPos.length}</span> de <span className="font-bold text-foreground">{totalProductsCount}</span> produtos
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase">Itens por página:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-7 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(v => (
                      <SelectItem key={v} value={v.toString()} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="hidden md:block rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">Produto <ArrowDownUp className={cn("size-3", sortConfig?.key === 'name' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('sku')}>
                      <div className="flex items-center gap-1">Código <ArrowDownUp className={cn("size-3", sortConfig?.key === 'sku' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('location')}>
                      <div className="flex items-center gap-1">Localização <ArrowDownUp className={cn("size-3", sortConfig?.key === 'location' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('stock')}>
                      <div className="flex items-center justify-end gap-1">Estoque <ArrowDownUp className={cn("size-3", sortConfig?.key === 'stock' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('min_stock')}>
                      <div className="flex items-center justify-end gap-1">Mínimo <ArrowDownUp className={cn("size-3", sortConfig?.key === 'min_stock' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('status')}>
                      <div className="flex items-center gap-1">Status <ArrowDownUp className={cn("size-3", sortConfig?.key === 'status' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('cost_price')}>
                      <div className="flex items-center justify-end gap-1">Custo unit. <ArrowDownUp className={cn("size-3", sortConfig?.key === 'cost_price' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none" onClick={() => handleSort('total_cost')}>
                      <div className="flex items-center justify-end gap-1">Total custo <ArrowDownUp className={cn("size-3", sortConfig?.key === 'total_cost' ? "opacity-100" : "opacity-0 group-hover:opacity-50")} /></div>
                    </TableHead>
                    <TableHead className="text-right w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPos.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">Nenhum produto.</TableCell></TableRow>
                  ) : paginatedPos.map((p) => {
                    const stk = Number(p.stock); const min = Number(p.min_stock);
                    const status = stk === 0 ? "zerado" : stk <= min ? "baixo" : "ok";
                    const locName = getProductLocationName(p.id, p.location_id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {p.image_url ? (
                              <div 
                                className="size-10 rounded border bg-muted shrink-0 overflow-hidden shadow-sm cursor-pointer"
                                onClick={() => setSelectedImageUrl(p.image_url!)}
                              >
                                <img src={p.image_url} alt={p.name} className="size-full object-cover" />
                              </div>
                            ) : (
                              <div className="size-10 rounded border bg-muted shrink-0 flex items-center justify-center text-muted-foreground/20">
                                <Package className="size-5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium truncate max-w-[200px]">{p.name}</div>
                              <div className="text-xs text-muted-foreground">{(brands.find(b => b.id === p.brand_id)?.name || p.brand || "—").toUpperCase()}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                        <TableCell className="text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {locName}</span></TableCell>
                        <TableCell className="text-right font-semibold">{stk} {p.unit}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{min}</TableCell>
                        <TableCell>
                          {status === "ok" && <Badge variant="outline" className="border-success/40 text-success">Ok</Badge>}
                          {status === "baixo" && <Badge variant="outline" className="border-brand-orange/50 text-brand-orange">Baixo</Badge>}
                          {status === "zerado" && <Badge variant="outline" className="border-brand-red/50 text-brand-red">Zerado</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{visibility.mask(brl(Number(p.cost_price)))}</TableCell>
                        <TableCell className="text-right font-medium">{visibility.mask(brl(stk * Number(p.cost_price)))}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setDetailsProduct(p)}
                            title="Ver detalhes"
                          >
                            <Eye className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {paginatedPos.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 italic">Nenhum produto.</div>
              ) : paginatedPos.map((p) => {
                const stk = Number(p.stock); const min = Number(p.min_stock);
                const status = stk === 0 ? "zerado" : stk <= min ? "baixo" : "ok";
                return (
                  <Card key={p.id} className="p-4 space-y-3 border-l-4 border-l-brand-orange">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {p.image_url ? (
                          <div 
                            className="size-12 rounded border bg-muted shrink-0 overflow-hidden shadow-sm"
                            onClick={() => setSelectedImageUrl(p.image_url!)}
                          >
                            <img src={p.image_url} alt={p.name} className="size-full object-cover" />
                          </div>
                        ) : (
                          <div className="size-12 rounded border bg-muted shrink-0 flex items-center justify-center text-muted-foreground/20">
                            <Package className="size-6" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-base truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.sku} · {brands.find(b => b.id === p.brand_id)?.name || p.brand || "Sem marca"}</div>
                          <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                            <MapPin className="size-3" /> {getProductLocationName(p.id, p.location_id)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-bold text-base shrink-0">
                        {stk} <span className="text-[10px] font-normal text-muted-foreground uppercase">{p.unit}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-dashed pt-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {status === "ok" && <Badge variant="outline" className="border-success/40 text-success text-[10px] h-5">Ok</Badge>}
                          {status === "baixo" && <Badge variant="outline" className="border-brand-orange/50 text-brand-orange text-[10px] h-5">Baixo</Badge>}
                          {status === "zerado" && <Badge variant="outline" className="border-brand-red/50 text-brand-red text-[10px] h-5">Zerado</Badge>}
                        </div>
                        <div className="text-muted-foreground italic">Custo: {visibility.mask(brl(Number(p.cost_price)))}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Total</div>
                        <div className="font-bold">{visibility.mask(brl(stk * Number(p.cost_price)))}</div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setDetailsProduct(p)}
                    >
                      <Eye className="size-4 mr-2" /> Ver detalhes
                    </Button>
                  </Card>
                );
              })}
            </div>

            {totalPosPages > 1 && (
              <div className="mt-4 border-t pt-4">
                <SmartPagination currentPage={posPage} totalPages={totalPosPages} onPageChange={setPosPage} />
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold inline-flex items-center gap-2"><ArrowDownUp className="size-4" /> Histórico de movimentações</div>
              <PrintButton onClick={handlePrintHistory} />
            </div>

            <div className="hidden md:block rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHist.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Sem movimentações.</TableCell></TableRow>
                  ) : paginatedHist.map((m: any) => {
                    const product = products.find((p: any) => p.id === m.product_id);
                    const Icon = m.type === "entrada" ? ArrowDownLeft : m.type === "saida" ? ArrowUpRight : Settings2;
                    const color = m.type === "entrada" ? "text-success" : m.type === "saida" ? "text-brand-red" : "text-brand-orange";
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{dt(m.created_at)}</TableCell>
                        <TableCell>{product?.name ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 capitalize ${color} font-medium`}>
                            <Icon className="size-4" /> {m.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{m.quantity}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{m.reason}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {paginatedHist.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 italic">Sem movimentações.</div>
              ) : paginatedHist.map((m: any) => {
                const product = products.find((p: any) => p.id === m.product_id);
                const Icon = m.type === "entrada" ? ArrowDownLeft : m.type === "saida" ? ArrowUpRight : Settings2;
                const color = m.type === "entrada" ? "text-success" : m.type === "saida" ? "text-brand-red" : "text-brand-orange";
                return (
                  <Card key={m.id} className={`p-4 space-y-3 border-l-4 ${m.type === "entrada" ? "border-l-success" : m.type === "saida" ? "border-l-brand-red" : "border-l-brand-orange"}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-base line-clamp-1">{product?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                          <Calendar className="size-3" /> {dt(m.created_at)}
                        </div>
                      </div>
                      <div className={`text-right font-bold text-base ${color}`}>
                        {m.type === "entrada" ? "+" : "-"}{m.quantity}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-dashed pt-3">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center gap-1.5 capitalize ${color} font-medium text-[10px]`}>
                          <Icon className="size-3" /> {m.type}
                        </span>
                        <div className="text-muted-foreground italic truncate max-w-[200px]">{m.reason}</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1 bg-muted/20 rounded-lg border border-border/50">
              <div className="flex items-center gap-3">
                <div className="text-[11px] text-muted-foreground">
                  Exibindo <span className="font-bold text-foreground">{paginatedHist.length}</span> de <span className="font-bold text-foreground">{totalMovementsCount}</span> movimentações
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase">Itens por página:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-7 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(v => (
                      <SelectItem key={v} value={v.toString()} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {totalHistPages > 1 && (
              <div className="mt-4 border-t pt-4">
                <SmartPagination currentPage={histPage} totalPages={totalHistPages} onPageChange={setHistPage} />
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="contagem" className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold inline-flex items-center gap-2"><ClipboardCheck className="size-4" /> Contagem de estoque</div>
                {!openCount && (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-muted-foreground italic">
                      Selecione uma data para iniciar uma nova contagem.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!openCount ? (
                  <>
                    <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} className="w-[160px]" />
                    <Button onClick={() => createCountMut.mutate()} disabled={!countDate || createCountMut.isPending || products.length === 0 || !canEditCounts}>
                      {createCountMut.isPending ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          Criando contagem...
                        </>
                      ) : (
                        <>
                          <Plus className="size-4 mr-2" /> Nova contagem
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="default"
                      onClick={() => {
                        if (!selectedCount) {
                          toast.error("Selecione uma contagem antes de iniciar a conferência.");
                          return;
                        }
                        const teams = teamsQ.data || [];
                        if (teams.length === 0) {
                          toast.error("Defina pelo menos uma equipe antes de iniciar a conferência.");
                          setIsTeamModalOpen(true);
                          return;
                        }
                        setScanInput("");
                        setScanFound(null);
                        setScanError(null);
                        setScanModeOpen(true);
                      }}
                      disabled={!selectedCount || countItems.length === 0}
                    >
                      <ScanLine className="size-4 mr-2" /> Modo conferência
                    </Button>
                    <Button variant="outline" onClick={() => openPrintOrderDialog("pdf")} disabled={!selectedCount || countItems.length === 0}>
                      <Download className="size-4 mr-2" /> PDF
                    </Button>
                    <PrintButton
                      label="Imprimir"
                      disabled={!selectedCount || sortedCountItems.length === 0}
                      onClick={() => openPrintOrderDialog("print")}
                    />

                  </div>
                )}
              </div>
            </div>
            {openCount && (
              <div className="flex items-center justify-between bg-muted/50 p-3 rounded-md">
                <div className="text-sm">
                  Contagem aberta em: <span className="font-bold">{new Date(`${openCount.count_date}T00:00:00`).toLocaleDateString("pt-BR")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setSelectedCount(openCount); setIsChartsOpen(true); }}>
                    <BarChart3 className="size-4 mr-2" /> Gráficos
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedCount(openCount); setIsTeamModalOpen(true); }}>
                    <Users className="size-4 mr-2" /> {isAdminUser ? "Gerenciar Equipes" : "Minha Equipe"}
                  </Button>
                </div>
              </div>
            )}




            <div className="space-y-3">
              <div className="rounded-md border divide-y overflow-hidden">
                {counts.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">Nenhuma contagem criada.</div>
                ) : counts.map((count) => {
                  const isExpanded = expandedCountId === count.id;
                  const isSelected = selectedCount?.id === count.id;
                  return (
                    <div key={count.id}>
                      <div className={cn("flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-muted/50 transition-colors", isSelected && "bg-muted")}>
                        <button type="button" onClick={() => { setSelectedCount(count); setExpandedCountId(isExpanded ? null : count.id); }} className="flex min-w-0 items-center gap-2 text-left">
                          <ChevronDown className={cn("size-4 shrink-0 transition-transform", isExpanded && "rotate-180")} />
                          <span className="min-w-0">
                            <span className="block font-medium">{new Date(`${count.count_date}T00:00:00`).toLocaleDateString("pt-BR")}</span>
                            <span className="block text-xs text-muted-foreground capitalize">{count.status}</span>
                          </span>
                        </button>
                        <div className="flex items-center gap-2">
                          {count.status === "aberta" && (teamsQ.data || []).length > 0 && (() => {
                            const teams = teamsQ.data || [];
                            const allTeamsDone = teams.every(t => t.status === "concluida");
                            
                            // Check if all items belonging to any team location are verified
                            const teamLocationIds = new Set(teams.flatMap(t => t.locations || []));
                            const relevantItems = countItems.filter(item => {
                              const product = allProductsForCount.find(p => p.id === item.product_id);
                              return product && teamLocationIds.has(product.location_id || "");
                            });
                            const allItemsVerified = relevantItems.length > 0 && relevantItems.every(i => i.verified);

                            // Todas as localizações devem estar associadas a alguma equipe
                            const allLocationsAssigned = locations.length > 0 && locations.every(l => teamLocationIds.has(l.id));

                            const canFinish = allItemsVerified && allLocationsAssigned;
                            const finishHint = !allLocationsAssigned
                              ? "Associe todas as localizações a alguma equipe antes de finalizar"
                              : !allItemsVerified
                              ? "Todos os produtos das equipes devem estar 100% contados"
                              : !allTeamsDone
                              ? "Dica: você pode finalizar mesmo com equipes ainda abertas, pois todos os itens já foram verificados"
                              : undefined;

                            return (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                disabled={finishCountMut.isPending || !canFinish}
                                title={finishHint}
                                onClick={() => setFinishingCountId(count.id)}
                              >
                                {finishCountMut.isPending && finishingCountId === count.id ? (
                                  <>
                                    <Loader2 className="size-4 mr-2 animate-spin" />
                                    Finalizando...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="size-4 mr-2" /> Finalizar Contagem Geral
                                  </>
                                )}
                              </Button>
                            );
                          })()}


                          {count.status === "concluida" ? (
                            <span className="inline-flex size-8 items-center justify-center rounded-md text-green-600" title="Contagem finalizada">
                              <Check className="size-4" />
                            </span>
                          ) : (
                            canEditCounts && <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={async () => { if (await confirm({ title: "Excluir contagem?", description: "Esta ação não pode ser desfeita.", confirmLabel: "Excluir", variant: "destructive" })) deleteCountMut.mutate(count.id); }} disabled={deleteCountMut.isPending} title="Excluir contagem">{deleteCountMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}</Button>
                          )}
                        </div>

                      </div>
                      {isExpanded && isSelected && (
                        <div className="border-t overflow-hidden p-0">
                          {(teamsQ.data || []).length > 0 && (
                          <div className="grid gap-3 p-3 md:grid-cols-3 border-b bg-muted/20">
                            <div className="relative">
                              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                              <Input 
                                placeholder="Pesquisar…" 
                                value={countSearch} 
                                onChange={(e) => setCountSearch(e.target.value)} 
                                className="pl-9 h-9 text-sm" 
                              />
                            </div>

                      
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Select value={teamFilter} onValueChange={(v) => { setTeamFilter(v); setCountLocationFilter("all"); setCountPage(1); }}>
                            <SelectTrigger className="h-9 text-sm w-full">
                              <SelectValue placeholder="Selecione sua Equipe" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Ver todos</SelectItem>
                              {(teamsQ.data || []).map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        
                        {canEditCounts && (
                          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => { setSelectedCount(count); setIsTeamModalOpen(true); }} title="Gerenciar Equipes">
                            <Settings2 className="size-4" />
                          </Button>
                        )}
                      </div>

                      {teamFilter && (() => {
                        const team = (teamsQ.data || []).find(t => t.id === teamFilter);
                        const teamLocs = (team?.locations || [])
                          .map(id => locations.find(l => l.id === id))
                          .filter((l): l is NonNullable<typeof l> => !!l);
                        if (teamLocs.length === 0) return null;
                        return (
                          <Select value={countLocationFilter} onValueChange={setCountLocationFilter}>
                            <SelectTrigger className="h-9 text-sm w-full">
                              <SelectValue placeholder="Localização" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas as localizações ({teamLocs.length})</SelectItem>
                              {[...teamLocs].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(l => (
                                 <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                               ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}


                    </div>
                    )}


                    {teamFilter && (teamsQ.data || []).length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="font-medium">{verifiedTotal} de {teamTotal} verificados</div>
                          {teamFilter && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 bg-background px-2 py-0.5 rounded border">
                              <Users className="size-3" /> 
                              Equipe: {(teamsQ.data || []).find(t => t.id === teamFilter)?.name}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>Exibindo {paginatedCountItems.length} de {sortedCountItems.length} produtos</span>
                          <Badge variant="outline" className="h-5">{(() => {
                            if (!teamTotal) return 0;
                            if (verifiedTotal >= teamTotal) return 100;
                            const pct = (verifiedTotal / teamTotal) * 100;
                            return Math.min(99, Math.floor(pct));
                          })()}% concluído</Badge>
                          {bulkVerifyEnabled && bulkSelectedIds.size > 0 && count.status === "aberta" && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={bulkVerifyMut.isPending}
                              onClick={async () => {
                                const ids = sortedCountItems
                                  .filter((it) => bulkSelectedIds.has(it.id) && !it.verified)
                                  .map((it) => it.id);
                                if (ids.length === 0) {
                                  toast.info("Os itens selecionados já estão verificados.");
                                  return;
                                }
                                const ok = await confirm({
                                  title: `Marcar ${ids.length} ${ids.length === 1 ? "item" : "itens"} como verificado(s)?`,
                                  description: "A quantidade e o valor NÃO serão alterados. Todos os registros selecionados serão apenas marcados como verificados.",
                                  confirmLabel: "Marcar como verificados",
                                  variant: "default",
                                });
                                if (ok) bulkVerifyMut.mutate(ids);
                              }}
                            >
                              {bulkVerifyMut.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : <CheckCircle2 className="size-4 mr-1" />}
                              Verificar selecionados ({bulkSelectedIds.size})
                            </Button>
                          )}
                        </div>
                      </div>
                    )}



                    {!teamFilter || (teamsQ.data || []).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-4 bg-muted/20 rounded-b-md">
                        <Users className="size-12 text-muted-foreground/30" />
                        <div className="space-y-1">
                          <h3 className="font-medium text-lg">
                            {(teamsQ.data || []).length === 0 ? "Defina uma equipe para começar" : "Selecione uma equipe"}
                          </h3>
                          <p className="text-sm text-muted-foreground max-w-xs">
                            {(teamsQ.data || []).length === 0 
                              ? "Para listar os produtos e iniciar a contagem, primeiro crie uma equipe e atribua as localizações." 
                              : "Escolha a equipe responsável para visualizar e contar os produtos das localizações atribuídas."}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {(teamsQ.data || []).length > 0 ? (
                            <Select value={teamFilter} onValueChange={setTeamFilter}>
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Escolher Equipe" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Ver Tudo (Administrador)</SelectItem>
                                {(teamsQ.data || []).map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Button onClick={() => { if (openCount) setSelectedCount(openCount); setIsTeamModalOpen(true); }}>
                              <Plus className="size-4 mr-2" /> Criar Equipe e Definir Locais
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (

                      <Table>
                        <TableHeader>
                          <TableRow>
                            {bulkVerifyEnabled && (
                              <TableHead className="w-[40px]">
                                {(() => {
                                  const selectable = sortedCountItems.filter((it) => !it.verified);
                                  const allSelected = selectable.length > 0 && selectable.every((it) => bulkSelectedIds.has(it.id));
                                  return (
                                    <Checkbox
                                      checked={allSelected}
                                      disabled={selectable.length === 0 || count.status !== "aberta"}
                                      onCheckedChange={(checked) => {
                                        setBulkSelectedIds((prev) => {
                                          const next = new Set(prev);
                                          if (checked === true) {
                                            selectable.forEach((it) => next.add(it.id));
                                          } else {
                                            selectable.forEach((it) => next.delete(it.id));
                                          }
                                          return next;
                                        });
                                      }}
                                      aria-label="Selecionar todos pendentes"
                                    />
                                  );
                                })()}
                              </TableHead>
                            )}
                            <SortableCountHead sortKey="verified" className="w-[64px]">Check</SortableCountHead>
                            <SortableCountHead sortKey="verified">Status</SortableCountHead>
                            <SortableCountHead sortKey="product_name">Produto</SortableCountHead>
                            <SortableCountHead sortKey="location" className="hidden md:table-cell">Localização</SortableCountHead>
                            <SortableCountHead sortKey="sku" className="hidden md:table-cell">Código</SortableCountHead>
                            <SortableCountHead sortKey="sale_price" className="hidden md:table-cell text-right">Valor</SortableCountHead>
                            <SortableCountHead sortKey="verified_at" className="hidden lg:table-cell">Verificado em</SortableCountHead>
                            <SortableCountHead sortKey="expected_quantity" className="text-right">Estoque</SortableCountHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(!productsForCountReady || countItemsQ.isLoading) ? (
                            <TableRow>
                              <TableCell colSpan={bulkVerifyEnabled ? 9 : 8} className="text-center py-10 text-muted-foreground">
                                <div className="flex items-center justify-center gap-2">
                                  <Loader2 className="size-4 animate-spin text-brand-orange" />
                                  <span>Carregando produtos da equipe...</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : sortedCountItems.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={bulkVerifyEnabled ? 9 : 8} className="text-center py-10 text-muted-foreground italic">
                                {(teamsQ.data || []).length === 0 ? (
                                  <div className="space-y-3">
                                    <p>Nenhuma equipe definida para esta contagem.</p>
                                    <Button variant="outline" size="sm" onClick={() => { if (openCount) setSelectedCount(openCount); setIsTeamModalOpen(true); }}>
                                      <Users className="size-4 mr-2" /> Definir Equipes
                                    </Button>
                                  </div>
                                ) : (countSearch || teamFilter) ? (
                                  "Nenhum item encontrado com os filtros aplicados."
                                ) : (
                                  "Nenhum item nesta contagem para a equipe selecionada."
                                )}
                              </TableCell>
                            </TableRow>

                          ) : paginatedCountItems.map((item) => (
                            <TableRow key={item.id} data-state={bulkSelectedIds.has(item.id) ? "selected" : undefined}>
                              {bulkVerifyEnabled && (
                                <TableCell>
                                  <Checkbox
                                    checked={bulkSelectedIds.has(item.id)}
                                    disabled={item.verified || count.status !== "aberta"}
                                    onCheckedChange={(checked) => {
                                      setBulkSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (checked === true) next.add(item.id);
                                        else next.delete(item.id);
                                        return next;
                                      });
                                    }}
                                    aria-label="Selecionar item"
                                  />
                                </TableCell>
                              )}
                              <TableCell>
                                <Checkbox 
                                  checked={item.verified} 
                                  disabled={count.status !== "aberta"}
                                  onCheckedChange={(checked) => {
                                    if (count.status !== "aberta") return;
                                    if (checked === true) {
                                      const prod = allProductsForCount.find((p) => p.id === item.product_id);
                                      setConfirmingItem(item);
                                      setEditQuantity(item.expected_quantity.toString());
                                      setEditPrice(prod ? formatCurrency(Number(prod.sale_price || 0)) : "0,00");
                                      setIsConfirmModalOpen(true);
                                    } else {
                                      verifyItemMut.mutate({ id: item.id, verified: false });
                                    }
                                  }} 
                                />
                              </TableCell>
                              <TableCell>
                                {item.verified ? (
                                  <Badge variant="outline" className="border-success/40 text-success">Verificado</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-brand-orange/50 text-brand-orange">Pendente</Badge>
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-1.5">
                                  <span>{item.product_name}</span>
                                  {(() => {
                                    const prod = allProductsForCount.find((p) => p.id === item.product_id);
                                    const brandName = (brands.find((b) => b.id === prod?.brand_id)?.name || prod?.brand || "").trim();
                                    const categoryName = (categories.find((c) => c.id === prod?.category_id)?.name || "").trim();
                                    const locationName = getProductLocationName(item.product_id);
                                    return (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 text-muted-foreground hover:text-brand-orange"
                                            aria-label="Informações do produto"
                                            title="Ver informações completas"
                                          >
                                            <Info className="size-3.5" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent side="right" align="start" className="w-80 text-sm space-y-2">
                                          <div className="font-semibold text-base leading-tight">{item.product_name}</div>
                                          <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-xs">
                                            <span className="text-muted-foreground">SKU</span>
                                            <span className="font-mono">{item.sku || "—"}</span>
                                            <span className="text-muted-foreground">Unidade</span>
                                            <span>{item.unit || "UN"}</span>
                                            <span className="text-muted-foreground">Marca</span>
                                            <span>{brandName || "—"}</span>
                                            <span className="text-muted-foreground">Categoria</span>
                                            <span>{categoryName || "—"}</span>
                                            <span className="text-muted-foreground">Localização</span>
                                            <span>{locationName || "—"}</span>
                                            <span className="text-muted-foreground">Preço custo</span>
                                            <span>{prod ? brl(Number(prod.cost_price || 0)) : "—"}</span>
                                            <span className="text-muted-foreground">Preço venda</span>
                                            <span>{prod ? brl(Number(prod.sale_price || 0)) : "—"}</span>
                                            <span className="text-muted-foreground">Estoque atual</span>
                                            <span>{prod ? `${Number(prod.stock ?? 0)} ${item.unit || "UN"}` : "—"}</span>
                                            <span className="text-muted-foreground">Estoque mínimo</span>
                                            <span>{prod ? `${Number(prod.min_stock ?? 0)} ${item.unit || "UN"}` : "—"}</span>
                                            <span className="text-muted-foreground">Esperado</span>
                                            <span>{Number(item.expected_quantity)} {item.unit || "UN"}</span>
                                          </div>
                                          {prod?.description && (
                                            <div className="pt-1 border-t">
                                              <div className="text-xs text-muted-foreground mb-0.5">Descrição</div>
                                              <div className="text-xs whitespace-pre-wrap">{prod.description}</div>
                                            </div>
                                          )}
                                        </PopoverContent>
                                      </Popover>
                                    );
                                  })()}
                                </div>
                                {(() => {
                                  const prod = allProductsForCount.find((p) => p.id === item.product_id);
                                  const brandName = (brands.find((b) => b.id === prod?.brand_id)?.name || prod?.brand || "").trim();
                                  const extraCount = refsBrandMap.get(item.product_id)?.size ?? 0;
                                  const teamName = teamFilter === "all"
                                    ? (teamsQ.data || []).find(t => (t.locations || []).includes(prod?.location_id || ""))?.name
                                    : null;
                                  if (!brandName && extraCount === 0 && !teamName) return null;
                                  return (
                                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                      {brandName && <span className="uppercase tracking-wide">{brandName}</span>}
                                      {extraCount > 0 && (
                                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-brand-orange/50 text-brand-orange">
                                          +{extraCount} {extraCount === 1 ? "marca" : "marcas"}
                                        </Badge>
                                      )}
                                      {teamName && (
                                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] border-muted-foreground/30 text-muted-foreground font-normal">
                                          <Users className="size-2.5 mr-0.5" /> {teamName}
                                        </Badge>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {getProductLocationName(item.product_id)}</span></TableCell>
                              <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                                <div className="flex flex-col gap-0.5">
                                  <span>{item.sku}</span>
                                  {(() => {
                                    const prod = allProductsForCount.find((p) => p.id === item.product_id);
                                    const stockCode = prod?.alternative_code;
                                    if (!stockCode) return null;
                                    return <span className="text-[10px] text-brand-orange/80">{stockCode}</span>;
                                  })()}
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-right text-sm p-0">
                                {(() => {
                                  const prod = allProductsForCount.find((p) => p.id === item.product_id);
                                  const price = prod ? Number(prod.sale_price || 0) : null;
                                  const hasPrice = price !== null && price > 0;
                                  const label = hasPrice ? brl(price as number) : "Definir";
                                  return (
                                    <Button
                                      variant="ghost"
                                      className={`h-8 px-2 w-full justify-end font-medium hover:bg-brand-orange/10 hover:text-brand-orange ${hasPrice ? "" : "text-brand-orange/80 italic"}`}
                                      onClick={() => {
                                        setConfirmingItem(item);
                                        setEditQuantity(item.expected_quantity.toString());
                                        setEditPrice(prod ? formatCurrency(Number(prod.sale_price || 0)) : "0,00");
                                        setIsConfirmModalOpen(true);
                                      }}
                                    >
                                      {label}
                                    </Button>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{item.verified_at ? dt(item.verified_at) : "—"}</TableCell>
                              <TableCell className="text-right">
                                <Button 
                                  variant="ghost" 
                                  className="h-8 px-2 font-semibold hover:bg-brand-orange/10 hover:text-brand-orange"
                                  onClick={() => {
                                    const prod = allProductsForCount.find((p) => p.id === item.product_id);
                                    setConfirmingItem(item);
                                    setEditQuantity(item.expected_quantity.toString());
                                    setEditPrice(prod ? formatCurrency(Number(prod.sale_price || 0)) : "0,00");
                                    setIsConfirmModalOpen(true);
                                  }}
                                >
                                  {Number(item.expected_quantity)} {item.unit}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {teamFilter && totalCountPages > 1 && (
                      <div className="mt-4 border-t pt-4">
                        <SmartPagination currentPage={countPage} totalPages={totalCountPages} onPageChange={setCountPage} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
        </TabsContent>


        <TabsContent value="historico">
          <Card className="p-4">
            <div className="hidden md:block rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHist.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">Sem movimentações.</TableCell></TableRow>
                  ) : paginatedHist.map((m: any) => {
                    const product = products.find((p: any) => p.id === m.product_id);
                    const Icon = m.type === "entrada" ? ArrowDownLeft : m.type === "saida" ? ArrowUpRight : Settings2;
                    const color = m.type === "entrada" ? "text-success" : m.type === "saida" ? "text-brand-red" : "text-brand-orange";
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{dt(m.created_at)}</TableCell>
                        <TableCell>{product?.name ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 capitalize ${color} font-medium`}>
                            <Icon className="size-4" /> {m.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{m.quantity}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{m.reason}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {paginatedHist.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 italic">Sem movimentações.</div>
              ) : paginatedHist.map((m: any) => {
                const product = products.find((p: any) => p.id === m.product_id);
                const Icon = m.type === "entrada" ? ArrowDownLeft : m.type === "saida" ? ArrowUpRight : Settings2;
                const color = m.type === "entrada" ? "text-success" : m.type === "saida" ? "text-brand-red" : "text-brand-orange";
                return (
                  <Card key={m.id} className={`p-4 space-y-3 border-l-4 ${m.type === "entrada" ? "border-l-success" : m.type === "saida" ? "border-l-brand-red" : "border-l-brand-orange"}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-base line-clamp-1">{product?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground italic flex items-center gap-1">
                          <Calendar className="size-3" /> {dt(m.created_at)}
                        </div>
                      </div>
                      <div className={`text-right font-bold text-base ${color}`}>
                        {m.type === "entrada" ? "+" : "-"}{m.quantity}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-xs border-t border-dashed pt-3">
                      <div className="space-y-1">
                        <span className={`inline-flex items-center gap-1.5 capitalize ${color} font-medium text-[10px]`}>
                          <Icon className="size-3" /> {m.type}
                        </span>
                        <div className="text-muted-foreground italic truncate max-w-[200px]">{m.reason}</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {totalHistPages > 1 && (
              <div className="mt-4 border-t pt-4">
                <SmartPagination currentPage={histPage} totalPages={totalHistPages} onPageChange={setHistPage} />
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Modo Conferência por Código (sobreposto à tela principal de contagem) */}
      <Dialog open={scanModeOpen} onOpenChange={(o) => { if (!o) { setScanModeOpen(false); setScanFound(null); setScanInput(""); setScanError(null); } }}>
        <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2"><ScanLine className="size-5" /> Modo conferência por código</DialogTitle>
            <DialogDescription>
              Aponte o leitor de código de barras ou digite o <strong>SKU/Código</strong> do produto.
              O modal permanece aberto até você fechar.
            </DialogDescription>
          </DialogHeader>

          {selectedCount && (
            <div className="text-xs text-muted-foreground -mt-2">
              Contagem: <span className="font-medium">{new Date(`${selectedCount.count_date}T00:00:00`).toLocaleDateString("pt-BR")}</span>
              {" · "}
              Verificados: <span className="font-medium">{verifiedTotal}/{countItems.length}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScanLookup(scanInput);
            }}
            className="space-y-3"
          >
            <div className="relative">
              <ScanLine className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanInputRef}
                autoFocus
                placeholder="Leia ou digite o código e pressione Enter…"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="pl-9 font-mono text-base h-11"
                disabled={!!scanFound}
              />
            </div>

            {scanError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {scanError}
              </div>
            )}

            {scanFound && (
              <div className={cn(
                "rounded-md border p-4 space-y-3",
                scanFound.item.verified ? "border-success/50 bg-success/5" : "border-brand-orange/50 bg-brand-orange/5",
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-base">{scanFound.item.product_name}</div>
                    <div className="text-xs font-mono text-muted-foreground">{scanFound.item.sku}</div>
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1">
                      <MapPin className="size-3" /> {scanFound.locationName}
                    </div>
                  </div>
                  {scanFound.item.verified ? (
                    <Badge variant="outline" className="border-success/40 text-success">Já conferido</Badge>
                  ) : (
                    <Badge variant="outline" className="border-brand-orange/50 text-brand-orange">Pendente</Badge>
                  )}
                </div>
                <div className="rounded-md bg-background p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-center mb-2">Quantidade Conferida</div>
                  <div className="flex items-center justify-center gap-3">
                    <Input 
                      type="number"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="w-24 text-2xl font-bold text-center h-12"
                    />
                    <span className="text-lg font-medium text-muted-foreground">{scanFound.item.unit}</span>
                  </div>
                  <div className="text-[10px] text-center text-muted-foreground mt-2">Sistema: {scanFound.item.expected_quantity}</div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={skipScanItem}>
                    <X className="size-4 mr-2" /> Cancelar leitura
                  </Button>
                  <Button type="button" className="flex-1" onClick={confirmScanItem} disabled={verifyItemMut.isPending}>
                    <CheckCircle2 className="size-4 mr-2" /> Confirmar conferência
                  </Button>
                </div>
              </div>
            )}
          </form>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setScanModeOpen(false); setScanFound(null); setScanInput(""); setScanError(null); }}>
              Encerrar modo conferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailsProduct} onOpenChange={(o) => !o && setDetailsProduct(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do produto</DialogTitle>
            <DialogDescription>Informações completas e movimentações recentes.</DialogDescription>
          </DialogHeader>
          {detailsProduct && (() => {
            const p = detailsProduct;
            const stk = Number(p.stock); const min = Number(p.min_stock);
            const status = stk === 0 ? "zerado" : stk <= min ? "baixo" : "ok";
            const brandName = (brands.find(b => b.id === p.brand_id)?.name || p.brand || "—").toUpperCase();
            const catName = categories.find(c => c.id === p.category_id)?.name || "—";
            const locName = locations.find(l => l.id === (p as any).location_id)?.name || "—";
            const supName = suppliers.find(s => s.id === (p as any).supplier_id)?.name || "—";
            const cost = Number(p.cost_price); const sale = Number(p.sale_price);
            const margin = cost > 0 ? ((sale - cost) / cost) * 100 : 0;
            const productMovs = movements.filter((m: any) => m.product_id === p.id).slice(0, 8);
            return (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                  <div>
                    <div className="text-lg font-bold">{p.name}</div>
                    <div className="text-xs font-mono text-muted-foreground">SKU: {p.sku}</div>
                  </div>
                  {status === "ok" && <Badge variant="outline" className="border-success/40 text-success">Ok</Badge>}
                  {(status === "baixo" || status === "zerado") && (
                    <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1 border-brand-red/50 text-brand-red hover:bg-brand-red/10">
                      <Link to="/app/fechamento-caixa">Repor <ArrowUpRight className="size-3" /></Link>
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <Field label="Marca" value={brandName} />
                  <Field label="Categoria" value={catName} />
                  <Field label="Localização" value={locName} icon={<MapPin className="size-3" />} />
                  <Field label="Fornecedor" value={supName} />
                  <Field label="Unidade" value={p.unit} />
                  <Field label="Status" value={p.active ? "Ativo" : "Inativo"} />
                  <Field label="Estoque atual" value={`${stk} ${p.unit}`} />
                  <Field label="Estoque mínimo" value={`${min} ${p.unit}`} />
                  <Field label="Margem" value={`${margin.toFixed(1)}%`} />
                  <Field label="Preço de custo" value={visibility.mask(brl(cost))} />
                  <Field label="Preço de venda" value={visibility.mask(brl(sale))} />
                  <Field label="Total em estoque (custo)" value={visibility.mask(brl(stk * cost))} />
                </div>

                {p.description && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mais detalhes</div>
                    <div className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">{p.description}</div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Últimas movimentações</div>
                  {productMovs.length === 0 ? (
                    <div className="text-sm text-muted-foreground italic py-2">Sem movimentações registradas.</div>
                  ) : (
                    <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                      {productMovs.map((m: any) => {
                        const Icon = m.type === "entrada" ? ArrowDownLeft : m.type === "saida" ? ArrowUpRight : Settings2;
                        const color = m.type === "entrada" ? "text-success" : m.type === "saida" ? "text-brand-red" : "text-brand-orange";
                        return (
                          <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <Icon className={`size-3.5 shrink-0 ${color}`} />
                              <span className="truncate text-muted-foreground">{m.reason || "—"}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-semibold">{Number(m.quantity)}</span>
                              <span className="text-muted-foreground">{dt(m.created_at)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {p.image_url && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Foto do Produto</div>
                    <div 
                      className="aspect-square w-40 rounded-lg border overflow-hidden bg-muted/20 cursor-pointer"
                      onClick={() => setSelectedImageUrl(p.image_url!)}
                    >
                      <img src={p.image_url} alt={p.name} className="size-full object-cover" />
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-muted-foreground flex items-center gap-1 border-t pt-2">
                  <Calendar className="size-3" /> Criado em {dt(p.created_at)} · Atualizado em {dt(p.updated_at)}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsProduct(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selectedImageUrl} onOpenChange={(o) => !o && setSelectedImageUrl(null)}>
        <DialogContent className="max-w-2xl p-1 overflow-hidden bg-black/90 border-none sm:rounded-lg">
          <div className="relative aspect-square w-full">
            <img src={selectedImageUrl || ""} alt="Produto" className="size-full object-contain" />
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 text-white hover:bg-white/20"
              onClick={() => setSelectedImageUrl(null)}
            >
              <X className="size-5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StockCountChartsDialog
        open={isChartsOpen}
        onOpenChange={setIsChartsOpen}
        count={selectedCount}
        teams={teamsQ.data || []}
        items={countItems}
        products={allProductsForCount}
        locations={locations}
      />
      <Dialog open={isTeamModalOpen} onOpenChange={setIsTeamModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAdminUser ? "Gerenciar Equipes de Contagem" : "Equipes de Contagem"}</DialogTitle>
            <DialogDescription>
              {isAdminUser 
                ? "Defina as equipes, atribua usuários e localizações que cada uma será responsável por contar."
                : "Veja as localizações e membros da sua equipe."}
            </DialogDescription>
          </DialogHeader>


          <div className="space-y-6 py-4">
            {isAdminUser && (
              <Card className="p-4 border-dashed bg-muted/50">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-team-name">Nova Equipe</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="new-team-name"
                        placeholder="Nome da nova equipe..." 
                        value={newTeamName} 
                        onChange={(e) => setNewTeamName(e.target.value)}
                      />
                      <Button 
                        onClick={() => { 
                          if (newTeamName.trim() && newTeamMembers.length > 0 && newTeamLocations.length > 0) { 
                            createTeamMut.mutate({ 
                              name: newTeamName.trim(), 
                              members: newTeamMembers, 
                              locations: newTeamLocations 
                            }); 
                          } else {
                            if (!newTeamName.trim()) toast.error("Informe o nome da equipe");
                            else if (newTeamMembers.length === 0) toast.error("Selecione pelo menos um membro");
                            else if (newTeamLocations.length === 0) toast.error("Selecione pelo menos uma localização");
                          }
                        }} 
                        disabled={isCountClosed || !newTeamName.trim() || newTeamMembers.length === 0 || newTeamLocations.length === 0 || createTeamMut.isPending}
                        title={isCountClosed ? "Contagem finalizada — não é possível alterar" : undefined}
                      >
                        {createTeamMut.isPending ? (
                          <>
                            <Loader2 className="size-4 mr-2 animate-spin" />
                            Criando...
                          </>
                        ) : (
                          <>
                            <Plus className="size-4 mr-2" /> Criar Equipe
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-1.5">
                        <Users className="size-3" /> Membros (Selecione pelo menos um)
                      </Label>
                      <div className="flex flex-wrap gap-2 p-2 border rounded-md bg-background min-h-[42px]">
                        {(teamMembersQ.data || []).map(member => {
                          // Check if user is already in another team
                          const allTeams = teamsQ.data || [];
                          const otherTeamsUserMap = new Map<string, string>();
                          allTeams.forEach(t => {
                            (t.members || []).forEach(uid => otherTeamsUserMap.set(uid, t.name));
                          });
                          
                          const assignedToOther = otherTeamsUserMap.get(member.user_id);
                          const isSelected = newTeamMembers.includes(member.user_id);

                          return (
                            <div 
                              key={member.id} 
                              className={cn(
                                "flex items-center gap-2 px-2 py-1 rounded-full border text-xs transition-colors",
                                isSelected ? "bg-brand-orange/10 border-brand-orange/30" : "bg-muted/30 border-transparent",
                                assignedToOther && "opacity-40 grayscale"
                              )}
                            >
                              <Checkbox 
                                id={`new-team-user-${member.user_id}`}
                                checked={isSelected}
                                disabled={!!assignedToOther || (newTeamMembers.length >= 2 && !isSelected)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    if (newTeamMembers.length >= 2) {
                                      toast.error("Limite de 2 usuários por equipe");
                                      return;
                                    }
                                    setNewTeamMembers(prev => [...prev, member.user_id]);
                                  } else {
                                    setNewTeamMembers(prev => prev.filter(id => id !== member.user_id));
                                  }
                                }}
                                className="size-3"
                              />
                              <Label 
                                htmlFor={`new-team-user-${member.user_id}`}
                                className={cn("cursor-pointer max-w-[120px] truncate", (assignedToOther || (newTeamMembers.length >= 2 && !isSelected)) && "cursor-default")}
                                title={assignedToOther ? `Já está na equipe: ${assignedToOther}` : member.profile?.name}
                              >
                                {member.profile?.name || member.profile?.email}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-1.5">
                        <MapPin className="size-3" /> Localizações (Selecione pelo menos uma)
                      </Label>
                      <div className="grid grid-cols-2 gap-2 p-2 border rounded-md bg-background max-h-[150px] overflow-y-auto">
                        {locations.map(loc => {
                          const allTeams = teamsQ.data || [];
                          const otherTeamsLocMap = new Map<string, string>();
                          allTeams.forEach(t => {
                            (t.locations || []).forEach(locId => otherTeamsLocMap.set(locId, t.name));
                          });

                          const assignedToOther = otherTeamsLocMap.get(loc.id);
                          const isSelected = newTeamLocations.includes(loc.id);

                          return (
                            <div 
                              key={loc.id} 
                              className={cn(
                                "flex items-center gap-2 p-1.5 rounded-md border text-xs transition-colors",
                                isSelected ? "bg-primary/5 border-primary/20" : "hover:bg-muted/50",
                                assignedToOther && "opacity-40 grayscale bg-muted/30"
                              )}
                            >
                              <Checkbox 
                                id={`new-team-loc-${loc.id}`}
                                checked={isSelected}
                                disabled={!!assignedToOther}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setNewTeamLocations(prev => [...prev, loc.id]);
                                  } else {
                                    setNewTeamLocations(prev => prev.filter(id => id !== loc.id));
                                  }
                                }}
                                className="size-3"
                              />
                              <Label 
                                htmlFor={`new-team-loc-${loc.id}`}
                                className={cn("flex-1 truncate cursor-pointer", assignedToOther && "cursor-default")}
                                title={assignedToOther ? `Já está na equipe: ${assignedToOther}` : loc.name}
                              >
                                {loc.name}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <div className="space-y-4">
              {(teamsQ.data || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground italic border rounded-md">
                  Nenhuma equipe criada para esta contagem.
                </div>
              ) : (teamsQ.data || []).map(team => {
                const otherTeamsLocMap = new Map<string, string>();
                const otherTeamsUserMap = new Map<string, string>();
                (teamsQ.data || []).forEach(t => {
                  if (t.id !== team.id) {
                    (t.locations || []).forEach(locId => otherTeamsLocMap.set(locId, t.name));
                    (t.members || []).forEach(uid => otherTeamsUserMap.set(uid, t.name));
                  }
                });

                const isMyTeam = user?.id && team.members?.includes(user.id);
                if (!isAdminUser && !isMyTeam) return null;

                const hasLocations = (team.locations || []).length > 0;

                const isExpanded = expandedTeams[team.id] ?? false;

                return (
                  <Card key={team.id} className="overflow-hidden">
                    <div 
                      className={cn(
                        "p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors select-none",
                        isExpanded && "border-b"
                      )}
                      onClick={() => setExpandedTeams(prev => ({ ...prev, [team.id]: !isExpanded }))}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                        <div className="font-bold text-lg">{team.name}</div>
                        <Badge variant={team.status === "concluida" ? "default" : "outline"} className={cn(team.status === "concluida" ? "bg-success hover:bg-success/80" : "text-brand-orange border-brand-orange/40")}>
                          {team.status === "concluida" ? "Concluída" : "Em contagem"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {isAdminUser && (
                          <>
                            {team.status === "aberta" ? (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="border-success text-success hover:bg-success/10 h-8" 
                                onClick={async () => {
                                  const productsInTeamLocs = allProductsForCount.filter(p => (team.locations || []).includes(p.location_id || ""));
                                  const teamItems = countItems.filter(it => productsInTeamLocs.some(p => p.id === it.product_id));
                                  const verifiedCount = teamItems.filter(it => it.verified).length;
                                  const pending = teamItems.length - verifiedCount;
                                  const ok = await confirm({
                                    title: `Finalizar equipe "${team.name}"?`,
                                    description: pending > 0
                                      ? `Esta equipe ainda tem ${pending} item(ns) pendente(s) de verificação (${verifiedCount}/${teamItems.length}). Ao finalizar, as localizações desta equipe ficarão bloqueadas para alterações.`
                                      : `Todos os ${teamItems.length} item(ns) foram verificados. Ao finalizar, as localizações desta equipe ficarão bloqueadas para alterações.`,
                                    confirmLabel: "Finalizar equipe",
                                    variant: "default",
                                  });
                                  if (ok) updateTeamStatusMut.mutate({ teamId: team.id, status: "concluida" });
                                }}
                                disabled={isCountClosed || !hasLocations || updateTeamStatusMut.isPending}
                                title={isCountClosed ? "Contagem finalizada — não é possível alterar" : undefined}
                              >
                                <CheckCircle2 className="size-3.5 mr-1.5" /> Finalizar
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-8" onClick={() => updateTeamStatusMut.mutate({ teamId: team.id, status: "aberta" })} disabled={isCountClosed || updateTeamStatusMut.isPending} title={isCountClosed ? "Contagem finalizada — não é possível alterar" : undefined}>
                                Reabrir
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive h-8 w-8" 
                              onClick={async () => {
                                const productsInTeamLocs = allProductsForCount.filter(p => (team.locations || []).includes(p.location_id || ""));
                                const hasStarted = countItems.some(item => 
                                  productsInTeamLocs.some(p => p.id === item.product_id) && item.verified
                                );
                                
                                if (hasStarted) {
                                  toast.error("Não é possível excluir uma equipe que já iniciou a contagem.");
                                  return;
                                }
                                if (await confirm({ title: "Excluir equipe?", description: `A equipe "${team.name}" será removida desta contagem.`, confirmLabel: "Excluir", variant: "destructive" })) {
                                  deleteTeamMut.mutate(team.id);
                                }
                              }} 
                              disabled={isCountClosed || deleteTeamMut.isPending}
                              title={isCountClosed ? "Contagem finalizada — não é possível alterar" : undefined}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 space-y-6 bg-muted/10">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs uppercase text-muted-foreground font-semibold">Membros da Equipe</Label>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {(teamMembersQ.data || []).map(member => {
                                const isAssignedToMe = (team.members || []).includes(member.user_id);
                                const assignedToOther = otherTeamsUserMap.get(member.user_id);
                                
                                if (assignedToOther && !isAssignedToMe && !isAdminUser) return null;

                                return (
                                  <div 
                                    key={member.id} 
                                    className={cn(
                                      "flex items-center gap-2 px-2 py-1 rounded-full border text-xs transition-colors",
                                      isAssignedToMe ? "bg-brand-orange/10 border-brand-orange/30" : "bg-muted/30 border-transparent",
                                      assignedToOther && !isAssignedToMe && "opacity-40 grayscale"
                                    )}
                                  >
                                    {isAdminUser && (
                                      <Checkbox 
                                        id={`team-${team.id}-user-${member.user_id}`}
                                        checked={isAssignedToMe}
                                        disabled={updateTeamMembersMut.isPending || (!!assignedToOther && !isAssignedToMe) || ((team.members || []).length >= 2 && !isAssignedToMe)}
                                        onCheckedChange={(checked) => {
                                          const currentMembers = team.members || [];
                                          const newMembers = checked 
                                            ? [...currentMembers, member.user_id]
                                            : currentMembers.filter(id => id !== member.user_id);
                                          
                                          if (checked && currentMembers.length >= 2) {
                                            toast.error("Limite de 2 usuários por equipe atingido");
                                            return;
                                          }

                                          updateTeamMembersMut.mutate({ teamId: team.id, userIds: newMembers });
                                        }}
                                        className="size-3"
                                      />
                                    )}
                                    <Label 
                                      htmlFor={`team-${team.id}-user-${member.user_id}`}
                                      className={cn("cursor-pointer max-w-[120px] truncate", (assignedToOther && !isAssignedToMe || (team.members || []).length >= 2 && !isAssignedToMe) && "cursor-default")}
                                      title={assignedToOther ? `Já está na equipe: ${assignedToOther}` : (team.members || []).length >= 2 && !isAssignedToMe ? "Limite de 2 usuários por equipe atingido" : member.profile?.name}
                                    >
                                      {member.profile?.name || member.profile?.email}
                                    </Label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed">
                            <Label className="text-xs uppercase text-muted-foreground font-semibold">Localizações Responsáveis</Label>
                            {isAdminUser && (
                              <Button 
                                variant="link" 
                                size="sm" 
                                className="h-auto p-0 text-xs" 
                                onClick={() => {
                                  const availableLocs = locations
                                    .filter(l => !otherTeamsLocMap.has(l.id))
                                    .map(l => l.id);
                                  updateTeamLocsMut.mutate({ teamId: team.id, locationIds: availableLocs });
                                }}
                                disabled={updateTeamLocsMut.isPending || team.status === "concluida"}
                              >
                                Selecionar todas as disponíveis
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {locations.filter(loc => !otherTeamsLocMap.has(loc.id)).map(loc => {
                              const isAssignedToMe = (team.locations || []).includes(loc.id);
                              
                              return (
                                <div 
                                  key={loc.id} 
                                  className={cn(
                                    "flex items-center gap-2 p-2 rounded-md border text-sm transition-colors",
                                    isAssignedToMe ? "bg-primary/5 border-primary/20 ring-1 ring-primary/20" : "hover:bg-muted/50",
                                    team.status === "concluida" && "opacity-50 grayscale bg-muted cursor-not-allowed"
                                  )}
                                >
                                  {isAdminUser && (
                                    <Checkbox 
                                      id={`team-${team.id}-loc-${loc.id}`}
                                      checked={isAssignedToMe}
                                      disabled={updateTeamLocsMut.isPending || team.status === "concluida"}
                                      onCheckedChange={(checked) => {
                                        const currentLocs = team.locations || [];
                                        const newLocs = checked 
                                          ? [...currentLocs, loc.id]
                                          : currentLocs.filter(id => id !== loc.id);
                                        updateTeamLocsMut.mutate({ teamId: team.id, locationIds: newLocs });
                                      }}
                                    />
                                  )}
                                  <Label 
                                    htmlFor={`team-${team.id}-loc-${loc.id}`}
                                    className={cn("flex-1 truncate cursor-pointer", team.status === "concluida" && "cursor-not-allowed")}
                                  >
                                    {loc.name}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>

                          {isAdminUser && locations.some(loc => otherTeamsLocMap.has(loc.id)) && (
                            <div className="space-y-2">
                              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Localizações em uso por outras equipes</Label>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {locations.filter(loc => otherTeamsLocMap.has(loc.id)).map(loc => (
                                  <div key={loc.id} className="flex items-center justify-between gap-2 p-2 rounded-md border bg-muted/30 opacity-60 text-xs italic">
                                    <span className="truncate">{loc.name}</span>
                                    <Badge variant="outline" className="text-[9px] px-1 h-3.5 bg-background/50 whitespace-nowrap border-brand-orange/30 text-brand-orange">
                                      {otherTeamsLocMap.get(loc.id)}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsTeamModalOpen(false)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmModalOpen} onOpenChange={setIsConfirmModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmingItem?.verified ? "Ajustar preço" : "Confirmar Conferência"}</DialogTitle>
            <DialogDescription>
              {confirmingItem?.verified ? (
                <>Item já conferido. Apenas o <strong>preço de venda</strong> pode ser alterado.</>
              ) : (
                <>Confirme a quantidade encontrada para <strong>{confirmingItem?.product_name}</strong>.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-qty">Quantidade no Estoque Atual</Label>
              <Input
                id="confirm-qty"
                type="number"
                value={editQuantity}
                onChange={(e) => setEditQuantity(e.target.value)}
                autoFocus={!confirmingItem?.verified}
                disabled={!!confirmingItem?.verified}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmVerification();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Esperado: {confirmingItem?.expected_quantity} {confirmingItem?.unit}
                {confirmingItem?.verified ? " · Quantidade bloqueada (item já conferido)" : ""}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-price">Valor de venda do produto</Label>
              <Input
                id="confirm-price"
                inputMode="numeric"
                value={editPrice}
                autoFocus={!!confirmingItem?.verified}
                onChange={(e) => setEditPrice(maskCurrency(e.target.value))}
                placeholder="0,00"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmVerification();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Será atualizado no cadastro do produto.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            {(() => {
              const teams = teamsQ.data || [];
              const prod = confirmingItem ? allProductsForCount.find((p) => p.id === confirmingItem.product_id) : null;
              const prodLoc = prod?.location_id || null;
              const ownerTeam = prodLoc ? teams.find((t) => (t.locations || []).includes(prodLoc)) : null;
              const isLocked = isCountClosed || ownerTeam?.status === "concluida";
              return (
                <div className="sm:mr-auto flex flex-col gap-1">
                  <Button
                    variant="secondary"
                    onClick={openEditProductFromCount}
                    disabled={isLocked}
                    title={isLocked ? "Contagem finalizada — edição bloqueada" : undefined}
                  >
                    Editar produto
                  </Button>
                  {isLocked && (
                    <p className="text-xs text-muted-foreground">
                      A contagem da equipe "{ownerTeam?.name}" foi finalizada. Reabra-a para editar o produto.
                    </p>
                  )}
                </div>
              );
            })()}
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" onClick={() => setIsConfirmModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleConfirmVerification} disabled={isCountClosed} title={isCountClosed ? "Contagem finalizada — não é possível alterar" : undefined}>Confirmar</Button>
            </div>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      <Dialog open={editProductOpen} onOpenChange={(o) => { if (!o) { setEditProductOpen(false); setEditProductForm(null); } }}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar produto</DialogTitle>
            <DialogDescription>
              Altere os dados do produto. Mudar a localização para uma área de outra equipe ativa transfere a contagem.
            </DialogDescription>
          </DialogHeader>
          {editProductForm && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nome</Label>
                <Input
                  value={editProductForm.name}
                  onChange={(e) => setEditProductForm({ ...editProductForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={editProductForm.sku}
                  onChange={(e) => setEditProductForm({ ...editProductForm, sku: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input
                  value={editProductForm.unit}
                  onChange={(e) => setEditProductForm({ ...editProductForm, unit: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Localização</Label>
                <Select
                  value={editProductForm.location_id || "__none"}
                  onValueChange={(v) => setEditProductForm({ ...editProductForm, location_id: v === "__none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Sem localização —</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preço de venda</Label>
                <Input
                  inputMode="numeric"
                  value={editProductForm.sale_price}
                  onChange={(e) => setEditProductForm({ ...editProductForm, sale_price: maskCurrency(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço de custo</Label>
                <Input
                  inputMode="numeric"
                  value={editProductForm.cost_price}
                  onChange={(e) => setEditProductForm({ ...editProductForm, cost_price: maskCurrency(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Estoque mínimo</Label>
                <Input
                  type="number"
                  value={editProductForm.min_stock}
                  onChange={(e) => setEditProductForm({ ...editProductForm, min_stock: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Descrição</Label>
                <Input
                  value={editProductForm.description}
                  onChange={(e) => setEditProductForm({ ...editProductForm, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditProductOpen(false); setEditProductForm(null); }} disabled={savingProductEdit}>Cancelar</Button>
            <Button onClick={handleSaveProductEdit} disabled={savingProductEdit}>
              {savingProductEdit ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <Dialog open={!!finishingCountId} onOpenChange={(open) => !open && setFinishingCountId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar finalização geral</DialogTitle>
            <DialogDescription>
              Deseja realmente finalizar esta contagem? Esta ação não pode ser desfeita e o estoque será atualizado com os novos valores.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishingCountId(null)}>Cancelar</Button>
            <Button 
              disabled={finishCountMut.isPending}
              onClick={() => {
                if (finishingCountId) {
                  finishCountMut.mutate(finishingCountId, {
                    onSuccess: () => setFinishingCountId(null)
                  });
                }
              }}
            >
              {finishCountMut.isPending ? "Finalizando..." : "Confirmar e Finalizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={printOrderOpen} onOpenChange={(o) => { if (!o) { setPrintOrderOpen(false); setPrintOrderTarget(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ordenar lista de contagem</DialogTitle>
            <DialogDescription>
              Escolha a ordenação para {printOrderTarget === "pdf" ? "o PDF" : "a impressão"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50">
              <input
                type="radio"
                name="print-order"
                value="name"
                checked={printOrderBy === "name"}
                onChange={() => setPrintOrderBy("name")}
              />
              <span>Por nome do produto</span>
            </label>
            <label className="flex items-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50">
              <input
                type="radio"
                name="print-order"
                value="location"
                checked={printOrderBy === "location"}
                onChange={() => setPrintOrderBy("location")}
              />
              <span>Por localização</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPrintOrderOpen(false); setPrintOrderTarget(null); }}>Cancelar</Button>
            <Button onClick={handleConfirmPrintOrder}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function Field({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium inline-flex items-center gap-1">{icon}{value}</div>
    </div>
  );
}
