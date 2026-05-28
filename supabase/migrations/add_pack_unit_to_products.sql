-- Migration: adiciona campo pack_unit na tabela products
-- Execute este SQL no Supabase > SQL Editor

alter table public.products
  add column if not exists pack_unit text default 'cx';
