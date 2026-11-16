-- add_protect_integration_paid_orders.sql
--
-- 1) TRAVA: um pedido que foi pago por integração (Asaas PIX, cartão de crédito,
--    Mercado Pago, Santander) NÃO pode mais voltar para "não pago" por quem está
--    logado no navegador (papel authenticated/anon), nem mexendo direto na API.
--    Só passa quem usa a rota do servidor com senha
--    (/api/adm/orders/[id]/manual-payment, que roda como service_role) ou quem
--    mexe direto no banco (editor SQL do Supabase).
--    Os webhooks também rodam como service_role e continuam funcionando.
--
-- 2) HISTÓRICO: tabela order_paid_audit guarda quem mudou is_paid / paid_at
--    fora do servidor (navegador, editor SQL). A rota com senha grava o próprio
--    registro com o e-mail de quem confirmou.
--
-- Rodar UMA vez no editor SQL do Supabase. Idempotente: pode rodar de novo.

CREATE TABLE IF NOT EXISTS public.order_paid_audit (
  id           bigserial PRIMARY KEY,
  order_id     uuid        NOT NULL,
  changed_at   timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL,
  actor        text,
  old_is_paid  boolean,
  new_is_paid  boolean,
  old_paid_at  timestamptz,
  new_paid_at  timestamptz
);

CREATE INDEX IF NOT EXISTS order_paid_audit_order_idx
  ON public.order_paid_audit (order_id, changed_at DESC);

-- Sem policies: só o servidor (service_role) e o editor SQL leem/gravam.
ALTER TABLE public.order_paid_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_orders_paid_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text;
  v_uid    text;
BEGIN
  IF v_claims IS NOT NULL THEN
    v_role := v_claims::jsonb ->> 'role';
    v_uid  := v_claims::jsonb ->> 'sub';
  END IF;

  v_role := coalesce(v_role, nullif(current_setting('request.jwt.claim.role', true), ''), session_user);

  -- Trava: pago por integração -> não pago, fora do servidor
  IF OLD.is_paid IS TRUE
     AND NEW.is_paid IS NOT TRUE
     AND v_role NOT IN ('service_role', 'postgres', 'supabase_admin')
     AND EXISTS (
       SELECT 1
       FROM public.order_payments op
       WHERE op.order_id = OLD.id
         AND upper(coalesce(op.status, '')) IN
             ('RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'APPROVED', 'CONCLUIDA', 'PAID')
     )
  THEN
    RAISE EXCEPTION 'Pedido pago por integracao (Asaas/cartao/PIX). So pode ser desfeito com senha, pela tela do pedido.'
      USING ERRCODE = '42501';
  END IF;

  -- Histórico: qualquer mudança de pagamento que NÃO veio do servidor
  IF (OLD.is_paid IS DISTINCT FROM NEW.is_paid OR OLD.paid_at IS DISTINCT FROM NEW.paid_at)
     AND v_role <> 'service_role'
  THEN
    INSERT INTO public.order_paid_audit
      (order_id, source, actor, old_is_paid, new_is_paid, old_paid_at, new_paid_at)
    VALUES
      (OLD.id, v_role, v_uid, OLD.is_paid, NEW.is_paid, OLD.paid_at, NEW.paid_at);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_orders_paid_status ON public.orders;

CREATE TRIGGER trg_guard_orders_paid_status
  BEFORE UPDATE OF is_paid, paid_at ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_orders_paid_status();
