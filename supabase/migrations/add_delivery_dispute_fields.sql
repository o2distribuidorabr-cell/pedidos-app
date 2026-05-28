-- Migration: adiciona campos de contestação de entrega na tabela orders
-- Execute este SQL no Supabase > SQL Editor

alter table public.orders
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_dispute_deadline timestamptz,
  add column if not exists delivery_confirmation_status text default 'PENDENTE',
  add column if not exists delivery_disputed_at timestamptz,
  add column if not exists delivery_dispute_reason text,
  add column if not exists delivery_dispute_notes text,
  add column if not exists delivery_resolved_at timestamptz,
  add column if not exists delivery_resolution_notes text;

-- Valores válidos para delivery_confirmation_status:
-- PENDENTE                 — pedido ainda não entregue
-- AGUARDANDO_CONTESTACAO   — entregue, dentro do prazo de 24h
-- CONTESTADA               — franqueado contestou
-- CONFIRMADA_AUTOMATICAMENTE — prazo expirou sem contestação (calculado no frontend)
-- CONFIRMADA_MANUALMENTE   — admin confirmou manualmente
-- RESOLVIDA                — contestação encerrada pelo admin

comment on column public.orders.delivered_at
  is 'Data/hora em que o pedido foi marcado como ENTREGUE';

comment on column public.orders.delivery_dispute_deadline
  is 'Prazo limite (delivered_at + 24h) para o franqueado contestar a entrega';

comment on column public.orders.delivery_confirmation_status
  is 'Status da confirmação da entrega: PENDENTE | AGUARDANDO_CONTESTACAO | CONTESTADA | CONFIRMADA_AUTOMATICAMENTE | CONFIRMADA_MANUALMENTE | RESOLVIDA';

comment on column public.orders.delivery_disputed_at
  is 'Data/hora em que o franqueado registrou a contestação';

comment on column public.orders.delivery_dispute_reason
  is 'Motivo da contestação selecionado pelo franqueado';

comment on column public.orders.delivery_dispute_notes
  is 'Observação livre do franqueado sobre a contestação';

comment on column public.orders.delivery_resolved_at
  is 'Data/hora em que o admin resolveu/encerrou a contestação';

comment on column public.orders.delivery_resolution_notes
  is 'Notas do admin ao resolver a contestação';
