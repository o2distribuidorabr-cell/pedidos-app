"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Button, Input, Select, Badge } from "@/app/components/ui";

type CompanySettingsRow = {
  id: number;

  legal_name: string | null;
  trade_name: string | null;
  cnpj: string | null;
  ie: string | null;
  im: string | null;
  crt: string | null; // "1" | "2" | "3"

  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  city: string | null;
  state: string | null;

  phone: string | null;
  email: string | null;

  nfe_series: string | null;
  nfe_next_number: number | null;

  updated_at: string | null;
};

function onlyDigits(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}
function normCNPJ(v: string) {
  return onlyDigits(v).slice(0, 14);
}
function normCEP(v: string) {
  return onlyDigits(v).slice(0, 8);
}
function normUF(v: string) {
  return String(v ?? "").trim().toUpperCase().slice(0, 2);
}
function fmtDT(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return String(v);
  }
}

export default function AdmEmitentePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [row, setRow] = useState<CompanySettingsRow | null>(null);

  // Form (mantém simples)
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [ie, setIe] = useState("");
  const [im, setIm] = useState("");
  const [crt, setCrt] = useState<string>(""); // "" | "1" | "2" | "3"

  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [numberAddr, setNumberAddr] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [nfeSeries, setNfeSeries] = useState("");
  const [nfeNext, setNfeNext] = useState("");

  const crtLabel = useMemo(() => {
    if (crt === "1") return "1 - Simples Nacional";
    if (crt === "2") return "2 - Simples (excesso sublimite)";
    if (crt === "3") return "3 - Regime Normal";
    return "—";
  }, [crt]);

  function fillForm(r: CompanySettingsRow | null) {
    setRow(r);

    setLegalName(r?.legal_name ?? "");
    setTradeName(r?.trade_name ?? "");
    setCnpj(r?.cnpj ?? "");
    setIe(r?.ie ?? "");
    setIm(r?.im ?? "");
    setCrt(r?.crt ?? "");

    setZip(r?.address_zip ?? "");
    setStreet(r?.address_street ?? "");
    setNumberAddr(r?.address_number ?? "");
    setComplement(r?.address_complement ?? "");
    setNeighborhood(r?.address_neighborhood ?? "");
    setCity(r?.city ?? "");
    setStateUf(r?.state ?? "");

    setPhone(r?.phone ?? "");
    setEmail(r?.email ?? "");

    setNfeSeries(r?.nfe_series ?? "");
    setNfeNext(r?.nfe_next_number != null ? String(r.nfe_next_number) : "");
  }

  async function load() {
    setMsg("");

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      router.push("/login");
      return;
    }

    // 1 registro (id=1)
    const { data, error } = await supabase
      .from("company_settings")
      .select(
        "id,legal_name,trade_name,cnpj,ie,im,crt,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state,phone,email,nfe_series,nfe_next_number,updated_at"
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      setMsg(error.message);
      fillForm(null);
      return;
    }

    fillForm((data ?? null) as any);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSave() {
    setMsg("");
    setWorking(true);

    const ln = legalName.trim();
    if (!ln) {
      setWorking(false);
      setMsg("Preencha a Razão Social.");
      return;
    }

    const cnpjNorm = normCNPJ(cnpj);
    if (cnpjNorm.length !== 14) {
      setWorking(false);
      setMsg("CNPJ inválido. Informe 14 dígitos.");
      return;
    }

    const zipNorm = normCEP(zip);
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

    const uf = normUF(stateUf);
    if (uf.length !== 2) {
      setWorking(false);
      setMsg("UF inválida. Use 2 letras (ex.: MG).");
      return;
    }

    if (crt && !["1", "2", "3"].includes(crt)) {
      setWorking(false);
      setMsg("CRT inválido. Use 1, 2 ou 3 (ou deixe em branco).");
      return;
    }

    let nextNum: number | null = null;
    if (String(nfeNext ?? "").trim() !== "") {
      const parsed = Number(String(nfeNext).replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) {
        setWorking(false);
        setMsg("Próximo número inválido. Use um número inteiro (ex.: 1).");
        return;
      }
      nextNum = Math.floor(parsed);
    }

    const payload: Partial<CompanySettingsRow> = {
      id: 1,

      legal_name: ln,
      trade_name: tradeName.trim() || null,
      cnpj: cnpjNorm,
      ie: ie.trim() || null,
      im: im.trim() || null,
      crt: crt.trim() || null,

      address_zip: zipNorm,
      address_street: st,
      address_number: num,
      address_complement: complement.trim() || null,
      address_neighborhood: neigh,
      city: ct,
      state: uf,

      phone: phone.trim() || null,
      email: email.trim() || null,

      nfe_series: nfeSeries.trim() || null,
      nfe_next_number: nextNum,
    };

    // upsert id=1
    const { error } = await supabase.from("company_settings").upsert([payload], { onConflict: "id" });

    if (error) {
      setWorking(false);
      setMsg(error.message);
      return;
    }

    setWorking(false);
    await load();
    setMsg("Emitente salvo com sucesso.");
  }

  const headerRight = (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => router.push("/adm/pedidos")} disabled={working}>
        Pedidos
      </Button>
      <Button variant="secondary" onClick={() => router.push("/adm/produtos")} disabled={working}>
        Produtos
      </Button>
      <Button variant="secondary" onClick={load} disabled={working || loading}>
        Atualizar
      </Button>
      <Button onClick={onSave} disabled={working || loading}>
        {working ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Emitente" subtitle="Cadastro do emitente (NF-e)" right={headerRight} />
        <Card>Carregando...</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Emitente" subtitle="Cadastro do emitente (NF-e)" right={headerRight} />

      {msg ? (
        <Card>
          <div className="text-sm text-slate-800 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <Card
        title="Status"
        right={
          <div className="flex items-center gap-2">
            <Badge tone={row?.cnpj && row.cnpj !== "00000000000000" ? "green" : "yellow"}>
              {row?.cnpj && row.cnpj !== "00000000000000" ? "Configurado" : "Pendente"}
            </Badge>
            <Badge tone="neutral">Atualizado: {fmtDT(row?.updated_at)}</Badge>
          </div>
        }
      >
        <div className="text-sm text-slate-700">
          Este cadastro fica salvo no Supabase e será usado quando você plugar a API de emissão de NF-e.
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Identificação">
          <div className="grid gap-3">
            <Input label="Razão social" value={legalName} onChange={setLegalName} placeholder="Ex.: O2 Distribuidora LTDA" />
            <Input label="Nome fantasia (opcional)" value={tradeName} onChange={setTradeName} placeholder="Ex.: O2 Distribuidora" />

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="CNPJ" value={cnpj} onChange={setCnpj} placeholder="Somente números (14 dígitos)" />
              <Input label="IE (opcional)" value={ie} onChange={setIe} placeholder="Inscrição Estadual" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="IM (opcional)" value={im} onChange={setIm} placeholder="Inscrição Municipal" />

              <Select
                label="CRT (opcional)"
                value={crt}
                onChange={setCrt}
                options={[
                  { value: "", label: "—" },
                  { value: "1", label: "1 - Simples Nacional" },
                  { value: "2", label: "2 - Simples (excesso sublimite)" },
                  { value: "3", label: "3 - Regime Normal" },
                ]}
              />
            </div>

            <div className="text-xs text-slate-500">
              CRT atual: <b>{crtLabel}</b>
            </div>
          </div>
        </Card>

        <Card title="Endereço">
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="CEP" value={zip} onChange={setZip} placeholder="Somente números (8 dígitos)" />
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
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Contato (opcional)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Telefone" value={phone} onChange={setPhone} placeholder="(xx) xxxxx-xxxx" />
            <Input label="E-mail" value={email} onChange={setEmail} placeholder="financeiro@..." inputMode="email" autoCapitalize="none" />
          </div>
        </Card>

        <Card title="NF-e (opcional, para plugar depois)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Série (opcional)" value={nfeSeries} onChange={setNfeSeries} placeholder="Ex.: 1" />
            <Input label="Próximo número (opcional)" value={nfeNext} onChange={setNfeNext} placeholder="Ex.: 1" />
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Se você não quiser controlar numeração aqui, deixa em branco. A maioria das APIs controla isso do lado delas.
          </div>
        </Card>
      </div>
    </div>
  );
}