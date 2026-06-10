"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PageHeader, Card, Input } from "@/app/components/ui";
import Link from "next/link";

type InventoryRow = {
  id: string;
  title: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

type InventoryItem = {
  id: string;
  inventory_id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number | null;
  unit_cost: number | null;
  notes: string | null;
  sku: string | null;
  name: string | null;
  unit: string | null;
};

function fmt(n: number, d = 2) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function printInventory(inv: InventoryRow, items: InventoryItem[]) {
  const rows = items
    .map(
      (i) => `
      <tr>
        <td>${i.sku ?? "—"}</td>
        <td>${i.name ?? "—"}</td>
        <td class="num">${fmt(i.system_qty)} ${i.unit ?? ""}</td>
        <td class="box"></td>
        <td class="box"></td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Inventário: ${inv.title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 15px; margin-bottom: 4px; }
    .meta { font-size: 10px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f0f0f0; text-align: left; padding: 5px 8px; font-size: 10px; text-transform: uppercase; border: 1px solid #ccc; }
    td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: middle; }
    .num { text-align: right; }
    .box { width: 90px; height: 24px; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print {
      body { padding: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <h1>Inventário: ${inv.title}</h1>
  <p class="meta">Aberto em: ${new Date(inv.opened_at).toLocaleString("pt-BR")} · Total de produtos: ${items.length}</p>
  <table>
    <thead>
      <tr>
        <th>SKU</th>
        <th>Produto</th>
        <th>Saldo sistema</th>
        <th>Contagem 1</th>
        <th>Contagem 2</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

export default function InventarioPage() {
  const router = useRouter();
  const [inventories, setInventories] = useState<InventoryRow[]>([]);
  const [active, setActive] = useState<InventoryRow | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace("/login"); return; }
      await loadInventories();
    })();
  }, []);

  function showToast(msg: string, type: "ok" | "err") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function loadInventories() {
    setLoading(true);
    const { data } = await supabase
      .from("stock_inventories")
      .select("id,title,status,opened_at,closed_at,notes")
      .order("opened_at", { ascending: false });
    if (data) setInventories(data as InventoryRow[]);
    setLoading(false);
  }

  async function openInventory(inv: InventoryRow) {
    setActive(inv);
    setLoading(true);
    const { data } = await supabase
      .from("stock_inventory_items")
      .select("id,inventory_id,product_id,system_qty,counted_qty,unit_cost,notes,products(sku,name,unit)")
      .eq("inventory_id", inv.id)
      .order("products(name)");
    if (data) {
      setItems(
        (data as any[]).map((r) => ({
          ...r,
          sku: r.products?.sku ?? null,
          name: r.products?.name ?? null,
          unit: r.products?.unit ?? null,
        }))
      );
    }
    setLoading(false);
  }

  async function deleteInventory(inv: InventoryRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Excluir o inventário "${inv.title}"? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(inv.id);
    // itens são removidos automaticamente pelo CASCADE
    const { error } = await supabase.from("stock_inventories").delete().eq("id", inv.id);
    if (error) {
      showToast("Erro ao excluir inventário.", "err");
    } else {
      showToast("Inventário excluído.", "ok");
      setInventories((prev) => prev.filter((i) => i.id !== inv.id));
    }
    setDeletingId(null);
  }

  async function createInventory() {
    if (!newTitle.trim()) { showToast("Informe um título para o inventário.", "err"); return; }
    setSaving(true);
    try {
      const { data: inv, error: invErr } = await supabase
        .from("stock_inventories")
        .insert({ title: newTitle.trim() })
        .select()
        .single();
      if (invErr) throw new Error(invErr.message);

      const { data: balance, error: balErr } = await supabase
        .from("v_stock_balance")
        .select("product_id,current_qty,avg_cost")
        .eq("track_stock", true);
      if (balErr) throw new Error(balErr.message);

      if (balance && balance.length > 0) {
        const invItems = balance.map((b: any) => ({
          inventory_id: inv.id,
          product_id: b.product_id,
          system_qty: Number(b.current_qty) || 0,
          unit_cost: Number(b.avg_cost) || 0,
          counted_qty: null,
        }));
        const { error: itemsErr } = await supabase.from("stock_inventory_items").insert(invItems);
        if (itemsErr) throw new Error(itemsErr.message);
      }

      showToast("Inventário criado!", "ok");
      setNewTitle("");
      setShowNewForm(false);
      await loadInventories();
      await openInventory(inv as InventoryRow);
    } catch (err: any) {
      showToast(err.message ?? "Erro.", "err");
    } finally {
      setSaving(false);
    }
  }

  async function saveCounted(item: InventoryItem, value: string) {
    const v = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(v)) return;
    await supabase.from("stock_inventory_items").update({ counted_qty: v }).eq("id", item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, counted_qty: v } : i)));
  }

  async function closeInventory() {
    if (!active) return;
    const unadjusted = items.filter((i) => i.counted_qty === null);
    if (unadjusted.length > 0) {
      const ok = confirm(`${unadjusted.length} produto(s) sem contagem. Prosseguir mesmo assim?`);
      if (!ok) return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;

      const movements = items
        .filter((i) => i.counted_qty !== null && i.counted_qty !== i.system_qty)
        .map((i) => ({
          product_id: i.product_id,
          movement_type: "INVENTORY_ADJUSTMENT",
          quantity: i.counted_qty! - i.system_qty,
          unit_cost: i.unit_cost ?? 0,
          notes: `Ajuste inventário: ${active.title}`,
          created_by: userId ?? null,
        }));

      if (movements.length > 0) {
        const { error: mvErr } = await supabase.from("stock_movements").insert(movements);
        if (mvErr) throw new Error(mvErr.message);
      }

      const { error: closeErr } = await supabase
        .from("stock_inventories")
        .update({ status: "CLOSED", closed_at: new Date().toISOString(), closed_by: userId ?? null })
        .eq("id", active.id);
      if (closeErr) throw new Error(closeErr.message);

      showToast(`Inventário fechado. ${movements.length} ajuste(s) aplicado(s).`, "ok");
      setActive(null);
      setItems([]);
      await loadInventories();
    } catch (err: any) {
      showToast(err.message ?? "Erro.", "err");
    } finally {
      setSaving(false);
    }
  }

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) =>
      (i.sku ?? "").toLowerCase().includes(q) || (i.name ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const countedCount = items.filter((i) => i.counted_qty !== null).length;
  const diffCount = items.filter((i) => i.counted_qty !== null && i.counted_qty !== i.system_qty).length;

  if (loading && !active) return <div className="p-8 text-center text-sm text-slate-500">Carregando...</div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 rounded-[14px] px-4 py-3 text-sm font-medium shadow-lg ${toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <PageHeader
        title={active ? `Inventário: ${active.title}` : "Inventários"}
        subtitle={active ? `${countedCount}/${items.length} contados · ${diffCount} com diferença` : "Contagem e ajustes de estoque"}
        right={
          <div className="flex gap-2">
            {active ? (
              <>
                <button
                  onClick={() => printInventory(active, items)}
                  className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 110-2 1 1 0 010 2zm1 2v-2h6v2H7z" clipRule="evenodd"/>
                  </svg>
                  Imprimir
                </button>
                <button
                  onClick={() => { setActive(null); setItems([]); }}
                  className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  ← Voltar
                </button>
                {active.status === "OPEN" && (
                  <button
                    onClick={closeInventory}
                    disabled={saving}
                    className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    Fechar inventário
                  </button>
                )}
              </>
            ) : (
              <>
                <Link href="/adm/estoque" className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                  ← Estoque
                </Link>
                <button
                  onClick={() => setShowNewForm(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-[14px] bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 transition"
                >
                  + Novo inventário
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Formulário novo inventário */}
      {showNewForm && !active && (
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Novo inventário</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input label="Título" value={newTitle} onChange={(v) => setNewTitle(v)} placeholder="Ex: Inventário Junho 2026" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={createInventory} disabled={saving} className="h-10 rounded-[14px] bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition">
                {saving ? "Criando..." : "Criar"}
              </button>
              <button onClick={() => setShowNewForm(false)} className="h-10 rounded-[14px] border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50 transition">
                Cancelar
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de inventários */}
      {!active && (
        <Card>
          {inventories.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">Nenhum inventário criado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Título</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Aberto em</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fechado em</th>
                    <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody>
                  {inventories.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                      onClick={() => openInventory(inv)}
                    >
                      <td className="py-3 pr-4 font-medium text-slate-900">{inv.title}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${inv.status === "OPEN" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {inv.status === "OPEN" ? "Aberto" : "Fechado"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-500">{new Date(inv.opened_at).toLocaleDateString("pt-BR")}</td>
                      <td className="py-3 pr-4 text-slate-500">{inv.closed_at ? new Date(inv.closed_at).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-3 text-right">
                        <button
                          onClick={(e) => deleteInventory(inv, e)}
                          disabled={deletingId === inv.id}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 px-2 py-1 rounded hover:bg-red-50 transition"
                        >
                          {deletingId === inv.id ? "..." : "Excluir"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Itens do inventário ativo */}
      {active && (
        <Card>
          <div className="mb-4">
            <Input label="" value={search} onChange={(v) => setSearch(v)} placeholder="Buscar produto..." />
          </div>
          {loading ? (
            <p className="text-center text-sm text-slate-500 py-8">Carregando itens...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">SKU</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide">Produto</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Saldo sistema</th>
                    <th className="pb-3 pr-4 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Contagem física</th>
                    <th className="pb-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const diff = item.counted_qty !== null ? item.counted_qty - item.system_qty : null;
                    const hasDiff = diff !== null && diff !== 0;
                    return (
                      <tr key={item.id} className={`border-b border-slate-50 ${hasDiff ? "bg-amber-50" : ""}`}>
                        <td className="py-2 pr-4 font-mono text-xs text-slate-400">{item.sku ?? "—"}</td>
                        <td className="py-2 pr-4 font-medium text-slate-900">{item.name ?? "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-600">
                          {fmt(item.system_qty)} {item.unit}
                        </td>
                        <td className="py-2 pr-4">
                          {active.status === "OPEN" ? (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              defaultValue={item.counted_qty ?? ""}
                              onBlur={(e) => saveCounted(item, e.target.value)}
                              className="w-28 rounded-[10px] border border-slate-200 px-3 py-1.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/20"
                              placeholder="0"
                            />
                          ) : (
                            <span className="text-right block tabular-nums text-slate-600">
                              {item.counted_qty !== null ? fmt(item.counted_qty) : "—"}
                            </span>
                          )}
                        </td>
                        <td className={`py-2 text-right font-semibold tabular-nums ${hasDiff ? (diff! > 0 ? "text-emerald-600" : "text-red-600") : "text-slate-400"}`}>
                          {diff !== null ? (diff > 0 ? "+" : "") + fmt(diff) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
