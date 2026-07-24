/**
 * app/api/orders/[id]/enviar-nota-portal/route.ts
 *
 * POST — Monta o XML "fake" do pedido e envia pro webhook do ab-portal, que
 * importa como nota fiscal pendente de confirmação do franqueado. Lógica em
 * lib/enviarNotaPortal.ts (reaproveitada pelo backfill em
 * app/api/orders/backfill-notas-portal).
 *
 * Disparado automaticamente por um trigger no banco quando
 * orders.logistic_status vira 'SAIU_PARA_ENTREGA' (ver migração
 * add_trigger_saiu_para_entrega.sql). Protegido por segredo interno.
 */

import { NextRequest, NextResponse } from "next/server";
import { enviarNotaParaPortal } from "@/lib/enviarNotaPortal";

export const runtime = "nodejs";

function autorizado(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  return !!process.env.INTERNAL_TRIGGER_SECRET && authHeader === `Bearer ${process.env.INTERNAL_TRIGGER_SECRET}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: orderId } = await params;
  const resultado = await enviarNotaParaPortal(orderId);
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
}
