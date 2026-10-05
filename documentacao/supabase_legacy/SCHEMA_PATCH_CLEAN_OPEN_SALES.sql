-- ============================================================
-- LIMPEZA DE VENDAS NÃO FINALIZADAS (carrinhos órfãos) E
-- TRANSAÇÕES DE CAIXA RELACIONADAS
--
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/_/sql/new
-- ============================================================

BEGIN;

-- 1) Remover transações de caixa vinculadas a vendas que NÃO foram concluídas
DELETE FROM public.cash_transactions
 WHERE category = 'SALE'
   AND reference_id IN (
     SELECT id FROM public.sales WHERE status <> 'concluida'
   );

-- 2) Remover entregas vinculadas a vendas não concluídas
DELETE FROM public.delivery_orders
 WHERE sale_id IN (SELECT id FROM public.sales WHERE status <> 'concluida');

-- 3) Desvincular conciliações bancárias antes de apagar payables órfãos
UPDATE public.bank_transactions
   SET matched_payable_id = NULL, reconciled = false
 WHERE matched_payable_id IN (
   SELECT id FROM public.payables
    WHERE sale_id IN (SELECT id FROM public.sales WHERE status <> 'concluida')
 );

-- 4) Remover recebíveis/contas vinculados a vendas não concluídas
DELETE FROM public.payables
 WHERE sale_id IN (SELECT id FROM public.sales WHERE status <> 'concluida');

-- 5) Estornar estoque dos itens dessas vendas (devolver ao estoque)
INSERT INTO public.stock_movements (company_id, product_id, type, quantity, reason, created_by)
SELECT si.company_id,
       si.product_id,
       'entrada'::movement_type,
       si.quantity,
       'Estorno de carrinho órfão (limpeza) #' || si.sale_id::text,
       NULL
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
 WHERE s.status <> 'concluida';

-- 6) Apagar itens das vendas não concluídas
DELETE FROM public.sale_items
 WHERE sale_id IN (SELECT id FROM public.sales WHERE status <> 'concluida');

-- 7) Apagar as vendas não concluídas (aberta, cancelada, rascunho, etc.)
DELETE FROM public.sales
 WHERE status <> 'concluida';

COMMIT;

-- ============================================================
-- Conferência (opcional)
-- ============================================================
-- SELECT status, count(*) FROM public.sales GROUP BY status;
-- SELECT count(*) FROM public.cash_transactions;
