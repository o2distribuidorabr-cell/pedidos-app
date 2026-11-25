// Marca (neste navegador) que o usuário entrou por um link de redefinição de
// senha e ainda NÃO definiu a nova senha. Enquanto a marca existir, o
// PasswordRecoveryGuard leva o usuário de volta à tela "Resetar senha".

export const RESET_PASSWORD_PATH = "/login/resetar-senha";
const KEY = "o2_password_reset_pending";

export function markPasswordResetPending() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // localStorage indisponível: sem a marca, só perde a proteção extra.
  }
}

export function isPasswordResetPending(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPasswordResetPending() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}
