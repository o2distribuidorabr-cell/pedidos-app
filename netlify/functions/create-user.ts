import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import type { AdminPermissions } from "../../lib/adminPermissions";

type CreateUserBody = {
  email: string;
  password: string;
  name: string;
  permissions?: Partial<AdminPermissions>;
};

function json(statusCode: number, body: Record<string, any>) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

async function getRequesterUserIdFromToken(accessToken: string): Promise<string | null> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const client = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await client.auth.getUser();
  if (error) {
    console.error("getRequesterUserIdFromToken error:", error);
    return null;
  }

  return data.user?.id ?? null;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Método não permitido." });
    }

    const authHeader =
      event.headers.authorization || event.headers.Authorization || "";

    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const accessToken = tokenMatch?.[1]?.trim();

    if (!accessToken) {
      return json(401, { error: "Token não informado." });
    }

    const requesterUserId = await getRequesterUserIdFromToken(accessToken);
    if (!requesterUserId) {
      return json(401, { error: "Sessão inválida ou expirada." });
    }

    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: requesterProfile, error: requesterProfileError } = await admin
      .from("profiles")
      .select("id,is_admin,role")
      .eq("id", requesterUserId)
      .maybeSingle();

    if (requesterProfileError) {
      console.error("requesterProfileError:", requesterProfileError);
      return json(500, {
        error: `Erro ao validar perfil do solicitante: ${requesterProfileError.message}`,
      });
    }

    if (!requesterProfile || !requesterProfile.is_admin) {
      return json(403, { error: "Acesso negado. Seu usuário não é admin." });
    }

    const body = JSON.parse(event.body || "{}") as CreateUserBody;

    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const permissions = body.permissions || {};

    if (!email) return json(400, { error: "Email obrigatório." });
    if (!password) return json(400, { error: "Senha obrigatória." });
    if (!name) return json(400, { error: "Nome obrigatório." });

    const permissionPayload: AdminPermissions = {
      can_dashboard: !!permissions.can_dashboard,
      can_orders: !!permissions.can_orders,
      can_expedition: !!permissions.can_expedition,
      can_separation_map: !!permissions.can_separation_map,
      can_fiscal_issue: !!permissions.can_fiscal_issue,
      can_fiscal_products: !!permissions.can_fiscal_products,
      can_fiscal_rules: !!permissions.can_fiscal_rules,
      can_registrations: !!permissions.can_registrations,
      can_users: !!permissions.can_users,
      can_stores: !!permissions.can_stores,
      can_products: !!permissions.can_products,
      can_emitters: !!permissions.can_emitters,
      can_financial: !!permissions.can_financial,
      can_credit: !!permissions.can_credit,
      can_stock: !!permissions.can_stock,
    };

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
      },
    });

    if (createError || !created.user) {
      console.error("createUser error:", createError);
      return json(400, {
        error: createError?.message || "Falha ao criar usuário no Auth.",
      });
    }

    const userId = created.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        role: "admin",
        store_id: null,
        approved: true,
        approved_at: new Date().toISOString(),
        is_admin: true,
        email,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("profileError:", profileError);

      try {
        await admin.auth.admin.deleteUser(userId);
      } catch (rollbackError) {
        console.error("rollback deleteUser error:", rollbackError);
      }

      return json(500, {
        error: `Usuário foi criado no Auth, mas falhou ao gravar em profiles: ${profileError.message}`,
      });
    }

    const { error: permissionError } = await admin.from("admin_permissions").upsert(
      {
        user_id: userId,
        ...permissionPayload,
      },
      { onConflict: "user_id" }
    );

    if (permissionError) {
      console.error("permissionError:", permissionError);

      try {
        await admin.from("profiles").delete().eq("id", userId);
      } catch (rollbackProfileError) {
        console.error("rollback profile delete error:", rollbackProfileError);
      }

      try {
        await admin.auth.admin.deleteUser(userId);
      } catch (rollbackAuthError) {
        console.error("rollback auth delete error:", rollbackAuthError);
      }

      return json(500, {
        error: `Usuário foi criado, mas falhou ao gravar permissões: ${permissionError.message}`,
      });
    }

    return json(200, {
      ok: true,
      user_id: userId,
      message: "Usuário criado com sucesso.",
    });
  } catch (e: any) {
    console.error("create-user fatal error:", e);
    return json(500, {
      error: e?.message || "Erro interno ao criar usuário.",
    });
  }
};