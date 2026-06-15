"use client";

import { useRef } from "react";

type RowUi = {
  id: string;
  store_id: string;
  store_name: string;
  status: string;
  logistic_status: string | null;
  delivery_mode: string | null;
  due_date: string | null;
  delivery_finished_at: string | null;
  gateway: string | null;
  is_overdue: boolean;
  is_due_soon: boolean;
  is_paid: boolean;
  paid_at: string | null;
  payment_method: string | null;
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

function brl(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBR(ymd: string | null | undefined) {
  if (!ymd) return "—";
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString("pt-BR");
  } catch { return ymd; }
}

function groupByMonth(rows: RowUi[]): { mes: string; label: string; total: number; qtd: number }[] {
  const map = new Map<string, { total: number; qtd: number }>();
  for (const r of rows) {
    const key = r.due_date ? r.due_date.slice(0, 7) : r.created_at ? r.created_at.slice(0, 7) : "sem-data";
    const cur = map.get(key) ?? { total: 0, qtd: 0 };
    cur.total += r.a_pagar_exib;
    cur.qtd += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => {
      let label = mes;
      if (mes !== "sem-data") {
        try {
          const [y, m] = mes.split("-").map(Number);
          label = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
          label = label.charAt(0).toUpperCase() + label.slice(1);
        } catch { /* keep mes */ }
      }
      return { mes, label, ...v };
    });
}

function groupByDay(rows: RowUi[]): { dia: string; label: string; total: number; qtd: number; lojas: string[]; overdue: boolean }[] {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const map = new Map<string, { total: number; qtd: number; lojas: Set<string>; overdue: boolean }>();
  for (const r of rows.filter((r) => !r.is_paid)) {
    const key = r.due_date ?? "sem-data";
    const cur = map.get(key) ?? { total: 0, qtd: 0, lojas: new Set<string>(), overdue: r.is_overdue };
    cur.total += r.a_pagar_exib;
    cur.qtd += 1;
    cur.lojas.add(r.store_name);
    if (r.is_overdue) cur.overdue = true;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => {
      let label = dia;
      if (dia !== "sem-data") {
        try {
          const [y, m, d] = dia.split("-").map(Number);
          const dt = new Date(y, m - 1, d, 12);
          const diff = Math.round((dt.getTime() - hoje.getTime()) / 86400000);
          const weekday = dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
          const dateStr = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
          const suffix = diff === 0 ? " — hoje" : diff === 1 ? " — amanhã" : diff < 0 ? ` — ${Math.abs(diff)}d atraso` : "";
          label = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${dateStr}${suffix}`;
        } catch { /* keep dia */ }
      }
      return { dia, label, total: v.total, qtd: v.qtd, lojas: Array.from(v.lojas), overdue: v.overdue };
    });
}

function groupByStore(rows: RowUi[]): { nome: string; total: number; pago: number; aberto: number; vencido: number; qtd: number }[] {
  const map = new Map<string, { nome: string; total: number; pago: number; aberto: number; vencido: number; qtd: number }>();
  for (const r of rows) {
    const cur = map.get(r.store_id) ?? { nome: r.store_name, total: 0, pago: 0, aberto: 0, vencido: 0, qtd: 0 };
    cur.total += r.a_pagar_exib;
    cur.qtd += 1;
    if (r.is_paid) cur.pago += r.a_pagar_exib;
    else {
      cur.aberto += r.a_pagar_exib;
      if (r.is_overdue) cur.vencido += r.a_pagar_exib;
    }
    map.set(r.store_id, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.aberto - a.aberto);
}

interface Props {
  rows: RowUi[];
  onClose: () => void;
  filtroLabel?: string;
}

export function RelatorioFinanceiro({ rows, onClose, filtroLabel }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const vencidos = rows.filter((r) => r.is_overdue && !r.is_paid);
  const aVencer = rows.filter((r) => r.is_due_soon && !r.is_paid);
  const pagos = rows.filter((r) => r.is_paid);
  const emAberto = rows.filter((r) => !r.is_paid && !r.is_overdue);

  const totalVencido = vencidos.reduce((a, r) => a + r.a_pagar_exib, 0);
  const totalEncargos = vencidos.reduce((a, r) => a + r.encargos, 0);
  const totalAVencer = aVencer.reduce((a, r) => a + r.a_pagar_exib, 0);
  const totalEmAberto = emAberto.reduce((a, r) => a + r.a_pagar_exib, 0);
  const totalPago = pagos.reduce((a, r) => a + r.a_pagar_exib, 0);
  const totalGeral = rows.reduce((a, r) => a + r.a_pagar_exib, 0);

  const previsoes = groupByMonth(rows.filter((r) => !r.is_paid));
  const fluxoDiario = groupByDay(rows);
  const porLoja = groupByStore(rows);

  const hojeMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const proximos7 = fluxoDiario.filter((d) => {
    if (d.dia === "sem-data") return false;
    const [y, m, dd] = d.dia.split("-").map(Number);
    const dtMs = new Date(y, m - 1, dd, 12).getTime();
    return dtMs >= hojeMs && Math.round((dtMs - hojeMs) / 86400000) <= 7;
  });
  const proximos30 = fluxoDiario.filter((d) => {
    if (d.dia === "sem-data") return false;
    const [y, m, dd] = d.dia.split("-").map(Number);
    const dtMs = new Date(y, m - 1, dd, 12).getTime();
    return dtMs >= hojeMs && Math.round((dtMs - hojeMs) / 86400000) <= 30;
  });
  const acum7 = proximos7.reduce((a, d) => a + d.total, 0);
  const acum30 = proximos30.reduce((a, d) => a + d.total, 0);
  const maxFluxo = Math.max(...fluxoDiario.map((d) => d.total), 1);

  function handlePrint() {
    const conteudo = printRef.current;
    if (!conteudo) return;
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório Financeiro — O2 Distribuidora</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; color: #1e293b; background: #fff; }
  .page-break { page-break-before: always; }

  /* HEADER */
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5px solid #0f172a; padding-bottom: 10px; margin-bottom: 18px; }
  .header-logo { font-size: 18pt; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; }
  .header-logo span { color: #2563eb; }
  .header-meta { text-align: right; color: #64748b; font-size: 7.5pt; line-height: 1.6; }
  .header-meta strong { display: block; font-size: 10pt; color: #0f172a; font-weight: 700; }

  /* SECTION TITLE */
  .section-title { font-size: 10pt; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 10px; border-left: 3px solid #2563eb; padding-left: 8px; }

  /* SUMMARY CARDS */
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
  .card { border-radius: 8px; padding: 10px 12px; }
  .card-red { background: #fef2f2; border: 1px solid #fecaca; }
  .card-yellow { background: #fffbeb; border: 1px solid #fde68a; }
  .card-blue { background: #eff6ff; border: 1px solid #bfdbfe; }
  .card-green { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .card-gray { background: #f8fafc; border: 1px solid #e2e8f0; }
  .card-label { font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; margin-bottom: 4px; }
  .card-value { font-size: 13pt; font-weight: 800; color: #0f172a; line-height: 1; }
  .card-sub { font-size: 7pt; color: #64748b; margin-top: 3px; }
  .card-red .card-value { color: #dc2626; }
  .card-yellow .card-value { color: #d97706; }
  .card-blue .card-value { color: #2563eb; }
  .card-green .card-value { color: #16a34a; }

  /* TABLES */
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  thead tr { background: #0f172a; color: #fff; }
  thead th { padding: 6px 8px; text-align: left; font-weight: 600; font-size: 7.5pt; }
  thead th.right { text-align: right; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:hover { background: #f1f5f9; }
  tbody td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot tr { background: #1e293b; color: #fff; font-weight: 700; }
  tfoot td { padding: 6px 8px; }
  tfoot td.right { text-align: right; }

  /* BADGES */
  .badge { display: inline-block; border-radius: 4px; padding: 2px 6px; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .badge-red { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .badge-yellow { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
  .badge-green { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

  /* FORECAST */
  .forecast-bar-wrap { margin-top: 8px; }
  .forecast-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 8pt; }
  .forecast-label { width: 130px; color: #475569; font-size: 7.5pt; }
  .forecast-bar-bg { flex: 1; background: #e2e8f0; border-radius: 4px; height: 12px; overflow: hidden; }
  .forecast-bar-fill { height: 100%; border-radius: 4px; background: #2563eb; }
  .forecast-value { width: 90px; text-align: right; font-weight: 700; color: #0f172a; font-size: 8pt; }
  .forecast-qtd { width: 30px; text-align: right; color: #94a3b8; font-size: 7pt; }

  /* FLUXO DE CAIXA */
  .fluxo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; margin-top: 8px; }
  .fluxo-card { border-radius: 8px; border: 1px solid #e2e8f0; padding: 9px 12px; background: #f8fafc; }
  .fluxo-card.overdue { border-color: #fecaca; background: #fef2f2; }
  .fluxo-card.hoje { border-color: #bfdbfe; background: #eff6ff; }
  .fluxo-card.amanha { border-color: #fde68a; background: #fffbeb; }
  .fluxo-date { font-size: 8pt; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
  .fluxo-card.overdue .fluxo-date { color: #dc2626; }
  .fluxo-card.hoje .fluxo-date { color: #2563eb; }
  .fluxo-card.amanha .fluxo-date { color: #d97706; }
  .fluxo-value { font-size: 12pt; font-weight: 800; color: #0f172a; line-height: 1.1; margin-bottom: 4px; }
  .fluxo-card.overdue .fluxo-value { color: #dc2626; }
  .fluxo-meta { font-size: 6.5pt; color: #64748b; line-height: 1.5; }
  .fluxo-lojas { font-size: 6.5pt; color: #94a3b8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fluxo-total-bar { margin-top: 16px; }
  .fluxo-total-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .fluxo-total-label { width: 140px; font-size: 7.5pt; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fluxo-total-bar-bg { flex: 1; background: #e2e8f0; border-radius: 3px; height: 10px; overflow: hidden; }
  .fluxo-total-bar-fill { height: 100%; border-radius: 3px; }
  .fluxo-total-val { width: 90px; text-align: right; font-weight: 700; font-size: 8pt; color: #0f172a; }
  .fluxo-total-qtd { width: 28px; text-align: right; font-size: 7pt; color: #94a3b8; }
  .fluxo-acum-row { display: flex; justify-content: space-between; background: #f1f5f9; border-radius: 6px; padding: 6px 10px; margin-top: 10px; font-size: 8pt; }
  .fluxo-acum-item { text-align: center; }
  .fluxo-acum-label { color: #64748b; font-size: 7pt; }
  .fluxo-acum-value { font-weight: 800; color: #0f172a; margin-top: 1px; }

  /* FOOTER */
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7pt; color: #94a3b8; }

  /* DIVIDER */
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }

  .obs-box { background: #fafafa; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; font-size: 7.5pt; color: #475569; line-height: 1.7; margin-top: 10px; }
  .obs-box strong { color: #0f172a; }
</style>
</head>
<body>
${conteudo.innerHTML}
</body>
</html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  const maxPrevisao = Math.max(...previsoes.map((p) => p.total), 1);
  const maxLoja = Math.max(...porLoja.map((l) => l.aberto), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-700 text-slate-900">Relatório Financeiro</h2>
            <p className="text-sm text-slate-500">Prévia — clique em Imprimir para gerar o PDF</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-600 text-white hover:bg-blue-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 15.75v3h10.5v-3M6.75 9.75h10.5M3.75 9.75h16.5a.75.75 0 00.75-.75V5.25a.75.75 0 00-.75-.75H3.75a.75.75 0 00-.75.75V9a.75.75 0 00.75.75zM6.75 15.75H3.75a.75.75 0 01-.75-.75v-4.5a.75.75 0 01.75-.75h16.5a.75.75 0 01.75.75v4.5a.75.75 0 01-.75.75h-3" />
              </svg>
              Imprimir / Salvar PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-6">
          <div ref={printRef} className="mx-auto max-w-[820px] bg-white p-10 shadow-sm">

            {/* ── CABEÇALHO ── */}
            <div className="header">
              <div className="header-logo">O2<span>.</span>Distribuidora</div>
              <div className="header-meta">
                <strong>Relatório Financeiro — Diretoria</strong>
                Emitido em {hoje} às {agora}<br />
                {filtroLabel ? <>{filtroLabel}<br /></> : null}
                {rows.length} pedido(s) considerado(s)
              </div>
            </div>

            {/* ── RESUMO EXECUTIVO ── */}
            <div className="section-title">Resumo Executivo</div>
            <div className="cards">
              <div className="card card-red">
                <div className="card-label">Vencido</div>
                <div className="card-value">{brl(totalVencido)}</div>
                <div className="card-sub">{vencidos.length} pedido(s) em atraso</div>
              </div>
              <div className="card card-yellow">
                <div className="card-label">A vencer (3 dias)</div>
                <div className="card-value">{brl(totalAVencer)}</div>
                <div className="card-sub">{aVencer.length} pedido(s)</div>
              </div>
              <div className="card card-blue">
                <div className="card-label">Em aberto</div>
                <div className="card-value">{brl(totalEmAberto)}</div>
                <div className="card-sub">{emAberto.length} pedido(s) no prazo</div>
              </div>
              <div className="card card-green">
                <div className="card-label">Recebido</div>
                <div className="card-value">{brl(totalPago)}</div>
                <div className="card-sub">{pagos.length} pedido(s) pagos</div>
              </div>
            </div>
            <div className="cards" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
              <div className="card card-gray">
                <div className="card-label">Total Geral (a pagar)</div>
                <div className="card-value">{brl(totalGeral)}</div>
                <div className="card-sub">{rows.length} pedido(s) no filtro</div>
              </div>
              <div className="card card-red" style={{ opacity: totalEncargos > 0 ? 1 : 0.4 }}>
                <div className="card-label">Encargos s/ vencidos</div>
                <div className="card-value">{brl(totalEncargos)}</div>
                <div className="card-sub">multa + juros acumulados</div>
              </div>
              <div className="card card-gray">
                <div className="card-label">Inadimplência</div>
                <div className="card-value">{totalGeral > 0 ? ((totalVencido / totalGeral) * 100).toFixed(1) : "0,0"}%</div>
                <div className="card-sub">sobre o total do filtro</div>
              </div>
            </div>

            {/* ── PEDIDOS VENCIDOS ── */}
            {vencidos.length > 0 && (
              <>
                <div className="section-title">Pedidos Vencidos</div>
                <table>
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Loja / Cliente</th>
                      <th className="right">Vencimento</th>
                      <th className="right">Dias em atraso</th>
                      <th className="right">Principal</th>
                      <th className="right">Encargos</th>
                      <th className="right">Total a pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vencidos.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "7pt", color: "#64748b" }}>{r.id.slice(0, 8)}</td>
                        <td>{r.store_name}</td>
                        <td className="right">{dataBR(r.due_date)}</td>
                        <td className="right" style={{ color: "#dc2626", fontWeight: 700 }}>{r.days_late}d</td>
                        <td className="right">{brl(r.a_pagar_base)}</td>
                        <td className="right" style={{ color: r.encargos > 0 ? "#dc2626" : undefined }}>{brl(r.encargos)}</td>
                        <td className="right" style={{ fontWeight: 700 }}>{brl(r.a_pagar_exib)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Total vencido ({vencidos.length} pedidos)</td>
                      <td className="right">{brl(vencidos.reduce((a, r) => a + r.a_pagar_base, 0))}</td>
                      <td className="right">{brl(totalEncargos)}</td>
                      <td className="right">{brl(totalVencido)}</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}

            {/* ── A VENCER ── */}
            {aVencer.length > 0 && (
              <>
                <div className="section-title">A Vencer nos Próximos 3 Dias</div>
                <table>
                  <thead>
                    <tr>
                      <th>Pedido</th>
                      <th>Loja / Cliente</th>
                      <th className="right">Vencimento</th>
                      <th className="right">Forma Pgto.</th>
                      <th className="right">Valor a pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aVencer.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontFamily: "monospace", fontSize: "7pt", color: "#64748b" }}>{r.id.slice(0, 8)}</td>
                        <td>{r.store_name}</td>
                        <td className="right">{dataBR(r.due_date)}</td>
                        <td className="right">{r.payment_method ?? "—"}</td>
                        <td className="right" style={{ fontWeight: 700 }}>{brl(r.a_pagar_exib)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Total a vencer ({aVencer.length} pedidos)</td>
                      <td className="right">{brl(totalAVencer)}</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}

            {/* ── PREVISÃO DE RECEBIMENTO ── */}
            {previsoes.length > 0 && (
              <>
                <div className="section-title">Previsão de Recebimento por Mês</div>
                <div className="forecast-bar-wrap">
                  {previsoes.map((p) => (
                    <div key={p.mes} className="forecast-row">
                      <div className="forecast-label">{p.label}</div>
                      <div className="forecast-bar-bg">
                        <div className="forecast-bar-fill" style={{ width: `${(p.total / maxPrevisao) * 100}%` }} />
                      </div>
                      <div className="forecast-value">{brl(p.total)}</div>
                      <div className="forecast-qtd">{p.qtd}x</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── FLUXO DE CAIXA DIÁRIO ── */}
            {fluxoDiario.length > 0 && (
              <>
                <div className="section-title">Fluxo de Caixa — A Receber por Data</div>

                {/* Cards por dia */}
                <div className="fluxo-grid">
                  {fluxoDiario.map((d) => {
                    const isOverdue = d.overdue;
                    const isHoje = d.dia === new Date().toISOString().slice(0, 10);
                    const isAmanha = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return d.dia === t.toISOString().slice(0, 10); })();
                    const cls = isOverdue ? "overdue" : isHoje ? "hoje" : isAmanha ? "amanha" : "";
                    return (
                      <div key={d.dia} className={`fluxo-card ${cls}`}>
                        <div className="fluxo-date">{d.label}</div>
                        <div className="fluxo-value">{brl(d.total)}</div>
                        <div className="fluxo-meta">{d.qtd} pedido(s)</div>
                        <div className="fluxo-lojas">{d.lojas.slice(0, 3).join(", ")}{d.lojas.length > 3 ? ` +${d.lojas.length - 3}` : ""}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Barra comparativa */}
                <div className="fluxo-total-bar">
                  {fluxoDiario.map((d) => {
                    const fillColor = d.overdue ? "#dc2626" : d.dia === new Date().toISOString().slice(0, 10) ? "#2563eb" : "#22c55e";
                    return (
                      <div key={d.dia} className="fluxo-total-row">
                        <div className="fluxo-total-label">{d.label}</div>
                        <div className="fluxo-total-bar-bg">
                          <div className="fluxo-total-bar-fill" style={{ width: `${(d.total / maxFluxo) * 100}%`, background: fillColor }} />
                        </div>
                        <div className="fluxo-total-val">{brl(d.total)}</div>
                        <div className="fluxo-total-qtd">{d.qtd}x</div>
                      </div>
                    );
                  })}
                </div>

                {/* Acumulados */}
                <div className="fluxo-acum-row">
                  <div className="fluxo-acum-item">
                    <div className="fluxo-acum-label">Vencido (em atraso)</div>
                    <div className="fluxo-acum-value" style={{ color: "#dc2626" }}>{brl(totalVencido)}</div>
                  </div>
                  <div className="fluxo-acum-item">
                    <div className="fluxo-acum-label">Próximos 7 dias</div>
                    <div className="fluxo-acum-value">{brl(acum7)}</div>
                  </div>
                  <div className="fluxo-acum-item">
                    <div className="fluxo-acum-label">Próximos 30 dias</div>
                    <div className="fluxo-acum-value">{brl(acum30)}</div>
                  </div>
                  <div className="fluxo-acum-item">
                    <div className="fluxo-acum-label">Total em aberto</div>
                    <div className="fluxo-acum-value">{brl(totalVencido + totalAVencer + totalEmAberto)}</div>
                  </div>
                </div>
              </>
            )}

            {/* PAGE BREAK */}
            <div className="page-break" />

            {/* ── HEADER 2ª PÁGINA ── */}
            <div className="header" style={{ marginTop: 0 }}>
              <div className="header-logo">O2<span>.</span>Distribuidora</div>
              <div className="header-meta">
                <strong>Relatório Financeiro — Diretoria</strong>
                {hoje} às {agora} — pág. 2
              </div>
            </div>

            {/* ── POSIÇÃO POR CLIENTE ── */}
            <div className="section-title">Posição por Cliente / Loja</div>
            <table>
              <thead>
                <tr>
                  <th>Loja / Cliente</th>
                  <th className="right">Qtd. pedidos</th>
                  <th className="right">Total a pagar</th>
                  <th className="right">Pago</th>
                  <th className="right">Em aberto</th>
                  <th className="right">Vencido</th>
                  <th className="right">Concentração</th>
                </tr>
              </thead>
              <tbody>
                {porLoja.map((l) => (
                  <tr key={l.nome}>
                    <td style={{ fontWeight: 600 }}>{l.nome}</td>
                    <td className="right">{l.qtd}</td>
                    <td className="right">{brl(l.total)}</td>
                    <td className="right" style={{ color: "#16a34a" }}>{brl(l.pago)}</td>
                    <td className="right">{brl(l.aberto)}</td>
                    <td className="right" style={{ color: l.vencido > 0 ? "#dc2626" : undefined, fontWeight: l.vencido > 0 ? 700 : undefined }}>
                      {l.vencido > 0 ? brl(l.vencido) : "—"}
                    </td>
                    <td className="right">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <div style={{ width: 50, background: "#e2e8f0", borderRadius: 3, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${(l.aberto / maxLoja) * 100}%`, background: l.vencido > 0 ? "#dc2626" : "#2563eb", height: "100%", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: "7pt", color: "#64748b", width: 30, textAlign: "right" }}>
                          {totalGeral > 0 ? ((l.total / totalGeral) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total ({rows.length} pedidos)</td>
                  <td className="right">{rows.length}</td>
                  <td className="right">{brl(totalGeral)}</td>
                  <td className="right">{brl(totalPago)}</td>
                  <td className="right">{brl(rows.filter(r => !r.is_paid).reduce((a, r) => a + r.a_pagar_exib, 0))}</td>
                  <td className="right">{brl(totalVencido)}</td>
                  <td className="right">100%</td>
                </tr>
              </tfoot>
            </table>

            {/* ── OBSERVAÇÕES ── */}
            <div className="obs-box" style={{ marginTop: 24 }}>
              <strong>Notas metodológicas</strong><br />
              • <strong>Vencido:</strong> pedidos com data de vencimento anterior a hoje e ainda não pagos.<br />
              • <strong>A vencer:</strong> pedidos com vencimento nos próximos 3 dias.<br />
              • <strong>Encargos:</strong> calculados conforme configuração (multa + juros por dia de atraso) aplicada sobre o valor base.<br />
              • <strong>Previsão:</strong> considera apenas pedidos ainda em aberto, agrupados por mês de vencimento (ou criação quando sem data).<br />
              • <strong>Fluxo de caixa:</strong> agrupa pedidos em aberto por data de vencimento. Vermelho = atrasado, azul = hoje, amarelo = amanhã, verde = futuro.<br />
              • <strong>Concentração:</strong> percentual do valor total a pagar representado por cada cliente.
            </div>

            {/* ── RODAPÉ ── */}
            <div className="footer">
              <span>O2 Distribuidora — Relatório de uso interno — Diretoria</span>
              <span>Gerado em {hoje} às {agora} • o2pedidos.netlify.app</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
