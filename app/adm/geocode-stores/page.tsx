"use client";

import { useState } from "react";

type StoreResult = {
  id: string;
  name: string | null;
  status: "ok" | "failed";
  lat?: number;
  lng?: number;
  usedQuery?: string;
  error?: string;
};

type GeoResult = {
  ok: boolean;
  message: string;
  total: number;
  success: number;
  failed: number;
  results: StoreResult[];
};

type PendingResult = {
  ok: boolean;
  pending: number;
  stores: Array<{
    id: string;
    name: string | null;
    city: string | null;
    state: string | null;
  }>;
};

export default function GeocodeStoresPage() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<GeoResult | null>(null);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck() {
    setChecking(true);
    setError(null);
    setPending(null);

    try {
      const response = await fetch("/api/admin/geocode-stores", {
        method: "GET",
      });
      const data = await response.json();
      setPending(data);
    } catch (err) {
      setError("Erro ao verificar lojas.");
    } finally {
      setChecking(false);
    }
  }

  async function handleGeocode() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/geocode-stores", {
        method: "POST",
      });
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError("Erro ao executar geocodificação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">
          Geocodificação automática de lojas
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Busca automaticamente a latitude e longitude de todas as lojas que ainda
          não têm coordenadas cadastradas, usando o endereço salvo no banco.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checking || loading}
            className="inline-flex h-11 items-center justify-center rounded-[18px] border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? "Verificando..." : "Verificar lojas sem coordenadas"}
          </button>

          <button
            type="button"
            onClick={handleGeocode}
            disabled={loading || checking}
            className="inline-flex h-11 items-center justify-center rounded-[18px] bg-cyan-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Processando... aguarde" : "Preencher coordenadas automaticamente"}
          </button>
        </div>

        {loading ? (
          <div className="mt-4 rounded-[18px] border border-cyan-100 bg-cyan-50 p-4 text-sm text-cyan-800">
            Processando lojas... isso pode levar até 30 segundos. Não feche esta página.
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {pending ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-base font-semibold text-slate-900">
            {pending.pending === 0
              ? "✅ Todas as lojas já têm coordenadas!"
              : `${pending.pending} loja(s) ainda sem coordenadas`}
          </div>

          {pending.stores.length > 0 ? (
            <div className="mt-4 space-y-2">
              {pending.stores.map((store) => (
                <div
                  key={store.id}
                  className="rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700"
                >
                  <span className="font-semibold text-slate-900">{store.name || "Sem nome"}</span>
                  {" — "}
                  {[store.city, store.state].filter(Boolean).join(", ") || "Cidade não informada"}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-base font-semibold text-slate-900">{result.message}</div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{result.total}</div>
            </div>
            <div className="rounded-[18px] border border-green-100 bg-green-50 p-3 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-green-600">Sucesso</div>
              <div className="mt-1 text-2xl font-semibold text-green-700">{result.success}</div>
            </div>
            <div className="rounded-[18px] border border-red-100 bg-red-50 p-3 text-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-500">Falhas</div>
              <div className="mt-1 text-2xl font-semibold text-red-600">{result.failed}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {result.results.map((r) => (
              <div
                key={r.id}
                className={[
                  "rounded-[14px] border px-4 py-3 text-sm",
                  r.status === "ok"
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50",
                ].join(" ")}
              >
                <div className="font-semibold text-slate-900">{r.name || r.id}</div>
                {r.status === "ok" ? (
                  <>
                    <div className="mt-1 text-green-700">
                      ✅ {r.lat?.toFixed(6)}, {r.lng?.toFixed(6)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Endereço usado: {r.usedQuery}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-red-600">❌ {r.error}</div>
                )}
              </div>
            ))}
          </div>

          {result.failed > 0 ? (
            <div className="mt-4 rounded-[18px] border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
              As lojas que falharam precisam ter o endereço corrigido no Supabase antes de tentar novamente.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
