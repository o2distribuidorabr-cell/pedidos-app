"use client";

import { supabase } from "@/lib/supabaseClient";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export async function requireAdminOrRedirect(router: AppRouterInstance) {
  // 1) precisa estar logado
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) {
    router.replace("/login");
    return false;
  }

  // 2) precisa ser admin (profiles.role = 'admin' e approved = true)
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, approved")
    .eq("id", user.id)
    .single();

  if (error) {
    router.replace("/login");
    return false;
  }

  const isAdmin = profile?.role === "admin" && profile?.approved === true;

  if (!isAdmin) {
    router.replace("/pedidos");
    return false;
  }

  return true;
}