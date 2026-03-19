import { NextResponse } from "next/server";
import { lalamoveFetch } from "@/lib/lalamove";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await lalamoveFetch<any>({
      path: "/v3/cities",
      method: "GET",
    });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao buscar cidades/serviços da Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}