"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Button, Input, Select, Badge } from "@/app/components/ui";

type StoreRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  active: boolean | null;

  code?: string | null;
  freight_fee?: number | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdmLojasPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [balancesByStore, setBalancesByStore] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");

  // formulário loja
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [active, setActive] = useState(true);
  const [freightFee, setFreightFee] = useState<string>("");

  // crédito
  const [creditStoreId, setCreditStoreId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState<string>("");
  const [creditNote, setCreditNote] = useState<string>("");
  const [creditMode, setCreditMode] = useState<"ADD" | "REMOVE">("ADD");

  async function requireAuth() {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      router.push("/login");
      return false;
    }
    return true;
  }

  async function loadBalances(storeIds: string[]) {
    if (storeIds.length === 0) {
      setBalancesByStore({});
      return;
    }

    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("store_id,balance")
      .in("store_id", storeIds);

    if (error) {
      console.warn("loadBalances error:", error.message);
      return;
    }

    const map: Record<string, number> = {};
    (data ?? []).forEach((r: any) => {
      map[String(r.store_id)] = Number(r.balance ?? 0);
    });
    setBalancesByStore(map);
  }

  async function loadStores() {
    setMsg("");
    const ok = await requireAuth();
    if (!ok) return;

    const { data, error } = await supabase
      .from("stores")
      .select("id,name,city,state,active,freight_fee,code")
      .order("name", { ascending: true });

    if (error) {
      setMsg(error.message);
      setStores([]);
      return;
    }

    const rows = (data ?? []) as StoreRow[];
    setStores(rows);
    await loadBalances(rows.map((s) => s.id));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadStores();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return stores;
    return stores.filter((s) => {
      const blob = `${s.name} ${s.city ?? ""} ${s.state ?? ""} ${s.code ?? ""} ${s.id}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [stores, q]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setCity("");
    setStateUf("");
    setActive(true);
    setFreightFee("");
  }

  function startEdit(s: StoreRow) {
    setEditingId(s.id);
    setName(s.name ?? "");
    setCity(s.city ?? "");
    setStateUf((s.state ?? "").toUpperCase());
    setActive(s.active ?? true);
    setFreightFee(s.freight_fee != null ? String(s.freight_fee) : "");
    setMsg("");
  }

  async function saveStore() {
    setMsg("");
    setWorking(true);

    const nm = name.trim();
    if (!nm) {
      setWorking(false);
      setMsg("Preencha o nome da loja.");
      return;
    }

    let ff: number | null = null;
    if (freightFee.trim() !== "") {
      const parsed = Number(String(freightFee).replace(",", "."));
      if (Number.isNaN(parsed) || parsed < 0) {
        setWorking(false);
        setMsg("Frete inválido. Use número (ex.: 65 ou 65.00).");
        return;
      }
      ff = parsed;
    }

    const payload: any = {
      name: nm,
      city: city.trim() || null,
      state: stateUf.trim().toUpperCase() || null,
      active: !!active,
      freight_fee: ff,
    };

    if (editingId) {
      const { error } = await supabase.from("stores").update(payload).eq("id", editingId);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("stores").insert(payload);
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    }

    setWorking(false);
    resetForm();
    await loadStores();
  }

  async function toggleActive(s: StoreRow) {
    setMsg("");
    setWorking(true);

    const { error } = await supabase
      .from("stores")
      .update({ active: !(s.active ?? true) })
      .eq("id", s.id);

    if (error) {
      setWorking(false);
      setMsg(error.message);
      return;
    }

    setWorking(false);
    await loadStores();
  }

  function openCredit(s: StoreRow) {
    setCreditStoreId(s.id);
    setCreditAmount("");
    setCreditNote("");
    setCreditMode("ADD");
    setMsg("");
  }

  function closeCredit() {
    setCreditStoreId(null);
    setCreditAmount("");
    setCreditNote("");
    setCreditMode("ADD");
  }

  function parseAmountBR(v: string) {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  async function applyCredit() {
    if (!creditStoreId) return;

    setMsg("");
    setWorking(true);

    const amt = parseAmountBR(creditAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      setWorking(false);
      setMsg("Informe um valor válido (maior que zero).");
      return;
    }

    const currentBal = balancesByStore[creditStoreId] ?? 0;
    if (creditMode === "REMOVE" && amt > currentBal) {
      setWorking(false);
      setMsg(`Saldo insuficiente. Saldo atual: ${money(currentBal)}`);
      return;
    }

    if (creditMode === "ADD") {
      const { error } = await supabase.rpc("add_store_credit", {
        p_store_id: creditStoreId,
        p_amount: amt,
        p_note: creditNote.trim() || null,
      });
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    } else {
      const { error } = await supabase.rpc("remove_store_credit", {
        p_store_id: creditStoreId,
        p_amount: amt,
        p_note: creditNote.trim() || null,
      });
      if (error) {
        setWorking(false);
        setMsg(error.message);
        return;
      }
    }

    setWorking(false);
    closeCredit();
    await loadStores();
  }

  const creditStore = creditStoreId ? stores.find((s) => s.id === creditStoreId) : null;
  const creditBalance = creditStoreId ? balancesByStore[creditStoreId] ?? 0 : 0;

  const previewAfter = useMemo(() => {
    const amt = parseAmountBR(creditAmount);
    if (!creditStoreId || Number.isNaN(amt) || amt <= 0) return creditBalance;
    return creditMode === "ADD" ? creditBalance + amt : Math.max(creditBalance - amt, 0);
  }, [creditStoreId, creditAmount, creditMode, creditBalance]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lojas"
        subtitle="Cadastre e edite lojas. Gerencie crédito pré-pago (adicionar/remover) por loja."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/adm/financeiro")}>
              Financeiro
            </Button>
            <Button variant="secondary" onClick={loadStores} disabled={working}>
              Atualizar
            </Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600">{msg}</div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <Card title={editingId ? "Editar loja" : "Nova loja"}>
          <div className="grid gap-3">
            <Input label="Nome" value={name} onChange={setName} placeholder="Ex.: Loja Shopping Cidade" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Cidade" value={city} onChange={setCity} placeholder="Belo Horizonte" />
              <Input label="UF" value={stateUf} onChange={(v) => setStateUf(v.toUpperCase())} placeholder="MG" maxLength={2} />
            </div>

            <Input label="Frete padrão (opcional)" value={freightFee} onChange={setFreightFee} placeholder="Ex.: 65.00" />

            <Select
              label="Ativa?"
              value={active ? "true" : "false"}
              onChange={(v) => setActive(v === "true")}
              options={[
                { value: "true", label: "Sim" },
                { value: "false", label: "Não" },
              ]}
            />

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={saveStore} disabled={working}>
                {working ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="secondary" onClick={resetForm} disabled={working}>
                Limpar
              </Button>
            </div>

            {editingId ? (
              <div className="pt-2 text-xs text-slate-500">
                ID: <span className="font-mono">{editingId}</span>
              </div>
            ) : null}
          </div>
        </Card>

        {/* List */}
        <Card title="Lista">
          <div className="grid gap-3">
            <Input value={q} onChange={setQ} placeholder="Buscar por nome, cidade, UF..." />

            {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}

            {!loading && filtered.length === 0 ? (
              <div className="text-sm text-slate-600">Nenhuma loja encontrada.</div>
            ) : null}

            {!loading && filtered.length > 0 ? (
              <div className="grid gap-2">
                {filtered.map((s) => {
                  const bal = balancesByStore[s.id] ?? 0;
                  return (
                    <div
                      key={s.id}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate font-semibold text-slate-900">{s.name}</div>
                          <Badge tone={s.active ? "green" : "red"}>{s.active ? "Ativa" : "Inativa"}</Badge>
                        </div>

                        <div className="mt-1 text-sm text-slate-600">
                          {(s.city ?? "-")}
                          {s.state ? `/${s.state}` : ""}{" "}
                          {s.freight_fee != null ? `· Frete: ${money(Number(s.freight_fee))}` : ""}
                        </div>

                        <div className="mt-2 text-sm">
                          <span className="font-semibold text-slate-900">Crédito:</span>{" "}
                          <span className="font-semibold text-slate-900">{money(bal)}</span>
                        </div>

                        <div className="mt-2 truncate font-mono text-xs text-slate-500">{s.id}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => startEdit(s)} disabled={working}>
                          Editar
                        </Button>
                        <Button variant="secondary" onClick={() => openCredit(s)} disabled={working}>
                          Crédito
                        </Button>
                        <Button
                          variant="warn"
                          onClick={() => toggleActive(s)}
                          disabled={working}
                          title={s.active ? "Desativar loja" : "Ativar loja"}
                        >
                          {s.active ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Modal crédito */}
      {creditStoreId ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={closeCredit}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">Crédito pré-pago</div>
                <div className="mt-1 text-xs text-slate-600">
                  Loja: <b>{creditStore?.name ?? creditStoreId}</b> · Saldo atual: <b>{money(creditBalance)}</b> · Após:{" "}
                  <b>{money(previewAfter)}</b>
                </div>
              </div>

              <Button variant="secondary" onClick={closeCredit} disabled={working}>
                Fechar
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant={creditMode === "ADD" ? "primary" : "secondary"}
                onClick={() => setCreditMode("ADD")}
                disabled={working}
              >
                Adicionar
              </Button>
              <Button
                variant={creditMode === "REMOVE" ? "primary" : "secondary"}
                onClick={() => setCreditMode("REMOVE")}
                disabled={working}
              >
                Remover
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              <Input label="Valor (R$)" value={creditAmount} onChange={setCreditAmount} placeholder="Ex.: 1000.00" />
              <Input
                label="Observação (opcional)"
                value={creditNote}
                onChange={setCreditNote}
                placeholder={creditMode === "ADD" ? "Ex.: Crédito antecipado do mês" : "Ex.: Ajuste / Estorno"}
              />

              <div className="flex justify-end pt-1">
                <Button onClick={applyCredit} disabled={working}>
                  {working ? "Salvando..." : creditMode === "ADD" ? "Adicionar" : "Remover"}
                </Button>
              </div>

              {creditMode === "REMOVE" ? (
                <div className="text-xs text-slate-500">
                  Observação: a remoção só funciona se você rodou o SQL da função <b>remove_store_credit</b>.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}