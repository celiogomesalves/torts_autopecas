import { supabase } from "@/integrations/supabase/client";
import type {
  Company,
  Membership,
  Category,
  Brand,
  Product,
  StockMovement,
  Role,
  MovementType,
  Partner,
  PartnerType,
  Sale,
  SaleItem,
  Payable,
  PayableDirection,
  PayableStatus,
  Driver,
  DeliveryOrder,
  DeliveryStatus,
  DeliveryBusinessHour,
  DeliveryFeeByKm,
  BankTransaction,
  FiscalNote,
  FiscalSettings,
  NfType,
  NfStatus,
  PaymentMethod,
  SalePayment,
  SalePaymentInput,
  StockCount,
  StockCountItem,
  PartnerAddress,
  StockCountTeam,
  StockCountTeamLocation,
} from "./db-types";

const db = supabase as any;

const SELECT_WITH_PROFILE = "*, profiles(name)";
export const COMPANY_SAFE_SELECT =
  "id,name,cnpj,created_by,created_at,approved,approved_at,approved_by,rejected_at,rejection_reason,delivery_enabled,pickup_enabled,phone,zip_code";

function normalizeNcm(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeProductSearchQuery(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’‘`´"”“]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRequiredNcm(value?: string | null) {
  const ncm = normalizeNcm(value);
  if (ncm.length !== 8 || ncm === "00000000") {
    throw new Error("O NCM é obrigatório e deve ter 8 dígitos válidos");
  }
  return ncm;
}

/**
 * Registra uma atividade no log de auditoria
 */
export async function logActivity(params: {
  companyId: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: any;
}) {
  const { error } = await db.from("activity_logs").insert({
    company_id: params.companyId,
    user_id: params.userId,
    action: params.action,
    entity: params.entity,
    entity_id: params.entityId,
    meta: params.meta,
  });
  if (error) {
    console.error("Erro ao registrar log de atividade:", error);
  }
}

/**
 * Busca os logs de atividade
 */
export async function fetchActivityLogs(companyId: string, limit = 100): Promise<any[]> {
  const { data, error } = await db
    .from("activity_logs")
    .select("*, profiles!user_id(name, email)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Busca logs de auditoria de produtos com filtros
 */
export async function fetchProductAuditLogs(params: {
  companyId: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  brandId?: string;
  categoryId?: string;
  search?: string;
}) {
  let query = db
    .from("activity_logs")
    .select("*")
    .eq("company_id", params.companyId)
    .eq("entity", "products")
    .in("action", ["INSERT", "UPDATE", "DELETE", "ENTRY", "SALE", "OUT", "ADJUST", "RETURN"])
    .order("created_at", { ascending: false });

  if (params.userId) {
    query = query.eq("user_id", params.userId);
  }

  if (params.startDate) {
    const start = params.startDate.split('T')[0] + 'T00:00:00Z';
    query = query.gte("created_at", start);
  }

  if (params.endDate) {
    const end = params.endDate.split('T')[0] + 'T23:59:59.999Z';
    query = query.lte("created_at", end);
  }

  const { data, error } = await query;
  if (error) throw error;

  const logs = (data ?? []) as any[];
  const productIds = Array.from(new Set(logs.map(l => l.entity_id).filter(Boolean)));
  const userIds = Array.from(new Set(logs.map(l => l.user_id).filter(Boolean)));
  
  let products: any[] = [];
  if (productIds.length > 0) {
    const { data: prods } = await db
      .from("products")
      .select("id, name, sku, brand_id, category_id, brands(name), categories(name)")
      .in("id", productIds);
    products = prods ?? [];
  }

  let userProfiles: any[] = [];
  if (userIds.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);
    userProfiles = profiles ?? [];
  }

  const productMap = Object.fromEntries(products.map(p => [p.id, p]));
  const userMap = Object.fromEntries(userProfiles.map(u => [u.id, u]));

  // Agrupamento radical: Apenas a última alteração por (produto + ação) no período selecionado.
  // Isso atende ao desejo do usuário de ver apenas "quem fez o quê por último" sem histórico detalhado.
  const uniqueLogs: any[] = [];
  const seenMap = new Map<string, number>();
  const logsList = (data ?? []) as any[];

  for (const log of logsList) {
    const key = `${log.action}-${log.entity_id}`;
    
    if (seenMap.has(key)) {
      // Já vimos esta ação para este produto (como a query vem em ordem DESC, a primeira é a última/mais recente)
      // Apenas incrementamos o contador se quiser manter a info de que houve várias, 
      // mas não criamos nova linha no modal.
      const index = seenMap.get(key)!;
      uniqueLogs[index].occurrence_count += 1;
    } else {
      seenMap.set(key, uniqueLogs.length);
      const product = productMap[log.entity_id];
      const isDeleted = log.action === "DELETE";
      
      uniqueLogs.push({
        ...log,
        occurrence_count: 1,
        product: product || (isDeleted && log.meta?.old ? {
          name: log.meta.old.name,
          sku: log.meta.old.sku,
          brand_id: log.meta.old.brand_id,
          category_id: log.meta.old.category_id,
        } : null),
        user: userMap[log.user_id] || null,
      });
    }
  }

  let filtered = uniqueLogs;

  if (params.brandId && params.brandId !== "all") {
    filtered = filtered.filter(log => log.product?.brand_id === params.brandId);
  }

  if (params.categoryId && params.categoryId !== "all") {
    filtered = filtered.filter(log => log.product?.category_id === params.categoryId);
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter(log => 
      log.product?.name?.toLowerCase().includes(q) || 
      log.product?.sku?.toLowerCase().includes(q)
    );
  }

  return filtered;
}

// ---------- Companies ----------
export async function fetchMyCompanies(userIdOrContext?: string | any): Promise<(Company & { is_blocked?: boolean; role?: string })[]> {
  let finalUserId: string | undefined;
  
  if (typeof userIdOrContext === 'string') {
    finalUserId = userIdOrContext;
  } else if (userIdOrContext && typeof userIdOrContext === 'object' && Array.isArray(userIdOrContext.queryKey)) {
    finalUserId = userIdOrContext.queryKey[1];
  }

  if (!finalUserId) {
    const { data } = await supabase.auth.getUser();
    finalUserId = data?.user?.id;
  }
  if (!finalUserId) {
    const { data: sessionData } = await supabase.auth.getSession();
    finalUserId = sessionData?.session?.user?.id;
  }
  if (!finalUserId) return [];

  // 1. Busca os memberships do usuário
  const { data: memberships, error: mError } = await db
    .from("memberships")
    .select("*")
    .eq("user_id", finalUserId);

  if (mError) throw mError;
  const userMemberships = memberships ?? [];

  // 2. Extrai os IDs das empresas dos memberships
  const companyIds = userMemberships
    .map((m: any) => m.company_id)
    .filter(Boolean);

  // 3. Verifica se é super admin para garantir acesso
  const isSuper = await isSuperAdmin().catch(() => false);

  let companies: any[] = [];
  if (isSuper) {
    // Super admin tem acesso a todas as empresas cadastradas
    const { data: allComps, error: cError } = await db
      .from("companies")
      .select("*");
    if (cError) throw cError;
    companies = allComps ?? [];
  } else if (companyIds.length > 0) {
    const { data: userComps, error: cError } = await db
      .from("companies")
      .select("*")
      .in("id", companyIds);
    if (cError) throw cError;
    companies = userComps ?? [];
  } else {
    return [];
  }

  const membershipMap = new Map<string, any>(
    userMemberships.map((m: any) => [m.company_id, m])
  );

  return companies.map((c: any) => {
    const m = membershipMap.get(c.id || c.$id);
    return {
      ...c,
      id: c.id || c.$id,
      name: c.name || "Empresa",
      is_blocked: m ? (m.is_blocked ?? false) : false,
      role: m ? (m.role || "vendedor") : (isSuper ? "admin" : "vendedor"),
    };
  });
}

export async function fetchMyCompanyRole(companyId: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await db
    .from("memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data?.role as string | undefined) ?? null;
}

export async function toggleMemberBlocked(membershipId: string, blocked: boolean): Promise<void> {
  if (blocked) {
    // Garante que não é super admin antes de bloquear
    const { data: m } = await db
      .from("memberships")
      .select("user_id")
      .eq("id", membershipId)
      .maybeSingle();
    if (m?.user_id) {
      const { data: roles } = await db
        .from("user_roles")
        .select("role")
        .eq("user_id", m.user_id)
        .eq("role", "super_admin");
      if (roles && roles.length > 0) {
        throw new Error("Super administradores não podem ser bloqueados.");
      }
    }
  }
  const { error } = await db
    .from("memberships")
    .update({ is_blocked: blocked })
    .eq("id", membershipId);
  if (error) throw error;
}


export async function fetchCompany(id: string): Promise<Company | null> {
  const { data, error } = await db.from("companies").select(COMPANY_SAFE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Company | null;
}

export async function createCompany(input: {
  name: string;
  cnpj?: string;
}): Promise<Company> {
  const { data, error } = await db
    .from("companies")
    .insert({
      name: input.name,
      cnpj: input.cnpj || null,
    })
    .select(COMPANY_SAFE_SELECT)
    .single();
  if (error) throw error;
  return data as Company;
}

export async function joinCompanyByCode(code: string): Promise<string> {
  const { data, error } = await db.rpc("join_company_by_code", { _code: code });
  if (error) throw error;
  return data as string;
}

export async function rotateInvite(companyId: string): Promise<string> {
  const { data, error } = await db.rpc("rotate_invite_code", { _company: companyId });
  if (error) throw error;
  return data as string;
}

// ---------- Super Admin & Roles ----------
export async function isSuperAdmin(): Promise<boolean> {
  const { data, error } = await db.rpc("is_super_admin");
  if (error) return false;
  return Boolean(data);
}

export async function hasRole(companyId: string, role: Role | 'gerente'): Promise<boolean> {
  if (!companyId) return false;
  const { data } = await db.rpc("has_company_role", { _company: companyId, _role: role });
  return Boolean(data);
}

export async function isAdmin(companyId: string): Promise<boolean> {
  if (!companyId) return false;
  const { data } = await db.rpc("is_admin", { _company: companyId });
  return Boolean(data);
}

export async function getAppBaseUrl(): Promise<string> {
  const { data, error } = await db.rpc("get_app_base_url");
  if (error) {
    // Fallback se a função não existir ou falhar
    const { data: config } = await db.from("app_config").select("value").eq("key", "base_url").maybeSingle();
    return config?.value || window.location.origin;
  }
  return data as string;
}

export async function updateAppBaseUrl(url: string): Promise<void> {
  const { error } = await db
    .from("app_config")
    .upsert({ key: "base_url", value: url, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function fetchPendingCompanies(): Promise<import("./db-types").PendingCompany[]> {
  const { data, error } = await db.rpc("list_pending_companies");
  if (error) throw error;
  return (data ?? []) as import("./db-types").PendingCompany[];
}

export async function approveCompany(companyId: string): Promise<void> {
  const { error } = await db.rpc("approve_company", { _company: companyId });
  if (error) throw error;
}

export async function rejectCompany(companyId: string, reason?: string): Promise<void> {
  const { error } = await db.rpc("reject_company", {
    _company: companyId,
    _reason: reason ?? null,
  });
  if (error) throw error;
}

export async function clearN8nLogs(): Promise<void> {
  const { error } = await db.rpc("clear_n8n_logs");
  if (error) throw error;
}

// ---------- Memberships ----------
export async function fetchMyMembership(companyId: string): Promise<Membership | null> {
  const { data, error } = await db
    .from("memberships")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Membership | null;
}

export type MyRole = Role | null;

// ---------- Categories ----------
export async function fetchCategories(companyId: string): Promise<Category[]> {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await db
      .from("categories")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }

  return allData as Category[];
}

export async function createCategory(companyId: string, name: string, description?: string, userId?: string, ncm?: string | null) {
  const { data, error } = await db
    .from("categories")
    .insert({ company_id: companyId, name: name.toUpperCase().trim(), description: description || null, ncm: ncm || null, created_by: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, name: string, description?: string, ncm?: string | null) {
  const { data, error } = await db
    .from("categories")
    .update({ name: name.toUpperCase().trim(), description: description || null, ncm: ncm ?? null })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Category;
}

export async function deleteCategory(id: string) {
  const { count, error: countError } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: existem produtos vinculados a esta categoria.");
  }
  const { error } = await db.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Brands ----------
export async function fetchBrands(companyId: string): Promise<Brand[]> {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await db
      .from("brands")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }

  return allData as Brand[];
}

export async function createBrand(companyId: string, name: string, _userId?: string) {
  const { data, error } = await db
    .from("brands")
    .insert({ company_id: companyId, name: name.toUpperCase().trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data as Brand;
}

export async function updateBrand(id: string, name: string) {
  const { data, error } = await db
    .from("brands")
    .update({ name: name.toUpperCase().trim() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Brand;
}

export async function deleteBrand(id: string) {
  const { count, error: countError } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: existem produtos vinculados a esta marca.");
  }
  const { error } = await db.from("brands").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Stock Locations ----------
export async function fetchStockLocations(companyId: string) {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await db
      .from("stock_locations")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }

  return allData as import("./db-types").StockLocation[];
}

export async function createStockLocation(companyId: string, name: string, _userId?: string) {
  const { data, error } = await db
    .from("stock_locations")
    .insert({ company_id: companyId, name: name.toUpperCase().trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data as import("./db-types").StockLocation;
}

export async function updateStockLocation(id: string, params: { name?: string; pos_x?: number; pos_y?: number; area_width?: number; area_height?: number; is_vertical?: boolean }) {
  const updateData: any = {};
  if (params.name !== undefined) updateData.name = params.name.toUpperCase().trim();
  if (params.pos_x !== undefined) updateData.pos_x = params.pos_x;
  if (params.pos_y !== undefined) updateData.pos_y = params.pos_y;
  if (params.area_width !== undefined) updateData.area_width = params.area_width;
  if (params.area_height !== undefined) updateData.area_height = params.area_height;
  if (params.is_vertical !== undefined) updateData.is_vertical = params.is_vertical;

  const { data, error } = await db
    .from("stock_locations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteStockLocation(id: string) {
  const { count, error: countError } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("location_id", id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: existem produtos vinculados a esta localização.");
  }
  const { error } = await db.from("stock_locations").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Units (unidades de medida) ----------
export async function fetchUnits(companyId: string): Promise<import("./db-types").Unit[]> {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await db
      .from("units")
      .select("*")
      .eq("company_id", companyId)
      .order("abbreviation")
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }

  return allData as import("./db-types").Unit[];
}

export async function createUnit(
  companyId: string,
  input: { abbreviation: string; description: string },
) {
  const { data, error } = await db
    .from("units")
    .insert({
      company_id: companyId,
      abbreviation: input.abbreviation.trim().toUpperCase(),
      description: input.description.trim(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as import("./db-types").Unit;
}

export async function updateUnit(
  id: string,
  patch: { abbreviation?: string; description?: string },
) {
  const updates: Record<string, string> = {};
  if (patch.abbreviation !== undefined)
    updates.abbreviation = patch.abbreviation.trim().toUpperCase();
  if (patch.description !== undefined) updates.description = patch.description.trim();
  const { data, error } = await db
    .from("units")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as import("./db-types").Unit;
}

export async function deleteUnit(id: string) {
  const { count, error: countError } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("Não é possível excluir: existem produtos vinculados a esta unidade.");
  }
  const { error } = await db.from("units").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Products ----------
export async function fetchProductsPaginated(params: {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  categoryId?: string;
  brandId?: string;
  locationId?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  hasAdditionalBrands?: boolean;
  ncmFilter?: "all" | "with" | "without";
}) {
  let query = db
    .from("products")
    .select("*, profiles!products_updated_by_fkey(name)", { count: "exact" })
    .eq("company_id", params.companyId);

  const searchTerm = params.search?.trim() ?? "";
  const normalizedSearchTerm = normalizeProductSearchQuery(searchTerm);
  const searchWords = normalizedSearchTerm
      .split(/\s+/)
      .filter(Boolean);

  // Refs apenas se cair no fallback (busca complexa). Evita custo em cada tecla.
  let companyRefsForSearch: any[] = [];

  if (params.categoryId && params.categoryId !== "all" && params.categoryId !== "none") {
    query = query.eq("category_id", params.categoryId);
  }
  
  if (params.brandId && params.brandId !== "all" && params.brandId !== "none") {
    query = query.eq("brand_id", params.brandId);
  }

  if (params.locationId && params.locationId !== "all" && params.locationId !== "none") {
    query = query.eq("location_id", params.locationId);
  }

  if (params.status === "zerado") {
    query = query.eq("stock", 0);
  } else if (params.status === "baixo") {
    query = query.lte("stock", db.raw("min_stock")); 
    // Wait, supabase-js might not like db.raw directly in lte if it's a column.
    // Actually, we can use filter or rpc, but let's try a simpler approach if possible.
    // In postgrest, comparing columns: `stock=lte.min_stock`
    query = query.filter("stock", "lte", "min_stock"); // This is the correct way for column comparison in postgrest
  } else if (params.status === "ok") {
    query = query.filter("stock", "gt", "min_stock");
  }
  
  if (params.hasAdditionalBrands) {
    const { data: refIds } = await db
      .from("product_references")
      .select("product_id")
      .eq("company_id", params.companyId);

    const uniqueIds = Array.from(new Set((refIds || []).map((r: any) => r.product_id)));
    if (uniqueIds.length > 0) {
      query = query.in("id", uniqueIds);
    } else {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  if (params.ncmFilter === "with") {
    query = query.not("ncm", "is", null).not("ncm", "eq", "").not("ncm", "eq", "00000000");
  } else if (params.ncmFilter === "without") {
    query = query.or("ncm.is.null,ncm.eq.,ncm.eq.00000000");
  }

  if (searchWords.length > 0) {
    // Busca server-side via RPC search_products (tsvector + GIN).
    const { data, error } = await db.rpc("search_products", {
      _company: params.companyId,
      _q: normalizedSearchTerm,
      _category: params.categoryId && params.categoryId !== "all" && params.categoryId !== "none" ? params.categoryId : null,
      _brand: params.brandId && params.brandId !== "all" && params.brandId !== "none" ? params.brandId : null,
      _location: params.locationId && params.locationId !== "all" && params.locationId !== "none" ? params.locationId : null,
      _status: params.status && ["zerado", "baixo", "ok"].includes(params.status) ? params.status : null,
      _has_refs: !!params.hasAdditionalBrands,
      _sort_by: params.sortBy || "name",
      _sort_desc: params.sortOrder === "desc",
      _limit: params.pageSize,
      _offset: params.page * params.pageSize,
      _ncm_filter: params.ncmFilter && params.ncmFilter !== "all" ? params.ncmFilter : null,
    });
    if (error) throw error;

    const payload = (data as any) || { rows: [], total: 0 };
    const rows: any[] = payload.rows || [];
    const total: number = Number(payload.total || 0);

    const productIds = rows.map((p) => p.id);
    let refsByProduct: Record<string, string[]> = {};
    if (productIds.length > 0) {
      const { data: refs } = await db
        .from("product_references")
        .select("product_id, manufacturer_code")
        .in("product_id", productIds);
      for (const r of refs ?? []) {
        if (!refsByProduct[r.product_id]) refsByProduct[r.product_id] = [];
        refsByProduct[r.product_id].push(r.manufacturer_code);
      }
    }

    const creatorIds = Array.from(new Set(rows.map((p) => p.created_by).filter(Boolean)));
    let creatorMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creators } = await db
        .from("profiles")
        .select("id, name")
        .in("id", creatorIds);
      creatorMap = Object.fromEntries((creators ?? []).map((c: any) => [c.id, c.name]));
    }

    let mapped = rows.map((p) => ({
      ...p,
      last_editor_profile: p._updater_name ? { name: p._updater_name } : null,
      profiles: p.created_by && creatorMap[p.created_by] ? { name: creatorMap[p.created_by] } : null,
      product_references: (refsByProduct[p.id] || []).map((code) => ({ manufacturer_code: code })),
    })) as Product[];

    // Filtro NCM aplicado pós-RPC como garantia caso o RPC antigo ainda esteja em cache.
    if (params.ncmFilter === "with") {
      mapped = mapped.filter((p) => {
        const ncm = normalizeNcm(p.ncm);
        return ncm.length === 8 && ncm !== "00000000";
      });
    } else if (params.ncmFilter === "without") {
      mapped = mapped.filter((p) => {
        const ncm = normalizeNcm(p.ncm);
        return ncm.length !== 8 || ncm === "00000000";
      });
    }

    return { data: mapped, count: total };
  }


  const from = params.page * params.pageSize;
  const to = from + params.pageSize - 1;

  const { data, error, count } = await query
    .order(params.sortBy === "name" || !params.sortBy ? "name" : params.sortBy, { ascending: params.sortOrder !== 'desc' })
    .order("name", { ascending: true }) // Sempre desempata por nome para manter ordem estável
    .range(from, to);

  if (error) throw error;

  const products = data || [];
  const creatorIds = Array.from(new Set(products.map((p: any) => p.created_by).filter(Boolean)));
  let creatorMap: Record<string, string> = {};
  
  if (creatorIds.length > 0) {
    const { data: creators } = await db
      .from("profiles")
      .select("id, name")
      .in("id", creatorIds);
    creatorMap = Object.fromEntries((creators ?? []).map((c: any) => [c.id, c.name]));
  }

  // Buscar referências (códigos de fabricante) dos produtos retornados
  const productIds = products.map((p: any) => p.id);
  let refsByProduct: Record<string, string[]> = {};
  if (productIds.length > 0) {
    const { data: refs } = await db
      .from("product_references")
      .select("product_id, manufacturer_code")
      .in("product_id", productIds);
    for (const r of (refs ?? [])) {
      if (!refsByProduct[r.product_id]) refsByProduct[r.product_id] = [];
      refsByProduct[r.product_id].push(r.manufacturer_code);
    }
  }

  const mapped = products.map((p: any) => ({
    ...p,
    last_editor_profile: p.profiles ? { name: p.profiles.name } : null,
    profiles: p.created_by && creatorMap[p.created_by] ? { name: creatorMap[p.created_by] } : null,
    product_references: (refsByProduct[p.id] || []).map(code => ({ manufacturer_code: code })),
  })) as Product[];

  return {
    data: mapped,
    count: count ?? 0
  };
}

export async function searchProductsRpc(params: {
  companyId: string;
  search: string;
  brandId?: string | null;
  limit?: number;
}): Promise<Product[]> {
  const { data, error } = await db.rpc("search_products", {
    _company: params.companyId,
    _q: normalizeProductSearchQuery(params.search),
    _category: null,
    _brand: params.brandId && params.brandId !== "all" ? params.brandId : null,
    _location: null,
    _status: null,
    _has_refs: false,
    _sort_by: "name",
    _sort_desc: false,
    _limit: params.limit ?? 100,
    _offset: 0,
  });
  if (error) throw error;
  const payload = (data as any) || { rows: [] };
  return ((payload.rows as any[]) || []) as Product[];
}



export async function fetchProductsByManufacturerCode(
  companyId: string,
  term: string,
  limit = 50,
): Promise<Product[]> {
  const searchTerm = term.trim();
  if (!searchTerm) return [];

  const [{ data: refMatches }, { data: directMatches, error }] = await Promise.all([
    db
      .from("product_references")
      .select("product_id")
      .eq("company_id", companyId)
      .ilike("manufacturer_code", `%${searchTerm}%`),
    db
      .from("products")
      .select("*, profiles!products_updated_by_fkey(name)")
      .eq("company_id", companyId)
      .or(`sku.ilike.%${searchTerm}%,alternative_code.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%,name.ilike.%${searchTerm.endsWith("s") ? searchTerm.slice(0, -1) : searchTerm + "s"}%`)
      .order("name", { ascending: true })
      .limit(limit),
  ]);

  if (error) throw error;

  const directProducts = directMatches ?? [];
  const directIds = new Set(directProducts.map((p: any) => p.id));
  const refProductIds = Array.from(new Set((refMatches ?? []).map((r: any) => r.product_id).filter(Boolean)))
    .filter((id) => !directIds.has(id));

  let referencedProducts: any[] = [];
  if (refProductIds.length > 0) {
    const { data, error: refProductsError } = await db
      .from("products")
      .select("*, profiles!products_updated_by_fkey(name)")
      .eq("company_id", companyId)
      .in("id", refProductIds)
      .order("name", { ascending: true })
      .limit(limit);
    if (refProductsError) throw refProductsError;
    referencedProducts = data ?? [];
  }

  const products = [...directProducts, ...referencedProducts].slice(0, limit);
  const productIds = products.map((p: any) => p.id);
  let refsByProduct: Record<string, string[]> = {};
  if (productIds.length > 0) {
    const { data: refs } = await db
      .from("product_references")
      .select("product_id, manufacturer_code")
      .in("product_id", productIds);
    for (const r of (refs ?? [])) {
      if (!refsByProduct[r.product_id]) refsByProduct[r.product_id] = [];
      refsByProduct[r.product_id].push(r.manufacturer_code);
    }
  }

  return products.map((p: any) => ({
    ...p,
    last_editor_profile: p.profiles ? { name: p.profiles.name } : null,
    product_references: (refsByProduct[p.id] || []).map(code => ({ manufacturer_code: code })),
  })) as Product[];
}

export async function fetchProducts(companyId: string): Promise<Product[]> {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await db
      .from("products")
      .select("*, profiles!products_updated_by_fkey(name)")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }

  const products = allData;

  // Buscar nomes dos criadores em batch
  const creatorIds = Array.from(
    new Set(products.map((p) => p.created_by).filter(Boolean))
  );
  let creatorMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await db
      .from("profiles")
      .select("id, name")
      .in("id", creatorIds);
    creatorMap = Object.fromEntries((creators ?? []).map((c: any) => [c.id, c.name]));
  }

  // Buscar códigos adicionais (product_references) para busca por sub-marcas no PDV
  const refsByProduct: Record<string, string[]> = {};
  {
    const { data: refs } = await db
      .from("product_references")
      .select("product_id, manufacturer_code")
      .eq("company_id", companyId);
    for (const r of refs ?? []) {
      if (!r.manufacturer_code) continue;
      if (!refsByProduct[r.product_id]) refsByProduct[r.product_id] = [];
      refsByProduct[r.product_id].push(r.manufacturer_code);
    }
  }

  return products.map((p) => ({
    ...p,
    last_editor_profile: p.profiles ? { name: p.profiles.name } : null,
    profiles: p.created_by && creatorMap[p.created_by] ? { name: creatorMap[p.created_by] } : null,
    product_references: (refsByProduct[p.id] || []).map((code) => ({ manufacturer_code: code })),
  })) as Product[];
}


export async function createProduct(
  companyId: string,
  input: {
    sku: string;
    alternative_code?: string | null;
    
    name: string;
    brand?: string | null;
    brand_id?: string | null;
    category_id?: string | null;
    supplier_id?: string | null;
    location_id?: string | null;
    description?: string | null;
    cost_price: number;
    sale_price: number;
    stock?: number;
    min_stock?: number;
    unit?: string;
    unit_id?: string | null;
    image_url?: string | null;
    ncm?: string | null;
    userId?: string;
  }
): Promise<Product> {
  const ncm = normalizeRequiredNcm(input.ncm);

  // Validação de duplicidade de SKU dentro da empresa
  if (input.sku) {
    // Checa SKU principal
    const { data: existing } = await db
      .from("products")
      .select("id")
      .eq("company_id", companyId)
      .eq("sku", input.sku)
      .maybeSingle();
    
    if (existing) {
      throw new Error(`O Código Fabricante (SKU) "${input.sku}" já está cadastrado nesta empresa.`);
    }

    // Checa se o SKU já existe nos códigos adicionais (product_references)
    const { data: existingRef } = await db
      .from("product_references")
      .select("product_id")
      .eq("company_id", companyId)
      .eq("manufacturer_code", input.sku)
      .maybeSingle();

    if (existingRef) {
      throw new Error(`O código "${input.sku}" já está cadastrado como um código adicional de outro produto.`);
    }
  }

  const insertPayload = {
      company_id: companyId,
      sku: input.sku,
      alternative_code: input.alternative_code || null,

      name: input.name.trim(),
      brand: input.brand || null,
      brand_id: input.brand_id || null,
      category_id: input.category_id || null,
      supplier_id: input.supplier_id || null,
      location_id: input.location_id || null,
      description: input.description || null,
      cost_price: input.cost_price,
      sale_price: input.sale_price,
      stock: input.stock ?? 0,
      min_stock: input.min_stock ?? 0,
      unit: input.unit || "UN",
      unit_id: input.unit_id ?? null,
      image_url: input.image_url || null,
      ncm,
      created_by: input.userId,
    } as any;

  const { data, error } = await db
    .from("products")
    .insert(insertPayload)
    .select("*")
    .single();

  // Se houver sucesso, limpamos o nome no banco para evitar problemas futuros com espaços
  if (data?.id) {
    await db.from("products").update({ name: input.name.trim() }).eq("id", data.id);
  }
  if (error) throw error;

  // Auto-adiciona produto à contagem aberta da empresa (se existir)
  try {
    const { data: openCount } = await db
      .from("stock_counts")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "aberta")
      .maybeSingle();
    if (openCount?.id) {
      const qty = Number(data.stock || 0);
      const price = Number(data.sale_price || 0);
      const autoVerified = qty > 0 && price > 0;
      await db.from("stock_count_items").insert({
        count_id: openCount.id,
        company_id: companyId,
        product_id: data.id,
        sku: data.sku,
        product_name: data.name,
        unit: data.unit || "UN",
        expected_quantity: qty,
        verified: autoVerified,
        verified_at: autoVerified ? new Date().toISOString() : null,
      });
    }
  } catch (e) {
    console.warn("Falha ao adicionar produto à contagem aberta:", e);
  }

  // Auditoria
  if (input.userId) {
    await logActivity({
      companyId,
      userId: input.userId,
      action: "INSERT",
      entity: "products",
      entityId: data.id,
      meta: { new: data },
    });
  }

  return data as Product;
}

export async function updateProduct(id: string, patch: Partial<Product>, userId?: string) {
  const normalizedNcm = Object.prototype.hasOwnProperty.call(patch, "ncm")
    ? normalizeRequiredNcm((patch as any).ncm)
    : undefined;

  // Validação de duplicidade de SKU ao atualizar
  if (patch.sku) {
    // Primeiro pegamos a empresa do produto
    const { data: currentProduct } = await db
      .from("products")
      .select("company_id")
      .eq("id", id)
      .single();

    if (currentProduct) {
      const { data: existing } = await db
        .from("products")
        .select("id")
        .eq("company_id", currentProduct.company_id)
        .eq("sku", patch.sku)
        .neq("id", id) // ignora o próprio produto
        .maybeSingle();
      
      if (existing) {
        throw new Error(`O Código Fabricante (SKU) "${patch.sku}" já está cadastrado nesta empresa em outro produto.`);
      }

      // Também checa nos códigos adicionais (product_references)
      const { data: existingRef } = await db
        .from("product_references")
        .select("product_id")
        .eq("company_id", currentProduct.company_id)
        .eq("manufacturer_code", patch.sku)
        .neq("product_id", id)
        .maybeSingle();

      if (existingRef) {
        throw new Error(`O código "${patch.sku}" já está cadastrado como um código adicional de outro produto.`);
      }
    }
  }

  const normalizedPatch = {
    ...patch,
    ...(typeof patch.name === "string" ? { name: patch.name.trim() } : {}),
    ...(normalizedNcm !== undefined ? { ncm: normalizedNcm } : {}),
  } as any;

  const { data, error } = await db
    .from("products")
    .update({ ...normalizedPatch, name: normalizedPatch.name?.trim(), updated_by: userId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

  // Sincroniza item da contagem aberta (insere se faltar, atualiza nome/sku/unit)
  try {
    const { data: openCount } = await db
      .from("stock_counts")
      .select("id")
      .eq("company_id", data.company_id)
      .eq("status", "aberta")
      .maybeSingle();
    if (openCount?.id) {
      const { data: existingItem } = await db
        .from("stock_count_items")
        .select("id")
        .eq("count_id", openCount.id)
        .eq("product_id", data.id)
        .maybeSingle();
      if (existingItem?.id) {
        await db
          .from("stock_count_items")
          .update({
            sku: data.sku,
            product_name: data.name,
            unit: data.unit || "UN",
          })
          .eq("id", existingItem.id);
      } else {
        await db.from("stock_count_items").insert({
          count_id: openCount.id,
          company_id: data.company_id,
          product_id: data.id,
          sku: data.sku,
          product_name: data.name,
          unit: data.unit || "UN",
          expected_quantity: Number(data.stock || 0),
          verified: false,
        });
      }
    }
  } catch (e) {
    console.warn("Falha ao sincronizar produto com contagem aberta:", e);
  }

  // Auditoria
  if (userId) {
    await logActivity({
      companyId: data.company_id,
      userId,
      action: "UPDATE",
      entity: "products",
      entityId: data.id,
      meta: { patch: normalizedPatch }
    });
  }

  return data as Product;
}

export async function deleteProduct(id: string, userId?: string) {
  // Pegamos os dados antes de deletar para o log
  const { data: oldData } = await db.from("products").select("*").eq("id", id).maybeSingle();
  
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) throw error;

  // Auditoria
  if (userId && oldData) {
    await logActivity({
      companyId: oldData.company_id,
      userId,
      action: "DELETE",
      entity: "products",
      entityId: id,
      meta: { old: oldData }
    });
  }
}

// ---------- Batch Operations ----------
export async function updateProductsLocationBatch(params: {
  companyId: string;
  productIds: string[];
  locationId: string | null;
  userId?: string;
}) {
  const { companyId, productIds, locationId, userId } = params;
  
  const { data: updatedProducts, error } = await db
    .from("products")
    .update({ 
      location_id: locationId === "none" ? null : locationId,
      updated_by: userId 
    })
    .in("id", productIds)
    .select("id, name");

  if (error) throw error;

  // Auditoria para cada produto atualizado
  if (userId && updatedProducts) {
    const auditPromises = updatedProducts.map((p: any) => 
      logActivity({
        companyId,
        userId,
        action: "UPDATE",
        entity: "products",
        entityId: p.id,
        meta: { patch: { location_id: locationId }, note: "Transferência em lote" }
      })
    );
    await Promise.all(auditPromises);
  }

  return updatedProducts;
}

// ---------- Product References (multi-marca/código) ----------
export interface ProductReference {
  id: string;
  company_id: string;
  product_id: string;
  brand_id: string | null;
  brand_name: string | null;
  manufacturer_code: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchProductReferencesByCompany(companyId: string): Promise<ProductReference[]> {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await db
      .from("product_references")
      .select("*")
      .eq("company_id", companyId)
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }

  return allData as ProductReference[];
}

export async function fetchProductReferences(productId: string): Promise<ProductReference[]> {
  const { data, error } = await db
    .from("product_references")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductReference[];
}

export async function replaceProductReferences(
  companyId: string,
  productId: string,
  refs: Array<{ brand_id: string | null; manufacturer_code: string | null }>,
) {
  // Validação de duplicidade nos códigos adicionais (Manufacturer Code)
  // Dentro do próprio array enviado
  const codes = refs.map(r => r.manufacturer_code?.trim()).filter(Boolean);
  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) {
    throw new Error("Não é permitido cadastrar códigos de fabricante duplicados no mesmo produto.");
  }

  // Contra outros produtos da mesma empresa
  if (codes.length > 0) {
    const { data: existing } = await db
      .from("product_references")
      .select("product_id, manufacturer_code")
      .eq("company_id", companyId)
      .in("manufacturer_code", codes)
      .neq("product_id", productId); // Ignora o próprio produto
    
    if (existing && existing.length > 0) {
      throw new Error(`O código de fabricante "${existing[0].manufacturer_code}" já está cadastrado em outro produto desta empresa.`);
    }
    
    // Também checa contra o SKU principal de outros produtos
    const { data: existingSku } = await db
      .from("products")
      .select("id, sku")
      .eq("company_id", companyId)
      .in("sku", codes)
      .neq("id", productId);
      
    if (existingSku && existingSku.length > 0) {
      throw new Error(`O código "${existingSku[0].sku}" já está cadastrado como Código Fabricante (SKU) principal de outro produto.`);
    }
  }

  await db.from("product_references").delete().eq("product_id", productId);
  if (refs.length === 0) return;
  const payload = refs
    .filter((r) => r.brand_id !== null || (r.manufacturer_code || "").trim().length > 0)
    .map((r) => ({
      company_id: companyId,
      product_id: productId,
      brand_id: r.brand_id,
      manufacturer_code: r.manufacturer_code?.trim() || null,
    }));
  if (payload.length === 0) return;
  const { error } = await db.from("product_references").insert(payload);
  if (error) throw error;
}


// ---------- Movements ----------
export async function fetchMovementsPaginated(params: {
  companyId: string;
  page: number;
  pageSize: number;
}) {
  const from = params.page * params.pageSize;
  const to = from + params.pageSize - 1;

  const { data, error, count } = await db
    .from("stock_movements")
    .select("*, profiles(name)", { count: "exact" })
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  
  return {
    data: data ?? [],
    count: count ?? 0
  };
}

export async function fetchMovements(companyId: string, limit = 200): Promise<any[]> {
  const { data, error } = await db
    .from("stock_movements")
    .select("*, profiles(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function registerMovement(input: {
  companyId: string;
  productId: string;
  type: MovementType;
  quantity: number;
  unitCost?: number;
  reason?: string;
  userId: string;
}) {
  const { error } = await db.from("stock_movements").insert({
    company_id: input.companyId,
    product_id: input.productId,
    type: input.type,
    quantity: input.quantity,
    unit_cost: input.unitCost ?? null,
    reason: input.reason ?? null,
    created_by: input.userId,
  });
  if (error) throw error;

  // Auditoria
  let auditAction = 'UPDATE';
  if (input.type === 'entrada') auditAction = 'ENTRY';
  else if (input.type === 'venda') auditAction = 'SALE';
  else if (input.type === 'saida') auditAction = 'OUT';
  else if (input.type === 'ajuste') auditAction = 'ADJUST';
  else if (input.type === 'devolucao') auditAction = 'RETURN';

  await logActivity({
    companyId: input.companyId,
    userId: input.userId,
    action: auditAction,
    entity: "products",
    entityId: input.productId,
    meta: { type: input.type, quantity: input.quantity, reason: input.reason }
  });
}

// ---------- Stock Counts ----------
export async function fetchStockCounts(companyId: string): Promise<StockCount[]> {
  const { data, error } = await db
    .from("stock_counts")
    .select("*")
    .eq("company_id", companyId)
    .order("count_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StockCount[];
}

export async function fetchStockCountItems(countId: string): Promise<StockCountItem[]> {
  let allData: StockCountItem[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await db
      .from("stock_count_items")
      .select("*")
      .eq("count_id", countId)
      .order("product_name", { ascending: true })
      .range(from, from + step - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...(data as StockCountItem[])];
    if (data.length < step) break;
    from += step;
  }

  return allData;
}

export async function createStockCount(input: {
  companyId: string;
  countDate: string;
  products: Product[];
  userId?: string;
}): Promise<StockCount> {
  const { data: count, error } = await db
    .from("stock_counts")
    .insert({ company_id: input.companyId, count_date: input.countDate, created_by: input.userId })
    .select("*")
    .single();
  if (error) throw error;

  const items = input.products.map((p) => ({
    count_id: count.id,
    company_id: input.companyId,
    product_id: p.id,
    sku: p.sku,
    product_name: p.name,
    unit: p.unit,
    expected_quantity: Number(p.stock),
  }));

  if (items.length) {
    const { error: itemsError } = await db.from("stock_count_items").insert(items);
    if (itemsError) throw itemsError;
  }

  return count as StockCount;
}

export async function updateStockCountItem(id: string, updates: Partial<StockCountItem>): Promise<void> {
  const { error } = await db
    .from("stock_count_items")
    .update({
      ...updates,
      verified_at: updates.verified ? new Date().toISOString() : (updates.verified === false ? null : undefined)
    })
    .eq("id", id);
  if (error) throw error;
}

export async function updateStockCountItemVerified(id: string, verified: boolean): Promise<void> {
  return updateStockCountItem(id, { verified });
}

export async function updateStockCountStatus(id: string, status: StockCount["status"]): Promise<void> {
  const { error } = await db.from("stock_counts").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteStockCount(id: string): Promise<void> {
  const { error } = await db.from("stock_counts").delete().eq("id", id);
  if (error) throw error;
}


export async function fetchStockCountTeams(countId: string): Promise<StockCountTeam[]> {
  const { data: teams, error } = await db
    .from("stock_count_teams")
    .select("*, stock_count_team_locations(location_id), stock_count_team_members(user_id)")
    .eq("count_id", countId);
  
  if (error) throw error;
  
  return (teams || []).map((team: any) => ({
    ...team,
    locations: team.stock_count_team_locations?.map((l: any) => l.location_id) || [],
    members: team.stock_count_team_members?.map((m: any) => m.user_id) || []
  }));
}

export async function createStockCountTeam(input: {
  count_id: string;
  company_id: string;
  name: string;
}): Promise<StockCountTeam> {
  const { data, error } = await db
    .from("stock_count_teams")
    .insert({ ...input, status: "aberta" })
    .select("*")
    .single();
    
  if (error) throw error;
  return { ...data, locations: [], members: [] };
}

export async function updateStockCountTeamStatus(id: string, status: "aberta" | "concluida"): Promise<void> {
  const { error } = await db
    .from("stock_count_teams")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteStockCountTeam(id: string): Promise<void> {
  const { error } = await db.from("stock_count_teams").delete().eq("id", id);
  if (error) throw error;
}

export async function updateStockCountTeamLocations(
  companyId: string,
  countId: string,
  teamId: string,
  locationIds: string[]
): Promise<void> {
  // Remover associações atuais desta equipe
  const { error: deleteError } = await db
    .from("stock_count_team_locations")
    .delete()
    .eq("team_id", teamId);
    
  if (deleteError) throw deleteError;

  if (locationIds.length > 0) {
    const inserts = locationIds.map(locId => ({
      company_id: companyId,
      count_id: countId,
      team_id: teamId,
      location_id: locId
    }));
    
    const { error: insertError } = await db
      .from("stock_count_team_locations")
      .insert(inserts);
      
    if (insertError) {
      if (insertError.message?.includes("unique_location_per_count")) {
        throw new Error("Uma ou mais localizações já estão atribuídas a outra equipe.");
      }
      throw insertError;
    }
  }
}

export async function updateStockCountTeamMembers(
  companyId: string,
  countId: string,
  teamId: string,
  userIds: string[]
): Promise<void> {
  // Remover associações atuais desta equipe
  const { error: deleteError } = await db
    .from("stock_count_team_members")
    .delete()
    .eq("team_id", teamId);
    
  if (deleteError) throw deleteError;

  if (userIds.length > 0) {
    if (userIds.length > 2) throw new Error("Uma equipe pode ter no máximo 2 membros.");
    const inserts = userIds.map(uid => ({
      company_id: companyId,
      count_id: countId,
      team_id: teamId,
      user_id: uid
    }));
    
    const { error: insertError } = await db
      .from("stock_count_team_members")
      .insert(inserts);
      
    if (insertError) {
      if (insertError.message?.includes("unique_member_per_count")) {
        throw new Error("Um ou mais usuários já estão atribuídos a outra equipe nesta contagem.");
      }
      throw insertError;
    }
  }
}


// ---------- Partners ----------
export async function fetchPartners(companyId: string, type?: PartnerType): Promise<Partner[]> {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    let q = db.from("partners")
      .select("*")
      .eq("company_id", companyId)
      .order("name")
      .range(from, from + step - 1);

    if (type) {
      q = q.in("type", type === "ambos" ? ["cliente", "fornecedor", "ambos"] : [type, "ambos"]);
    }

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }

  return allData as Partner[];
}

export async function upsertPartner(
  companyId: string,
  patch: Partial<Partner> & { id?: string; name: string; type: PartnerType; userId?: string }
): Promise<Partner> {
  const payload = {
    company_id: companyId,
    type: patch.type,
    name: patch.type === "fornecedor" ? patch.name.toUpperCase().trim() : patch.name,
    doc: patch.doc ?? null,
    email: patch.email ?? null,
    phone: patch.phone ?? null,
    address: patch.address ?? null,
    cep: patch.cep ?? null,
    number: patch.number ?? null,
    complement: patch.complement ?? null,
    notes: patch.notes ?? null,
    active: patch.active ?? true,
    created_by: patch.userId,
  };
  if (patch.id) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { created_by, ...updatePayload } = payload;
    const { data, error } = await db.from("partners").update(updatePayload).eq("id", patch.id).select("*").single();
    if (error) throw error;
    return data as Partner;
  }
  const { data, error } = await db.from("partners").insert(payload).select("*").single();
  if (error) throw error;
  return data as Partner;
}

export async function deletePartner(id: string) {
  const { error } = await db.from("partners").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Sales ----------
export interface SaleItemInput {
  product_id: string;
  quantity: number;
  unit_price: number;
}

// Soma N meses a uma data YYYY-MM-DD (mantém o dia, ajustando para o último do mês quando necessário)
function addMonthsToDate(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, (m - 1) + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, lastDay));
  return base.toISOString().slice(0, 10);
}

// Distribui um valor em N parcelas iguais (ajustando centavos na última)
function splitInstallments(amount: number, n: number): number[] {
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  const arr = Array(n).fill(base).map((c, i) => (i === n - 1 ? c + remainder : c));
  return arr.map((c) => c / 100);
}

// Métodos considerados "à vista" (geram payable já marcado como pago)
function isCashLikeMethod(method: string): boolean {
  const m = (method || "").toLowerCase();
  return /(dinheiro|pix|d[eé]bito|cart[aã]o\s*d[eé]bito)/.test(m);
}

export async function saveSalePayments(
  companyId: string,
  saleId: string,
  payments: SalePaymentInput[]
): Promise<void> {
  if (!payments || payments.length === 0) return;
  await db.from("sale_payments").delete().eq("sale_id", saleId);
  const rows = payments.map((p) => ({
    sale_id: saleId,
    company_id: companyId,
    payment_method_id: p.payment_method_id ?? null,
    method: p.method,
    amount: Number(p.amount),
    installments: Math.max(1, Number(p.installments ?? 1)),
    first_due_date: p.first_due_date ?? null,
    notes: p.notes ?? null,
  }));
  const { error } = await db.from("sale_payments").insert(rows);
  if (error) throw error;
}

export async function fetchSalePayments(saleId: string): Promise<SalePayment[]> {
  const { data, error } = await db
    .from("sale_payments")
    .select("*")
    .eq("sale_id", saleId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SalePayment[];
}

// Gera N entradas em payables a partir de um sale_payment
async function createPayablesForPayment(opts: {
  companyId: string;
  saleId: string;
  customerId: string | null;
  payment: SalePaymentInput;
  createdBy?: string | null;
  notes?: string | null;
}) {
  const { payment, saleId, companyId, customerId, createdBy, notes } = opts;
  const installments = Math.max(1, Number(payment.installments ?? 1));
  const today = new Date().toISOString().slice(0, 10);
  const firstDue = payment.first_due_date || today;

  // Determina se a forma de pagamento exige vencimento (à prazo).
  // Se não exigir, a venda é à vista e o lançamento já nasce "pago".
  let requiresDueDate = false;
  if (payment.payment_method_id) {
    const { data: pm } = await db
      .from("payment_methods")
      .select("requires_due_date")
      .eq("id", payment.payment_method_id)
      .maybeSingle();
    if (pm) requiresDueDate = !!pm.requires_due_date;
  } else if (payment.method) {
    const { data: pm } = await db
      .from("payment_methods")
      .select("requires_due_date")
      .eq("company_id", companyId)
      .eq("name", payment.method)
      .maybeSingle();
    if (pm) requiresDueDate = !!pm.requires_due_date;
  }
  const isPaid = !requiresDueDate;
  const parts = splitInstallments(Number(payment.amount), installments);

  const rows = parts.map((amt, idx) => {
    const due = idx === 0 ? firstDue : addMonthsToDate(firstDue, idx);
    const label = installments > 1 ? ` (${idx + 1}/${installments} - ${payment.method})` : "";
    return {
      company_id: companyId,
      direction: "receber" as PayableDirection,
      partner_id: customerId,
      sale_id: saleId,
      description: `Venda #${saleId.slice(0, 8)}${label}`,
      amount: amt,
      due_date: due,
      status: isPaid ? "pago" : "aberto",
      paid_at: isPaid ? today : null,
      payment_method: payment.method,
      notes: notes ?? null,
      created_by: createdBy ?? null,
    };
  });
  if (rows.length === 0) return;
  const { error } = await db.from("payables").insert(rows);
  if (error) {
    console.error("Erro ao inserir payables (parcelas):", error);
    throw error;
  }
}


