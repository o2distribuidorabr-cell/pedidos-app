// Service Worker para rastreio em background
// Arquivo: public/sw-tracking.js

const CACHE_NAME = "rastreio-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Recebe mensagens da página principal
self.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};

  if (type === "START_TRACKING") {
    // Salva o token para usar no envio de localização
    self.trackingToken = payload.token;
    self.trackingActive = true;
    startGeolocationWatch();
  }

  if (type === "STOP_TRACKING") {
    self.trackingActive = false;
    stopGeolocationWatch();
  }

  if (type === "SEND_LOCATION") {
    // A página envia coordenadas — o SW as repassa para a API
    if (payload?.lat && payload?.lng) {
      sendLocationToApi(payload.lat, payload.lng, payload.accuracy, self.trackingToken);
    }
  }
});

let watchId = null;

function startGeolocationWatch() {
  if (!self.navigator?.geolocation) return;
  if (watchId !== null) return;

  watchId = self.navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      sendLocationToApi(latitude, longitude, accuracy, self.trackingToken);

      // Notifica a página com as novas coordenadas
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "LOCATION_UPDATE",
            payload: { lat: latitude, lng: longitude, accuracy },
          });
        });
      });
    },
    (error) => {
      console.error("[SW] Erro de geolocalização:", error);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    }
  );
}

function stopGeolocationWatch() {
  if (watchId !== null && self.navigator?.geolocation) {
    self.navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

async function sendLocationToApi(lat, lng, accuracy, token) {
  if (!token) return;

  try {
    await fetch(`/api/logistica/public/session/${token}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, accuracy: accuracy ?? null }),
    });
  } catch (err) {
    console.error("[SW] Falha ao enviar localização:", err);
  }
}
