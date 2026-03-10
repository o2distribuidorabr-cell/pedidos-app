"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Input, Select, Badge, StatCard } from "@/app/components/ui";

type StoreRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  active: boolean | null;

  code?: string | null;
  freight_fee?: number | null;

  legal_name: string | null;
  cnpj: string | null;

  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;

  ie?: string | null;
  email_nf?: string | null;
  phone_nf?: string | null;

  billing_email?: string | null;
  billing_phone?: string | null;
  asaas_customer_id?: string | null;
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function formatCNPJ(v: string | null | undefined) {
  const d = onlyDigits(v || "");
  if (d.length !== 14) return v || "-";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatCEP(v: string | null | undefined) {
  const d = onlyDigits(v || "");
  if (d.length !== 8) return v || "-";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
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

function formatSbError(prefix: string, err: any) {
  const parts: string[] = [];
  parts.push(prefix);
  if (err?.message) parts.push(`message: ${err.message}`);
  if (err?.details) parts.push(`details: ${err.details}`);
  if (err?.hint) parts.push(`hint: ${err.hint}`);
  if (err?.code) parts.push(`code: ${err.code}`);
  return parts.join(" | ");
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

function WarnActionButton({
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
        "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="text-sm text-slate-600">{text}</div>
    </div>
  );
}

export default function AdmLojasPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [balancesByStore, setBalancesByStore] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [active, setActive] = useState(true);
  const [freightFee, setFreightFee] = useState<string>("");

  const [legalName, setLegalName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [numberAddr, setNumberAddr] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");

  const [ie, setIe] = useState("");
  const [emailNf, setEmailNf] = useState("");
  const [phoneNf, setPhoneNf] = useState("");

  const [billingEmail, setBillingEmail] = useState("");
  const [billingPhone, setBillingPhone] = useState("");
  const [asaasCustomerId, setAsaasCustomerId] = useState("");

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

    const first = await supabase.from("stores").select(fullSelect).order("name", { ascending: true });

    if (first.error) {
      console.warn("loadStores fullSelect error:", first.error);

      const fallback = await supabase.from("stores").select(baseSelect).order("name", { ascending: true });

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
      } ${s.phone_nf ?? ""} ${s.billing_email ?? ""} ${s.billing_phone ?? ""} ${
        s.asaas_customer_id ?? ""
      } ${s.id}`.toLowerCase();

      return blob.includes(qq);
    });
  }, [stores, q]);

  const summary = useMemo(() => {
    return {
      total: stores.length,
      active: stores.filter((s) => s.active ?? true).length,
      inactive: stores.filter((s) => !(s.active ?? true)).length,
      totalCredit: Object.values(balancesByStore).reduce((acc, v) => acc + (Number(v) || 0), 0),
    };
  }, [stores, balancesByStore]);

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
      setMsg("Preencha o Logradouro.");
      return;
    }

    const num = numberAddr.trim();
    if (!num) {
      setWorking(false);
      setMsg("Preencha o número do endereço.");
      return;
    }

    const neigh = neighborhood.trim();
    if (!neigh) {
      setWorking(false);
      setMsg("Preencha o bairro.");
      return;
    }

    const ct = city.trim();
    if (!ct) {
      setWorking(false);
      setMsg("Preencha a cidade.");
      return;
    }

    const uf = stateUf.trim().toUpperCase();
    if (uf.length !== 2) {
      setWorking(false);
      setMsg("UF inválida. Use 2 letras.");
      return;
    }

    let ff: number | null = null;
    if (freightFee.trim() !== "") {
      const parsed = parseAmountBR(freightFee);
      if (Number.isNaN(parsed) || parsed < 0) {
        setWorking(false);
        setMsg("Frete inválido. Use número válido.");
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

  async function applyCredit() {
    if (!creditStoreId) return;

    setMsg("");
    setWorking(true);

    const amt = parseAmountBR(creditAmount);
    if (Number.isNaN(amt) || amt <= 0) {
      setWorking(false);
      setMsg("Informe um valor válido maior que zero.");
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
        subtitle="Cadastre, edite e administre os dados comerciais, fiscais e financeiros das unidades."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/financeiro")}>
              Financeiro
            </SecondaryActionButton>
            <SecondaryActionButton onClick={loadStores} disabled={working}>
              Atualizar
            </SecondaryActionButton>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle="Resumo das lojas e do crédito pré-pago"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total de lojas" value={summary.total} />
          <StatCard label="Lojas ativas" value={summary.active} />
          <StatCard label="Lojas inativas" value={summary.inactive} />
          <StatCard label="Crédito total" value={money(summary.totalCredit)} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title={editingId ? "Editar loja" : "Nova loja"}
            subtitle={editingId ? "Atualize os dados da unidade selecionada" : "Preencha os dados para cadastrar uma nova unidade"}
          />

          <div className="mt-6 grid gap-4">
            <Input
              label="Nome da loja"
              value={name}
              onChange={setName}
              placeholder="Ex.: Loja Shopping Cidade"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Razão social"
                value={legalName}
                onChange={setLegalName}
                placeholder="Ex.: Minha Empresa LTDA"
              />
              <Input
                label="CNPJ"
                value={cnpj}
                onChange={setCnpj}
                placeholder="Somente números"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="CEP"
                value={zip}
                onChange={setZip}
                placeholder="Somente números"
              />
              <Input
                label="Bairro"
                value={neighborhood}
                onChange={setNeighborhood}
                placeholder="Ex.: Centro"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input
                  label="Logradouro"
                  value={street}
                  onChange={setStreet}
                  placeholder="Rua / Avenida / etc."
                />
              </div>
              <Input
                label="Número"
                value={numberAddr}
                onChange={setNumberAddr}
                placeholder="Ex.: 123"
              />
            </div>

            <Input
              label="Complemento"
              value={complement}
              onChange={setComplement}
              placeholder="Opcional"
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Cidade"
                value={city}
                onChange={setCity}
                placeholder="Belo Horizonte"
              />
              <Input
                label="UF"
                value={stateUf}
                onChange={(v) => setStateUf(v.toUpperCase())}
                placeholder="MG"
                maxLength={2}
              />
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Dados fiscais</div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input
                  label="IE"
                  value={ie}
                  onChange={setIe}
                  placeholder="Inscrição Estadual"
                />
                <Input
                  label="Email NFe"
                  value={emailNf}
                  onChange={setEmailNf}
                  placeholder="financeiro@loja.com"
                  inputMode="email"
                />
              </div>

              <div className="mt-4">
                <Input
                  label="Telefone NFe"
                  value={phoneNf}
                  onChange={setPhoneNf}
                  placeholder="(xx) xxxxx-xxxx"
                />
              </div>
            </div>

            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Cobrança / Asaas</div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input
                  label="Email cobrança"
                  value={billingEmail}
                  onChange={setBillingEmail}
                  placeholder="financeiro@loja.com"
                  inputMode="email"
                />
                <Input
                  label="Telefone cobrança"
                  value={billingPhone}
                  onChange={setBillingPhone}
                  placeholder="(xx) xxxxx-xxxx"
                />
              </div>

              <div className="mt-4">
                <Input
                  label="Asaas customer id"
                  value={asaasCustomerId}
                  onChange={setAsaasCustomerId}
                  placeholder="Será preenchido pelo sistema quando existir"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Frete padrão"
                value={freightFee}
                onChange={setFreightFee}
                placeholder="Ex.: 65,00"
              />
              <Select
                label="Ativa?"
                value={active ? "true" : "false"}
                onChange={(v) => setActive(v === "true")}
                options={[
                  { value: "true", label: "Sim" },
                  { value: "false", label: "Não" },
                ]}
              />
            </div>

            <div className="grid gap-2 pt-2 sm:grid-cols-2">
              <SecondaryActionButton onClick={resetForm} disabled={working} fullWidth>
                Limpar
              </SecondaryActionButton>

              <PrimaryActionButton onClick={saveStore} disabled={working} fullWidth>
                {working ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar loja"}
              </PrimaryActionButton>
            </div>

            {editingId ? (
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                ID da loja: <span className="font-mono">{editingId}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <SectionTitle
            title="Lista de lojas"
            subtitle="Busque, edite, ative/desative e gerencie crédito por unidade"
          />

          <div className="mt-6">
            <Input
              label="Buscar"
              value={q}
              onChange={setQ}
              placeholder="Nome, razão social, CNPJ, cidade, UF, endereço..."
            />
          </div>

          <div className="mt-6 space-y-4">
            {loading ? <EmptyState text="Carregando lojas..." /> : null}

            {!loading && filtered.length === 0 ? (
              <EmptyState text="Nenhuma loja encontrada." />
            ) : null}

            {!loading && filtered.length > 0
              ? filtered.map((s) => {
                  const bal = balancesByStore[s.id] ?? 0;

                  return (
                    <div
                      key={s.id}
                      className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-semibold text-slate-900">
                              {s.name}
                            </div>
                            <Badge tone={s.active ? "green" : "red"}>
                              {s.active ? "Ativa" : "Inativa"}
                            </Badge>
                            {bal > 0 ? <Badge tone="blue">Com crédito</Badge> : null}
                          </div>

                          <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                            <div className="space-y-3">
                              <InfoPair label="Razão social" value={s.legal_name ?? "-"} />
                              <InfoPair label="CNPJ" value={formatCNPJ(s.cnpj)} />
                              <InfoPair
                                label="Cidade / UF"
                                value={`${s.city ?? "-"}${s.state ? ` / ${s.state}` : ""}`}
                              />
                              <InfoPair
                                label="Endereço"
                                value={`${s.address_street ?? "-"}${s.address_number ? `, ${s.address_number}` : ""}`}
                              />
                              <InfoPair label="Bairro" value={s.address_neighborhood ?? "-"} />
                              <InfoPair label="CEP" value={formatCEP(s.address_zip)} />
                              <InfoPair
                                label="Frete padrão"
                                value={s.freight_fee != null ? money(Number(s.freight_fee)) : "-"}
                              />
                              <InfoPair label="Email cobrança" value={s.billing_email ?? "-"} />
                              <InfoPair label="Telefone cobrança" value={s.billing_phone ?? "-"} />
                              <InfoPair
                                label="Asaas customer"
                                value={
                                  s.asaas_customer_id ? (
                                    <span className="break-all font-mono text-xs">
                                      {s.asaas_customer_id}
                                    </span>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoPair label="Crédito" value={money(bal)} />
                              <InfoPair
                                label="ID"
                                value={
                                  <span className="break-all font-mono text-xs">{s.id}</span>
                                }
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-3 xl:w-[320px] xl:grid-cols-1">
                          <SecondaryActionButton
                            onClick={() => startEdit(s)}
                            disabled={working}
                            fullWidth
                          >
                            Editar
                          </SecondaryActionButton>

                          <PrimaryActionButton
                            onClick={() => openCredit(s)}
                            disabled={working}
                            fullWidth
                          >
                            Crédito
                          </PrimaryActionButton>

                          <WarnActionButton
                            onClick={() => toggleActive(s)}
                            disabled={working}
                            fullWidth
                          >
                            {s.active ? "Desativar" : "Ativar"}
                          </WarnActionButton>
                        </div>
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        </div>
      </div>

      {creditStoreId ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={closeCredit}
        >
          <div
            className="w-full max-w-xl rounded-[30px] border border-slate-200 bg-white p-5 shadow-2xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <SectionTitle
              title="Crédito pré-pago"
              subtitle={`Loja: ${creditStore?.name ?? creditStoreId}`}
              right={
                <SecondaryActionButton onClick={closeCredit} disabled={working}>
                  Fechar
                </SecondaryActionButton>
              }
            />

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <StatCard label="Saldo atual" value={money(creditBalance)} />
              <StatCard
                label="Operação"
                value={creditMode === "ADD" ? "Adicionar" : "Remover"}
              />
              <StatCard label="Saldo após" value={money(previewAfter)} />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <PrimaryActionButton
                onClick={() => setCreditMode("ADD")}
                disabled={working || creditMode === "ADD"}
              >
                Adicionar
              </PrimaryActionButton>

              <SecondaryActionButton
                onClick={() => setCreditMode("REMOVE")}
                disabled={working || creditMode === "REMOVE"}
              >
                Remover
              </SecondaryActionButton>
            </div>

            <div className="mt-6 grid gap-4">
              <Input
                label="Valor (R$)"
                value={creditAmount}
                onChange={setCreditAmount}
                placeholder="Ex.: 1.000,00"
              />

              <Input
                label="Observação"
                value={creditNote}
                onChange={setCreditNote}
                placeholder={
                  creditMode === "ADD"
                    ? "Ex.: Crédito antecipado do mês"
                    : "Ex.: Ajuste / Estorno"
                }
              />
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <SecondaryActionButton onClick={closeCredit} disabled={working} fullWidth>
                Cancelar
              </SecondaryActionButton>

              <PrimaryActionButton onClick={applyCredit} disabled={working} fullWidth>
                {working ? "Salvando..." : creditMode === "ADD" ? "Adicionar crédito" : "Remover crédito"}
              </PrimaryActionButton>
            </div>

            <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Se <b>ADD</b> falhar e <b>REMOVE</b> funcionar, normalmente é função inexistente, sem permissão ou bloqueio por RLS.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}