import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type StoreRow = {
  id: string;
  name: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_zip: string | null;
  city: string | null;
  state: string | null;
  address_lat: number | null;
  address_lng: number | null;
};

// Monta variações do endereço do mais específico ao mais simples
function buildAddressAttempts(store: StoreRow): string[] {
  const street = store.address_street?.trim() ?? "";
  const number = store.address_number?.trim() ?? "";
  const neighborhood = store.address_neighborhood?.trim() ?? "";
  const city = store.city?.trim() ?? "";
  const state = store.state?.trim() ?? "";
  const zip = store.address_zip?.trim() ?? "";

  const attempts: string[] = [];

  // Tentativa 1: rua + número + bairro + cidade + estado
  if (street && number && city) {
    attempts.push(`${street}, ${number}, ${neighborhood ? neighborhood + ", " : ""}${city}, ${state}`);
  }

  // Tentativa 2: rua + número + cidade + estado (sem bairro)
  if (street && number && city) {
    attempts.push(`${street}, ${number}, ${city}, ${state}`);
  }

  // Tentativa 3: rua + cidade + estado (sem número)
  if (street && city) {
    attempts.push(`${street}, ${city}, ${state}`);
  }

  // Tentativa 4: CEP + cidade
  if (zip && city) {
    attempts.push(`${zip}, ${city}, ${state}`);
  }

  // Tentativa 5: só o CEP
  if (zip) {
    attempts.push(zip);
  }

  // Tentativa 6: só cidade + estado
  if (city && state) {
    attempts.push(`${city}, ${state}`);
  }

  // Remove duplicatas mantendo a ordem
  return [...new Set(attempts)];
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("q", query);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "american-burger-geocode/1.0",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Array<{
      lat?: string;
      lon?: string;
    }>;

    const first = data?.[0];
    if (!first?.lat || !first?.lon) return null;

    const lat = Number(first.lat);
    const lng = Number(first.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

// Aguarda um tempo entre requisições para não ser bloqueado pelo Nominatim
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(_request: NextRequest) {
  try {
    // Busca todas as lojas sem coordenadas
    const { data: stores, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, address_street, address_number, address_complement, address_neighborhood, address_zip, city, state, address_lat, address_lng")
      .is("address_lat", null);

    if (error) throw error;

    if (!stores || stores.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "Todas as lojas já têm coordenadas.",
        total: 0,
        success: 0,
        failed: 0,
        results: [],
      });
    }

    const results: Array<{
      id: string;
      name: string | null;
      status: "ok" | "failed";
      lat?: number;
      lng?: number;
      usedQuery?: string;
      error?: string;
    }> = [];

    for (const store of stores as StoreRow[]) {
      const attempts = buildAddressAttempts(store);

      let found: { lat: number; lng: number } | null = null;
      let usedQuery = "";

      for (const query of attempts) {
        // Aguarda 1.2 segundos entre requisições (Nominatim limita a 1 por segundo)
        await sleep(1200);

        const result = await geocode(query);

        if (result) {
          found = result;
          usedQuery = query;
          break;
        }
      }

      if (found) {
        // Salva as coordenadas no Supabase
        await supabaseAdmin
          .from("stores")
          .update({
            address_lat: found.lat,
            address_lng: found.lng,
          })
          .eq("id", store.id);

        results.push({
          id: store.id,
          name: store.name,
          status: "ok",
          lat: found.lat,
          lng: found.lng,
          usedQuery,
        });
      } else {
        results.push({
          id: store.id,
          name: store.name,
          status: "failed",
          error: "Nenhuma tentativa de endereço retornou resultado.",
        });
      }
    }

    const success = results.filter((r) => r.status === "ok").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      ok: true,
      message: `Geocodificação concluída. ${success} loja(s) atualizadas, ${failed} falharam.`,
      total: stores.length,
      success,
      failed,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao geocodificar lojas.",
      },
      { status: 500 }
    );
  }
}

// GET para verificar quantas lojas ainda estão sem coordenadas
export async function GET(_request: NextRequest) {
  try {
    const { data: stores, error } = await supabaseAdmin
      .from("stores")
      .select("id, name, city, state, address_lat, address_lng")
      .is("address_lat", null);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      pending: stores?.length ?? 0,
      stores: stores ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao verificar lojas.",
      },
      { status: 500 }
    );
  }
}