-- ============================================================
-- Controle de estoque centralizado O2
-- ============================================================

-- Entradas de estoque (compras de fornecedores)
CREATE TABLE IF NOT EXISTS public.stock_entries (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID          NOT NULL REFERENCES public.products(id),
    quantity     NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
    unit_cost    NUMERIC(14,4) NOT NULL CHECK (unit_cost >= 0),   -- custo unitário da NF
    nf_key       TEXT,                                             -- chave NF-e 44 dígitos
    nf_number    TEXT,
    supplier_name TEXT,
    entry_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
    notes        TEXT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by   UUID          REFERENCES auth.users(id)
);

-- Movimentos de estoque (ledger completo)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID          NOT NULL REFERENCES public.products(id),
    movement_type   TEXT          NOT NULL CHECK (movement_type IN ('ENTRY', 'ORDER_DEDUCTION', 'INVENTORY_ADJUSTMENT')),
    quantity        NUMERIC(14,4) NOT NULL,    -- positivo = entrada, negativo = saída
    unit_cost       NUMERIC(14,4),             -- custo médio ponderado no momento
    unit_revenue    NUMERIC(14,4),             -- preço de venda (apenas ORDER_DEDUCTION)
    order_id        UUID          REFERENCES public.orders(id),
    entry_id        UUID          REFERENCES public.stock_entries(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    created_by      UUID          REFERENCES auth.users(id)
);

-- Inventários (sessões de contagem física)
CREATE TABLE IF NOT EXISTS public.stock_inventories (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title      TEXT        NOT NULL,
    status     TEXT        NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
    opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at  TIMESTAMPTZ,
    closed_by  UUID        REFERENCES auth.users(id),
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Itens do inventário (contagens por produto)
CREATE TABLE IF NOT EXISTS public.stock_inventory_items (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id  UUID          NOT NULL REFERENCES public.stock_inventories(id) ON DELETE CASCADE,
    product_id    UUID          NOT NULL REFERENCES public.products(id),
    system_qty    NUMERIC(14,4) NOT NULL DEFAULT 0,   -- saldo do sistema na abertura
    counted_qty   NUMERIC(14,4),                       -- contagem física
    unit_cost     NUMERIC(14,4),                       -- custo médio na abertura
    notes         TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE(inventory_id, product_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_stock_movements_product  ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order    ON public.stock_movements(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type     ON public.stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_entries_product    ON public.stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_inventory_items_inv ON public.stock_inventory_items(inventory_id);

-- ============================================================
-- View: saldo atual + custo médio por produto
-- ============================================================
CREATE OR REPLACE VIEW public.v_stock_balance AS
SELECT
    p.id           AS product_id,
    p.sku,
    p.name,
    p.unit,
    COALESCE(SUM(m.quantity), 0)::NUMERIC(14,4)                         AS current_qty,
    CASE
        WHEN COALESCE(SUM(CASE WHEN m.movement_type = 'ENTRY' THEN m.quantity ELSE 0 END), 0) > 0
        THEN ROUND(
            COALESCE(SUM(CASE WHEN m.movement_type = 'ENTRY' THEN m.quantity * m.unit_cost ELSE 0 END), 0)
            / NULLIF(SUM(CASE WHEN m.movement_type = 'ENTRY' THEN m.quantity ELSE 0 END), 0),
            4
        )
        ELSE 0
    END::NUMERIC(14,4)                                                  AS avg_cost,
    p.unit_price                                                        AS selling_price
FROM public.products p
LEFT JOIN public.stock_movements m ON m.product_id = p.id
GROUP BY p.id, p.sku, p.name, p.unit, p.unit_price;

-- ============================================================
-- View: margem de lucro por produto
-- ============================================================
CREATE OR REPLACE VIEW public.v_stock_margin AS
SELECT
    p.id   AS product_id,
    p.sku,
    p.name,
    p.unit,
    COALESCE(SUM(CASE WHEN m.movement_type = 'ORDER_DEDUCTION' THEN ABS(m.quantity)                          ELSE 0 END), 0)::NUMERIC(14,4) AS qty_sold,
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
GROUP BY p.id, p.sku, p.name, p.unit;

-- ============================================================
-- Permissão can_stock na tabela admin_permissions
-- ============================================================
ALTER TABLE public.admin_permissions
    ADD COLUMN IF NOT EXISTS can_stock BOOLEAN NOT NULL DEFAULT FALSE;
