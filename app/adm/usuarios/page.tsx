"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card, Input, Badge, StatCard } from "@/app/components/ui";
import {
  ADMIN_PERMISSION_FIELDS,
  clonePermissions,
  EMPTY_ADMIN_PERMISSIONS,
  FULL_ADMIN_PERMISSIONS,
  type AdminPermissions,
} from "@/lib/adminPermissions";

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

function PermissionCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-[16px] border border-slate-200 bg-white px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
      <span className="text-sm font-medium text-slate-800">{label}</span>
    </label>
  );
}

type AdminListRow = {
  id: string;
  role: string | null;
  store_id: string | null;
  approved: boolean | null;
  is_admin: boolean | null;
  created_at: string | null;
  email: string | null;
  store_name?: string | null;
  permissions?: Partial<AdminPermissions> | null;
};

function fmtDateTime(v: string | null | undefined) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString("pt-BR");
  } catch {
    return v;
  }
}

function shortId(id: string | null | undefined) {
  const v = String(id || "");
  if (!v) return "-";
  return `${v.slice(0, 8)}...${v.slice(-6)}`;
}

export default function AdmUsuariosPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");

  const [permissions, setPermissions] = useState<AdminPermissions>(
    clonePermissions(EMPTY_ADMIN_PERMISSIONS)
  );

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mensagem, setMensagem] = useState<string>("");
  const [tone, setTone] = useState<"green" | "red" | "slate">("slate");

  const [admins, setAdmins] = useState<AdminListRow[]>([]);
  const [savingPermissionUserId, setSavingPermissionUserId] = useState<string | null>(null);

  async function bootstrap() {
    const ok = await requireAdminOrRedirect(router);
    if (!ok) return;
    await loadAdmins();
    setLoading(false);
  }

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAdmins() {
    setMensagem("");

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id,role,store_id,approved,is_admin,created_at,email")
      .eq("is_admin", true)
      .order("created_at", { ascending: false });

    if (profileError) {
      setTone("red");
      setMensagem(profileError.message);
      setAdmins([]);
      return;
    }

    const rows = (profiles ?? []) as AdminListRow[];
    const ids = rows.map((p) => p.id).filter(Boolean);
    const storeIds = rows.map((p) => p.store_id).filter(Boolean) as string[];

    let permissionMap = new Map<string, Partial<AdminPermissions>>();
    let storeMap = new Map<string, string>();

    if (ids.length > 0) {
      const { data: perms, error: permError } = await supabase
        .from("admin_permissions")
        .select(`
          user_id,
          can_dashboard,
          can_orders,
          can_expedition,
          can_separation_map,
          can_fiscal_issue,
          can_fiscal_products,
          can_fiscal_rules,
          can_registrations,
          can_users,
          can_stores,
          can_products,
          can_emitters,
          can_financial,
          can_credit
        `)
        .in("user_id", ids);

      if (permError) {
        setTone("red");
        setMensagem(permError.message);
      } else {
        permissionMap = new Map(
          (perms ?? []).map((p: any) => [
            p.user_id,
            {
              can_dashboard: !!p.can_dashboard,
              can_orders: !!p.can_orders,
              can_expedition: !!p.can_expedition,
              can_separation_map: !!p.can_separation_map,
              can_fiscal_issue: !!p.can_fiscal_issue,
              can_fiscal_products: !!p.can_fiscal_products,
              can_fiscal_rules: !!p.can_fiscal_rules,
              can_registrations: !!p.can_registrations,
              can_users: !!p.can_users,
              can_stores: !!p.can_stores,
              can_products: !!p.can_products,
              can_emitters: !!p.can_emitters,
              can_financial: !!p.can_financial,
              can_credit: !!p.can_credit,
            },
          ])
        );
      }
    }

    if (storeIds.length > 0) {
      const uniqueStoreIds = Array.from(new Set(storeIds));
      const { data: storesData } = await supabase
        .from("stores")
        .select("id,name")
        .in("id", uniqueStoreIds);

      storeMap = new Map(
        (storesData ?? []).map((s: any) => [s.id, s.name || s.id])
      );
    }

    const merged: AdminListRow[] = rows.map((p) => ({
      ...p,
      store_name: p.store_id ? storeMap.get(p.store_id) || null : null,
      permissions: permissionMap.get(p.id) || clonePermissions(EMPTY_ADMIN_PERMISSIONS),
    }));

    setAdmins(merged);
  }

  async function criarUsuario() {
    setWorking(true);
    setMensagem("Criando usuário...");
    setTone("slate");

    try {
      const ok = await requireAdminOrRedirect(router);
      if (!ok) {
        setWorking(false);
        return;
      }

      const { data: sess, error: sErr } = await supabase.auth.getSession();
      if (sErr) {
        setTone("red");
        setMensagem("Erro ao obter sessão: " + sErr.message);
        setWorking(false);
        return;
      }

      const token = sess.session?.access_token;
      if (!token) {
        setTone("red");
        setMensagem("Sem token de sessão. Faça login novamente e tente de novo.");
        setWorking(false);
        return;
      }

      const res = await fetch("/.netlify/functions/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          password: senha,
          name: nome.trim(),
          permissions,
        }),
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { raw };
      }

      if (!res.ok) {
        console.error("create-user response error:", {
          status: res.status,
          data,
          raw,
        });

        setTone("red");
        setMensagem(
          data?.error ||
            data?.message ||
            raw ||
            `Falha ao criar usuário. HTTP ${res.status}`
        );
        setWorking(false);
        return;
      }

      setTone("green");
      setMensagem(data?.message || "Usuário criado com sucesso.");
      setEmail("");
      setSenha("");
      setNome("");
      setPermissions(clonePermissions(EMPTY_ADMIN_PERMISSIONS));
      await loadAdmins();
      setWorking(false);
    } catch (e: any) {
      console.error("criarUsuario fatal:", e);
      setTone("red");
      setMensagem(e?.message || "Erro ao conectar com o servidor.");
      setWorking(false);
    }
  }

  async function saveExistingPermissions(userId: string, nextPermissions: AdminPermissions) {
    setSavingPermissionUserId(userId);
    setMensagem("");
    setTone("slate");

    const { error } = await supabase.from("admin_permissions").upsert(
      {
        user_id: userId,
        ...nextPermissions,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Erro ao salvar permissões:", error);
      setTone("red");
      setMensagem(error.message || JSON.stringify(error));
      setSavingPermissionUserId(null);
      return;
    }

    setTone("green");
    setMensagem("Permissões atualizadas.");
    await loadAdmins();
    setSavingPermissionUserId(null);
  }

  const canSubmit =
    nome.trim().length > 0 &&
    email.trim().length > 0 &&
    senha.length > 0 &&
    !working;

  const totalSelected = useMemo(
    () => Object.values(permissions).filter(Boolean).length,
    [permissions]
  );

  const groupedPermissionFields = useMemo(() => {
    const map = new Map<string, typeof ADMIN_PERMISSION_FIELDS>();
    for (const field of ADMIN_PERMISSION_FIELDS) {
      const arr = map.get(field.group) || [];
      arr.push(field);
      map.set(field.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        subtitle="Crie administradores e defina exatamente o que cada um pode acessar."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>
              Pedidos
            </SecondaryActionButton>
            <SecondaryActionButton onClick={() => router.push("/adm/lojas")}>
              Lojas
            </SecondaryActionButton>
          </div>
        }
      />

      {mensagem ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>
              {tone === "green" ? "OK" : tone === "red" ? "ERRO" : "INFO"}
            </Badge>
            <div
              className={`text-sm whitespace-pre-wrap ${
                tone === "red"
                  ? "text-red-600"
                  : tone === "green"
                  ? "text-green-700"
                  : "text-slate-700"
              }`}
            >
              {mensagem}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <SectionTitle
          title="Visão geral"
          subtitle="Resumo da criação do administrador e das permissões selecionadas"
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Nome" value={nome.trim() ? "OK" : "Pendente"} />
          <StatCard label="Email" value={email.trim() ? "OK" : "Pendente"} />
          <StatCard label="Senha" value={senha ? "OK" : "Pendente"} />
          <StatCard label="Permissões marcadas" value={String(totalSelected)} />
        </div>
      </div>

      {loading ? <EmptyState text="Carregando permissões..." /> : null}

      {!loading ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <SectionTitle
                title="Criar novo administrador"
                subtitle="Informe os dados e marque exatamente os módulos liberados"
                right={
                  <div className="flex gap-2">
                    <SecondaryActionButton
                      onClick={() => setPermissions(clonePermissions(FULL_ADMIN_PERMISSIONS))}
                    >
                      Marcar tudo
                    </SecondaryActionButton>
                    <SecondaryActionButton
                      onClick={() => setPermissions(clonePermissions(EMPTY_ADMIN_PERMISSIONS))}
                    >
                      Limpar permissões
                    </SecondaryActionButton>
                  </div>
                }
              />

              <div className="mt-6 grid gap-4">
                <div className="max-w-xl grid gap-4">
                  <Input
                    label="Nome"
                    placeholder="Nome do administrador"
                    value={nome}
                    onChange={setNome}
                  />

                  <Input
                    label="Email"
                    placeholder="email@dominio.com"
                    value={email}
                    onChange={setEmail}
                  />

                  <Input
                    label="Senha"
                    placeholder="Senha"
                    value={senha}
                    onChange={setSenha}
                    type="password"
                  />
                </div>

                <div className="pt-2">
                  <div className="text-sm font-semibold text-slate-900">Permissões do usuário</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Tudo que estiver desmarcado ficará oculto no menu e bloqueado no acesso.
                  </div>
                </div>

                <div className="space-y-5">
                  {groupedPermissionFields.map(([group, fields]) => (
                    <div key={group} className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-900">{group}</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {fields.map((field) => (
                          <PermissionCheckbox
                            key={field.key}
                            label={field.label}
                            checked={permissions[field.key]}
                            onChange={(checked) =>
                              setPermissions((prev) => ({
                                ...prev,
                                [field.key]: checked,
                              }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-2 pt-2 sm:grid-cols-2">
                  <SecondaryActionButton
                    onClick={() => {
                      setNome("");
                      setEmail("");
                      setSenha("");
                      setMensagem("");
                      setTone("slate");
                      setPermissions(clonePermissions(EMPTY_ADMIN_PERMISSIONS));
                    }}
                    disabled={working}
                    fullWidth
                  >
                    Limpar
                  </SecondaryActionButton>

                  <PrimaryActionButton
                    onClick={criarUsuario}
                    disabled={!canSubmit}
                    fullWidth
                  >
                    {working ? "Criando..." : "Criar administrador"}
                  </PrimaryActionButton>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <SectionTitle
                title="Como funciona"
                subtitle="Resumo do fluxo de permissões"
              />

              <div className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-3 text-sm text-slate-700">
                  <div>O usuário é criado pela função do Netlify.</div>
                  <div>O profile é marcado como administrador.</div>
                  <div>As permissões são gravadas na tabela <span className="font-mono">admin_permissions</span>.</div>
                  <div>O menu do admin passa a mostrar somente os módulos liberados.</div>
                  <div>Admins novos ficam sem vínculo com loja.</div>
                </div>
              </div>

              <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-900">
                  Permissões selecionadas agora
                </div>

                <div className="mt-4 grid gap-2">
                  {ADMIN_PERMISSION_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200 px-3 py-2"
                    >
                      <span className="text-sm text-slate-700">{field.label}</span>
                      <Badge tone={permissions[field.key] ? "green" : "neutral"}>
                        {permissions[field.key] ? "Liberado" : "Bloqueado"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <SectionTitle
              title="Administradores existentes"
              subtitle="Altere as permissões dos admins já criados"
            />

            {admins.length === 0 ? (
              <div className="mt-6 text-sm text-slate-600">Nenhum administrador encontrado.</div>
            ) : (
              <div className="mt-6 space-y-6">
                {admins.map((admin) => {
                  const rowPermissions = clonePermissions(admin.permissions);

                  return (
                    <div
                      key={admin.id}
                      className="rounded-[24px] border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-slate-900">
                            Admin {shortId(admin.id)}
                          </div>

                          <div className="grid gap-2 text-sm text-slate-700">
                            <div>
                              <span className="font-semibold">Email:</span> {admin.email || "-"}
                            </div>
                            <div>
                              <span className="font-semibold">UUID:</span> {admin.id}
                            </div>
                            <div>
                              <span className="font-semibold">Role:</span> {admin.role || "-"}
                            </div>
                            <div>
                              <span className="font-semibold">Admin:</span> {admin.is_admin ? "Sim" : "Não"}
                            </div>
                            <div>
                              <span className="font-semibold">Aprovado:</span> {admin.approved ? "Sim" : "Não"}
                            </div>
                            <div>
                              <span className="font-semibold">Loja vinculada:</span>{" "}
                              {admin.store_id ? admin.store_name || admin.store_id : "Nenhuma"}
                            </div>
                            <div>
                              <span className="font-semibold">Criado em:</span> {fmtDateTime(admin.created_at)}
                            </div>
                          </div>
                        </div>

                        <div>
                          <PrimaryActionButton
                            onClick={() => saveExistingPermissions(admin.id, rowPermissions)}
                            disabled={savingPermissionUserId === admin.id}
                          >
                            {savingPermissionUserId === admin.id
                              ? "Salvando..."
                              : "Salvar permissões"}
                          </PrimaryActionButton>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {ADMIN_PERMISSION_FIELDS.map((field) => (
                          <PermissionCheckbox
                            key={`${admin.id}-${field.key}`}
                            label={field.label}
                            checked={!!rowPermissions[field.key]}
                            onChange={(checked) => {
                              setAdmins((prev) =>
                                prev.map((item) =>
                                  item.id === admin.id
                                    ? {
                                        ...item,
                                        permissions: {
                                          ...clonePermissions(item.permissions),
                                          [field.key]: checked,
                                        },
                                      }
                                    : item
                                )
                              );
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}