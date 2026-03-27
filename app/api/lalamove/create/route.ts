import { NextRequest, NextResponse } from "next/server";
import { getLalamoveConfig, lalamoveFetch } from "@/lib/lalamove";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type StopContact = {
  stopId: string;
  name: string;
  phone: string;
  remarks?: string;
};

type CreateOrderRequest = {
  // Pedido único (fluxo original)
  orderId?: string;
  // Rota com múltiplas paradas
  routeId?: string;
  quotationId: string;
  sender: { name: string; phone: string };
  recipients: StopContact[];
  partnerName?: string;
  isPODEnabled?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateOrderRequest;

    if (!body.orderId && !body.routeId) {
      return NextResponse.json(
        { error: "orderId ou routeId é obrigatório." },
        { status: 400 }
      );
    }

    if (!body.quotationId) {
      return NextResponse.json(
        { error: "quotationId é obrigatório." },
        { status: 400 }
      );
    }

    // Busca a cotação para pegar os stopIds
    const quotationResult = await lalamoveFetch<any>({
      path: `/v3/quotations/${body.quotationId}`,
      method: "GET",
      market: getLalamoveConfig().market,
    });

    const quotation = quotationResult.data?.data;
    const stops = quotation?.stops ?? [];

    if (stops.length < 2) {
      return NextResponse.json(
        { error: "Cotação inválida — sem stops suficientes." },
        { status: 400 }
      );
    }

    const pickupStop = stops[0];
    const dropoffStops = stops.slice(1);

    if (!pickupStop?.stopId) {
      return NextResponse.json(
        { error: "Não foi possível localizar o stopId da coleta." },
        { status: 400 }
      );
    }

    // Monta os recipients — um por parada de entrega
    const recipients = dropoffStops.map((stop: any, index: number) => {
      const contact = body.recipients[index] ?? body.recipients[body.recipients.length - 1];
      return {
        stopId: stop.stopId,
        name: contact?.name ?? "Destinatário",
        phone: contact?.phone ?? "",
        ...(contact?.remarks ? { remarks: contact.remarks } : {}),
      };
    });

    const payload = {
      data: {
        quotationId: body.quotationId,
        isPODEnabled: body.isPODEnabled ?? false,
        ...(body.partnerName ? { partner: body.partnerName } : {}),
        sender: {
          stopId: pickupStop.stopId,
          name: body.sender.name,
          phone: body.sender.phone,
        },
        recipients,
        metadata: {
          ...(body.routeId ? { routeId: body.routeId } : {}),
          ...(body.orderId ? { localOrderId: body.orderId } : {}),
          source: "portal-american-burger",
        },
      },
    };

    const result = await lalamoveFetch<any>({
      path: "/v3/orders",
      method: "POST",
      body: payload,
      market: getLalamoveConfig().market,
    });

    const order = result.data?.data;
    const now = new Date().toISOString();

    if (body.routeId) {
      // Salva na rota
      await supabaseAdmin
        .from("delivery_routes")
        .update({
          lalamove_order_id: order?.orderId ?? null,
          lalamove_status: order?.status ?? null,
          lalamove_share_link: order?.shareLink ?? null,
          lalamove_last_payload: result.data,
          status: "EM_ANDAMENTO",
          started_at: now,
          updated_at: now,
        })
        .eq("id", body.routeId);

      // Busca os pedidos da rota
      const { data: routeStops } = await supabaseAdmin
        .from("delivery_route_stops")
        .select("order_id")
        .eq("route_id", body.routeId);

      if (routeStops && routeStops.length > 0) {
        // Marca todos os pedidos da rota como SAIU_PARA_ENTREGA
        await supabaseAdmin
          .from("orders")
          .update({ logistic_status: "SAIU_PARA_ENTREGA" })
          .in("id", routeStops.map((s: any) => s.order_id));
      }

      // Cria o order_shipment para a rota usando o primeiro pedido como local_order_id
      // Isso permite que o sistema busque dados do motorista e status pelo provider_order_id
      const firstOrderId = routeStops?.[0]?.order_id ?? null;
      if (firstOrderId && order?.orderId) {
        await supabaseAdmin.from("order_shipments").upsert(
          {
            local_order_id: firstOrderId,
            provider: "LALAMOVE",
            provider_market: getLalamoveConfig().market,
            provider_quote_id: body.quotationId,
            provider_order_id: order?.orderId ?? null,
            provider_driver_id: order?.driverId ?? null,
            provider_status: order?.status ?? null,
            share_link: order?.shareLink ?? null,
            sender_name: body.sender.name,
            sender_phone: body.sender.phone,
            price_amount: order?.priceBreakdown?.total
              ? Number(order.priceBreakdown.total)
              : null,
            price_currency: order?.priceBreakdown?.currency ?? null,
            last_order_payload: result.data,
            updated_at: now,
          },
          { onConflict: "local_order_id" }
        );
      }
    } else if (body.orderId) {
      // Pedido único — comportamento original
      const { error } = await supabaseAdmin.from("order_shipments").upsert(
        {
          local_order_id: body.orderId,
          provider: "LALAMOVE",
          provider_market: getLalamoveConfig().market,
          provider_quote_id: body.quotationId,
          provider_order_id: order?.orderId ?? null,
          provider_driver_id: order?.driverId ?? null,
          provider_status: order?.status ?? null,
          share_link: order?.shareLink ?? null,
          sender_name: body.sender.name,
          sender_phone: body.sender.phone,
          recipient_name: body.recipients[0]?.name ?? null,
          recipient_phone: body.recipients[0]?.phone ?? null,
          price_amount: order?.priceBreakdown?.total
            ? Number(order.priceBreakdown.total)
            : null,
          price_currency: order?.priceBreakdown?.currency ?? null,
          last_order_payload: result.data,
        },
        { onConflict: "local_order_id" }
      );

      if (error) throw error;

      // Marca pedido como SAIU_PARA_ENTREGA
      await supabaseAdmin
        .from("orders")
        .update({ logistic_status: "SAIU_PARA_ENTREGA" })
        .eq("id", body.orderId);
    }

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Falha ao criar pedido Lalamove.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}