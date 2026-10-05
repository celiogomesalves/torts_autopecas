-- COPIE E COLE este SQL no SQL Editor do Supabase
-- Restringe a exclusão de vendas EXCLUSIVAMENTE ao super administrador.
-- Restaura estoque, remove transações de caixa, payables, delivery e itens.

CREATE OR REPLACE FUNCTION public.delete_sale(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid := auth.uid();
  v_item RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Apenas super admin pode excluir vendas
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o super administrador pode excluir vendas';
  END IF;

  SELECT company_id INTO v_company_id FROM public.sales WHERE id = _sale_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Venda não encontrada'; END IF;

  -- Restaurar estoque (entrada de estorno) para cada item
  FOR v_item IN SELECT product_id, quantity, company_id FROM public.sale_items WHERE sale_id = _sale_id LOOP
    INSERT INTO public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
    VALUES (v_item.company_id, v_item.product_id, 'entrada', v_item.quantity,
            'Estorno de venda excluída pelo super admin (' || _sale_id::text || ')', v_uid);
  END LOOP;

  -- Limpar conciliações bancárias vinculadas
  UPDATE public.bank_transactions
     SET matched_payable_id = NULL, reconciled = false
   WHERE matched_payable_id IN (SELECT id FROM public.payables WHERE sale_id = _sale_id);

  -- Remover transações de caixa, delivery, financeiro, itens e a venda
  DELETE FROM public.cash_transactions WHERE reference_id = _sale_id;
  DELETE FROM public.delivery_orders WHERE sale_id = _sale_id;
  DELETE FROM public.payables WHERE sale_id = _sale_id;
  DELETE FROM public.sale_items WHERE sale_id = _sale_id;
  DELETE FROM public.sales WHERE id = _sale_id;
END; $$;

-- RLS: somente super admin pode deletar vendas diretamente
DROP POLICY IF EXISTS sales_delete_members ON public.sales;
DROP POLICY IF EXISTS sales_delete_super_admin ON public.sales;
CREATE POLICY sales_delete_super_admin ON public.sales
  FOR DELETE TO authenticated
  USING (public.is_super_admin());
