-- =========================================================
-- Auto Peças ERP — Patch: Clientes/Fornecedores, Vendas, Financeiro
-- Cole no SQL Editor do Supabase e execute.
-- =========================================================

-- ENUMS ---------------------------------------------------
do $$ begin
  create type public.partner_type as enum ('cliente', 'fornecedor', 'ambos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sale_status as enum ('aberta', 'concluida', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payable_direction as enum ('receber', 'pagar');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payable_status as enum ('aberto', 'pago', 'cancelado');
exception when duplicate_object then null; end $$;

-- =========================================================
-- PARTNERS (clientes / fornecedores)
-- =========================================================
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type public.partner_type not null default 'cliente',
  name text not null,
  doc text,            -- CPF / CNPJ
  email text,
  phone text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.partners enable row level security;

drop policy if exists "partners_all_members" on public.partners;
create policy "partners_all_members" on public.partners
  for all to authenticated
  using (public.is_member(company_id))
  with check (public.is_member(company_id));

drop trigger if exists touch_partners on public.partners;
create trigger touch_partners before update on public.partners
  for each row execute function public.touch_updated_at();

create index if not exists partners_company_idx on public.partners(company_id);
create index if not exists partners_name_idx on public.partners(company_id, name);

-- =========================================================
-- SALES + SALE ITEMS
-- =========================================================
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.partners(id) on delete set null,
  number bigserial,
  status public.sale_status not null default 'concluida',
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  payment_method text,
  due_date date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.sales enable row level security;

drop policy if exists "sales_select_members" on public.sales;
create policy "sales_select_members" on public.sales
  for select to authenticated using (public.is_member(company_id));

drop policy if exists "sales_insert_members" on public.sales;
create policy "sales_insert_members" on public.sales
  for insert to authenticated
  with check (public.is_member(company_id));

drop policy if exists "sales_update_members" on public.sales;
create policy "sales_update_members" on public.sales
  for update to authenticated using (public.is_member(company_id));

create index if not exists sales_company_idx on public.sales(company_id, created_at desc);

-- itens
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  total numeric(14,2) not null
);
alter table public.sale_items enable row level security;

drop policy if exists "sale_items_all_members" on public.sale_items;
create policy "sale_items_all_members" on public.sale_items
  for all to authenticated
  using (public.is_member(company_id))
  with check (public.is_member(company_id));

create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

-- auto-set created_by da venda
create or replace function public.set_sale_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;

drop trigger if exists set_created_by_sales on public.sales;
create trigger set_created_by_sales before insert on public.sales
  for each row execute function public.set_sale_created_by();

