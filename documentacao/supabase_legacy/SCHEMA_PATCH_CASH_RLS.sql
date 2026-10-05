-- Melhora as políticas RLS para cash_registers, cash_transactions e cash_countings
-- Garante que todas as operações (SELECT, INSERT, UPDATE, DELETE) estejam protegidas por company_id

-- 1. CASH REGISTERS
DROP POLICY IF EXISTS "Users can view their company cash registers" ON cash_registers;
DROP POLICY IF EXISTS "Users can insert cash registers for their company" ON cash_registers;
DROP POLICY IF EXISTS "Users can update their company cash registers" ON cash_registers;
DROP POLICY IF EXISTS "Users can delete their company cash registers" ON cash_registers;

CREATE POLICY "Acesso por empresa - Registers" ON cash_registers
FOR ALL USING (
    company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid())
) WITH CHECK (
    company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid())
);

-- 2. CASH TRANSACTIONS
DROP POLICY IF EXISTS "Users can view their company cash transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Users can insert cash transactions for their company" ON cash_transactions;
DROP POLICY IF EXISTS "Users can update their company cash transactions" ON cash_transactions;
DROP POLICY IF EXISTS "Users can delete their company cash transactions" ON cash_transactions;

CREATE POLICY "Acesso por empresa - Transactions" ON cash_transactions
FOR ALL USING (
    company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid())
) WITH CHECK (
    company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid())
);

-- 3. CASH COUNTINGS
DROP POLICY IF EXISTS "Users can view their company cash countings" ON cash_countings;
DROP POLICY IF EXISTS "Users can insert cash countings for their company" ON cash_countings;
DROP POLICY IF EXISTS "Users can update their company cash countings" ON cash_countings;
DROP POLICY IF EXISTS "Users can delete their company cash countings" ON cash_countings;

CREATE POLICY "Acesso por empresa - Countings" ON cash_countings
FOR ALL USING (
    company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid())
) WITH CHECK (
    company_id IN (SELECT company_id FROM memberships WHERE user_id = auth.uid())
);
