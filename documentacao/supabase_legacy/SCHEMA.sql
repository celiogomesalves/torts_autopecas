-- =========================================================
-- Auto Peças ERP — Schema multi-tenant inicial
-- Cole este SQL no SQL Editor do Supabase e execute.
-- =========================================================

-- ENUMS ---------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'gerente', 'vendedor', 'estoquista');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.movement_type as enum ('entrada', 'saida', 'ajuste');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.system_role as enum ('super_admin');
exception when duplicate_object then null; end $$;

-- =========================================================
-- PROFILES
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.email);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.system_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index if not exists idx_user_roles_user on public.user_roles(user_id);

create or replace function public.has_role(_user_id uuid, _role public.system_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'super_admin');
$$;

alter table public.user_roles enable row level security;

drop policy if exists "user_roles_select_self_or_super_admin" on public.user_roles;
create policy "user_roles_select_self_or_super_admin" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "user_roles_insert_super_admin" on public.user_roles;
create policy "user_roles_insert_super_admin" on public.user_roles
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "user_roles_update_super_admin" on public.user_roles;
create policy "user_roles_update_super_admin" on public.user_roles
  for update to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists "user_roles_delete_super_admin" on public.user_roles;
create policy "user_roles_delete_super_admin" on public.user_roles
  for delete to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.system_role
from public.profiles
where lower(email) in ('celiogomesalves@gmail.com', 'celiogomesalves@gmail.com.br')
on conflict (user_id, role) do nothing;

-- =========================================================
-- COMPANIES + MEMBERSHIPS
-- =========================================================
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  invite_code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.app_role not null default 'vendedor',
  created_at timestamptz not null default now(),
  unique (user_id, company_id)
);
create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_company on public.memberships(company_id);

create or replace function public.is_member(_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.memberships
    where company_id = _company and user_id = auth.uid()
  );
$$;

create or replace function public.has_company_role(_company uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.memberships
    where company_id = _company and user_id = auth.uid() and role = _role
  );
$$;

create or replace function public.is_admin(_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_company_role(_company, 'admin');
$$;

alter table public.companies enable row level security;
alter table public.memberships enable row level security;

drop policy if exists "companies_select_members" on public.companies;
create policy "companies_select_members" on public.companies
  for select to authenticated using (public.is_member(id));

drop policy if exists "companies_insert_self" on public.companies;
create policy "companies_insert_self" on public.companies
  for insert to authenticated
  with check (
    public.is_super_admin()
    or (auth.uid() is not null and (created_by is null or created_by = auth.uid()))
  );

drop policy if exists "companies_update_admin" on public.companies;
create policy "companies_update_admin" on public.companies
  for update to authenticated using (public.is_admin(id));

drop policy if exists "companies_delete_admin" on public.companies;
create policy "companies_delete_admin" on public.companies
  for delete to authenticated using (public.is_admin(id));

drop policy if exists "memberships_select_self_or_admin" on public.memberships;
create policy "memberships_select_self_or_admin" on public.memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(company_id));

drop policy if exists "memberships_insert_self_or_admin" on public.memberships;
create policy "memberships_insert_self_or_admin" on public.memberships
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin(company_id));

drop policy if exists "memberships_update_admin" on public.memberships;
create policy "memberships_update_admin" on public.memberships
  for update to authenticated using (public.is_admin(company_id));

drop policy if exists "memberships_delete_self_or_admin" on public.memberships;
create policy "memberships_delete_self_or_admin" on public.memberships
  for delete to authenticated
  using (user_id = auth.uid() or public.is_admin(company_id));

create or replace function public.set_company_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end; $$;

drop trigger if exists set_created_by_companies on public.companies;
create trigger set_created_by_companies
  before insert on public.companies
  for each row execute function public.set_company_created_by();

create or replace function public.handle_new_company()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.memberships (user_id, company_id, role)
  values (new.created_by, new.id, 'admin');
  return new;
end; $$;

drop trigger if exists on_company_created on public.companies;
create trigger on_company_created
  after insert on public.companies
  for each row when (new.created_by is not null)
  execute function public.handle_new_company();

create or replace function public.join_company_by_code(_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _company_id uuid;
begin
  select id into _company_id from public.companies
   where invite_code = upper(trim(_code)) limit 1;
  if _company_id is null then
    raise exception 'Código de convite inválido';
  end if;
  insert into public.memberships (user_id, company_id, role)
    values (auth.uid(), _company_id, 'vendedor')
    on conflict (user_id, company_id) do nothing;
  return _company_id;
end; $$;

create or replace function public.rotate_invite_code(_company uuid)
returns text language plpgsql security definer set search_path = public as $$
declare _new text := upper(substr(md5(random()::text), 1, 6));
begin
  if not public.is_admin(_company) then
    raise exception 'Apenas administradores podem rotacionar o código';
  end if;
  update public.companies set invite_code = _new where id = _company;
  return _new;
end; $$;

-- =========================================================
-- ESTOQUE
-- =========================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  sku text not null,
  name text not null,
  brand text,
  description text,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  stock numeric(12,3) not null default 0,
  min_stock numeric(12,3) not null default 0,
  unit text not null default 'UN',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);
create index if not exists idx_products_company on public.products(company_id);
create index if not exists idx_categories_company on public.categories(company_id);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  type public.movement_type not null,
  quantity numeric(12,3) not null,
  unit_cost numeric(12,2),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_movements_company on public.stock_movements(company_id);
create index if not exists idx_movements_product on public.stock_movements(product_id);
create index if not exists idx_movements_created_at on public.stock_movements(created_at desc);

create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'entrada' then
    update public.products set stock = stock + new.quantity, updated_at = now()
      where id = new.product_id;
  elsif new.type = 'saida' then
    update public.products set stock = stock - new.quantity, updated_at = now()
      where id = new.product_id;
  elsif new.type = 'ajuste' then
    update public.products set stock = new.quantity, updated_at = now()
      where id = new.product_id;
  end if;
  return new;
end; $$;

drop trigger if exists on_stock_movement_insert on public.stock_movements;
create trigger on_stock_movement_insert
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists products_touch_updated on public.products;
create trigger products_touch_updated before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated on public.profiles;
create trigger profiles_touch_updated before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "categories_all_members" on public.categories;
create policy "categories_all_members" on public.categories
  for all to authenticated
  using (public.is_member(company_id))
  with check (public.is_member(company_id));

drop policy if exists "products_all_members" on public.products;
create policy "products_all_members" on public.products
  for all to authenticated
  using (public.is_member(company_id))
  with check (public.is_member(company_id));

drop policy if exists "movements_select_members" on public.stock_movements;
create policy "movements_select_members" on public.stock_movements
  for select to authenticated using (public.is_member(company_id));

drop policy if exists "movements_insert_members" on public.stock_movements;
create policy "movements_insert_members" on public.stock_movements
  for insert to authenticated
  with check (public.is_member(company_id) and created_by = auth.uid());

-- =========================================================
-- AUDITORIA
-- =========================================================
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_logs_company_created on public.activity_logs(company_id, created_at desc);

alter table public.activity_logs enable row level security;

drop policy if exists "logs_select_members" on public.activity_logs;
create policy "logs_select_members" on public.activity_logs
  for select to authenticated using (public.is_member(company_id));

drop policy if exists "logs_insert_members" on public.activity_logs;
create policy "logs_insert_members" on public.activity_logs
  for insert to authenticated
  with check (public.is_member(company_id) and (user_id is null or user_id = auth.uid()));
