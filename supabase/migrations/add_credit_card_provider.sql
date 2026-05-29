-- ============================================================
-- add_credit_card_provider.sql
-- Adiciona campo credit_card_provider à tabela stores.
-- Permite escolher qual gateway processa cartão de crédito
-- por loja: ASAAS (padrão) ou MERCADOPAGO.
-- NÃO altera nada do fluxo PIX.
-- ============================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS credit_card_provider TEXT NOT NULL DEFAULT 'ASAAS';

-- Adiciona restrição de valores válidos se ainda não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stores'
      AND table_schema = 'public'
      AND constraint_name = 'stores_credit_card_provider_check'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_credit_card_provider_check
      CHECK (credit_card_provider IN ('ASAAS', 'MERCADOPAGO'));
  END IF;
END $$;
