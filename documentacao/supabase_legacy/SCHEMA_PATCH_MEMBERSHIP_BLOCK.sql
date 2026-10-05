-- ============================================================
-- Bloqueio de membros (memberships.is_blocked)
-- Super admins NUNCA podem ser bloqueados.
-- Rode este script no SQL Editor do Supabase.
-- ============================================================

-- 1. Coluna is_blocked
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- 2. Trigger para impedir bloquear super admins
CREATE OR REPLACE FUNCTION public.prevent_block_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_blocked = true
     AND public.has_role(NEW.user_id, 'super_admin'::system_role) THEN
    RAISE EXCEPTION 'Super administradores não podem ser bloqueados';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_block_super_admin ON public.memberships;
CREATE TRIGGER trg_prevent_block_super_admin
  BEFORE INSERT OR UPDATE OF is_blocked ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.prevent_block_super_admin();

-- 3. Garante que nenhum super admin esteja atualmente bloqueado
UPDATE public.memberships m
   SET is_blocked = false
  WHERE m.is_blocked = true
    AND public.has_role(m.user_id, 'super_admin'::system_role);
