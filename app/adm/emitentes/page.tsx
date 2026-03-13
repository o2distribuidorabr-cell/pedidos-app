"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Button, Input, Badge, Table } from "@/app/components/ui";

type EmitterRow = {
  id: string;
  name: string;
  legal_name: string;
  cnpj: string;
  ie: string | null;
  email: string | null;
  phone: string | null;
  address_zip: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  city: string | null;
  state: string | null;
  default_natureza_operacao: string | null;
  default_serie: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  name: string;
  legal_name: string;
  cnpj: string;
  ie: string;
  email: string;
  phone: string;
  address_zip: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  city: string;
  state: string;
  default_natureza_operacao: string;
  default_serie: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  legal_name: "",
  cnpj: "",
  ie: "",
  email: "",
  phone: "",
  address_zip: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  city: "",
  state: "",
  default_natureza_operacao: "VENDA DE MERCADORIA",
  default_serie: "1",
  is_active: true,
  is_default: false,
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function fmtCNPJ(v: string | null | undefined) {
  const d = onlyDigits(v || "");
  if (d.length !== 14) return v || "-";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function AdmEmitentesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [emitters, setEmitters] = useState<EmitterRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      await loadEmitters();
      setLoading(false);
    })();
  }, [router]);

  async function loadEmitters() {
    setMsg("");

    const { data, error } = await supabase
      .from("emitters")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setEmitters([]);
      return;
    }

    setEmitters((data ?? []) as EmitterRow[]);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function startEdit(row: EmitterRow) {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      legal_name: row.legal_name || "",
      cnpj: row.cnpj || "",
      ie: row.ie || "",
      email: row.email || "",
      phone: row.phone || "",
      address_zip: row.address_zip || "",
      address_street: row.address_street || "",
      address_number: row.address_number || "",
      address_complement: row.address_complement || "",
      address_neighborhood: row.address_neighborhood || "",
      city: row.city || "",
      state: row.state || "",
      default_natureza_operacao: row.default_natureza_operacao || "VENDA DE MERCADORIA",
      default_serie: row.default_serie || "1",
      is_active: !!row.is_active,
      is_default: !!row.is_default,
    });
    setMsg("");
  }

  async function saveEmitter() {
    setSaving(true);
    setMsg("");

    try {
      const cnpj = onlyDigits(form.cnpj);
      if (cnpj.length !== 14) {
        setMsg("CNPJ do emitente deve ter 14 dígitos.");
        setSaving(false);
        return;
      }

      if (!form.legal_name.trim()) {
        setMsg("Razão social é obrigatória.");
        setSaving(false);
        return;
      }

      if (!form.name.trim()) {
        setMsg("Nome fantasia é obrigatório.");
        setSaving(false);
        return;
      }

      if (form.is_default) {
        const { error: resetDefaultError } = await supabase
          .from("emitters")
          .update({ is_default: false })
          .neq("id", editingId || "00000000-0000-0000-0000-000000000000");

        if (resetDefaultError) {
          setMsg(resetDefaultError.message);
          setSaving(false);
          return;
        }
      }

      const payload = {
        name: form.name.trim(),
        legal_name: form.legal_name.trim(),
        cnpj,
        ie: form.ie.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address_zip: onlyDigits(form.address_zip) || null,
        address_street: form.address_street.trim() || null,
        address_number: form.address_number.trim() || null,
        address_complement: form.address_complement.trim() || null,
        address_neighborhood: form.address_neighborhood.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim().toUpperCase() || null,
        default_natureza_operacao: form.default_natureza_operacao.trim() || "VENDA DE MERCADORIA",
        default_serie: form.default_serie.trim() || "1",
        is_active: form.is_active,
        is_default: form.is_default,
      };

      if (editingId) {
        const { error } = await supabase.from("emitters").update(payload).eq("id", editingId);
        if (error) {
          setMsg(error.message);
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase.from("emitters").insert(payload);
        if (error) {
          setMsg(error.message);
          setSaving(false);
          return;
        }
      }

      await loadEmitters();
      resetForm();
      setMsg("Emitente salvo com sucesso.");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(row: EmitterRow) {
    setSaving(true);
    setMsg("");

    try {
      const { error: resetError } = await supabase
        .from("emitters")
        .update({ is_default: false })
        .neq("id", row.id);

      if (resetError) {
        setMsg(resetError.message);
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("emitters")
        .update({ is_default: true })
        .eq("id", row.id);

      if (error) {
        setMsg(error.message);
        setSaving(false);
        return;
      }

      await loadEmitters();
      setMsg("Emitente padrão definido.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: EmitterRow) {
    setSaving(true);
    setMsg("");

    try {
      const { error } = await supabase
        .from("emitters")
        .update({ is_active: !row.is_active })
        .eq("id", row.id);

      if (error) {
        setMsg(error.message);
        setSaving(false);
        return;
      }

      await loadEmitters();
      setMsg("Status atualizado.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Card>Carregando...</Card>;

  const rows = emitters.map((row) => [
    <div key="name">
      <div className="font-semibold text-slate-900">{row.name}</div>
      <div className="text-xs text-slate-500">{row.legal_name}</div>
    </div>,
    <span key="cnpj">{fmtCNPJ(row.cnpj)}</span>,
    <span key="ie">{row.ie || "-"}</span>,
    <div key="city">
      {[row.city, row.state].filter(Boolean).join("/") || "-"}
    </div>,
    <div key="badges" className="flex gap-2">
      {row.is_active ? <Badge tone="green">Ativo</Badge> : <Badge tone="red">Inativo</Badge>}
      {row.is_default ? <Badge tone="blue">Padrão</Badge> : <Badge tone="neutral">Normal</Badge>}
    </div>,
    <div key="actions" className="flex flex-wrap gap-2">
      <Button onClick={() => startEdit(row)}>Editar</Button>
      <Button onClick={() => makeDefault(row)} disabled={saving || row.is_default}>
        Tornar padrão
      </Button>
      <Button onClick={() => toggleActive(row)} disabled={saving}>
        {row.is_active ? "Desativar" : "Ativar"}
      </Button>
    </div>,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emitentes"
        subtitle="Cadastro das empresas emissoras de NF-e"
        right={
          <div className="flex gap-2">
            <Button onClick={resetForm}>Novo emitente</Button>
            <Button onClick={() => router.push("/adm/pedidos")}>Voltar</Button>
          </div>
        }
      />

      {msg ? (
        <Card>
          <div className="text-sm text-red-600 whitespace-pre-wrap">{msg}</div>
        </Card>
      ) : null}

      <Card title={editingId ? "Editar emitente" : "Cadastrar emitente"}>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Nome fantasia" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} />
          <Input label="Razão social" value={form.legal_name} onChange={(v) => setForm((p) => ({ ...p, legal_name: v }))} />
          <Input label="CNPJ" value={form.cnpj} onChange={(v) => setForm((p) => ({ ...p, cnpj: v }))} />
          <Input label="IE" value={form.ie} onChange={(v) => setForm((p) => ({ ...p, ie: v }))} />
          <Input label="E-mail" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} />
          <Input label="Telefone" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
          <Input label="CEP" value={form.address_zip} onChange={(v) => setForm((p) => ({ ...p, address_zip: v }))} />
          <Input label="Logradouro" value={form.address_street} onChange={(v) => setForm((p) => ({ ...p, address_street: v }))} />
          <Input label="Número" value={form.address_number} onChange={(v) => setForm((p) => ({ ...p, address_number: v }))} />
          <Input label="Complemento" value={form.address_complement} onChange={(v) => setForm((p) => ({ ...p, address_complement: v }))} />
          <Input label="Bairro" value={form.address_neighborhood} onChange={(v) => setForm((p) => ({ ...p, address_neighborhood: v }))} />
          <Input label="Cidade" value={form.city} onChange={(v) => setForm((p) => ({ ...p, city: v }))} />
          <Input label="UF" value={form.state} onChange={(v) => setForm((p) => ({ ...p, state: v }))} />
          <Input
            label="Natureza operação padrão"
            value={form.default_natureza_operacao}
            onChange={(v) => setForm((p) => ({ ...p, default_natureza_operacao: v }))}
          />
          <Input
            label="Série padrão"
            value={form.default_serie}
            onChange={(v) => setForm((p) => ({ ...p, default_serie: v }))}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Emitente ativo
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
            />
            Emitente padrão
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={saveEmitter} disabled={saving}>
            {saving ? "Salvando..." : "Salvar emitente"}
          </Button>
          <Button onClick={resetForm} disabled={saving}>
            Limpar
          </Button>
        </div>
      </Card>

      <Card title="Emitentes cadastrados">
        <Table
          headers={["Emitente", "CNPJ", "IE", "Cidade/UF", "Status", "Ações"]}
          rows={rows}
        />
      </Card>
    </div>
  );
}