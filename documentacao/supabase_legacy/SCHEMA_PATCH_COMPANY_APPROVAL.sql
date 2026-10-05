-- =====================================================================
-- PATCH: Aprovação de empresas pelo super admin + RLS de profiles entre
-- membros da mesma empresa.
-- Aplique no SQL Editor do Supabase (uma única vez).
-- =====================================================================

-- 1) Campos de aprovação em companies
alter table public.companies
  add column if not exists approved boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

-- Empresas existentes ficam aprovadas (não quebra usuários atuais)
update public.companies
   set approved = true,
       approved_at = coalesce(approved_at, now())
 where approved = false;

-- 2) is_member passa a exigir empresa aprovada (super admin continua passando)
create or replace function public.is_member(_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.memberships m
    join public.companies c on c.id = m.company_id
    where m.company_id = _company
      and m.user_id = auth.uid()
      and c.approved = true
  );
$$;

-- 3) Permitir que membros da mesma empresa leiam perfis um do outro
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_same_company on public.profiles;
create policy profiles_select_same_company
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_super_admin()
  or exists (
    select 1
    from public.memberships m1
    join public.memberships m2 on m1.company_id = m2.company_id
    where m1.user_id = auth.uid()
      and m2.user_id = profiles.id
  )
);

-- 4) Super admin policies em companies
drop policy if exists companies_select_super_admin on public.companies;
create policy companies_select_super_admin
on public.companies
for select
to authenticated
using (public.is_super_admin());

drop policy if exists companies_update_super_admin on public.companies;
create policy companies_update_super_admin
on public.companies
for update
to authenticated
using (public.is_super_admin());

-- 5) Criadores podem ver sua própria empresa mesmo pendente
drop policy if exists companies_select_creator on public.companies;
create policy companies_select_creator
on public.companies
for select
to authenticated
using (created_by = auth.uid());

-- 6) Funções de aprovação / rejeição
create or replace function public.approve_company(_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Apenas super admin pode aprovar empresas';
  end if;
  update public.companies
     set approved = true,
         approved_at = now(),
         approved_by = auth.uid(),
         rejected_at = null,
         rejection_reason = null
   where id = _company;
end; $$;

create or replace function public.reject_company(_company uuid, _reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Apenas super admin pode rejeitar empresas';
  end if;
  update public.companies
     set approved = false,
         rejected_at = now(),
         rejection_reason = _reason
   where id = _company;
end; $$;

-- 7) Listagem de empresas pendentes (com info do criador)
create or replace function public.list_pending_companies()
returns table (
  id uuid,
  name text,
  cnpj text,
  invite_code text,
  created_at timestamptz,
  created_by uuid,
  creator_name text,
  creator_email text,
  rejected_at timestamptz,
  rejection_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.cnpj, c.invite_code, c.created_at, c.created_by,
         p.name, p.email, c.rejected_at, c.rejection_reason
    from public.companies c
    left join public.profiles p on p.id = c.created_by
   where c.approved = false
     and public.is_super_admin()
   order by c.created_at desc;
$$;
