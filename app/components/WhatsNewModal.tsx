"use client";

import { useEffect, useState } from "react";

const CURRENT_VERSION = "1.0.0";
const STORAGE_KEY = "portal_whats_new_v";

type Slide = {
  emoji: string;
  bgColor: string;
  badgeColor: string;
  badgeText: string;
  title: string;
  description: string;
  tip: string;
};

const SLIDES: Slide[] = [
  {
    emoji: "📦",
    bgColor: "#e0f2fe",
    badgeColor: "#0369a1",
    badgeText: "Acompanhamento",
    title: "Seu pedido em tempo real",
    description:
      "Acompanhe cada etapa do seu pedido diretamente no portal — de 'Em separação' até 'Entregue', tudo atualizado em tempo real sem precisar ligar.",
    tip: 'Abra qualquer pedido aprovado e clique em "Acompanhar entrega".',
  },
  {
    emoji: "🗺️",
    bgColor: "#f0fdf4",
    badgeColor: "#15803d",
    badgeText: "Rastreio ao vivo",
    title: "Veja o motorista no mapa",
    description:
      "Quando seu pedido sair para entrega, acompanhe a posição do motorista atualizada automaticamente no mapa — sem precisar enviar mensagem ou ligar.",
    tip: "Disponível na tela de acompanhamento da entrega.",
  },
  {
    emoji: "🔐",
    bgColor: "#fdf4ff",
    badgeColor: "#7e22ce",
    badgeText: "Segurança",
    title: "Código de confirmação",
    description:
      "O sistema gera um código exclusivo e sigiloso para cada entrega. Na hora do recebimento, mostre o código ao motorista — só você tem acesso a ele.",
    tip: "O código aparece apenas para você na tela de acompanhamento.",
  },
  {
    emoji: "🏪",
    bgColor: "#fff7ed",
    badgeColor: "#c2410c",
    badgeText: "Retirada",
    title: "Confirmação de retirada pelo portal",
    description:
      "Para pedidos de retirada, um código é gerado quando seu pedido entra em separação. Ao retirar, basta digitá-lo no portal para confirmar o recebimento.",
    tip: 'Disponível na página do pedido em "Acompanhar entrega".',
  },
];

export default function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const [slide, setSlide] = useState(0);
  const [visitedSlides, setVisitedSlides] = useState<Set<number>>(new Set([0]));
  const [closing, setClosing] = useState(false);

  const allVisited = visitedSlides.size >= SLIDES.length;
  const isLast = slide === SLIDES.length - 1;
  const canClose = allVisited && isLast;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== CURRENT_VERSION) {
        const t = setTimeout(() => setVisible(true), 500);
        return () => clearTimeout(t);
      }
    } catch { /* ignora */ }
  }, []);

  function goToSlide(i: number) {
    setSlide(i);
    setVisitedSlides((prev) => new Set([...prev, i]));
  }

  function handleNext() {
    if (!isLast) {
      goToSlide(slide + 1);
    } else if (canClose) {
      handleClose();
    }
  }

  function handlePrev() {
    if (slide > 0) goToSlide(slide - 1);
  }

  function handleClose() {
    if (!canClose) return;
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      try { localStorage.setItem(STORAGE_KEY, CURRENT_VERSION); } catch { /* ignora */ }
    }, 300);
  }

  if (!visible) return null;

  const s = SLIDES[slide];
  const progress = ((slide + 1) / SLIDES.length) * 100;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15,23,42,0.6)",
        backdropFilter: "blur(8px)",
        transition: "opacity 0.3s ease",
        opacity: closing ? 0 : 1,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#ffffff",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: "0 32px 80px rgba(15,23,42,0.2)",
          transform: closing ? "scale(0.94) translateY(8px)" : "scale(1) translateY(0)",
          transition: "transform 0.3s ease, opacity 0.3s ease",
          opacity: closing ? 0 : 1,
        }}
      >
        {/* Barra de progresso */}
        <div style={{ height: 4, background: "#f1f5f9" }}>
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #0891b2, #06b6d4)",
              borderRadius: "0 99px 99px 0",
              transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 0",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#0891b2",
            }}
          >
            Novidades do portal
          </div>
          <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>
            {slide + 1} de {SLIDES.length}
          </div>
        </div>

        {/* Slide */}
        <div style={{ padding: "20px 24px 4px" }}>
          {/* Ícone */}
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 20,
              background: s.bgColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              marginBottom: 18,
              transition: "background 0.3s",
            }}
          >
            {s.emoji}
          </div>

          {/* Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 12px",
              borderRadius: 99,
              background: s.bgColor,
              color: s.badgeColor,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              marginBottom: 12,
              transition: "all 0.3s",
            }}
          >
            {s.badgeText}
          </div>

          {/* Título */}
          <div
            style={{
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              color: "#0f172a",
              lineHeight: 1.25,
              marginBottom: 12,
            }}
          >
            {s.title}
          </div>

          {/* Descrição */}
          <div
            style={{
              fontSize: 14,
              color: "#475569",
              lineHeight: 1.75,
              marginBottom: 16,
            }}
          >
            {s.description}
          </div>

          {/* Dica */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 14,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>💡</span>
            <span style={{ fontSize: 12, color: "#64748b", lineHeight: 1.65 }}>
              {s.tip}
            </span>
          </div>
        </div>

        {/* Indicadores */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingBottom: 4,
          }}
        >
          {SLIDES.map((_, i) => {
            const isActive = i === slide;
            const wasVisited = visitedSlides.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => goToSlide(i)}
                style={{
                  height: 6,
                  width: isActive ? 22 : 6,
                  borderRadius: 99,
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  background: isActive ? "#0891b2" : wasVisited ? "#bae6fd" : "#e2e8f0",
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px 24px",
            gap: 12,
          }}
        >
          {/* Botão voltar */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={slide === 0}
            style={{
              height: 42,
              minWidth: 42,
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "transparent",
              cursor: slide === 0 ? "not-allowed" : "pointer",
              opacity: slide === 0 ? 0.3 : 1,
              color: "#64748b",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.2s",
              flexShrink: 0,
            }}
          >
            ←
          </button>

          {/* Aviso central */}
          {!allVisited ? (
            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontSize: 11,
                color: "#94a3b8",
                fontWeight: 500,
              }}
            >
              Veja todos os slides para fechar
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}

          {/* Botão próximo / fechar */}
          <button
            type="button"
            onClick={handleNext}
            style={{
              height: 42,
              padding: "0 20px",
              borderRadius: 12,
              border: "none",
              background: canClose
                ? "linear-gradient(135deg, #0891b2, #0e7490)"
                : "#f1f5f9",
              color: canClose ? "#ffffff" : "#334155",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: canClose ? "0 8px 20px rgba(8,145,178,0.35)" : "none",
              transition: "all 0.3s ease",
              flexShrink: 0,
            }}
          >
            {isLast && canClose
              ? "Entendido 👍"
              : isLast && !allVisited
              ? "← Ver anteriores"
              : "Próximo →"}
          </button>
        </div>
      </div>
    </div>
  );
}
