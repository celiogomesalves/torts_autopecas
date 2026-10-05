-- Permite especificar quem realizou a venda (útil quando um gerente vende no caixa de outro)
-- Se _created_by for nulo, usa auth.uid()

CREATE OR REPLACE FUNCTION public.register_sale(
  _company uuid, 
  _customer uuid, 
  _items jsonb,
  _discount numeric DEFAULT 0,
  _payment_method text DEFAULT 'dinheiro',
  _due_date date DEFAULT NULL,
  _notes text DEFAULT NULL,
  _created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _real_creator uuid;
  _sale_id uuid; _item jsonb;
  _subtotal numeric(14,2) := 0; _total numeric(14,2);
  _qty numeric; _price numeric; _pid uuid; _stock numeric;
  _is_paid boolean := false;
  _pm_requires_due boolean;
begin
  if _uid is null then raise exception 'Não autenticado'; end if;
  if not public.is_member(_company) then raise exception 'Sem acesso a esta empresa'; end if;
  if jsonb_array_length(_items) = 0 then raise exception 'Adicione ao menos um item'; end if;

  -- Se _created_by for passado, verificamos se o usuário atual tem permissão para vender em nome de outros
  -- (Super admin, Admin ou Gerente)
  if _created_by is not null and _created_by <> _uid then
    if not (
      public.is_super_admin() or 
      exists (
        select 1 from public.memberships 
        where company_id = _company and user_id = _uid and role in ('admin', 'gerente')
      )
    ) then
      raise exception 'Você não tem permissão para registrar vendas em nome de outro usuário';
    end if;
    _real_creator := _created_by;
  else
    _real_creator := _uid;
  end if;

  for _item in select * from jsonb_array_elements(_items) loop
    _pid := (_item->>'product_id')::uuid;
    _qty := (_item->>'quantity')::numeric;
    _price := (_item->>'unit_price')::numeric;
    if _qty <= 0 then raise exception 'Quantidade inválida'; end if;
    select stock into _stock from public.products where id = _pid and company_id = _company;
    if _stock is null then raise exception 'Produto não encontrado'; end if;
    if _stock < _qty then raise exception 'Estoque insuficiente para o produto %', _pid; end if;
    _subtotal := _subtotal + (_qty * _price);
  end loop;

  _total := greatest(_subtotal - coalesce(_discount,0), 0);

  insert into public.sales (company_id, customer_id, status, subtotal, discount, total,
                            payment_method, due_date, notes, created_by)
  values (_company, _customer, 'concluida'::sale_status, _subtotal, coalesce(_discount,0), _total,
          _payment_method, _due_date, _notes, _real_creator)
  returning id into _sale_id;

  for _item in select * from jsonb_array_elements(_items) loop
    _pid := (_item->>'product_id')::uuid;
    _qty := (_item->>'quantity')::numeric;
    _price := (_item->>'unit_price')::numeric;

    insert into public.sale_items (sale_id, company_id, product_id, quantity, unit_price, total)
    values (_sale_id, _company, _pid, _qty, _price, _qty * _price);

    insert into public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
    values (_company, _pid, 'saida'::movement_type, _qty, 'Venda #' || _sale_id::text, _real_creator);
  end loop;

  if _total > 0 then
    -- Determina se a forma de pagamento é à vista
    select requires_due_date into _pm_requires_due
      from public.payment_methods
     where company_id = _company
       and lower(name) = lower(_payment_method)
     limit 1;

    if _pm_requires_due is not null then
      _is_paid := not _pm_requires_due;
    else
      -- Fallback para nomes legados
      _is_paid := lower(_payment_method) in ('dinheiro','pix','debito','débito','credito','crédito','cartão','cartao');
    end if;

    insert into public.payables (company_id, direction, partner_id, sale_id, description,
                                 amount, due_date, status, payment_method, paid_at, created_by)
    values (_company, 'receber'::payable_direction, _customer, _sale_id,
            'Venda #' || _sale_id::text, _total,
            coalesce(_due_date, current_date),
            (case when _is_paid then 'pago' else 'aberto' end)::payable_status,
            _payment_method,
            (case when _is_paid then current_date else null end),
            _real_creator);
  end if;

  return _sale_id;
end; $function$;
