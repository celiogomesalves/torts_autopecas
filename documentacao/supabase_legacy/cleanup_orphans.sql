-- Remove transações de caixa vinculadas a vendas que não foram concluídas
-- Isso garante que apenas vendas efetivadas apareçam no financeiro e no caixa
DELETE FROM public.cash_transactions
WHERE reference_id IN (
  SELECT id FROM public.sales WHERE status != 'concluida'
);

-- Opcionalmente, se houver transações sem referência mas de categoria SALE, investigue se são órfãs
-- Mas por enquanto vamos focar nas vinculadas a vendas não concluídas.