export async function registerSale(input: {
  companyId: string;
  customerId: string | null;
  items: SaleItemInput[];
  discount?: number;
  paymentMethod?: string;
  dueDate?: string | null;
  payments?: SalePaymentInput[];
  notes?: string | null;
  userId?: string;
  status?: "aberta" | "concluida";
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;
  const realCreatorId = input.userId || currentUserId;

  // Se o customerId for "none", passamos null para o RPC
  const cleanCustomerId = (input.customerId === "none" || !input.customerId) ? null : input.customerId;

  // Forma "principal" (snapshot legado em sales.payment_method): a de maior valor
  const dominant = (input.payments && input.payments.length > 0)
    ? [...input.payments].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
    : null;
  const legacyPaymentMethod = dominant?.method ?? input.paymentMethod ?? "dinheiro";
  const legacyDueDate = dominant?.first_due_date ?? input.dueDate ?? null;

  const { data, error } = await db.rpc("register_sale", {
    _company: input.companyId,
    _customer: cleanCustomerId,
    _items: input.items,
    _discount: input.discount ?? 0,
    _payment_method: legacyPaymentMethod,
    _due_date: legacyDueDate,
    _notes: input.notes ?? null,
    _status: input.status ?? "concluida",
  });

  if (error) {
    console.error("Erro no RPC register_sale:", error);
    throw error;
  }

  const saleId = data as string;

  // Auditoria
  if (currentUserId) {
    await logActivity({
      companyId: input.companyId,
      userId: currentUserId,
      action: "INSERT",
      entity: "sales",
      entityId: saleId,
      meta: { input }
    });
    if (realCreatorId && realCreatorId !== currentUserId) {
      try {
        await db.from("sales").update({ created_by: realCreatorId }).eq("id", saleId);
        await db.from("payables").update({ created_by: realCreatorId }).eq("sale_id", saleId);
      } catch (e) {
        console.warn("Fallback de created_by falhou (não crítico):", e);
      }
    }
  }

  // Sincronizar financeiro
  try {
    let subtotal = 0;
    for (const item of input.items) {
      subtotal += Number(item.quantity) * Number(item.unit_price);
    }
    const total = Math.max(subtotal - (input.discount || 0), 0);

    if (input.status !== 'aberta') {
      const hasMultiPayments = !!(input.payments && input.payments.length > 0);

      if (hasMultiPayments) {
        // Salva os pagamentos e gera 1 payable por parcela
        await saveSalePayments(input.companyId, saleId, input.payments!);
        // Remove qualquer payable que o RPC tenha criado, para evitar duplicidade
        await db.from("payables").delete().eq("sale_id", saleId);
        for (const p of input.payments!) {
          await createPayablesForPayment({
            companyId: input.companyId,
            saleId,
            customerId: cleanCustomerId,
            payment: p,
            createdBy: realCreatorId,
            notes: input.notes ?? null,
          });
        }
        // Fluxo de caixa: uma transação por forma de pagamento à vista (inclui cartão de crédito)
        if (realCreatorId) {
          await syncSaleMultiPaymentCashTransactions({
            companyId: input.companyId,
            saleId,
            userId: realCreatorId,
            payments: input.payments!,
            description: `Venda #${saleId.slice(0, 8)}`,
          });
        }
      } else {
        // Caminho legado (uma forma de pagamento)
        const isPaid = !input.dueDate;
        const { data: existing } = await db.from("payables").select("id").eq("sale_id", saleId).maybeSingle();
        if (!existing && total > 0) {
          const { error: payableError } = await db.from("payables").insert({
            company_id: input.companyId,
            direction: "receber",
            partner_id: cleanCustomerId,
            sale_id: saleId,
            description: `Venda #${saleId.slice(0, 8)}`,
            amount: total,
            due_date: input.dueDate || new Date().toISOString().slice(0, 10),
            status: isPaid ? "pago" : "aberto",
            paid_at: isPaid ? new Date().toISOString().slice(0, 10) : null,
            payment_method: legacyPaymentMethod,
            notes: input.notes,
            created_by: realCreatorId
          });
          if (payableError) console.error("Erro ao inserir payable:", payableError);
        }
        if (isPaid && realCreatorId && total > 0) {
          await syncSaleCashTransaction({
            companyId: input.companyId,
            saleId,
            amount: total,
            paymentMethod: legacyPaymentMethod,
            userId: realCreatorId,
            description: `Venda #${saleId.slice(0, 8)}`
          });
        }
        // Também grava 1 sale_payment legado para histórico
        await saveSalePayments(input.companyId, saleId, [{
          method: legacyPaymentMethod,
          amount: total,
          installments: 1,
          first_due_date: input.dueDate ?? null,
        }]);
      }
    } else if (input.payments && input.payments.length > 0) {
      // Venda em aberto: só salva o snapshot de pagamentos, sem gerar payables
      await saveSalePayments(input.companyId, saleId, input.payments);
    }
  } catch (err) {
    console.error("Erro ao sincronizar financeiro para a venda:", err);
  }

  return saleId;
}

export async function fetchSalesPaginated(params: {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  cashRegisterId?: string;
}) {
  if (params.status === "aberta") {
    return { data: [], count: 0 };
  }

  let query = db
    .from("sales")
    .select("*", { count: "exact" })
    .eq("company_id", params.companyId);

  if (params.search) {
    const q = params.search.trim();
    // Busca básica por notas ou número se for numérico
    if (!isNaN(Number(q))) {
      query = query.or(`notes.ilike.%${q}%,number.eq.${q}`);
    } else {
      query = query.ilike("notes", `%${q}%`);
    }
  }

  query = query.neq("status", "aberta");

  if (params.status && params.status !== "all" && params.status !== "todas") {
    query = query.eq("status", params.status);
  }

  if (params.cashRegisterId) {
    const { data: register, error: registerError } = await db
      .from("cash_registers")
      .select("user_id_open, opened_at, closed_at")
      .eq("id", params.cashRegisterId)
      .eq("company_id", params.companyId)
      .maybeSingle();

    if (registerError) throw registerError;
    if (!register?.user_id_open || !register?.opened_at) {
      return { data: [], count: 0 };
    }

    query = query
      .or(`created_by.eq.${register.user_id_open},origin.eq.delivery`)
      .gte("created_at", register.opened_at)
      .lte("created_at", register.closed_at || new Date().toISOString());
  } else if (params.dateFrom) {
    query = query.gte("created_at", params.dateFrom);
  }

  if (!params.cashRegisterId && params.dateTo) {
    const toDate = params.dateTo.includes('T') ? params.dateTo : `${params.dateTo}T23:59:59`;
    query = query.lte("created_at", toDate);
  }

  if (params.userId) {
    // Inclui vendas de delivery no histórico de qualquer operador
    query = query.or(`created_by.eq.${params.userId},origin.eq.delivery`);
  }


  const from = params.page * params.pageSize;
  const to = from + params.pageSize - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  const sales = data ?? [];
  const userIds = Array.from(new Set(sales.map((s: any) => s.created_by).filter(Boolean)));
  let mapped = sales;
  
  if (userIds.length > 0) {
    const { data: profs } = await db.from("profiles").select("id, name").in("id", userIds as string[]);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    mapped = sales.map((s: any) => ({ ...s, profiles: s.created_by ? map.get(s.created_by) ?? null : null }));
  } else {
    mapped = sales.map((s: any) => ({ ...s, profiles: null }));
  }

  return {
    data: mapped,
    count: count ?? 0
  };
}

export async function fetchSales(
  companyId: string,
  limit = 100,
  opts?: { from?: string; to?: string },
): Promise<any[]> {
  let q = db
    .from("sales")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts?.from) q = q.gte("created_at", `${opts.from}T00:00:00`);
  if (opts?.to) q = q.lte("created_at", `${opts.to}T23:59:59.999`);
  const { data, error } = await q;
  if (error) throw error;
  const sales = data ?? [];
  const userIds = Array.from(new Set(sales.map((s: any) => s.created_by).filter(Boolean)));
  if (userIds.length > 0) {
    const { data: profs } = await db.from("profiles").select("id, name").in("id", userIds as string[]);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return sales.map((s: any) => ({ ...s, profiles: s.created_by ? map.get(s.created_by) ?? null : null }));
  }
  return sales.map((s: any) => ({ ...s, profiles: null }));
}

