-- Adiciona vínculo opcional de fornecedor ao produto
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id);
