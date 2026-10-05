-- =====================================================================
-- PATCH: Perfis customizáveis por empresa + matriz de permissões
--   - company_roles: perfis criados pelo admin da empresa
--   - role_permissions: cada (role, módulo) com 4 ações (view/create/edit/delete)
--   - memberships.custom_role_id: liga membro a um perfil customizado
--   - has_permission(_company, _module, _action): helper para o frontend/RLS
--   - Perfis padrão por empresa criados automaticamente
-- =====================================================================

-- 1) Tabela de perfis (roles) por empresa
create table if not exists public.company_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false, -- perfis-base não podem ser excluídos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

alter table public.company_roles enable row level security;

drop policy if exists company_roles_select on public.company_roles;
create policy company_roles_select on public.company_roles
  for select to authenticated using (public.is_member(company_id));

drop policy if exists company_roles_admin_insert on public.company_roles;
create policy company_roles_admin_insert on public.company_roles
  for insert to authenticated
  with check (
    public.is_admin(company_id)
    or public.has_company_role(company_id, 'gerente')
  );

drop policy if exists company_roles_admin_update on public.company_roles;
create policy company_roles_admin_update on public.company_roles
  for update to authenticated
  using (
    public.is_admin(company_id)
    or public.has_company_role(company_id, 'gerente')
  );

drop policy if exists company_roles_admin_delete on public.company_roles;
create policy company_roles_admin_delete on public.company_roles
  for delete to authenticated
  using (
    (public.is_admin(company_id) or public.has_company_role(company_id, 'gerente'))
    and is_system = false
  );

-- 2) Matriz de permissões
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.company_roles(id) on delete cascade,
  module text not null,                   -- 'vendas','estoque','financeiro', etc.
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (role_id, module)
);

alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (exists (
    select 1 from public.company_roles r
    where r.id = role_permissions.role_id
      and public.is_member(r.company_id)
  ));

drop policy if exists role_permissions_admin_write on public.role_permissions;
create policy role_permissions_admin_write on public.role_permissions
  for all to authenticated
  using (exists (
    select 1 from public.company_roles r
    where r.id = role_permissions.role_id
      and (public.is_admin(r.company_id) or public.has_company_role(r.company_id, 'gerente'))
  ))
  with check (exists (
    select 1 from public.company_roles r
    where r.id = role_permissions.role_id
      and (public.is_admin(r.company_id) or public.has_company_role(r.company_id, 'gerente'))
  ));

-- 3) Vincular membro a um perfil customizado (opcional, fallback no role legado)
alter table public.memberships
  add column if not exists custom_role_id uuid references public.company_roles(id) on delete set null;

-- 4) Função helper de permissão
create or replace function public.has_permission(_company uuid, _module text, _action text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _role_id uuid;
  _legacy app_role;
  _ok boolean := false;
begin
  if _uid is null then return false; end if;
  if public.is_super_admin() then return true; end if;

  select custom_role_id, role into _role_id, _legacy
    from public.memberships
   where user_id = _uid and company_id = _company
   limit 1;

  if _role_id is null then
    -- Sem perfil customizado: admin/gerente legados têm tudo
    if _legacy in ('admin','gerente') then return true; end if;
    -- Vendedor/estoquista só veem por padrão
    if _action = 'view' then return true; end if;
    return false;
  end if;

  select case _action
           when 'view'   then can_view
           when 'create' then can_create
           when 'edit'   then can_edit
           when 'delete' then can_delete
           else false
         end
    into _ok
    from public.role_permissions
   where role_id = _role_id and module = _module
   limit 1;

  return coalesce(_ok, false);
end; $$;

-- 5) Seed automático: ao criar empresa, cria perfis padrão (admin/gerente/vendedor/estoquista)
create or replace function public.seed_default_company_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _admin uuid; _gerente uuid; _vendedor uuid; _estoquista uuid;
  _modules text[] := array[
    'dashboard','vendas','estoque','movimentacoes','financeiro',
    'fluxo-caixa','conciliacao','delivery','notas-fiscais','produtos',
    'categorias','marcas','parceiros','formas-pagamento','relatorios',
    'alertas','equipe','configuracoes'
  ];
  _m text;
