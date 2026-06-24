-- ============================================================
-- add_reverse_order_credit.sql
-- Função para estornar crédito aplicado em pedidos.
-- Execute no SQL Editor do Supabase antes de usar a página
-- de estorno em /adm/credito/estorno.
-- ============================================================

CREATE OR REPLACE FUNCTION reverse_orders_credit(
  p_order_ids uuid[],
  p_note      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT id, store_id, credit_applied, payment_method
    FROM orders
    WHERE id = ANY(p_order_ids)
      AND credit_applied IS NOT NULL
      AND credit_applied > 0
  LOOP
    -- Devolve o crédito ao ledger como entrada positiva
    INSERT INTO store_credit_ledger (store_id, amount, note, created_by)
    VALUES (
      v_row.store_id,
      v_row.credit_applied,
      COALESCE(p_note, 'Estorno de crédito — pedido ' || v_row.id::text),
      auth.uid()
    );

    -- Se o pedido foi pago 100% por crédito: volta ao status não pago
    IF v_row.payment_method = 'PREPAGO' THEN
      UPDATE orders
      SET
        credit_applied = 0,
        is_paid        = false,
        paid_at        = NULL,
        payment_method = NULL
      WHERE id = v_row.id;
    ELSE
      -- Pagamento parcial: mantém status, apenas zera o crédito
      UPDATE orders
      SET credit_applied = 0
      WHERE id = v_row.id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION reverse_orders_credit(uuid[], text) TO authenticated;
