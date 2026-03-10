"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

import { PageHeader, Card, Input, Select, Badge, StatCard } from "@/app/components/ui";

type StoreRow = { id: string; name: string };

type SignupRow = {
  id: string;
  user_id: string;
  email: string;
  franchisee_name: string;
  phone: string | null;
  store_name: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

type StatusFilter = SignupRow["status"] | "all";

function fmtDT(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function toneByStatus(s: SignupRow["status"]) {
  if (s === "approved") return "green" as const;
  if (s === "rejected") return "red" as const;
  return "yellow" as const;
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
  danger,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition",
        danger
          ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
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

function InfoPair({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

export default function AdmCadastrosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [requests, setRequests] = useState<SignupRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

  const [storePick, setStorePick] = useState<Record<string, string>>({});

  async function loadRequests() {
    setMsg("");

    const { data, error } = await supabase
      .from("signup_requests")
      .select("id,user_id,email,franchisee_name,phone,store_name,cnpj,city,state,status,created_at,decided_at,decided_by")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setRequests([]);
      return;
    }

    const rows = (data ?? []) as SignupRow[];
    setRequests(rows);

    setStorePick((prev) => {
      const next = { ...prev };
      for (const r of rows) if (!(r.id in next)) next[r.id] = "";
      return next;
    });
  }

  async function bootstrap() {
    const ok = await requireAdminOrRedirect(router);
    if (!ok) return;

    const { data: st, error: stErr } = await supabase
      .from("stores")
      .select("id,name")
      .order("name", { ascending: true });

    if (stErr) {
      setMsg(stErr.message);
      setStores([]);
    } else {
      setStores((st ?? []) as StoreRow[]);
    }

    await loadRequests();
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    bootstrap();
    // eslint-disable-next-line
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;

      if (qq) {
        const blob = [
          r.email,
          r.franchisee_name,
          r.store_name,
          r.cnpj ?? "",
          r.city ?? "",
          r.state ?? "",
          r.user_id,
        ]
          .join(" ")
          .toLowerCase();

        if (!blob.includes(qq)) return false;
      }

      return true;
    });
  }, [requests, q, statusFilter]);

  const summary = useMemo(() => {
    return {
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      total: requests.length,
    };
  }, [requests]);

  async function approveRequest(r: SignupRow) {
    setMsg("");

    const chosenStoreId = storePick[r.id];
    if (!chosenStoreId) {
      setMsg("Selecione uma loja para aprovar.");
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const adminId = auth?.user?.id;
    if (!adminId) return router.push("/login");

    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        approved: true,
        role: "franchisee",
        store_id: chosenStoreId,
      })
      .eq("id", r.user_id);

    if (pErr) {
      setMsg(pErr.message);
      return;
    }

    const { error: rErr } = await supabase
      .from("signup_requests")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by: adminId,
      })
      .eq("id", r.id);

    if (rErr) {
      setMsg(rErr.message);
      return;
    }

    await loadRequests();
  }

  async function rejectRequest(r: SignupRow) {
    setMsg("");

    const { data: auth } = await supabase.auth.getUser();
    const adminId = auth?.user?.id;
    if (!adminId) return router.push("/login");

    const { error: rErr } = await supabase
      .from("signup_requests")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
        decided_by: adminId,
      })
      .eq("id", r.id);

    if (rErr) {
      setMsg(rErr.message);
      return;
    }

    await supabase
      .from("profiles")
      .update({ approved: false, role: "pending", store_id: null })
      .eq("id", r.user_id);

    await loadRequests();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadastros"
        subtitle="Aprovar ou rejeitar solicitações de franqueados"
        right={<SecondaryActionButton onClick={loadRequests}>Atualizar</SecondaryActionButton>}
      />

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle="Resumo das solicitações recebidas"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Pendentes" value={summary.pending} />
          <StatCard label="Aprovados" value={summary.approved} />
          <StatCard label="Rejeitados" value={summary.rejected} />
          <StatCard label="Total" value={summary.total} />
        </div>
      </div>

      <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Filtros"
          subtitle="Refine rapidamente as solicitações"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Input
            label="Buscar"
            placeholder="Email, nome, loja ou CNPJ"
            value={q}
            onChange={setQ}
          />

          <Select
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: "pending", label: "Pendentes" },
              { value: "approved", label: "Aprovados" },
              { value: "rejected", label: "Rejeitados" },
              { value: "all", label: "Todos" },
            ]}
          />
        </div>
      </div>

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <div className="text-sm text-slate-600">Carregando...</div>
        </Card>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <Card>
          <div className="text-sm text-slate-600">Nenhuma solicitação encontrada.</div>
        </Card>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="grid gap-4 2xl:grid-cols-2">
          {filtered.map((r) => {
            const isPending = r.status === "pending";

            return (
              <div
                key={r.id}
                className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">
                      {r.franchisee_name}
                    </div>
                    <div className="mt-1 text-sm text-slate-600 break-all">{r.email}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={toneByStatus(r.status)}>{r.status}</Badge>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Criado em
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {fmtDT(r.created_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                  <div className="space-y-3">
                    <InfoPair label="Loja solicitada" value={r.store_name} />
                    <InfoPair label="Cidade / UF" value={`${r.city ?? "-"} ${r.state ?? ""}`.trim()} />
                    <InfoPair label="CNPJ" value={r.cnpj ?? "-"} />
                    <InfoPair label="Telefone" value={r.phone ?? "-"} />
                    <InfoPair label="User ID" value={<span className="break-all font-mono text-xs">{r.user_id}</span>} />
                    {r.decided_at ? (
                      <InfoPair label="Decidido em" value={fmtDT(r.decided_at)} />
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <Select
                    label="Vincular loja"
                    value={storePick[r.id] ?? ""}
                    onChange={(v) => setStorePick((p) => ({ ...p, [r.id]: v }))}
                    options={[
                      { value: "", label: "Selecione..." },
                      ...stores.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    <SecondaryActionButton
                      danger
                      disabled={!isPending}
                      onClick={() => rejectRequest(r)}
                      fullWidth
                    >
                      Rejeitar
                    </SecondaryActionButton>

                    <PrimaryActionButton
                      disabled={!isPending}
                      onClick={() => approveRequest(r)}
                      fullWidth
                    >
                      Aprovar
                    </PrimaryActionButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}