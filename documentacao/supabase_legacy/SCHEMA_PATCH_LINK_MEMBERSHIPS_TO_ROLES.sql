-- =====================================================================
-- PATCH: Vincula membros existentes ao perfil customizado correspondente
--   - Mapeia o role legado (admin/gerente/vendedor/estoquista) para o
--     company_role com nome equivalente na mesma empresa.
--   - Cria trigger para que novos memberships já sejam vinculados.
-- =====================================================================

-- 1) Backfill: vincula todos os memberships existentes ao perfil correto
update public.memberships m
   set custom_role_id = r.id
  from public.company_roles r
 where r.company_id = m.company_id
   and m.custom_role_id is null
   and (
        (m.role = 'admin'      and r.name = 'Administrador')
     or (m.role = 'gerente'    and r.name = 'Gerente')
     or (m.role = 'vendedor'   and r.name = 'Vendedor')
     or (m.role = 'estoquista' and r.name = 'Estoquista')
   );

-- 2) Trigger: ao criar/atualizar membership sem custom_role_id, auto-vincular
create or replace function public.auto_link_membership_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare _name text;
begin
  if new.custom_role_id is not null then
    return new;
  end if;

  _name := case new.role
             when 'admin'      then 'Administrador'
             when 'gerente'    then 'Gerente'
             when 'vendedor'   then 'Vendedor'
             when 'estoquista' then 'Estoquista'
           end;

  if _name is null then return new; end if;

  select id into new.custom_role_id
    from public.company_roles
   where company_id = new.company_id and name = _name
   limit 1;

  return new;
end; $$;

drop trigger if exists trg_auto_link_membership_role on public.memberships;
create trigger trg_auto_link_membership_role
  before insert or update of role on public.memberships
  for each row execute function public.auto_link_membership_role();