export async function fetchSaleItems(saleId: string): Promise<SaleItem[]> {
  const { data, error } = await db.from("sale_items").select("*").eq("sale_id", saleId);
  if (error) throw error;
  return (data ?? []) as SaleItem[];
}

export async function fetchSaleItemsWithProduct(companyId: string): Promise<any[]> {
  const { data, error } = await db
    .from("sale_items")
    .select("*, products(name, cost_price, sku)")
    .eq("company_id", companyId);
  if (error) throw error;
  return data ?? [];
}

export async function updateSaleItems(
  saleId: string,
  companyId: string,
  items: SaleItemInput[],
  discount: number = 0,
  reason?: string
): Promise<void> {
  // Bloqueia edição de venda com NFC-e ativa (autorizada/processando)
  const { data: activeNote } = await db
    .from("fiscal_notes")
    .select("status")
    .eq("sale_id", saleId)
    .in("status", ["autorizada", "processando"])
    .maybeSingle();
  if (activeNote) {
    throw new Error(
      `Venda possui NFC-e ${activeNote.status}. Cancele a nota fiscal antes de editar a venda.`,
    );
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Manual update of sale items
  // 1. Get old items to restore stock
  const { data: oldItems } = await db.from("sale_items").select("*").eq("sale_id", saleId);
  
  if (oldItems) {
    for (const item of oldItems) {
      await db.from("stock_movements").insert({
        company_id: companyId,
        product_id: item.product_id,
        type: "entrada",
        quantity: item.quantity,
        reason: reason || `Ajuste de venda (estorno itens antigos) #${saleId}`,
        created_by: user?.id
      });
    }
  }

  // 2. Delete old items
  await db.from("sale_items").delete().eq("sale_id", saleId);

  // 3. Calculate new totals
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.quantity * item.unit_price;
  }
  const total = Math.max(subtotal - discount, 0);

  // 4. Update sale — sempre recalcula o total a partir dos itens novos
  const updatePayload: any = {
    subtotal,
    discount,
    total,
    notes: reason ? `Edição: ${reason}` : null,
  };

  await db.from("sales").update(updatePayload).eq("id", saleId);

  // Sincronizar financeiro (fluxo de caixa) — APENAS para vendas já concluídas.
  // Vendas em aberto/canceladas não devem gerar movimentação de caixa.
  let saleObj: any = null;
  try {
    const { data: sale } = await db.from("sales").select("*").eq("id", saleId).single();
    saleObj = sale;
    if (sale && sale.status === "concluida" && !sale.due_date && sale.created_by) {
      await syncSaleCashTransaction({
        companyId,
        saleId,
        amount: total,
        paymentMethod: sale.payment_method || "dinheiro",
        userId: sale.created_by,
        description: `Venda (editada) #${saleId.slice(0, 8)}`
      });
    } else if (sale && sale.status !== "concluida") {
      // Garante que não permaneçam transações órfãs de uma venda não finalizada
      await db.from("cash_transactions").delete().eq("reference_id", saleId).eq("category", "SALE");
    }
  } catch (e) {
    console.warn("Erro ao sincronizar caixa na edição:", e);
  }

  // 5. Insert new items and update stock
  for (const item of items) {
    await db.from("sale_items").insert({
      sale_id: saleId,
      company_id: companyId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price
    });

    await db.from("stock_movements").insert({
      company_id: companyId,
      product_id: item.product_id,
      type: "saida",
      quantity: item.quantity,
      reason: reason || `Ajuste de venda (novos itens) #${saleId}`,
      created_by: user?.id
    });
  }

  // 6. Update cash transaction (only if finalized)
  if (saleObj && saleObj.status === "concluida") {
    await db.from("cash_transactions").update({
      amount: total
    }).eq("reference_id", saleId).eq("category", "SALE");
  }

  // 7. Update payables (only if finalized)
  if (saleObj && saleObj.status === "concluida") {
    await db.from("payables").update({
      amount: total
    }).eq("sale_id", saleId);
  }

  // Auditoria
  if (user) {
    await logActivity({
      companyId,
      userId: user.id,
      action: "UPDATE",
      entity: "sales",
      entityId: saleId,
      meta: { items, discount, reason }
    });
  }
}

