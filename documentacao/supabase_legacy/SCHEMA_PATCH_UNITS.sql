-- Cadastro de Unidades de Medida por empresa
CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  abbreviation text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, abbreviation)
);

CREATE INDEX IF NOT EXISTS idx_units_company ON public.units(company_id);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS units_all_members ON public.units;
CREATE POLICY units_all_members
  ON public.units FOR ALL TO authenticated
  USING (public.is_member(company_id))
  WITH CHECK (public.is_member(company_id));

DROP TRIGGER IF EXISTS trg_units_updated_at ON public.units;
CREATE TRIGGER trg_units_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Vínculo opcional do produto à unidade cadastrada
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_unit ON public.products(unit_id);

-- Seed: cria a unidade padrão "UN - Unidade" para todas as empresas existentes
INSERT INTO public.units (company_id, abbreviation, description)
SELECT c.id, 'UN', 'Unidade'
  FROM public.companies c
 WHERE NOT EXISTS (
   SELECT 1 FROM public.units u
    WHERE u.company_id = c.id AND u.abbreviation = 'UN'
 );

-- Garante que todo produto fique vinculado à unidade UN da própria empresa
UPDATE public.products p
   SET unit = COALESCE(NULLIF(p.unit, ''), 'UN'),
       unit_id = u.id
  FROM public.units u
 WHERE u.company_id = p.company_id
   AND u.abbreviation = 'UN'
   AND p.unit_id IS NULL;

-- Trigger para criar a unidade UN automaticamente em novas empresas
CREATE OR REPLACE FUNCTION public.seed_default_units_for_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.units (company_id, abbreviation, description)
  VALUES (NEW.id, 'UN', 'Unidade')
  ON CONFLICT (company_id, abbreviation) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_units_on_company ON public.companies;
CREATE TRIGGER trg_seed_units_on_company
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_units_for_company();
