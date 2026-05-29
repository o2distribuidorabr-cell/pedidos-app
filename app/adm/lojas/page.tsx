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

  default_payment_method?: "PIX" | "CARTAO" | "BOLETO" | null;
  default_payment_days?: number | null;
};

type CnpjaResponse = {
  ok: boolean;
  message?: string;
  raw?: any;
  company?: {
    name?: string | null;
    alias?: string | null;
    status?: string | null;
    founded?: string | null;
    nature?: string | null;
    size?: string | null;
    equity?: number | null;
  };
  address?: {
    zip?: string | null;
    street?: string | null;
    number?: string | null;
    details?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
  };
  phones?: string[];
  emails?: string[];
  registrations?: Array<{
    number?: string | null;
    state?: string | null;
    enabled?: boolean | null;
  }>;
  activity?: {
    main?: { code?: string | null; text?: string | null } | null;
    secondary?: Array<{ code?: string | null; text?: string | null }> | null;
  };
  tax?: {
    ie?: string | null;
    registrations?: Array<{
      number?: string | null;
      state?: string | null;
      enabled?: boolean | null;
      status?: string | null;
    }> | null;
    simples?: {
      opted?: boolean | null;
      since?: string | null;
    } | null;
  };
  contacts?: {
    phoneMain?: string | null;
    emailMain?: string | null;
  };
};

// ── Opções de formas de pagamento por loja ──────────────────────────────────
const STORE_PM_OPTIONS = [
  { value: "PIX_1D",             label: "Pix — 1 dia",               feePercent: 0    },
  { value: "PIX_7D",             label: "Pix — 7 dias",              feePercent: 0    },
  { value: "CREDIT_CARD_ONLINE", label: "Cartão de crédito online",  feePercent: 4.25 },
  { value: "CREDIT_PREPAGO",     label: "Crédito Pré-Pago",          feePercent: 0    },
] as const;

type StorePMValue = (typeof STORE_PM_OPTIONS)[number]["value"];

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

function DangerActionButton({
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
        "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
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

function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4 md:p-5">
      <div className="mb-4">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 break-words">{value || "-"}</div>
    </div>
  );
}

