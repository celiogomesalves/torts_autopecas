import type { QueryClient } from "@tanstack/react-query";
import {
  fetchCategories,
  fetchBrands,
  fetchStockLocations,
  fetchUnits,
  fetchPartners,
  fetchPaymentMethods,
  fetchTeam,
  fetchDrivers,
  fetchDeliveryOrders,
  fetchBankTransactions,
  fetchFiscalNotes,
  fetchFiscalSettings,
  fetchQuotations,
  fetchStockCounts,
  fetchProductReferencesByCompany,
} from "@/lib/db";

/**
 * Lê o companyId atual do localStorage (mesma chave usada pelo AuthProvider).
 * Usado em loaders de rota para iniciar prefetch antes da página montar.
 */
export function getCurrentCompanyIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("ap.currentCompanyId");
  } catch {
    return null;
  }
}

const STALE = 60 * 1000; // 1 min — alinhado com queries do app

type Prefetcher = (qc: QueryClient, cid: string) => Promise<unknown>;

const prefetch = (
  qc: QueryClient,
  queryKey: unknown[],
  queryFn: () => Promise<unknown>,
) =>
  qc.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: STALE,
  });

export const prefetchers = {
  categories: (qc, cid) =>
    prefetch(qc, ["categories", cid], () => fetchCategories(cid)),
  brands: (qc, cid) => prefetch(qc, ["brands", cid], () => fetchBrands(cid)),
  locations: (qc, cid) =>
    prefetch(qc, ["stock_locations", cid], () => fetchStockLocations(cid)),
  units: (qc, cid) => prefetch(qc, ["units", cid], () => fetchUnits(cid)),
  suppliers: (qc, cid) =>
    prefetch(qc, ["partners", cid, "fornecedor"], () =>
      fetchPartners(cid, "fornecedor"),
    ),
  clients: (qc, cid) =>
    prefetch(qc, ["partners", cid, "cliente"], () =>
      fetchPartners(cid, "cliente"),
    ),
  partnersAll: (qc, cid) =>
    prefetch(qc, ["partners", cid], () => fetchPartners(cid)),
  paymentMethods: (qc, cid) =>
    prefetch(qc, ["payment_methods", cid], () => fetchPaymentMethods(cid)),
  team: (qc, cid) =>
    prefetch(qc, ["company-members", cid], () => fetchTeam(cid)),
  drivers: (qc, cid) =>
    prefetch(qc, ["drivers", cid], () => fetchDrivers(cid)),
  deliveryOrders: (qc, cid) =>
    prefetch(qc, ["delivery_orders", cid], () => fetchDeliveryOrders(cid)),
  bankTransactions: (qc, cid) =>
    prefetch(qc, ["bank_transactions", cid], () => fetchBankTransactions(cid)),
  fiscalNotes: (qc, cid) =>
    prefetch(qc, ["fiscal_notes", cid], () => fetchFiscalNotes(cid)),
  fiscalSettings: (qc, cid) =>
    prefetch(qc, ["fiscal_settings", cid], () => fetchFiscalSettings(cid)),
  quotations: (qc, cid) =>
    prefetch(qc, ["quotations", cid], () => fetchQuotations(cid)),
  stockCounts: (qc, cid) =>
    prefetch(qc, ["stock_counts", cid], () => fetchStockCounts(cid)),
  productReferences: (qc, cid) =>
    prefetch(qc, ["product_references", cid], () =>
      fetchProductReferencesByCompany(cid),
    ),
} satisfies Record<string, Prefetcher>;

/**
 * Cria um loader que dispara prefetches (fire-and-forget) sem bloquear navegação.
 * Os dados ficam quentes no cache do React Query quando o componente montar
 * e o useQuery correspondente reusa instantaneamente.
 */
export function makePrefetchLoader(keys: (keyof typeof prefetchers)[]) {
  return ({ context }: { context: { queryClient: QueryClient } }) => {
    const cid = getCurrentCompanyIdFromStorage();
    if (!cid) return;
    // fire-and-forget: não aguardamos, a navegação fica imediata
    for (const k of keys) {
      void prefetchers[k](context.queryClient, cid);
    }
  };
}
