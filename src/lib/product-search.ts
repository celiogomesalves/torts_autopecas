import type { ProductReference } from "@/lib/db";

/**
 * Builds a map productId -> extra search text containing manufacturer codes
 * and brand names from product_references.
 */
export function buildRefsSearchMap(
  refs: ProductReference[],
  brandsById?: Map<string, string>,
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of refs) {
    const brandName = r.brand_name || (r.brand_id && brandsById?.get(r.brand_id)) || "";
    const piece = [r.manufacturer_code || "", brandName].filter(Boolean).join(" ");
    if (!piece) continue;
    const prev = m.get(r.product_id);
    m.set(r.product_id, prev ? `${prev} ${piece}` : piece);
  }
  return m;
}

/**
 * Builds a map productId -> Set of brand_ids associated (additional brands only).
 */
export function buildRefsBrandMap(refs: ProductReference[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of refs) {
    if (!r.brand_id) continue;
    let s = m.get(r.product_id);
    if (!s) {
      s = new Set();
      m.set(r.product_id, s);
    }
    s.add(r.brand_id);
  }
  return m;
}

/**
 * Returns true if the product matches the given brand filter, considering
 * both the main brand_id and any additional brands from product_references.
 */
export function productMatchesBrand(
  productId: string,
  productBrandId: string | null | undefined,
  brandFilter: string,
  refsBrandMap: Map<string, Set<string>>,
): boolean {
  if (brandFilter === "all") return true;
  if (productBrandId === brandFilter) return true;
  return refsBrandMap.get(productId)?.has(brandFilter) ?? false;
}
