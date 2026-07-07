"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import type { User } from "@/lib/types";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    localStorage.removeItem("flowtrack_token");
    localStorage.removeItem("flowtrack_user");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        suppressUnauthorizedRedirect: true
      });

      localStorage.setItem("flowtrack_token", data.token);
      localStorage.setItem("flowtrack_user", JSON.stringify(data.user));
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Nao foi possivel entrar. Revise seu e-mail e senha e tente novamente."
      );
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

        <h1>Do portao a producao, tudo sob controle.</h1>
        <p>Acompanhe cada passagem do processo, encontre gargalos e saiba exatamente qual e o proximo passo.</p>
      </section>

      <section className="login-form">
        <form className="login-box" onSubmit={submit}>
          <span className="eyebrow">Bem-vindo</span>
          <h2>Acesse sua conta</h2>
          <p>Entre com suas credenciais para continuar na operacao com seguranca.</p>

          <div className="notice" style={{ marginBottom: 18 }}>
            <ShieldCheck size={16} style={{ verticalAlign: "text-bottom", marginRight: 8 }} />
            Seus dados de acesso sao usados apenas para autenticar sua sessao atual.
          </div>

          {error && (
            <div className="error" role="alert" aria-live="polite">
              <AlertCircle size={16} style={{ flex: "0 0 auto", marginTop: 1 }} />
              <div>
                <strong>Falha ao entrar</strong>
                <div>{error}</div>
              </div>
            </div>
          )}

          <div className="field">
            <label>E-mail</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="voce@empresa.com"
              required
            />
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label>Senha</label>
            <div className="password-wrap">
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                required
              />
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
            {loading ? "Entrando..." : "Entrar"}
            <ArrowRight size={17} />
          </button>
        </form>
      </section>
    </div>
  );
}
