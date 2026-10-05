import { appwrite as db } from "@/integrations/appwrite/client";
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
  StockCount,
  StockCountItem,
  PartnerAddress,
  StockCountTeam,
  StockCountTeamLocation,
} from "./db-types";

const SELECT_WITH_PROFILE = "*, profiles(name)";

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
    meta: params.meta
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
    const { data: { user } } = await supabase.auth.getUser();
    finalUserId = user?.id;
  }
  if (!finalUserId) return [];

  const { data, error } = await db
    .from("memberships")
    .select("is_blocked, role, company:companies(*)")
    .eq("user_id", finalUserId);

  if (error) throw error;

  return (data ?? []).map((m: any) => ({
    ...m.company,
    is_blocked: m.is_blocked,
    role: m.role
  }));
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
  const { data, error } = await db.from("companies").select("*").eq("id", id).maybeSingle();
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
    .select("*")
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

export async function createCategory(companyId: string, name: string, description?: string, userId?: string) {
  const { data, error } = await db
    .from("categories")
    .insert({ company_id: companyId, name: name.toUpperCase().trim(), description: description || null, created_by: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data as Category;
}

export async function updateCategory(id: string, name: string, description?: string) {
  const { data, error } = await db
    .from("categories")
    .update({ name: name.toUpperCase().trim(), description: description || null })
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
}) {
  let query = db
    .from("products")
    .select("*, profiles!products_updated_by_fkey(name)", { count: "exact" })
    .eq("company_id", params.companyId);

  const normalizeSearchValue = (value: unknown) => String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/['’‘`´"”“]/g, "")
      .replace(/[.,;:!?\-_/\\()\[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const searchTerm = params.search?.trim() ?? "";
  const searchWords = normalizeSearchValue(searchTerm)
      .split(/\s+/)
      .filter(Boolean);

  let companyRefsForSearch: any[] = [];
  if (searchWords.length > 0) {
    const { data: refs } = await db
      .from("product_references")
      .select("product_id, manufacturer_code")
      .eq("company_id", params.companyId);
    companyRefsForSearch = refs ?? [];
  }

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

  if (searchWords.length > 0) {
    let allProducts: any[] = [];
    let searchFrom = 0;
    const searchStep = 1000;
    const orderedQuery = query
      .order(params.sortBy === "name" || !params.sortBy ? "name" : params.sortBy, { ascending: params.sortOrder !== 'desc' })
      .order("name", { ascending: true });

    // Tentar primeiro uma busca rápida direta no banco para termos exatos/prefixos (muito mais rápido)
    const exactSearchQuery = db
      .from("products")
      .select("*, profiles!products_updated_by_fkey(name)", { count: "exact" })
      .eq("company_id", params.companyId);

    // Se tivermos poucos termos, tentamos um ilike básico no nome ou sku
    if (searchWords.length === 1) {
      const term = `%${searchWords[0]}%`;
      exactSearchQuery.or(`name.ilike.${term},sku.ilike.${term},barcode.ilike.${term},alternative_code.ilike.${term}`);
      
      const from = params.page * params.pageSize;
      const to = from + params.pageSize - 1;
      
      const { data: quickBatch, count: quickCount, error: quickError } = await exactSearchQuery
        .order(params.sortBy === "name" || !params.sortBy ? "name" : params.sortBy, { ascending: params.sortOrder !== 'desc' })
        .order("name", { ascending: true })
        .range(from, to);

      if (!quickError && quickBatch && quickBatch.length > 0) {
        // Se encontramos resultados diretos, retornamos eles (busca rápida)
        // Isso cobre 90% dos casos de uso comuns
        const productIds = quickBatch.map((p: any) => p.id);
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

        const mapped = quickBatch.map((p: any) => ({
          ...p,
          last_editor_profile: p.profiles ? { name: p.profiles.name } : null,
          product_references: (refsByProduct[p.id] || []).map(code => ({ manufacturer_code: code })),
        })) as Product[];

        return {
          data: mapped,
          count: quickCount ?? quickBatch.length,
        };
      }
    }

    // Fallback para busca complexa (normalizada/multi-campos) se a busca rápida não retornar nada
    while (true) {
      const { data: batch, error: batchError } = await orderedQuery.range(searchFrom, searchFrom + searchStep - 1);
      if (batchError) throw batchError;
      if (!batch || batch.length === 0) break;
      allProducts = [...allProducts, ...batch];
      if (batch.length < searchStep) break;
      searchFrom += searchStep;
    }

    const refsByProduct: Record<string, string[]> = {};
    for (const r of companyRefsForSearch) {
      if (!refsByProduct[r.product_id]) refsByProduct[r.product_id] = [];
      refsByProduct[r.product_id].push(r.manufacturer_code);
    }

    const filteredProducts = allProducts.filter((p: any) => {
      const searchable = [
        p.name,
        p.sku,
        p.barcode,
        p.alternative_code,
        p.description,
        p.brand,
        ...(refsByProduct[p.id] || []),
      ].map(normalizeSearchValue).join(" ");
      return searchWords.every(word => searchable.includes(word));
    });

    const from = params.page * params.pageSize;
    const products = filteredProducts.slice(from, from + params.pageSize);
    const creatorIds = Array.from(new Set(products.map((p: any) => p.created_by).filter(Boolean)));
    let creatorMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: creators } = await db
        .from("profiles")
        .select("id, name")
        .in("id", creatorIds);
      creatorMap = Object.fromEntries((creators ?? []).map((c: any) => [c.id, c.name]));
    }

    const mapped = products.map((p: any) => ({
      ...p,
      last_editor_profile: p.profiles ? { name: p.profiles.name } : null,
      profiles: p.created_by && creatorMap[p.created_by] ? { name: creatorMap[p.created_by] } : null,
      product_references: (refsByProduct[p.id] || []).map(code => ({ manufacturer_code: code })),
    })) as Product[];

    return {
      data: mapped,
      count: filteredProducts.length,
    };
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
      .or(`sku.ilike.%${searchTerm}%,alternative_code.ilike.%${searchTerm}%,barcode.ilike.%${searchTerm}%`)
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

  return products.map((p) => ({
    ...p,
    last_editor_profile: p.profiles ? { name: p.profiles.name } : null,
    profiles: p.created_by && creatorMap[p.created_by] ? { name: creatorMap[p.created_by] } : null,
  })) as Product[];
}

export async function createProduct(
  companyId: string,
  input: {
    sku: string;
    alternative_code?: string | null;
    barcode?: string | null;
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
    userId?: string;
  }
): Promise<Product> {
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
      barcode: input.barcode || null,
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

  // Auditoria
  if (input.userId) {
    await logActivity({
      companyId,
      userId: input.userId,
      action: "INSERT",
      entity: "products",
      entityId: data.id,
      meta: { new: data }
    });
  }

  return data as Product;
}

export async function updateProduct(id: string, patch: Partial<Product>, userId?: string) {
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
  } as any;

  const { data, error } = await db
    .from("products")
    .update({ ...normalizedPatch, name: normalizedPatch.name?.trim(), updated_by: userId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;

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

export async function findProductByBarcode(companyId: string, barcode: string): Promise<Product | null> {
  const norm = barcode.trim();
  if (!norm) return null;
  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("company_id", companyId)
    .eq("barcode", norm)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return (data as Product) ?? null;
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
  const { data, error } = await db
    .from("stock_count_items")
    .select("*")
    .eq("count_id", countId)
    .order("product_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as StockCountItem[];
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

export async function registerSale(input: {
  companyId: string;
  customerId: string | null;
  items: SaleItemInput[];
  discount?: number;
  paymentMethod?: string;
  dueDate?: string | null;
  notes?: string | null;
  userId?: string;
  status?: "aberta" | "concluida";
}): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;
  const realCreatorId = input.userId || currentUserId;

  // Se o customerId for "none", passamos null para o RPC
  const cleanCustomerId = (input.customerId === "none" || !input.customerId) ? null : input.customerId;

  const { data, error } = await db.rpc("register_sale", {
    _company: input.companyId,
    _customer: cleanCustomerId,
    _items: input.items,
    _discount: input.discount ?? 0,
    _payment_method: input.paymentMethod ?? "dinheiro",
    _due_date: input.dueDate ?? null,
    _notes: input.notes ?? null,
  });
  
  if (error) {
    console.error("Erro no RPC register_sale:", error);
    throw error;
  }
  
  const saleId = data as string;

  // Se o status for diferente de 'concluida', atualizamos manualmente
  // Já que o RPC atual hardcodifica 'concluida'
  if (input.status && input.status !== 'concluida') {
    await db.from("sales").update({ status: input.status }).eq("id", saleId);
  }

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
    // Fallback: se a versão antiga do RPC ignorou _created_by, garantimos aqui em sales e payables.
    // (stock_movements não é atualizável por RLS — o RPC novo já grava o created_by correto.)
    if (realCreatorId && realCreatorId !== currentUserId) {
      try {
        await db.from("sales").update({ created_by: realCreatorId }).eq("id", saleId);
        await db.from("payables").update({ created_by: realCreatorId }).eq("sale_id", saleId);
      } catch (e) {
        console.warn("Fallback de created_by falhou (não crítico):", e);
      }
    }
  }

  // Sincronizar com o Financeiro (Contas a Receber/Pago) e Fluxo de Caixa
  // Nota: O RPC atual pode não estar inserindo em payables, então garantimos aqui.
  try {
    let subtotal = 0;
    for (const item of input.items) {
      subtotal += Number(item.quantity) * Number(item.unit_price);
    }
    const total = Math.max(subtotal - (input.discount || 0), 0);
    
    // Sincronizar com o Financeiro (Contas a Receber/Pago) e Fluxo de Caixa
    // APENAS se a venda não estiver em aberto (carrinho)
    if (input.status !== 'aberta') {
      // Se não houver data de vencimento, consideramos venda à vista (pago)
      const isPaid = !input.dueDate;
      
      // Verifica se já existe um payable para esta venda (evita duplicidade se o RPC for corrigido)
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
          payment_method: input.paymentMethod || "dinheiro",
          notes: input.notes,
          created_by: realCreatorId
        });

        if (payableError) {
          console.error("Erro ao inserir payable:", payableError);
        }
      }

      // Sincronização automática com o Fluxo de Caixa se for venda à vista
      if (isPaid && realCreatorId && total > 0) {
        await syncSaleCashTransaction({
          companyId: input.companyId,
          saleId: saleId,
          amount: total,
          paymentMethod: input.paymentMethod || "dinheiro",
          userId: realCreatorId,
          description: `Venda #${saleId.slice(0, 8)}`
        });
      }
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
}) {
  let query = db
    .from("sales")
    .select("*, profiles(name)", { count: "exact" })
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

  if (params.status && params.status !== "all" && params.status !== "todas") {
    query = query.eq("status", params.status);
  }

  if (params.dateFrom) {
    query = query.gte("created_at", params.dateFrom);
  }

  if (params.dateTo) {
    const toDate = params.dateTo.includes('T') ? params.dateTo : `${params.dateTo}T23:59:59`;
    query = query.lte("created_at", toDate);
  }

  if (params.userId) {
    query = query.eq("created_by", params.userId);
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

export async function fetchSales(companyId: string, limit = 100): Promise<any[]> {
  const { data, error } = await db
    .from("sales")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
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

  // 4. Update sale
  const { data: currentSale } = await db.from("sales").select("total").eq("id", saleId).single();
  const shouldUpdatePrice = currentSale && Number(currentSale.total) === 0;

  const updatePayload: any = {
    subtotal,
    discount,
    notes: reason ? `Edição: ${reason}` : null
  };

  if (shouldUpdatePrice) {
    updatePayload.total = total;
  }

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

export async function reopenSale(saleId: string): Promise<string> {
  const { data, error } = await db.rpc("reopen_sale", { _sale: saleId });
  if (error) throw error;
  return data as string;
}

export async function cancelSale(saleId: string, reason?: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();

  // 1. Obter detalhes da venda para o log
  const { data: sale } = await db.from("sales").select("*").eq("id", saleId).maybeSingle();

  // Use RPC if available, otherwise manual
  const { data, error } = await db.rpc("cancel_sale", { _sale_id: saleId, _reason: reason });
  
  // Update notes even if RPC succeeded
  if (!error && reason) {
    await db.from("sales").update({ notes: `Cancelamento: ${reason}${user?.id ? ` (por ${user.id})` : ""}` }).eq("id", saleId);
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







export async function finalizeOpenSale(saleId: string, paymentMethod?: string, expectedTotal?: number): Promise<string> {
  // 1. Finaliza o status da venda
  if (typeof expectedTotal === "number") {
    const { error: rpcErr } = await (db as any).rpc("finalize_sale_validated", {
      _sale_id: saleId,
      _payment_method: paymentMethod ?? null,
      _expected_total: expectedTotal,
    });
    if (rpcErr) throw new Error(rpcErr.message || "Falha ao validar totais da venda");
  } else {
    // Fallback (sem validação) — mantido para compatibilidade
    const { data: sale } = await db.from("sales").select("*").eq("id", saleId).single();
    if (!sale) throw new Error("Venda não encontrada");

    const { error } = await db.from("sales").update({ 
      status: 'concluida',
      payment_method: paymentMethod || sale.payment_method
    }).eq("id", saleId);
    
    if (error) throw error;
  }

  // 2. Busca dados atualizados da venda para sincronizar financeiro
  const { data: sale } = await db.from("sales").select("*").eq("id", saleId).single();
  if (!sale) return saleId;

  // 3. Sincronizar financeiro (fluxo de caixa)
  // Se não houver data de vencimento, consideramos venda à vista (pago)
  if (!sale.due_date && sale.created_by) {
    const finalTotal = typeof expectedTotal === "number" ? expectedTotal : sale.total;
    
    // Garantir que o valor da venda seja atualizado para o valor correto se estiver zerado
    if (Number(sale.total) === 0 && finalTotal > 0) {
      await db.from("sales").update({ total: finalTotal }).eq("id", saleId);
    }
    
    // Cria ou atualiza transação de caixa
    await syncSaleCashTransaction({
      companyId: sale.company_id,
      saleId: saleId,
      amount: finalTotal,
      paymentMethod: paymentMethod || sale.payment_method || "dinheiro",
      userId: sale.created_by,
      description: `Venda (finalizada) #${saleId.slice(0, 8)}`
    });

    // Garante que o payable correspondente (se existir) seja marcado como pago
    await db.from("payables").update({
      status: "pago",
      paid_at: new Date().toISOString().slice(0, 10),
      amount: finalTotal,
      payment_method: paymentMethod || sale.payment_method || "dinheiro"
    }).eq("sale_id", saleId);
  } else if (sale.due_date) {
    // Se for a prazo, garante que o payable existe em aberto
    const { data: existing } = await db.from("payables").select("id").eq("sale_id", saleId).maybeSingle();
    if (!existing) {
      const finalTotal = typeof expectedTotal === "number" ? expectedTotal : sale.total;
      await db.from("payables").insert({
        company_id: sale.company_id,
        direction: "receber",
        partner_id: sale.customer_id,
        sale_id: saleId,
        description: `Venda #${saleId.slice(0, 8)}`,
        amount: finalTotal,
        due_date: sale.due_date,
        status: "aberto",
        payment_method: paymentMethod || sale.payment_method || "dinheiro",
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
    .eq("company_id", companyId);
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
  if (patch.id) {
    const { data, error } = await db.from("delivery_orders").update(payload).eq("id", patch.id).select("*").single();
    if (error) throw error;
    return data as DeliveryOrder;
  }
  const { data, error } = await db.from("delivery_orders").insert(payload).select("*").single();
  if (error) throw error;
  return data as DeliveryOrder;
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

export async function upsertPaymentMethod(
  companyId: string,
  patch: Partial<PaymentMethod> & { id?: string; name: string }
): Promise<PaymentMethod> {
  const payload = {
    company_id: companyId,
    name: patch.name,
    requires_due_date: patch.requires_due_date ?? false,
    active: patch.active ?? true,
  };
  if (patch.id) {
    const { data, error } = await db.from("payment_methods").update(payload).eq("id", patch.id).select("*").single();
    if (error) throw error;
    return data as PaymentMethod;
  }
  const { data, error } = await db.from("payment_methods").insert(payload).select("*").single();
  if (error) throw error;
  return data as PaymentMethod;
}

export async function deletePaymentMethod(id: string) {
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