begin
  insert into public.company_roles (company_id, name, description, is_system)
    values (new.id, 'Administrador', 'Acesso total à empresa', true) returning id into _admin;
  insert into public.company_roles (company_id, name, description, is_system)
    values (new.id, 'Gerente', 'Gerencia operações e equipe', true) returning id into _gerente;
  insert into public.company_roles (company_id, name, description, is_system)
    values (new.id, 'Vendedor', 'Realiza vendas e atendimento', true) returning id into _vendedor;
  insert into public.company_roles (company_id, name, description, is_system)
    values (new.id, 'Estoquista', 'Gerencia o estoque', true) returning id into _estoquista;

  foreach _m in array _modules loop
    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (_admin, _m, true, true, true, true);

    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (_gerente, _m, true, true, true, _m not in ('equipe','configuracoes'));

    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (
        _vendedor, _m,
        _m in ('dashboard','vendas','produtos','parceiros','delivery','alertas','estoque','formas-pagamento'),
        _m in ('vendas','parceiros','delivery'),
        _m in ('vendas','parceiros'),
        false
      );

    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (
        _estoquista, _m,
        _m in ('dashboard','estoque','produtos','movimentacoes','categorias','marcas','alertas'),
        _m in ('estoque','produtos','movimentacoes','categorias','marcas'),
        _m in ('estoque','produtos','categorias','marcas'),
        false
      );
  end loop;

  return new;
end; $$;

drop trigger if exists trg_seed_company_roles on public.companies;
create trigger trg_seed_company_roles
  after insert on public.companies
  for each row execute function public.seed_default_company_roles();

-- 6) Backfill para empresas já existentes
do $$
declare _c uuid;
begin
  for _c in select id from public.companies loop
    if not exists (select 1 from public.company_roles where company_id = _c) then
      perform public.seed_default_company_roles_for(_c);
    end if;
  end loop;
end $$;

-- (helper para backfill)
create or replace function public.seed_default_company_roles_for(_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _admin uuid; _gerente uuid; _vendedor uuid; _estoquista uuid;
  _modules text[] := array[
    'dashboard','vendas','estoque','movimentacoes','financeiro',
    'fluxo-caixa','conciliacao','delivery','notas-fiscais','produtos',
    'categorias','marcas','parceiros','formas-pagamento','relatorios',
    'alertas','equipe','configuracoes'
  ];
  _m text;
begin
  insert into public.company_roles (company_id, name, description, is_system)
    values (_company, 'Administrador', 'Acesso total à empresa', true) returning id into _admin;
  insert into public.company_roles (company_id, name, description, is_system)
    values (_company, 'Gerente', 'Gerencia operações e equipe', true) returning id into _gerente;
  insert into public.company_roles (company_id, name, description, is_system)
    values (_company, 'Vendedor', 'Realiza vendas e atendimento', true) returning id into _vendedor;
  insert into public.company_roles (company_id, name, description, is_system)
    values (_company, 'Estoquista', 'Gerencia o estoque', true) returning id into _estoquista;

  foreach _m in array _modules loop
    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (_admin, _m, true, true, true, true);
    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (_gerente, _m, true, true, true, _m not in ('equipe','configuracoes'));
    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (_vendedor, _m,
        _m in ('dashboard','vendas','produtos','parceiros','delivery','alertas','estoque','formas-pagamento'),
        _m in ('vendas','parceiros','delivery'),
        _m in ('vendas','parceiros'),
        false);
    insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete)
      values (_estoquista, _m,
        _m in ('dashboard','estoque','produtos','movimentacoes','categorias','marcas','alertas'),
        _m in ('estoque','produtos','movimentacoes','categorias','marcas'),
        _m in ('estoque','produtos','categorias','marcas'),
        false);
  end loop;
end; $$;

-- Re-rodar backfill agora que o helper existe
do $$
declare _c uuid;
begin
  for _c in select id from public.companies loop
    if not exists (select 1 from public.company_roles where company_id = _c) then
      perform public.seed_default_company_roles_for(_c);
    end if;
  end loop;
end $$;

-- 7) Trigger touch_updated_at
drop trigger if exists trg_company_roles_touch on public.company_roles;
create trigger trg_company_roles_touch before update on public.company_roles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_role_permissions_touch on public.role_permissions;
create trigger trg_role_permissions_touch before update on public.role_permissions
  for each row execute function public.touch_updated_at();

-- 8) Função utilitária: lista user_ids de super_admins (público para evitar
-- vazamento da tabela user_roles, mas só retorna os IDs — não há dados sensíveis)
create or replace function public.list_super_admin_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.user_roles where role = 'super_admin';
$$;

grant execute on function public.list_super_admin_ids() to authenticated;