-- =========================================================
-- FINANCIAL: payables (contas a pagar/receber)
-- =========================================================
create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  direction public.payable_direction not null,
  partner_id uuid references public.partners(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  description text not null,
  amount numeric(14,2) not null,
  due_date date not null,
  paid_at date,
  status public.payable_status not null default 'aberto',
  payment_method text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payables enable row level security;

drop policy if exists "payables_all_members" on public.payables;
create policy "payables_all_members" on public.payables
  for all to authenticated
  using (public.is_member(company_id))
  with check (public.is_member(company_id));

drop trigger if exists touch_payables on public.payables;
create trigger touch_payables before update on public.payables
  for each row execute function public.touch_updated_at();

create or replace function public.set_payable_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;

drop trigger if exists set_created_by_payables on public.payables;
create trigger set_created_by_payables before insert on public.payables
  for each row execute function public.set_payable_created_by();

create index if not exists payables_company_idx on public.payables(company_id, status, due_date);

-- =========================================================
-- RPC: registrar venda (transacional) — baixa estoque + gera receber
-- =========================================================
create or replace function public.register_sale(
  _company uuid,
  _customer uuid,
  _items jsonb,            -- [{ product_id, quantity, unit_price }]
  _discount numeric default 0,
  _payment_method text default 'dinheiro',
  _due_date date default null,
  _notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _sale_id uuid;
  _item jsonb;
  _subtotal numeric(14,2) := 0;
  _total numeric(14,2);
  _qty numeric;
  _price numeric;
  _pid uuid;
  _stock numeric;
begin
  if not public.is_member(_company) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  if jsonb_array_length(_items) = 0 then
    raise exception 'Adicione ao menos um item';
  end if;

  -- valida estoque e calcula subtotal
  for _item in select * from jsonb_array_elements(_items) loop
    _pid := (_item->>'product_id')::uuid;
    _qty := (_item->>'quantity')::numeric;
    _price := (_item->>'unit_price')::numeric;
    if _qty <= 0 then raise exception 'Quantidade inválida'; end if;
    select stock into _stock from public.products where id = _pid and company_id = _company;
    if _stock is null then raise exception 'Produto não encontrado'; end if;
    if _stock < _qty then
      raise exception 'Estoque insuficiente para o produto %', _pid;
    end if;
    _subtotal := _subtotal + (_qty * _price);
  end loop;

  _total := greatest(_subtotal - coalesce(_discount, 0), 0);

  insert into public.sales (company_id, customer_id, status, subtotal, discount, total,
                            payment_method, due_date, notes)
  values (_company, _customer, 'concluida', _subtotal, coalesce(_discount,0), _total,
          _payment_method, _due_date, _notes)
  returning id into _sale_id;

  -- itens + saída de estoque
  for _item in select * from jsonb_array_elements(_items) loop
    _pid := (_item->>'product_id')::uuid;
    _qty := (_item->>'quantity')::numeric;
    _price := (_item->>'unit_price')::numeric;

    insert into public.sale_items (sale_id, company_id, product_id, quantity, unit_price, total)
    values (_sale_id, _company, _pid, _qty, _price, _qty * _price);

    insert into public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
    values (_company, _pid, 'saida', _qty, 'Venda #' || _sale_id::text, auth.uid());
  end loop;

  -- gera conta a receber
  if _total > 0 then
    insert into public.payables (company_id, direction, partner_id, sale_id, description,
                                 amount, due_date, status, payment_method)
    values (_company, 'receber', _customer, _sale_id,
            'Venda #' || _sale_id::text,
            _total,
            coalesce(_due_date, current_date),
            (case when _payment_method in ('dinheiro','pix','debito','credito') then 'pago' else 'aberto' end)::public.payable_status,
            _payment_method);

    -- se já marcou como pago, registra paid_at
    update public.payables set paid_at = current_date
      where sale_id = _sale_id and status = 'pago'::public.payable_status;
  end if;

  return _sale_id;
end; $$;

-- =========================================================
-- RPC: cancel_sale (reverte estoque e financeiro)
-- =========================================================
create or replace function public.cancel_sale(_sale uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _item record;
  _company uuid;
  _status public.sale_status;
begin
  select company_id, status into _company, _status from public.sales where id = _sale;
  if not public.is_member(_company) then
    raise exception 'Sem acesso a esta empresa';
  end if;

  if _status = 'cancelada' then return; end if;

  -- Se estava concluída, devolve estoque e cancela financeiro
  if _status = 'concluida' then
    for _item in select * from public.sale_items where sale_id = _sale loop
      insert into public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
      values (_company, _item.product_id, 'entrada', _item.quantity, 'Cancelamento Venda #' || _sale::text, auth.uid());
    end loop;
    
    update public.payables set status = 'cancelado'::public.payable_status where sale_id = _sale;
  end if;

  update public.sales set status = 'cancelada' where id = _sale;
end; $$;

-- =========================================================
-- RPC: reopen_sale (volta para aberta, devolve estoque se estava concluída)
-- =========================================================
create or replace function public.reopen_sale(_sale uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  _item record;
  _company uuid;
  _status public.sale_status;
begin
  select company_id, status into _company, _status from public.sales where id = _sale;
  if not public.is_member(_company) then
    raise exception 'Sem acesso a esta empresa';
  end if;

  if _status = 'aberta' then return; end if;

  -- Se estava concluída, devolve estoque e cancela financeiro para refazer depois
  if _status = 'concluida' then
    for _item in select * from public.sale_items where sale_id = _sale loop
      insert into public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
      values (_company, _item.product_id, 'entrada', _item.quantity, 'Reabertura Venda #' || _sale::text, auth.uid());
    end loop;
    
    update public.payables set status = 'cancelado'::public.payable_status where sale_id = _sale;
  end if;

  update public.sales set status = 'aberta' where id = _sale;
end; $$;

-- =========================================================
-- RPC: finalize_open_sale (conclui venda aberta)
-- =========================================================
create or replace function public.finalize_open_sale(_sale uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  _item record;
  _company uuid;
  _total numeric;
  _customer uuid;
  _due_date date;
  _payment_method text;
  _status public.sale_status;
begin
  select company_id, total, customer_id, due_date, payment_method, status
    into _company, _total, _customer, _due_date, _payment_method, _status
    from public.sales where id = _sale;

  if not public.is_member(_company) then
    raise exception 'Sem acesso a esta empresa';
  end if;

  if _status != 'aberta' then
    raise exception 'Venda já finalizada ou cancelada';
  end if;

  -- 1. Baixa estoque
  for _item in select * from public.sale_items where sale_id = _sale loop
    insert into public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
    values (_company, _item.product_id, 'saida', _item.quantity, 'Finalização Venda #' || _sale::text, auth.uid());
  end loop;

  -- 2. Financeiro
  if _total > 0 then
    insert into public.payables (company_id, direction, partner_id, sale_id, description,
                                 amount, due_date, status, payment_method)
    values (_company, 'receber', _customer, _sale,
            'Venda #' || _sale::text,
            _total,
            coalesce(_due_date, current_date),
            (case when _payment_method in ('dinheiro','pix','debito','credito') then 'pago' else 'aberto' end)::public.payable_status,
            _payment_method);

    update public.payables set paid_at = current_date
      where sale_id = _sale and status = 'pago'::public.payable_status;
  end if;

  update public.sales set status = 'concluida' where id = _sale;

  return _sale;
end; $$;

-- =========================================================
-- Helpers de leitura (memberships com profile)
-- =========================================================
-- (sem novos objetos; usaremos joins via PostgREST)
