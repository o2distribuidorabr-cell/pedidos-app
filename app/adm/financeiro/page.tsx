"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { PageHeader, Card, Select, Badge, Input, StatCard } from "@/app/components/ui";

type StoreRow = { id: string; name: string | null };

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  created_at: string | null;
  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;
  paid_amount: number | null;
  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | null;
  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;
  credit_applied: number | null;
  due_date: string | null;
  delivery_finished_at?: string | null;
};

type TotalsRow = { order_id: string; store_id: string; total_cost: number | null };
type CreditBalRow = { store_id: string; balance: number | null };
type PixProvider = "MP" | "ASAAS" | "SANTANDER";

type FinanceSettingsRow = {
  id: number;
  pix_key: string | null;
  apply_late_charges: boolean | null;
  late_fee_percent: number | null;
  daily_interest_percent: number | null;
  pix_provider?: PixProvider | null;
  updated_at?: string | null;
};

type CalcParams = { aplicar: boolean; multaPct: number; jurosDiaPct: number };

type RowUi = {
  id: string;
  store_id: string;
  store_name: string;
  status: string;
  logistic_status: OrderRow["logistic_status"];
  delivery_mode: OrderRow["delivery_mode"];
  due_date: string | null;
  delivery_finished_at: string | null;
  gateway: string | null;
  is_overdue: boolean;
  is_due_soon: boolean;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: OrderRow["payment_method"];
  paid_amount: number | null;
  created_at: string | null;
  mercadoria: number;
  frete: number;
  total: number;
  credit_applied: number;
  a_pagar_base: number;
  days_late: number;
  multa: number;
  juros: number;
  encargos: number;
  a_pagar_exib: number;
  credit_balance: number;
};

const PAGE_SIZE = 50;

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return String(iso); }
}
function fmtYMDToBR(ymd: string | null | undefined) {
  if (!ymd) return "—";
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString("pt-BR");
  } catch { return String(ymd); }
}
function ymdToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysYMD(days: number) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}
function daysBetweenYMD(a: string, b: string) {
  try {
    const [ya, ma, da] = a.split("-").map(Number);
    const [yb, mb, db] = b.split("-").map(Number);
    return Math.floor((new Date(yb, mb - 1, db, 12, 0, 0).getTime() - new Date(ya, ma - 1, da, 12, 0, 0).getTime()) / 86400000);
  } catch { return 0; }
}
function logisticLabel(v: OrderRow["logistic_status"]) {
  if (v === "RECEBIDO") return "Recebido";
  if (v === "EM_SEPARACAO") return "Em separação";
  if (v === "SAIU_PARA_ENTREGA") return "Saiu para entrega";
  if (v === "ENTREGUE") return "Entregue";
  return "—";
}
function deliveryLabel(v: OrderRow["delivery_mode"]) {
  return v === "FRETE" ? "Frete" : "Retirada";
}
function statusTone(s: string) {
  if (s === "approved") return "green";
  if (s === "submitted") return "blue";
  if (s === "rejected") return "red";
  return "neutral" as const;
}
function toISOStart(d: string) { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd, 0, 0, 0).toISOString(); }
function toISOEnd(d: string) { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd, 23, 59, 59).toISOString(); }

