"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, Eye, EyeOff } from "lucide-react";

import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export default function Login() {
  const [email, setEmail] = useState("diogo@it4you.inf.br");
  const [password, setPassword] = useState("Diogo#2026");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      localStorage.setItem("flowtrack_token", data.token);
      localStorage.setItem("flowtrack_user", JSON.stringify(data.user));
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Credenciais inválidas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand">
          <span className="brandmark">
            <Activity />
          </span>
          It4you Track
        </div>

        <h1>Do portão à produção, tudo sob controle.</h1>
        <p>Acompanhe cada passagem do processo, encontre gargalos e saiba exatamente o próximo passo.</p>
      </section>

      <section className="login-form">
        <form className="login-box" onSubmit={submit}>
          <span className="eyebrow">Bem-vindo</span>
          <h2>Acesse sua conta</h2>
          <p>Use suas credenciais para entrar na operação.</p>

          {error && <div className="error">{error}</div>}

          <div className="field">
            <label>E-mail</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label>Senha</label>
            <div className="password-wrap">
              <input className="input" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required />
              <button
                className="icon-btn"
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(current => !current)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: "100%", marginTop: 22 }} disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}
