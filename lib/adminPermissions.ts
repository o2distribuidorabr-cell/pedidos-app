export type AdminPermissions = {
  can_dashboard: boolean;
  can_orders: boolean;
  can_expedition: boolean;
  can_separation_map: boolean;
  can_fiscal_issue: boolean;
  can_fiscal_products: boolean;
  can_fiscal_rules: boolean;
  can_registrations: boolean;
  can_users: boolean;
  can_stores: boolean;
  can_products: boolean;
  can_emitters: boolean;
  can_financial: boolean;
  can_credit: boolean;
  can_stock: boolean;
};

export const EMPTY_ADMIN_PERMISSIONS: AdminPermissions = {
  can_dashboard: false,
  can_orders: false,
  can_expedition: false,
  can_separation_map: false,
  can_fiscal_issue: false,
  can_fiscal_products: false,
  can_fiscal_rules: false,
  can_registrations: false,
  can_users: false,
  can_stores: false,
  can_products: false,
  can_emitters: false,
  can_financial: false,
  can_credit: false,
  can_stock: false,
};

export const FULL_ADMIN_PERMISSIONS: AdminPermissions = {
  can_dashboard: true,
  can_orders: true,
  can_expedition: true,
  can_separation_map: true,
  can_fiscal_issue: true,
  can_fiscal_products: true,
  can_fiscal_rules: true,
  can_registrations: true,
  can_users: true,
  can_stores: true,
  can_products: true,
  can_emitters: true,
  can_financial: true,
  can_credit: true,
  can_stock: true,
};

export const ADMIN_PERMISSION_FIELDS: Array<{
  key: keyof AdminPermissions;
  label: string;
  group: string;
}> = [
  { key: "can_dashboard", label: "Dashboard", group: "Geral" },
  { key: "can_orders", label: "Pedidos", group: "Operação" },
  { key: "can_expedition", label: "Expedição", group: "Operação" },
  { key: "can_separation_map", label: "Mapa de separação", group: "Operação" },
  { key: "can_fiscal_issue", label: "Emissão fiscal", group: "Fiscal" },
  { key: "can_fiscal_products", label: "Fiscal de produtos", group: "Fiscal" },
  { key: "can_fiscal_rules", label: "Regras fiscais", group: "Fiscal" },
  { key: "can_registrations", label: "Cadastros", group: "Cadastros" },
  { key: "can_users", label: "Usuários", group: "Cadastros" },
  { key: "can_stores", label: "Lojas", group: "Cadastros" },
  { key: "can_products", label: "Produtos", group: "Cadastros" },
  { key: "can_emitters", label: "Emitentes", group: "Cadastros" },
  { key: "can_financial", label: "Financeiro", group: "Financeiro" },
  { key: "can_credit", label: "Extrato de crédito", group: "Financeiro" },
  { key: "can_stock", label: "Estoque", group: "Estoque" },
];

export function clonePermissions(source?: Partial<AdminPermissions> | null): AdminPermissions {
  return {
    ...EMPTY_ADMIN_PERMISSIONS,
    ...(source || {}),
  };
}