export default function AdmLojasPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [fillingCnpj, setFillingCnpj] = useState(false);
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

  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<"PIX" | "CARTAO" | "BOLETO" | "">("");
  const [defaultPaymentDays, setDefaultPaymentDays] = useState<string>("");

  // Formas de pagamento disponíveis para a loja (nova tabela store_payment_methods)
  const [storePaymentMethods, setStorePaymentMethods] = useState<Set<StorePMValue>>(new Set());

  const [tradeName, setTradeName] = useState("");
  const [companyStatus, setCompanyStatus] = useState("");
  const [companyFounded, setCompanyFounded] = useState("");
  const [companyNature, setCompanyNature] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [companyEquity, setCompanyEquity] = useState("");
  const [mainCnae, setMainCnae] = useState("");
  const [secondaryCnaes, setSecondaryCnaes] = useState("");
  const [simplesText, setSimplesText] = useState("");
  const [registrationsText, setRegistrationsText] = useState("");

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
      "id,name,city,state,active,freight_fee,code,legal_name,cnpj,address_zip,address_street,address_number,address_complement,address_neighborhood,ie,email_nf,phone_nf,billing_email,billing_phone,asaas_customer_id,default_payment_method,default_payment_days";

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
        default_payment_method: null,
        default_payment_days: null,
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

  function resetConsultationExtras() {
    setTradeName("");
    setCompanyStatus("");
    setCompanyFounded("");
    setCompanyNature("");
    setCompanySize("");
    setCompanyEquity("");
    setMainCnae("");
    setSecondaryCnaes("");
    setSimplesText("");
    setRegistrationsText("");
  }

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

    setDefaultPaymentMethod("");
    setDefaultPaymentDays("");
    setStorePaymentMethods(new Set());

    resetConsultationExtras();
  }

  async function startEdit(s: StoreRow) {
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

    setDefaultPaymentMethod((s.default_payment_method ?? "") as any);
    setDefaultPaymentDays(s.default_payment_days != null ? String(s.default_payment_days) : "");

    resetConsultationExtras();

    // Carrega formas de pagamento da loja
    const { data: pmData } = await supabase
      .from("store_payment_methods")
      .select("payment_method")
      .eq("store_id", s.id)
      .eq("enabled", true);

    const validValues = new Set(STORE_PM_OPTIONS.map((o) => o.value as string));
    const enabled = new Set<StorePMValue>(
      (pmData ?? [])
        .map((r: any) => String(r.payment_method) as StorePMValue)
        .filter((v) => validValues.has(v))
    );
    setStorePaymentMethods(enabled);
  }

  async function fillFromCNPJ() {
    setMsg("");

    const normalizedCnpj = normalizeCNPJ(cnpj);
    if (normalizedCnpj.length !== 14) {
      setMsg("CNPJ inválido. Informe 14 dígitos.");
      return;
    }

    try {
      setFillingCnpj(true);

      const resp = await fetch(`/api/cnpja/${normalizedCnpj}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = (await resp.json()) as CnpjaResponse;

      if (!resp.ok || !data.ok) {
        setMsg(data?.message || "Não foi possível consultar o CNPJ.");
        return;
      }

      setLegalName(data.company?.name ?? "");
      setName(data.company?.alias ?? data.company?.name ?? "");
      setCnpj(normalizedCnpj);
      setZip(data.address?.zip ?? "");
      setStreet(data.address?.street ?? "");
      setNumberAddr(data.address?.number ?? "");
      setComplement(data.address?.details ?? "");
      setNeighborhood(data.address?.district ?? "");
      setCity(data.address?.city ?? "");
      setStateUf((data.address?.state ?? "").toUpperCase());

      const ieFromRegistrations =
        data.registrations?.find((x) => x?.state?.toUpperCase() === (data.address?.state ?? "").toUpperCase())?.number ??
        data.registrations?.find((x) => !!x?.number)?.number ??
        "";

      setIe(ieFromRegistrations || "");
      setEmailNf(data.emails?.[0] ?? "");
      setPhoneNf(data.phones?.[0] ?? "");

      setBillingEmail(data.emails?.[0] ?? "");
      setBillingPhone(data.phones?.[0] ?? "");

      setTradeName(data.company?.alias ?? "");
      setCompanyStatus(data.company?.status ?? "");
      setCompanyFounded(data.company?.founded ?? "");
      setCompanyNature(data.company?.nature ?? "");
      setCompanySize(data.company?.size ?? "");
      setCompanyEquity(
        data.company?.equity != null && Number.isFinite(Number(data.company.equity))
          ? money(Number(data.company.equity))
          : ""
      );
      setMainCnae(data.activity?.main ? [data.activity.main.code, data.activity.main.text].filter(Boolean).join(" - ") : "");
      setSecondaryCnaes(
        Array.isArray(data.activity?.secondary)
          ? data.activity.secondary
              .map((x) => [x.code, x.text].filter(Boolean).join(" - "))
              .filter(Boolean)
              .join(" | ")
          : ""
      );
      setSimplesText(
        data.tax?.simples
          ? `Optante: ${data.tax.simples.opted ? "Sim" : "Não"}${
              data.tax.simples.since ? ` • Desde: ${data.tax.simples.since}` : ""
            }`
          : ""
      );
      setRegistrationsText(
        Array.isArray(data.registrations)
          ? data.registrations
              .map((x) =>
                [
                  x.state ?? "",
                  x.number ?? "",
                  x.enabled == null ? "" : x.enabled ? "Habilitada" : "Desabilitada",
                ]
                  .filter(Boolean)
                  .join(" - ")
              )
              .filter(Boolean)
              .join(" | ")
          : ""
      );

      setMsg("Dados do CNPJ atualizados e reaplicados no formulário.");
    } catch (error: any) {
      setMsg(error?.message || "Erro ao consultar o CNPJ.");
    } finally {
      setFillingCnpj(false);
    }
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

      default_payment_method: (defaultPaymentMethod || null) as "PIX" | "CARTAO" | "BOLETO" | null,
      default_payment_days: defaultPaymentDays.trim() !== "" ? Number(defaultPaymentDays) : null,
    };

    let savedStoreId: string | null = editingId;

    if (editingId) {
      const { error } = await supabase.from("stores").update(payload).eq("id", editingId);
      if (error) {
        setWorking(false);
        setMsg(formatSbError("Falha ao atualizar loja.", error));
        return;
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("stores")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        setWorking(false);
        setMsg(formatSbError("Falha ao criar loja.", error));
        return;
      }
      savedStoreId = (inserted as any)?.id ?? null;
    }

    // Salva formas de pagamento (store_payment_methods)
    if (savedStoreId) {
      // Remove todos os métodos existentes da loja
      const { error: delError } = await supabase
        .from("store_payment_methods")
        .delete()
        .eq("store_id", savedStoreId);

      if (delError) {
        console.warn("Aviso: não foi possível limpar store_payment_methods:", delError.message);
      }

      // Insere os métodos selecionados
      const selectedOptions = STORE_PM_OPTIONS.filter((opt) =>
        storePaymentMethods.has(opt.value)
      );

      if (selectedOptions.length > 0) {
        const methodRows = selectedOptions.map((opt, idx) => ({
          store_id: savedStoreId,
          payment_method: opt.value,
          enabled: true,
          fee_percent: opt.feePercent,
          is_default: idx === 0,
          requires_payment_before_submit: opt.value === "CREDIT_CARD_ONLINE",
        }));

        const { error: insError } = await supabase
          .from("store_payment_methods")
          .insert(methodRows);

        if (insError) {
          setWorking(false);
          setMsg(formatSbError("Loja salva, mas falha ao salvar formas de pagamento.", insError));
          await loadStores();
          return;
        }
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
        subtitle="Cadastre, consulte CNPJ, edite e administre os dados comerciais, fiscais e financeiros das unidades."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/financeiro")}>
              Financeiro
            </SecondaryActionButton>
            <SecondaryActionButton onClick={loadStores} disabled={working || loading}>
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

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <SectionTitle
              title={editingId ? "Editar loja" : "Nova loja"}
              subtitle={
                editingId
                  ? "Atualize os dados da unidade selecionada"
                  : "Preencha os dados da loja. Você pode consultar o CNPJ para reaplicar automaticamente os dados."
              }
              right={
                <div className="flex flex-wrap gap-2">
                  <SecondaryActionButton onClick={resetForm} disabled={working || fillingCnpj}>
                    Limpar
                  </SecondaryActionButton>

                  <PrimaryActionButton onClick={saveStore} disabled={working || fillingCnpj}>
                    {working ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar loja"}
                  </PrimaryActionButton>
                </div>
              }
            />

            <div className="mt-6 space-y-5">
              <FormSection
                title="Consulta automática por CNPJ"
                subtitle="Ao consultar, os campos do formulário serão preenchidos novamente com os dados mais atuais retornados pela CNPJA."
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <Input
                    label="CNPJ"
                    value={cnpj}
                    onChange={setCnpj}
                    placeholder="Somente números"
                  />

                  <div className="flex items-end">
                    <PrimaryActionButton onClick={fillFromCNPJ} disabled={fillingCnpj || working} fullWidth>
                      {fillingCnpj ? "Consultando..." : "Preencher pelo CNPJ"}
                    </PrimaryActionButton>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <ReadOnlyField label="Nome fantasia consultado" value={tradeName || "-"} />
                  <ReadOnlyField label="Situação cadastral" value={companyStatus || "-"} />
                  <ReadOnlyField label="Abertura" value={companyFounded || "-"} />
                  <ReadOnlyField label="Porte" value={companySize || "-"} />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <ReadOnlyField label="Natureza jurídica" value={companyNature || "-"} />
                  <ReadOnlyField label="Capital social" value={companyEquity || "-"} />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <ReadOnlyField label="CNAE principal" value={mainCnae || "-"} />
                  <ReadOnlyField label="Simples / enquadramento" value={simplesText || "-"} />
                </div>

                <div className="mt-3 grid gap-3">
                  <ReadOnlyField label="CNAEs secundários" value={secondaryCnaes || "-"} />
                  <ReadOnlyField label="Inscrições estaduais encontradas" value={registrationsText || "-"} />
                </div>
              </FormSection>

              <FormSection
                title="Identificação da loja"
                subtitle="Dados principais do cadastro interno"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Nome da loja"
                    value={name}
                    onChange={setName}
                    placeholder="Ex.: Loja Shopping Cidade"
                  />

                  <Input
                    label="Razão social"
                    value={legalName}
                    onChange={setLegalName}
                    placeholder="Ex.: Minha Empresa LTDA"
                  />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Input
                    label="Cidade"
                    value={city}
                    onChange={setCity}
                    placeholder="Ex.: Belo Horizonte"
                  />
                  <Input
                    label="UF"
                    value={stateUf}
                    onChange={(v) => setStateUf(v.toUpperCase())}
                    placeholder="MG"
                    maxLength={2}
                  />
                  <Input
                    label="Frete padrão"
                    value={freightFee}
                    onChange={setFreightFee}
                    placeholder="Ex.: 65,00"
                  />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Select
                    label="Ativa?"
                    value={active ? "true" : "false"}
                    onChange={(v) => setActive(v === "true")}
                    options={[
                      { value: "true", label: "Sim" },
                      { value: "false", label: "Não" },
                    ]}
                  />

                  <Input
                    label="Asaas customer id"
                    value={asaasCustomerId}
                    onChange={setAsaasCustomerId}
                    placeholder="Será preenchido pelo sistema quando existir"
                  />
                </div>
              </FormSection>

              <FormSection
                title="Endereço"
                subtitle="Endereço fiscal e operacional da loja"
              >
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

                <div className="mt-4 grid gap-4 md:grid-cols-3">
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

                <div className="mt-4">
                  <Input
                    label="Complemento"
                    value={complement}
                    onChange={setComplement}
                    placeholder="Opcional"
                  />
                </div>
              </FormSection>

              <FormSection
                title="Dados fiscais"
                subtitle="Informações usadas em emissão e conferência fiscal"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Inscrição Estadual"
                    value={ie}
                    onChange={setIe}
                    placeholder="IE"
                  />
                  <Input
                    label="CNPJ"
                    value={cnpj}
                    onChange={setCnpj}
                    placeholder="Somente números"
                  />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input
                    label="Email NFe"
                    value={emailNf}
                    onChange={setEmailNf}
                    placeholder="financeiro@loja.com"
                    inputMode="email"
                  />
                  <Input
                    label="Telefone NFe"
                    value={phoneNf}
                    onChange={setPhoneNf}
                    placeholder="(xx) xxxxx-xxxx"
                  />
                </div>
              </FormSection>

              <FormSection
                title="Cobrança"
                subtitle="Contatos de financeiro e cobrança da unidade"
              >
                <div className="grid gap-4 md:grid-cols-2">
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
                  <Select
                    label="Forma de pagamento padrão (legado)"
                    value={defaultPaymentMethod}
                    onChange={(v) => setDefaultPaymentMethod(v as any)}
                    options={[
                      { value: "", label: "Nenhuma" },
                      { value: "PIX", label: "PIX" },
                      { value: "CARTAO", label: "Cartão" },
                      { value: "BOLETO", label: "Boleto" },
                    ]}
                  />
                  <Input
                    label="Prazo de pagamento padrão (dias)"
                    value={defaultPaymentDays}
                    onChange={setDefaultPaymentDays}
                    placeholder="Ex.: 7"
                    type="number"
                  />
                </div>
              </FormSection>

              <FormSection
                title="Formas de pagamento disponíveis"
                subtitle="Selecione as opções de pagamento que esta unidade poderá utilizar ao fechar um pedido. O acréscimo percentual é aplicado automaticamente sobre o total do pedido."
              >
                <div className="grid gap-3">
                  {STORE_PM_OPTIONS.map((opt) => {
                    const checked = storePaymentMethods.has(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={[
                          "flex cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-3 transition select-none",
                          checked
                            ? "border-cyan-300 bg-cyan-50"
                            : "border-slate-200 bg-white hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setStorePaymentMethods((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(opt.value);
                              else next.delete(opt.value);
                              return next;
                            });
                          }}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 accent-cyan-600"
                        />
                        <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                          <span
                            className={[
                              "text-sm font-semibold",
                              checked ? "text-cyan-800" : "text-slate-900",
                            ].join(" ")}
                          >
                            {opt.label}
                          </span>
                          {opt.feePercent > 0 ? (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              +{opt.feePercent}%
                            </span>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {storePaymentMethods.has("CREDIT_CARD_ONLINE") ? (
                  <div className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <b>Cartão de crédito online ativo:</b> será cobrado <b>+4,25%</b> sobre o valor total do pedido. Esse acréscimo é exibido claramente para o franqueado na tela de confirmação de pedido.
                  </div>
                ) : null}
              </FormSection>

              {editingId ? (
                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  ID da loja: <span className="font-mono">{editingId}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-6">
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
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
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

                              <div className="mt-1 text-sm text-slate-500 break-all">
                                {s.legal_name ?? "-"}
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3 lg:w-[330px] lg:grid-cols-3">
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

                              {s.active ? (
                                <WarnActionButton
                                  onClick={() => toggleActive(s)}
                                  disabled={working}
                                  fullWidth
                                >
                                  Desativar
                                </WarnActionButton>
                              ) : (
                                <DangerActionButton
                                  onClick={() => toggleActive(s)}
                                  disabled={working}
                                  fullWidth
                                >
                                  Ativar
                                </DangerActionButton>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                              <div className="space-y-3">
                                <InfoPair label="CNPJ" value={formatCNPJ(s.cnpj)} />
                                <InfoPair
                                  label="Cidade / UF"
                                  value={`${s.city ?? "-"}${s.state ? ` / ${s.state}` : ""}`}
                                />
                                <InfoPair label="CEP" value={formatCEP(s.address_zip)} />
                                <InfoPair
                                  label="Endereço"
                                  value={`${s.address_street ?? "-"}${s.address_number ? `, ${s.address_number}` : ""}`}
                                />
                                <InfoPair label="Bairro" value={s.address_neighborhood ?? "-"} />
                                <InfoPair
                                  label="Frete padrão"
                                  value={s.freight_fee != null ? money(Number(s.freight_fee)) : "-"}
                                />
                              </div>
                            </div>

                            <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                              <div className="space-y-3">
                                <InfoPair label="IE" value={s.ie ?? "-"} />
                                <InfoPair label="Email NFe" value={s.email_nf ?? "-"} />
                                <InfoPair label="Telefone NFe" value={s.phone_nf ?? "-"} />
                                <InfoPair label="Email cobrança" value={s.billing_email ?? "-"} />
                                <InfoPair label="Telefone cobrança" value={s.billing_phone ?? "-"} />
                                <InfoPair label="Crédito" value={money(bal)} />
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <span>
                                Asaas customer:{" "}
                                <span className="font-mono break-all">
                                  {s.asaas_customer_id ?? "-"}
                                </span>
                              </span>
                              <span>
                                ID: <span className="font-mono break-all">{s.id}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>
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