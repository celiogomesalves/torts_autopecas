CREATE TABLE IF NOT EXISTS public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  count_date date NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, count_date)
);

CREATE TABLE IF NOT EXISTS public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text NOT NULL,
  product_name text NOT NULL,
  unit text NOT NULL DEFAULT 'UN',
  expected_quantity numeric NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);

ALTER TABLE public.stock_count_items ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_stock_counts_company_date ON public.stock_counts(company_id, count_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_count ON public.stock_count_items(count_id);

ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_counts_all_members ON public.stock_counts;
CREATE POLICY stock_counts_all_members
  ON public.stock_counts FOR ALL TO authenticated
  USING (public.is_member(company_id))
  WITH CHECK (public.is_member(company_id));

DROP POLICY IF EXISTS stock_count_items_all_members ON public.stock_count_items;
CREATE POLICY stock_count_items_all_members
  ON public.stock_count_items FOR ALL TO authenticated
  USING (public.is_member(company_id))
  WITH CHECK (public.is_member(company_id));

DROP TRIGGER IF EXISTS trg_stock_counts_updated_at ON public.stock_counts;
CREATE TRIGGER trg_stock_counts_updated_at
  BEFORE UPDATE ON public.stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_stock_count_items_updated_at ON public.stock_count_items;
CREATE TRIGGER trg_stock_count_items_updated_at
  BEFORE UPDATE ON public.stock_count_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
