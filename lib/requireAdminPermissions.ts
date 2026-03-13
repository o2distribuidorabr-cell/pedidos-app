import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { supabase } from "@/lib/supabaseClient";
import type { AdminPermissions } from "@/lib/adminPermissions";

export async function requireAdminPermission(
  router: AppRouterInstance,
  permission: keyof AdminPermissions
): Promise<boolean> {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    router.replace("/login");
    return false;
  }

  const userId = authData.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || !profile.is_admin) {
    router.replace("/login");
    return false;
  }

  const { data, error: permissionError } = await supabase
    .from("admin_permissions")
    .select(`
      can_dashboard,
      can_orders,
      can_expedition,
      can_separation_map,
      can_fiscal_issue,
      can_fiscal_products,
      can_fiscal_rules,
      can_registrations,
      can_users,
      can_stores,
      can_products,
      can_emitters,
      can_financial,
      can_credit
    `)
    .eq("user_id", userId)
    .maybeSingle();

  if (permissionError) {
    router.replace("/adm/sem-acesso");
    return false;
  }

  const permissions = data as Partial<AdminPermissions> | null;
  const allowed = Boolean(permissions?.[permission]);

  if (!allowed) {
    router.replace("/adm/sem-acesso");
    return false;
  }

  return true;
}