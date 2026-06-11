"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import PortalShell from "@/app/components/PortalShell";
import { PageHeader, Card, Badge } from "@/app/components/ui";

type OrderRow = {
  id: string;
  store_id: string;
  status: string;
  notes: string | null;
  created_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;

  is_paid: boolean | null;
  paid_at: string | null;
  payment_method: "PIX" | "CARTAO" | "BOLETO" | null;

  logistic_status: "RECEBIDO" | "EM_SEPARACAO" | "SAIU_PARA_ENTREGA" | "ENTREGUE" | null;

  delivery_mode: "RETIRADA" | "FRETE" | null;
  freight_fee: number | null;

  credit_applied: number | null;
  due_date: string | null;
  delivery_forecast: string | null;

  edited_by_admin: boolean | null;
  edited_at: string | null;
};

type TotalsRow = {
  order_id: string;
  store_id: string;
  total_cost: number | null;
};

type StoreRow = { id: string; name: string };

type StoreXml = {
  name: string | null; legal_name: string | null; cnpj: string | null;
  ie: string | null; ind_ie_dest: string | null;
  address_zip: string | null; address_street: string | null;
  address_number: string | null; address_complement: string | null;
  address_neighborhood: string | null; city: string | null; state: string | null;
};

type EmitterXml = {
  name: string; legal_name: string; cnpj: string; ie: string | null;
  address_zip: string | null; address_street: string | null;
  address_number: string | null; address_complement: string | null;
  address_neighborhood: string | null; city: string | null; state: string | null;
};

