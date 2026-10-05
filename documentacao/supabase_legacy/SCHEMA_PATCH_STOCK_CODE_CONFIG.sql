-- SCHEMA_PATCH_STOCK_CODE_CONFIG.sql
-- Adiciona configurações de geração de código de estoque por empresa

ALTER TABLE public.company_settings 
  ADD COLUMN IF NOT EXISTS stock_code_prefix text DEFAULT 'EST',
  ADD COLUMN IF NOT EXISTS stock_code_auto_generate boolean DEFAULT true;

-- Adiciona restrição de unicidade para alternative_code (código de estoque) dentro da mesma empresa
-- Primeiro remove se já existir para garantir idempotência
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_company_id_alternative_code_key;

-- Adiciona a restrição
-- Nota: alternative_code pode ser NULL, e NULL não viola restrições UNIQUE no Postgres
ALTER TABLE public.products ADD CONSTRAINT products_company_id_alternative_code_key UNIQUE (company_id, alternative_code);
