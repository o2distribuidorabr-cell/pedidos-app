"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Store = {
  id: string;
  name: string;
};

type Entry = {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: string;
  stores: { name: string };
};

export default function FinanceiroPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  const [storeId, setStoreId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function loadData() {
    const { data: storesData } = await supabase.from("stores").select("id,name");
    setStores(storesData || []);

    const { data: entriesData } = await supabase
      .from("financial_entries")
      .select("*, stores(name)")
      .order("due_date", { ascending: false });

    setEntries(entriesData || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createEntry() {
    if (!storeId || !description || !amount || !dueDate) {
      alert("Preencha tudo");
      return;
    }

    await supabase.from("financial_entries").insert({
      store_id: storeId,
      description,
      amount: Number(amount),
      due_date: dueDate,
    });

    setDescription("");
    setAmount("");
    setDueDate("");

    loadData();
  }

  async function markPaid(id: string) {
    await supabase
      .from("financial_entries")
      .update({
        status: "paid",
        paid_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", id);

    loadData();
  }

  return (
    <div className="p-6 space-y-6">

      <h1 className="text-2xl font-bold">Financeiro</h1>

      {/* NOVO LANÇAMENTO */}
      <div className="border p-4 rounded space-y-3">
        <h2 className="font-semibold">Novo lançamento</h2>

        <select
          className="border p-2 w-full"
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">Selecione a loja</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <input
          className="border p-2 w-full"
          placeholder="Descrição (Royalties Jan/2026)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <input
          className="border p-2 w-full"
          type="number"
          placeholder="Valor"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <input
          className="border p-2 w-full"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        <button
          onClick={createEntry}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Criar cobrança
        </button>
      </div>

      {/* LISTA */}
      <div className="border p-4 rounded">
        <h2 className="font-semibold mb-3">Cobranças</h2>

        <table className="w-full border">
          <thead className="bg-gray-100">
            <tr>
              <th>Loja</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td>{e.stores?.name}</td>
                <td>{e.description}</td>
                <td>R$ {Number(e.amount).toFixed(2)}</td>
                <td>{e.due_date}</td>
                <td>{e.status}</td>
                <td>
                  {e.status !== "paid" && (
                    <button
                      onClick={() => markPaid(e.id)}
                      className="bg-green-600 text-white px-2 py-1 rounded"
                    >
                      Marcar pago
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}