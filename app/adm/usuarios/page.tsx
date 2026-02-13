"use client";

import { useState } from "react";

export default function CriarUsuario() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function criarUsuario() {
    setMensagem("Criando usuário...");

    try {
      const res = await fetch("/.netlify/functions/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password: senha,
          name: nome,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensagem("Erro: " + (data.error || "falha desconhecida"));
        return;
      }

      setMensagem("Usuário criado com sucesso!");
      setEmail("");
      setSenha("");
      setNome("");
    } catch (err) {
      setMensagem("Erro ao conectar com servidor");
    }
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Criar novo administrador</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
        <input
          placeholder="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          placeholder="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        <button onClick={criarUsuario}>Criar administrador</button>

        <p>{mensagem}</p>
      </div>
    </div>
  );
}