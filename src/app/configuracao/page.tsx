"use client";

import { useAuth } from "@/components/Auth";
import { api } from "@/lib/api";
import type { MinioBucket, MinioConfiguration } from "@/lib/types";
import { Database, Eye, EyeOff, HardDriveUpload, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

function createBucket(): MinioBucket {
  return { name: "", bucketName: "", description: "", active: true, isDefault: false };
}

export default function Configuration() {
  const { user } = useAuth();
  const [form, setForm] = useState<MinioConfiguration>({ endpoint: "", accessKey: "", secretKey: "", publicUrl: "", active: true, buckets: [createBucket()] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await api<MinioConfiguration>("/configuration/minio");
      setForm(result.buckets.length > 0 ? result : { ...result, buckets: [createBucket()] });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role === "SuperAdmin") {
      void load();
    } else {
      setLoading(false);
    }
  }, [user?.role]);

  function updateBucket(index: number, patch: Partial<MinioBucket>) {
    setForm(current => ({
      ...current,
      buckets: current.buckets.map((bucket, bucketIndex) => bucketIndex === index ? { ...bucket, ...patch } : patch.isDefault ? { ...bucket, isDefault: false } : bucket)
    }));
  }

  function addBucket() {
    setForm(current => ({ ...current, buckets: [...current.buckets, createBucket()] }));
  }

  function removeBucket(index: number) {
    setForm(current => {
      const buckets = current.buckets.filter((_, bucketIndex) => bucketIndex !== index);
      if (buckets.length > 0 && !buckets.some(bucket => bucket.isDefault)) {
        buckets[0] = { ...buckets[0], isDefault: true };
      }

      return { ...current, buckets: buckets.length > 0 ? buckets : [createBucket()] };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        ...form,
        buckets: form.buckets.map((bucket, index) => ({
          ...bucket,
          name: bucket.name.trim(),
          bucketName: bucket.bucketName.trim().toLowerCase(),
          description: bucket.description?.trim() || null,
          isDefault: bucket.isDefault || index === 0 && !form.buckets.some(item => item.isDefault)
        }))
      };

      const result = await api<MinioConfiguration>("/configuration/minio", { method: "PUT", body: JSON.stringify(payload) });
      setForm(result);
      setSuccess("Configuração do MinIO salva com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "SuperAdmin") {
    return <div className="notice">Esta área está disponível apenas para super admin.</div>;
  }

  if (loading) {
    return <div className="empty">Carregando configuração...</div>;
  }

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Administração</span>
        <h1 className="title">Configuração</h1>
        <p className="subtitle">Centralize o storage de anexos e fotos via MinIO sem depender de variáveis de ambiente por ambiente.</p>
      </div>
    </div>

    <div className="detailgrid users-layout">
      <section className="card formcard">
        <div className="section-icon"><HardDriveUpload size={18} /></div>
        <h2 className="section-title">Configuração MinIO</h2>
        <p className="section-copy">Use um bucket compartilhado para todos os fluxos ou mantenha vários buckets lógicos com um padrão ativo.</p>
        {error && <div className="error">{error}</div>}
        {success && <div className="notice">{success}</div>}

        <form onSubmit={save}>
          <div className="formgrid">
            <div className="field">
              <label>Servidor MinIO *</label>
              <input className="input" value={form.endpoint} onChange={e => setForm(current => ({ ...current, endpoint: e.target.value }))} placeholder="https://minio.seudominio.com" required />
            </div>
            <div className="field">
              <label>Public URL</label>
              <input className="input" value={form.publicUrl} onChange={e => setForm(current => ({ ...current, publicUrl: e.target.value }))} placeholder="https://minio.seudominio.com" />
            </div>
            <div className="field">
              <label>Access Key *</label>
              <input className="input" value={form.accessKey} onChange={e => setForm(current => ({ ...current, accessKey: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Secret Key *</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" style={{ flex: 1 }} type={showSecret ? "text" : "password"} value={form.secretKey} onChange={e => setForm(current => ({ ...current, secretKey: e.target.value }))} required />
                <button className="btn btn-ghost" type="button" onClick={() => setShowSecret(current => !current)}>
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="field span2">
              <label className="toggle-line">
                <input type="checkbox" checked={form.active} onChange={e => setForm(current => ({ ...current, active: e.target.checked }))} />
                Configuração ativa
              </label>
            </div>
          </div>

          <div className="editor-block">
            <div className="section-header">
              <div>
                <h4>Buckets</h4>
                <p className="section-copy">Para o FlowTrack, um bucket único já resolve bem. Ainda assim, deixei a estrutura pronta para mais de um bucket lógico.</p>
              </div>
              <button className="btn btn-secondary" type="button" onClick={addBucket}>
                <Plus size={15} />
                Adicionar bucket
              </button>
            </div>

            <div className="builder">
              {form.buckets.map((bucket, index) => (
                <div className="field-block" key={bucket.id ?? `bucket-${index}`}>
                  <div className="bucket-row">
                    <div className="bucket-fields">
                    <input className="input" style={{ minWidth: 180 }} placeholder="Nome lógico" value={bucket.name} onChange={e => updateBucket(index, { name: e.target.value })} />
                    <div className="bucket-fields">
                      <input className="input" style={{ minWidth: 180 }} placeholder="Nome lÃ³gico" value={bucket.name} onChange={e => updateBucket(index, { name: e.target.value })} />
                      <input className="input" placeholder="bucket-name" value={bucket.bucketName} onChange={e => updateBucket(index, { bucketName: e.target.value.toLowerCase() })} />
                    <input className="input" style={{ minWidth: 220 }} placeholder="Descrição" value={bucket.description ?? ""} onChange={e => updateBucket(index, { description: e.target.value })} />
                    <label className="toggle-line compact">
                      <input type="checkbox" checked={bucket.active} onChange={e => updateBucket(index, { active: e.target.checked })} />
                      Ativo
                    </label>
                    <label className="toggle-line compact">
                      <input type="radio" name="default-bucket" checked={bucket.isDefault} onChange={() => updateBucket(index, { isDefault: true })} />
                      Bucket padrão
                    </label>
                    <button className="btn btn-ghost" type="button" onClick={() => removeBucket(index)}>
                      <Trash2 size={15} />
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="actions">
            <button className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              {saving ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </form>
      </section>

      <section className="card formcard">
        <Database color="#176b51" />
        <h2 className="section-title" style={{ marginTop: 14 }}>Banco de dados</h2>
        <p className="section-copy">A configuração do MinIO agora fica persistida no banco e criptografada no backend.</p>
        <span className="badge completed">Centralizado</span>

        <div className="editor-block">
          <ShieldCheck color="#176b51" />
          <h3 style={{ marginTop: 10 }}>Boas práticas adotadas</h3>
          <ul style={{ marginTop: 12, paddingLeft: 18, color: "#4f6b60" }}>
            <li>credenciais armazenadas protegidas no banco;</li>
            <li>bucket padrão único para anexos e fotos;</li>
            <li>estrutura preparada para múltiplos buckets no futuro;</li>
            <li>links assinados para leitura dos arquivos.</li>
          </ul>
        </div>
      </section>
    </div>
  </>;
}
