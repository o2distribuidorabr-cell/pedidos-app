"use client";

import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card } from "@/app/components/ui";
import PortalShell from "@/app/components/PortalShell";

type PendingOrder = {
  id: string;
  approved_at: string | null;
  created_at: string | null;
  store_name: string;
  items_count: number;
  baixa_status: "pendente" | "ok" | "erro" | "processando";
  baixa_msg?: string;
};

function fmtDT(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function BaixaRetroativaPage() {
  const [dateFrom, setDateFrom] = useState<string>(
    new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PendingOrder[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");

  const pendentes = useMemo(() => (orders ?? []).filter((o) => o.baixa_status === "pendente"), [orders]);
  const concluidos = useMemo(() => (orders ?? []).filter((o) => o.baixa_status === "ok"), [orders]);
  const erros = useMemo(() => (orders ?? []).filter((o) => o.baixa_status === "erro"), [orders]);

  const allPendentesSelected =
    pendentes.length > 0 && pendentes.every((o) => selected.has(o.id));

  function toggleAll() {
    if (allPendentesSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendentes.map((o) => o.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function buscar() {
    setLoading(true);
    setMsg("");
    setOrders(null);
    setSelected(new Set());

    const from = new Date(dateFrom + "T00:00:00-03:00").toISOString();
    const to   = new Date(dateTo   + "T23:59:59-03:00").toISOString();

    // Busca 1: pedidos com approved_at no período
    const { data: p1, error: e1 } = await supabase
      .from("orders")
      .select("id, approved_at, created_at, stores(name)")
      .eq("status", "approved")
      .gte("approved_at", from)
      .lte("approved_at", to);

    if (e1) { setMsg("Erro ao buscar pedidos: " + e1.message); setLoading(false); return; }

    // Busca 2: pedidos com approved_at nulo mas created_at no período
    const { data: p2, error: e2 } = await supabase
      .from("orders")
      .select("id, approved_at, created_at, stores(name)")
      .eq("status", "approved")
      .is("approved_at", null)
      .gte("created_at", from)
      .lte("created_at", to);

    if (e2) { setMsg("Erro ao buscar pedidos: " + e2.message); setLoading(false); return; }

    // Une e remove duplicatas
    const vistos = new Set<string>();
    const pedidos: any[] = [];
    for (const p of [...(p1 ?? []), ...(p2 ?? [])]) {
      if (!vistos.has(p.id)) { vistos.add(p.id); pedidos.push(p); }
    }
    pedidos.sort((a, b) =>
      ((b.approved_at ?? b.created_at) > (a.approved_at ?? a.created_at)) ? 1 : -1
    );

    if (pedidos.length === 0) {
      setMsg("Nenhum pedido aprovado encontrado no período.");
      setOrders([]);
      setLoading(false);
      return;
    }

    const ids = pedidos.map((p: any) => p.id);

    const { data: movs } = await supabase
      .from("stock_movements")
      .select("order_id")
      .eq("movement_type", "ORDER_DEDUCTION")
      .in("order_id", ids);

    const comBaixa = new Set((movs ?? []).map((m: any) => m.order_id));

    const { data: itens } = await supabase
      .from("order_items")
      .select("order_id")
      .in("order_id", ids);

    const contagem = new Map<string, number>();
    for (const i of (itens ?? []) as any[]) {
      contagem.set(i.order_id, (contagem.get(i.order_id) ?? 0) + 1);
    }

    const lista: PendingOrder[] = (pedidos as any[])
      .filter((p) => !comBaixa.has(p.id))
      .map((p) => ({
        id: p.id,
        approved_at: p.approved_at,
        created_at: p.created_at,
        store_name: p.stores?.name ?? "-",
        items_count: contagem.get(p.id) ?? 0,
        baixa_status: "pendente",
      }));

    setOrders(lista);
    setLoading(false);

    if (lista.length === 0) {
      setMsg("Todos os pedidos desse período já têm baixa de estoque registrada.");
    }
  }

  async function executarSelecionados() {
    if (!orders || selected.size === 0) return;
    setRunning(true);

    const alvo = orders.filter((o) => selected.has(o.id) && o.baixa_status === "pendente");

    for (const ord of alvo) {
      setOrders((prev) =>
        prev!.map((o) => o.id === ord.id ? { ...o, baixa_status: "processando" } : o)
      );

      try {
        const res = await fetch("/api/estoque/baixa-pedido", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: ord.id }),
        });
        const json = await res.json();

        setOrders((prev) =>
          prev!.map((o) =>
            o.id === ord.id
              ? {
                  ...o,
                  baixa_status: json.ok ? "ok" : "erro",
                  baixa_msg: json.skipped
                    ? "Já registrada"
                    : json.ok
                    ? `${json.count} produto(s) baixado(s)`
                    : json.error,
                }
              : o
          )
        );
      } catch (e: any) {
        setOrders((prev) =>
          prev!.map((o) =>
            o.id === ord.id ? { ...o, baixa_status: "erro", baixa_msg: String(e.message) } : o
          )
        );
      }

      setSelected((prev) => { const n = new Set(prev); n.delete(ord.id); return n; });
    }

    setRunning(false);
  }

  return (
    <PortalShell title="Baixa retroativa" subtitle="Estoque">
      <div className="space-y-6">
        <PageHeader
          title="Baixa retroativa de estoque"
          subtitle="Busca pedidos aprovados sem baixa de estoque. Selecione os que deseja processar."
        />

        <Card title="Período de aprovação">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={buscar}
              disabled={loading}
              className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
            >
              {loading ? "Buscando..." : "Buscar pedidos"}
            </button>
          </div>
        </Card>

        {msg && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {msg}
          </div>
        )}

        {orders !== null && orders.length > 0 && (
          <Card title={`${orders.length} pedido(s) sem baixa de estoque`}>
            {/* Barra de ações */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                onClick={executarSelecionados}
                disabled={running || selected.size === 0}
                className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
              >
                {running
                  ? "Executando..."
                  : selected.size > 0
                  ? `Executar baixa em ${selected.size} pedido(s) selecionado(s)`
                  : "Selecione pedidos para executar"}
              </button>

              {concluidos.length > 0 && (
                <span className="text-sm font-medium text-green-700">
                  {concluidos.length} concluído(s)
                </span>
              )}
              {erros.length > 0 && (
                <span className="text-sm font-medium text-red-700">
                  {erros.length} erro(s)
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="border-b border-slate-200 py-2 pr-3 w-8">
                      <input
                        type="checkbox"
                        checked={allPendentesSelected}
                        onChange={toggleAll}
                        disabled={running || pendentes.length === 0}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-900 cursor-pointer disabled:opacity-40"
                        title="Selecionar todos pendentes"
                      />
                    </th>
                    <th className="border-b border-slate-200 py-2 pr-4">Pedido</th>
                    <th className="border-b border-slate-200 py-2 pr-4">Loja</th>
                    <th className="border-b border-slate-200 py-2 pr-4">Data</th>
                    <th className="border-b border-slate-200 py-2 pr-4">Itens</th>
                    <th className="border-b border-slate-200 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const isPendente = o.baixa_status === "pendente";
                    const isChecked  = selected.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        className={`border-b border-slate-100 last:border-0 transition ${isChecked ? "bg-slate-50" : ""}`}
                        onClick={() => isPendente && !running && toggleOne(o.id)}
                        style={{ cursor: isPendente && !running ? "pointer" : "default" }}
                      >
                        <td className="py-3 pr-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!isPendente || running}
                            onChange={() => toggleOne(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-300 accent-slate-900 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-600">{o.id}</td>
                        <td className="py-3 pr-4 font-medium text-slate-800">{o.store_name}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          {fmtDT(o.approved_at ?? o.created_at)}
                          {!o.approved_at && (
                            <span className="ml-1 text-[10px] text-slate-400">(criação)</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{o.items_count}</td>
                        <td className="py-3">
                          {o.baixa_status === "pendente" && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Pendente
                            </span>
                          )}
                          {o.baixa_status === "processando" && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              Processando...
                            </span>
                          )}
                          {o.baixa_status === "ok" && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              {o.baixa_msg ?? "OK"}
                            </span>
                          )}
                          {o.baixa_status === "erro" && (
                            <span
                              className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                              title={o.baixa_msg}
                            >
                              Erro: {o.baixa_msg}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}