export interface EditSaleFullPayload {
  items: { product_id: string; quantity: number; unit_price: number }[];
  discount: number;
  reason: string;
  customer_id: string | null;
  payment_method: string | null;
  due_date: string | null;
  notes: string | null;
}

export async function editSaleFull(saleId: string, payload: EditSaleFullPayload): Promise<string> {
  const { data, error } = await db.rpc("edit_sale", {
    _sale_id: saleId,
    _items: payload.items,
    _discount: payload.discount,
    _customer_id: payload.customer_id,
    _payment_method: payload.payment_method,
    _due_date: payload.due_date,
    _notes: payload.notes,
    _reason: payload.reason,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function reopenSale(saleId: string): Promise<string> {
  const { data, error } = await db.rpc("reopen_sale", { _sale: saleId });
  if (error) throw error;
  return data as string;
}

// Reabre uma venda concluída devolvendo-a ao carrinho (status 'aberta').
// Remove payables e sale_payments associados. Não mexe em estoque (já está deduzido).
export async function reopenSaleToCart(saleId: string, userId?: string): Promise<string> {
  const { data, error } = await (db as any).rpc("reopen_sale_to_cart", { _sale: saleId });
  if (error) throw error;
  await db.from("cash_transactions").delete().eq("reference_id", saleId).eq("category", "SALE");
  await db.from("payables").delete().eq("sale_id", saleId);
  await db.from("sale_payments").delete().eq("sale_id", saleId);
  if (userId) {
    await db.from("sales").update({ created_by: userId }).eq("id", saleId);
  }
  return data as string;
}

export async function cancelSale(
  saleId: string,
  reason?: string,
  opts?: { onlyIfStatus?: string },
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Obter detalhes da venda para o log
  const { data: sale } = await db.from("sales").select("*").eq("id", saleId).maybeSingle();

  // Trava de segurança: cancelamentos automáticos só podem atingir vendas
  // que continuam no status esperado (ex.: "aberta").
  if (opts?.onlyIfStatus && sale && (sale as any).status !== opts.onlyIfStatus) {
    return saleId;
  }

  // Use RPC if available, otherwise manual
  const { data, error } = await db.rpc("cancel_sale", { _sale: saleId } as any);


  // Update notes even if RPC succeeded
  if (!error && reason) {
    await db.from("sales").update({ notes: `Cancelamento: ${reason}${user?.id ? ` (por ${user.id})` : ""}` }).eq("id", saleId);
  }

  // Remove transações de caixa vinculadas à venda cancelada (RPC cancel_sale não faz isso)
  if (!error) {
    await db.from("cash_transactions").delete().eq("reference_id", saleId);
  }

  if (!error && user?.id && sale) {
    await logActivity({
      companyId: sale.company_id,
      userId: user.id,
      action: "CANCEL",
      entity: "sales",
      entityId: saleId,
      meta: { reason, sale_number: sale.number }
    });
  }

  if (error) {
    console.error("RPC cancel_sale error, trying manual:", error);
    // Manual fallback
    const { data: sale } = await db.from("sales").select("*").eq("id", saleId).single();
    if (!sale) throw new Error("Venda não encontrada");
    
    // 1. Alterar status e adicionar motivo nas notas
    const { error: updateError } = await db.from("sales").update({ 
      status: 'cancelada',
      notes: reason ? `Cancelamento: ${reason}` : (sale.notes || null)
    }).eq("id", saleId);
    if (updateError) throw updateError;

    // 2. Restaurar estoque
    const { data: items } = await db.from("sale_items").select("*").eq("sale_id", saleId);
    if (items) {
      for (const item of items) {
        await db.from("stock_movements").insert({
          company_id: item.company_id,
          product_id: item.product_id,
          type: "entrada",
          quantity: item.quantity,
          reason: reason || `Estorno de venda cancelada (${saleId})`,
          created_by: user?.id
        });
      }
    }

    // 3. Deletar transações de caixa (Sempre remove se a venda for cancelada)
    await db.from("cash_transactions").delete().eq("reference_id", saleId);

    // 4. Deletar payables (Sempre remove se a venda for cancelada)
    await db.from("payables").delete().eq("sale_id", saleId);
  }

  // Auditoria
  if (user) {
    const { data: sale } = await db.from("sales").select("company_id").eq("id", saleId).maybeSingle();
    await logActivity({
      companyId: sale?.company_id || "",
      userId: user.id,
      action: "cancelamento_venda",
      entity: "sales",
      entityId: saleId,
      meta: { reason }
    });
  }

  return saleId;
}

// Apenas super admin: exclui a venda permanentemente, restaurando estoque e financeiro.
// A regra é validada no banco (RPC delete_sale + RLS sales_delete_super_admin).
export async function deleteSale(saleId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: sale } = await db.from("sales").select("company_id").eq("id", saleId).maybeSingle();

  const { error } = await db.rpc("delete_sale", { _sale_id: saleId });
  if (error) throw error;

  // Auditoria
  if (user) {
    await logActivity({
      companyId: sale?.company_id || "",
      userId: user.id,
      action: "DELETE",
      entity: "sales",
      entityId: saleId,
      meta: { deleted: true }
    });
  }
}







export async function finalizeOpenSale(
  saleId: string,
  paymentMethod?: string,
  expectedTotal?: number,
  payments?: SalePaymentInput[]
): Promise<string> {
  const dominant = (payments && payments.length > 0)
    ? [...payments].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
    : null;
  const legacyMethod = dominant?.method ?? paymentMethod ?? null;

  // 1. Finaliza o status da venda
  if (typeof expectedTotal === "number") {
    const { error: rpcErr } = await (db as any).rpc("finalize_sale_validated", {
      _sale_id: saleId,
      _payment_method: legacyMethod,
      _expected_total: expectedTotal,
    });
    if (rpcErr) throw new Error(rpcErr.message || "Falha ao validar totais da venda");
  } else {
    const { data: sale } = await db.from("sales").select("*").eq("id", saleId).single();
    if (!sale) throw new Error("Venda não encontrada");
    const { error } = await db.from("sales").update({
      status: 'concluida',
      payment_method: legacyMethod || sale.payment_method
    }).eq("id", saleId);
    if (error) throw error;
  }

  // 2. Busca dados atualizados
  const { data: sale } = await db.from("sales").select("*").eq("id", saleId).single();
  if (!sale) return saleId;

  const finalTotal = typeof expectedTotal === "number" ? expectedTotal : Number(sale.total);
  if (Number(sale.total) === 0 && finalTotal > 0) {
    await db.from("sales").update({ total: finalTotal }).eq("id", saleId);
  }

  // 3a. Caminho multi-pagamento
  if (payments && payments.length > 0) {
    await saveSalePayments(sale.company_id, saleId, payments);
    await db.from("payables").delete().eq("sale_id", saleId);
    for (const p of payments) {
      await createPayablesForPayment({
        companyId: sale.company_id,
        saleId,
        customerId: sale.customer_id,
        payment: p,
        createdBy: sale.created_by,
        notes: sale.notes ?? null,
      });
    }
    if (sale.created_by) {
      await syncSaleMultiPaymentCashTransactions({
        companyId: sale.company_id,
        saleId,
        userId: sale.created_by,
        payments,
        description: `Venda (finalizada) #${saleId.slice(0, 8)}`,
      });
    }
    return saleId;
  }

  // 3b. Caminho legado (uma única forma de pagamento)
  if (!sale.due_date && sale.created_by) {
    await syncSaleCashTransaction({
      companyId: sale.company_id,
      saleId: saleId,
      amount: finalTotal,
      paymentMethod: legacyMethod || sale.payment_method || "dinheiro",
      userId: sale.created_by,
      description: `Venda (finalizada) #${saleId.slice(0, 8)}`
    });
    await db.from("payables").update({
      status: "pago",
      paid_at: new Date().toISOString().slice(0, 10),
      amount: finalTotal,
      payment_method: legacyMethod || sale.payment_method || "dinheiro"
    }).eq("sale_id", saleId);
  } else if (sale.due_date) {
    const { data: existing } = await db.from("payables").select("id").eq("sale_id", saleId).maybeSingle();
    if (!existing) {
      await db.from("payables").insert({
        company_id: sale.company_id,
        direction: "receber",
        partner_id: sale.customer_id,
        sale_id: saleId,
        description: `Venda #${saleId.slice(0, 8)}`,
        amount: finalTotal,
        due_date: sale.due_date,
        status: "aberto",
        payment_method: legacyMethod || sale.payment_method || "dinheiro",
        created_by: sale.created_by
      });
    }
  }

  return saleId;
}

// ---------- Payables ----------
export async function fetchPayables(
  companyId: string,
  filters?: { direction?: PayableDirection; status?: PayableStatus }
): Promise<Payable[]> {
  let q = db.from("payables").select("*").eq("company_id", companyId).order("due_date", { ascending: false }).order("created_at", { ascending: false });
  if (filters?.direction) q = q.eq("direction", filters.direction);
  if (filters?.status) q = q.eq("status", filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Payable[];
}

export async function upsertPayable(
  companyId: string,
  patch: Partial<Payable> & { id?: string; description: string; amount: number; due_date: string; direction: PayableDirection; userId?: string }
): Promise<Payable> {
  const payload = {
    company_id: companyId,
    direction: patch.direction,
    partner_id: patch.partner_id ?? null,
    description: patch.description,
    amount: patch.amount,
    due_date: patch.due_date,
    status: patch.status ?? "aberto",
    payment_method: patch.payment_method ?? null,
    notes: patch.notes ?? null,
    created_by: patch.userId,
  };
  if (patch.id) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { created_by, ...updatePayload } = payload;
    const { data, error } = await db.from("payables").update(updatePayload).eq("id", patch.id).select("*").single();
    if (error) throw error;
    return data as Payable;
  }
  const { data, error } = await db.from("payables").insert(payload).select("*").single();
  if (error) throw error;
  return data as Payable;
}

export async function markPayablePaid(id: string, companyId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const { data: payable, error: fetchErr } = await db
    .from("payables")
    .select("*")
    .eq("id", id)
    .single();
  
  if (fetchErr) throw fetchErr;

  const { error } = await db
    .from("payables")
    .update({ status: "pago", paid_at: new Date().toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) throw error;

  // Sincronização automática com o Fluxo de Caixa
  if (userId && companyId) {
    try {
      const currentRegister = await fetchCurrentOpenRegister(companyId, userId);
      if (currentRegister) {
        const pmName = (payable.payment_method || "dinheiro").toLowerCase();
        const paymentMethodMapped: any = 
          pmName.includes("pix") ? "PIX" : 
          pmName.includes("crédito") ? "CREDIT_CARD" : 
          pmName.includes("débito") ? "DEBIT_CARD" : 
          pmName.includes("cartão") ? "CREDIT_CARD" : 
          pmName.includes("boleto") ? "BOLETO" : "CASH";

        await addCashTransaction({
          companyId: companyId,
          cashRegisterId: currentRegister.id,
          type: payable.direction === "receber" ? "IN" : "OUT",
          category: "PAYMENT_RECEIVED",
          amount: Number(payable.amount),
          paymentMethod: paymentMethodMapped,
          description: `Pagamento de ${payable.description}`,
          referenceId: payable.sale_id || payable.id,
          userId: userId
        });
      }
    } catch (err) {
      console.error("Erro ao sincronizar fluxo de caixa no pagamento:", err);
    }
  }
}

export async function deletePayable(id: string) {
  const { error } = await db.from("payables").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Memberships (Equipe) ----------
export interface MembershipWithProfile extends Membership {
  profile: { name: string; email: string; avatar_url: string | null } | null;
}

export async function fetchSuperAdminIds(): Promise<string[]> {
  const { data, error } = await db.rpc("list_super_admin_ids");
  if (error) return [];
  return ((data ?? []) as string[]).filter(Boolean);
}

export async function fetchTeam(companyId: string): Promise<MembershipWithProfile[]> {
  const { data: members, error } = await db
    .from("memberships")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_blocked", false);
  if (error) throw error;
  const list = (members ?? []) as Membership[];
  if (list.length === 0) return [];
  const ids = list.map((m) => m.user_id);
  const { data: profs } = await db.from("profiles").select("id, name, email, avatar_url").in("id", ids);
  const map = new Map<string, { name: string; email: string; avatar_url: string | null }>();
  for (const p of (profs ?? []) as Array<{ id: string; name: string; email: string; avatar_url: string | null }>) {
    map.set(p.id, { name: p.name, email: p.email, avatar_url: p.avatar_url });
  }
  return list.map((m) => ({ ...m, profile: map.get(m.user_id) ?? null }));
}

export async function updateMembershipRole(id: string, role: Role) {
  // Busca o membership para saber a empresa
  const { data: m, error: mErr } = await db
    .from("memberships")
    .select("company_id")
    .eq("id", id)
    .single();
  if (mErr) throw mErr;

  // Mapeia role legado -> nome do perfil padrão da empresa
  const nameByRole: Record<Role, string> = {
    admin: "Administrador",
    gerente: "Gerente",
    vendedor: "Vendedor",
    estoquista: "Estoquista",
  };
  const targetName = nameByRole[role];

  let customRoleId: string | null = null;
  if (targetName) {
    const { data: r } = await db
      .from("company_roles")
      .select("id")
      .eq("company_id", m.company_id)
      .eq("name", targetName)
      .maybeSingle();
    customRoleId = r?.id ?? null;
  }

  const { error } = await db
    .from("memberships")
    .update({ role, custom_role_id: customRoleId })
    .eq("id", id);
  if (error) throw error;
}

export async function updateMembershipCustomRole(id: string, customRoleId: string | null) {
  const { error } = await db.from("memberships").update({ custom_role_id: customRoleId }).eq("id", id);
  if (error) throw error;
}

export async function removeMembership(id: string) {
  const { error } = await db.from("memberships").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Custom Roles & Permissions ----------
import type { CompanyRole, CompanyRoleWithPermissions, RolePermission, PermissionAction } from "./db-types";

export async function fetchCompanyRoles(companyId: string): Promise<CompanyRoleWithPermissions[]> {
  const { data: roles, error } = await db
    .from("company_roles")
    .select("*")
    .eq("company_id", companyId)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw error;
  const list = (roles ?? []) as CompanyRole[];
  if (list.length === 0) return [];
  const ids = list.map((r) => r.id);
  const { data: perms, error: pErr } = await db
    .from("role_permissions")
    .select("*")
    .in("role_id", ids);
  if (pErr) throw pErr;
  const map = new Map<string, RolePermission[]>();
  for (const p of (perms ?? []) as RolePermission[]) {
    const arr = map.get(p.role_id) ?? [];
    arr.push(p);
    map.set(p.role_id, arr);
  }
  return list.map((r) => ({ ...r, permissions: map.get(r.id) ?? [] }));
}

export async function createCompanyRole(input: {
  company_id: string;
  name: string;
  description?: string;
}): Promise<CompanyRole> {
  const { data, error } = await db
    .from("company_roles")
    .insert({
      company_id: input.company_id,
      name: input.name,
      description: input.description ?? null,
      is_system: false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as CompanyRole;
}

export async function updateCompanyRole(id: string, patch: { name?: string; description?: string | null }) {
  const { error } = await db.from("company_roles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function countMembersByRole(roleId: string): Promise<number> {
  const { count, error } = await db
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("custom_role_id", roleId);
  if (error) throw error;
  return count ?? 0;
}

export async function countMembersByRoles(roleIds: string[]): Promise<Record<string, number>> {
  if (!roleIds.length) return {};
  const { data, error } = await db
    .from("memberships")
    .select("custom_role_id")
    .in("custom_role_id", roleIds);
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const id of roleIds) out[id] = 0;
  for (const row of (data ?? []) as Array<{ custom_role_id: string | null }>) {
    if (row.custom_role_id) out[row.custom_role_id] = (out[row.custom_role_id] ?? 0) + 1;
  }
  return out;
}

export async function deleteCompanyRole(id: string) {
  const used = await countMembersByRole(id);
  if (used > 0) {
    throw new Error(`Não é possível excluir: ${used} usuário(s) ainda usam este perfil.`);
  }
  const { error } = await db.from("company_roles").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertRolePermission(input: {
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}): Promise<RolePermission> {
  const { data, error } = await db
    .from("role_permissions")
    .upsert(input, { onConflict: "role_id,module" })
    .select("*")
    .single();
  if (error) throw error;
  return data as RolePermission;
}

export async function upsertRolePermissionsBatch(inputs: Array<{
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}>): Promise<void> {
  if (!inputs.length) return;
  const { error } = await db
    .from("role_permissions")
    .upsert(inputs, { onConflict: "role_id,module" });
  if (error) throw error;
}

export async function hasPermission(companyId: string, module: string, action: PermissionAction): Promise<boolean> {
  const { data, error } = await db.rpc("has_permission", {
    _company: companyId,
    _module: module,
    _action: action,
  });
  if (error) return false;
  return !!data;
}

// ---------- Delivery ----------
export async function fetchDrivers(companyId: string): Promise<Driver[]> {
  const { data, error } = await db.from("drivers").select("*").eq("company_id", companyId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function upsertDriver(companyId: string, patch: Partial<Driver> & { id?: string; name: string }) {
  const payload = {
    company_id: companyId,
    name: patch.name,
    phone: patch.phone ?? null,
    vehicle: patch.vehicle ?? null,
    active: patch.active ?? true,
  };
  if (patch.id) {
    const { data, error } = await db.from("drivers").update(payload).eq("id", patch.id).select("*").single();
    if (error) throw error;
    return data as Driver;
  }
  const { data, error } = await db.from("drivers").insert(payload).select("*").single();
  if (error) throw error;
  return data as Driver;
}

export async function deleteDriver(id: string) {
  const { error } = await db.from("drivers").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchDeliveryOrders(companyId: string): Promise<DeliveryOrder[]> {
  const { data, error } = await db
    .from("delivery_orders")
    .select("*, sales(sale_items(*))")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  
  return (data ?? []).map((o: any) => ({
    ...o,
    items: o.sales?.sale_items || []
  }));
}

export async function upsertDeliveryOrder(companyId: string, patch: Partial<DeliveryOrder> & { id?: string; customer_name: string; address: string }) {
  const payload = {
    company_id: companyId,
    sale_id: patch.sale_id ?? null,
    sale_number: patch.sale_number ?? null,
    customer_id: patch.customer_id ?? null,
    customer_name: patch.customer_name,
    address: patch.address,
    total: patch.total ?? 0,
    driver_id: patch.driver_id ?? null,
    status: patch.status ?? "preparo",
    notes: patch.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  let saved: DeliveryOrder;
  if (patch.id) {
    const { data, error } = await db.from("delivery_orders").update(payload).eq("id", patch.id).select("*").single();
    if (error) throw error;
    saved = data as DeliveryOrder;
  } else {
    const { data, error } = await db.from("delivery_orders").insert(payload).select("*").single();
    if (error) throw error;
    saved = data as DeliveryOrder;
  }

  // Sincroniza dados do cliente a cada pedido de delivery:
  // - Atualiza endereço principal no cadastro do parceiro
  // - Garante o endereço em partner_addresses (cria se novo)
  if (saved.customer_id && saved.address && saved.address !== "Retirada no Local") {
    try {
      await db
        .from("partners")
        .update({ address: saved.address, updated_at: new Date().toISOString() })
        .eq("id", saved.customer_id)
        .eq("company_id", companyId);

      const { data: existing } = await db
        .from("partner_addresses")
        .select("id")
        .eq("partner_id", saved.customer_id)
        .eq("company_id", companyId)
        .ilike("address", saved.address)
        .limit(1);

      if (!existing || existing.length === 0) {
        await db.from("partner_addresses").insert({
          company_id: companyId,
          partner_id: saved.customer_id,
          address: saved.address,
          is_default: false,
        });
      }
    } catch (e) {
      console.warn("[delivery] falha ao sincronizar dados do cliente", e);
    }
  }

  return saved;

}

export async function deleteDeliveryOrder(id: string) {
  const { error } = await db.from("delivery_orders").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Bank Transactions ----------
export async function fetchBankTransactions(companyId: string): Promise<BankTransaction[]> {
  const { data, error } = await db.from("bank_transactions").select("*").eq("company_id", companyId).order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function importBankTransactions(companyId: string, transactions: Omit<BankTransaction, "id" | "company_id" | "reconciled" | "imported_at">[]) {
  const payload = transactions.map(t => ({
    ...t,
    company_id: companyId,
  }));
  const { data, error } = await db.from("bank_transactions").insert(payload).select("*");
  if (error) throw error;
  return data as BankTransaction[];
}

export async function updateBankTransaction(id: string, patch: Partial<BankTransaction>) {
  const { data, error } = await db.from("bank_transactions").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as BankTransaction;
}

export async function deleteBankTransaction(id: string) {
  const { error } = await db.from("bank_transactions").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Fiscal ----------
export async function fetchFiscalSettings(companyId: string): Promise<FiscalSettings | null> {
  const { data, error } = await db.from("fiscal_settings").select("*").eq("company_id", companyId).maybeSingle();
  if (error) throw error;
  return data as FiscalSettings | null;
}

export async function upsertFiscalSettings(companyId: string, patch: Partial<FiscalSettings>) {
  const payload = { ...patch, company_id: companyId, updated_at: new Date().toISOString() };
  const { data, error } = await db.from("fiscal_settings").upsert(payload).select("*").single();
  if (error) throw error;
  return data as FiscalSettings;
}

export async function fetchFiscalNotes(companyId: string): Promise<FiscalNote[]> {
  const { data, error } = await db.from("fiscal_notes").select("*").eq("company_id", companyId).order("emitted_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createFiscalNote(companyId: string, note: Omit<FiscalNote, "id" | "company_id" | "emitted_at">) {
  const { data, error } = await db.from("fiscal_notes").insert({ ...note, company_id: companyId }).select("*").single();
  if (error) throw error;
  return data as FiscalNote;
}

export async function updateFiscalNoteStatus(id: string, status: NfStatus) {
  const { error } = await db.from("fiscal_notes").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteFiscalNote(id: string) {
  const { error } = await db.from("fiscal_notes").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Payment Methods ----------
export async function fetchPaymentMethods(companyId: string): Promise<PaymentMethod[]> {
  const { data, error } = await db
    .from("payment_methods")
    .select("*")
    .eq("company_id", companyId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as PaymentMethod[];
}

export async function paymentMethodHasSales(methodId: string, companyId: string): Promise<boolean> {
  const { data: pm } = await db
    .from("payment_methods")
    .select("name")
    .eq("id", methodId)
    .maybeSingle();
  const { count: byId } = await db
    .from("sale_payments")
    .select("id", { count: "exact", head: true })
    .eq("payment_method_id", methodId);
  if ((byId ?? 0) > 0) return true;
  if (pm?.name) {
    const { count: byName } = await db
      .from("sale_payments")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("method", pm.name);
    if ((byName ?? 0) > 0) return true;
  }
  return false;
}

export async function fetchPaymentMethodsUsage(companyId: string): Promise<Record<string, boolean>> {
  const { data: methods } = await db
    .from("payment_methods")
    .select("id,name")
    .eq("company_id", companyId);
  if (!methods?.length) return {};
  const { data: pays } = await db
    .from("sale_payments")
    .select("payment_method_id,method")
    .eq("company_id", companyId);
  const usedIds = new Set<string>();
  const usedNames = new Set<string>();
  for (const p of pays ?? []) {
    if (p.payment_method_id) usedIds.add(p.payment_method_id);
    if (p.method) usedNames.add(p.method);
  }
  const result: Record<string, boolean> = {};
  for (const m of methods) {
    result[m.id] = usedIds.has(m.id) || usedNames.has(m.name);
  }
  return result;
}

export async function upsertPaymentMethod(
  companyId: string,
  patch: Partial<PaymentMethod> & { id?: string; name: string }
): Promise<PaymentMethod> {
  const payload: any = {
    company_id: companyId,
    name: patch.name,
    requires_due_date: patch.requires_due_date ?? false,
    active: patch.active ?? true,
    auto_issue_nfce: patch.auto_issue_nfce ?? false,
  };
  if (patch.id) {
    const used = await paymentMethodHasSales(patch.id, companyId);
    if (used) {
      const superAdmin = await isSuperAdmin();
      if (!superAdmin) {
        throw new Error(
          "Esta forma de pagamento já foi usada em vendas e só pode ser alterada por um super administrador."
        );
      }
    }
    const { data, error } = await db.from("payment_methods").update(payload).eq("id", patch.id).select("*").single();
    if (error) throw error;
    return data as PaymentMethod;
  }
  const { data, error } = await db.from("payment_methods").insert(payload).select("*").single();
  if (error) throw error;
  return data as PaymentMethod;
}

export async function deletePaymentMethod(id: string, companyId?: string) {
  if (companyId) {
    const used = await paymentMethodHasSales(id, companyId);
    if (used) {
      const superAdmin = await isSuperAdmin();
      if (!superAdmin) {
        throw new Error(
          "Esta forma de pagamento já foi usada em vendas e só pode ser excluída por um super administrador."
        );
      }
    }
  }
  const { error } = await db.from("payment_methods").delete().eq("id", id);
  if (error) throw error;
}


// ---------- Cash Management ----------
export async function fetchCurrentOpenRegister(companyId: string, userId: string) {
  const { data, error } = await db
    .from("cash_registers")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id_open", userId)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function addCashTransaction(input: {
  companyId: string;
  cashRegisterId: string;
  type: "IN" | "OUT";
  category: "SALE" | "EXPENSE" | "WITHDRAWAL" | "PAYMENT_RECEIVED" | "ADJUSTMENT";
  amount: number;
  paymentMethod: "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO";
  description?: string;
  referenceId?: string;
  userId: string;
}) {
  const { error } = await db.from("cash_transactions").insert({
    company_id: input.companyId,
    cash_register_id: input.cashRegisterId,
    type: input.type,
    category: input.category,
    amount: input.amount,
    payment_method: input.paymentMethod,
    description: input.description || null,
    reference_id: input.referenceId || null,
    user_id: input.userId,
  });

  if (error) throw error;
}

/**
 * Sincroniza uma transação de caixa vinculada a uma venda.
 * Se já existir, atualiza. Se não, cria.
 */
export async function syncSaleCashTransaction(input: {
  companyId: string;
  saleId: string;
  amount: number;
  paymentMethod: string;
  userId: string;
  description: string;
}) {
  const currentRegister = await fetchCurrentOpenRegister(input.companyId, input.userId);
  if (!currentRegister) {
    console.warn("Nenhum caixa aberto para este usuário. A transação de caixa não será criada.");
    return;
  }

  const pmName = (input.paymentMethod || "dinheiro").toLowerCase();
  const paymentMethodMapped: any = 
    pmName.includes("pix") ? "PIX" : 
    (pmName.includes("crédito") || pmName.includes("credito") || (pmName.includes("cartão") || pmName.includes("catão")) && !pmName.includes("débito") && !pmName.includes("debito")) ? "CREDIT_CARD" : 
    (pmName.includes("débito") || pmName.includes("debito") || (pmName.includes("cartão") || pmName.includes("catão")) && !pmName.includes("crédito") && !pmName.includes("credito")) ? "DEBIT_CARD" : 
    pmName.includes("boleto") ? "BOLETO" : "CASH";

  // Verifica se já existe uma transação para esta venda neste caixa
  const { data: existing } = await db
    .from("cash_transactions")
    .select("id")
    .eq("cash_register_id", currentRegister.id)
    .eq("reference_id", input.saleId)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from("cash_transactions")
      .update({
        amount: input.amount,
        payment_method: paymentMethodMapped,
        description: input.description,
        user_id: input.userId
      })
      .eq("id", existing.id);
    if (error) console.error("Erro ao atualizar transação de caixa:", error);
  } else {
    await addCashTransaction({
      companyId: input.companyId,
      cashRegisterId: currentRegister.id,
      type: "IN",
      category: "SALE",
      amount: input.amount,
      paymentMethod: paymentMethodMapped,
      description: input.description,
      referenceId: input.saleId,
      userId: input.userId
    });
  }
}

function mapPaymentMethodToCash(method: string): "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "BOLETO" {
  const pmName = (method || "dinheiro").toLowerCase();
  if (pmName.includes("pix")) return "PIX";
  if (pmName.includes("boleto")) return "BOLETO";
  const hasCard = pmName.includes("cartão") || pmName.includes("catão") || pmName.includes("cartao");
  if (pmName.includes("débito") || pmName.includes("debito")) return "DEBIT_CARD";
  if (pmName.includes("crédito") || pmName.includes("credito")) return "CREDIT_CARD";
  if (hasCard) return "CREDIT_CARD";
  return "CASH";
}

/**
 * Sincroniza N transações de caixa (uma por forma de pagamento à vista)
 * para uma venda multi-pagamento. Remove transações antigas SALE da venda
 * e insere uma por pagamento sem vencimento (à vista), incluindo cartões.
 */
export async function syncSaleMultiPaymentCashTransactions(input: {
  companyId: string;
  saleId: string;
  userId: string;
  payments: SalePaymentInput[];
  description: string;
}) {
  const currentRegister = await fetchCurrentOpenRegister(input.companyId, input.userId);
  if (!currentRegister) {
    console.warn("Nenhum caixa aberto para este usuário. As transações de caixa não serão criadas.");
    return;
  }

  // Remove transações SALE prévias desta venda (em qualquer caixa)
  await db
    .from("cash_transactions")
    .delete()
    .eq("reference_id", input.saleId)
    .eq("category", "SALE");

  const cashPayments = input.payments.filter((p) => !p.first_due_date && Number(p.amount) > 0);
  for (const p of cashPayments) {
    await addCashTransaction({
      companyId: input.companyId,
      cashRegisterId: currentRegister.id,
      type: "IN",
      category: "SALE",
      amount: Number(p.amount),
      paymentMethod: mapPaymentMethodToCash(p.method),
      description: `${input.description} - ${p.method}`,
      referenceId: input.saleId,
      userId: input.userId,
    });
  }
}

export async function fetchPartnerAddresses(companyId: string, partnerId: string): Promise<PartnerAddress[]> {
  const { data, error } = await db
    .from("partner_addresses")
    .select("*")
    .eq("company_id", companyId)
    .eq("partner_id", partnerId)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertPartnerAddress(companyId: string, address: Partial<PartnerAddress>) {
  const { data, error } = await db
    .from("partner_addresses")
    .upsert({ ...address, company_id: companyId, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePartnerAddress(id: string) {
  const { error } = await db.from("partner_addresses").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Quotations ----------
export async function fetchQuotations(companyId: string) {
  const { data, error } = await db
    .from("quotations")
    .select("*")
    .eq("company_id", companyId)
    .order("number", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createQuotation(quotation: any) {
  const { data, error } = await db
    .from("quotations")
    .insert(quotation)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuotation(id: string, quotation: any) {
  const { data, error } = await db
    .from("quotations")
    .update({ ...quotation, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuotation(id: string) {
  const { error } = await db.from("quotations").delete().eq("id", id);
  if (error) throw error;
}

// ---------- User Tasks / Agenda ----------
export async function fetchUserTasks(companyId: string, userId?: string | null, filters?: { status?: string, start?: string, end?: string }) {
  let query = db
    .from("user_tasks")
    .select("*")
    .eq("company_id", companyId);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.start) query = query.gte("due_at", filters.start);
  if (filters?.end) query = query.lte("due_at", filters.end);

  const { data, error } = await query.order("due_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as any[];
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  if (ids.length) {
    const { data: profs } = await db.from("profiles").select("id, name, email").in("id", ids);
    const map = new Map<string, any>((profs ?? []).map((p: any) => [p.id as string, p]));
    rows.forEach((r) => {
      const p = map.get(r.user_id);
      if (p) r.profile = { name: p.name, email: p.email };
    });
  }
  return rows as import("./db-types").UserTask[];
}

export async function createUserTask(task: Omit<import("./db-types").UserTask, "id" | "created_at" | "updated_at"> | Omit<import("./db-types").UserTask, "id" | "created_at" | "updated_at">[]) {
  const tasks = Array.isArray(task) ? task : [task];

  const { data, error } = await db
    .from("user_tasks")
    .insert(tasks)
    .select("*");

  if (error) {
    console.error("DB: createUserTask error:", error);
    throw error;
  }
  return data as import("./db-types").UserTask[];
}



export async function updateUserTask(id: string, task: Partial<import("./db-types").UserTask>) {
  console.log("DB: updateUserTask called for ID:", id, "data:", task);
  const { data, error } = await db
    .from("user_tasks")
    .update(task)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("DB: updateUserTask error:", error);
    throw error;
  }
  return data as import("./db-types").UserTask;
}

export async function deleteUserTask(id: string) {
  const { error } = await db.from("user_tasks").delete().eq("id", id);
  if (error) throw error;
}
