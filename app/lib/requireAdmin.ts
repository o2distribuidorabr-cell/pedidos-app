import { supabase } from "@/lib/supabaseClient";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export async function requireAdminOrRedirect(router: AppRouterInstance) {
  // pega usuário logado
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    router.replace("/login");
    return false;
  }

  // busca role no profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, approved")
    .eq("id", auth.user.id)
    .maybeSingle();

  // não é admin -> bloqueia
  if (!profile || profile.role !== "admin" || !profile.approved) {
    router.replace("/pedidos");
    return false;
  }

  return true;
}