import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { lalamoveFetch } from "@/lib/lalamove";

export const runtime = "nodejs";

type LalamoveCityResponse = {
  data?: Array<{
    locode: string;
    name: string;
    services: Array<{
      key: string;
      description?: string;
      dimensions?: {
        length?: { value?: string; unit?: string };
        width?: { value?: string; unit?: string };
        height?: { value?: string; unit?: string };
      };
      load?: { value?: string; unit?: string };
      specialRequests?: Array<{
        name: string;
        description?: string;
        parent_type?: string;
        max_selection?: number;
      }>;
    }>;
  }>;
};

type OrderWithStore = {
  id: string;
  store_id: string | null;
  stores:
    | {
        id: string;
        name: string | null;
        legal_name?: string | null;
        phone_nf?: string | null;
        address_zip?: string | null;
        address_street?: string | null;
        address_number?: string | null;
        address_complement?: string | null;
        address_neighborhood?: string | null;
        city?: string | null;
        state?: string | null;
        address_lat?: number | null;
        address_lng?: number | null;
      }
    | {
        id: string;
        name: string | null;
        legal_name?: string | null;
        phone_nf?: string | null;
        address_zip?: string | null;
        address_street?: string | null;
        address_number?: string | null;
        address_complement?: string | null;
        address_neighborhood?: string | null;
        city?: string | null;
        state?: string | null;
        address_lat?: number | null;
        address_lng?: number | null;
      }[]
    | null;
};

function norm(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

// Normaliza qualquer formato de telefone para +55XXXXXXXXXXX
// Trata todos os casos encontrados na base de dados:
//   "97146092"      → sem DDD, sem 9 → "+5531997146092"  (8 dígitos)
//   "997146092"     → sem DDD, com 9 → "+5531997146092"  (9 dígitos)
//   "31997146092"   → com DDD, com 9 → "+5531997146092"  (11 dígitos)
//   "3197146092"    → com DDD, sem 9 → "+5531997146092"  (10 dígitos)
//   "5531997146092" → completo s/ +  → "+5531997146092"  (13 dígitos)
//   "+5531997146092"→ já correto     → "+5531997146092"
const DEFAULT_DDD = "31"; // DDD padrão da região (BH/Contagem)

function normalizePhone(value: string | null | undefined): string {
  const digits = onlyDigits(value);

  if (!digits) return "";

  // Já completo com código do país: +55 + DDD(2) + 9(1) + número(8) = 13 dígitos
  if (digits.startsWith("55") && digits.length === 13) {
    return `+${digits}`;
  }

  // Completo com código do país mas sem o 9: +55 + DDD(2) + número(8) = 12 dígitos
  if (digits.startsWith("55") && digits.length === 12) {
    const ddd = digits.slice(2, 4);
    const numero = digits.slice(4);
    return `+55${ddd}9${numero}`;
  }

  // Tem 0 na frente: 0 + DDD(2) + 9(1) + número(8) = 12 dígitos
  if (digits.startsWith("0") && digits.length === 12) {
    return `+55${digits.slice(1)}`;
  }

  // Tem 0 na frente mas sem o 9: 0 + DDD(2) + número(8) = 11 dígitos
  if (digits.startsWith("0") && digits.length === 11) {
    const ddd = digits.slice(1, 3);
    const numero = digits.slice(3);
    return `+55${ddd}9${numero}`;
  }

  // Com DDD e com 9: DDD(2) + 9(1) + número(8) = 11 dígitos
  if (digits.length === 11) {
    return `+55${digits}`;
  }

  // Com DDD mas sem o 9: DDD(2) + número(8) = 10 dígitos
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const numero = digits.slice(2);
    return `+55${ddd}9${numero}`;
  }

  // Sem DDD, com 9: 9(1) + número(8) = 9 dígitos
  if (digits.length === 9) {
    return `+55${DEFAULT_DDD}${digits}`;
  }

  // Sem DDD, sem 9: número(8) = 8 dígitos
  if (digits.length === 8) {
    return `+55${DEFAULT_DDD}9${digits}`;
  }

  // Qualquer outro caso inesperado — adiciona país e DDD padrão
  return `+55${DEFAULT_DDD}${digits}`;
}