function clampPercent(n: number) { return Number.isFinite(n) ? Math.max(0, Math.min(n, 1000)) : 0; }
function parsePercentInput(v: string) { const s = String(v ?? "").trim().replace("%", "").replace(/\s/g, ""); const n = Number(s.replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function normalizeProvider(v?: string | null): PixProvider { const p = String(v || "MP").toUpperCase(); if (p === "ASAAS") return "ASAAS"; if (p === "SANTANDER") return "SANTANDER"; return "MP"; }
function parseMoneyInput(v: string) { const n = Number(String(v || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function dateToTs(v: string | null | undefined) { if (!v) return 0; const ts = new Date(v).getTime(); return Number.isFinite(ts) ? ts : 0; }

function gatewayLabel(g: string | null) {
  if (!g) return "—";
  const u = g.toUpperCase();
  if (u === "MP" || u.includes("MERCADO")) return "Mercado Pago";
  if (u === "ASAAS" || u.includes("ASAAS")) return "Asaas";
  if (u === "SANTANDER") return "Santander";
  return g;
}
function gatewayTone(g: string | null): "green" | "blue" | "yellow" | "neutral" {
  if (!g) return "neutral";
  const u = g.toUpperCase();
  if (u === "MP" || u.includes("MERCADO")) return "blue";
  if (u === "ASAAS") return "green";
  if (u === "SANTANDER") return "yellow";
  return "neutral";
}
function payMethodTone(m: OrderRow["payment_method"]): "green" | "blue" | "yellow" | "neutral" {
  if (m === "PIX") return "green";
  if (m === "CARTAO") return "blue";
  if (m === "BOLETO") return "yellow";
  return "neutral";
}

function activeFilterCount(p: {
  storeSelected: string[]; searchTerm: string; paidFilter: string; statusFilter: string;
  logisticFilter: string; deliveryFilter: string; dateFrom: string; dateTo: string;
  payMethodFilter: string; dueFilter: string; dueFrom: string; dueTo: string;
  amountMin: string; amountMax: string; withCreditFilter: string; sortBy: string;
}) {
  let n = 0;
  if (p.storeSelected.length > 0) n++;
  if (p.searchTerm.trim()) n++;
  if (p.paidFilter !== "all") n++;
  if (p.statusFilter !== "all") n++;
  if (p.logisticFilter !== "all") n++;
  if (p.deliveryFilter !== "all") n++;
  if (p.dateFrom) n++;
  if (p.dateTo) n++;
  if (p.payMethodFilter !== "all") n++;
  if (p.dueFilter !== "all") n++;
  if (p.dueFrom) n++;
  if (p.dueTo) n++;
  if (p.amountMin) n++;
  if (p.amountMax) n++;
  if (p.withCreditFilter !== "all") n++;
  if (p.sortBy !== "created_desc") n++;
  return n;
}

function SectionBlock({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        </div>
        {right ? <div className="flex flex-wrap gap-2">{right}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function PrimaryActionButton({ children, onClick, disabled, fullWidth }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold text-white transition bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.22)] hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50", fullWidth ? "w-full" : ""].join(" ")}>
      {children}
    </button>
  );
}

function SecondaryActionButton({ children, onClick, disabled, fullWidth }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; fullWidth?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={["inline-flex h-11 items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50", fullWidth ? "w-full" : ""].join(" ")}>
      {children}
    </button>
  );
}

function FilterChip({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex h-10 items-center justify-center rounded-[16px] border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
      {children}
    </button>
  );
}

function AlertPanel({ tone, title, value, subtitle }: { tone: "red" | "yellow" | "green" | "blue"; title: string; value: React.ReactNode; subtitle?: string }) {
  const s = tone === "red" ? "border-red-200 bg-red-50" : tone === "yellow" ? "border-amber-200 bg-amber-50" : tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-cyan-200 bg-cyan-50";
  return (
    <div className={`rounded-[24px] border p-4 ${s}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-600">{subtitle}</div> : null}
    </div>
  );
}

// Tabela com scroll horizontal no TOPO, scroll vertical fixo e paginação
function FinanceTable({ rows, onRowClick, viewMode, page, onPageChange, editingPaymentId, setEditingPaymentId, savingPaymentId, updatePaymentMethod, editingDueDateId, setEditingDueDateId, savingDueDateId, updateDueDate }: {
  rows: RowUi[];
  onRowClick: (id: string) => void;
  viewMode: "compact" | "full";
  page: number;
  onPageChange: (p: number) => void;
  editingPaymentId: string | null;
  setEditingPaymentId: (id: string | null) => void;
  savingPaymentId: string | null;
  updatePaymentMethod: (orderId: string, method: string) => Promise<void>;
  editingDueDateId: string | null;
  setEditingDueDateId: (id: string | null) => void;
  savingDueDateId: string | null;
  updateDueDate: (orderId: string, date: string) => Promise<void>;
}) {
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const fakeInnerRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Sincroniza scroll: barra do topo <-> tabela
  function onTopScroll() {
    if (tableWrapRef.current && topScrollRef.current) {
      tableWrapRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  }
  function onTableScroll() {
    if (tableWrapRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = tableWrapRef.current.scrollLeft;
    }
  }

  // Mantém o div fantasma com a mesma largura da tabela real
  useEffect(() => {
    function syncWidth() {
      if (!tableWrapRef.current || !fakeInnerRef.current) return;
      const table = tableWrapRef.current.querySelector("table");
      if (table) fakeInnerRef.current.style.width = `${table.scrollWidth}px`;
    }
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    if (tableWrapRef.current) observer.observe(tableWrapRef.current);
    return () => observer.disconnect();
  }, [paged, viewMode]);

  const compactHeaders = ["Pedido", "Loja", "Status", "Operação", "Forma pgto.", "Plataforma", "Entregue em", "Vencimento", "Total", "A pagar", "Situação"];
  const fullHeaders = ["Pedido", "Loja", "Status", "Operação", "Entrega", "Forma pgto.", "Plataforma", "Entregue em", "Vencimento", "Mercadoria", "Frete", "Total", "Crédito", "A pagar", "Situação", "Data pagamento", "Saldo crédito"];
  const headers = viewMode === "compact" ? compactHeaders : fullHeaders;

  return (
    <div className="space-y-0">
      {/* MOBILE: cards empilhados */}
      <div className="block md:hidden space-y-3">
        {paged.map((r) => {
          const dueBadge = !r.due_date
            ? <Badge tone="neutral">Sem venc.</Badge>
            : r.is_overdue ? <Badge tone="red">Vencido</Badge>
            : r.is_due_soon ? <Badge tone="yellow">A vencer</Badge>
            : <Badge tone="green">OK</Badge>;

          return (
            <div key={r.id} onClick={() => onRowClick(r.id)}
              className="cursor-pointer rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
              {/* Cabeçalho do card */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{r.store_name}</div>
                  <div className="mt-0.5 font-mono text-xs text-slate-500">{r.id.slice(0, 8)}</div>
                </div>
                <Badge tone={r.is_paid ? "green" : "red"}>{r.is_paid ? "Pago" : "Em aberto"}</Badge>
              </div>

              {/* Linha divisória */}
              <div className="my-3 h-px bg-slate-100" />

              {/* Informações em grid 2 colunas */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="mt-0.5"><Badge tone={statusTone(r.status) as any}>{r.status}</Badge></div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Operação</div>
                  <div className="mt-0.5"><Badge tone="neutral">{logisticLabel(r.logistic_status)}</Badge></div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Forma pgto.</div>
                  <div className="mt-0.5">
                    {editingPaymentId === r.id ? (
                      <select autoFocus disabled={savingPaymentId === r.id}
                        defaultValue={r.payment_method ?? ""}
                        onBlur={() => setEditingPaymentId(null)}
                        onChange={(e) => updatePaymentMethod(r.id, e.target.value)}
                        className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">—</option>
                        <option value="PIX">PIX</option>
                        <option value="CARTAO">CARTAO</option>
                        <option value="BOLETO">BOLETO</option>
                      </select>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setEditingPaymentId(r.id); }} title="Clique para editar" className="cursor-pointer">
                        <Badge tone={payMethodTone(r.payment_method)}>{r.payment_method || "—"}</Badge>
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Plataforma</div>
                  <div className="mt-0.5"><Badge tone={gatewayTone(r.gateway)}>{gatewayLabel(r.gateway)}</Badge></div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Vencimento</div>
                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {editingDueDateId === r.id ? (
                      <input
                        type="date"
                        autoFocus
                        disabled={savingDueDateId === r.id}
                        defaultValue={r.due_date ?? ""}
                        onBlur={(e) => { updateDueDate(r.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setEditingDueDateId(r.id); }} title="Clique para editar" className="cursor-pointer flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-800 text-xs">{fmtYMDToBR(r.due_date)}</span>
                        {dueBadge}
                      </button>
                    )}
                  </div>
                  {!r.is_paid && r.encargos > 0 ? <div className="text-xs text-slate-500">+{money(r.encargos)} encargos</div> : null}
                </div>
                <div>
                  <div className="text-xs text-slate-500">Entregue em</div>
                  <div className="mt-0.5 text-xs text-slate-700">{r.delivery_finished_at ? fmtBR(r.delivery_finished_at) : "—"}</div>
                </div>
              </div>

              {/* Linha divisória */}
              <div className="my-3 h-px bg-slate-100" />

              {/* Valores */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[14px] bg-slate-50 p-2.5 text-center">
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">{money(r.total)}</div>
                </div>
                <div className="rounded-[14px] bg-slate-50 p-2.5 text-center">
                  <div className="text-xs text-slate-500">Crédito</div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">- {money(r.credit_applied)}</div>
                </div>
                <div className={["rounded-[14px] p-2.5 text-center", r.is_paid ? "bg-emerald-50" : "bg-red-50"].join(" ")}>
                  <div className="text-xs text-slate-500">A pagar</div>
                  <div className={["mt-1 text-sm font-semibold", r.is_paid ? "text-emerald-700" : "text-red-700"].join(" ")}>{money(r.a_pagar_exib)}</div>
                </div>
              </div>

              {r.is_paid ? (
                <div className="mt-2 text-xs text-slate-500 text-center">Pago em: {fmtBR(r.paid_at)}</div>
              ) : null}
            </div>
          );
        })}

        {/* Paginação mobile */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-sm text-slate-600">
            <b>{rows.length}</b> registro(s) • Pág. <b>{page}</b>/<b>{Math.ceil(rows.length / PAGE_SIZE)}</b>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40">‹</button>
            <button onClick={() => onPageChange(Math.min(Math.ceil(rows.length / PAGE_SIZE), page + 1))} disabled={page >= Math.ceil(rows.length / PAGE_SIZE)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40">›</button>
          </div>
        </div>
      </div>

      {/* DESKTOP: tabela com scroll (escondida no mobile) */}
      <div className="hidden md:block space-y-0">
      {/* Barra de scroll horizontal no TOPO — sincronizada com a tabela */}
      <div ref={topScrollRef} onScroll={onTopScroll}
        className="overflow-x-auto rounded-t-[20px] border border-b-0 border-slate-200 bg-slate-100 py-2 px-1">
        <div ref={fakeInnerRef} style={{ height: 1, minWidth: "100%" }} />
      </div>

      {/* Tabela com scroll horizontal + vertical fixo */}
      <div ref={tableWrapRef} onScroll={onTableScroll}
        className="overflow-x-auto overflow-y-auto rounded-b-[20px] border border-slate-200"
        style={{ maxHeight: "520px" }}>
        <div>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={h}
                    className={["whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sticky top-0 z-20",
                      i === 0 ? "sticky left-0 z-30 bg-slate-50 shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""].join(" ")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((r) => {
                const dueBadge = !r.due_date
                  ? <Badge tone="neutral">Sem venc.</Badge>
                  : r.is_overdue ? <Badge tone="red">Vencido</Badge>
                  : r.is_due_soon ? <Badge tone="yellow">A vencer</Badge>
                  : <Badge tone="green">OK</Badge>;

                const compact = [
                  <span className="font-mono text-xs text-slate-700">{r.id.slice(0, 8)}</span>,
                  <span className="font-semibold text-slate-900">{r.store_name}</span>,
                  <Badge tone={statusTone(r.status) as any}>{r.status}</Badge>,
                  <Badge tone="neutral">{logisticLabel(r.logistic_status)}</Badge>,
                  <span onClick={(e) => e.stopPropagation()}>
                    {editingPaymentId === r.id ? (
                      <select autoFocus disabled={savingPaymentId === r.id}
                        defaultValue={r.payment_method ?? ""}
                        onBlur={() => setEditingPaymentId(null)}
                        onChange={(e) => updatePaymentMethod(r.id, e.target.value)}
                        className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">—</option>
                        <option value="PIX">PIX</option>
                        <option value="CARTAO">CARTAO</option>
                        <option value="BOLETO">BOLETO</option>
                      </select>
                    ) : (
                      <button onClick={() => setEditingPaymentId(r.id)} title="Clique para editar" className="cursor-pointer">
                        <Badge tone={payMethodTone(r.payment_method)}>{r.payment_method || "—"}</Badge>
                      </button>
                    )}
                  </span>,
                  <Badge tone={gatewayTone(r.gateway)}>{gatewayLabel(r.gateway)}</Badge>,
                  <span className="text-slate-700">{r.delivery_finished_at ? fmtBR(r.delivery_finished_at) : "—"}</span>,
                  <span onClick={(e) => e.stopPropagation()}>
                    {editingDueDateId === r.id ? (
                      <input
                        type="date"
                        autoFocus
                        disabled={savingDueDateId === r.id}
                        defaultValue={r.due_date ?? ""}
                        onBlur={(e) => updateDueDate(r.id, e.target.value)}
                        className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <button onClick={() => setEditingDueDateId(r.id)} title="Clique para editar" className="cursor-pointer flex flex-col gap-1">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-slate-800">{fmtYMDToBR(r.due_date)}</span>{dueBadge}
                        </div>
                        {!r.is_paid && r.encargos > 0 ? <div className="text-xs text-slate-500 whitespace-nowrap">+{money(r.encargos)} encargos</div> : null}
                      </button>
                    )}
                  </span>,
                  <span className="font-semibold text-slate-900 whitespace-nowrap">{money(r.total)}</span>,
                  <span className="font-semibold text-slate-900 whitespace-nowrap">{money(r.a_pagar_exib)}</span>,
                  <Badge tone={r.is_paid ? "green" : "red"}>{r.is_paid ? "Pago" : "Em aberto"}</Badge>,
                ];

                const full = [
                  <span className="font-mono text-xs text-slate-700">{r.id.slice(0, 8)}</span>,
                  <span className="font-semibold text-slate-900">{r.store_name}</span>,
                  <Badge tone={statusTone(r.status) as any}>{r.status}</Badge>,
                  <Badge tone="neutral">{logisticLabel(r.logistic_status)}</Badge>,
                  <span className="text-slate-700">{deliveryLabel(r.delivery_mode)}</span>,
                  <span onClick={(e) => e.stopPropagation()}>
                    {editingPaymentId === r.id ? (
                      <select autoFocus disabled={savingPaymentId === r.id}
                        defaultValue={r.payment_method ?? ""}
                        onBlur={() => setEditingPaymentId(null)}
                        onChange={(e) => updatePaymentMethod(r.id, e.target.value)}
                        className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">—</option>
                        <option value="PIX">PIX</option>
                        <option value="CARTAO">CARTAO</option>
                        <option value="BOLETO">BOLETO</option>
                      </select>
                    ) : (
                      <button onClick={() => setEditingPaymentId(r.id)} title="Clique para editar" className="cursor-pointer">
                        <Badge tone={payMethodTone(r.payment_method)}>{r.payment_method || "—"}</Badge>
                      </button>
                    )}
                  </span>,
                  <Badge tone={gatewayTone(r.gateway)}>{gatewayLabel(r.gateway)}</Badge>,
                  <span className="text-slate-700 whitespace-nowrap">{r.delivery_finished_at ? fmtBR(r.delivery_finished_at) : "—"}</span>,
                  <span onClick={(e) => e.stopPropagation()}>
                    {editingDueDateId === r.id ? (
                      <input
                        type="date"
                        autoFocus
                        disabled={savingDueDateId === r.id}
                        defaultValue={r.due_date ?? ""}
                        onBlur={(e) => updateDueDate(r.id, e.target.value)}
                        className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <button onClick={() => setEditingDueDateId(r.id)} title="Clique para editar" className="cursor-pointer flex flex-col gap-1">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-slate-800">{fmtYMDToBR(r.due_date)}</span>{dueBadge}
                        </div>
                        {!r.is_paid && r.encargos > 0 ? <div className="text-xs text-slate-500 whitespace-nowrap">+{money(r.encargos)} ({r.days_late}d)</div> : null}
                      </button>
                    )}
                  </span>,
                  <span className="whitespace-nowrap font-semibold text-slate-900">{money(r.mercadoria)}</span>,
                  <span className="whitespace-nowrap text-slate-700">{r.delivery_mode === "FRETE" ? money(r.frete) : "—"}</span>,
                  <span className="whitespace-nowrap font-semibold text-slate-900">{money(r.total)}</span>,
                  <span className="whitespace-nowrap text-slate-700">- {money(r.credit_applied)}</span>,
                  <span className="whitespace-nowrap font-semibold text-slate-900">{money(r.a_pagar_exib)}</span>,
                  <Badge tone={r.is_paid ? "green" : "red"}>{r.is_paid ? "Pago" : "Em aberto"}</Badge>,
                  <span className="whitespace-nowrap text-slate-700">{fmtBR(r.paid_at)}</span>,
                  <span className="whitespace-nowrap font-semibold text-slate-900">{money(r.credit_balance)}</span>,
                ];

                const cells = viewMode === "compact" ? compact : full;

                return (
                  <tr key={r.id} onClick={() => onRowClick(r.id)} className="cursor-pointer hover:bg-slate-50 transition-colors">
                    {cells.map((cell, i) => (
                      <td key={i}
                        className={["border-b border-slate-100 px-4 py-3 align-middle",
                          i === 0 ? "sticky left-0 z-10 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""].join(" ")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação desktop */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-sm text-slate-600">
          <b>{rows.length}</b> registro(s) • Página <b>{page}</b> de <b>{totalPages}</b> • {PAGE_SIZE} por página
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onPageChange(1)} disabled={page === 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">«</button>
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">‹</button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4));
            const p = start + i;
            return (
              <button key={p} type="button" onClick={() => onPageChange(p)}
                className={["inline-flex h-9 w-9 items-center justify-center rounded-[12px] border text-sm font-semibold transition",
                  p === page ? "border-cyan-500 bg-cyan-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"].join(" ")}>
                {p}
              </button>
            );
          })}

          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">›</button>
          <button type="button" onClick={() => onPageChange(totalPages)} disabled={page === totalPages}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40">»</button>
        </div>
      </div>
      </div>{/* end hidden md:block desktop wrapper */}
    </div>
  );
}

export default function AdmFinanceiroPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [rows, setRows] = useState<RowUi[]>([]);
  // Chave de persistência dos filtros no sessionStorage
  const STORAGE_KEY = "financeiro_filtros_v1";

  function loadSaved() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function savedOr<T>(key: string, fallback: T): T {
    const s = loadSaved();
    return s && s[key] !== undefined ? s[key] : fallback;
  }

  const [page, setPage] = useState(() => savedOr("page", 1));

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [pixKey, setPixKey] = useState<string>("");
  const [applyLateCharges, setApplyLateCharges] = useState<boolean>(true);
  const [lateFeePercent, setLateFeePercent] = useState<string>("2");
  const [dailyInterestPercent, setDailyInterestPercent] = useState<string>("0,033");
  const [pixProvider, setPixProvider] = useState<PixProvider>("MP");

  const [storeSelected, setStoreSelected] = useState<string[]>(() => savedOr("storeSelected", []));
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState("");
  const popRef = useRef<HTMLDivElement | null>(null);

  const [searchTerm, setSearchTerm] = useState(() => savedOr("searchTerm", ""));
  const [paidFilter, setPaidFilter] = useState<string>(() => savedOr("paidFilter", "all"));
  const [statusFilter, setStatusFilter] = useState<string>(() => savedOr("statusFilter", "all"));
  const [logisticFilter, setLogisticFilter] = useState<string>(() => savedOr("logisticFilter", "all"));
  const [deliveryFilter, setDeliveryFilter] = useState<string>(() => savedOr("deliveryFilter", "all"));
  const [dateFrom, setDateFrom] = useState<string>(() => savedOr("dateFrom", ""));
  const [dateTo, setDateTo] = useState<string>(() => savedOr("dateTo", ""));
  const [payMethodFilter, setPayMethodFilter] = useState<string>(() => savedOr("payMethodFilter", "all"));
  const [dueFilter, setDueFilter] = useState<string>(() => savedOr("dueFilter", "all"));
  const [dueFrom, setDueFrom] = useState<string>(() => savedOr("dueFrom", ""));
  const [dueTo, setDueTo] = useState<string>(() => savedOr("dueTo", ""));
  const [amountMin, setAmountMin] = useState<string>(() => savedOr("amountMin", ""));
  const [amountMax, setAmountMax] = useState<string>(() => savedOr("amountMax", ""));
  const [withCreditFilter, setWithCreditFilter] = useState<string>(() => savedOr("withCreditFilter", "all"));
  const [sortBy, setSortBy] = useState<string>(() => savedOr("sortBy", "created_desc"));
  const [viewMode, setViewMode] = useState<"compact" | "full">(() => savedOr("viewMode", "compact") as "compact" | "full");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null);
  const [savingDueDateId, setSavingDueDateId] = useState<string | null>(null);

  async function updateDueDate(orderId: string, date: string) {
    setSavingDueDateId(orderId);
    const value = date || null;
    const { error } = await supabase.from("orders").update({ due_date: value }).eq("id", orderId);
    if (!error) {
      setRows((prev) => prev.map((r) => r.id === orderId ? { ...r, due_date: value } : r));
    }
    setEditingDueDateId(null);
    setSavingDueDateId(null);
  }

  async function updatePaymentMethod(orderId: string, method: string) {
    setSavingPaymentId(orderId);
    const value = method === "" ? null : method;
    const { error } = await supabase.from("orders").update({ payment_method: value }).eq("id", orderId);
    if (!error) {
      setRows((prev) => prev.map((r) => r.id === orderId ? { ...r, payment_method: value as OrderRow["payment_method"] } : r));
    }
    setEditingPaymentId(null);
    setSavingPaymentId(null);
  }

  // Persiste todos os filtros no sessionStorage sempre que mudarem
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        page, searchTerm, paidFilter, statusFilter, logisticFilter,
        deliveryFilter, dateFrom, dateTo, payMethodFilter, dueFilter,
        dueFrom, dueTo, amountMin, amountMax, withCreditFilter,
        sortBy, viewMode, storeSelected,
      }));
    } catch { /* ignora */ }
  }, [page, searchTerm, paidFilter, statusFilter, logisticFilter,
      deliveryFilter, dateFrom, dateTo, payMethodFilter, dueFilter,
      dueFrom, dueTo, amountMin, amountMax, withCreditFilter,
      sortBy, viewMode, storeSelected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!storePopoverOpen) return;
      if (!popRef.current?.contains(e.target as Node)) setStorePopoverOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [storePopoverOpen]);

  function calcParamsFromCurrentState(): CalcParams {
    return {
      aplicar: !!applyLateCharges,
      multaPct: clampPercent(parsePercentInput(lateFeePercent)) / 100,
      jurosDiaPct: clampPercent(parsePercentInput(dailyInterestPercent)) / 100,
    };
  }

  function calcParamsFromSettingsRow(row: FinanceSettingsRow | null): CalcParams {
    return {
      aplicar: !!(row?.apply_late_charges ?? true),
      multaPct: clampPercent(Number(row?.late_fee_percent ?? 0)) / 100,
      jurosDiaPct: clampPercent(Number(row?.daily_interest_percent ?? 0)) / 100,
    };
  }

  async function loadFinanceSettings(): Promise<FinanceSettingsRow | null> {
    setSettingsLoading(true);
    try {
      const { data, error } = await supabase.from("finance_settings")
        .select("id,pix_key,apply_late_charges,late_fee_percent,daily_interest_percent,pix_provider")
        .eq("id", 1).maybeSingle();
      if (error) { console.warn("loadFinanceSettings:", error.message); return null; }
      const row = (data ?? null) as FinanceSettingsRow | null;
      if (row) {
        setPixKey(row.pix_key ?? "");
        setApplyLateCharges(!!(row.apply_late_charges ?? true));
        setLateFeePercent(String(row.late_fee_percent ?? 2).replace(".", ","));
        setDailyInterestPercent(String(row.daily_interest_percent ?? 0.033).replace(".", ","));
        setPixProvider(normalizeProvider((row as any).pix_provider));
      }
      return row;
    } finally { setSettingsLoading(false); }
  }

  async function saveFinanceSettings() {
    setMsg(""); setSettingsSaving(true);
    const payload: FinanceSettingsRow = {
      id: 1,
      pix_key: pixKey.trim() || null,
      apply_late_charges: !!applyLateCharges,
      late_fee_percent: clampPercent(parsePercentInput(lateFeePercent)),
      daily_interest_percent: clampPercent(parsePercentInput(dailyInterestPercent)),
      pix_provider: pixProvider,
    };
    const { error } = await supabase.from("finance_settings").upsert(payload, { onConflict: "id" });
    if (error) { setMsg(`Erro ao salvar configurações: ${error.message}`); setSettingsSaving(false); return; }
    setSettingsSaving(false);
    const storeList = await loadStores();
    await loadFinance(storeList, calcParamsFromCurrentState());
  }

  async function loadStores(): Promise<StoreRow[]> {
    const { data, error } = await supabase.from("stores").select("id,name").order("name", { ascending: true });
    if (error) { console.warn("loadStores:", error.message); setStores([]); return []; }
    const list = (data ?? []) as StoreRow[];
    setStores(list);
    return list;
  }

  function storeButtonLabel() {
    if (storeSelected.length === 0) return "Todas as lojas";
    if (storeSelected.length === 1) return stores.find((x) => x.id === storeSelected[0])?.name ?? storeSelected[0];
    return `${storeSelected.length} lojas selecionadas`;
  }

  function toggleStore(id: string) { setStoreSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]); }
  function clearStores() { setStoreSelected([]); setStoreSearch(""); }
  function selectOnlyVisible(list: StoreRow[]) { setStoreSelected(list.map((s) => s.id)); }

  function resetAllFilters() {
    setSearchTerm(""); setPaidFilter("all"); setStatusFilter("all"); setLogisticFilter("all");
    setDeliveryFilter("all"); setDateFrom(""); setDateTo(""); setPayMethodFilter("all");
    setDueFilter("all"); setDueFrom(""); setDueTo(""); setAmountMin(""); setAmountMax("");
    setWithCreditFilter("all"); setSortBy("created_desc"); clearStores(); setPage(1);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignora */ }
  }

  async function loadFinance(storeList: StoreRow[], calc?: CalcParams) {
    setMsg("");
    let q = supabase.from("orders")
      .select("id,store_id,status,created_at,is_paid,paid_at,payment_method,paid_amount,logistic_status,delivery_mode,freight_fee,credit_applied,due_date,delivery_finished_at")
      .neq("status", "awaiting_payment")
      .order("created_at", { ascending: false });

    if (storeSelected.length > 0) q = q.in("store_id", storeSelected);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (logisticFilter !== "all") q = q.eq("logistic_status", logisticFilter);
    if (deliveryFilter !== "all") q = q.eq("delivery_mode", deliveryFilter);
    if (paidFilter === "paid") q = q.eq("is_paid", true);
    if (paidFilter === "unpaid") q = q.or("is_paid.is.null,is_paid.eq.false");
    if (payMethodFilter !== "all") q = q.eq("payment_method", payMethodFilter);
    if (dateFrom) q = q.gte("created_at", toISOStart(dateFrom));
    if (dateTo) q = q.lte("created_at", toISOEnd(dateTo));
    if (dueFrom) q = q.gte("due_date", dueFrom);
    if (dueTo) q = q.lte("due_date", dueTo);
    if (dueFilter === "no_due") q = q.is("due_date", null);

    const { data: ords, error: oErr } = await q;
    if (oErr) { setMsg(oErr.message); setRows([]); return; }

    let orders = (ords ?? []) as OrderRow[];
    const today = ymdToday();
    const soonLimit = addDaysYMD(3);

    if (dueFilter === "overdue") orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date < today);
    else if (dueFilter === "due_soon") orders = orders.filter((o) => !o.is_paid && !!o.due_date && o.due_date >= today && o.due_date <= soonLimit);
    else if (dueFilter === "today") orders = orders.filter((o) => !!o.due_date && o.due_date === today);
    else if (dueFilter === "future") orders = orders.filter((o) => !!o.due_date && o.due_date > today);
    else if (dueFilter === "with_due") orders = orders.filter((o) => !!o.due_date);

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      const storeMapText = new Map<string, string>();
      for (const s of storeList) storeMapText.set(s.id, `${s.name ?? ""} ${s.id}`.toLowerCase());
      orders = orders.filter((o) => o.id.toLowerCase().includes(term) || (storeMapText.get(o.store_id) ?? "").includes(term));
    }

    if (orders.length === 0) { setRows([]); return; }

    const orderIds = orders.map((o) => o.id);
    const storeIdsUnique = Array.from(new Set(orders.map((o) => o.store_id)));

    const [totsRes, balsRes, paymentsRes] = await Promise.all([
      supabase.from("v_order_totals").select("order_id,total_cost").in("order_id", orderIds),
      supabase.from("v_store_credit_balance").select("store_id,balance").in("store_id", storeIdsUnique),
      supabase.from("order_payments").select("order_id,gateway").in("order_id", orderIds).order("created_at", { ascending: false }),
    ]);

    const totalsMap = new Map<string, number>();
    for (const r of (totsRes.data ?? []) as TotalsRow[]) totalsMap.set(r.order_id, Number(r.total_cost) || 0);

    const balMap = new Map<string, number>();
    for (const r of (balsRes.data ?? []) as CreditBalRow[]) balMap.set(r.store_id, Number(r.balance) || 0);

    // gateway: pega o mais recente por pedido (já vem ordenado por created_at desc)
    const gatewayMap = new Map<string, string | null>();
    for (const p of (paymentsRes.data ?? []) as any[]) {
      if (p.order_id && !gatewayMap.has(p.order_id)) {
        gatewayMap.set(p.order_id, p.gateway ?? null);
      }
    }

    const storeMap = new Map<string, string>();
    for (const s of storeList) storeMap.set(s.id, s.name ?? s.id);

    const calcUse = calc ?? calcParamsFromCurrentState();
    const { aplicar, multaPct, jurosDiaPct } = calcUse;

    let ui: RowUi[] = orders.map((o) => {
      const frete = o.delivery_mode === "FRETE" ? Number(o.freight_fee ?? 0) : 0;
      const mercadoria = totalsMap.get(o.id) ?? 0;
      const total = mercadoria + frete;
      const credit = Number(o.credit_applied ?? 0);
      const a_pagar_base = Math.max(total - credit, 0);
      const is_overdue = !!o.due_date && !o.is_paid && o.due_date < today;
      const is_due_soon = !!o.due_date && !o.is_paid && o.due_date >= today && o.due_date <= soonLimit;
      const days_late = is_overdue && o.due_date ? Math.max(daysBetweenYMD(o.due_date, today), 1) : 0;
      const multa = aplicar && is_overdue ? a_pagar_base * multaPct : 0;
      const juros = aplicar && is_overdue ? a_pagar_base * jurosDiaPct * days_late : 0;
      const encargos = multa + juros;
      const paid_amount_num = Number(o.paid_amount ?? 0) || 0;
      const a_pagar_exib = o.is_paid && paid_amount_num > 0 ? paid_amount_num : Math.max(a_pagar_base + encargos, 0);

      return {
        id: o.id, store_id: o.store_id, store_name: storeMap.get(o.store_id) ?? o.store_id,
        status: o.status, logistic_status: o.logistic_status, delivery_mode: o.delivery_mode,
        due_date: o.due_date ?? null,
        delivery_finished_at: (o as any).delivery_finished_at ?? null,
        gateway: gatewayMap.get(o.id) ?? null,
        is_overdue, is_due_soon,
        is_paid: !!o.is_paid, paid_at: o.paid_at, payment_method: o.payment_method,
        paid_amount: o.paid_amount ?? null, created_at: o.created_at,
        mercadoria, frete, total, credit_applied: credit, a_pagar_base,
        days_late, multa, juros, encargos, a_pagar_exib,
        credit_balance: balMap.get(o.store_id) ?? 0,
      };
    });

    if (withCreditFilter === "yes") ui = ui.filter((r) => r.credit_applied > 0);
    else if (withCreditFilter === "no") ui = ui.filter((r) => r.credit_applied <= 0);

    const min = amountMin ? parseMoneyInput(amountMin) : null;
    const max = amountMax ? parseMoneyInput(amountMax) : null;
    if (min !== null) ui = ui.filter((r) => r.a_pagar_exib >= min);
    if (max !== null) ui = ui.filter((r) => r.a_pagar_exib <= max);

    ui.sort((a, b) => {
      if (sortBy === "created_asc") return dateToTs(a.created_at) - dateToTs(b.created_at);
      if (sortBy === "created_desc") return dateToTs(b.created_at) - dateToTs(a.created_at);
      if (sortBy === "due_asc") return dateToTs(a.due_date) - dateToTs(b.due_date);
      if (sortBy === "due_desc") return dateToTs(b.due_date) - dateToTs(a.due_date);
      if (sortBy === "amount_asc") return a.a_pagar_exib - b.a_pagar_exib;
      if (sortBy === "amount_desc") return b.a_pagar_exib - a.a_pagar_exib;
      if (sortBy === "store_asc") return a.store_name.localeCompare(b.store_name, "pt-BR");
      if (sortBy === "store_desc") return b.store_name.localeCompare(a.store_name, "pt-BR");
      return dateToTs(b.created_at) - dateToTs(a.created_at);
    });

    setRows(ui);
    setPage(1);
  }

  useEffect(() => {
    (async () => {
      setLoading(true); setMsg("");
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.push("/login"); return; }
      const settingsRow = await loadFinanceSettings();
      const storeList = await loadStores();
      await loadFinance(storeList, calcParamsFromSettingsRow(settingsRow));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onApply() {
    setLoading(true);
    const storeList = await loadStores();
    await loadFinance(storeList, calcParamsFromCurrentState());
    setLoading(false);
  }

  const resumo = useMemo(() => {
    const totalMercadoria = rows.reduce((a, r) => a + r.mercadoria, 0);
    const totalFrete = rows.reduce((a, r) => a + r.frete, 0);
    const totalTotal = rows.reduce((a, r) => a + r.total, 0);
    const totalCredito = rows.reduce((a, r) => a + r.credit_applied, 0);
    const totalApagar = rows.reduce((a, r) => a + (!r.is_paid ? r.a_pagar_exib : 0), 0);
    const totalPago = rows.reduce((a, r) => a + (r.is_paid ? r.a_pagar_exib : 0), 0);
    const qtdVencidos = rows.filter((r) => r.is_overdue).length;
    const qtdAVencer = rows.filter((r) => r.is_due_soon).length;
    const valorVencido = rows.filter((r) => r.is_overdue).reduce((a, r) => a + (!r.is_paid ? r.a_pagar_exib : 0), 0);
    const valorAVencer = rows.filter((r) => r.is_due_soon).reduce((a, r) => a + (!r.is_paid ? r.a_pagar_exib : 0), 0);
    return { totalMercadoria, totalFrete, totalTotal, totalCredito, totalApagar, totalPago, totalAberto: totalApagar, qtdVencidos, qtdAVencer, valorVencido, valorAVencer };
  }, [rows]);

  const storeFilteredList = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => `${s.name ?? ""} ${s.id}`.toLowerCase().includes(q));
  }, [stores, storeSearch]);

  const filtrosAtivos = activeFilterCount({ storeSelected, searchTerm, paidFilter, statusFilter, logisticFilter, deliveryFilter, dateFrom, dateTo, payMethodFilter, dueFilter, dueFrom, dueTo, amountMin, amountMax, withCreditFilter, sortBy });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro"
        subtitle="Visão administrativa de cobranças, pagamentos, vencimentos e crédito."
        right={
          <div className="flex flex-wrap gap-2">
            <SecondaryActionButton onClick={() => router.push("/adm/pedidos")}>Pedidos</SecondaryActionButton>
            <SecondaryActionButton onClick={onApply} disabled={loading}>Recarregar</SecondaryActionButton>
          </div>
        }
      />

      {msg ? <Card><div className="text-sm text-red-600">{msg}</div></Card> : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <AlertPanel tone="red" title="Vencidos" value={resumo.qtdVencidos} subtitle={`${money(resumo.valorVencido)} em aberto`} />
        <AlertPanel tone="yellow" title="A vencer" value={resumo.qtdAVencer} subtitle={`${money(resumo.valorAVencer)} próximos 3 dias`} />
        <AlertPanel tone="blue" title="Em aberto" value={money(resumo.totalAberto)} subtitle="Total exibido no filtro" />
      </div>

      <SectionBlock title="Configurações de cobrança" subtitle="Essas regras afetam o valor exibido após vencimento e o provedor PIX ativo."
        right={
          <>
            <SecondaryActionButton onClick={loadFinanceSettings} disabled={settingsLoading || settingsSaving}>{settingsLoading ? "Carregando..." : "Recarregar"}</SecondaryActionButton>
            <PrimaryActionButton onClick={saveFinanceSettings} disabled={settingsLoading || settingsSaving}>{settingsSaving ? "Salvando..." : "Salvar"}</PrimaryActionButton>
          </>
        }>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Select label="Provedor PIX ativo" value={pixProvider} onChange={(v) => setPixProvider(normalizeProvider(String(v)))}
            options={[{ value: "MP", label: "Mercado Pago (MP)" }, { value: "ASAAS", label: "Asaas" }, { value: "SANTANDER", label: "Santander" }]} />
          <Select label="Aplicar multa/juros?" value={applyLateCharges ? "true" : "false"} onChange={(v) => setApplyLateCharges(v === "true")}
            options={[{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]} />
          <Input label="Multa (% uma vez)" value={lateFeePercent} onChange={setLateFeePercent} placeholder="Ex.: 2" />
          <Input label="Juros (% ao dia)" value={dailyInterestPercent} onChange={setDailyInterestPercent} placeholder="Ex.: 0,033" />
        </div>
        <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
          <div><b>Provedor PIX ativo:</b> define qual integração será usada nos próximos QR Codes gerados pelo portal do cliente.</div>
          <div><b>Cálculo:</b> multa = A pagar × (%/100) uma vez • juros = A pagar × (%/100) × dias em atraso.</div>
          <div><b>Pago:</b> quando existir <code>orders.paid_amount</code>, o sistema mostra o valor efetivamente pago.</div>
        </div>
      </SectionBlock>

      <SectionBlock title="Filtros" subtitle={filtrosAtivos === 0 ? "Nenhum filtro ativo." : `${filtrosAtivos} filtro(s) ativo(s).`}
        right={
          <>
            <SecondaryActionButton onClick={resetAllFilters} disabled={loading}>Limpar filtros</SecondaryActionButton>
            <PrimaryActionButton onClick={onApply} disabled={loading}>{loading ? "Aplicando..." : "Aplicar filtros"}</PrimaryActionButton>
          </>
        }>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative" ref={popRef}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Lojas</div>
              <button type="button" onClick={() => setStorePopoverOpen((v) => !v)} disabled={loading}
                className="flex h-10 w-full items-center justify-between rounded-[16px] border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50">
                <span className="truncate">{storeButtonLabel()}</span>
                <span className="ml-2 text-slate-500">{storePopoverOpen ? "▲" : "▼"}</span>
              </button>
              {storePopoverOpen ? (
                <div className="absolute z-50 mt-2 w-[360px] max-w-[90vw] rounded-[24px] border border-slate-200 bg-white p-3 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">Selecionar lojas</div>
                    <SecondaryActionButton onClick={() => setStorePopoverOpen(false)}>Fechar</SecondaryActionButton>
                  </div>
                  <div className="mt-3"><Input value={storeSearch} onChange={setStoreSearch} placeholder="Buscar loja..." /></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SecondaryActionButton onClick={clearStores} disabled={loading}>Todas</SecondaryActionButton>
                    <SecondaryActionButton onClick={() => selectOnlyVisible(storeFilteredList)} disabled={loading || storeFilteredList.length === 0}>Selecionar filtradas</SecondaryActionButton>
                  </div>
                  <div className="mt-3 max-h-64 overflow-auto rounded-[18px] border border-slate-200">
                    {storeFilteredList.length === 0 ? <div className="p-3 text-sm text-slate-500">Nenhuma loja encontrada.</div> : (
                      <div className="divide-y divide-slate-100">
                        {storeFilteredList.map((s) => (
                          <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50">
                            <input type="checkbox" checked={storeSelected.includes(s.id)} onChange={() => toggleStore(s.id)} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{s.name ?? s.id}</div>
                              <div className="truncate font-mono text-xs text-slate-500">{s.id}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <Input label="Buscar pedido ou loja" value={searchTerm} onChange={setSearchTerm} placeholder="Ex.: ID do pedido ou nome da unidade" />
            <Select label="Situação financeira" value={paidFilter} onChange={setPaidFilter}
              options={[{ value: "all", label: "Todos" }, { value: "paid", label: "Somente pagos" }, { value: "unpaid", label: "Somente em aberto" }]} />
            <Select label="Forma de pagamento" value={payMethodFilter} onChange={setPayMethodFilter}
              options={[{ value: "all", label: "Todas" }, { value: "PIX", label: "PIX" }, { value: "CARTAO", label: "Cartão" }, { value: "BOLETO", label: "Boleto" }]} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Select label="Status do pedido" value={statusFilter} onChange={setStatusFilter}
              options={[{ value: "all", label: "Todos" }, { value: "submitted", label: "Submitted" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} />
            <Select label="Status logístico" value={logisticFilter} onChange={setLogisticFilter}
              options={[{ value: "all", label: "Todos" }, { value: "RECEBIDO", label: "Recebido" }, { value: "EM_SEPARACAO", label: "Em separação" }, { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" }, { value: "ENTREGUE", label: "Entregue" }]} />
            <Select label="Entrega" value={deliveryFilter} onChange={setDeliveryFilter}
              options={[{ value: "all", label: "Todas" }, { value: "FRETE", label: "Frete" }, { value: "RETIRADA", label: "Retirada" }]} />
            <Select label="Vencimento" value={dueFilter} onChange={setDueFilter}
              options={[{ value: "all", label: "Todos" }, { value: "overdue", label: "Vencidos" }, { value: "due_soon", label: "A vencer (3 dias)" }, { value: "today", label: "Vence hoje" }, { value: "future", label: "Vence depois" }, { value: "with_due", label: "Com vencimento" }, { value: "no_due", label: "Sem vencimento" }]} />
            <Select label="Usou crédito?" value={withCreditFilter} onChange={setWithCreditFilter}
              options={[{ value: "all", label: "Todos" }, { value: "yes", label: "Com crédito" }, { value: "no", label: "Sem crédito" }]} />
            <Select label="Ordenar por" value={sortBy} onChange={setSortBy}
              options={[{ value: "created_desc", label: "Criação (mais recente)" }, { value: "created_asc", label: "Criação (mais antiga)" }, { value: "due_asc", label: "Vencimento (mais próximo)" }, { value: "due_desc", label: "Vencimento (mais distante)" }, { value: "amount_desc", label: "A pagar (maior)" }, { value: "amount_asc", label: "A pagar (menor)" }, { value: "store_asc", label: "Loja (A-Z)" }, { value: "store_desc", label: "Loja (Z-A)" }]} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Input label="Criado de" type="date" value={dateFrom} onChange={setDateFrom} />
            <Input label="Criado até" type="date" value={dateTo} onChange={setDateTo} />
            <Input label="Vencimento de" type="date" value={dueFrom} onChange={setDueFrom} />
            <Input label="Vencimento até" type="date" value={dueTo} onChange={setDueTo} />
            <Input label="A pagar mín." value={amountMin} onChange={setAmountMin} placeholder="Ex.: 100" />
            <Input label="A pagar máx." value={amountMax} onChange={setAmountMax} placeholder="Ex.: 5000" />
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterChip onClick={() => { const h = ymdToday(); setDateFrom(h); setDateTo(h); }}>Criados hoje</FilterChip>
            <FilterChip onClick={() => { setDateFrom(addDaysYMD(-7)); setDateTo(ymdToday()); }}>Últimos 7 dias</FilterChip>
            <FilterChip onClick={() => { setDateFrom(addDaysYMD(-30)); setDateTo(ymdToday()); }}>Últimos 30 dias</FilterChip>
            <FilterChip onClick={() => { setDueFilter("overdue"); setPaidFilter("unpaid"); }}>Em aberto vencidos</FilterChip>
            <FilterChip onClick={() => { setDueFilter("due_soon"); setPaidFilter("unpaid"); }}>A vencer</FilterChip>
            <FilterChip onClick={() => setPaidFilter("paid")}>Somente pagos</FilterChip>
            <FilterChip onClick={() => setPaidFilter("unpaid")}>Somente em aberto</FilterChip>
          </div>
        </div>
      </SectionBlock>

      <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Resumo financeiro</div>
            <div className="mt-1 text-sm text-slate-600">Valores consolidados considerando os filtros aplicados.</div>
          </div>
          <SecondaryActionButton onClick={() => setViewMode((v) => (v === "compact" ? "full" : "compact"))}>
            {viewMode === "compact" ? "Ver completo" : "Ver compacto"}
          </SecondaryActionButton>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Mercadoria" value={money(resumo.totalMercadoria)} />
          <StatCard label="Frete" value={money(resumo.totalFrete)} />
          <StatCard label="Total" value={money(resumo.totalTotal)} />
          <StatCard label="Crédito abatido" value={`- ${money(resumo.totalCredito)}`} />
          <StatCard label="A pagar (exibido)" value={money(resumo.totalApagar)} />
          <StatCard label="Pago" value={money(resumo.totalPago)} />
          <StatCard label="Em aberto" value={money(resumo.totalAberto)} />
          <StatCard label="Qtd. vencidos" value={resumo.qtdVencidos} />
          <StatCard label="Qtd. a vencer" value={resumo.qtdAVencer} />
          <StatCard label="Valor vencido" value={money(resumo.valorVencido)} />
        </div>
      </div>

      <SectionBlock title="Pedidos no financeiro"
        subtitle={`${rows.length} registro(s) • ${Math.ceil(rows.length / PAGE_SIZE)} página(s) de ${PAGE_SIZE} • ${viewMode === "compact" ? "compacto" : "completo"}`}
        right={
          <SecondaryActionButton onClick={() => setViewMode((v) => v === "compact" ? "full" : "compact")}>
            {viewMode === "compact" ? "Ver completo" : "Ver compacto"}
          </SecondaryActionButton>
        }>
        {loading ? (
          <div className="text-sm text-slate-600">Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
            Nenhum dado encontrado com os filtros atuais.
          </div>
        ) : (
          <FinanceTable rows={rows} onRowClick={(id) => router.push(`/adm/pedidos/${id}`)} viewMode={viewMode} page={page} onPageChange={setPage} editingPaymentId={editingPaymentId} setEditingPaymentId={setEditingPaymentId} savingPaymentId={savingPaymentId} updatePaymentMethod={updatePaymentMethod} editingDueDateId={editingDueDateId} setEditingDueDateId={setEditingDueDateId} savingDueDateId={savingDueDateId} updateDueDate={updateDueDate} />
        )}
      </SectionBlock>
    </div>
  );
}