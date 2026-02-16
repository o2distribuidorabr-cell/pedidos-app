"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  PageHeader,
  Card,
  Button,
  Select,
  Badge,
  Table,
} from "@/app/components/ui";

type StoreRow = { id: string; name: string | null };

type LedgerRow = {
  id: number;
  store_id: string;
  store_name: string;
  amount: number | null;
  note: string | null;
  created_at: string | null;
  created_by: string | null;
};

type CreditBalanceRow = {
  store_id: string;
  balance: number | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}
function toISOStart(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0).toISOString();
}
function toISOEnd(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
}

export default function AdmCreditoExtratoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>("all");

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      await loadStoresAndBalances();
      await loadLedger();

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStoresAndBalances() {
    const { data: sData, error: sErr } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (sErr) {
      setMsg(sErr.message);
      setStores([]);
      return;
    }

    const list = (sData ?? []) as StoreRow[];
    setStores(list);

    if (list.length === 0) {
      setBalances({});
      return;
    }

    const { data: bData, error: bErr } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .in("store_id", list.map((s) => s.id));

    if (bErr) {
      console.warn("balances:", bErr.message);
      setBalances({});
      return;
    }

    const map: Record<string, number> = {};
    ((bData ?? []) as CreditBalanceRow[]).forEach((r) => {
      map[String(r.store_id)] = Number(r.balance ?? 0);
    });
    setBalances(map);
  }

  async function loadLedger() {
    setMsg("");

    let q = supabase
      .from("v_store_credit_ledger_admin")
      .select("id,store_id,store_name,amount,note,created_at,created_by")
      .order("created_at", { ascending: false });

    if (storeFilter !== "all") q = q.eq("store_id", storeFilter);
    if (dateFrom) q = q.gte("created_at", toISOStart(dateFrom));
    if (dateTo) q = q.lte("created_at", toISOEnd(dateTo));

    const { data, error } = await q;

    if (error) {
      setMsg(error.message);
      setRows([]);
      return;
    }

    setRows((data ?? []) as LedgerRow[]);
  }

  async function onReload() {
    setLoading(true);
    await loadStoresAndBalances();
    await loadLedger();
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const entradas = rows.reduce((a, r) => a + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0);
    const saidas = rows.reduce((a, r) => a + (Number(r.amount) < 0 ? Math.abs(Number(r.amount)) : 0), 0);
    const net = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    return { entradas, saidas, net };
  }, [rows]);

  const saldoLojaSelecionada = useMemo(() => {
    if (storeFilter === "all") return null;
    return balances[storeFilter] ?? 0;
  }, [balances, storeFilter]);

  const tableRows = useMemo(() => {
    return rows.map((r) => {
      const amt = Number(r.amount ?? 0) || 0;
      const isCredit = amt >= 0;
      const tipo = isCredit ? "Crédito" : "Débito/Ajuste";

      return [
        <span key="dt" className="text-slate-700">{fmtBR(r.created_at)}</span>,
        <span key="store" className="font-semibold text-slate-900">{r.store_name}</span>,
        <span
          key="amt"
          className={isCredit ? "font-semibold text-slate-900" : "font-semibold text-red-600"}
        >
          {isCredit ? money(amt) : `- ${money(Math.abs(amt))}`}
        </span>,
        <Badge key="tipo" tone={isCredit ? "green" : "red"}>
          {tipo}
        </Badge>,
        <span key="note" className="text-slate-700">{r.note ?? "-"}</span>,
        <span key="by" className="font-mono text-xs text-slate-600">{r.created_by ?? "-"}</span>,
      ];
    });
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Extrato de crédito"
        subtitle="Histórico de lançamentos (crédito pré-pago). Valores negativos = remoção/ajuste."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/adm/lojas")}>
              Lojas
            </Button>
            <Button variant="secondary" onClick={onReload} disabled={loading}>
              Recarregar
            </Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <Card title="Filtros">
        <div className="grid gap-3 md:grid-cols-5">
          <Select
            label="Loja"
            value={storeFilter}
            onChange={setStoreFilter}
            options={[
              { value: "all", label: "Todas" },
              ...stores.map((s) => ({ value: s.id, label: s.name ?? s.id })),
            ]}
          />

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">De</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1">Até</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex items-end">
            <Button onClick={loadLedger} disabled={loading}>
              Aplicar filtros
            </Button>
          </div>

          <div className="flex items-end">
            <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              {saldoLojaSelecionada != null ? (
                <>
                  Saldo atual: <b className="ml-1">{money(saldoLojaSelecionada)}</b>
                </>
              ) : (
                "Selecione uma loja para ver o saldo atual"
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Resumo do período">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Entradas</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{money(resumo.entradas)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Saídas</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">- {money(resumo.saidas)}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">Saldo líquido no período</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{money(resumo.net)}</div>
          </div>
        </div>
      </Card>

      <Card title="Lançamentos" subtitle={`${rows.length} registro(s)`}>
        {loading ? (
          <div>Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum lançamento encontrado.</div>
        ) : (
          <Table
            headers={["Data", "Loja", "Valor", "Tipo", "Observação", "Criado por"]}
            rows={tableRows}
          />
        )}
      </Card>
    </div>
  );
}