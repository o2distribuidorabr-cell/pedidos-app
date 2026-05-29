-- ============================================================
-- add_credit_card_payment.sql
-- Adiciona suporte a pagamento por cartão de crédito via Asaas.
-- NÃO altera nenhum campo, tabela ou lógica do fluxo PIX atual.
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. Tabela store_payment_methods
--    Permite configurar quais formas de pagamento cada loja
--    pode usar (multi-método, independente do campo legado
--    stores.default_payment_method).
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_payment_methods (
  id                              bigserial    PRIMARY KEY,
  store_id                        uuid         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  payment_method                  text         NOT NULL
    CHECK (payment_method IN ('PIX', 'CREDIT_CARD', 'BOLETO')),
  enabled                         boolean      NOT NULL DEFAULT true,
  is_default                      boolean      NOT NULL DEFAULT false,
  requires_payment_before_submit  boolean      NOT NULL DEFAULT false,
  created_at                      timestamptz  NOT NULL DEFAULT now(),
  updated_at                      timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (store_id, payment_method)
);

-- Índice para busca eficiente por loja (só métodos habilitados)
CREATE INDEX IF NOT EXISTS idx_spm_store_enabled
  ON store_payment_methods (store_id)
  WHERE enabled = true;

-- ──────────────────────────────────────────────────────────
-- 2. Campo billing_type em order_payments
--    Identifica se o pagamento foi PIX, CREDIT_CARD ou BOLETO.
--    Necessário para que o webhook saiba como tratar a
--    confirmação (cartão submete o pedido; PIX só marca pago).
-- ──────────────────────────────────────────────────────────
ALTER TABLE order_payments
  ADD COLUMN IF NOT EXISTS billing_type text;

-- ──────────────────────────────────────────────────────────
-- 3. RLS — store_payment_methods
-- ──────────────────────────────────────────────────────────
ALTER TABLE store_payment_methods ENABLE ROW LEVEL SECURITY;

-- Franqueados autenticados leem apenas os métodos da sua loja
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'store_payment_methods'
      AND policyname = 'franchisee_read_own_store'
  ) THEN
    CREATE POLICY franchisee_read_own_store
      ON store_payment_methods
      FOR SELECT
      TO authenticated
      USING (
        store_id IN (
          SELECT store_id FROM profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- Service role (backend) tem acesso total
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'store_payment_methods'
      AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY service_role_full_access
      ON store_payment_methods
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
