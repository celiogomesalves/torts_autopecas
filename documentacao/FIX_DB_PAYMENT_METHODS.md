# Database Fix Required

The table `payment_methods` is missing from the Supabase database. This is causing errors in the application.

Please copy and run the following SQL in your **Supabase SQL Editor**:

```sql
CREATE TABLE IF NOT EXISTS public.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    requires_due_date BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view payment methods for their company"
ON public.payment_methods
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.memberships
        WHERE memberships.company_id = payment_methods.company_id
        AND memberships.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert payment methods for their company"
ON public.payment_methods
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.memberships
        WHERE memberships.company_id = payment_methods.company_id
        AND memberships.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update payment methods for their company"
ON public.payment_methods
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.memberships
        WHERE memberships.company_id = payment_methods.company_id
        AND memberships.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete payment methods for their company"
ON public.payment_methods
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.memberships
        WHERE memberships.company_id = payment_methods.company_id
        AND memberships.user_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER set_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
```
