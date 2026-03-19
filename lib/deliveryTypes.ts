export type DeliveryStatus =
  | "PENDENTE"
  | "EM_SEPARACAO"
  | "SAIU_PARA_ENTREGA"
  | "ENTREGUE"
  | "OCORRENCIA";

export type DeliveryTrackingSessionStatus =
  | "PENDENTE"
  | "ATIVO"
  | "PAUSADO"
  | "ENCERRADO";

export type DeliveryConfirmationStatus =
  | "PENDENTE"
  | "CONFIRMADO"
  | "EXPIRADO"
  | "BLOQUEADO";

export type DeliveryTrackingSessionRow = {
  id: string;
  order_id: string;
  tracking_token: string;
  status: DeliveryTrackingSessionStatus;
  driver_name: string | null;
  driver_phone: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryTrackingPointRow = {
  id: string;
  session_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  recorded_at: string;
  created_at: string;
};

export type DeliveryConfirmationRow = {
  id: string;
  order_id: string;
  confirmation_code: string;
  status: DeliveryConfirmationStatus;
  attempts: number;
  max_attempts: number;
  code_sent_at: string | null;
  code_expires_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderDeliveryOverviewRow = {
  order_id: string;
  store_id: string | null;
  order_status: string | null;
  order_created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  delivery_status: DeliveryStatus;
  delivery_driver_name: string | null;
  delivery_driver_phone: string | null;
  delivery_started_at: string | null;
  delivery_finished_at: string | null;
  delivery_notes: string | null;
  tracking_session_id: string | null;
  tracking_status: DeliveryTrackingSessionStatus | null;
  tracking_token: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_seen_at: string | null;
  tracking_started_at: string | null;
  tracking_ended_at: string | null;
  confirmation_id: string | null;
  confirmation_status: DeliveryConfirmationStatus | null;
  attempts: number | null;
  max_attempts: number | null;
  code_sent_at: string | null;
  code_expires_at: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

export type PublicTrackingSessionPayload = {
  sessionId: string;
  orderId: string;
  driverName: string | null;
  driverPhone: string | null;
  trackingStatus: DeliveryTrackingSessionStatus;
  deliveryStatus: DeliveryStatus;
  startedAt: string | null;
  endedAt: string | null;
  lastSeenAt: string | null;
  confirmationStatus: DeliveryConfirmationStatus | null;
  codeExpiresAt: string | null;
  // FIX: endereço de entrega para abrir no Waze/Maps
  dropoffAddress: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
};

export type StartDeliveryFlowResult = {
  orderId: string;
  trackingSession: DeliveryTrackingSessionRow;
  confirmation: DeliveryConfirmationRow;
};

export type ValidateDeliveryCodeResult =
  | {
      ok: true;
      confirmation: DeliveryConfirmationRow;
    }
  | {
      ok: false;
      reason:
        | "NOT_FOUND"
        | "EXPIRED"
        | "BLOCKED"
        | "ALREADY_CONFIRMED"
        | "INVALID_CODE";
      message: string;
      attempts?: number;
      maxAttempts?: number;
      blocked?: boolean;
      confirmation?: DeliveryConfirmationRow;
    };

export type FinalizeDeliveryResult =
  | {
      ok: true;
      orderId: string;
      sessionId: string;
      confirmedAt: string | null;
      finishedAt: string | null;
    }
  | {
      ok: false;
      reason:
        | "SESSION_NOT_FOUND"
        | "SESSION_ALREADY_ENDED"
        | "INVALID_CODE"
        | "NOT_FOUND"
        | "EXPIRED"
        | "BLOCKED"
        | "ALREADY_CONFIRMED";
      message: string;
      attempts?: number;
      maxAttempts?: number;
    };