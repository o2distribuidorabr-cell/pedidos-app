"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  RESET_PASSWORD_PATH,
  clearPasswordResetPending,
  isPasswordResetPending,
  markPasswordResetPending,
} from "@/lib/passwordRecovery";

/**
 * O link de "Esqueci minha senha" já deixa o usuário logado. Este guard impede
 * que ele use o portal sem antes definir a nova senha: enquanto a marca de
 * "redefinição pendente" existir, qualquer tela leva de volta a /login/resetar-senha.
 */
export default function PasswordRecoveryGuard() {
  const router = useRouter();
  const pathname = usePathname();

  // Link de recuperação aberto em qualquer página (ex.: redirecionado para a raiz).
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("type") === "recovery") markPasswordResetPending();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        markPasswordResetPending();
        router.replace(RESET_PASSWORD_PATH);
      }
      if (event === "SIGNED_OUT") clearPasswordResetPending();
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  // A cada troca de tela: pendente e fora da tela de redefinição → volta para ela.
  useEffect(() => {
    if (pathname !== RESET_PASSWORD_PATH && isPasswordResetPending()) {
      router.replace(RESET_PASSWORD_PATH);
    }
  }, [pathname, router]);

  return null;
}
