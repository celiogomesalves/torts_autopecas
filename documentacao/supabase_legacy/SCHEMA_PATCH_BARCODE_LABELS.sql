-- ============================================================
-- EXECUTE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE
-- https://supabase.com/dashboard/project/oapfhdcvugcileuxumpb/sql/new
--
-- Cria a tabela `barcode_labels` para armazenar PERMANENTEMENTE
-- os modelos de etiquetas (fixos do sistema + personalizados),
-- por empresa, com RLS por membership.
-- ============================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.barcode_labels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  code            text NOT NULL,
  name            text NOT NULL,
  page_width_mm   numeric(8,3) NOT NULL,
  page_height_mm  numeric(8,3) NOT NULL,
  margin_top_mm   numeric(8,3) NOT NULL DEFAULT 0,
  margin_left_mm  numeric(8,3) NOT NULL DEFAULT 0,
  cols            integer NOT NULL DEFAULT 1,
  rows            integer NOT NULL DEFAULT 1,
  label_width_mm  numeric(8,3) NOT NULL,
  label_height_mm numeric(8,3) NOT NULL,
  gap_x_mm        numeric(8,3) NOT NULL DEFAULT 0,
  gap_y_mm        numeric(8,3) NOT NULL DEFAULT 0,
  border_radius_mm numeric(8,3),
  font_size_pt    numeric(6,2),
  offset_x        numeric(8,3) DEFAULT 0,
  offset_y        numeric(8,3) DEFAULT 0,
  is_system       boolean NOT NULL DEFAULT false,
  is_default      boolean NOT NULL DEFAULT false,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_barcode_labels_company ON public.barcode_labels(company_id);

-- 2) updated_at
DROP TRIGGER IF EXISTS trg_barcode_labels_updated_at ON public.barcode_labels;
CREATE TRIGGER trg_barcode_labels_updated_at
  BEFORE UPDATE ON public.barcode_labels
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) RLS
ALTER TABLE public.barcode_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS barcode_labels_select  ON public.barcode_labels;
DROP POLICY IF EXISTS barcode_labels_insert  ON public.barcode_labels;
DROP POLICY IF EXISTS barcode_labels_update  ON public.barcode_labels;
DROP POLICY IF EXISTS barcode_labels_delete  ON public.barcode_labels;

CREATE POLICY barcode_labels_select ON public.barcode_labels
  FOR SELECT TO authenticated
  USING (public.is_member(company_id));

CREATE POLICY barcode_labels_insert ON public.barcode_labels
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(company_id) AND is_system = false);

CREATE POLICY barcode_labels_update ON public.barcode_labels
  FOR UPDATE TO authenticated
  USING (public.is_member(company_id) AND is_system = false)
  WITH CHECK (public.is_member(company_id) AND is_system = false);

CREATE POLICY barcode_labels_delete ON public.barcode_labels
  FOR DELETE TO authenticated
  USING (public.is_member(company_id) AND is_system = false);

