-- ============================================================
-- enable_rls_stock_tables.sql
-- Corrige alerta do Supabase Security Advisor: as tabelas de
-- estoque foram criadas em add_stock_management.sql sem RLS,
-- expondo leitura/escrita/exclusão públicas via anon key.
-- ============================================================

ALTER TABLE public.stock_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_inventories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_inventory_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_entries', 'stock_movements', 'stock_inventories', 'stock_inventory_items']
  LOOP
    -- Backend (rotas /api/estoque/*) usa a service role key: acesso total
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t
      );
    END IF;

    -- Front-end (páginas /adm/estoque/*) usa a anon key autenticada:
    -- só admins com a permissão can_stock podem ler/gravar.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'admin_can_stock'
    ) THEN
      EXECUTE format(
        'CREATE POLICY admin_can_stock ON public.%I FOR ALL TO authenticated USING (
           EXISTS (
             SELECT 1 FROM public.profiles p
             JOIN public.admin_permissions ap ON ap.user_id = p.id
             WHERE p.id = auth.uid() AND p.is_admin = true AND ap.can_stock = true
           )
         ) WITH CHECK (
           EXISTS (
             SELECT 1 FROM public.profiles p
             JOIN public.admin_permissions ap ON ap.user_id = p.id
             WHERE p.id = auth.uid() AND p.is_admin = true AND ap.can_stock = true
           )
         )',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Views derivadas: por padrão rodam com o privilégio do dono
-- (ignorando RLS de quem consulta). security_invoker faz a view
-- respeitar as policies acima quando chamada pelo front-end.
-- ============================================================
ALTER VIEW public.v_stock_balance SET (security_invoker = true);
ALTER VIEW public.v_stock_margin  SET (security_invoker = true);
