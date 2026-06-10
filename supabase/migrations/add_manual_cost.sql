-- Custo manual por produto (usado como fallback quando não há entradas registradas)
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS manual_cost NUMERIC(14,4);

-- Recria v_stock_balance com manual_cost como fallback do avg_cost
DROP VIEW IF EXISTS public.v_stock_balance;
CREATE VIEW public.v_stock_balance AS
SELECT
    p.id           AS product_id,
    p.sku,
    p.name,
    p.unit,
    p.track_stock,
    p.manual_cost,
    COALESCE(SUM(m.quantity), 0)::NUMERIC(14,4)  AS current_qty,
    -- has_entries: indica se já existem movimentos de entrada
    COALESCE(SUM(CASE WHEN m.movement_type = 'ENTRY' THEN m.quantity ELSE 0 END), 0) > 0 AS has_entries,
    -- avg_cost: preço médio das entradas se existirem, senão usa manual_cost
    CASE
        WHEN COALESCE(SUM(CASE WHEN m.movement_type = 'ENTRY' THEN m.quantity ELSE 0 END), 0) > 0
        THEN ROUND(
            COALESCE(SUM(CASE WHEN m.movement_type = 'ENTRY' THEN m.quantity * m.unit_cost ELSE 0 END), 0)
            / NULLIF(SUM(CASE WHEN m.movement_type = 'ENTRY' THEN m.quantity ELSE 0 END), 0),
            4
        )
        ELSE COALESCE(p.manual_cost, 0)
    END::NUMERIC(14,4)  AS avg_cost,
    p.unit_price   AS selling_price
FROM public.products p
LEFT JOIN public.stock_movements m ON m.product_id = p.id
GROUP BY p.id, p.sku, p.name, p.unit, p.track_stock, p.manual_cost, p.unit_price;

-- Recria v_stock_margin (precisa recriar porque depende dos mesmos produtos)
DROP VIEW IF EXISTS public.v_stock_margin;
CREATE VIEW public.v_stock_margin AS
SELECT
    p.id   AS product_id,
    p.sku,
    p.name,
    p.unit,
    p.track_stock,
    COALESCE(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity)                               ELSE 0 END), 0)::NUMERIC(14,4) AS qty_sold,
    COALESCE(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity) * COALESCE(m.unit_cost, 0)    ELSE 0 END), 0)::NUMERIC(14,4) AS total_cost,
    COALESCE(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity) * COALESCE(m.unit_revenue, 0) ELSE 0 END), 0)::NUMERIC(14,4) AS total_revenue,
    CASE
        WHEN COALESCE(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity) * COALESCE(m.unit_revenue, 0) ELSE 0 END), 0) > 0
        THEN ROUND(
            (
                COALESCE(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity) * COALESCE(m.unit_revenue, 0) ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity) * COALESCE(m.unit_cost, 0) ELSE 0 END), 0)
            )
            / NULLIF(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity) * COALESCE(m.unit_revenue, 0) ELSE 0 END), 0)
            * 100,
            2
        )
        ELSE 0
    END::NUMERIC(8,2) AS margin_pct
FROM public.products p
LEFT JOIN public.stock_movements m ON m.product_id = p.id
GROUP BY p.id, p.sku, p.name, p.unit, p.track_stock;
