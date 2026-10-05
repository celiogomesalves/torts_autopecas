
-- =========================================================
-- Sistema de Auditoria (Activity Logs)
-- Registra automaticamente INSERT, UPDATE e DELETE em tabelas críticas
-- =========================================================

-- 1. Garante que a tabela de logs existe e tem a estrutura necessária
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null, -- 'INSERT', 'UPDATE', 'DELETE' ou ações específicas
  entity text not null, -- nome da tabela
  entity_id uuid,      -- ID do registro afetado
  meta jsonb,          -- dados alterados (old/new)
  created_at timestamptz not null default now()
);

-- Index para performance
create index if not exists idx_activity_logs_company_entity on public.activity_logs(company_id, entity);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);

-- RLS para activity_logs
alter table public.activity_logs enable row level security;

drop policy if exists "logs_select_members" on public.activity_logs;
create policy "logs_select_members" on public.activity_logs
  for select to authenticated
  using (public.is_member(company_id));

-- 2. Função genérica de trigger para auditoria
create or replace function public.fn_audit_log()
returns trigger 
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
  v_meta jsonb;
  v_entity_id uuid;
begin
  -- Tenta pegar o company_id do registro (novo ou antigo)
  if (TG_OP = 'DELETE') then
    begin v_company_id := OLD.company_id; exception when others then v_company_id := null; end;
    v_entity_id := OLD.id;
    v_meta := jsonb_build_object('old', to_jsonb(OLD));
  else
    begin v_company_id := NEW.company_id; exception when others then v_company_id := null; end;
    v_entity_id := NEW.id;
    if (TG_OP = 'INSERT') then
      v_meta := jsonb_build_object('new', to_jsonb(NEW));
    elsif (TG_OP = 'UPDATE') then
      v_meta := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    end if;
  end if;

  -- Só registra se tivermos um company_id (contexto da empresa)
  if v_company_id is not null then
    insert into public.activity_logs (
      company_id,
      user_id,
      action,
      entity,
      entity_id,
      meta
    ) values (
      v_company_id,
      v_user_id,
      TG_OP,
      TG_TABLE_NAME,
      v_entity_id,
      v_meta
    );
  end if;

  if (TG_OP = 'DELETE') then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

-- 3. Aplica o trigger nas tabelas principais

-- Produtos
drop trigger if exists tr_audit_products on public.products;
create trigger tr_audit_products
after insert or update or delete on public.products
for each row execute function public.fn_audit_log();

-- Vendas
drop trigger if exists tr_audit_sales on public.sales;
create trigger tr_audit_sales
after insert or update or delete on public.sales
for each row execute function public.fn_audit_log();

-- Parceiros (Clientes/Fornecedores)
drop trigger if exists tr_audit_partners on public.partners;
create trigger tr_audit_partners
after insert or update or delete on public.partners
for each row execute function public.fn_audit_log();

-- Financeiro (Contas a Pagar/Receber)
drop trigger if exists tr_audit_payables on public.payables;
create trigger tr_audit_payables
after insert or update or delete on public.payables
for each row execute function public.fn_audit_log();

-- Movimentações de Estoque
drop trigger if exists tr_audit_stock_movements on public.stock_movements;
create trigger tr_audit_stock_movements
after insert on public.stock_movements
for each row execute function public.fn_audit_log();

-- Caixas
drop trigger if exists tr_audit_cash_registers on public.cash_registers;
create trigger tr_audit_cash_registers
after insert or update or delete on public.cash_registers
for each row execute function public.fn_audit_log();

-- Transações de Caixa
drop trigger if exists tr_audit_cash_transactions on public.cash_transactions;
create trigger tr_audit_cash_transactions
after insert or update or delete on public.cash_transactions
for each row execute function public.fn_audit_log();