// ─── XML helpers ─────────────────────────────────────────────────────────────
function _esc(s: string | null | undefined) {
  return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function _pad(n: number, w = 2) { return String(n).padStart(w, "0"); }
function _nfeDate(iso: string) {
  const d = new Date(new Date(iso).getTime() - 3*3600000); // UTC→-03:00
  return `${d.getUTCFullYear()}-${_pad(d.getUTCMonth()+1)}-${_pad(d.getUTCDate())}T${_pad(d.getUTCHours())}:${_pad(d.getUTCMinutes())}:${_pad(d.getUTCSeconds())}-03:00`;
}
function _cMun(city: string | null, state: string | null): string {
  const MAP: Record<string,string> = {
    "BELO HORIZONTE":"3106200","CONTAGEM":"3118601","BETIM":"3106705",
    "IPATINGA":"3131307","RIBEIRAO DAS NEVES":"3154606","JUIZ DE FORA":"3136702",
    "UBERLANDIA":"3170206","MONTES CLAROS":"3143302","GOVERNADOR VALADARES":"3127701",
    "SANTA LUZIA":"3157807","VESPASIANO":"3171501","SAO PAULO":"3550308",
    "CAMPINAS":"3509502","GUARULHOS":"3518800","SAO BERNARDO DO CAMPO":"3548708",
    "RIO DE JANEIRO":"3304557","NITEROI":"3303302","BRASILIA":"5300108",
  };
  const key = (city ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim();
  return MAP[key] ?? "0000000";
}
function _cUF(state: string | null): string {
  const MAP: Record<string,string> = {
    "MG":"31","SP":"35","RJ":"33","ES":"32","BA":"29","GO":"52","DF":"53",
    "MT":"51","MS":"50","PR":"41","SC":"42","RS":"43","PE":"26","CE":"23",
    "AM":"13","PA":"15","MA":"21","PI":"22","RN":"24","PB":"25","AL":"27",
    "SE":"28","TO":"17","RO":"11","AC":"12","RR":"14","AP":"16",
  };
  return MAP[(state ?? "").toUpperCase()] ?? "31";
}
function _buildNFeXml(
  orderId: string, createdAt: string,
  emit: EmitterXml, dest: StoreXml,
  items: Array<{ sku: string|null; name: string|null; unit: string|null; qty: number; unit_cost: number }>,
  freight: number
): { xml: string; filename: string } {
  const date   = _nfeDate(createdAt);
  const aamm   = `${String(new Date(createdAt).getUTCFullYear()).slice(2)}${_pad(new Date(createdAt).getUTCMonth()+1)}`;
  const cnpj14 = emit.cnpj.replace(/\D/g,"").padStart(14,"0");
  const nNF    = String((parseInt(orderId.replace(/-/g,"").slice(0,8),16)%999999998)+1).padStart(9,"0");
  const cNF    = String(Math.floor(Math.random()*99999998)+1).padStart(8,"0");
  const emitCUF = _cUF(emit.state);
  const chave  = `${emitCUF}${aamm}${cnpj14}55001${nNF}1${cNF}0`;

  const destCnpj = (dest.cnpj ?? "").replace(/\D/g,"").padStart(14,"0");
  const total = items.reduce((a,i)=>a+i.qty*i.unit_cost,0);

  const dets = items.map((item,idx)=>{
    const qty=Number(item.qty)||0, vUn=Number(item.unit_cost)||0;
    const unit=_esc(item.unit||"UN").slice(0,6);
    return `<det nItem="${idx+1}"><prod><cProd>${_esc(item.sku||"SEM-SKU")}</cProd><cEAN>SEM GTIN</cEAN><xProd>${_esc(item.name||"")}</xProd><NCM>00000000</NCM><CFOP>5102</CFOP><uCom>${unit}</uCom><qCom>${qty.toFixed(4)}</qCom><vUnCom>${vUn.toFixed(4)}</vUnCom><vProd>${(qty*vUn).toFixed(2)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${unit}</uTrib><qTrib>${qty.toFixed(4)}</qTrib><vUnTrib>${vUn.toFixed(4)}</vUnTrib><indTot>1</indTot></prod><imposto><vTotTrib>0.00</vTotTrib><ICMS><ICMS40><orig>0</orig><CST>41</CST></ICMS40></ICMS><IPI><cEnq>999</cEnq><IPINT><CST>53</CST></IPINT></IPI><PIS><PISAliq><CST>07</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>07</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSAliq></COFINS></imposto></det>`;
  }).join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>`+
    `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">`+
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">`+
    `<infNFe versao="4.00" Id="NFe${chave}">`+
      `<ide><cUF>${emitCUF}</cUF><cNF>${cNF}</cNF>`+
      `<natOp>VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS</natOp>`+
      `<mod>55</mod><serie>1</serie><nNF>${parseInt(nNF,10)}</nNF>`+
      `<dhEmi>${date}</dhEmi><dhSaiEnt>${date}</dhSaiEnt>`+
      `<tpNF>1</tpNF><idDest>1</idDest>`+
      `<cMunFG>${_cMun(emit.city, emit.state)}</cMunFG>`+
      `<tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>1</tpAmb>`+
      `<finNFe>1</finNFe><indFinal>0</indFinal><indPres>9</indPres>`+
      `<indIntermed>0</indIntermed><procEmi>0</procEmi><verProc>PORTAL-O2</verProc></ide>`+
      `<emit>`+
        `<CNPJ>${cnpj14}</CNPJ>`+
        `<xNome>${_esc(emit.legal_name)}</xNome>`+
        `<xFant>${_esc(emit.name)}</xFant>`+
        `<enderEmit>`+
          `<xLgr>${_esc(emit.address_street)}</xLgr>`+
          `<nro>${_esc(emit.address_number)}</nro>`+
          (emit.address_complement?`<xCpl>${_esc(emit.address_complement)}</xCpl>`:``)+
          `<xBairro>${_esc(emit.address_neighborhood)}</xBairro>`+
          `<cMun>${_cMun(emit.city,emit.state)}</cMun>`+
          `<xMun>${_esc(emit.city)}</xMun>`+
          `<UF>${(emit.state||"MG").toUpperCase()}</UF>`+
          `<CEP>${(emit.address_zip||"").replace(/\D/g,"")}</CEP>`+
          `<cPais>1058</cPais><xPais>BRASIL</xPais>`+
        `</enderEmit>`+
        `<IE>${emit.ie||"ISENTO"}</IE>`+
        `<CRT>3</CRT>`+
      `</emit>`+
      `<dest>`+
        `<CNPJ>${destCnpj}</CNPJ>`+
        `<xNome>${_esc(dest.legal_name||dest.name||"DESTINATARIO")}</xNome>`+
        `<enderDest>`+
          `<xLgr>${_esc(dest.address_street||"")}</xLgr>`+
          `<nro>${_esc(dest.address_number||"S/N")}</nro>`+
          (dest.address_complement?`<xCpl>${_esc(dest.address_complement)}</xCpl>`:``)+
          `<xBairro>${_esc(dest.address_neighborhood||"")}</xBairro>`+
          `<cMun>${_cMun(dest.city,dest.state)}</cMun>`+
          `<xMun>${_esc(dest.city||"")}</xMun>`+
          `<UF>${(dest.state||"MG").toUpperCase()}</UF>`+
          `<CEP>${(dest.address_zip||"").replace(/\D/g,"")}</CEP>`+
          `<cPais>1058</cPais><xPais>BRASIL</xPais>`+
        `</enderDest>`+
        `<indIEDest>${dest.ind_ie_dest||"9"}</indIEDest>`+
        (dest.ie?`<IE>${_esc(dest.ie)}</IE>`:``)+
      `</dest>`+
      dets+
      `<total><ICMSTot>`+
        `<vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>`+
        `<vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST>`+
        `<vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>`+
        `<vProd>${total.toFixed(2)}</vProd>`+
        `<vFrete>${freight.toFixed(2)}</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>`+
        `<vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol>`+
        `<vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro>`+
        `<vNF>${(total+freight).toFixed(2)}</vNF><vTotTrib>0.00</vTotTrib>`+
      `</ICMSTot></total>`+
      `<transp><modFrete>9</modFrete></transp>`+
      `<pag><detPag><indPag>0</indPag><tPag>90</tPag><vPag>0.00</vPag></detPag></pag>`+
    `</infNFe></NFe></nfeProc>`;

  return { xml, filename: `${chave}.xml` };
}

type CreditBalanceRow = {
  store_id: string;
  balance: number | null;
};

type OrderUi = OrderRow & { total_cost: number; amount_due: number };

function fmtBR(iso: string | null | undefined) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return String(iso);
  }
}

