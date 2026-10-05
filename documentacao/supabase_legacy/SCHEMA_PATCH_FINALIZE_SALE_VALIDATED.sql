-- Recalcula no servidor o subtotal/total da venda e valida contra o
-- valor esperado pelo cliente (somatório dos métodos de pagamento).
-- Bloqueia a finalização em caso de divergência.

CREATE OR REPLACE FUNCTION public.finalize_sale_validated(
  _sale_id uuid,
  _payment_method text,
  _expected_total numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  _uid uuid := auth.uid();
  _company uuid;
  _server_subtotal numeric(14,2) := 0;
  _server_total numeric(14,2);
  _discount numeric(14,2);
  _diff numeric(14,2);
begin
  if _uid is null then raise exception 'Não autenticado'; end if;

  select company_id, coalesce(discount,0)
    into _company, _discount
    from public.sales
   where id = _sale_id;

  if _company is null then raise exception 'Venda não encontrada'; end if;
  if not public.is_member(_company) then
    raise exception 'Sem acesso a esta empresa';
  end if;

  -- Recalcula subtotal a partir dos itens reais no banco
  select coalesce(sum(quantity * unit_price), 0)
    into _server_subtotal
    from public.sale_items
   where sale_id = _sale_id;

  _server_total := greatest(_server_subtotal - _discount, 0);

  -- Tolerância de 1 centavo para arredondamentos
  _diff := abs(_server_total - coalesce(_expected_total, 0));
  if _diff > 0.01 then
    raise exception 'Divergência de valores: total recalculado R$ %, total informado R$ %',
      _server_total, _expected_total;
  end if;

  update public.sales
     set status = 'concluida'::sale_status,
         payment_method = coalesce(_payment_method, payment_method),
         subtotal = _server_subtotal,
         total = _server_total
   where id = _sale_id;

  return _sale_id;
end;
$function$;
