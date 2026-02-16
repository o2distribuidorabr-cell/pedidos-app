"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

import { PageHeader, Card, Button, Input, Select, Badge } from "@/app/components/ui";

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
    // loading já começa como true no useState, então não precisamos setar aqui (evita lint react-hooks/set-state-in-effect)
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
        const blob = [r.email, r.franchisee_name, r.store_name, r.cnpj ?? "", r.city ?? "", r.state ?? "", r.user_id]
          .join(" ")
          .toLowerCase();

        if (!blob.includes(qq)) return false;
      }

      return true;
    });
  }, [requests, q, statusFilter]);

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

    // 1) aprova no profiles
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

    // 2) marca request como approved
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

    // opcional: manter approved=false no profile
    await supabase.from("profiles").update({ approved: false, role: "pending", store_id: null }).eq("id", r.user_id);

    await loadRequests();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadastros"
        subtitle="Aprovar ou rejeitar solicitações de franqueados"
        right={
          <Button variant="secondary" onClick={loadRequests}>
            Atualizar
          </Button>
        }
      />

      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Buscar" placeholder="Email, nome, loja ou CNPJ" value={q} onChange={setQ} />

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
      </Card>

      {msg && (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      )}

      <div className="space-y-4">
        {loading && <Card>Carregando...</Card>}

        {!loading && filtered.length === 0 && <Card>Nenhuma solicitação encontrada.</Card>}

        {filtered.map((r) => {
          const isPending = r.status === "pending";

          return (
            <Card key={r.id} className="p-0">
              {/* Header (título + badge) */}
              <div className="border-b border-slate-200 px-4 py-3 md:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {r.franchisee_name} — {r.email}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">Criado em {fmtDT(r.created_at)}</div>
                  </div>

                  <Badge tone={toneByStatus(r.status)}>{r.status}</Badge>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 md:p-6">
                <div className="grid gap-4 md:grid-cols-[1fr_320px]">
                  <div className="space-y-1 text-sm text-slate-700">
                    <div>
                      <b>Loja solicitada:</b> {r.store_name}
                    </div>
                    <div>
                      <b>Cidade:</b> {r.city ?? "-"} {r.state ?? ""}
                    </div>
                    <div>
                      <b>CNPJ:</b> {r.cnpj ?? "-"}
                    </div>
                    <div>
                      <b>Telefone:</b> {r.phone ?? "-"}
                    </div>
                    <div className="text-xs text-slate-500">user_id: {r.user_id}</div>

                    {r.decided_at ? <div className="text-xs text-slate-500">Decidido em: {fmtDT(r.decided_at)}</div> : null}
                  </div>

                  <div className="space-y-2">
                    <Select
                      label="Vincular loja"
                      value={storePick[r.id] ?? ""}
                      onChange={(v) => setStorePick((p) => ({ ...p, [r.id]: v }))}
                      options={[
                        { value: "", label: "Selecione..." },
                        ...stores.map((s) => ({ value: s.id, label: s.name })),
                      ]}
                    />

                    <div className="flex justify-end gap-2">
                      <Button variant="danger" disabled={!isPending} onClick={() => rejectRequest(r)}>
                        Rejeitar
                      </Button>

                      <Button disabled={!isPending} onClick={() => approveRequest(r)}>
                        Aprovar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}