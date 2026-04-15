"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";
import { PageHeader, Card } from "@/app/components/ui";

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  data?: unknown;
  intent?: string;
  error?: boolean;
};

const SUGGESTIONS = [
  "Qual o valor a receber nesta semana?",
  "Quantos bifes de 150g foram vendidos na semana passada?",
];

let msgId = 0;

export default function ChatAdmPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: ++msgId,
      role: "assistant",
      text: "Olá! Posso responder perguntas sobre os pedidos. Tente perguntar sobre o valor a receber ou vendas de produtos.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [openData, setOpenData] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const ok = await requireAdminOrRedirect(router);
      if (ok) setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(question: string) {
    if (!question.trim() || loading) return;

    const userMsg: Message = { id: ++msgId, role: "user", text: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m, index) => index > 0 && (m.role === "user" || m.role === "assistant"))
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.text }));

      const res = await fetch("/api/adm/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          history,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: ++msgId, role: "assistant", text: json.details ?? json.error ?? "Erro desconhecido.", error: true },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: ++msgId, role: "assistant", text: json.text, data: json.data, intent: json.intent },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: ++msgId, role: "assistant", text: "Erro ao conectar com o servidor.", error: true },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  if (!ready) return null;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Chat de consultas"
        subtitle="Faça perguntas em linguagem natural sobre os pedidos"
      />

      <Card>
        {/* Messages */}
        <div className="flex flex-col gap-3 min-h-[360px] max-h-[520px] overflow-y-auto pb-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : msg.error
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {/* Render **bold** */}
                {renderText(typeof msg.text === "string" ? msg.text : String(msg.text ?? ""))}

                {/* Data accordion */}
                {msg.data != null && (
                  <div className="mt-2 pt-2 border-t border-slate-300">
                    <button
                      onClick={() => setOpenData(openData === msg.id ? null : msg.id)}
                      className="text-xs text-slate-500 hover:text-slate-700 underline"
                    >
                      {openData === msg.id ? "▲ ocultar dados" : "▼ ver dados JSON"}
                    </button>
                    {openData === msg.id && (
                      <pre className="mt-2 text-xs bg-white border border-slate-200 rounded p-2 overflow-x-auto max-h-48 text-slate-700">
                        {JSON.stringify(msg.data, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-xl px-4 py-3">
                <span className="flex gap-1 items-center">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 mt-2 mb-4">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs rounded-full border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2 items-end mt-4 border-t border-slate-100 pt-4">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta... (Enter para enviar)"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
            disabled={loading}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Enviar
          </button>
        </div>
      </Card>
    </div>
  );
}

// Render **bold** markdown
function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        )
      )}
    </>
  );
}