-- 4) Função de seed dos modelos do sistema para uma empresa
CREATE OR REPLACE FUNCTION public.seed_system_barcode_labels_for(_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.barcode_labels
    (company_id, code, name, page_width_mm, page_height_mm, margin_top_mm, margin_left_mm,
     cols, rows, label_width_mm, label_height_mm, gap_x_mm, gap_y_mm, is_system)
  VALUES
    (_company,'0101','1 etiqueta — 215,9 × 279,4 mm',215.9,279.4,0,0,1,1,215.9,279.4,0,0,true),
    (_company,'0201','2 etiquetas — 212,73 × 138,11 mm',215.9,279.4,1.5,1.5,1,2,212.73,138.11,0,0,true),
    (_company,'0202','4 etiquetas — 106,36 × 138,11 mm',215.9,279.4,1.5,1.5,2,2,106.36,138.11,0,0,true),
    (_company,'0203','6 etiquetas — 84,7 × 101,6 mm',215.9,279.4,12.7,23.5,2,3,84.7,101.6,0,0,true),
    (_company,'0204','8 etiquetas — 59,27 × 85,73 mm',215.9,279.4,12.7,23.5,2,4,59.27,85.73,0,0,true),
    (_company,'0205','10 etiquetas — 101,6 × 50,8 mm',215.9,279.4,12.7,4.7,2,5,101.6,50.8,0,0,true),
    (_company,'0207E','14 etiquetas — 33,9 × 101,6 mm',215.9,279.4,12.7,4.7,2,7,101.6,33.9,0,0,true),
    (_company,'0210','20 etiquetas — 101,6 × 25,4 mm',215.9,279.4,12.7,4.7,2,10,101.6,25.4,0,0,true),
    (_company,'0310','30 etiquetas — 66,7 × 25,4 mm',215.9,279.4,12.7,4.7,3,10,66.7,25.4,0,0,true),
    (_company,'0420','80 etiquetas — 38,1 × 21,2 mm',215.9,279.4,12.7,4.7,4,20,38.1,21.2,0,0,true),
    (_company,'0512','60 etiquetas — 38,1 × 21,2 mm',215.9,279.4,12.7,4.7,5,12,38.1,21.2,0,0,true),
    (_company,'VL15','15 etiquetas — 148 × 17 mm (lombada)',215.9,279.4,12.7,33.9,1,15,148,17,0,0,true),
    (_company,'VL10','10 etiquetas — 99,1 × 67,7 mm',215.9,279.4,12.7,8.4,2,5,99.1,67.7,0,0,true),
    (_company,'A4148','96 etiquetas — 17 × 31 mm',210,297,8,8,8,12,17,31,1,0,true),
    (_company,'A4149','126 etiquetas — 26 × 15 mm',210,297,13.5,9,7,18,26,15,0,0,true),
    (_company,'A4160','21 etiquetas — 63,5 × 38,1 mm',210,297,15.1,7.2,3,7,63.5,38.1,2.5,0,true),
    (_company,'A4161','18 etiquetas — 63,5 × 46,6 mm',210,297,11.5,7.2,3,6,63.5,46.6,2.5,0,true),
    (_company,'A4162','16 etiquetas — 99,1 × 34 mm',210,297,13,4.7,2,8,99.1,34,2.5,0,true),
    (_company,'A4163','14 etiquetas — 99,1 × 38,1 mm',210,297,8.5,4.7,2,7,99.1,38.1,2.5,0,true),
    (_company,'A4164','12 etiquetas — 63,5 × 72 mm',210,297,8.5,7.2,3,4,63.5,72,2.5,0,true),
    (_company,'A4165','8 etiquetas — 99,1 × 67,7 mm',210,297,12.7,4.7,2,4,99.1,67.7,2.5,0,true),
    (_company,'A4166','6 etiquetas — 99,1 × 93,1 mm',210,297,11.5,4.7,2,3,99.1,93.1,2.5,0,true),
    (_company,'A4350','10 etiquetas — 99,1 × 55,8 mm',210,297,13.5,4.7,2,5,99.1,55.8,2.5,0,true),
    (_company,'A4354','22 etiquetas — 25,4 × 99 mm',210,297,13.5,4.7,2,11,99,25.4,2.5,0,true),
    (_company,'A4355','27 etiquetas — 31 × 63,5 mm',210,297,13.5,7.2,3,9,63.5,31,2.5,0,true),
    (_company,'A4356','33 etiquetas — 25,4 × 63,5 mm',210,297,13.5,7.2,3,11,63.5,25.4,2.5,0,true),
    (_company,'A4651','65 etiquetas — 38,1 × 21,2 mm',210,297,10.7,4.7,5,13,38.1,21.2,2.5,0,true)
  ON CONFLICT (company_id, code) DO NOTHING;
END; $$;

-- 5) Trigger: ao criar empresa, semear modelos
CREATE OR REPLACE FUNCTION public.seed_system_barcode_labels_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_system_barcode_labels_for(NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_seed_barcode_labels ON public.companies;
CREATE TRIGGER trg_seed_barcode_labels
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_system_barcode_labels_trigger();

-- 6) Backfill: semear modelos do sistema em todas as empresas existentes
DO $$
DECLARE _c uuid;
BEGIN
  FOR _c IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_system_barcode_labels_for(_c);
  END LOOP;
END $$;

-- ============================================================
-- VERIFICAÇÕES
-- ============================================================
-- SELECT company_id, count(*) FROM public.barcode_labels GROUP BY company_id;
-- SELECT * FROM public.barcode_labels WHERE is_system = false;
