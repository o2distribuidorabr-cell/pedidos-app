// netlify/functions/create-user.ts

type NetlifyEvent = {
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body?: string | null;
};

type NetlifyContext = any;

function json(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(data),
  };
}

function getHeader(headers: Record<string, string | undefined>, name: string) {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

async function safeJsonOrText(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return { kind: "json" as const, value: JSON.parse(text), raw: text };
  } catch {
    return { kind: "text" as const, value: text, raw: text };
  }
}

export async function handler(event: NetlifyEvent, _context: NetlifyContext) {
  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Método não permitido. Use POST." });
  }

  // ====== ENV VARS (Netlify) ======
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL) return json(500, { error: "Faltando SUPABASE_URL no Netlify." });
  if (!SERVICE_ROLE) return json(500, { error: "Faltando SUPABASE_SERVICE_ROLE_KEY no Netlify." });
  if (!ANON_KEY) return json(500, { error: "Faltando NEXT_PUBLIC_SUPABASE_ANON_KEY no Netlify." });

  // ====== 1) Ler token do caller (quem está criando o novo admin) ======
  const authHeader = (getHeader(event.headers, "authorization") || "").trim();
  const bearer =
    authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

  if (!bearer) {
    return json(401, { error: "Sem token. Faça login e envie Authorization: Bearer <token>." });
  }

  // ====== 2) Validar token no Supabase (pega o user atual) ======
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${bearer}`,
      apikey: ANON_KEY,
      Accept: "application/json",
    },
  });

  if (!userResp.ok) {
    const detail = await safeJsonOrText(userResp);
    return json(401, { error: "Token inválido / não autenticado.", detail: detail.value });
  }

  const userData = await userResp.json().catch(() => ({} as any));
  const callerId = userData?.id;

  if (!callerId) {
    return json(401, { error: "Não foi possível identificar o usuário logado." });
  }

  // ====== 3) Conferir se o caller é ADMIN na tabela profiles ======
  const profResp = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role,approved`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        Accept: "application/json",
      },
    }
  );

  if (!profResp.ok) {
    const detail = await safeJsonOrText(profResp);
    return json(500, { error: "Falha ao consultar profiles.", detail: detail.value });
  }

  const profRows = await profResp.json().catch(() => []);
  const prof = Array.isArray(profRows) ? profRows[0] : null;

  if (!prof || prof.role !== "admin") {
    return json(403, { error: "Acesso negado. Somente admin pode criar outro admin." });
  }

  // ====== 4) Ler o body (novo admin) ======
  let payload: any = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "Body inválido. Envie JSON." });
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "").trim();
  const name = String(payload.name || "").trim();

  if (!email || !password) {
    return json(400, { error: "Envie { email, password, name(opcional) }." });
  }

  if (password.length < 8) {
    return json(400, { error: "Senha muito curta. Use pelo menos 8 caracteres." });
  }

  // ====== 5) Criar o usuário no Auth (Admin API) ======
  const createResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    }),
  });

  if (!createResp.ok) {
    const detail = await safeJsonOrText(createResp);
    return json(400, { error: "Falha ao criar usuário no Auth.", detail: detail.value });
  }

  const created = await createResp.json().catch(() => ({} as any));
  const newUserId = created?.id;

  if (!newUserId) {
    return json(500, { error: "Usuário criado, mas não retornou id.", detail: created });
  }

  // ====== 6) Criar/atualizar linha em profiles com role=admin ======
  const upsertResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([
      {
        id: newUserId,
        role: "admin",
        approved: true,
        store_id: null,
      },
    ]),
  });

  if (!upsertResp.ok) {
    const detail = await safeJsonOrText(upsertResp);
    return json(500, {
      error: "Usuário criado no Auth, mas falhou ao gravar profiles.",
      detail: detail.value,
      created_user_id: newUserId,
    });
  }

  return json(200, {
    ok: true,
    created_user_id: newUserId,
    email,
    name,
  });
}