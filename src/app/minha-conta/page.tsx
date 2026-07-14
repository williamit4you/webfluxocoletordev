"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, UserCircle2 } from "lucide-react";

import { useAuth } from "@/components/Auth";
import { api } from "@/lib/api";

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const initialForm: PasswordFormState = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

export default function MyAccountPage() {
  const { user } = useAuth();
  const [form, setForm] = useState<PasswordFormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(form)
      });

      setForm(initialForm);
      setSuccess("Senha alterada com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Minha conta</span>
        <h1 className="title">Perfil e acesso</h1>
        <p className="subtitle">Consulte seus dados e altere sua senha com confirmação, sem exibir a senha atual cadastrada.</p>
      </div>
    </div>

    <div className="detailgrid account-layout">
      <section className="card formcard">
        <div className="section-icon"><UserCircle2 size={18} /></div>
        <h2 className="section-title">Usuário logado</h2>
        <p className="section-copy">Essas informações identificam a sua conta dentro do sistema.</p>

        <div className="account-summary">
          <div className="account-summary-item">
            <small>Nome</small>
            <strong>{user?.name || "-"}</strong>
          </div>
          <div className="account-summary-item">
            <small>E-mail</small>
            <strong>{user?.email || "-"}</strong>
          </div>
          <div className="account-summary-item">
            <small>Perfil</small>
            <strong>{user?.role === "SuperAdmin" ? "Super admin" : user?.role === "Admin" ? "Admin" : "Usuário"}</strong>
          </div>
        </div>
      </section>

      <section className="card formcard">
        <div className="section-icon"><KeyRound size={18} /></div>
        <h2 className="section-title">Alterar senha</h2>
        <p className="section-copy">Informe sua senha atual e defina uma nova senha com confirmação.</p>

        {error && <div className="error">{error}</div>}
        {success && <div className="notice">{success}</div>}

        <form onSubmit={submit}>
          <div className="formgrid">
            <div className="field span2">
              <label>Senha atual *</label>
              <div className="password-wrap">
                <input
                  className="input"
                  type={showCurrentPassword ? "text" : "password"}
                  value={form.currentPassword}
                  onChange={e => setForm(current => ({ ...current, currentPassword: e.target.value }))}
                  autoComplete="current-password"
                  minLength={8}
                  required
                />
                <button
                  className="icon-btn"
                  type="button"
                  aria-label={showCurrentPassword ? "Ocultar senha atual" : "Mostrar senha atual"}
                  aria-pressed={showCurrentPassword}
                  onClick={() => setShowCurrentPassword(current => !current)}
                >
                  {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label>Nova senha *</label>
              <div className="password-wrap">
                <input
                  className="input"
                  type={showNewPassword ? "text" : "password"}
                  value={form.newPassword}
                  onChange={e => setForm(current => ({ ...current, newPassword: e.target.value }))}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  className="icon-btn"
                  type="button"
                  aria-label={showNewPassword ? "Ocultar nova senha" : "Mostrar nova senha"}
                  aria-pressed={showNewPassword}
                  onClick={() => setShowNewPassword(current => !current)}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label>Confirmar nova senha *</label>
              <div className="password-wrap">
                <input
                  className="input"
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={e => setForm(current => ({ ...current, confirmPassword: e.target.value }))}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  className="icon-btn"
                  type="button"
                  aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                  aria-pressed={showConfirmPassword}
                  onClick={() => setShowConfirmPassword(current => !current)}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setForm(initialForm);
                setError("");
                setSuccess("");
              }}
              disabled={saving}
            >
              Limpar
            </button>
            <button className="btn btn-primary" disabled={saving}>
              <KeyRound size={16} />
              {saving ? "Salvando..." : "Alterar senha"}
            </button>
          </div>
        </form>
      </section>
    </div>
  </>;
}