function fmtDateOnly(ymd: string | null | undefined) {
  if (!ymd) return "-";
  try {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return String(ymd);
  }
}

function money(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
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

function statusTone(status: string): "green" | "red" | "yellow" | "neutral" {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "submitted") return "yellow";
  return "neutral";
}

function logisticTone(
  v: OrderRow["logistic_status"]
): "green" | "yellow" | "blue" | "neutral" {
  if (v === "ENTREGUE") return "green";
  if (v === "SAIU_PARA_ENTREGA") return "blue";
  if (v === "EM_SEPARACAO") return "yellow";
  return "neutral";
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isOrderOverdue(order: Pick<OrderRow, "due_date" | "is_paid">) {
  if (!order.due_date) return false;
  if (order.is_paid) return false;
  return order.due_date < todayYMD();
}

function dueTone(due: string | null, isPaid: boolean | null): "green" | "red" | "neutral" {
  if (!due) return "neutral";
  if (isPaid) return "green";
  return due < todayYMD() ? "red" : "green";
}

function dueLabel(due: string | null) {
  if (!due) return "Sem venc.";
  return fmtDateOnly(due);
}

function forecastTone(
  forecast: string | null,
  logistic: OrderRow["logistic_status"]
): "green" | "red" | "neutral" {
  if (!forecast) return "neutral";
  if (logistic === "ENTREGUE") return "green";
  return forecast < todayYMD() ? "red" : "green";
}

function forecastLabel(forecast: string | null) {
  if (!forecast) return "—";
  return fmtDateOnly(forecast);
}

function PrimaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-12 items-center justify-center rounded-[18px] px-5 text-sm font-semibold text-white transition",
        "bg-cyan-600 shadow-[0_14px_34px_rgba(8,145,178,0.26)] hover:bg-cyan-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SecondaryActionButton({
  children,
  onClick,
  disabled,
  fullWidth,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-12 items-center justify-center rounded-[18px] px-5 text-sm font-semibold transition",
        "border border-slate-200 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)] hover:bg-slate-50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        fullWidth ? "w-full" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function TextFilter({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-[13px] font-semibold text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-[13px] font-semibold text-slate-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-[13px] font-semibold text-slate-700">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-4 focus:ring-cyan-100"
      />
    </div>
  );
}

