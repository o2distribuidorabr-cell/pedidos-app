-- ============================================================
-- update_store_payment_methods.sql
-- Estende store_payment_methods para suportar os 4 métodos
-- específicos de pagamento por loja e adiciona fee_percent
-- para acréscimo percentual (ex: 4,25% no cartão online).
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. Remove a constraint CHECK antiga sobre payment_method
--    (o nome gerado automaticamente pelo Postgres é
--    store_payment_methods_payment_method_check).
-- ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT constraint_name INTO v_constraint
  FROM information_schema.table_constraints
  WHERE table_name       = 'store_payment_methods'
    AND table_schema     = 'public'
    AND constraint_type  = 'CHECK'
    AND constraint_name  LIKE '%payment_method%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE store_payment_methods DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 2. Adiciona nova constraint com os métodos estendidos
-- ──────────────────────────────────────────────────────────
ALTER TABLE store_payment_methods
  ADD CONSTRAINT store_payment_methods_payment_method_check
  CHECK (payment_method IN (
    'PIX',
    'PIX_1D',
    'PIX_7D',
    'CREDIT_CARD',
    'CREDIT_CARD_ONLINE',
    'BOLETO',
    'CREDIT_PREPAGO'
  ));

-- ──────────────────────────────────────────────────────────
-- 3. Coluna fee_percent
--    Percentual de acréscimo cobrado ao usar este método
--    (ex: 4.25 para +4,25% no cartão de crédito online).
--    Padrão 0 = sem acréscimo.
-- ──────────────────────────────────────────────────────────
ALTER TABLE store_payment_methods
  ADD COLUMN IF NOT EXISTS fee_percent numeric NOT NULL DEFAULT 0;

-- ──────────────────────────────────────────────────────────
-- 4. RLS — permite que usuários autenticados (admins)
--    gerenciem os métodos de pagamento.
--    A policy de leitura para franqueados já existe;
--    aqui adicionamos a policy de escrita para admins.
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'store_payment_methods'
      AND policyname = 'admin_manage_payment_methods'
  ) THEN
    CREATE POLICY admin_manage_payment_methods
      ON store_payment_methods
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
