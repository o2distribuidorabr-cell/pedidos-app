import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const apiKey = process.env.ASAAS_API_KEY;
    const env = (process.env.ASAAS_ENV || "sandbox").toLowerCase();
    const userAgent = process.env.ASAAS_USER_AGENT || "o2-pedidos";

    if (!apiKey) {
      return NextResponse.json(
        { error: "ASAAS_API_KEY não configurado" },
        { status: 500 }
      );
    }

    const baseUrl =
      env === "production"
        ? "https://api.asaas.com"
        : "https://sandbox.asaas.com/api";

    const resp = await fetch(`${baseUrl}/v3/myAccount`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        access_token: apiKey,
        "User-Agent": userAgent,
      },
      cache: "no-store",
    });

    const data = await resp.json();

    return NextResponse.json({
      ok: resp.ok,
      status: resp.status,
      env,
      baseUrl,
      data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Erro ao consultar Asaas",
        details: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}