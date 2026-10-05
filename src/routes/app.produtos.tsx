import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { appwrite } from "@/integrations/appwrite/client";
import {
  fetchProducts,
  fetchCategories,
  fetchPartners,
  fetchBrands,
  fetchProductsPaginated,
  fetchProductsByManufacturerCode,
  createProduct,
  updateProduct,
  deleteProduct,
  createCategory,
  createBrand,
  upsertPartner,
  registerMovement,
  fetchStockLocations,
  createStockLocation,
  fetchUnits,
  createUnit,
  fetchProductAuditLogs,
  fetchProductReferences,
  fetchProductReferencesByCompany,
  replaceProductReferences,
  findProductByBarcode,
  updateProductsLocationBatch,
  logActivity,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
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
import { useInView } from "react-intersection-observer";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ArrowDownUp,
  RefreshCw,
  Info,
  ScanBarcode,
  Minus,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Mic,
  Square,
  Ruler,
  Sparkles,
  Copy,
  Wand2,
  Tags,
  ImageOff,
  HelpCircle,
  Package,
  Printer,
  FileText,
  User,
  X,
  CircleDollarSign,
} from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";
import { BarcodeLabelDialog } from "@/components/barcode-label-dialog";
import {
  cn,
  normalize,
  isDuplicateError,
  duplicateMessage,
  matchSearch,
  compareProductNames,
} from "@/lib/utils";
import { buildRefsSearchMap, buildRefsBrandMap, productMatchesBrand } from "@/lib/product-search";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { brl } from "@/lib/format";
import { useValueVisibility, ValueVisibilityToggle } from "@/hooks/use-value-visibility";
import { toast } from "sonner";
import type { Product } from "@/lib/db-types";
import { formatCurrency, maskCurrency, parseCurrency } from "@/lib/masks";
import { Textarea } from "@/components/ui/textarea";
import { EntitySelectorDialog } from "@/components/entity-selector-dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { validateStockCode } from "@/lib/stock-code";
import { fetchCompanyRoles, hasPermission } from "@/lib/db";

export const Route = createFileRoute("/app/produtos")({
  component: ProductsPage,
});

interface ProductRefRow {
  id?: string;
  brandId: string; // "none" | id
  brandName: string; // fallback se brandId = none
  manufacturerCode: string;
}

interface FormState {
  name: string;
  sku: string;
  alternativeCode: string;
  barcode: string;
  brandId: string;
  categoryId: string;
  supplierId: string;
  locationId: string;
  unitId: string;
  costPrice: string;
  salePrice: string;
  stock: string;
  minStock: string;
  description: string;
  imageUrl: string;
  references: ProductRefRow[];
}
const empty: FormState = {
  name: "",
  sku: "",
  alternativeCode: "",
  barcode: "",
  brandId: "none",
  categoryId: "none",
  supplierId: "none",
  locationId: "none",
  unitId: "none",
  costPrice: "0,00",
  salePrice: "0,00",
  stock: "",
  minStock: "0",
  description: "",
  imageUrl: "",
  references: [],
};

