-- fix_trigger_saiu_para_entrega_inclui_entregue.sql
--
-- Corrige a lacuna do gatilho add_trigger_saiu_para_entrega.sql: ele só
-- dispara o envio da nota pro ab-portal quando o pedido passa por
-- 'SAIU_PARA_ENTREGA'. Desde ~19/08/2026 a frota parou de usar esse status
-- intermediário — os pedidos vão direto de 'RECEBIDO' pra 'ENTREGUE' (venda
-- FRETE fechada de uma vez na Expedição, retirada confirmada, corrida
-- Lalamove que só emite o evento de conclusão). Resultado: o gatilho nunca
-- disparava e nenhuma nota chegava no portal do franqueado — falha silenciosa
-- pra TODAS as lojas, não só a que reclamou.
--
-- Agora dispara em DOIS momentos:
--   1. transição -> 'SAIU_PARA_ENTREGA'  (comportamento original)
--   2. transição -> 'ENTREGUE' SEM ter passado por 'SAIU_PARA_ENTREGA'
--      (a terceira condição evita reenviar a nota do pedido que já disparou
--      pelo caminho 1 quando ele depois vira 'ENTREGUE')
--
-- Reenvio nunca duplica: a chave de acesso do XML é determinística por
-- pedido (lib/enviarNotaPortal.ts) e o ab-portal ainda trava por número+série
-- (lib/financeiro/xmlImportServer.ts). Um disparo a mais é, no pior caso, uma
-- chamada HTTP desperdiçada que volta "DUPLICADO".
--
-- Continua tudo assíncrono via pg_net — não trava a transação do pedido.

create extension if not exists pg_net;

create or replace function public.notify_saiu_para_entrega()
returns trigger
language plpgsql
security definer
as $$
begin
  if (
       new.logistic_status = 'SAIU_PARA_ENTREGA'
       and old.logistic_status is distinct from 'SAIU_PARA_ENTREGA'
     )
     or (
       new.logistic_status = 'ENTREGUE'
       and old.logistic_status is distinct from 'ENTREGUE'
       and old.logistic_status is distinct from 'SAIU_PARA_ENTREGA'
     )
  then
    perform net.http_post(
      url := 'https://o2pedidos.netlify.app/api/orders/' || new.id || '/enviar-nota-portal',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer 7af1406be25d18a181637dbc5ad21673854a8292a9acdb06'
      ),
      body := '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_saiu_para_entrega on public.orders;
create trigger trg_saiu_para_entrega
  after update on public.orders
  for each row
  execute function public.notify_saiu_para_entrega();