function joinAddress(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeStoreRow(store: OrderWithStore["stores"]) {
  if (!store) return null;
  return Array.isArray(store) ? store[0] ?? null : store;
}

const BH_METRO = new Set([
  "belo horizonte",
  "contagem",
  "betim",
  "nova lima",
  "ribeirao das neves",
  "ribeirão das neves",
  "santa luzia",
  "ibirite",
  "ibirité",
  "sabará",
  "sabara",
  "vespasiano",
  "lagoa santa",
  "confins",
  "esmeraldas",
  "mateus leme",
  "juatuba",
  "sao jose da lapa",
  "são josé da lapa",
  "igarape",
  "igarapé",
  "brumadinho",
  "caete",
  "caeté",
  "mario campos",
  "mário campos",
  "sarzedo",
  "raposos",
  "rio acima",
  "itatiaiucu",
  "itatiaiuçu",
  "taquaracu de minas",
  "taquaraçu de minas",
  "florestal",
  "pedro leopoldo",
  "capim branco",
]);

function findBestCityMatch(
  cities: NonNullable<LalamoveCityResponse["data"]>,
  cityName: string | null | undefined,
  state: string | null | undefined
) {
  const normalizedCity = norm(cityName);
  const normalizedState = norm(state);

  if (normalizedState === "mg" && BH_METRO.has(normalizedCity)) {
    const bh = cities.find((item) => item.locode === "BR BHZ");
    if (bh) return bh;
  }

  const exact = cities.find((item) => norm(item.name) === normalizedCity);
  if (exact) return exact;

  const contains = cities.find((item) => norm(item.name).includes(normalizedCity));
  if (contains) return contains;

  return cities.find((item) => item.locode === "BR BHZ") ?? cities[0] ?? null;
}

function choosePreferredService(
  services: Array<{
    key: string;
    description?: string;
    specialRequests?: Array<{
      name: string;
      description?: string;
      parent_type?: string;
      max_selection?: number;
    }>;
    dimensions?: {
      length?: { value?: string; unit?: string };
      width?: { value?: string; unit?: string };
      height?: { value?: string; unit?: string };
    };
    load?: { value?: string; unit?: string };
  }>
) {
  const priority = ["CAR", "HATCHBACK", "UV_FIORINO", "VAN", "LALAGO", "LALAPRO", "TRUCK330"];

  for (const key of priority) {
    const found = services.find((item) => item.key === key);
    if (found) return found;
  }

  return services[0] ?? null;
}

async function geocodeAddress(address: string) {
  if (!address.trim()) return null;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("q", address);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "american-burger-lalamove-autofill/1.0",
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

async function saveStoreCoordinates(storeId: string, lat: number, lng: number) {
  try {
    await supabaseAdmin
      .from("stores")
      .update({
        address_lat: lat,
        address_lng: lng,
      })
      .eq("id", storeId);
  } catch {
    // não trava o fluxo
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim();

    if (!orderId) {
      return NextResponse.json(
        { ok: false, message: "orderId é obrigatório." },
        { status: 400 }
      );
    }

    const { data: orderData, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        store_id,
        stores:stores (
          id,
          name,
          legal_name,
          phone_nf,
          address_zip,
          address_street,
          address_number,
          address_complement,
          address_neighborhood,
          city,
          state,
          address_lat,
          address_lng
        )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!orderData) {
      return NextResponse.json(
        { ok: false, message: "Pedido não encontrado." },
        { status: 404 }
      );
    }

    const order = orderData as OrderWithStore;
    const store = normalizeStoreRow(order.stores);

    const pickupName = process.env.LALAMOVE_PICKUP_NAME || "Expedição";
    // FIX: normaliza o telefone do pickup para o formato +55XXXXXXXXXXX
    const pickupPhone = normalizePhone(process.env.LALAMOVE_PICKUP_PHONE || "");
    const pickupAddress =
      process.env.LALAMOVE_PICKUP_ADDRESS?.trim() ||
      "Avenida Cristal, 501, Jardim Riacho das Pedras, Contagem, MG, Brasil";

    const storeAddress = joinAddress([
      store?.address_street,
      store?.address_number,
      store?.address_complement,
      store?.address_neighborhood,
      store?.city,
      store?.state,
      store?.address_zip ? `CEP ${store.address_zip}` : null,
      "Brasil",
    ]);

    let pickupLat =
      process.env.LALAMOVE_PICKUP_LAT && process.env.LALAMOVE_PICKUP_LAT.trim() !== ""
        ? Number(process.env.LALAMOVE_PICKUP_LAT)
        : null;

    let pickupLng =
      process.env.LALAMOVE_PICKUP_LNG && process.env.LALAMOVE_PICKUP_LNG.trim() !== ""
        ? Number(process.env.LALAMOVE_PICKUP_LNG)
        : null;

    if (
      (pickupLat == null || !Number.isFinite(pickupLat) || pickupLng == null || !Number.isFinite(pickupLng)) &&
      pickupAddress
    ) {
      const geocodedPickup = await geocodeAddress(pickupAddress);
      pickupLat = geocodedPickup?.lat ?? null;
      pickupLng = geocodedPickup?.lng ?? null;
    }

    let dropoffLat =
      typeof store?.address_lat === "number" && Number.isFinite(store.address_lat)
        ? store.address_lat
        : null;

    let dropoffLng =
      typeof store?.address_lng === "number" && Number.isFinite(store.address_lng)
        ? store.address_lng
        : null;

    if (
      (dropoffLat == null || dropoffLng == null) &&
      storeAddress
    ) {
      const geocodedDropoff = await geocodeAddress(storeAddress);
      dropoffLat = geocodedDropoff?.lat ?? null;
      dropoffLng = geocodedDropoff?.lng ?? null;

      if (store?.id && dropoffLat != null && dropoffLng != null) {
        await saveStoreCoordinates(store.id, dropoffLat, dropoffLng);
      }
    }

    const citiesResponse = await lalamoveFetch<LalamoveCityResponse>({
      path: "/v3/cities",
      method: "GET",
    });

    const cities = citiesResponse.data?.data ?? [];
    const matchedCity = findBestCityMatch(cities, store?.city, store?.state);
    const services = matchedCity?.services ?? [];
    const preferredService = choosePreferredService(services);

    return NextResponse.json({
      ok: true,
      data: {
        matchedCity: matchedCity
          ? {
              locode: matchedCity.locode,
              name: matchedCity.name,
            }
          : null,
        services: services.map((service) => ({
          key: service.key,
          description: service.description ?? "",
          dimensions: service.dimensions ?? null,
          load: service.load ?? null,
          specialRequests: (service.specialRequests ?? []).map((requestItem) => ({
            name: requestItem.name,
            description: requestItem.description ?? "",
            parent_type: requestItem.parent_type ?? "",
            max_selection: requestItem.max_selection ?? 1,
          })),
        })),
        preferredServiceType: preferredService?.key ?? null,
        pickup: {
          address: pickupAddress,
          lat: pickupLat,
          lng: pickupLng,
          name: pickupName,
          // FIX: telefone do pickup normalizado para +55XXXXXXXXXXX
          phone: pickupPhone,
        },
        dropoff: {
          address: storeAddress,
          lat: dropoffLat,
          lng: dropoffLng,
          name: store?.name || store?.legal_name || "Destinatário",
          // FIX: telefone do destinatário normalizado para +55XXXXXXXXXXX
          phone: normalizePhone(store?.phone_nf || ""),
          city: store?.city || null,
          state: store?.state || null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao montar o preenchimento automático da Lalamove.",
      },
      { status: 500 }
    );
  }
}