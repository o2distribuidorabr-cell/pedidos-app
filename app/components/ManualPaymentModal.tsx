"use client";

import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  /** true = marcando como pago; false = desfazendo o pagamento */
  markingPaid: boolean;
  busy: boolean;
  error: string;
  onConfirm: (password: string) => void;
  onCancel: () => void;
};

export default function ManualPaymentModal({ open, markingPaid, busy, error, onConfirm, onCancel }: Props) {
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) setPassword("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <form
        className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (password && !busy) onConfirm(password);
        }}
      >
        <div className="text-base font-semibold text-slate-900">
          {markingPaid ? "Confirmar baixa manual" : "Desfazer pagamento"}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {markingPaid
            ? "Este pedido será marcado como pago manualmente. Digite a sua senha de login para confirmar."
            : "Este pedido voltará a ficar como não pago. Digite a sua senha de login para confirmar."}
        </div>

        <input
          type="password"
          autoFocus
          autoComplete="off"
          placeholder="Sua senha de login"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="mt-4 h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-300"
        />

        {error ? <div className="mt-2 text-sm font-medium text-red-600">{error}</div> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            className="inline-flex h-11 items-center justify-center rounded-[18px] bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Confirmando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}
