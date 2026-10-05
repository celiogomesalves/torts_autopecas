-- ============================================================
-- Configurações por empresa (data de início do fluxo de caixa)
-- Aplique este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  cashflow_start_date date,
  barcode_scanner_enabled boolean NOT NULL DEFAULT false,
  ai_enabled boolean NOT NULL DEFAULT false,
  ai_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  ai_connection_validated boolean NOT NULL DEFAULT false,
  ai_validated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS barcode_scanner_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  ADD COLUMN IF NOT EXISTS ai_connection_validated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_validated_at timestamptz;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_settings_select_members" ON public.company_settings;
CREATE POLICY "company_settings_select_members"
  ON public.company_settings FOR SELECT TO authenticated
  USING (public.is_member(company_id));

DROP POLICY IF EXISTS "company_settings_insert_admin" ON public.company_settings;
CREATE POLICY "company_settings_insert_admin"
  ON public.company_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(company_id) OR public.has_company_role(company_id, 'gerente'::app_role));

DROP POLICY IF EXISTS "company_settings_update_admin" ON public.company_settings;
CREATE POLICY "company_settings_update_admin"
  ON public.company_settings FOR UPDATE TO authenticated
  USING (public.is_admin(company_id) OR public.has_company_role(company_id, 'gerente'::app_role));

DROP TRIGGER IF EXISTS set_company_settings_updated_at ON public.company_settings;
CREATE TRIGGER set_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
