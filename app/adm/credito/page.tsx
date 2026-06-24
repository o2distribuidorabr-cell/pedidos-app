"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import {
  PageHeader,
  Card,
  Select,
  Badge,
  Table,
  StatCard,
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
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtBR(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
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

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.22)] hover:bg-cyan-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="text-sm text-slate-600">{text}</div>
    </div>
  );
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
    const entradas = rows.reduce(
      (a, r) => a + (Number(r.amount) > 0 ? Number(r.amount) : 0),
      0
    );
    const saidas = rows.reduce(
      (a, r) => a + (Number(r.amount) < 0 ? Math.abs(Number(r.amount)) : 0),
      0
    );
    const net = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);

    return { entradas, saidas, net };
  }, [rows]);

  const saldoLojaSelecionada = useMemo(() => {
    if (storeFilter === "all") return null;
    return balances[storeFilter] ?? 0;
  }, [balances, storeFilter]);

  const storeNameSelected = useMemo(() => {
    if (storeFilter === "all") return null;
    return stores.find((s) => s.id === storeFilter)?.name ?? "Loja";
  }, [stores, storeFilter]);

  const tableRows = useMemo(() => {
    return rows.map((r) => {
      const amt = Number(r.amount ?? 0) || 0;
      const isCredit = amt >= 0;
      const tipo = isCredit ? "Crédito" : "Débito/Ajuste";

      return [
        <span key="dt" className="text-slate-700">
          {fmtBR(r.created_at)}
        </span>,
        <span key="store" className="font-semibold text-slate-900">
          {r.store_name}
        </span>,
        <span
          key="amt"
          className={isCredit ? "font-semibold text-slate-900" : "font-semibold text-red-600"}
        >
          {isCredit ? money(amt) : `- ${money(Math.abs(amt))}`}
        </span>,
        <Badge key="tipo" tone={isCredit ? "green" : "red"}>
          {tipo}
        </Badge>,
        <span key="note" className="text-slate-700">
          {r.note ?? "-"}
        </span>,
        <span key="by" className="font-mono text-xs text-slate-600">
          {r.created_by ?? "-"}
        </span>,
      ];
    });
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Extrato de crédito"
        subtitle="Histórico de lançamentos de crédito pré-pago"
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/credito/estorno")}>
              Estorno
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/adm/lojas")}>
              Lojas
            </SecondaryActionButton>
            <SecondaryActionButton onClick={onReload} disabled={loading}>
              Recarregar
            </SecondaryActionButton>
          </div>
        }
      />

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle="Acompanhe entradas, saídas e saldo do período filtrado"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Entradas" value={money(resumo.entradas)} />
          <StatCard label="Saídas" value={`- ${money(resumo.saidas)}`} />
          <StatCard label="Saldo líquido" value={money(resumo.net)} />
          <StatCard
            label="Saldo atual da loja"
            value={saldoLojaSelecionada != null ? money(saldoLojaSelecionada) : "-"}
            subtitle={storeNameSelected ?? "Selecione uma loja"}
          />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Filtros"
          subtitle="Refine rapidamente os lançamentos"
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-5">
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
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              De
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300"
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Até
            </div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-11 w-full rounded-[18px] border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300"
            />
          </div>

          <div className="flex items-end">
            <PrimaryActionButton onClick={loadLedger} disabled={loading} fullWidth>
              Aplicar filtros
            </PrimaryActionButton>
          </div>

          <div className="flex items-end">
            <SecondaryActionButton
              onClick={() => {
                setStoreFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
              disabled={loading}
              fullWidth
            >
              Limpar
            </SecondaryActionButton>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {saldoLojaSelecionada != null ? (
            <>
              Saldo atual de <b>{storeNameSelected}</b>:{" "}
              <b className="ml-1 text-slate-900">{money(saldoLojaSelecionada)}</b>
            </>
          ) : (
            "Selecione uma loja para visualizar o saldo atual específico."
          )}
        </div>
      </div>

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Lançamentos"
          subtitle={`${rows.length} registro(s) no período filtrado`}
        />

        <div className="mt-6">
          {loading ? (
            <div className="text-sm text-slate-600">Carregando...</div>
          ) : rows.length === 0 ? (
            <EmptyState text="Nenhum lançamento encontrado." />
          ) : (
            <Table
              headers={["Data", "Loja", "Valor", "Tipo", "Observação", "Criado por"]}
              rows={tableRows}
            />
          )}
        </div>
      </div>
    </div>
  );
}