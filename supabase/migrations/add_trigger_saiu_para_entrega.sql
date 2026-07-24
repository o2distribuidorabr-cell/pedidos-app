-- add_trigger_saiu_para_entrega.sql
--
-- Dispara o envio automático da nota fiscal (XML) pro ab-portal quando um
-- pedido muda para "saiu para entrega" — pega qualquer caminho que altere
-- orders.logistic_status (botão manual em Expedição, sincronização
-- automática com a Lalamove em app/adm/logistica/[id]), sem precisar
-- duplicar a chamada em cada lugar que muda esse status hoje ou no futuro.
--
-- O trigger só dispara a chamada HTTP (pg_net, assíncrono — não trava a
-- transação); quem realmente monta o XML e envia é a rota
-- app/api/orders/[id]/enviar-nota-portal, protegida pelo mesmo segredo.

create extension if not exists pg_net;

create or replace function public.notify_saiu_para_entrega()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.logistic_status = 'SAIU_PARA_ENTREGA'
     and (old.logistic_status is distinct from new.logistic_status) then
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
