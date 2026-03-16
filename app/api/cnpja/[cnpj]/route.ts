import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ cnpj: string }>;
};

function onlyDigits(v: string) {
  return String(v ?? "").replace(/\D/g, "");
}

function pickArrayStrings(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => {
      if (typeof x === "string") return x.trim();

      if (x && typeof x === "object") {
        if (typeof x.number === "string") return x.number.trim();
        if (typeof x.address === "string") return x.address.trim();
        if (typeof x.value === "string") return x.value.trim();
      }

      return "";
    })
    .filter(Boolean);
}

function pickMainEmail(raw: any, emails: string[]) {
  return (
    emails[0] ??
    raw?.email ??
    raw?.mail ??
    raw?.company?.email ??
    null
  );
}

function pickMainPhone(raw: any, phones: string[]) {
  return (
    phones[0] ??
    raw?.phone ??
    raw?.company?.phone ??
    null
  );
}

export async function GET(_: Request, context: RouteContext) {
  try {
    const { cnpj } = await context.params;
    const normalized = onlyDigits(cnpj);

    if (normalized.length !== 14) {
      return NextResponse.json(
        { ok: false, message: "CNPJ inválido. Informe 14 dígitos." },
        { status: 400 }
      );
    }

    const apiKey =
      process.env.CNPJA_API_KEY ||
      process.env.CNPJA_API_TOKEN ||
      process.env.CNPJA_TOKEN ||
      "";

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Chave da CNPJA não configurada. Defina CNPJA_API_KEY no .env.local.",
        },
        { status: 500 }
      );
    }

    const url = new URL(`https://api.cnpja.com/office/${normalized}`);
    url.searchParams.set("simples", "true");
    url.searchParams.set("registrations", "ALL");
    url.searchParams.set("strategy", "CACHE_IF_FRESH");
    url.searchParams.set("maxAge", "1");

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: apiKey,
      },
      cache: "no-store",
    });

    const text = await resp.text();
    let raw: any = null;

    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }

    if (!resp.ok) {
      const message =
        raw?.message ||
        raw?.error ||
        `Falha ao consultar CNPJ. HTTP ${resp.status}`;

      return NextResponse.json(
        {
          ok: false,
          message,
          raw,
        },
        { status: resp.status }
      );
    }

    const office = raw ?? {};
    const company = office?.company ?? null;
    const address = office?.address ?? null;

    const phones = pickArrayStrings(office?.phones);
    const emails = pickArrayStrings(office?.emails);

    const registrations = Array.isArray(office?.registrations)
      ? office.registrations.map((r: any) => ({
          number:
            typeof r?.number === "string"
              ? r.number
              : typeof r?.registration === "string"
              ? r.registration
              : null,
          state:
            typeof r?.state === "string"
              ? r.state
              : typeof r?.stateCode === "string"
              ? r.stateCode
              : null,
          enabled:
            typeof r?.enabled === "boolean"
              ? r.enabled
              : typeof r?.status === "string"
              ? r.status.toLowerCase() === "enabled"
              : null,
          status:
            typeof r?.status === "string" ? r.status : null,
        }))
      : [];

    const stateFromAddress =
      typeof address?.state === "string" ? address.state.toUpperCase() : null;

    const ieFromSameState =
      registrations.find(
        (r: any) =>
          String(r?.state ?? "").toUpperCase() === String(stateFromAddress ?? "").toUpperCase() &&
          r?.number
      )?.number ?? null;

    const ieFallback =
      registrations.find((r: any) => r?.number)?.number ?? null;

    const simples =
      company?.simples
        ? {
            opted:
              typeof company.simples?.optant === "boolean"
                ? company.simples.optant
                : typeof company.simples?.opted === "boolean"
                ? company.simples.opted
                : null,
            since:
              company.simples?.since ??
              company.simples?.optionDate ??
              null,
          }
        : null;

    const simei =
      company?.simei
        ? {
            opted:
              typeof company.simei?.optant === "boolean"
                ? company.simei.optant
                : typeof company.simei?.opted === "boolean"
                ? company.simei.opted
                : null,
            since:
              company.simei?.since ??
              company.simei?.optionDate ??
              null,
          }
        : null;

    return NextResponse.json({
      ok: true,
      raw: office,
      company: {
        name:
          typeof company?.name === "string"
            ? company.name
            : null,
        alias:
          typeof company?.alias === "string"
            ? company.alias
            : typeof office?.alias === "string"
            ? office.alias
            : typeof office?.tradeName === "string"
            ? office.tradeName
            : null,
        status:
          typeof office?.status?.text === "string"
            ? office.status.text
            : typeof office?.status === "string"
            ? office.status
            : null,
        founded:
          office?.founded ??
          office?.foundation ??
          company?.founded ??
          null,
        nature:
          typeof company?.nature?.text === "string"
            ? company.nature.text
            : typeof company?.nature === "string"
            ? company.nature
            : null,
        size:
          typeof company?.size?.text === "string"
            ? company.size.text
            : typeof company?.size === "string"
            ? company.size
            : null,
        equity:
          typeof company?.equity === "number"
            ? company.equity
            : typeof company?.capital === "number"
            ? company.capital
            : null,
      },
      address: {
        zip:
          typeof address?.zip === "string" ? address.zip : null,
        street:
          typeof address?.street === "string" ? address.street : null,
        number:
          typeof address?.number === "string" ? address.number : null,
        details:
          typeof address?.details === "string" ? address.details : null,
        district:
          typeof address?.district === "string" ? address.district : null,
        city:
          typeof address?.city === "string" ? address.city : null,
        state:
          typeof address?.state === "string" ? address.state : null,
      },
      phones,
      emails,
      contacts: {
        phoneMain: pickMainPhone(office, phones),
        emailMain: pickMainEmail(office, emails),
      },
      registrations,
      tax: {
        ie: ieFromSameState ?? ieFallback,
        registrations,
        simples,
        simei,
      },
      activity: {
        main: office?.mainActivity
          ? {
              code:
                typeof office.mainActivity?.id === "string"
                  ? office.mainActivity.id
                  : typeof office.mainActivity?.code === "string"
                  ? office.mainActivity.code
                  : null,
              text:
                typeof office.mainActivity?.text === "string"
                  ? office.mainActivity.text
                  : typeof office.mainActivity?.description === "string"
                  ? office.mainActivity.description
                  : null,
            }
          : null,
        secondary: Array.isArray(office?.sideActivities)
          ? office.sideActivities.map((a: any) => ({
              code:
                typeof a?.id === "string"
                  ? a.id
                  : typeof a?.code === "string"
                  ? a.code
                  : null,
              text:
                typeof a?.text === "string"
                  ? a.text
                  : typeof a?.description === "string"
                  ? a.description
                  : null,
            }))
          : [],
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno ao consultar CNPJ.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}