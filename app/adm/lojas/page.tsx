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

  // cadastro completo
  legal_name: string | null;
  cnpj: string | null;

  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;

  // NFe
  ie?: string | null;
  email_nf?: string | null;
  phone_nf?: string | null;

  // cobrança / Asaas
  billing_email?: string | null;
  billing_phone?: string | null;
  asaas_customer_id?: string | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyDigits(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}

function normalizeCNPJ(v: string) {
  return onlyDigits(v).slice(0, 14);
}

function normalizeCEP(v: string) {
  return onlyDigits(v).slice(0, 8);
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

  // cadastro completo
  const [legalName, setLegalName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [numberAddr, setNumberAddr] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");

  // NFe
  const [ie, setIe] = useState("");
  const [emailNf, setEmailNf] = useState("");
  const [phoneNf, setPhoneNf] = useState("");

  // cobrança / Asaas
  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [asaasCustomerId, setAsaasCustomerId] = useState("");

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

  function formatSbError(prefix: string, err: any) {
    const parts: string[] = [];
    parts.push(prefix);
    if (err?.message) parts.push(`message: ${err.message}`);
    if (err?.details) parts.push(`details: ${err.details}`);
    if (err?.hint) parts.push(`hint: ${err.hint}`);
    if (err?.code) parts.push(`code: ${err.code}`);
    return parts.join(" | ");
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
      console.warn("loadBalances error:", error);
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

    const baseSelect = "id,name,city,state,active,freight_fee,code";
    const fullSelect =
      "id,name,city,state,active,freight_fee,code,legal_name,cnpj,address_zip,address_street,address_number,address_complement,address_neighborhood,ie,email_nf,phone_nf,billing_email,billing_phone,asaas_customer_id";

    let data: any[] | null = null;

    const first = await supabase
      .from("stores")
      .select(fullSelect)
      .order("name", { ascending: true });

    if (first.error) {
      console.warn("loadStores fullSelect error:", first.error);

      const fallback = await supabase
        .from("stores")
        .select(baseSelect)
        .order("name", { ascending: true });

      if (fallback.error) {
        setMsg(formatSbError("Falha ao carregar stores.", fallback.error));
        setStores([]);
        return;
      }

      data = (fallback.data ?? []).map((s: any) => ({
        ...s,
        legal_name: null,
        cnpj: null,
        address_zip: null,
        address_street: null,
        address_number: null,
        address_complement: null,
        address_neighborhood: null,
        ie: null,
        email_nf: null,
        phone_nf: null,
        billing_email: null,
        billing_phone: null,
        asaas_customer_id: null,
      }));
    } else {
      data = first.data ?? [];
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
      const blob = `${s.name} ${s.legal_name ?? ""} ${s.cnpj ?? ""} ${s.address_street ?? ""} ${
        s.address_neighborhood ?? ""
      } ${s.address_zip ?? ""} ${s.city ?? ""} ${s.state ?? ""} ${s.code ?? ""} ${s.ie ?? ""} ${
        s.email_nf ?? ""
      } ${s.phone_nf ?? ""} ${s.billing_email ?? ""} ${s.billing_phone ?? ""} ${s.asaas_customer_id ?? ""} ${
        s.id
      }`.toLowerCase();

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

    setLegalName("");
    setCnpj("");
    setZip("");
    setStreet("");
    setNumberAddr("");
    setComplement("");
    setNeighborhood("");

    setIe("");
    setEmailNf("");
    setPhoneNf("");

    setBillingEmail("");
    setBillingPhone("");
    setAsaasCustomerId("");
  }

  function startEdit(s: StoreRow) {
    setEditingId(s.id);
    setName(s.name ?? "");
    setCity(s.city ?? "");
    setStateUf((s.state ?? "").toUpperCase());
    setActive(s.active ?? true);
    setFreightFee(s.freight_fee != null ? String(s.freight_fee) : "");
    setMsg("");

    setLegalName(s.legal_name ?? "");
    setCnpj(s.cnpj ?? "");
    setZip(s.address_zip ?? "");
    setStreet(s.address_street ?? "");
    setNumberAddr(s.address_number ?? "");
    setComplement(s.address_complement ?? "");
    setNeighborhood(s.address_neighborhood ?? "");

    setIe(s.ie ?? "");
    setEmailNf(s.email_nf ?? "");
    setPhoneNf(s.phone_nf ?? "");

    setBillingEmail(s.billing_email ?? "");
    setBillingPhone(s.billing_phone ?? "");
    setAsaasCustomerId(s.asaas_customer_id ?? "");
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

    const ln = legalName.trim();
    if (!ln) {
      setWorking(false);
      setMsg("Preencha a Razão Social.");
      return;
    }

    const cnpjNorm = normalizeCNPJ(cnpj);
    if (cnpjNorm.length !== 14) {
      setWorking(false);
      setMsg("CNPJ inválido. Informe 14 dígitos.");
      return;
    }

    const zipNorm = normalizeCEP(zip);
    if (zipNorm.length !== 8) {
      setWorking(false);
      setMsg("CEP inválido. Informe 8 dígitos.");
      return;
    }

    const st = street.trim();
    if (!st) {
      setWorking(false);
      setMsg("Preencha o Logradouro (rua/avenida).");
      return;
    }

    const num = numberAddr.trim();
    if (!num) {
      setWorking(false);
      setMsg("Preencha o Número do endereço.");
      return;
    }

    const neigh = neighborhood.trim();
    if (!neigh) {
      setWorking(false);
      setMsg("Preencha o Bairro.");
      return;
    }

    const ct = city.trim();
    if (!ct) {
      setWorking(false);
      setMsg("Preencha a Cidade.");
      return;
    }

    const uf = stateUf.trim().toUpperCase();
    if (uf.length !== 2) {
      setWorking(false);
      setMsg("UF inválida. Use 2 letras (ex.: MG).");
      return;
    }

    let ff: number | null = null;
    if (freightFee.trim() !== "") {
      const parsed = parseAmountBR(freightFee);
      if (Number.isNaN(parsed) || parsed < 0) {
        setWorking(false);
        setMsg("Frete inválido. Use número (ex.: 65 ou 65,00).");
        return;
      }
      ff = parsed;
    }

    const payload: any = {
      name: nm,
      legal_name: ln,
      cnpj: cnpjNorm,
      address_zip: zipNorm,
      address_street: st,
      address_number: num,
      address_complement: complement.trim() || null,
      address_neighborhood: neigh,
      city: ct || null,
      state: uf || null,
      active: !!active,
      freight_fee: ff,

      ie: (ie || "").trim() || null,
      email_nf: (emailNf || "").trim() || null,
      phone_nf: (phoneNf || "").trim() || null,

      billing_email: (billingEmail || "").trim() || null,
      billing_phone: (billingPhone || "").trim() || null,

      // normalmente esse campo é gerado pelo sistema, mas deixei persistindo
      // se já existir e você quiser manter manualmente
      asaas_customer_id: (asaasCustomerId || "").trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("stores").update(payload).eq("id", editingId);
      if (error) {
        setWorking(false);
        setMsg(formatSbError("Falha ao atualizar loja.", error));
        return;
      }
    } else {
      const { error } = await supabase.from("stores").insert(payload);
      if (error) {
        setWorking(false);
        setMsg(formatSbError("Falha ao criar loja.", error));
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
      setMsg(formatSbError("Falha ao ativar/desativar loja.", error));
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
    const raw = String(v ?? "").trim();
    if (!raw) return NaN;

    let s = raw.replace(/\s/g, "").replace(/[R$\u00A0]/g, "");

    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if (hasComma && hasDot) {
      const lastComma = s.lastIndexOf(",");
      const lastDot = s.lastIndexOf(".");
      if (lastComma > lastDot) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (hasComma) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }

    const n = Number(s);
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
        setMsg(formatSbError("Falha ao adicionar crédito (RPC add_store_credit).", error));
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
        setMsg(formatSbError("Falha ao remover crédito (RPC remove_store_credit).", error));
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
          <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={editingId ? "Editar loja" : "Nova loja"}>
          <div className="grid gap-3">
            <Input label="Nome" value={name} onChange={setName} placeholder="Ex.: Loja Shopping Cidade" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Razão social" value={legalName} onChange={setLegalName} placeholder="Ex.: Minha Empresa LTDA" />
              <Input label="CNPJ" value={cnpj} onChange={(v) => setCnpj(v)} placeholder="Somente números (14 dígitos)" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="CEP" value={zip} onChange={(v) => setZip(v)} placeholder="Somente números (8 dígitos)" />
              <Input label="Bairro" value={neighborhood} onChange={setNeighborhood} placeholder="Ex.: Centro" />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Input label="Logradouro" value={street} onChange={setStreet} placeholder="Rua / Av / etc." />
              </div>
              <Input label="Número" value={numberAddr} onChange={setNumberAddr} placeholder="Ex.: 123" />
            </div>

            <Input label="Complemento (opcional)" value={complement} onChange={setComplement} placeholder="Ex.: Sala 12" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Cidade" value={city} onChange={setCity} placeholder="Belo Horizonte" />
              <Input label="UF" value={stateUf} onChange={(v) => setStateUf(v.toUpperCase())} placeholder="MG" maxLength={2} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="IE (opcional)" value={ie} onChange={setIe} placeholder="Inscrição Estadual" />
              <Input label="Email NFe (opcional)" value={emailNf} onChange={setEmailNf} placeholder="financeiro@loja.com" inputMode="email" />
            </div>

            <Input label="Telefone NFe (opcional)" value={phoneNf} onChange={setPhoneNf} placeholder="(xx) xxxxx-xxxx" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Email cobrança / Asaas"
                value={billingEmail}
                onChange={setBillingEmail}
                placeholder="financeiro@loja.com"
                inputMode="email"
              />
              <Input
                label="Telefone cobrança / Asaas"
                value={billingPhone}
                onChange={setBillingPhone}
                placeholder="(xx) xxxxx-xxxx"
              />
            </div>

            <Input
              label="Asaas customer id"
              value={asaasCustomerId}
              onChange={setAsaasCustomerId}
              placeholder="Será preenchido pelo sistema quando existir"
            />

            <Input label="Frete padrão (opcional)" value={freightFee} onChange={setFreightFee} placeholder="Ex.: 65,00" />

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

        <Card title="Lista">
          <div className="grid gap-3">
            <Input value={q} onChange={setQ} placeholder="Buscar por nome, cidade, UF..." />

            {loading ? <div className="text-sm text-slate-600">Carregando...</div> : null}

            {!loading && filtered.length === 0 ? <div className="text-sm text-slate-600">Nenhuma loja encontrada.</div> : null}

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
                          {s.city ?? "-"}
                          {s.state ? `/${s.state}` : ""} {s.freight_fee != null ? `· Frete: ${money(Number(s.freight_fee))}` : ""}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {s.billing_email ? `Cobrança: ${s.billing_email}` : "Cobrança: —"}
                          {s.billing_phone ? ` · ${s.billing_phone}` : ""}
                        </div>

                        {s.asaas_customer_id ? (
                          <div className="mt-1 text-xs text-slate-500">
                            Asaas customer: <span className="font-mono">{s.asaas_customer_id}</span>
                          </div>
                        ) : null}

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

      {creditStoreId ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={closeCredit}>
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
              <Input label="Valor (R$)" value={creditAmount} onChange={setCreditAmount} placeholder="Ex.: 1.000,00" />
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

              <div className="text-xs text-slate-500">
                Se <b>ADD</b> falhar e <b>REMOVE</b> funcionar, normalmente é função inexistente / sem permissão / RLS.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}