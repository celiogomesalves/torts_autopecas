-- COPIE E COLE este SQL no SQL Editor do Supabase para habilitar
-- cancelamento e reabertura de vendas com estorno garantido de estoque.
--
-- Regras:
--  cancel_sale: marca a venda como 'cancelada', estorna estoque (entrada),
--               cancela payables vinculadas e desvincula bank_transactions.
--               Tudo dentro de uma única transação (atômico).
--  reopen_sale: reabre uma venda cancelada (volta para 'concluida'),
--               descontando o estoque novamente e reativando as payables.
--  delete_sale: ajustado para NÃO estornar duas vezes quando a venda já
--               estiver cancelada.

-- =============== CANCEL SALE ===============
CREATE OR REPLACE FUNCTION public.cancel_sale(_sale uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_status sale_status;
  v_uid uuid := auth.uid();
  v_item RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT company_id, status INTO v_company, v_status
    FROM public.sales WHERE id = _sale FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF NOT public.is_member(v_company) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar esta venda';
  END IF;
  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'Esta venda já está cancelada';
  END IF;

  -- Estorna estoque (entrada) para cada item
  FOR v_item IN
    SELECT product_id, quantity, company_id
      FROM public.sale_items WHERE sale_id = _sale
  LOOP
    INSERT INTO public.stock_movements
      (company_id, product_id, type, quantity, reason, created_by)
    VALUES (v_item.company_id, v_item.product_id, 'entrada'::movement_type,
            v_item.quantity,
            'Estorno de venda cancelada (' || _sale::text || ')', v_uid);
  END LOOP;

  -- Desvincula transações bancárias conciliadas
  UPDATE public.bank_transactions
     SET matched_payable_id = NULL, reconciled = false
   WHERE matched_payable_id IN (SELECT id FROM public.payables WHERE sale_id = _sale);

  -- Cancela payables ligadas à venda
  UPDATE public.payables
     SET status = 'cancelado'::payable_status,
         paid_at = NULL,
         updated_at = now()
   WHERE sale_id = _sale;

  -- Marca venda como cancelada
  UPDATE public.sales
     SET status = 'cancelada'::sale_status
   WHERE id = _sale;

  RETURN _sale;
END; $$;

-- =============== REOPEN SALE ===============
CREATE OR REPLACE FUNCTION public.reopen_sale(_sale uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_status sale_status;
  v_uid uuid := auth.uid();
  v_item RECORD;
  v_stock numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT company_id, status INTO v_company, v_status
    FROM public.sales WHERE id = _sale FOR UPDATE;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;
  IF NOT public.is_member(v_company) THEN
    RAISE EXCEPTION 'Sem permissão para reabrir esta venda';
  END IF;
  IF v_status <> 'cancelada' THEN
    RAISE EXCEPTION 'Apenas vendas canceladas podem ser reabertas';
  END IF;

  -- Verifica estoque disponível antes de reabrir
  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = _sale
  LOOP
    SELECT stock INTO v_stock FROM public.products
     WHERE id = v_item.product_id AND company_id = v_company;
    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Produto da venda não existe mais';
    END IF;
    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente para reabrir a venda (produto %)', v_item.product_id;
    END IF;
  END LOOP;

  -- Reaplica saída de estoque
  FOR v_item IN
    SELECT product_id, quantity, company_id FROM public.sale_items WHERE sale_id = _sale
  LOOP
    INSERT INTO public.stock_movements
      (company_id, product_id, type, quantity, reason, created_by)
    VALUES (v_item.company_id, v_item.product_id, 'saida'::movement_type,
            v_item.quantity,
            'Reabertura de venda (' || _sale::text || ')', v_uid);
  END LOOP;

  -- Reativa payables que foram canceladas pelo cancel_sale
  UPDATE public.payables
     SET status = 'aberto'::payable_status,
         updated_at = now()
   WHERE sale_id = _sale AND status = 'cancelado'::payable_status;

  UPDATE public.sales
     SET status = 'concluida'::sale_status
   WHERE id = _sale;

  RETURN _sale;
END; $$;

-- =============== DELETE SALE (ajuste) ===============
-- Se a venda já foi cancelada (estoque já estornado), NÃO estornar novamente.
CREATE OR REPLACE FUNCTION public.delete_sale(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_status sale_status;
  v_uid uuid := auth.uid();
  v_item RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT company_id, status INTO v_company_id, v_status
    FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;

  IF NOT public.is_member(v_company_id) THEN
    RAISE EXCEPTION 'Sem permissão para excluir esta venda';
  END IF;

  -- Só estorna se a venda ainda não foi cancelada
  IF v_status <> 'cancelada' THEN
    FOR v_item IN SELECT product_id, quantity, company_id FROM public.sale_items WHERE sale_id = _sale_id LOOP
      INSERT INTO public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
      VALUES (v_item.company_id, v_item.product_id, 'entrada', v_item.quantity,
              'Estorno de venda excluída (' || _sale_id::text || ')', v_uid);
    END LOOP;
  END IF;

  UPDATE public.bank_transactions
     SET matched_payable_id = NULL, reconciled = false
   WHERE matched_payable_id IN (SELECT id FROM public.payables WHERE sale_id = _sale_id);

  DELETE FROM public.delivery_orders WHERE sale_id = _sale_id;
  DELETE FROM public.payables WHERE sale_id = _sale_id;
  DELETE FROM public.sale_items WHERE sale_id = _sale_id;
  DELETE FROM public.sales WHERE id = _sale_id;
END; $$;
