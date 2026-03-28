import { NextRequest, NextResponse } from "next/server";
import { verifyLalamoveWebhook } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getProviderOrderId(payload: any) {
  return (
    payload?.data?.order?.orderId ??
    payload?.data?.orderId ??
    payload?.data?.replacedOrder?.orderId ??
    null
  );
}

function getProviderStatus(payload: any) {
  return payload?.data?.order?.status ?? payload?.data?.status ?? null;
}

function getDriverId(payload: any) {
  return (
    payload?.data?.driver?.driverId ??
    payload?.data?.driverId ??
    payload?.data?.order?.driverId ??
    null
  );
}

function getReplacementOrderId(payload: any) {
  return (
    payload?.data?.newOrder?.orderId ??
    payload?.data?.replacement?.orderId ??
    payload?.data?.replacementOrderId ??
    null
  );
}

// Handler GET para verificação/handshake da Lalamove
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Handshake / teste inicial da Lalamove
  if (!rawBody) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const payload = JSON.parse(rawBody);
    const path = new URL(request.url).pathname;

    // Handshake da Lalamove: payload sem apiKey ou sem eventType é uma verificação inicial
    const isHandshake = !payload?.apiKey || !payload?.eventType;
    if (isHandshake) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const isValid = verifyLalamoveWebhook(payload, path);

    if (!isValid) {
      return NextResponse.json(
        { error: "Assinatura do webhook inválida." },
        { status: 401 }
      );
    }

    const providerOrderId = getProviderOrderId(payload);
    const providerStatus = getProviderStatus(payload);
    const providerDriverId = getDriverId(payload);
    const replacementOrderId = getReplacementOrderId(payload);
    const eventType = payload?.eventType ?? null;

    await supabaseAdmin.from("order_shipment_events").insert({
      provider: "LALAMOVE",
      provider_order_id: providerOrderId,
      event_type: eventType,
      payload,
    });

    if (providerOrderId) {
      const updates: Record<string, unknown> = {
        provider_event_type: eventType,
        provider_status: providerStatus,
        last_webhook_payload: payload,
      };

      // Só sobrescreve driverId se vier preenchido
      if (providerDriverId) {
        updates.provider_driver_id = providerDriverId;
      }

      if (eventType === "ORDER_REPLACED" && replacementOrderId) {
        updates.provider_order_id = replacementOrderId;
      }

      await supabaseAdmin
        .from("order_shipments")
        .update(updates)
        .eq("provider_order_id", providerOrderId);

      // Busca o shipment para saber a qual pedido/rota pertence
      const { data: shipment } = await supabaseAdmin
        .from("order_shipments")
        .select("local_order_id")
        .eq("provider_order_id", providerOrderId)
        .maybeSingle();

      if (shipment?.local_order_id) {
        const status = String(providerStatus ?? "").toUpperCase();

        // Descobre se esse pedido faz parte de uma rota múltipla
        const { data: routeStop } = await supabaseAdmin
          .from("delivery_route_stops")
          .select("route_id")
          .eq("order_id", shipment.local_order_id)
          .maybeSingle();

        // Busca todos os pedidos afetados (rota múltipla ou pedido único)
        let orderIds: string[] = [shipment.local_order_id];
        let routeId: string | null = routeStop?.route_id ?? null;

        if (routeId) {
          const { data: allStops } = await supabaseAdmin
            .from("delivery_route_stops")
            .select("order_id")
            .eq("route_id", routeId);
          if (allStops && allStops.length > 0) {
            orderIds = allStops.map((s: any) => s.order_id);
          }
        }

        const isCompleted = ["COMPLETED", "DELIVERED", "FULFILLED"].some(s => status.includes(s));
        const isCanceled = ["CANCEL", "EXPIRED", "REJECTED"].some(s => status.includes(s));
        const isPickedUp = ["PICKED_UP", "ON_GOING", "IN_TRANSIT", "ONGOING"].some(s => status.includes(s));

        if (isCompleted) {
          // Marca todos os pedidos como ENTREGUE
          await supabaseAdmin
            .from("orders")
            .update({ logistic_status: "ENTREGUE", delivery_status: "ENTREGUE", delivery_finished_at: new Date().toISOString() })
            .in("id", orderIds);

          // Atualiza status da rota se for múltipla
          if (routeId) {
            await supabaseAdmin
              .from("delivery_routes")
              .update({ lalamove_status: providerStatus, status: "CONCLUIDA" })
              .eq("id", routeId);
          }
        } else if (isCanceled) {
          // Volta todos os pedidos para EM_SEPARACAO
          await supabaseAdmin
            .from("orders")
            .update({ logistic_status: "EM_SEPARACAO" })
            .in("id", orderIds);

          // Atualiza status da rota se for múltipla
          if (routeId) {
            await supabaseAdmin
              .from("delivery_routes")
              .update({ lalamove_status: providerStatus, status: "CANCELADA" })
              .eq("id", routeId);
          }
        } else if (isPickedUp) {
          // Marca todos como SAIU_PARA_ENTREGA
          await supabaseAdmin
            .from("orders")
            .update({ logistic_status: "SAIU_PARA_ENTREGA" })
            .in("id", orderIds);

          // Atualiza status da rota se for múltipla
          if (routeId) {
            await supabaseAdmin
              .from("delivery_routes")
              .update({ lalamove_status: providerStatus })
              .eq("id", routeId);
          }
        } else {
          // Para qualquer outro status, apenas atualiza o lalamove_status da rota
          if (routeId) {
            await supabaseAdmin
              .from("delivery_routes")
              .update({ lalamove_status: providerStatus })
              .eq("id", routeId);
          }
        }
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao processar webhook Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}