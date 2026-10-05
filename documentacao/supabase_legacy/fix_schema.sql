CREATE TABLE IF NOT EXISTS public.partner_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    complement TEXT,
    number TEXT,
    cep TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.partner_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_addresses_all_members ON public.partner_addresses;
CREATE POLICY partner_addresses_all_members ON public.partner_addresses 
FOR ALL TO authenticated 
USING (public.is_member(company_id)) 
WITH CHECK (public.is_member(company_id));

-- Trigger para garantir apenas um padrão por parceiro
CREATE OR REPLACE FUNCTION public.handle_default_partner_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.partner_addresses
    SET is_default = false
    WHERE partner_id = NEW.partner_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_partner_address_default ON public.partner_addresses;
CREATE TRIGGER on_partner_address_default
BEFORE INSERT OR UPDATE ON public.partner_addresses
FOR EACH ROW EXECUTE FUNCTION public.handle_default_partner_address();
