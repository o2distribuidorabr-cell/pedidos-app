import crypto from "node:crypto";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

const LALAMOVE_API_KEY = process.env.LALAMOVE_API_KEY ?? "";
const LALAMOVE_API_SECRET = process.env.LALAMOVE_API_SECRET ?? "";
const LALAMOVE_BASE_URL =
  process.env.LALAMOVE_BASE_URL ?? "https://rest.sandbox.lalamove.com";
const LALAMOVE_MARKET = process.env.LALAMOVE_MARKET ?? "BR";

function assertConfig() {
  if (!LALAMOVE_API_KEY) {
    throw new Error("LALAMOVE_API_KEY não configurada.");
  }
  if (!LALAMOVE_API_SECRET) {
    throw new Error("LALAMOVE_API_SECRET não configurada.");
  }
}

export function getLalamoveConfig() {
  assertConfig();

  return {
    apiKey: LALAMOVE_API_KEY,
    apiSecret: LALAMOVE_API_SECRET,
    baseUrl: LALAMOVE_BASE_URL,
    market: LALAMOVE_MARKET,
  };
}

export function buildLalamoveSignature(params: {
  timestamp: string;
  method: HttpMethod;
  path: string;
  body?: string;
}) {
  const { timestamp, method, path, body = "" } = params;

  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;

  return crypto
    .createHmac("sha256", LALAMOVE_API_SECRET)
    .update(rawSignature)
    .digest("hex");
}

export async function lalamoveFetch<T>(params: {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  market?: string;
}) {
  assertConfig();

  const method = params.method ?? "GET";
  const market = params.market ?? LALAMOVE_MARKET;
  const requestId = crypto.randomUUID();
  const timestamp = Date.now().toString();
  const bodyString =
    method === "GET" || method === "DELETE"
      ? ""
      : JSON.stringify(params.body ?? {});
  const signature = buildLalamoveSignature({
    timestamp,
    method,
    path: params.path,
    body: bodyString,
  });

  const response = await fetch(`${LALAMOVE_BASE_URL}${params.path}`, {
    method,
    headers: {
      Authorization: `hmac ${LALAMOVE_API_KEY}:${timestamp}:${signature}`,
      Market: market,
      "Request-ID": requestId,
      "Content-Type": "application/json",
    },
    body:
      method === "GET" || method === "DELETE" ? undefined : bodyString,
    cache: "no-store",
  });

  const rawText = await response.text();

  let parsed: unknown = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = { raw: rawText };
  }

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        requestId,
        response: parsed,
      })
    );
  }

  return {
    status: response.status,
    requestId,
    data: parsed as T,
  };
}

export function verifyLalamoveWebhook(payload: any, urlPath: string) {
  assertConfig();

  const apiKey = String(payload?.apiKey ?? "");
  const timestamp = String(payload?.timestamp ?? "");
  const signature = String(payload?.signature ?? "");
  const signedData = JSON.stringify(payload?.data ?? {});

  if (!apiKey || !timestamp || !signature) {
    return false;
  }

  if (apiKey !== LALAMOVE_API_KEY) {
    return false;
  }

  const expectedSignature = buildLalamoveSignature({
    timestamp,
    method: "POST",
    path: urlPath,
    body: signedData,
  });

  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}