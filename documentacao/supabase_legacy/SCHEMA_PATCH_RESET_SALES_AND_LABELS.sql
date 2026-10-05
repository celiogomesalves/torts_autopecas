-- ============================================================
-- EXECUTE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE
-- https://supabase.com/dashboard/project/oapfhdcvugcileuxumpb/sql/new
-- ============================================================


-- ============================================================
-- 1) Adicionar coluna para salvar modelos de etiquetas
--    (resolve a perda dos modelos personalizados)
-- ============================================================
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS barcode_label_config JSONB DEFAULT '{}'::jsonb;


-- ============================================================
-- 2) Resetar TODAS as vendas
--    Inclui: itens, recebíveis, entregas, transações de caixa
--    órfãs e movimentos de estoque relacionados a vendas.
-- ============================================================
BEGIN;

-- Desvincular conciliações bancárias antes de apagar payables
UPDATE public.bank_transactions
   SET matched_payable_id = NULL, reconciled = false
 WHERE matched_payable_id IN (
   SELECT id FROM public.payables WHERE sale_id IS NOT NULL
 );

-- Remover transações de caixa originadas de vendas (inclui órfãs)
DELETE FROM public.cash_transactions
 WHERE sale_id IS NOT NULL
    OR reason ILIKE '%venda%'
    OR reason ILIKE '%sale%'
    OR description ILIKE '%venda%'
    OR description ILIKE '%sale%';

-- Remover entregas, recebíveis e itens
DELETE FROM public.delivery_orders WHERE sale_id IS NOT NULL;
DELETE FROM public.payables        WHERE sale_id IS NOT NULL;
DELETE FROM public.sale_items;

-- Remover movimentos de estoque gerados por vendas
DELETE FROM public.stock_movements
 WHERE reason ILIKE 'Venda #%'
    OR reason ILIKE 'Estorno de venda%';

-- Remover as vendas
DELETE FROM public.sales;

COMMIT;


-- ============================================================
-- 3) Fechar / remover TODOS os caixas abertos
-- ============================================================
BEGIN;

-- Apaga transações dos caixas que ainda estão abertos
DELETE FROM public.cash_transactions
 WHERE cash_register_id IN (
   SELECT id FROM public.cash_registers WHERE status = 'aberto' OR status = 'OPEN'
 );

DELETE FROM public.cash_registers
 WHERE status = 'aberto' OR status = 'OPEN';

COMMIT;


-- ============================================================
-- VERIFICAÇÕES (opcional, rode depois para conferir)
-- ============================================================
-- SELECT count(*) AS vendas_restantes FROM public.sales;
-- SELECT count(*) AS caixas_abertos FROM public.cash_registers WHERE status IN ('aberto','OPEN');
-- SELECT count(*) AS transacoes_caixa FROM public.cash_transactions;