function SummaryBox({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[24px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:text-xs">
        {title}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-900 md:text-2xl">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function TopInfoCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[24px]">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 md:text-xs">
        {title}
      </div>
      <div className="mt-2 break-words text-sm font-semibold text-slate-900 md:text-base">
        {value}
      </div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500 break-all">{subtitle}</div> : null}
    </div>
  );
}

function MobileOrderCard({
  order,
  onOpen,
  onGenerateXml,
  generatingXml,
}: {
  order: OrderUi;
  onOpen: () => void;
  onGenerateXml?: () => void;
  generatingXml?: boolean;
}) {
  const freteTxt =
    order.delivery_mode === "FRETE"
      ? money(Number(order.freight_fee ?? 0))
      : "-";

  const isEdited = !!order.edited_by_admin;
  const overdue = isOrderOverdue(order);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[22px] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-slate-500 break-all">{order.id}</div>
          {isEdited ? (
            <div className="mt-2">
              <Badge tone="blue">Editado</Badge>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">A pagar</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {money(Number(order.amount_due ?? 0))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
        <Badge tone={logisticTone(order.logistic_status)}>
          {logisticLabel(order.logistic_status)}
        </Badge>
        {order.due_date ? (
          order.is_paid ? (
            <Badge tone="green">Pago</Badge>
          ) : overdue ? (
            <Badge tone="red">Vencido</Badge>
          ) : (
            <Badge tone="green">OK</Badge>
          )
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Entrega</div>
          <div className="mt-1 font-semibold text-slate-900">
            {deliveryLabel(order.delivery_mode)}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Frete</div>
          <div className="mt-1 font-semibold text-slate-900">{freteTxt}</div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Previsão</div>
          <div className="mt-1 font-semibold text-slate-900">
            {forecastLabel(order.delivery_forecast)}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Vencimento</div>
          <div className="mt-1 font-semibold text-slate-900">
            {dueLabel(order.due_date)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
          <div className="mt-1 font-semibold text-slate-900">
            {money(Number(order.total_cost) || 0)}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Crédito</div>
          <div className="mt-1 font-semibold text-slate-900">
            {money(Number(order.credit_applied ?? 0) || 0)}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Criado</div>
          <div className="mt-1 font-semibold text-slate-900">
            {fmtBR(order.created_at)}
          </div>
        </div>
      </div>

      {onGenerateXml ? (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={generatingXml}
            onClick={onGenerateXml}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            {generatingXml ? "Gerando XML..." : "Gerar XML"}
          </button>
        </div>
      ) : null}
    </button>
  );
}

export default function HistoricoPedidosPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState("");

  const [userEmail, setUserEmail] = useState<string>("-");
  const [storeName, setStoreName] = useState<string>("-");
  const [storeId, setStoreId] = useState<string | null>(null);

  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [orders, setOrders] = useState<OrderUi[]>([]);

  const [defaultEmitter, setDefaultEmitter] = useState<EmitterXml | null>(null);
  const [storeXmlData, setStoreXmlData] = useState<StoreXml | null>(null);
  const [generatingXmlIds, setGeneratingXmlIds] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [logFilter, setLogFilter] = useState<string>("all");
  const [paidFilter, setPaidFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  function toISOStart(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0).toISOString();
  }

  function toISOEnd(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59).toISOString();
  }

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const fromISO = dateFrom ? toISOStart(dateFrom) : null;
    const toISO = dateTo ? toISOEnd(dateTo) : null;

    return orders.filter((o) => {
      if (qq && !String(o.id).toLowerCase().includes(qq)) return false;
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (logFilter !== "all" && (o.logistic_status ?? "") !== logFilter) return false;

      if (paidFilter === "paid" && !o.is_paid) return false;
      if (paidFilter === "unpaid" && o.is_paid) return false;

      const overdue = isOrderOverdue(o);
      if (dueFilter === "overdue" && !overdue) return false;
      if (dueFilter === "not_overdue" && overdue) return false;
      if (dueFilter === "with_due" && !o.due_date) return false;
      if (dueFilter === "without_due" && o.due_date) return false;

      if (fromISO && (o.created_at ?? "") < fromISO) return false;
      if (toISO && (o.created_at ?? "") > toISO) return false;

      return true;
    });
  }, [orders, q, statusFilter, logFilter, paidFilter, dueFilter, dateFrom, dateTo]);

  const totalGeral = useMemo(
    () => filtered.reduce((acc, o) => acc + (Number(o.total_cost) || 0), 0),
    [filtered]
  );

  const totalCreditoAplicado = useMemo(
    () => filtered.reduce((acc, o) => acc + (Number(o.credit_applied ?? 0) || 0), 0),
    [filtered]
  );

  const totalAPagar = useMemo(
    () => filtered.reduce((acc, o) => acc + (Number(o.amount_due ?? 0) || 0), 0),
    [filtered]
  );

  useEffect(() => {
    (async () => {
      setMsg("");
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? "-");

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("store_id")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const sId = (profile?.store_id as string | null) ?? null;
      setStoreId(sId);

      if (!sId) {
        setStoreName("Sem loja vinculada");
        setLoading(false);
        return;
      }

      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id,name,legal_name,cnpj,ie,ind_ie_dest,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state")
        .eq("id", sId)
        .maybeSingle();

      if (sErr) {
        setMsg(sErr.message);
        setLoading(false);
        return;
      }

      const st = (store ?? null) as (StoreRow & StoreXml) | null;
      setStoreName(st?.name ?? "-");
      if (st) setStoreXmlData(st as StoreXml);

      const { data: emitter } = await supabase
        .from("emitters")
        .select("name,legal_name,cnpj,ie,address_zip,address_street,address_number,address_complement,address_neighborhood,city,state")
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle();
      if (emitter) setDefaultEmitter(emitter as EmitterXml);

      await Promise.all([loadCreditBalance(sId), loadOrders(sId)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCreditBalance(sId: string) {
    const { data, error } = await supabase
      .from("v_store_credit_balance")
      .select("store_id, balance")
      .eq("store_id", sId)
      .maybeSingle();

    if (error) {
      setMsg((m) => (m ? m : error.message));
      setCreditBalance(0);
      return;
    }

    const row = (data ?? null) as CreditBalanceRow | null;
    setCreditBalance(Number(row?.balance ?? 0) || 0);
  }

  async function loadOrders(sId: string) {
    setMsg("");

    const { data: ords, error: oErr } = await supabase
      .from("orders")
      .select(
        "id, store_id, status, notes, created_at, submitted_at, approved_at, is_paid, paid_at, payment_method, logistic_status, delivery_mode, freight_fee, credit_applied, due_date, delivery_forecast, edited_by_admin, edited_at"
      )
      .eq("store_id", sId)
      .neq("status", "awaiting_payment")
      .order("created_at", { ascending: false });

    if (oErr) {
      setMsg(oErr.message);
      setOrders([]);
      return;
    }

    const orderList = (ords ?? []) as OrderRow[];
    if (orderList.length === 0) {
      setOrders([]);
      return;
    }

    const ids = orderList.map((o) => o.id);

    const { data: tots, error: tErr } = await supabase
      .from("v_order_totals")
      .select("order_id, store_id, total_cost")
      .in("order_id", ids);

    if (tErr) {
      setMsg(tErr.message);
      setOrders(orderList.map((o) => ({ ...o, total_cost: 0, amount_due: 0 })));
      return;
    }

    const totalsList = (tots ?? []) as TotalsRow[];
    const map = new Map<string, number>();

    for (const r of totalsList) {
      map.set(r.order_id, Number(r.total_cost) || 0);
    }

    const ui: OrderUi[] = orderList.map((o) => {
      const total = map.get(o.id) ?? 0;
      const applied = Number(o.credit_applied ?? 0) || 0;
      const due = Math.max(total - applied, 0);
      return { ...o, total_cost: total, amount_due: due };
    });

    setOrders(ui);
  }

  async function generateOrderXml(order: OrderUi) {
    if (!defaultEmitter) { alert("Emitente padrão não cadastrado."); return; }
    if (!storeXmlData)    { alert("Dados da loja não carregados.");   return; }
    if (!storeXmlData.cnpj) { alert("Loja sem CNPJ cadastrado — não é possível gerar XML."); return; }

    setGeneratingXmlIds((s) => new Set(s).add(order.id));
    try {
      const { data: rawItems, error: iErr } = await supabase
        .from("order_items")
        .select("qty, unit_cost, product_id, products(sku, name, unit)")
        .eq("order_id", order.id);

      if (iErr) { alert("Erro ao carregar itens: " + iErr.message); return; }

      const items = (rawItems ?? []).map((row: any) => ({
        sku:       row.products?.sku  ?? null,
        name:      row.products?.name ?? null,
        unit:      row.products?.unit ?? "UN",
        qty:       Number(row.qty)       || 0,
        unit_cost: Number(row.unit_cost) || 0,
      }));

      if (items.length === 0) { alert("Pedido sem itens."); return; }

      const freight = order.delivery_mode === "FRETE" ? (Number(order.freight_fee) || 0) : 0;

      const { xml, filename } = _buildNFeXml(
        order.id,
        order.created_at ?? new Date().toISOString(),
        defaultEmitter,
        storeXmlData,
        items,
        freight
      );

      const blob = new Blob([xml], { type: "application/xml" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGeneratingXmlIds((s) => { const n = new Set(s); n.delete(order.id); return n; });
    }
  }

  async function refresh() {
    if (!storeId) return;
    setWorking(true);
    await Promise.all([loadCreditBalance(storeId), loadOrders(storeId)]);
    setWorking(false);
  }

  return (
    <PortalShell title="Pedidos" subtitle="Histórico de pedidos">
      <div className="space-y-4 md:space-y-6">
        <PageHeader
          title="Histórico de pedidos"
          subtitle="Clique em um pedido para ver os detalhes."
          right={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <SecondaryActionButton
                onClick={refresh}
                disabled={working || loading || !storeId}
                fullWidth
              >
                {working ? "Atualizando..." : "Atualizar"}
              </SecondaryActionButton>

              <PrimaryActionButton onClick={() => router.push("/pedido")} fullWidth>
                Novo pedido
              </PrimaryActionButton>
            </div>
          }
        />

        {msg ? (
          <Card title="Aviso">
            <div className="whitespace-pre-wrap text-sm text-red-600">{msg}</div>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6">
          <div className="order-2 space-y-4 md:space-y-6 xl:order-1">
            <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f6fafc_100%)] p-4 shadow-sm md:rounded-[30px] md:p-6">
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
                <TopInfoCard
                  title="Loja"
                  value={storeName}
                  subtitle={storeId ?? undefined}
                />

                <TopInfoCard
                  title="Usuário"
                  value={userEmail}
                />

                <TopInfoCard
                  title="Saldo de crédito"
                  value={money(creditBalance)}
                />
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[30px] md:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Filtros</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Refine a visualização dos pedidos.
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                  <SecondaryActionButton
                    onClick={() => {
                      setQ("");
                      setStatusFilter("all");
                      setLogFilter("all");
                      setPaidFilter("all");
                      setDueFilter("all");
                      setDateFrom("");
                      setDateTo("");
                    }}
                    fullWidth
                  >
                    Limpar filtros
                  </SecondaryActionButton>

                  <SecondaryActionButton
                    onClick={refresh}
                    disabled={working || loading || !storeId}
                    fullWidth
                  >
                    Recarregar
                  </SecondaryActionButton>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
                <div className="sm:col-span-2 xl:col-span-4">
                  <TextFilter
                    label="Buscar pedido"
                    value={q}
                    onChange={setQ}
                    placeholder="Buscar por ID do pedido..."
                  />
                </div>

                <div className="xl:col-span-2">
                  <SelectFilter
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: "all", label: "Todos" },
                      { value: "draft", label: "Draft" },
                      { value: "submitted", label: "Enviado" },
                      { value: "approved", label: "Aprovado" },
                      { value: "rejected", label: "Rejeitado" },
                    ]}
                  />
                </div>

                <div className="xl:col-span-2">
                  <SelectFilter
  label="Logística"
  value={logFilter}
  onChange={setLogFilter}
  options={[
    { value: "all", label: "Todos" },
    { value: "RECEBIDO", label: "Recebido" },
    { value: "EM_SEPARACAO", label: "Em separação" },
    { value: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
    { value: "ENTREGUE", label: "Entregue" },
  ]}
/>
                </div>

                <div className="xl:col-span-2">
                  <SelectFilter
                    label="Pagamento"
                    value={paidFilter}
                    onChange={setPaidFilter}
                    options={[
                      { value: "all", label: "Todos" },
                      { value: "paid", label: "Somente pagos" },
                      { value: "unpaid", label: "Somente não pagos" },
                    ]}
                  />
                </div>

                <div className="xl:col-span-2">
                  <SelectFilter
                    label="Vencimento"
                    value={dueFilter}
                    onChange={setDueFilter}
                    options={[
                      { value: "all", label: "Todos" },
                      { value: "overdue", label: "Somente vencidos" },
                      { value: "not_overdue", label: "Não vencidos" },
                      { value: "with_due", label: "Com vencimento" },
                      { value: "without_due", label: "Sem vencimento" },
                    ]}
                  />
                </div>

                <div className="xl:col-span-2">
                  <DateFilter label="De" value={dateFrom} onChange={setDateFrom} />
                </div>

                <div className="xl:col-span-2">
                  <DateFilter label="Até" value={dateTo} onChange={setDateTo} />
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:rounded-[30px] md:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Pedidos</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {loading ? "Carregando..." : `${filtered.length} pedido(s) no filtro`}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="mt-6 text-sm text-slate-600">Carregando...</div>
              ) : filtered.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                  Nenhum pedido encontrado.
                </div>
              ) : (
                <>
                  <div className="mt-6 hidden overflow-x-auto md:block">
                    <table className="w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left text-xs text-slate-600">
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Pedido
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Status
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Operação
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Entrega
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Previsão
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Frete
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Vencimento
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Criado
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Enviado
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3">
                            Aprovado
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                            Total
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                            Crédito
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3 text-right">
                            A pagar
                          </th>
                          <th className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-3"></th>
                        </tr>
                      </thead>

                      <tbody>
                        {filtered.map((o) => {
                          const freteTxt =
                            o.delivery_mode === "FRETE"
                              ? money(Number(o.freight_fee ?? 0))
                              : "-";

                          const isEdited = !!o.edited_by_admin;
                          const overdue = isOrderOverdue(o);

                          return (
                            <tr
                              key={o.id}
                              className="cursor-pointer hover:bg-slate-50"
                              onClick={() => router.push(`/pedidos/${o.id}`)}
                              title="Abrir pedido"
                            >
                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                                <div className="flex items-center gap-2">
                                  <div className="font-mono text-xs text-slate-600">{o.id}</div>
                                  {isEdited ? <Badge tone="blue">Editado</Badge> : null}
                                </div>

                                {isEdited && o.edited_at ? (
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    em {fmtBR(o.edited_at)}
                                  </div>
                                ) : null}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                                <Badge tone={logisticTone(o.logistic_status)}>
                                  {logisticLabel(o.logistic_status)}
                                </Badge>
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-sm text-slate-700">
                                {deliveryLabel(o.delivery_mode)}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                                <div className="flex items-center gap-2">
                                  <Badge tone={forecastTone(o.delivery_forecast, o.logistic_status)}>
                                    {forecastLabel(o.delivery_forecast)}
                                  </Badge>

                                  {o.delivery_forecast &&
                                  o.logistic_status !== "ENTREGUE" &&
                                  o.delivery_forecast < todayYMD() ? (
                                    <Badge tone="red">Atrasado</Badge>
                                  ) : null}
                                </div>
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-sm text-slate-700">
                                {freteTxt}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top">
                                <div className="flex items-center gap-2">
                                  <Badge tone={dueTone(o.due_date, o.is_paid)}>
                                    {dueLabel(o.due_date)}
                                  </Badge>

                                  {o.due_date ? (
                                    o.is_paid ? (
                                      <Badge tone="green">Pago</Badge>
                                    ) : overdue ? (
                                      <Badge tone="red">Vencido</Badge>
                                    ) : (
                                      <Badge tone="green">OK</Badge>
                                    )
                                  ) : null}
                                </div>
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-sm text-slate-700">
                                {fmtBR(o.created_at)}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-sm text-slate-700">
                                {fmtBR(o.submitted_at)}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-sm text-slate-700">
                                {fmtBR(o.approved_at)}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-right font-semibold text-slate-900">
                                {money(Number(o.total_cost) || 0)}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-right font-semibold text-slate-900">
                                {money(Number(o.credit_applied ?? 0) || 0)}
                              </td>

                              <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top text-right font-semibold text-slate-900">
                                {money(Number(o.amount_due ?? 0) || 0)}
                              </td>
                              <td
                                className="whitespace-nowrap border-b border-slate-100 px-4 py-4 align-top"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  disabled={generatingXmlIds.has(o.id)}
                                  onClick={() => generateOrderXml(o)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                                >
                                  {generatingXmlIds.has(o.id) ? "Gerando..." : "XML"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="mt-4 text-xs text-slate-500">
                      Clique em um pedido para abrir os detalhes.
                    </div>
                  </div>

                  <div className="mt-6 space-y-3 md:hidden">
                    {filtered.map((o) => (
                      <MobileOrderCard
                        key={o.id}
                        order={o}
                        onOpen={() => router.push(`/pedidos/${o.id}`)}
                        onGenerateXml={() => generateOrderXml(o)}
                        generatingXml={generatingXmlIds.has(o.id)}
                      />
                    ))}

                    <div className="text-center text-xs text-slate-500">
                      Toque em um pedido para abrir os detalhes.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="order-1 xl:order-2">
            <div className="xl:sticky xl:top-24">
              <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] p-4 shadow-sm md:rounded-[30px] md:p-6">
                <div className="text-lg font-semibold tracking-[-0.02em] text-slate-900">
                  Resumo exibido
                </div>

                <div className="mt-1 text-sm text-slate-600">
                  Valores com base nos filtros aplicados.
                </div>

                <div className="mt-5 grid gap-3 md:gap-4">
                  <SummaryBox
                    title="Total exibido"
                    value={money(totalGeral)}
                    subtitle={`${filtered.length} pedido(s)`}
                  />

                  <SummaryBox
                    title="Crédito aplicado"
                    value={money(totalCreditoAplicado)}
                  />

                  <SummaryBox title="A pagar" value={money(totalAPagar)} />

                  <div className="grid gap-3">
                    <PrimaryActionButton
                      onClick={() => router.push("/pedido")}
                      fullWidth
                    >
                      Novo pedido
                    </PrimaryActionButton>

                    <SecondaryActionButton
                      onClick={refresh}
                      disabled={working || loading || !storeId}
                      fullWidth
                    >
                      {working ? "Atualizando..." : "Atualizar dados"}
                    </SecondaryActionButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}