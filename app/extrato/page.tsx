"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PortalShell from "@/app/components/PortalShell";
import { Card, Input, StatCard, Table, Badge } from "@/app/components/ui";

type LedgerRow = {
  id: number;
  store_id: string;
  amount: number | null;
  note: string | null;
  created_at: string | null;
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
        "inline-flex h-12 items-center justify-center rounded-[18px] px-5 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.26)] hover:bg-cyan-700",
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
        "inline-flex h-12 items-center justify-center rounded-[18px] px-5 text-sm font-semibold transition",
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

export default function ExtratoFranqueadoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>("-");
  const [balance, setBalance] = useState<number>(0);

  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const [rows, setRows] = useState<LedgerRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setMsg("Seu usuário não está vinculado a nenhuma loja.");
        setLoading(false);
        return;
      }

      const { data: store } = await supabase
        .from("stores")
        .select("id,name")
        .eq("id", sId)
        .maybeSingle();

      if (store) setStoreName((store as any)?.name ?? "-");

      await Promise.all([loadBalance(sId), loadLedger(sId)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBalance(sId: string) {
    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .eq("store_id", sId)
      .maybeSingle();

    if (error) {
      console.warn("balance:", error.message);
      setBalance(0);
      return;
    }

    setBalance(Number((data as any)?.balance ?? 0) || 0);
  }

  async function loadLedger(sId: string) {
    setMsg("");

    let q = supabase
      .from("store_credit_ledger")
      .select("id,store_id,amount,note,created_at")
      .eq("store_id", sId)
      .order("created_at", { ascending: false });

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
    if (!storeId) return;
    setLoading(true);
    await Promise.all([loadBalance(storeId), loadLedger(storeId)]);
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const entradas = rows.reduce((a, r) => a + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0);
    const saidas = rows.reduce((a, r) => a + (Number(r.amount) < 0 ? Math.abs(Number(r.amount)) : 0), 0);
    const net = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    return { entradas, saidas, net };
  }, [rows]);

  const headers = ["Data", "Valor", "Tipo", "Observação"];

  const tableRows = rows.map((r) => {
    const amt = Number(r.amount ?? 0) || 0;
    const isCredit = amt >= 0;

    return [
      <div key={`dt-${r.id}`} className="text-sm text-slate-700">
        {fmtBR(r.created_at)}
      </div>,
      <div
        key={`v-${r.id}`}
        className={`text-sm font-semibold ${isCredit ? "text-slate-900" : "text-red-700"}`}
      >
        {isCredit ? money(amt) : `- ${money(Math.abs(amt))}`}
      </div>,
      isCredit ? (
        <Badge key={`t-${r.id}`} tone="green">
          Crédito
        </Badge>
      ) : (
        <Badge key={`t-${r.id}`} tone="red">
          Débito/Ajuste
        </Badge>
      ),
      <div key={`n-${r.id}`} className="text-sm text-slate-700">
        {r.note ?? "-"}
      </div>,
    ];
  });

  if (loading) {
    return (
      <PortalShell title="Extrato de crédito" subtitle="Lançamentos do seu saldo pré-pago">
        <Card>
          <div>Carregando...</div>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="Extrato de crédito"
      subtitle={`Loja: ${storeName} · Saldo atual: ${money(balance)}`}
    >
      <div className="space-y-6">
        {msg ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {msg}
          </div>
        ) : null}

        <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Visão geral do extrato"
            subtitle="Acompanhe entradas, saídas e saldo líquido do período"
            right={
              <SecondaryActionButton onClick={onReload} disabled={!storeId}>
                Recarregar
              </SecondaryActionButton>
            }
          />

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <StatCard label="Entradas" value={money(resumo.entradas)} />
            <StatCard label="Saídas" value={`- ${money(resumo.saidas)}`} />
            <StatCard label="Saldo líquido no período" value={money(resumo.net)} />
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Filtros"
            subtitle="Refine os lançamentos por período"
            right={
              <div className="flex flex-wrap gap-2">
                <PrimaryActionButton onClick={() => storeId && loadLedger(storeId)} disabled={!storeId}>
                  Aplicar filtros
                </PrimaryActionButton>
                <SecondaryActionButton onClick={onReload} disabled={!storeId}>
                  Atualizar
                </SecondaryActionButton>
              </div>
            }
          />

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="De" type="date" value={dateFrom} onChange={setDateFrom} />
            <Input label="Até" type="date" value={dateTo} onChange={setDateTo} />
            <div className="flex items-end">
              <div className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Saldo atual
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{money(balance)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Lançamentos"
            subtitle="Créditos e débitos lançados no seu extrato"
          />

          <div className="mt-6">
            {rows.length === 0 ? (
              <div className="text-sm text-slate-500">Nenhum lançamento encontrado.</div>
            ) : (
              <Table headers={headers} rows={tableRows} />
            )}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}