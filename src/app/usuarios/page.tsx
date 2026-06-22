"use client";

import { useAuth } from "@/components/Auth";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { Shield, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";

type FormState = { name: string; email: string; password: string; role: string };

const initialForm: FormState = { name: "", email: "", password: "", role: "User" };

function roleLabel(role: string) {
  if (role === "SuperAdmin") return "Super admin";
  if (role === "Admin") return "Admin";
  return "Usuário";
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadUsers() {
    setLoading(true);
    try {
      const result = await api<User[]>("/users");
      setUsers(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await api<User>("/users", { method: "POST", body: JSON.stringify(form) });
      setUsers(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(initialForm);
      setSuccess("Usuário cadastrado com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "SuperAdmin" && user?.role !== "Admin") return <div className="notice">Esta área está disponível apenas para super admins e admins.</div>;

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Administração</span>
        <h1 className="title">Usuários</h1>
        <p className="subtitle">Cadastre acessos e acompanhe os perfis ativos da operação.</p>
      </div>
    </div>
    <div className="detailgrid users-layout">
      <section className="card formcard">
        <div className="section-icon"><UserPlus size={18} /></div>
        <h2 className="section-title">Criar usuário</h2>
        <p className="section-copy">Defina o perfil de acesso e gere a credencial inicial para a equipe.</p>
        {error && <div className="error">{error}</div>}
        {success && <div className="notice">{success}</div>}
        <form onSubmit={submit}>
          <div className="formgrid">
            <div className="field">
              <label>Nome *</label>
              <input className="input" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label>E-mail *</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(v => ({ ...v, email: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Senha inicial *</label>
              <input className="input" type="password" value={form.password} onChange={e => setForm(v => ({ ...v, password: e.target.value }))} required minLength={8} />
            </div>
            <div className="field">
              <label>Perfil *</label>
              <select className="select" value={form.role} onChange={e => setForm(v => ({ ...v, role: e.target.value }))}>
                {user?.role === "SuperAdmin" && <option value="SuperAdmin">Super admin</option>}
                <option value="Admin">Admin</option>
                <option value="User">Usuário</option>
              </select>
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-primary" disabled={saving}>
              <Shield size={16} />
              {saving ? "Salvando..." : "Cadastrar usuário"}
            </button>
          </div>
        </form>
      </section>
      <section className="card formcard">
        <div className="section-icon"><Users size={18} /></div>
        <h2 className="section-title">Usuários cadastrados</h2>
        <p className="section-copy">Perfis liberados para consultar, operar ou administrar a plataforma.</p>
        {loading ? <div className="empty">Carregando usuários...</div> :
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(item =>
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.email}</td>
                  <td>{roleLabel(item.role)}</td>
                  <td><span className={`badge ${item.active === false ? "cancelled" : "completed"}`}>{item.active === false ? "Inativo" : "Ativo"}</span></td>
                </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </div>
  </>;
}
