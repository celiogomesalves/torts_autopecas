-- Permitir mesmo SKU para marcas diferentes na mesma empresa.
-- Remove a restrição antiga (company_id, sku) e cria nova (company_id, sku, brand_id).

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_company_id_sku_key;

-- NULLS NOT DISTINCT garante que múltiplos produtos sem marca também sejam únicos pelo SKU.
ALTER TABLE public.products
  ADD CONSTRAINT products_company_id_sku_brand_unique
  UNIQUE NULLS NOT DISTINCT (company_id, sku, brand_id);