function ProductsPage() {
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const visibility = useValueVisibility("produtos");
  const [currentPage, setCurrentPage] = useState(1);
  const PRODUCTS_PREFS_KEY = `products_prefs_${cid}`;
  const loadInitialPrefs = () => {
    if (typeof window === "undefined") return { search: "", sortConfig: null };
    try {
      const raw = localStorage.getItem(PRODUCTS_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          search: typeof parsed.search === "string" ? parsed.search : "",
          sortConfig: parsed.sortConfig ?? null,
        };
      }
    } catch {
      // ignore
    }
    return { search: "", sortConfig: null };
  };
  const initialPrefs = loadInitialPrefs();
  const [search, setSearch] = useState(initialPrefs.search);
  const [debouncedSearch, setDebouncedSearch] = useState(initialPrefs.search);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem("products_pageSize");
    return saved ? Number(saved) : 50;
  });

  // Debounce da busca para não sobrecarregar o banco
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400); // 400ms de atraso
    return () => clearTimeout(timer);
  }, [search]);

  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [hasRefsFilter, setHasRefsFilter] = useState(false);

  const productsQ = useQuery({
    queryKey: [
      "products-paginated",
      cid,
      search,
      locationFilter,
      hasRefsFilter,
      currentPage,
      pageSize,
    ],
    queryFn: () =>
      fetchProductsPaginated({
        companyId: cid,
        page: currentPage - 1,
        pageSize: pageSize,
        search: search,
        locationId: locationFilter,
        hasAdditionalBrands: hasRefsFilter,
      }),
    enabled: !!cid,
  });

  const products = productsQ.data?.data ?? [];
  const totalProductsCount = productsQ.data?.count ?? 0;
  const totalPages = Math.ceil(totalProductsCount / pageSize);

  const productRefsListQ = useQuery({
    queryKey: ["product_references", cid],
    queryFn: () => fetchProductReferencesByCompany(cid),
    enabled: !!cid,
  });
  const categoriesQ = useQuery({
    queryKey: ["categories", cid],
    queryFn: () => fetchCategories(cid),
    enabled: !!cid,
  });
  const suppliersQ = useQuery({
    queryKey: ["partners", cid, "fornecedor"],
    queryFn: () => fetchPartners(cid, "fornecedor"),
    enabled: !!cid,
  });
  const brandsQ = useQuery({
    queryKey: ["brands", cid],
    queryFn: () => fetchBrands(cid),
    enabled: !!cid,
  });
  const locationsQ = useQuery({
    queryKey: ["stock_locations", cid],
    queryFn: () => fetchStockLocations(cid),
    enabled: !!cid,
  });
  const unitsQ = useQuery({
    queryKey: ["units", cid],
    queryFn: () => fetchUnits(cid),
    enabled: !!cid,
  });
  const companySettingsQ = useQuery({
    queryKey: ["company-settings", cid],
    queryFn: async () => {
      const { data, error } = await appwrite
        .from("company_settings")
        .select("*")
        .eq("company_id", cid)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return (data as any) || { profit_margin: 0 };
    },
    enabled: !!cid,
  });
  const barcodeSettingsQ = useQuery({
    queryKey: ["company-settings", cid, "barcode-scanner"],
    queryFn: async () => {
      const { data, error } = await appwrite
        .from("company_settings" as any)
        .select("barcode_scanner_enabled")
        .eq("company_id", cid)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        const local = localStorage.getItem(`company_settings_${cid}`);
        return local ? Boolean(JSON.parse(local).barcode_scanner_enabled) : false;
      }
      return Boolean((data as any)?.barcode_scanner_enabled);
    },
    enabled: !!cid,
  });
  const aiSettingsQ = useQuery({
    queryKey: ["company-settings", cid, "ai"],
    queryFn: async () => {
      const { data, error } = await appwrite.rpc("get_ai_settings" as any, { _company: cid });
      if (error) throw error;
      return {
        enabled: (data as any).enabled,
        validated: (data as any).validated,
        model: (data as any).model,
        token: (data as any).token || "",
      };
    },
    enabled: !!cid,
  });
  const systemAiQ = useQuery({
    queryKey: ["system-settings", "ai-product-lookup"],
    queryFn: async () => {
      const { data } = await appwrite
        .from("system_settings" as any)
        .select("ai_product_lookup_enabled")
        .maybeSingle();
      return Boolean((data as any)?.ai_product_lookup_enabled ?? true);
    },
  });

  const profitMargin = Number(companySettingsQ.data?.profit_margin) || 0;
  const barcodeScannerEnabled = Boolean(barcodeSettingsQ.data);
  const aiEnabled = Boolean(aiSettingsQ.data?.enabled);
  const aiConnectionValidated = Boolean(aiSettingsQ.data?.validated);
  const aiLookupGloballyEnabled = systemAiQ.data !== false;
  const aiLookupAvailable =
    aiEnabled &&
    (aiConnectionValidated || aiSettingsQ.data?.model === "custom/n8n-webhook") &&
    aiLookupGloballyEnabled;

  // Removido o estado local duplicado de search (já declarado acima)
  // const [search, setSearch] = useState(initialPrefs.search);
  const [open, setOpen] = useState(false);
  const [detailsProduct, setDetailsProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<FormState>(empty);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const stockCodeInputRef = useRef<HTMLInputElement>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [supOpen, setSupOpen] = useState(false);
  const [supName, setSupName] = useState("");
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanningField, setScanningField] = useState<"sku" | "alternativeCode" | "barcode">("sku");
  const [isDictating, setIsDictating] = useState(false);
  const [dictationElapsed, setDictationElapsed] = useState(0);
  const [duplicateProduct, setDuplicateProduct] = useState<Product | null>(null);
  const [codeHelpOpen, setCodeHelpOpen] = useState(false);
  const [brandPage, setBrandPage] = useState(1);
  const brandPageSize = 8;
  const [locOpen, setLocOpen] = useState(false);
  const [locName, setLocName] = useState("");

  // Modais de seleção (picker)
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [supPickerOpen, setSupPickerOpen] = useState(false);
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [unitAbbr, setUnitAbbr] = useState("");
  const [unitDesc, setUnitDesc] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [aiLookupOpen, setAiLookupOpen] = useState(false);
  const [aiLookupLoading, setAiLookupLoading] = useState(false);
  const [aiLookupResult, setAiLookupResult] = useState<{
    name: string;
    details: string;
    originalCode: string;
    originalBrand: string;
    codes: string[];
    imageUrl: string;
    averagePurchasePrice?: number;
    barcode?: string;
    existingProduct?: Product | null;
  } | null>(null);
  const [aiApplyCostPrice, setAiApplyCostPrice] = useState(true);
  const [aiApplyBrand, setAiApplyBrand] = useState(true);
  const [aiImageOk, setAiImageOk] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelProducts, setLabelProducts] = useState<Product[]>([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Seleção múltipla
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [batchLocPickerOpen, setBatchLocPickerOpen] = useState(false);

  // Busca rápida antes do cadastro
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState("");
  const quickSearchInputRef = useRef<HTMLInputElement>(null);
  const [quickSearchResults, setQuickSearchResults] = useState<Product[]>([]);
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [quickSearchType, setQuickSearchType] = useState<"global" | "sku">("global");

  const handleQuickSearch = async (term: string, type: "global" | "sku" = "global") => {
    setQuickSearchTerm(term);
    setQuickSearchType(type);
    if (!term.trim()) {
      setQuickSearchResults([]);
      return;
    }
    setQuickSearchLoading(true);
    try {
      const result = await fetchProductsPaginated({
        companyId: cid,
        page: 0,
        pageSize: 50,
        search: term,
        // Se for tipo SKU, a API fetchProductsPaginated já busca em SKU e código de barras por padrão,
        // mas o usuário quer que a busca GLOBAL procure em todos os campos e a de SKU seja específica.
        // No entanto, a fetchProductsPaginated no backend já costuma buscar em vários campos.
      });

      let filtered = result.data || [];
      if (type === "sku") {
        // Filtro adicional no front para garantir que estamos buscando apenas pelo código do fabricante/SKU se solicitado
        const searchUpper = term.toUpperCase();
        filtered = filtered.filter(
          (p) =>
            (p.sku && p.sku.toUpperCase().includes(searchUpper)) ||
            (p.alternative_code && p.alternative_code.toUpperCase().includes(searchUpper)) ||
            (p.barcode && p.barcode.includes(term)),
        );
      }

      setQuickSearchResults(filtered);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao buscar produtos");
    } finally {
      setQuickSearchLoading(false);
    }
  };

  // Auditoria
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 20;
  const [auditFilters, setAuditFilters] = useState({
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    brandId: "all",
    categoryId: "all",
    productId: "all",
    userId: "",
    search: "",
  });

  const [auditBrandPickerOpen, setAuditBrandPickerOpen] = useState(false);
  const [auditCatPickerOpen, setAuditCatPickerOpen] = useState(false);
  const [auditProductPickerOpen, setAuditProductPickerOpen] = useState(false);

  const [refBrandPickerIndex, setRefBrandPickerIndex] = useState<number | null>(null);
  const auditQ = useQuery({
    queryKey: ["product-audit", cid, auditFilters.userId || user?.id, auditFilters],
    queryFn: () =>
      fetchProductAuditLogs({
        companyId: cid,
        userId: auditFilters.userId || user?.id,
        startDate: auditFilters.startDate,
        endDate: auditFilters.endDate,
        brandId: auditFilters.brandId,
        categoryId: auditFilters.categoryId,
        search: auditFilters.search,
      }),
    enabled: auditOpen && !!cid && !!user?.id,
  });

  const canViewOthersAuditQ = useQuery({
    queryKey: ["can-view-others-audit", cid, user?.id],
    queryFn: () => hasPermission(cid, "produtos_auditoria_outros", "view"),
    enabled: !!cid && !!user?.id,
  });

  const membersQ = useQuery({
    queryKey: ["company-members", cid],
    queryFn: async () => {
      const { data: ms, error } = await appwrite
        .from("memberships")
        .select("user_id")
        .eq("company_id", cid)
        .eq("is_blocked", false);
      if (error) throw error;
      const ids = (ms ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await appwrite
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      if (pErr) throw pErr;
      return profs ?? [];
    },
    enabled: !!cid && !!canViewOthersAuditQ.data,
  });

  // Filtragem local adicional para produto específico se selecionado pelo picker
  const allAuditData = useMemo(() => {
    let data = auditQ.data ?? [];
    if (auditFilters.productId !== "all") {
      data = data.filter((log: any) => log.entity_id === auditFilters.productId);
    }
    return data;
  }, [auditQ.data, auditFilters.productId]);

  const totalAuditItems = allAuditData.length;
  const totalAuditPages = Math.ceil(totalAuditItems / auditPageSize);

  const filteredAuditData = useMemo(() => {
    const start = (auditPage - 1) * auditPageSize;
    return allAuditData.slice(start, start + auditPageSize);
  }, [allAuditData, auditPage]);

  // Reset page when filters change
  useEffect(() => {
    setAuditPage(1);
  }, [auditFilters]);

  // Cache em memória dos resultados da IA por (termo|marca) para evitar refetch
  type AiLookupCacheEntry = {
    name: string;
    details: string;
    originalCode: string;
    originalBrand: string;
    codes: string[];
    imageUrl: string;
    imageOk?: boolean;
    averagePurchasePrice?: number;
    barcode?: string;
    existingProduct?: Product | null;
  };
  const aiLookupCacheRef = useRef<Map<string, AiLookupCacheEntry>>(new Map());

  const runAiProductLookup = async () => {
    const term = form.name.trim();
    if (!term) {
      toast.error("Digite o nome do produto antes de pesquisar");
      return;
    }
    if (!aiLookupAvailable && aiSettingsQ.data?.model !== "custom/n8n-webhook") {
      toast.error("IA indisponível: ative a IA nas configurações");
      return;
    }

    const selectedBrand = brands.find((b) => b.id === form.brandId)?.name || "";
    const cacheKey = `${term.toLowerCase()}|${selectedBrand.toLowerCase()}`;

    setAiLookupOpen(true);
    setAiLookupResult(null);
    setAiImageOk(false);
    setSelectedCode("");

    // Cache hit: reusa resultado sem chamar a IA
    const cached = aiLookupCacheRef.current.get(cacheKey);
    if (cached) {
      setAiLookupResult(cached);
      setAiImageOk(Boolean(cached.imageOk && cached.imageUrl));
      if (cached.codes.length > 0) setSelectedCode(cached.codes[0]);
      return;
    }

    setAiLookupLoading(true);
    try {
      const { data, error } = await appwrite.functions.invoke("product-ai-lookup", {
        body: {
          query: term,
          brand: selectedBrand,
          company_id: cid,
          model: aiSettingsQ.data?.model,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha na consulta");

      const codes = String(data.originalCode || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const aiBarcode = String(data.barcode || "").replace(/\D/g, "");
      // Procura produto existente com esse EAN
      const existingByBarcode = aiBarcode
        ? products.find(
            (p) => ((p as any).barcode || "").trim() === aiBarcode && p.id !== editing?.id,
          ) || null
        : null;

      const result: AiLookupCacheEntry = {
        name: String(data.name || term),
        details: String(data.details || ""),
        originalCode: String(data.originalCode || ""),
        originalBrand: String(data.originalBrand || ""),
        codes: codes,
        imageUrl: String(data.imageUrl || ""),
        averagePurchasePrice: Number(data.averagePurchasePrice || 0),
        barcode: aiBarcode,
        existingProduct: existingByBarcode,
      };
      aiLookupCacheRef.current.set(cacheKey, result);
      setAiLookupResult(result);
      if (codes.length > 0) {
        setSelectedCode(codes[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao consultar a IA");
      setAiLookupOpen(false);
    } finally {
      setAiLookupLoading(false);
    }
  };

  const applyAiLookup = async () => {
    if (!aiLookupResult) return;
    let brandIdToApply = form.brandId;

    // Se a IA identificou uma marca e ainda não há marca selecionada, tentar casar/criar
    const aiBrand = aiLookupResult.originalBrand.trim();
    if (aiApplyBrand && aiBrand && (form.brandId === "none" || !form.brandId)) {
      const existing = brands.find((b) => b.name.toLowerCase() === aiBrand.toLowerCase());
      if (existing) {
        brandIdToApply = existing.id;
      } else {
        try {
          const created = await createBrand(cid, aiBrand, user?.id);
          qc.invalidateQueries({ queryKey: ["brands", cid] });
          brandIdToApply = created.id;
          toast.success(`Marca "${aiBrand}" criada automaticamente`);
        } catch {
          // se falhar, segue sem marca
        }
      }
    }

    setForm((f) => ({
      ...f,
      name: aiLookupResult.name,
      brandId: brandIdToApply,
      sku: (f.sku || selectedCode || aiLookupResult.originalCode || "").trim(),
      barcode: f.barcode || aiLookupResult.barcode || "",
      costPrice:
        aiApplyCostPrice &&
        aiLookupResult.averagePurchasePrice &&
        aiLookupResult.averagePurchasePrice > 0
          ? aiLookupResult.averagePurchasePrice.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : f.costPrice,
      description: aiLookupResult.details
        ? [f.description.trim(), aiLookupResult.details].filter(Boolean).join("\n")
        : f.description,
    }));
    toast.success("Informações aplicadas ao produto");
    setAiLookupOpen(false);
  };

  // O array products já é populado pelo infinite query acima
  // const products = productsQ.data ?? [];
  const categories = categoriesQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const locations = locationsQ.data ?? [];
  const units = unitsQ.data ?? [];
  const productRefsMap = useMemo(
    () =>
      buildRefsSearchMap(productRefsListQ.data ?? [], new Map(brands.map((b) => [b.id, b.name]))),
    [productRefsListQ.data, brands],
  );
  const productRefsBrandMap = useMemo(
    () => buildRefsBrandMap(productRefsListQ.data ?? []),
    [productRefsListQ.data],
  );
  const [brandFilter, setBrandFilter] = useState<string>("all");

  const filteredBrands = useMemo(() => {
    const q = normalize(brandSearch.trim());
    if (!q) return brands;
    return brands.filter((b) => normalize(b.name).includes(q));
  }, [brands, brandSearch]);
  const brandTotalPages = Math.max(1, Math.ceil(filteredBrands.length / brandPageSize));
  const paginatedBrands = useMemo(
    () => filteredBrands.slice((brandPage - 1) * brandPageSize, brandPage * brandPageSize),
    [filteredBrands, brandPage],
  );
  useMemo(() => setBrandPage(1), [brandSearch]);

  // Using the shared pageSize state instead of local constant
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(
    initialPrefs.sortConfig,
  );

  // Persistir busca e ordenação por empresa
  useEffect(() => {
    if (typeof window === "undefined" || !cid) return;
    try {
      localStorage.setItem(PRODUCTS_PREFS_KEY, JSON.stringify({ search, sortConfig }));
    } catch {
      // ignore quota errors
    }
  }, [search, sortConfig, cid, PRODUCTS_PREFS_KEY]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, brandFilter, locationFilter, hasRefsFilter]);

  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const filtered = useMemo(() => {
    let result = search.trim()
      ? products.filter((p) => {
          const brandName = brands.find((b) => b.id === p.brand_id)?.name || p.brand || "";
          const locName = locations.find((l) => l.id === (p as any).location_id)?.name || "";
          const categoryName = categories.find((c) => c.id === p.category_id)?.name || "";
          const supplierName = suppliers.find((s) => s.id === p.supplier_id)?.name || "";
          const unitName = units.find((u) => u.id === p.unit_id)?.abbreviation || p.unit || "";

          // Campo combinado para busca multicritério - inclui todos os campos relevantes
          const combinedText = [
            p.name,
            p.sku,
            p.alternative_code,
            (p as any).barcode,
            brandName,
            locName,
            categoryName,
            supplierName,
            unitName,
            p.description,
            p.cost_price?.toString(),
            p.sale_price?.toString(),
            p.stock?.toString(),
            productRefsMap.get(p.id) || "",
          ]
            .filter(Boolean)
            .join(" ");

          const match = matchSearch(combinedText, search);

          if (match) return true;

          // Fallback para scanners que adicionam prefixo 'a'
          const q = normalize(search.trim());
          if (q.startsWith("a") && q.length > 2) {
            return matchSearch(combinedText, search.trim().substring(1));
          }
          return false;
        })
      : [...products];

    if (brandFilter !== "all") {
      result = result.filter((p) =>
        productMatchesBrand(p.id, p.brand_id, brandFilter, productRefsBrandMap),
      );
    }

    // Ordenação padrão por nome se não houver configuração
    const effectiveSortConfig = sortConfig || { key: "name", direction: "asc" as const };

    result.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (effectiveSortConfig.key === "brand_name") {
        aValue = brands.find((brand) => brand.id === a.brand_id)?.name || a.brand || "";
        bValue = brands.find((brand) => brand.id === b.brand_id)?.name || b.brand || "";
      } else if (effectiveSortConfig.key === "margin") {
        const aCost = Number(a.cost_price);
        const aSale = Number(a.sale_price);
        aValue = aCost > 0 ? ((aSale - aCost) / aCost) * 100 : 0;

        const bCost = Number(b.cost_price);
        const bSale = Number(b.sale_price);
        bValue = bCost > 0 ? ((bSale - bCost) / bCost) * 100 : 0;
      } else {
        aValue = a[effectiveSortConfig.key as keyof Product];
        bValue = b[effectiveSortConfig.key as keyof Product];
      }

      if (aValue === null || aValue === undefined) aValue = "";
      if (bValue === null || bValue === undefined) bValue = "";

      // Se os valores forem iguais, usamos o nome como critério de desempate
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

      // Desempate por nome (sempre ASC)
      return compareProductNames(a.name, b.name);
    });

    return result;
  }, [
    products,
    search,
    brands,
    sortConfig,
    brandFilter,
    productRefsBrandMap,
    locations,
    categories,
    suppliers,
    units,
    productRefsMap,
  ]);

  const paginated = filtered;

  // Reset page when search changes
  useMemo(() => setCurrentPage(1), [debouncedSearch]);

  // Persist last-used selections across modal open/close in the same session
  const lastSelectionRef = useRef<{
    brandId: string;
    categoryId: string;
    supplierId: string;
    locationId: string;
    unitId: string;
  }>({
    brandId: "none",
    categoryId: "none",
    supplierId: "none",
    locationId: "none",
    unitId: "none",
  });

  const openNew = () => {
    setEditing(null);
    setSubmitAttempted(false);
    setConfirmNoStockCode(false);
    const defaultUnit = units.find((u) => u.abbreviation === "UN");
    let initialUnitId = lastSelectionRef.current.unitId;
    if (initialUnitId === "none" && defaultUnit) {
      initialUnitId = defaultUnit.id;
    }

    setForm({
      ...empty,
      ...lastSelectionRef.current,
      unitId: initialUnitId,
    });
    setOpen(true);
  };

  const handlePrintList = () => {
    printList({
      title: "Lista de Produtos",
      subtitle: search ? `Filtro: "${search}"` : undefined,
      columns: [
        { header: "Produto", accessor: (p: Product) => p.name },
        { header: "Código", accessor: (p: Product) => p.sku || "—" },
        {
          header: "Marca",
          accessor: (p: Product) => brands.find((b) => b.id === p.brand_id)?.name || "—",
        },
        { header: "Custo", accessor: (p: Product) => brl(p.cost_price || 0), align: "right" },
        { header: "Venda", accessor: (p: Product) => brl(p.sale_price || 0), align: "right" },
        {
          header: "Estoque",
          accessor: (p: Product) =>
            `${p.stock} ${units.find((u) => u.id === p.unit_id)?.abbreviation || ""}`.trim(),
          align: "center",
        },
      ],
      rows: filtered,
    });
  };

  // Verifica se o produto está reservado em pedido Delivery ativo ou carrinho do PDV.
  // Retorna mensagem de bloqueio ou null se livre.
  const checkProductLock = async (productId: string): Promise<string | null> => {
    // 1. Delivery: buscar sale_items do produto e cruzar com delivery_orders ativos
    const { data: itemRows } = await appwrite
      .from("sale_items")
      .select("sale_id")
      .eq("product_id", productId);
    const saleIds = Array.from(
      new Set((itemRows || []).map((r: any) => r.sale_id).filter(Boolean)),
    );
    if (saleIds.length) {
      const { data: orders } = await appwrite
        .from("delivery_orders")
        .select("id, customer_name, status")
        .in("sale_id", saleIds)
        .in("status", ["aguardando_confirmacao", "preparo", "rota"]);
      if (orders && orders.length > 0) {
        return `Este produto está reservado para o Delivery (Cliente: ${orders[0].customer_name}).`;
      }
    }
    // 2. PDV: reservas temporárias no carrinho
    const { data: pdvReservations } = await (appwrite as any)
      .from("stock_reservations")
      .select("id")
      .eq("product_id", productId)
      .gt("expires_at", new Date().toISOString());
    if (pdvReservations && pdvReservations.length > 0) {
      return "Este produto está no carrinho de vendas de algum PDV.";
    }
    return null;
  };

  const openEdit = async (p: Product) => {
    const lockMsg = await checkProductLock(p.id);
    if (lockMsg) {
      toast.error(`Não é possível editar: ${lockMsg}`);
      return;
    }
    setEditing(p);
    setSubmitAttempted(false);
    setConfirmNoStockCode(false);
    const fallbackUnit = units.find((u) => u.abbreviation === (p.unit || "UN"));
    let refs: ProductRefRow[] = [];
    try {
      const data = await fetchProductReferences(p.id);
      refs = data.map((r) => ({
        id: r.id,
        brandId: r.brand_id ?? "none",
        brandName: r.brand_name ?? "",
        manufacturerCode: r.manufacturer_code,
      }));
    } catch {
      refs = [];
    }
    setForm({
      name: p.name,
      sku: p.sku,
      alternativeCode: p.alternative_code || "",
      barcode: (p as any).barcode || "",
      brandId: p.brand_id ?? "none",
      categoryId: p.category_id ?? "none",
      supplierId: p.supplier_id ?? "none",
      locationId: (p as any).location_id ?? "none",
      unitId: (p as any).unit_id ?? fallbackUnit?.id ?? "none",
      costPrice: formatCurrency(Number(p.cost_price)),
      salePrice: formatCurrency(Number(p.sale_price)),
      stock: String(p.stock),
      minStock: String(p.min_stock),
      description: p.description || "",
      imageUrl: p.image_url || "",
      references: refs,
    });
    setOpen(true);
  };

  const keepOpenRef = useRef(false);
  const ignoreDuplicateRef = useRef(false);
  const dictationRecognitionRef = useRef<any>(null);
  const dictationStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dictationProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dictationShouldContinueRef = useRef(false);
  const dictationStartedAtRef = useRef(0);
  const dictationStartingRef = useRef(false);

  const clearDictationProgress = () => {
    if (dictationProgressTimerRef.current) {
      clearInterval(dictationProgressTimerRef.current);
      dictationProgressTimerRef.current = null;
    }
  };

  useEffect(() => () => clearDictationProgress(), []);

  // Auto-set default unit if units load while modal is open and no unit is selected
  useEffect(() => {
    if (open && !editing && form.unitId === "none" && units.length > 0) {
      const defaultUnit = units.find((u) => u.abbreviation === "UN");
      if (defaultUnit) {
        setForm((f) => ({ ...f, unitId: defaultUnit.id }));
      }
    }
  }, [open, editing, units, form.unitId]);

  const stopDescriptionDictation = () => {
    dictationShouldContinueRef.current = false;
    dictationStartingRef.current = false;
    clearDictationProgress();
    if (dictationStopTimerRef.current) {
      clearTimeout(dictationStopTimerRef.current);
      dictationStopTimerRef.current = null;
    }
    try {
      dictationRecognitionRef.current?.stop();
    } catch {
      // reconhecimento já encerrado
    }
    dictationRecognitionRef.current = null;
    setIsDictating(false);
  };

  const startDescriptionDictation = () => {
    if (isDictating || dictationStartingRef.current || dictationShouldContinueRef.current) return;
    if (!aiEnabled || !aiConnectionValidated) {
      toast.error("Ative e valide a conexão com IA nas configurações");
      return;
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Seu navegador não suporta ditado por voz");
      return;
    }
    const isMobileSpeech = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    dictationStartingRef.current = true;
    setIsDictating(true);
    setDictationElapsed(0);
    dictationShouldContinueRef.current = true;
    dictationStartedAtRef.current = Date.now();
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = !isMobileSpeech;
    let interimText = "";
    const finalTranscripts: string[] = [];
    let finalized = false;
    dictationRecognitionRef.current = recognition;
    recognition.onstart = () => {
      dictationStartingRef.current = false;
      if (!dictationProgressTimerRef.current) {
        dictationProgressTimerRef.current = setInterval(() => {
          setDictationElapsed(
            Math.min(45, Math.floor((Date.now() - dictationStartedAtRef.current) / 1000)),
          );
        }, 500);
      }
      if (!dictationStopTimerRef.current) {
        dictationStopTimerRef.current = setTimeout(() => recognition.stop(), 45000);
      }
    };
    recognition.onerror = (event: any) => {
      if (dictationShouldContinueRef.current && ["no-speech", "aborted"].includes(event?.error))
        return;
      dictationShouldContinueRef.current = false;
      dictationStartingRef.current = false;
      if (dictationStopTimerRef.current) clearTimeout(dictationStopTimerRef.current);
      clearDictationProgress();
      dictationStopTimerRef.current = null;
      dictationRecognitionRef.current = null;
      setIsDictating(false);
      toast.error("Não foi possível capturar o áudio");
    };
    recognition.onend = () => {
      if (
        dictationShouldContinueRef.current &&
        Date.now() - dictationStartedAtRef.current < 45000
      ) {
        try {
          dictationStartingRef.current = true;
          recognition.start();
          return;
        } catch {
          dictationStartingRef.current = false;
          dictationShouldContinueRef.current = false;
        }
      }
      if (finalized) return;
      finalized = true;
      dictationShouldContinueRef.current = false;
      dictationStartingRef.current = false;
      if (dictationStopTimerRef.current) clearTimeout(dictationStopTimerRef.current);
      clearDictationProgress();
      dictationStopTimerRef.current = null;
      dictationRecognitionRef.current = null;
      setIsDictating(false);
      const finalText = finalTranscripts.join(" ").trim() || interimText.trim();
      if (finalText.trim()) {
        setForm((current) => ({
          ...current,
          description: [current.description.trim(), finalText.trim()].filter(Boolean).join(" "),
        }));
      }
    };
    recognition.onresult = (event: any) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript?.trim();
        if (!transcript) continue;
        if (event.results[index].isFinal) {
          if (finalTranscripts[finalTranscripts.length - 1] !== transcript)
            finalTranscripts.push(transcript);
          interimText = "";
        } else {
          interimText = transcript;
        }
      }
    };
    recognition.start();
  };

  const [confirmNoStockCode, setConfirmNoStockCode] = useState(false);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("O nome do produto é obrigatório");
      if (!form.sku.trim()) throw new Error("O Código Fabricante é obrigatório");

      let stockCode = form.alternativeCode.trim();
      if (!stockCode && !confirmNoStockCode) {
        setConfirmNoStockCode(true);
        throw new Error("__MISSING_STOCK_CODE__");
      }

      if (!stockCode && confirmNoStockCode) {
        stockCode = generateStockCode();
        setForm((f) => ({ ...f, alternativeCode: stockCode }));
      } else if (stockCode) {
        const stockErr = validateStockCode(stockCode);
        if (stockErr) throw new Error(stockErr);
      }

      const skuNorm = form.sku.trim().toLowerCase();
      const altCodeNorm = stockCode.toLowerCase();
      const barcodeNorm = form.barcode.trim();

      const duplicate = products.find((p) => {
        const pSkuNorm = p.sku.trim().toLowerCase();
        const pAltNorm = (p.alternative_code || "").trim().toLowerCase();
        const pBarcode = ((p as any).barcode || "").trim();

        return (
          (pSkuNorm === skuNorm ||
            (altCodeNorm && pSkuNorm === altCodeNorm) ||
            (skuNorm && pAltNorm === skuNorm) ||
            (altCodeNorm && pAltNorm === altCodeNorm) ||
            (barcodeNorm && pBarcode === barcodeNorm)) &&
          p.id !== editing?.id
        );
      });
      if (duplicate && !ignoreDuplicateRef.current) {
        setDuplicateProduct(duplicate);
        throw new Error("__DUPLICATE_PRODUCT__");
      }
      const selectedBrand = brands.find((b) => b.id === form.brandId);
      const selectedUnit = units.find((u) => u.id === form.unitId);
      const unitIdValue = form.unitId === "none" ? null : form.unitId;
      const unitAbbrValue = selectedUnit?.abbreviation || "UN";
      const payload = {
        sku: form.sku.trim(),
        alternative_code: stockCode || null,
        barcode: barcodeNorm || null,
        name: form.name.trim(),
        brand: selectedBrand?.name || null,
        brand_id: form.brandId === "none" ? null : form.brandId,
        category_id: form.categoryId,
        supplier_id: form.supplierId === "none" ? null : form.supplierId,
        location_id: form.locationId === "none" ? null : form.locationId,
        unit: unitAbbrValue,
        unit_id: unitIdValue,
        description: form.description.trim() || null,
        image_url: form.imageUrl || null,
        cost_price: parseCurrency(form.costPrice),
        sale_price: parseCurrency(form.salePrice),
        min_stock: Math.max(0, Number(form.minStock) || 0),
        stock: Math.max(0, Number(form.stock) || 0),
        userId: user?.id,
      };
      let savedId: string;
      if (editing) {
        await updateProduct(
          editing.id,
          {
            sku: payload.sku,
            alternative_code: payload.alternative_code,
            barcode: payload.barcode,
            name: payload.name,
            brand: payload.brand,
            brand_id: payload.brand_id,
            category_id: payload.category_id,
            supplier_id: payload.supplier_id,
            location_id: payload.location_id,
            unit: payload.unit,
            unit_id: payload.unit_id,
            description: payload.description,
            image_url: payload.image_url,
            cost_price: payload.cost_price,
            sale_price: payload.sale_price,
            min_stock: payload.min_stock,
          } as any,
          user?.id,
        );
        savedId = editing.id;
        
        // Registrar ajuste de estoque se houve alteração manual no modal
        if (Number(editing.stock) !== payload.stock) {
          try {
            await registerMovement({
              companyId: cid,
              productId: editing.id,
              type: "ajuste",
              quantity: payload.stock,
              reason: "Alteração manual via edição de produto",
              userId: user?.id || "",
            });
          } catch (err) {
            console.error("Falha ao registrar movimento de ajuste:", err);
          }
        }
      } else {
        const created = await createProduct(cid, payload);
        savedId = created.id;
      }
      // Sincronizar referências (marcas + códigos adicionais)
      try {
        const filteredRefs = form.references
          .filter((r) => {
            const hasBrand = r.brandId !== "none" && r.brandId !== payload.brand_id;
            const hasCode =
              (r.manufacturerCode || "").trim().length > 0 &&
              r.manufacturerCode.trim() !== payload.sku;
            return hasBrand || hasCode;
          })
          .map((r) => ({
            brand_id: r.brandId === "none" ? null : r.brandId,
            manufacturer_code: r.manufacturerCode.trim(),
          }));

        await replaceProductReferences(cid, savedId, filteredRefs);
      } catch (err) {
        console.error("Falha ao salvar referências do produto", err);
      }
    },
    onSuccess: () => {
      ignoreDuplicateRef.current = false;
      setConfirmNoStockCode(false);
      toast.success(editing ? "Sucesso! Produto atualizado." : "Sucesso! Produto cadastrado.");
      qc.invalidateQueries({ queryKey: ["products-paginated"] });
      qc.invalidateQueries({ queryKey: ["products-paginated-stock"] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["product_references", cid] });
      if (!editing) {
        lastSelectionRef.current = {
          brandId: form.brandId,
          categoryId: form.categoryId,
          supplierId: "none",
          locationId: "none",
          unitId: form.unitId,
        };
      }
      if (keepOpenRef.current && !editing) {
        const defaultUnit = units.find((u) => u.abbreviation === "UN");
        setForm({
          ...empty,
          ...lastSelectionRef.current,
          unitId: form.unitId !== "none" ? form.unitId : (defaultUnit?.id ?? "none"),
          name: "",
        });
        setSubmitAttempted(false);
        keepOpenRef.current = false;
        // Garantir foco no campo nome após cadastrar e manter aberto
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 100);
      } else {
        keepOpenRef.current = false;
        setOpen(false);
      }
    },
    onError: (e: Error) => {
      keepOpenRef.current = false;
      if (e.message === "__DUPLICATE_PRODUCT__" || e.message === "__MISSING_STOCK_CODE__") return;
      ignoreDuplicateRef.current = false;
      setConfirmNoStockCode(false);
      toast.error(`Erro: ${e.message}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteProduct(id, user?.id);
        return { inactivated: false };
      } catch (err: any) {
        const msg = String(err?.message ?? "");
        const code = err?.code;
        if (
          code === "23503" ||
          msg.includes("foreign key") ||
          msg.includes("violates foreign key")
        ) {
          await updateProduct(id, { active: false } as any, user?.id);
          return { inactivated: true };
        }
        throw err;
      }
    },
    onSuccess: (res) => {
      if (res.inactivated) {
        toast.success("Produto inativado com sucesso!", {
          description:
            "Este produto possui registros vinculados e foi inativado para manter o histórico.",
        });
      } else {
        toast.success("Sucesso! Produto excluído.");
      }
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  const createCatMut = useMutation({
    mutationFn: () => createCategory(cid, catName.trim(), undefined, user?.id),
    onSuccess: (cat) => {
      toast.success("Sucesso! Categoria criada.");
      qc.invalidateQueries({ queryKey: ["categories", cid] });
      setForm((f) => ({ ...f, categoryId: cat.id }));
      setCatName("");
      setCatOpen(false);
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("categoria"));
      else toast.error(`Erro: ${e.message}`);
    },
  });

  const createSupMut = useMutation({
    mutationFn: () =>
      upsertPartner(cid, { name: supName.trim(), type: "fornecedor", userId: user?.id }),
    onSuccess: (sup) => {
      toast.success("Sucesso! Fornecedor cadastrado.");
      qc.invalidateQueries({ queryKey: ["partners", cid] });
      qc.invalidateQueries({ queryKey: ["partners", cid, "fornecedor"] });
      setForm((f) => ({ ...f, supplierId: sup.id }));
      setSupName("");
      setSupOpen(false);
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("fornecedor"));
      else toast.error(`Erro: ${e.message}`);
    },
  });
  const createBrandMut = useMutation({
    mutationFn: () => createBrand(cid, brandName.trim(), user?.id),
    onSuccess: (brand) => {
      toast.success("Sucesso! Marca criada.");
      qc.invalidateQueries({ queryKey: ["brands", cid] });
      if (refBrandPickerIndex !== null) {
        setForm((f) => {
          const refs = [...f.references];
          if (refs[refBrandPickerIndex!]) {
            refs[refBrandPickerIndex!] = {
              ...refs[refBrandPickerIndex!],
              brandId: brand.id,
              brandName: brand.name,
            };
          }
          return { ...f, references: refs };
        });
        setRefBrandPickerIndex(null);
      } else {
        setForm((f) => ({ ...f, brandId: brand.id }));
      }
      setBrandName("");
      setBrandOpen(false);
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("marca"));
      else toast.error(`Erro: ${e.message}`);
    },
  });

  const createLocMut = useMutation({
    mutationFn: () => createStockLocation(cid, locName.trim(), user?.id),
    onSuccess: (loc) => {
      toast.success("Sucesso! Localização criada.");
      qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
      setForm((f) => ({ ...f, locationId: loc.id }));
      setLocName("");
      setLocOpen(false);
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("localização"));
      else toast.error(`Erro: ${e.message}`);
    },
  });

  const createUnitMut = useMutation({
    mutationFn: () =>
      createUnit(cid, { abbreviation: unitAbbr.trim(), description: unitDesc.trim() }),
    onSuccess: (unit) => {
      toast.success("Sucesso! Unidade criada.");
      qc.invalidateQueries({ queryKey: ["units", cid] });
      setForm((f) => ({ ...f, unitId: unit.id }));
      setUnitAbbr("");
      setUnitDesc("");
      setUnitOpen(false);
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("unidade"));
      else toast.error(`Erro: ${e.message}`);
    },
  });

  const stockMut = useMutation({
    mutationFn: async ({
      id,
      type,
      diff,
      userId,
    }: {
      id: string;
      type: "entrada" | "saida" | "ajuste";
      diff: number;
      userId: string;
    }) => {
      if (diff !== 0 || type === "ajuste") {
        await registerMovement({
          companyId: cid,
          productId: id,
          type: type,
          quantity: Math.abs(diff),
          reason: "Ajuste rápido na listagem",
          userId: userId,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", cid] });
      qc.invalidateQueries({ queryKey: ["products-paginated"] });
      qc.invalidateQueries({ queryKey: ["products-paginated-stock"] });
      toast.success("Estoque atualizado!");
    },
    onError: (e: Error) => toast.error(`Erro ao atualizar estoque: ${e.message}`),
  });

  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingStockValue, setEditingStockValue] = useState<string>("");
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [stockConfirm, setStockConfirm] = useState<{
    product: Product;
    diff: number;
    description: string;
  } | null>(null);

  const handleStockChange = async (p: Product, delta: number) => {
    if (isUpdatingStock || stockMut.isPending) return;
    const newStock = Number(p.stock) + delta;
    if (newStock < 0) return;

    const lockMsg = await checkProductLock(p.id);
    if (lockMsg) {
      toast.error(`Não é possível alterar o estoque: ${lockMsg}`);
      return;
    }

    const action = delta > 0 ? "adicionar" : "remover";
    const amount = Math.abs(delta);
    setStockConfirm({
      product: p,
      diff: delta,
      description: `Deseja realmente ${action} ${amount} unidade(s) ao estoque de "${p.name}"?`,
    });
  };

  const startEditStock = async (p: Product) => {
    const lockMsg = await checkProductLock(p.id);
    if (lockMsg) {
      toast.error(`Não é possível alterar o estoque: ${lockMsg}`);
      return;
    }
    setEditingStockId(p.id);
    setEditingStockValue(String(p.stock));
  };

  const commitEditStock = (p: Product) => {
    if (isUpdatingStock || stockMut.isPending) return;

    const parsed = Number(editingStockValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Quantidade inválida");
      setEditingStockId(null);
      return;
    }
    const current = Number(p.stock);
    if (parsed === current) {
      setEditingStockId(null);
      return;
    }

    const diff = parsed - current;
    setEditingStockId(null);
    setStockConfirm({
      product: p,
      diff,
      description: `Deseja alterar o estoque de "${p.name}" de ${current} para ${parsed}?`,
    });
  };

  const confirmStockChange = () => {
    if (!stockConfirm) return;
    const { product, diff } = stockConfirm;
    setStockConfirm(null);
    setIsUpdatingStock(true);
    stockMut.mutate(
      {
        id: product.id,
        type: diff > 0 ? "entrada" : "saida",
        diff,
        userId: user?.id || "",
      },
      {
        onSettled: () => setIsUpdatingStock(false),
      },
    );
  };

  const batchTransferMut = useMutation({
    mutationFn: async (locId: string | null) => {
      const ids = Array.from(selectedProductIds);
      const results: { id: string; name: string; success: boolean; error?: string }[] = [];
      let completedCount = 0;

      const toastId = "batch-transfer-progress";
      toast.loading(`Transferindo: 0/${ids.length} (0%)`, { id: toastId });

      for (const productId of ids) {
        try {
          const product = products.find((p) => p.id === productId);
          const productName = product?.name || productId;

          const { error } = await appwrite
            .from("products")
            .update({
              location_id: locId === "none" ? null : locId,
              updated_by: user?.id,
            })
            .eq("id", productId);

          if (error) throw error;

          if (user?.id) {
            await logActivity({
              companyId: cid,
              userId: user.id,
              action: "UPDATE",
              entity: "products",
              entityId: productId,
              meta: { patch: { location_id: locId }, note: "Transferência em lote (individual)" },
            });
          }

          results.push({ id: productId, name: productName, success: true });
        } catch (err: any) {
          const product = products.find((p) => p.id === productId);
          results.push({
            id: productId,
            name: product?.name || productId,
            success: false,
            error: err.message || "Erro desconhecido",
          });
        }

        completedCount++;
        const percent = Math.round((completedCount / ids.length) * 100);
        toast.loading(`Transferindo: ${completedCount}/${ids.length} (${percent}%)`, {
          id: toastId,
        });
      }

      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      toast.dismiss("batch-transfer-progress");

      if (failCount === 0) {
        toast.success(`Sucesso! ${successCount} produtos transferidos.`);
      } else {
        const failDetails = results
          .filter((r) => !r.success)
          .map((r) => `${r.name}: ${r.error}`)
          .join(", ");

        confirm({
          title: "Resumo da Transferência",
          description: `${successCount} transferidos com sucesso. ${failCount} falhas encontradas: ${failDetails}`,
          confirmLabel: "Entendido",
        });
      }

      setSelectedProductIds(new Set());
      qc.invalidateQueries({ queryKey: ["products-paginated", cid] });
    },
    onError: (e: Error) => {
      toast.dismiss("batch-transfer-progress");
      toast.error(`Erro crítico na operação: ${e.message}`);
    },
  });

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(selectedProductIds);
      products.forEach((p) => allIds.add(p.id));
      setSelectedProductIds(allIds);
    } else {
      const allIds = new Set(selectedProductIds);
      products.forEach((p) => allIds.delete(p.id));
      setSelectedProductIds(allIds);
    }
  };

  const toggleSelectProduct = (id: string, checked: boolean) => {
    const next = new Set(selectedProductIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedProductIds(next);
  };

  const cancelEditStock = () => {
    setEditingStockId(null);
    setEditingStockValue("");
  };

  const generateSKU = () => {
    const random = Math.floor(100000 + Math.random() * 900000);
    setForm((f) => ({ ...f, sku: String(random) }));
  };

  // Gera um código de estoque único compatível com Code 128 (apenas A-Z e 0-9).
  const generateStockCode = (): string => {
    const existing = new Set(
      products.map((p) => (p.alternative_code || "").toUpperCase()).filter(Boolean),
    );
    for (let i = 0; i < 20; i++) {
      const ts = Date.now().toString(36).toUpperCase();
      const rnd = Math.floor(Math.random() * 1679616)
        .toString(36)
        .toUpperCase()
        .padStart(4, "0");
      const code = `EST${ts}${rnd}`;
      if (!existing.has(code)) return code;
    }
    return `EST${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeading
          icon={Package}
          title="Produtos"
          subtitle={`${totalProductsCount} cadastrado(s)`}
        />
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <ValueVisibilityToggle
              hidden={visibility.hidden}
              canToggle={visibility.canToggle}
              onToggle={visibility.toggle}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLabelProducts(filtered);
                setLabelOpen(true);
              }}
              disabled={filtered.length === 0}
              className="flex-1 sm:flex-none border-brand-orange/20 text-brand-orange hover:bg-brand-orange/10 shrink-0"
            >
              <ScanBarcode className="size-4 mr-2" />
              <span className="whitespace-nowrap">Etiquetas</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAuditOpen(true)}
              className="flex-1 sm:flex-none border-blue-500/20 text-blue-500 hover:bg-blue-500/10 shrink-0"
            >
              <FileText className="size-4 mr-2" />
              <span className="whitespace-nowrap">Auditoria</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedProductIds.size === 0}
              onClick={() => setBatchLocPickerOpen(true)}
              className={cn(
                "flex-1 sm:flex-none border-indigo-500/20 text-indigo-500 hover:bg-indigo-500/10 shrink-0",
                selectedProductIds.size > 0 && "bg-indigo-500/5 animate-pulse border-indigo-500/40",
              )}
            >
              <MapPin className="size-4 mr-2" />
              <span className="whitespace-nowrap">
                Transferir {selectedProductIds.size > 0 ? `(${selectedProductIds.size})` : ""}
              </span>
            </Button>
          </div>

          <Dialog
            open={open}
            onOpenChange={(o) => {
              if (!o) {
                setSubmitAttempted(false);
                setConfirmNoStockCode(false);
                setRefBrandPickerIndex(null);
                // Forçar atualização da lista ao fechar o modal
                qc.invalidateQueries({ queryKey: ["products-paginated"] });
              }
              setOpen(o);
            }}
          >
            <DialogTrigger asChild>
              <Button
                onClick={openNew}
                size="sm"
                className="w-full sm:w-auto bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground shrink-0"
              >
                <Plus className="size-4 mr-2" />
                <span className="whitespace-nowrap">Novo Produto</span>
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-2xl max-h-[90vh] overflow-y-auto"
              onInteractOutside={(e) => {
                // Se for mobile e o usuário clicar fora, permitimos fechar se ele quiser,
                // mas o ideal é que ele use o botão Cancelar ou Salvar.
                // Para garantir a atualização, vamos interceptar o fechamento via onOpenChange
              }}
            >
              <DialogHeader>
                <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
              </DialogHeader>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitAttempted(true);
                  saveMut.mutate();
                }}
                className="grid gap-4 sm:grid-cols-2"
              >
                {editing && (
                  <div className="sm:col-span-2 flex flex-col gap-1 text-[11px] text-muted-foreground bg-muted/30 p-3 rounded-md mb-2 border border-border/50">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <User className="size-3 text-blue-500" />
                        <span>
                          Cadastrado por:{" "}
                          <span className="font-semibold text-foreground">
                            {editing.profiles?.name || "Desconhecido"}
                          </span>
                        </span>
                      </div>
                      <span className="opacity-80">
                        em{" "}
                        {new Date(editing.created_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    {editing.updated_at && editing.updated_at !== editing.created_at && (
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 pt-1 border-t border-border/30 mt-1">
                        <div className="flex items-center gap-1.5">
                          <RefreshCw className="size-3 text-amber-500" />
                          <span>
                            Última alteração por:{" "}
                            <span className="font-semibold text-foreground">
                              {(editing as any).last_editor_profile?.name ||
                                editing.profiles?.name ||
                                "Desconhecido"}
                            </span>
                          </span>
                        </div>
                        <span className="opacity-80 italic">
                          em{" "}
                          {new Date(editing.updated_at).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="sm:col-span-2 space-y-2">
                  <Label>
                    Nome <span className="text-brand-red">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      ref={nameInputRef}
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={runAiProductLookup}
                      disabled={
                        (!aiLookupAvailable && aiSettingsQ.data?.model !== "custom/n8n-webhook") ||
                        !form.name.trim() ||
                        aiLookupLoading
                      }
                      title={
                        aiSettingsQ.data?.model === "custom/n8n-webhook"
                          ? "Pesquisar via Webhook n8n"
                          : !aiLookupGloballyEnabled
                            ? "Consulta com IA desabilitada pelo administrador"
                            : !aiEnabled || !aiConnectionValidated
                              ? "Ative e valide a IA nas configurações"
                              : "Pesquisar informações com IA"
                      }
                    >
                      <Sparkles
                        className={cn(
                          "size-4",
                          aiLookupLoading && "animate-pulse text-brand-orange",
                        )}
                      />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setQuickSearchTerm(form.name);
                        setQuickSearchOpen(true);
                        handleQuickSearch(form.name, "global");
                      }}
                      title="Busca rápida no estoque (todos os campos)"
                    >
                      <Search className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex h-6 items-center gap-1">
                    <Label>
                      Código Fabricante <span className="text-brand-red">*</span>
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      onClick={() => setCodeHelpOpen(true)}
                      title="Ajuda sobre os códigos"
                      aria-label="Ajuda sobre os códigos"
                    >
                      <HelpCircle className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      required
                      value={form.sku}
                      onChange={(e) => {
                        let val = e.target.value;
                        // Remove prefixo 'a' comum em scanners se seguido de letras maiúsculas ou números
                        if (val.startsWith("a") && val.length > 2) {
                          const rest = val.substring(1);
                          if (/^[A-Z0-9]/.test(rest)) {
                            val = rest;
                          }
                        }
                        setForm({ ...form, sku: val.toUpperCase() });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      placeholder="Código do fabricante"
                      className="flex-1"
                    />
                    {barcodeScannerEnabled && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setScanningField("sku");
                          setIsScanning(true);
                        }}
                        title="Escanear código do fabricante"
                      >
                        <ScanBarcode className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setQuickSearchTerm(form.sku);
                        setQuickSearchOpen(true);
                        handleQuickSearch(form.sku, "sku");
                      }}
                      title="Busca rápida por SKU/Fabricante"
                    >
                      <Search className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={generateSKU}
                      title="Gerar código aleatório"
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex h-6 items-center gap-1">
                    <Label>
                      Código Estoque <span className="text-brand-red">*</span>
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      ref={stockCodeInputRef}
                      value={form.alternativeCode}
                      onChange={(e) =>
                        setForm({ ...form, alternativeCode: e.target.value.toUpperCase() })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      placeholder="Deixe em branco para gerar"
                      className="flex-1"
                    />
                    {barcodeScannerEnabled && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setScanningField("alternativeCode");
                          setIsScanning(true);
                        }}
                        title="Escanear código de estoque"
                      >
                        <ScanBarcode className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setForm((f) => ({ ...f, alternativeCode: generateStockCode() }))
                      }
                      title="Gerar código de estoque"
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex h-6 items-center gap-1">
                    <Label>Código de Barras (EAN/GTIN)</Label>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={form.barcode}
                      onChange={(e) =>
                        setForm({ ...form, barcode: e.target.value.replace(/\s/g, "") })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      placeholder="EAN universal (opcional)"
                      className="flex-1"
                    />
                    {barcodeScannerEnabled && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setScanningField("barcode");
                          setIsScanning(true);
                        }}
                        title="Escanear código de barras"
                      >
                        <ScanBarcode className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2 space-y-2 border rounded-md p-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm">Marcas e códigos adicionais</Label>
                      <p className="text-xs text-muted-foreground">
                        O mesmo produto pode ter códigos de fabricante diferentes por marca
                        compatível.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          references: [
                            ...f.references,
                            { brandId: "none", brandName: "", manufacturerCode: "" },
                          ],
                        }))
                      }
                    >
                      <Plus className="size-3.5 mr-1" /> Adicionar
                    </Button>
                  </div>
                  {form.references.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Nenhuma referência adicional cadastrada.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {form.references.map((r, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <Button
                              type="button"
                              variant="outline"
                              className="h-9 w-full justify-between font-normal"
                              onClick={() => setRefBrandPickerIndex(idx)}
                            >
                              <span
                                className={cn(
                                  "truncate",
                                  r.brandId === "none" && "text-muted-foreground",
                                )}
                              >
                                {(
                                  brands.find((b) => b.id === r.brandId)?.name || "Marca"
                                ).toUpperCase()}
                              </span>
                              <ChevronDown className="size-4 opacity-50 shrink-0" />
                            </Button>
                          </div>
                          <div className="col-span-6">
                            <Input
                              value={r.manufacturerCode}
                              placeholder="Código do fabricante"
                              onChange={(e) =>
                                setForm((f) => {
                                  const refs = [...f.references];
                                  refs[idx] = {
                                    ...refs[idx],
                                    manufacturerCode: e.target.value.toUpperCase(),
                                  };
                                  return { ...f, references: refs };
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.preventDefault();
                              }}
                              className="h-9"
                            />
                          </div>
                          <div className="col-span-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  references: f.references.filter((_, i) => i !== idx),
                                }))
                              }
                              title="Remover"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>
                    Marca <span className="text-brand-red">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-between font-normal",
                      submitAttempted &&
                        form.brandId === "none" &&
                        "border-destructive ring-1 ring-destructive",
                    )}
                    onClick={() => setBrandPickerOpen(true)}
                  >
                    <span
                      className={cn("truncate", form.brandId === "none" && "text-muted-foreground")}
                    >
                      {(
                        brands.find((b) => b.id === form.brandId)?.name || "Selecione a marca"
                      ).toUpperCase()}
                    </span>
                    <ChevronDown className="size-4 opacity-50 shrink-0" />
                  </Button>
                  {submitAttempted && form.brandId === "none" && (
                    <p className="text-xs text-destructive">Selecione uma marca</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>
                    Categoria <span className="text-brand-red">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-between font-normal",
                      submitAttempted &&
                        form.categoryId === "none" &&
                        "border-destructive ring-1 ring-destructive",
                    )}
                    onClick={() => setCatPickerOpen(true)}
                  >
                    <span
                      className={cn(
                        "truncate",
                        form.categoryId === "none" && "text-muted-foreground",
                      )}
                    >
                      {(
                        categories.find((c) => c.id === form.categoryId)?.name ||
                        "Selecione a categoria"
                      ).toUpperCase()}
                    </span>
                    <ChevronDown className="size-4 opacity-50 shrink-0" />
                  </Button>
                  {submitAttempted && form.categoryId === "none" && (
                    <p className="text-xs text-destructive">Selecione uma categoria</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Fornecedor</Label>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                    onClick={() => setSupPickerOpen(true)}
                  >
                    <span
                      className={cn(
                        "truncate",
                        (form.supplierId === "none" || !form.supplierId) && "text-muted-foreground",
                      )}
                    >
                      {(
                        suppliers.find((s) => s.id === form.supplierId)?.name || "Sem fornecedor"
                      ).toUpperCase()}
                    </span>
                    <ChevronDown className="size-4 opacity-50 shrink-0" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>
                    Localização no estoque <span className="text-brand-red">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-between font-normal",
                      submitAttempted &&
                        form.locationId === "none" &&
                        "border-destructive ring-1 ring-destructive",
                    )}
                    onClick={() => setLocPickerOpen(true)}
                  >
                    <span
                      className={cn(
                        "truncate",
                        form.locationId === "none" && "text-muted-foreground",
                      )}
                    >
                      {(
                        locations.find((l) => l.id === form.locationId)?.name ||
                        "Selecione a localização"
                      ).toUpperCase()}
                    </span>
                    <ChevronDown className="size-4 opacity-50 shrink-0" />
                  </Button>
                  {submitAttempted && form.locationId === "none" && (
                    <p className="text-xs text-destructive">Selecione uma localização</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>
                    Unidade de medida <span className="text-brand-red">*</span>
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-between font-normal",
                      submitAttempted &&
                        form.unitId === "none" &&
                        "border-destructive ring-1 ring-destructive",
                    )}
                    onClick={() => setUnitPickerOpen(true)}
                  >
                    <span
                      className={cn("truncate", form.unitId === "none" && "text-muted-foreground")}
                    >
                      {(() => {
                        const u = units.find((x) => x.id === form.unitId);
                        return (
                          u ? `${u.abbreviation} — ${u.description}` : "Selecione a unidade"
                        ).toUpperCase();
                      })()}
                    </span>
                    <ChevronDown className="size-4 opacity-50 shrink-0" />
                  </Button>
                  {submitAttempted && form.unitId === "none" && (
                    <p className="text-xs text-destructive">Selecione uma unidade de medida</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Estoque mínimo</Label>
                  <Input
                    type="number"
                    value={form.minStock}
                    onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Margem de lucro definida (%)</Label>
                  <div className="relative">
                    <Input
                      value={profitMargin}
                      disabled
                      className="bg-muted text-muted-foreground cursor-not-allowed pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      %
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Info className="size-3" /> Configurado em Ajustes {"->"} Geral
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Preço de custo (R$)</Label>
                  <Input
                    inputMode="numeric"
                    value={form.costPrice}
                    onChange={(e) => {
                      const masked = maskCurrency(e.target.value);
                      const cost = parseCurrency(masked);
                      let nextSalePrice = form.salePrice;

                      if (profitMargin > 0 && cost > 0) {
                        const calculated = cost * (1 + profitMargin / 100);
                        nextSalePrice = formatCurrency(calculated);
                      }

                      setForm({ ...form, costPrice: masked, salePrice: nextSalePrice });
                    }}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço de venda (R$)</Label>
                  <Input
                    inputMode="numeric"
                    value={form.salePrice}
                    onChange={(e) => setForm({ ...form, salePrice: maskCurrency(e.target.value) })}
                    placeholder="0,00"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <Label>Mais detalhes do produto</Label>
                    <Info className="size-3 text-muted-foreground" />
                    {aiEnabled && (
                      <div className="ml-auto flex items-center gap-2">
                        {isDictating && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={stopDescriptionDictation}
                            title="Parar gravação"
                          >
                            <Square className="size-3" />
                            Parar gravação
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8"
                          onClick={startDescriptionDictation}
                          disabled={isDictating}
                          title="Descrever por áudio"
                        >
                          <Mic className={cn("size-4", isDictating && "text-brand-orange")} />
                        </Button>
                      </div>
                    )}
                  </div>
                  {isDictating && (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:hidden">
                      <div className="mb-1 flex items-center justify-between">
                        <span>Gravando...</span>
                        <span>{45 - dictationElapsed}s restantes</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: `${Math.min(100, Math.round((dictationElapsed / 45) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <Textarea
                    placeholder="Ex: Cor, tamanho, material ou especificações técnicas..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="min-h-[80px]"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Foto do Produto (Opcional)</Label>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-4">
                      <div
                        className="size-24 rounded-lg border-2 border-dashed border-muted flex items-center justify-center bg-muted/30 overflow-hidden cursor-pointer hover:border-brand-orange transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {form.imageUrl ? (
                          <img
                            src={form.imageUrl}
                            alt="Preview"
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-muted-foreground">
                            <Plus className="size-6 mb-1" />
                            <span className="text-[10px] uppercase font-bold">Adicionar</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Imagens em JPG ou PNG. Tamanho ideal: 400x400px.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUploading}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            {isUploading ? "Enviando..." : form.imageUrl ? "Alterar" : "Selecionar"}
                          </Button>
                          {form.imageUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-brand-red hover:text-brand-red/90 hover:bg-brand-red/10"
                              onClick={async () => {
                                try {
                                  // Extract filename from URL to delete from storage
                                  const url = new URL(form.imageUrl);
                                  const pathParts = url.pathname.split("/product-images/");
                                  if (pathParts.length > 1) {
                                    const filePath = decodeURIComponent(pathParts[1]);
                                    await appwrite.storage
                                      .from("product-images")
                                      .remove([filePath]);
                                  }
                                  setForm({ ...form, imageUrl: "" });
                                  toast.success("Imagem removida");
                                } catch (err: any) {
                                  console.error("Error removing image:", err);
                                  // Fallback: just clear the field if storage delete fails
                                  setForm({ ...form, imageUrl: "" });
                                }
                              }}
                            >
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        // Resize and Upload
                        setIsUploading(true);
                        try {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const img = new Image();
                            img.onload = async () => {
                              try {
                                const canvas = document.createElement("canvas");
                                const MAX_WIDTH = 400;
                                const MAX_HEIGHT = 400;
                                let width = img.width;
                                let height = img.height;

                                if (width > height) {
                                  if (width > MAX_WIDTH) {
                                    height *= MAX_WIDTH / width;
                                    width = MAX_WIDTH;
                                  }
                                } else {
                                  if (height > MAX_HEIGHT) {
                                    width *= MAX_HEIGHT / height;
                                    height = MAX_HEIGHT;
                                  }
                                }
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext("2d");
                                ctx?.drawImage(img, 0, 0, width, height);

                                canvas.toBlob(
                                  async (blob) => {
                                    try {
                                      if (!blob) throw new Error("Falha ao gerar blob da imagem");
                                      const fileName = `${cid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
                                      const { data, error } = await appwrite.storage
                                        .from("product-images")
                                        .upload(fileName, blob, {
                                          contentType: "image/jpeg",
                                          cacheControl: "3600",
                                          upsert: false,
                                        });

                                      if (error) throw error;

                                      const {
                                        data: { publicUrl },
                                      } = appwrite.storage
                                        .from("product-images")
                                        .getPublicUrl(data.path);

                                      setForm((f) => ({ ...f, imageUrl: publicUrl }));
                                      toast.success("Imagem enviada com sucesso");
                                    } catch (err: any) {
                                      toast.error("Erro no upload: " + err.message);
                                    } finally {
                                      setIsUploading(false);
                                    }
                                  },
                                  "image/jpeg",
                                  0.6,
                                );
                              } catch (err: any) {
                                toast.error("Erro ao processar imagem: " + err.message);
                                setIsUploading(false);
                              }
                            };
                            img.onerror = () => {
                              toast.error("Erro ao carregar arquivo de imagem");
                              setIsUploading(false);
                            };
                            img.src = event.target?.result as string;
                          };
                          reader.onerror = () => {
                            toast.error("Erro ao ler arquivo");
                            setIsUploading(false);
                          };
                          reader.readAsDataURL(file);
                        } catch (err: any) {
                          toast.error("Erro ao iniciar envio: " + err.message);
                          setIsUploading(false);
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>
                    Estoque <span className="text-brand-red ml-1">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    placeholder="Ex: 10, 50, 100"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Informe a quantidade atual em estoque (deve ser 0 ou maior).
                  </p>
                </div>
                <DialogFooter className="sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={saveMut.isPending}
                    onClick={() => {
                      keepOpenRef.current = !editing;
                    }}
                    className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
                  >
                    {saveMut.isPending ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!catName.trim()) return;
              createCatMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                autoFocus
                value={catName}
                onChange={(e) => setCatName(e.target.value.toUpperCase())}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCatOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createCatMut.isPending}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              >
                {createCatMut.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={supOpen} onOpenChange={setSupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo fornecedor (rápido)</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!supName.trim()) return;
              createSupMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nome / Razão social</Label>
              <Input
                autoFocus
                value={supName}
                onChange={(e) => setSupName(e.target.value.toUpperCase())}
                required
              />
              <p className="text-xs text-muted-foreground">
                Você pode completar os demais dados na página Clientes &amp; Fornecedores.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSupOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createSupMut.isPending}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              >
                {createSupMut.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={brandOpen} onOpenChange={setBrandOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova marca</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!brandName.trim()) return;
              createBrandMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Nome da marca</Label>
              <Input
                autoFocus
                value={brandName}
                onChange={(e) => setBrandName(e.target.value.toUpperCase())}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBrandOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createBrandMut.isPending}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              >
                {createBrandMut.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={locOpen} onOpenChange={setLocOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova localização</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!locName.trim()) return;
              createLocMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Identificação da localização</Label>
              <Input
                autoFocus
                value={locName}
                onChange={(e) => setLocName(e.target.value.toUpperCase())}
                placeholder="Ex.: Prateleira 1 - Lado A"
                required
              />
              <p className="text-xs text-muted-foreground">
                Use um padrão consistente, ex.: "Prateleira 1 - A", "Prateleira 1 - B".
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLocOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createLocMut.isPending}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              >
                {createLocMut.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="p-4">
        <div className="flex flex-col gap-3 mb-4">
          <div className="relative w-full">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto ou código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3">
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger className="h-10 text-xs sm:text-sm sm:w-[150px]">
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

            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="h-10 text-xs sm:text-sm sm:w-[180px]">
                <SelectValue placeholder="Localização" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas localizações</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div
              className="flex items-center gap-2 border rounded-md px-3 h-10 bg-background hover:bg-muted/50 transition-colors cursor-pointer select-none"
              onClick={() => setHasRefsFilter(!hasRefsFilter)}
            >
              <Checkbox
                id="has-refs"
                checked={hasRefsFilter}
                onCheckedChange={(v) => setHasRefsFilter(!!v)}
                onClick={(e) => e.stopPropagation()}
              />
              <Label htmlFor="has-refs" className="text-xs cursor-pointer whitespace-nowrap">
                MARCAS ADICIONAIS
              </Label>
            </div>

            <div className="flex gap-2 col-span-2 sm:col-span-1">
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  const newSize = Number(v);
                  setPageSize(newSize);
                  setCurrentPage(1);
                  localStorage.setItem("products_pageSize", String(newSize));
                }}
              >
                <SelectTrigger
                  className="h-10 flex-1 sm:w-[80px] sm:flex-none"
                  title="Itens por página"
                >
                  <SelectValue placeholder="Tam." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <PrintButton
                className="flex-1 sm:flex-none"
                onClick={handlePrintList}
                disabled={filtered.length === 0}
              />
            </div>
          </div>
        </div>
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] px-2">
                  <Checkbox
                    checked={
                      products.length > 0 && products.every((p) => selectedProductIds.has(p.id))
                    }
                    onCheckedChange={(v) => toggleSelectAll(v === true)}
                  />
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center gap-1">
                    Produto{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "name"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("sku")}
                >
                  <div className="flex items-center gap-1">
                    Código{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "sku"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("brand_name")}
                >
                  <div className="flex items-center gap-1">
                    Marca{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "brand_name"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("cost_price")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Custo{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "cost_price"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("sale_price")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Venda{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "sale_price"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("margin")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Margem{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "margin"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead
                  className="text-right cursor-pointer hover:bg-muted/50 transition-colors group select-none"
                  onClick={() => handleSort("stock")}
                >
                  <div className="flex items-center justify-end gap-1">
                    Estoque{" "}
                    <ArrowDownUp
                      className={cn(
                        "size-3",
                        sortConfig?.key === "stock"
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-50",
                      )}
                    />
                  </div>
                </TableHead>
                <TableHead className="text-right w-28">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((p) => {
                  const cost = Number(p.cost_price);
                  const sale = Number(p.sale_price);
                  const margin = cost > 0 ? ((sale - cost) / cost) * 100 : 0;
                  const lowStock = Number(p.stock) <= 0 || Number(p.stock) <= Number(p.min_stock);
                  return (
                    <TableRow
                      key={p.id}
                      className={cn(selectedProductIds.has(p.id) && "bg-indigo-500/5")}
                    >
                      <TableCell className="px-2">
                        <Checkbox
                          checked={selectedProductIds.has(p.id)}
                          onCheckedChange={(v) => toggleSelectProduct(p.id, v === true)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <div
                              className="size-10 rounded border bg-muted shrink-0 overflow-hidden cursor-pointer"
                              onClick={() => setSelectedImageUrl(p.image_url!)}
                            >
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="size-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="size-10 rounded border bg-muted shrink-0 flex items-center justify-center text-muted-foreground/30">
                              <Package className="size-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium truncate flex items-center gap-2">
                              {p.name}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-5 h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailsProduct(p);
                                }}
                              >
                                <Info className="size-3" />
                              </Button>
                              {(productRefsBrandMap.get(p.id)?.size ?? 0) > 0 && (
                                <span
                                  className="inline-flex items-center rounded-full bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-orange border border-brand-orange/20"
                                  title="Possui outras marcas cadastradas"
                                >
                                  + Marcas
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              {(() => {
                                const locName = locations.find(
                                  (l) => l.id === (p as any).location_id,
                                )?.name;
                                return locName ? (
                                  <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                    <MapPin className="size-3" /> {locName}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <div>{p.sku}</div>
                        {p.alternative_code && (
                          <div className="text-muted-foreground opacity-70">
                            {p.alternative_code}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {(
                          brands.find((b) => b.id === p.brand_id)?.name ||
                          p.brand ||
                          "—"
                        ).toUpperCase()}
                      </TableCell>
                      <TableCell className="text-right">{visibility.mask(brl(cost))}</TableCell>
                      <TableCell className="text-right font-medium">
                        {visibility.mask(brl(sale))}
                      </TableCell>
                      <TableCell className="text-right text-brand-orange">
                        {visibility.mask(`${margin.toFixed(0)}%`)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-7 h-7 w-7"
                            disabled={stockMut.isPending || isUpdatingStock}
                            onClick={() => handleStockChange(p, -1)}
                          >
                            <Minus className="size-3" />
                          </Button>
                          {editingStockId === p.id ? (
                            <Input
                              type="number"
                              min={0}
                              autoFocus
                              value={editingStockValue}
                              disabled={stockMut.isPending || isUpdatingStock}
                              onChange={(e) => setEditingStockValue(e.target.value)}
                              onBlur={() => commitEditStock(p)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEditStock(p);
                                else if (e.key === "Escape") cancelEditStock();
                              }}
                              className="h-7 w-16 text-center px-1"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditStock(p)}
                              title="Clique para editar"
                              className={
                                lowStock
                                  ? "text-brand-red font-semibold min-w-[24px] text-center hover:underline"
                                  : "font-medium min-w-[24px] text-center hover:underline"
                              }
                            >
                              {p.stock}
                            </button>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-7 h-7 w-7"
                            disabled={stockMut.isPending || isUpdatingStock}
                            onClick={() => handleStockChange(p, 1)}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(p)}
                          title="Editar"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            const lockMsg = await checkProductLock(p.id);
                            if (lockMsg) {
                              toast.error(`Não é possível excluir: ${lockMsg}`);
                              return;
                            }
                            if (
                              await confirm({
                                title: "Excluir produto?",
                                description: `Tem certeza que deseja excluir "${p.name}"? Esta ação não pode ser desfeita.`,
                                confirmLabel: "Excluir",
                              })
                            )
                              deleteMut.mutate(p.id);
                          }}
                        >
                          <Trash2 className="size-4 text-brand-red" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {productsQ.isLoading ? (
            <div className="text-center text-muted-foreground py-10">Carregando...</div>
          ) : paginated.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">
              Nenhum produto encontrado.
            </div>
          ) : (
            paginated.map((p) => {
              const lowStock = Number(p.stock) <= 0 || Number(p.stock) <= Number(p.min_stock);
              return (
                <Card
                  key={p.id}
                  className={cn(
                    "p-4 space-y-3 border-l-4 border-l-brand-orange",
                    selectedProductIds.has(p.id) && "bg-indigo-500/5 border-l-indigo-500",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selectedProductIds.has(p.id)}
                      onCheckedChange={(v) => toggleSelectProduct(p.id, v === true)}
                      className="mt-1"
                    />
                    <div className="flex gap-3 flex-1 min-w-0">
                      {p.image_url && (
                        <div
                          className="size-16 rounded border bg-muted shrink-0 overflow-hidden"
                          onClick={() => setSelectedImageUrl(p.image_url!)}
                        >
                          <img src={p.image_url} alt={p.name} className="size-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-base truncate flex items-center gap-2">
                          {p.name}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5 h-5 w-5 p-0 text-muted-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailsProduct(p);
                            }}
                          >
                            <Info className="size-3" />
                          </Button>
                          {(productRefsBrandMap.get(p.id)?.size ?? 0) > 0 && (
                            <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-orange border border-brand-orange/20">
                              + Marcas
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {p.sku} ·{" "}
                          {(
                            brands.find((b) => b.id === p.brand_id)?.name ||
                            p.brand ||
                            "Sem marca"
                          ).toUpperCase()}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          {(() => {
                            const locName = locations.find(
                              (l) => l.id === (p as any).location_id,
                            )?.name;
                            return locName ? (
                              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                <MapPin className="size-3" /> {locName}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7 h-7 w-7"
                        disabled={stockMut.isPending || isUpdatingStock}
                        onClick={() => handleStockChange(p, -1)}
                      >
                        <Minus className="size-3" />
                      </Button>
                      {editingStockId === p.id ? (
                        <Input
                          type="number"
                          min={0}
                          autoFocus
                          value={editingStockValue}
                          disabled={stockMut.isPending || isUpdatingStock}
                          onChange={(e) => setEditingStockValue(e.target.value)}
                          onBlur={() => commitEditStock(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEditStock(p);
                            else if (e.key === "Escape") cancelEditStock();
                          }}
                          className="h-8 w-16 text-center px-1"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditStock(p)}
                          title="Toque para editar"
                          className={
                            lowStock
                              ? "text-brand-red font-bold flex flex-col items-center leading-none"
                              : "font-semibold flex flex-col items-center leading-none"
                          }
                        >
                          <span>{p.stock}</span>
                          <span className="text-[10px] font-normal text-muted-foreground uppercase">
                            unid
                          </span>
                        </button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7 h-7 w-7"
                        disabled={stockMut.isPending || isUpdatingStock}
                        onClick={() => handleStockChange(p, 1)}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] uppercase text-muted-foreground font-bold">
                        Venda
                      </div>
                      <div className="font-bold text-success text-lg">
                        {visibility.mask(brl(Number(p.sale_price)))}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end items-center border-t border-dashed pt-3 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="size-3 mr-1" /> Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-brand-red border-brand-red/20"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Excluir produto?",
                            description: `Tem certeza que deseja excluir "${p.name}"? Esta ação não pode ser desfeita.`,
                            confirmLabel: "Excluir",
                          })
                        )
                          deleteMut.mutate(p.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
        <div className="mt-4 border-t pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground order-2 sm:order-1">
            Exibindo {products.length} de {totalProductsCount} produtos
          </div>
          {totalPages > 1 && (
            <div className="order-1 sm:order-2">
              <SmartPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </div>
      </Card>

      {isScanning && (
        <BarcodeScanner
          onScan={(code) => {
            let cleanCode = code.trim();
            // Remove prefixo 'a' comum em scanners
            if (
              cleanCode.startsWith("a") &&
              cleanCode.length > 2 &&
              /^[A-Z0-9]/.test(cleanCode.substring(1))
            ) {
              cleanCode = cleanCode.substring(1);
            }

            const norm = cleanCode.toLowerCase();
            const existing = products.find(
              (p) =>
                (p.sku.trim().toLowerCase() === norm ||
                  (p.alternative_code && p.alternative_code.trim().toLowerCase() === norm)) &&
                p.id !== editing?.id,
            );

            if (existing && scanningField === "sku") {
              setIsScanning(false);
              toast.error(`Código ${cleanCode} já cadastrado em "${existing.name}"`);
              return;
            }

            if (scanningField === "sku") {
              setForm((f) => ({ ...f, sku: cleanCode }));
            } else if (scanningField === "barcode") {
              setForm((f) => ({ ...f, barcode: cleanCode }));
            } else {
              setForm((f) => ({ ...f, alternativeCode: cleanCode }));
            }

            setIsScanning(false);
            toast.success(`Código ${code} lido com sucesso!`);
          }}
          onClose={() => setIsScanning(false)}
        />
      )}

      <AlertDialog open={!!stockConfirm} onOpenChange={(o) => !o && setStockConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de estoque</AlertDialogTitle>
            <AlertDialogDescription>{stockConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStockChange}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!duplicateProduct} onOpenChange={(o) => !o && setDuplicateProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Produto repetido encontrado</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>Já existe um produto com a mesma combinação de código, marca e categoria.</p>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-foreground">
                  <div>
                    <strong>Produto:</strong> {duplicateProduct?.name}
                  </div>
                  <div>
                    <strong>Código:</strong> {duplicateProduct?.sku}
                  </div>
                  <div>
                    <strong>Marca:</strong>{" "}
                    {(
                      brands.find((b) => b.id === duplicateProduct?.brand_id)?.name ||
                      duplicateProduct?.brand ||
                      "—"
                    ).toUpperCase()}
                  </div>
                  <div>
                    <strong>Categoria:</strong>{" "}
                    {categories.find((c) => c.id === duplicateProduct?.category_id)?.name || "—"}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateProduct(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                ignoreDuplicateRef.current = true;
                setDuplicateProduct(null);
                saveMut.mutate();
              }}
            >
              Ignorar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={codeHelpOpen} onOpenChange={setCodeHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Como preencher os códigos do produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-foreground">Código Fabricante</p>
              <p className="text-muted-foreground">
                Código original impresso pelo fabricante na embalagem ou peça (part number). Use-o
                para identificar o produto junto a fornecedores e catálogos. É obrigatório.
              </p>
            </div>
            <div>
              <p className="font-semibold text-foreground">Código Estoque</p>
              <p className="text-muted-foreground">
                Código interno usado para controle de estoque e impressão das etiquetas de
                prateleira (formato Code 128). É obrigatório — se você deixar em branco, o sistema
                gera automaticamente um código único compatível com leitores de código de barras.
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Dica: clique no botão <RefreshCw className="inline size-3 -mt-0.5" /> ao lado de cada
              campo para gerar um novo código automaticamente.
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCodeHelpOpen(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmNoStockCode} onOpenChange={setConfirmNoStockCode}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Código de Estoque não informado</AlertDialogTitle>
            <AlertDialogDescription>
              O código de estoque (código de barras) não foi informado. Deseja que o sistema gere um
              código automaticamente para este produto ou prefere voltar e informar um manualmente?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmNoStockCode(false);
                setTimeout(() => {
                  stockCodeInputRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                  setTimeout(() => stockCodeInputRef.current?.focus(), 400);
                }, 100);
              }}
            >
              Voltar e informar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // Ao clicar em continuar, o confirmNoStockCode continua true
                // para que a próxima chamada de saveMut.mutate() passe pela validação
                saveMut.mutate();
              }}
              className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
            >
              Gerar código automático
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EntitySelectorDialog
        open={auditBrandPickerOpen}
        onOpenChange={setAuditBrandPickerOpen}
        title="Filtrar por Marca"
        items={brands.map((b) => ({ ...b, name: b.name.toUpperCase() }))}
        selectedId={auditFilters.brandId === "all" ? null : auditFilters.brandId}
        onSelect={(id) => setAuditFilters({ ...auditFilters, brandId: id || "all" })}
        onCreateNew={() => setBrandOpen(true)}
        emptyMessage="Nenhuma marca cadastrada"
        allowClear
        clearLabel="Todas as Marcas"
      />
      <EntitySelectorDialog
        open={auditCatPickerOpen}
        onOpenChange={setAuditCatPickerOpen}
        title="Filtrar por Categoria"
        items={categories}
        selectedId={auditFilters.categoryId === "all" ? null : auditFilters.categoryId}
        onSelect={(id) => setAuditFilters({ ...auditFilters, categoryId: id || "all" })}
        onCreateNew={() => setCatOpen(true)}
        emptyMessage="Nenhuma categoria cadastrada"
        allowClear
        clearLabel="Todas as Categorias"
      />
      <EntitySelectorDialog
        open={auditProductPickerOpen}
        onOpenChange={setAuditProductPickerOpen}
        title="Filtrar por Produto"
        items={products}
        selectedId={auditFilters.productId === "all" ? null : auditFilters.productId}
        onSelect={(id) => setAuditFilters({ ...auditFilters, productId: id || "all" })}
        onCreateNew={openNew}
        emptyMessage="Nenhum produto cadastrado"
        allowClear
        clearLabel="Todos os Produtos"
      />

      <EntitySelectorDialog
        open={brandPickerOpen}
        onOpenChange={setBrandPickerOpen}
        title="Selecionar marca"
        items={brands.map((b) => ({ ...b, name: b.name.toUpperCase() }))}
        selectedId={form.brandId === "none" ? null : form.brandId}
        onSelect={(id) => setForm({ ...form, brandId: id })}
        onCreateNew={() => setBrandOpen(true)}
        emptyMessage="Nenhuma marca cadastrada"
      />
      <EntitySelectorDialog
        open={catPickerOpen}
        onOpenChange={setCatPickerOpen}
        title="Selecionar categoria"
        items={categories}
        selectedId={form.categoryId === "none" ? null : form.categoryId}
        onSelect={(id) => setForm({ ...form, categoryId: id })}
        onCreateNew={() => setCatOpen(true)}
        emptyMessage="Nenhuma categoria cadastrada"
      />
      <EntitySelectorDialog
        open={refBrandPickerIndex !== null}
        onOpenChange={(open) => !open && setRefBrandPickerIndex(null)}
        title="Selecionar marca para referência"
        items={brands.map((b) => ({ ...b, name: b.name.toUpperCase() }))}
        selectedId={
          refBrandPickerIndex !== null ? form.references[refBrandPickerIndex]?.brandId : null
        }
        onSelect={(id) => {
          if (refBrandPickerIndex !== null) {
            setForm((f) => {
              const refs = [...f.references];
              refs[refBrandPickerIndex!] = {
                ...refs[refBrandPickerIndex!],
                brandId: id || "none",
                brandName: brands.find((b) => b.id === id)?.name || "",
              };
              return { ...f, references: refs };
            });
          }
          setRefBrandPickerIndex(null);
        }}
        onCreateNew={() => setBrandOpen(true)}
        emptyMessage="Nenhuma marca cadastrada"
        allowClear
        clearLabel="Sem marca"
      />
      <EntitySelectorDialog
        open={supPickerOpen}
        onOpenChange={setSupPickerOpen}
        title="Selecionar fornecedor"
        items={suppliers}
        selectedId={form.supplierId === "none" ? null : form.supplierId}
        onSelect={(id) => setForm({ ...form, supplierId: id })}
        onCreateNew={() => setSupOpen(true)}
        emptyMessage="Nenhum fornecedor cadastrado"
        allowClear
        clearLabel="Sem fornecedor"
      />
      <EntitySelectorDialog
        open={locPickerOpen}
        onOpenChange={setLocPickerOpen}
        title="Selecionar localização"
        items={locations}
        selectedId={form.locationId === "none" ? null : form.locationId}
        onSelect={(id) => setForm({ ...form, locationId: id })}
        onCreateNew={() => setLocOpen(true)}
        emptyMessage="Nenhuma localização cadastrada"
      />
      <EntitySelectorDialog
        open={unitPickerOpen}
        onOpenChange={setUnitPickerOpen}
        title="Selecionar unidade de medida"
        items={units.map((u) => ({ id: u.id, name: `${u.abbreviation} — ${u.description}` }))}
        selectedId={form.unitId === "none" ? null : form.unitId}
        onSelect={(id) => setForm({ ...form, unitId: id })}
        onCreateNew={() => setUnitOpen(true)}
        emptyMessage="Nenhuma unidade cadastrada"
      />
      <EntitySelectorDialog
        open={batchLocPickerOpen}
        onOpenChange={setBatchLocPickerOpen}
        title={`Transferir ${selectedProductIds.size} produto(s)`}
        items={locations}
        selectedId={null}
        onSelect={async (id) => {
          const locationName = locations.find((l) => l.id === id)?.name || "Nova localização";
          if (
            await confirm({
              title: "Confirmar transferência?",
              description: `Deseja transferir ${selectedProductIds.size} produto(s) selecionado(s) para "${locationName}"?`,
              confirmLabel: "Transferir",
              cancelLabel: "Cancelar",
            })
          ) {
            batchTransferMut.mutate(id);
            setBatchLocPickerOpen(false);
          }
        }}
        onCreateNew={() => setLocOpen(true)}
        emptyMessage="Nenhuma localização cadastrada"
      />

      <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova unidade de medida</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!unitAbbr.trim() || !unitDesc.trim()) {
                toast.error("Informe sigla e descrição");
                return;
              }
              createUnitMut.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Sigla</Label>
              <Input
                autoFocus
                value={unitAbbr}
                onChange={(e) => setUnitAbbr(e.target.value.toUpperCase())}
                placeholder="UN"
                maxLength={10}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={unitDesc}
                onChange={(e) => setUnitDesc(e.target.value)}
                placeholder="Ex.: Unidade, Quilograma, Litro"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUnitOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createUnitMut.isPending}
                className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              >
                {createUnitMut.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
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

      {/* Modal de pesquisa com IA */}
      <Dialog
        open={aiLookupOpen}
        onOpenChange={(o) => {
          setAiLookupOpen(o);
          if (!o) {
            setAiLookupResult(null);
            setSelectedCode("");
            setAiImageOk(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand-orange" />
              Pesquisa com IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="text-xs text-muted-foreground">
              Termo pesquisado:{" "}
              <span className="font-medium text-foreground">{form.name.trim()}</span>
            </div>
            {aiLookupLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Sparkles className="size-4 animate-pulse" />
                Consultando informações...
              </div>
            ) : aiLookupResult ? (
              <div className="space-y-3">
                <div className="flex justify-center">
                  {aiLookupResult.imageUrl && aiImageOk ? (
                    <img
                      src={aiLookupResult.imageUrl}
                      alt={aiLookupResult.name}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="max-h-40 rounded-md border object-contain bg-muted/30"
                      onLoad={() => {
                        setAiImageOk(true);
                        const key = `${form.name.trim().toLowerCase()}|${(brands.find((b) => b.id === form.brandId)?.name || "").toLowerCase()}`;
                        const c = aiLookupCacheRef.current.get(key);
                        if (c) aiLookupCacheRef.current.set(key, { ...c, imageOk: true });
                      }}
                      onError={() => {
                        setAiImageOk(false);
                        const key = `${form.name.trim().toLowerCase()}|${(brands.find((b) => b.id === form.brandId)?.name || "").toLowerCase()}`;
                        const c = aiLookupCacheRef.current.get(key);
                        if (c)
                          aiLookupCacheRef.current.set(key, { ...c, imageOk: false, imageUrl: "" });
                      }}
                    />
                  ) : aiLookupResult.imageUrl ? (
                    // Imagem existe mas ainda não validada: tenta carregar oculta
                    <img
                      src={aiLookupResult.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="hidden"
                      onLoad={() => {
                        setAiImageOk(true);
                        const key = `${form.name.trim().toLowerCase()}|${(brands.find((b) => b.id === form.brandId)?.name || "").toLowerCase()}`;
                        const c = aiLookupCacheRef.current.get(key);
                        if (c) aiLookupCacheRef.current.set(key, { ...c, imageOk: true });
                      }}
                      onError={() => {
                        setAiImageOk(false);
                        const key = `${form.name.trim().toLowerCase()}|${(brands.find((b) => b.id === form.brandId)?.name || "").toLowerCase()}`;
                        const c = aiLookupCacheRef.current.get(key);
                        if (c)
                          aiLookupCacheRef.current.set(key, { ...c, imageOk: false, imageUrl: "" });
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 w-32 rounded-md border border-dashed bg-muted/30 text-muted-foreground">
                      <ImageOff className="size-8 opacity-60" />
                      <span className="text-[10px] mt-1 uppercase tracking-wide">Sem imagem</span>
                    </div>
                  )}
                </div>
                {aiLookupResult.barcode && (
                  <div className="rounded-md border bg-muted/30 p-2">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Código de Barras (EAN/GTIN)
                    </Label>
                    <p className="font-mono text-sm mt-1">{aiLookupResult.barcode}</p>
                  </div>
                )}
                {aiLookupResult.existingProduct && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                    <p className="text-sm">
                      <strong>EAN já cadastrado</strong> em "{aiLookupResult.existingProduct.name}".
                      Você pode adicionar essa marca/código como nova referência ao produto
                      existente.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const target = aiLookupResult.existingProduct!;
                          setAiLookupOpen(false);
                          await openEdit(target);
                          const code = (selectedCode || aiLookupResult.originalCode || "")
                            .trim()
                            .toUpperCase();
                          const brandName = aiLookupResult.originalBrand.trim();
                          if (code) {
                            const matched = brands.find(
                              (b) => b.name.toLowerCase() === brandName.toLowerCase(),
                            );
                            setForm((f) => ({
                              ...f,
                              references: [
                                ...f.references,
                                {
                                  brandId: matched?.id ?? "none",
                                  brandName: brandName || "",
                                  manufacturerCode: code,
                                },
                              ],
                            }));
                            toast.success(
                              "Referência adicionada ao produto existente. Revise e salve.",
                            );
                          }
                        }}
                      >
                        Adicionar como nova referência
                      </Button>
                    </div>
                  </div>
                )}
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Nome encontrado
                  </Label>
                  <p className="font-medium mt-1">{aiLookupResult.name}</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Marca/Fabricante original
                    </Label>
                    {aiLookupResult.originalBrand ? (
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm font-medium">{aiLookupResult.originalBrand}</p>
                        {!brands.find(
                          (b) =>
                            b.name.toLowerCase() === aiLookupResult.originalBrand.toLowerCase(),
                        ) && (
                          <span className="text-[10px] uppercase tracking-wide bg-brand-orange/10 text-brand-orange px-1.5 py-0.5 rounded">
                            Será criada
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">Não identificada</p>
                    )}
                  </div>
                  {aiLookupResult.originalBrand && (
                    <div className="flex items-center space-x-2 bg-muted/40 p-2 rounded-md border border-border/50">
                      <input
                        type="checkbox"
                        id="ai-apply-brand"
                        className="size-4 rounded border-gray-300 text-brand-red focus:ring-brand-red cursor-pointer"
                        checked={aiApplyBrand}
                        onChange={(e) => setAiApplyBrand(e.target.checked)}
                      />
                      <Label
                        htmlFor="ai-apply-brand"
                        className="text-xs font-normal cursor-pointer text-muted-foreground select-none"
                      >
                        Preencher campo de{" "}
                        <span className="font-semibold text-foreground">Marca</span> automaticamente
                        ao aplicar
                      </Label>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Código Original/Referência
                  </Label>
                  {aiLookupResult.codes.length > 1 ? (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-muted-foreground mb-1">
                        Múltiplos códigos encontrados. Selecione um:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {aiLookupResult.codes.map((code) => (
                          <Button
                            key={code}
                            variant={selectedCode === code ? "default" : "outline"}
                            size="sm"
                            className="h-8 font-mono"
                            onClick={() => setSelectedCode(code)}
                          >
                            {code}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="font-mono text-sm mt-1">
                      {aiLookupResult.originalCode || "Não identificado"}
                    </p>
                  )}
                </div>
                {aiLookupResult.averagePurchasePrice !== undefined &&
                  aiLookupResult.averagePurchasePrice > 0 && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                          <CircleDollarSign className="size-3" /> Valor Médio Compra (IA)
                        </Label>
                        <p className="text-sm font-semibold text-brand-orange mt-1">
                          {brl(aiLookupResult.averagePurchasePrice)}
                        </p>
                        <p className="text-[10px] text-muted-foreground italic">
                          Referência sugerida de fabricante ou distribuidor.
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 bg-muted/40 p-2 rounded-md border border-border/50">
                        <input
                          type="checkbox"
                          id="ai-apply-price"
                          className="size-4 rounded border-gray-300 text-brand-red focus:ring-brand-red cursor-pointer"
                          checked={aiApplyCostPrice}
                          onChange={(e) => setAiApplyCostPrice(e.target.checked)}
                        />
                        <Label
                          htmlFor="ai-apply-price"
                          className="text-xs font-normal cursor-pointer text-muted-foreground select-none"
                        >
                          Preencher campo de{" "}
                          <span className="font-semibold text-foreground">Preço de Custo</span>{" "}
                          automaticamente ao aplicar
                        </Label>
                      </div>
                    </div>
                  )}
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Detalhes
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {aiLookupResult.details || "Sem detalhes adicionais."}
                  </p>
                </div>
                {aiLookupResult.imageUrl && (
                  <div className="rounded-md border border-dashed border-brand-orange/30 p-2 bg-brand-orange/5 text-[10px] text-brand-orange flex items-center gap-2">
                    <Info className="size-3" /> Imagem exibida apenas para auxílio na identificação
                    (não é salva).
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground py-6 text-center">Nenhum resultado.</div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              onClick={applyAiLookup}
              disabled={!aiLookupResult || aiLookupLoading}
              className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
            >
              <Wand2 className="size-4 mr-2" /> Aplicar ao produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickSearchOpen} onOpenChange={setQuickSearchOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="size-5" />
              {quickSearchType === "sku"
                ? "Busca por Código do Fabricante"
                : "Busca Rápida no Estoque"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-1 space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="relative">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={quickSearchInputRef}
                placeholder={
                  quickSearchType === "sku"
                    ? "Digite o código do fabricante..."
                    : "Pesquise por nome, SKU, barcode ou qualquer campo..."
                }
                value={quickSearchTerm}
                onChange={(e) => handleQuickSearch(e.target.value, quickSearchType)}
                className="pl-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-[300px] rounded-md border bg-muted/20">
              {quickSearchLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <RefreshCw className="size-8 animate-spin mb-2" />
                  <p>Buscando...</p>
                </div>
              ) : quickSearchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center px-6">
                  <Search className="size-12 opacity-10 mb-2" />
                  <p className="font-medium text-foreground">
                    {quickSearchTerm.trim()
                      ? "Nenhum produto encontrado"
                      : "Digite algo para buscar"}
                  </p>
                  <p className="text-xs">
                    {quickSearchTerm.trim()
                      ? "Verifique se o termo está correto ou se o produto já foi cadastrado."
                      : "A busca será realizada em todos os campos do cadastro."}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {quickSearchResults.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="size-10 rounded border object-cover"
                          />
                        ) : (
                          <div className="size-10 rounded border bg-muted flex items-center justify-center text-muted-foreground/30">
                            <Package className="size-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate text-sm">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono flex gap-2">
                            <span>SKU: {p.sku}</span>
                            {p.alternative_code && <span>EST: {p.alternative_code}</span>}
                            {(p as any).product_references?.length > 0 && (
                              <span className="text-brand-orange">
                                REF: {(p as any).product_references.map((r: any) => r.manufacturer_code).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right mr-2 hidden sm:block">
                          <div className="text-xs font-bold text-success">
                            {brl(Number(p.sale_price))}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {p.stock} em estoque
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setQuickSearchOpen(false);
                            openEdit(p);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {quickSearchResults.length > 0 && (
              <p className="text-[10px] text-muted-foreground italic">
                Encontrado(s) {quickSearchResults.length} resultado(s). Clique no lápis para editar.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickSearchOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeLabelDialog
        open={labelOpen}
        onOpenChange={setLabelOpen}
        products={labelProducts}
        companyId={cid}
        companyName={""} // Se quiser passar o nome da empresa aqui
      />
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="max-w-4xl h-[100dvh] md:max-h-[90vh] flex flex-col p-0 overflow-hidden border-none md:border sm:rounded-lg">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="flex items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-blue-500" />
                {auditFilters.userId ? "Auditoria de Terceiros" : "Minha Auditoria de Produtos"}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => auditQ.refetch()}
                disabled={auditQ.isRefetching}
              >
                <RefreshCw className={cn("size-4", auditQ.isRefetching && "animate-spin")} />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="px-4 md:px-6 py-3 md:py-4 bg-muted/30 border-y shrink-0">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
              <div className="space-y-1 min-w-0">
                <Label className="text-[10px] uppercase">Início</Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-background w-full"
                  value={auditFilters.startDate}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-[10px] uppercase">Fim</Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-background w-full"
                  value={auditFilters.endDate}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-[10px] uppercase">Marca</Label>
                <Button
                  variant="outline"
                  className="w-full h-8 text-xs justify-between font-normal px-2 bg-background"
                  onClick={() => setAuditBrandPickerOpen(true)}
                >
                  <span className="truncate">
                    {auditFilters.brandId === "all"
                      ? "Todas as Marcas"
                      : brands.find((b) => b.id === auditFilters.brandId)?.name.toUpperCase() ||
                        "Selecionar"}
                  </span>
                  <ChevronDown className="size-3 opacity-50 shrink-0 ml-1" />
                </Button>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-[10px] uppercase">Categoria</Label>
                <Button
                  variant="outline"
                  className="w-full h-8 text-xs justify-between font-normal px-2 bg-background"
                  onClick={() => setAuditCatPickerOpen(true)}
                >
                  <span className="truncate">
                    {auditFilters.categoryId === "all"
                      ? "Todas as Categorias"
                      : categories.find((c) => c.id === auditFilters.categoryId)?.name ||
                        "Selecionar"}
                  </span>
                  <ChevronDown className="size-3 opacity-50 shrink-0 ml-1" />
                </Button>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-[10px] uppercase">Produto Específico</Label>
                <Button
                  variant="outline"
                  className="w-full h-8 text-xs justify-between font-normal px-2 bg-background"
                  onClick={() => setAuditProductPickerOpen(true)}
                >
                  <span className="truncate">
                    {auditFilters.productId === "all"
                      ? "Todos os Produtos"
                      : products.find((p) => p.id === auditFilters.productId)?.name || "Selecionar"}
                  </span>
                  <ChevronDown className="size-3 opacity-50 shrink-0 ml-1" />
                </Button>
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-[10px] uppercase">Busca Livre (Log)</Label>
                <Input
                  placeholder="Nome ou código..."
                  className="h-8 text-xs bg-background w-full"
                  value={auditFilters.search}
                  onChange={(e) => setAuditFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </div>

              {canViewOthersAuditQ.data && (
                <div className="space-y-1 min-w-0 col-span-2 md:col-span-1">
                  <Label className="text-[10px] uppercase">Usuário</Label>
                  <Select
                    value={auditFilters.userId || "me"}
                    onValueChange={(v) =>
                      setAuditFilters((prev) => ({ ...prev, userId: v === "me" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs bg-background w-full">
                      <SelectValue placeholder="Usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="me" className="text-xs">
                        Eu ({user?.user_metadata?.name || user?.email})
                      </SelectItem>
                      {(membersQ.data ?? [])
                        .filter((m) => m.id !== user?.id)
                        .map((m: any) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            {m.name || m.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-2 bg-background text-[10px] font-medium border-b flex justify-between items-center shrink-0">
            <span className="text-muted-foreground italic">
              Exibindo {filteredAuditData.length} de {totalAuditItems} registros
            </span>
            {totalAuditPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-3" />
                </Button>
                <span>
                  Página {auditPage} de {totalAuditPages}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={auditPage >= totalAuditPages}
                  onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                >
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-0 min-h-[300px]">
            {auditQ.isLoading || auditQ.isRefetching ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <RefreshCw className="size-8 animate-spin text-blue-500" />
                <div className="text-center">
                  <p className="font-medium">Carregando trilha de auditoria...</p>
                  <p className="text-xs opacity-70">Buscando alterações em seus produtos</p>
                </div>
              </div>
            ) : filteredAuditData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground px-6">
                <div className="relative mb-4">
                  <Info className="size-12 opacity-10" />
                  <Search className="size-6 absolute -bottom-1 -right-1 opacity-20" />
                </div>
                <div className="text-center space-y-2 max-w-sm">
                  <p className="font-semibold text-foreground">Nenhum registro localizado</p>
                  <p className="text-xs">
                    Não encontramos alterações de produtos no período e filtros selecionados.
                  </p>
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => auditQ.refetch()}
                      className="h-7 text-[10px]"
                    >
                      <RefreshCw className="size-3 mr-1" /> Tentar novamente
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Mobile: cards */}
                <div className="md:hidden flex flex-col gap-2 p-3">
                  {filteredAuditData.map((log: any) => {
                    const actionLabel = (() => {
                      const action = log.action;
                      const type = log.meta?.type;
                      if (action === "INSERT") return "CADASTRO";
                      if (action === "SALE" || (action === "UPDATE" && type === "venda"))
                        return "VENDA";
                      if (action === "ENTRY" || (action === "UPDATE" && type === "entrada"))
                        return "ENTRADA";
                      if (action === "OUT" || (action === "UPDATE" && type === "saida"))
                        return "SAÍDA";
                      if (action === "ADJUST" || (action === "UPDATE" && type === "ajuste"))
                        return "AJUSTE";
                      if (action === "RETURN" || (action === "UPDATE" && type === "devolucao"))
                        return "DEVOLUÇÃO";
                      if (action === "DELETE") return "EXCLUSÃO";
                      return "ALTERAÇÃO";
                    })();
                    const badgeClass = cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border shrink-0",
                      log.action === "INSERT"
                        ? "bg-green-500/10 text-green-500 border-green-500/20"
                        : log.action === "UPDATE"
                          ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          : log.action === "ENTRY"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : log.action === "SALE"
                              ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                              : log.action === "OUT" || log.action === "ADJUST"
                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                : "bg-red-500/10 text-red-500 border-red-500/20",
                    );
                    return (
                      <div key={log.id} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </div>
                          <span className={badgeClass}>{actionLabel}</span>
                        </div>
                        <div>
                          <div className="font-bold text-foreground text-sm leading-tight">
                            {log.product?.name ||
                              (log.action === "DELETE" && log.meta?.old
                                ? (log.meta.old as any).name
                                : "Produto removido")}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {log.product?.sku}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 pt-1 border-t">
                          <User className="size-3 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium truncate">
                              {log.user?.name || "Sistema"}
                            </div>
                            <div className="text-[9px] text-muted-foreground truncate">
                              {log.user?.email}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop/tablet: tabela */}
                <Table className="hidden md:table">
                  <TableHeader className="bg-muted/50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-[160px]">Data/Hora</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead className="text-right">Alterações Realizadas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAuditData.map((log: any) => (
                      <TableRow key={log.id} className="text-[11px] hover:bg-muted/20">
                        <TableCell className="font-medium text-muted-foreground whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>
                              {new Date(log.created_at).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-foreground leading-tight">
                            {log.product?.name ||
                              (log.action === "DELETE" && log.meta?.old
                                ? (log.meta.old as any).name
                                : "Produto removido")}
                          </div>
                          <div className="text-[9px] text-muted-foreground font-mono">
                            {log.product?.sku}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">
                            {log.user?.name || "Sistema"}
                          </div>
                          <div className="text-[9px] text-muted-foreground truncate max-w-[120px]">
                            {log.user?.email}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "px-2 py-1 rounded-full text-[9px] font-bold uppercase border",
                              log.action === "INSERT"
                                ? "bg-green-500/10 text-green-500 border-green-500/20"
                                : log.action === "UPDATE"
                                  ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                  : log.action === "ENTRY"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : log.action === "SALE"
                                      ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                                      : log.action === "OUT" || log.action === "ADJUST"
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        : "bg-red-500/10 text-red-500 border-red-500/20",
                            )}
                          >
                            {(() => {
                              const action = log.action;
                              const type = log.meta?.type;
                              if (action === "INSERT") return "CADASTRO";
                              if (action === "SALE" || (action === "UPDATE" && type === "venda"))
                                return "VENDA";
                              if (action === "ENTRY" || (action === "UPDATE" && type === "entrada"))
                                return "ENTRADA";
                              if (action === "OUT" || (action === "UPDATE" && type === "saida"))
                                return "SAÍDA";
                              if (action === "ADJUST" || (action === "UPDATE" && type === "ajuste"))
                                return "AJUSTE";
                              if (
                                action === "RETURN" ||
                                (action === "UPDATE" && type === "devolucao")
                              )
                                return "DEVOLUÇÃO";
                              if (action === "DELETE") return "EXCLUSÃO";
                              return "ALTERAÇÃO";
                            })()}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>

          <DialogFooter className="p-4 border-t bg-background shrink-0 mt-auto">
            <Button
              variant="outline"
              className="w-full md:w-auto"
              onClick={() => setAuditOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!detailsProduct} onOpenChange={(o) => !o && setDetailsProduct(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Produto</DialogTitle>
          </DialogHeader>
          {detailsProduct && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
              <div className="space-y-4">
                {detailsProduct.image_url && (
                  <div
                    className="aspect-square rounded-lg border bg-muted overflow-hidden cursor-zoom-in"
                    onClick={() => setSelectedImageUrl(detailsProduct.image_url!)}
                  >
                    <img
                      src={detailsProduct.image_url}
                      alt={detailsProduct.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                    Nome
                  </h3>
                  <p className="text-base font-bold text-brand-orange uppercase">
                    {detailsProduct.name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      SKU / Código
                    </h3>
                    <p className="font-mono text-sm">{detailsProduct.sku || "—"}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Cód. Barras
                    </h3>
                    <p className="font-mono text-sm">{detailsProduct.barcode || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Marca
                    </h3>
                    <p className="text-sm font-medium">
                      {(
                        brands.find((b) => b.id === detailsProduct.brand_id)?.name ||
                        detailsProduct.brand ||
                        "—"
                      ).toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Categoria
                    </h3>
                    <p className="text-sm font-medium">
                      {(
                        categories.find((c) => c.id === detailsProduct.category_id)?.name || "—"
                      ).toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Preço de Custo
                    </h3>
                    <p className="text-sm font-medium">
                      {visibility.mask(brl(Number(detailsProduct.cost_price)))}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Preço de Venda
                    </h3>
                    <p className="text-base font-bold text-success">
                      {visibility.mask(brl(Number(detailsProduct.sale_price)))}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Estoque Atual
                    </h3>
                    <p
                      className={cn(
                        "text-base font-bold",
                        Number(detailsProduct.stock) <= Number(detailsProduct.min_stock)
                          ? "text-brand-red"
                          : "text-brand-orange",
                      )}
                    >
                      {detailsProduct.stock}{" "}
                      {units.find((u) => u.id === detailsProduct.unit_id)?.abbreviation || "unid"}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Estoque Mínimo
                    </h3>
                    <p className="text-sm font-medium">{detailsProduct.min_stock || "0"}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                    Localização
                  </h3>
                  <p className="text-sm font-medium">
                    {(
                      locations.find((l) => l.id === (detailsProduct as any).location_id)?.name ||
                      "—"
                    ).toUpperCase()}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                    Fornecedor
                  </h3>
                  <p className="text-sm font-medium">
                    {(
                      suppliers.find((s) => s.id === detailsProduct.supplier_id)?.name || "—"
                    ).toUpperCase()}
                  </p>
                </div>

                {detailsProduct.description && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase text-[10px]">
                      Descrição
                    </h3>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground border p-2 rounded bg-muted/30">
                      {detailsProduct.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDetailsProduct(null)}>
              Fechar
            </Button>
            <Button
              onClick={() => {
                const p = detailsProduct;
                setDetailsProduct(null);
                if (p) openEdit(p);
              }}
              className="bg-brand-red hover:bg-brand-red/90 text-white"
            >
              <Pencil className="size-4 mr-2" /> Editar Produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
