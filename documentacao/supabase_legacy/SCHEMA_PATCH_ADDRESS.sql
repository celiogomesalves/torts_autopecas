-- Patch: adiciona campos de endereço estruturado em parceiros.
-- Rodar UMA VEZ no SQL Editor do Supabase.

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text;
