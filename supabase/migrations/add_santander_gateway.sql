-- add_santander_gateway.sql
--
-- A tabela order_payments tem um CHECK que só aceitava gateway 'MP' e 'ASAAS'.
-- Com a troca do provedor PIX para o Santander, o portal (tela do cliente),
-- o webhook (app/api/santander/webhook) e a conciliação
-- (app/api/santander/reconcile) precisam gravar registros com
-- gateway = 'SANTANDER' — é o que faz a coluna "Plataforma" no Financeiro
-- mostrar Santander em vez do último recibo antigo (Asaas).
--
-- Rodar UMA vez no editor SQL do Supabase. Idempotente: pode rodar de novo
-- sem efeito colateral.
--
-- Enquanto esta migration não roda, os pagamentos do Santander CONTINUAM
-- sendo confirmados normalmente (is_paid) — só o rótulo da plataforma fica
-- desatualizado, porque a gravação do recibo é best-effort no código.

ALTER TABLE public.order_payments
  DROP CONSTRAINT IF EXISTS order_payments_gateway_check;

ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_gateway_check
  CHECK (gateway IN ('MP', 'ASAAS', 'SANTANDER'));
