"use client";

import { useAuth } from "@/components/Auth";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";
import { PencilLine, Shield, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";

type CreateFormState = { name: string; email: string; password: string; role: string };
type EditFormState = { id: string; name: string; role: string; active: boolean; password: string };

const initialCreateForm: CreateFormState = { name: "", email: "", password: "", role: "User" };

function roleLabel(role: string) {
  if (role === "SuperAdmin") return "Super admin";
  if (role === "Admin") return "Admin";
  return "Usuário";
}

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<CreateFormState>(initialCreateForm);
  const [editing, setEditing] = useState<EditFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const visibleUsers = user?.role === "Admin" ? users.filter(item => item.role !== "SuperAdmin") : users;

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

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const created = await api<User>("/users", { method: "POST", body: JSON.stringify(form) });
      setUsers(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(initialCreateForm);
      setSuccess("Usuário cadastrado com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cadastrar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await api<User>(`/users/${editing.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editing.name,
          role: editing.role,
          active: editing.active,
          password: editing.password || null
        })
      });

      setUsers(current => current.map(item => item.id === updated.id ? updated : item).sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
      setSuccess("Usuário atualizado com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "SuperAdmin" && user?.role !== "Admin") {
    return <div className="notice">Esta área está disponível apenas para super admins e admins.</div>;
  }

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Administração</span>
        <h1 className="title">Usuários</h1>
        <p className="subtitle">Cadastre acessos, ajuste perfil e controle quem pode operar o sistema.</p>
      </div>
    </div>

    <div className="detailgrid users-layout">
      <section className="card formcard">
        <div className="section-icon"><UserPlus size={18} /></div>
        <h2 className="section-title">Criar usuário</h2>
        <p className="section-copy">Crie o acesso inicial e defina o perfil correto para a pessoa entrar no fluxo.</p>
        {error && <div className="error">{error}</div>}
        {success && <div className="notice">{success}</div>}
        <form onSubmit={submitCreate}>
          <div className="formgrid">
            <div className="field">
              <label>Nome *</label>
              <input className="input" value={form.name} onChange={e => setForm(current => ({ ...current, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label>E-mail *</label>
              <input className="input" type="email" value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Senha inicial *</label>
              <input className="input" type="password" value={form.password} onChange={e => setForm(current => ({ ...current, password: e.target.value }))} required minLength={8} />
            </div>
            <div className="field">
              <label>Perfil *</label>
              <select className="select" value={form.role} onChange={e => setForm(current => ({ ...current, role: e.target.value }))}>
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
        <p className="section-copy">A edição permite alterar nome, perfil, status e redefinir senha, sem mexer no e-mail.</p>

        {editing && <form className="edit-panel" onSubmit={submitEdit}>
          <div className="section-header">
            <div>
              <h3>Editar usuário</h3>
              <p className="section-copy">O e-mail permanece fixo e serve apenas como identificador de acesso.</p>
            </div>
          </div>
          <div className="formgrid">
            <div className="field">
              <label>Nome</label>
              <input className="input" value={editing.name} onChange={e => setEditing(current => current ? { ...current, name: e.target.value } : current)} />
            </div>
            <div className="field">
              <label>Perfil</label>
              <select className="select" value={editing.role} onChange={e => setEditing(current => current ? { ...current, role: e.target.value } : current)}>
                {user?.role === "SuperAdmin" && <option value="SuperAdmin">Super admin</option>}
                <option value="Admin">Admin</option>
                <option value="User">Usuário</option>
              </select>
            </div>
            <div className="field">
              <label>Nova senha</label>
              <input className="input" type="password" minLength={8} value={editing.password} onChange={e => setEditing(current => current ? { ...current, password: e.target.value } : current)} placeholder="Opcional" />
            </div>
            <div className="field">
              <label>Status</label>
              <label className="toggle-line">
                <input type="checkbox" checked={editing.active} onChange={e => setEditing(current => current ? { ...current, active: e.target.checked } : current)} />
                Usuário ativo
              </label>
            </div>
          </div>
          <div className="actions">
            <button className="btn btn-secondary" type="button" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving}>
              <Shield size={16} />
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>}

        {loading ? <div className="empty">Carregando usuários...</div> :
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map(item =>
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.email}</td>
                    <td>{roleLabel(item.role)}</td>
                    <td><span className={`badge ${item.active === false ? "cancelled" : "completed"}`}>{item.active === false ? "Inativo" : "Ativo"}</span></td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setEditing({ id: item.id, name: item.name, role: item.role, active: item.active !== false, password: "" })}
                      >
                        <PencilLine size={15} />
                        Editar
                      </button>
                    </td>
                  </tr>)}
              </tbody>
            </table>
          </div>}
      </section>
    </div>
  </>;
}
