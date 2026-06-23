"use client";

import { api } from "@/lib/api";
import type { ExecutionField, Instance } from "@/lib/types";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronUp, Clock, Paperclip, Play, Save } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

type UploadAsset = {
  id: string;
  fieldKey: string;
  fileName: string;
  contentType: string;
  size: number;
  url: string;
  isPhoto: boolean;
  uploadedAt: string;
};

function isUploadField(type: number) {
  return type === 3 || type === 7;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function parseUploadAssets(value: unknown): UploadAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : typeof row.Id === "string" ? String(row.Id) : "";
      const fieldKey = typeof row.fieldKey === "string" ? row.fieldKey : typeof row.FieldKey === "string" ? String(row.FieldKey) : "";
      const fileName = typeof row.fileName === "string" ? row.fileName : typeof row.FileName === "string" ? String(row.FileName) : "";
      const contentType = typeof row.contentType === "string" ? row.contentType : typeof row.ContentType === "string" ? String(row.ContentType) : "application/octet-stream";
      const size = typeof row.size === "number" ? row.size : typeof row.Size === "number" ? row.Size : 0;
      const url = typeof row.url === "string" ? row.url : typeof row.Url === "string" ? String(row.Url) : "";
      const isPhoto = typeof row.isPhoto === "boolean" ? row.isPhoto : typeof row.IsPhoto === "boolean" ? row.IsPhoto : false;
      const uploadedAt = typeof row.uploadedAt === "string" ? row.uploadedAt : typeof row.UploadedAt === "string" ? String(row.UploadedAt) : "";

      if (!id || !fileName || !url) {
        return null;
      }

      return { id, fieldKey, fileName, contentType, size, url, isPhoto, uploadedAt };
    })
    .filter((item): item is UploadAsset => !!item);
}

function buildAssetUrl(url: string) {
  if (!url) {
    return "#";
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
  const origin = apiBase.replace(/\/api\/?$/, "");
  return `${origin}${url}`;
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function syncCurrentStepState(result: Instance, setItem: (value: Instance) => void, setFormData: (value: Record<string, unknown>) => void, setNotes: (value: string) => void) {
  setItem(result);
  const currentStep = result.steps.find(step => step.id === result.currentStepExecutionId) ?? result.steps.find(step => step.status === 1);
  if (!currentStep) {
    setFormData({});
    setNotes("");
    return;
  }

  const nextFormData = currentStep.fields.reduce<Record<string, unknown>>((accumulator, field) => {
    accumulator[field.key] = currentStep.data[field.key] ?? field.value ?? (isUploadField(field.type) ? [] : "");
    return accumulator;
  }, {});

  setFormData(nextFormData);
  setNotes(currentStep.notes ?? "");
}

function renderUploadField(
  field: ExecutionField,
  value: unknown,
  onUpload: (fieldKey: string, file?: File | null) => Promise<void>,
  uploading: boolean
) {
  const assets = parseUploadAssets(value);
  const isPhoto = field.type === 7;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="btn btn-secondary">
          {isPhoto ? <Camera size={16} /> : <Paperclip size={16} />}
          {isPhoto ? "Enviar foto" : "Enviar anexo"}
          <input
            hidden
            type="file"
            accept={isPhoto ? "image/*" : undefined}
            capture={isPhoto ? "environment" : undefined}
            onChange={event => void onUpload(field.key, event.target.files?.[0])}
          />
        </label>

        {isPhoto && (
          <label className="btn btn-ghost">
            <Camera size={16} />
            Tirar foto agora
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={event => void onUpload(field.key, event.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {uploading && <div className="notice">Enviando arquivo...</div>}

      {assets.length > 0 ? (
        <div className="data-list">
          {assets.map(asset => (
            <div className="data-item" key={asset.id}>
              <small>{asset.isPhoto ? "Foto" : "Anexo"} • {formatBytes(asset.size)}</small>
              <strong>{asset.fileName}</strong>
              <div className="section-copy" style={{ marginTop: 4 }}>
                <a href={buildAssetUrl(asset.url)} target="_blank" rel="noreferrer">{asset.isPhoto ? "Abrir foto" : "Abrir anexo"}</a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="section-copy">Nenhum arquivo enviado ainda.</div>
      )}
    </div>
  );
}

function renderFieldInput(
  field: ExecutionField,
  value: unknown,
  onChange: (next: unknown) => void,
  onUpload: (fieldKey: string, file?: File | null) => Promise<void>,
  uploading: boolean
) {
  if (field.type === 5) {
    return (
      <select className="select" value={toText(value)} onChange={event => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {field.options.map(option => <option key={`${field.key}-${option.value}`} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (field.type === 6) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label className="toggle-line compact">
          <input type="radio" name={field.key} checked={toText(value) === "true"} onChange={() => onChange("true")} />
          Sim
        </label>
        <label className="toggle-line compact">
          <input type="radio" name={field.key} checked={toText(value) === "false"} onChange={() => onChange("false")} />
          Não
        </label>
      </div>
    );
  }

  if (field.type === 8) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {field.options.map(option => (
          <label key={`${field.key}-${option.value}`} className="toggle-line compact">
            <input type="radio" name={field.key} checked={toText(value) === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (isUploadField(field.type)) {
    return renderUploadField(field, value, onUpload, uploading);
  }

  const inputType = field.type === 1 ? "number" : field.type === 2 ? "date" : field.type === 4 ? "email" : "text";
  return <input className="input" type={inputType} value={toText(value)} onChange={event => onChange(event.target.value)} />;
}

export default function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<Instance | null>(null);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [uploadingFieldKey, setUploadingFieldKey] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const load = () => api<Instance>(`/instances/${id}`)
    .then(result => syncCurrentStepState(result, setItem, setFormData, setNotes))
    .catch(e => setError(e.message));

  useEffect(() => {
    void load();
  }, [id]);

  const currentStep = useMemo(
    () => item?.steps.find(step => step.id === item.currentStepExecutionId) ?? item?.steps.find(step => step.status === 1),
    [item]
  );

  async function uploadFile(fieldKey: string, file?: File | null) {
    if (!file) {
      return;
    }

    setUploadingFieldKey(fieldKey);
    setError("");

    try {
      const body = new FormData();
      body.append("fieldKey", fieldKey);
      body.append("file", file);
      const result = await api<Instance>(`/instances/${id}/upload`, { method: "POST", body });
      syncCurrentStepState(result, setItem, setFormData, setNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploadingFieldKey("");
    }
  }

  async function saveStep() {
    if (!currentStep) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const result = await api<Instance>(`/instances/${id}/save-step`, {
        method: "POST",
        body: JSON.stringify({
          notes,
          data: formData
        })
      });
      syncCurrentStepState(result, setItem, setFormData, setNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a etapa.");
    } finally {
      setSaving(false);
    }
  }

  async function advance() {
    if (!currentStep) {
      return;
    }

    setAdvancing(true);
    setError("");

    try {
      await api(`/instances/${id}/advance`, {
        method: "POST",
        body: JSON.stringify({
          notes,
          data: formData
        })
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a etapa.");
    } finally {
      setAdvancing(false);
    }
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!item) {
    return <div className="empty">Carregando execução...</div>;
  }

  return (
    <>
      <Link href="/" className="btn btn-ghost"><ArrowLeft size={16} />Voltar</Link>

      <div className="pagehead">
        <div>
          <span className="eyebrow">{item.flowName}</span>
          <h1 className="title">{item.code}</h1>
          <p className="subtitle">Criado em {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
        </div>
        <span className={`badge ${item.status === 0 ? "inprogress" : "completed"}`}>{item.status === 0 ? "Em andamento" : "Concluído"}</span>
      </div>

      <div className="detailgrid">
        <section className="card timeline">
          <h2 className="section-title">Jornada do registro</h2>
          <p className="section-copy">Acompanhe o status, executor e os detalhes de cada etapa.</p>

          {item.steps.map(step => {
            const expanded = !!expandedSteps[step.id];
            return (
              <div key={step.id} className={`timeline-row ${step.status === 2 ? "done" : step.status === 1 ? "current" : ""}`} style={{ display: "block" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="timeline-dot">{step.status === 2 ? <Check size={14} /> : step.status === 1 ? <Play size={13} /> : <Clock size={13} />}</span>
                  <div style={{ flex: 1 }}>
                    <strong>{step.name}</strong>
                    <div className="section-copy" style={{ marginTop: 4 }}>
                      {step.status === 2 ? `Concluída ${step.completedAt ? new Date(step.completedAt).toLocaleString("pt-BR") : ""}` : step.status === 1 ? "Etapa atual" : "Aguardando"}
                    </div>
                    <div className="section-copy" style={{ marginTop: 4 }}>
                      {step.isAutomatic ? "Execução automática/sistêmica" : `Executado por ${step.completedByName || "usuário não identificado"}`}
                    </div>
                  </div>
                  <small>Etapa {step.order}</small>
                  <button className="btn btn-ghost" type="button" onClick={() => setExpandedSteps(current => ({ ...current, [step.id]: !current[step.id] }))}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Mais informações
                  </button>
                </div>

                {expanded && (
                  <div style={{ marginTop: 14, paddingLeft: 38 }}>
                    {step.fields.length > 0 && (
                      <>
                        <strong>Dados da etapa</strong>
                        <div className="data-list" style={{ marginTop: 10 }}>
                          {step.fields.map(field => {
                            const uploadAssets = isUploadField(field.type) ? parseUploadAssets(step.data[field.key]) : [];

                            return (
                              <div className="data-item" key={`${step.id}-${field.key}`}>
                                <small>{field.label}</small>
                                {uploadAssets.length > 0 ? (
                                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                                    {uploadAssets.map(asset => (
                                      <a key={asset.id} href={buildAssetUrl(asset.url)} target="_blank" rel="noreferrer">
                                        {asset.fileName}
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <strong>{field.value || "—"}</strong>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {step.integrationAttempts.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <strong>Integrações da etapa</strong>
                        <div className="data-list" style={{ marginTop: 10 }}>
                          {step.integrationAttempts.map(attempt => (
                            <div className="data-item" key={attempt.id}>
                              <small>{attempt.method} • {new Date(attempt.createdAt).toLocaleString("pt-BR")}</small>
                              <strong>{attempt.success ? "Sucesso" : "Falha"} - {attempt.responseStatusCode ?? "sem status"}</strong>
                              <div className="section-copy" style={{ marginTop: 4, wordBreak: "break-word" }}>{attempt.url}</div>
                              {attempt.responsePreview && <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{attempt.responsePreview}</pre>}
                              {attempt.errorMessage && <div className="section-copy" style={{ marginTop: 8 }}>{attempt.errorMessage}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="card">
          <div style={{ padding: "24px 24px 0" }}>
            <h2 className="section-title">Execução da etapa atual</h2>
            <p className="section-copy">
              {currentStep ? `Preencha os campos e conclua a etapa "${currentStep.name}".` : "Nenhuma etapa manual ativa no momento."}
            </p>
          </div>

          {currentStep && !currentStep.isAutomatic && (
            <div className="formgrid" style={{ padding: 24 }}>
              {currentStep.fields.map(field => (
                <div className="field" key={`${currentStep.id}-${field.key}`}>
                  <label>{field.label}{field.required ? " *" : ""}</label>
                  {renderFieldInput(
                    field,
                    formData[field.key] ?? "",
                    next => setFormData(current => ({ ...current, [field.key]: next })),
                    uploadFile,
                    uploadingFieldKey === field.key
                  )}
                </div>
              ))}

              <div className="field span2">
                <label>Observações da etapa</label>
                <textarea className="textarea" value={notes} onChange={event => setNotes(event.target.value)} />
              </div>
            </div>
          )}

          {currentStep?.isAutomatic && (
            <div className="notice" style={{ margin: 24 }}>
              Esta etapa é automática. Use o histórico ao lado para acompanhar a execução sistêmica ou consultar detalhes da integração.
            </div>
          )}

          <div className="actions" style={{ padding: "0 24px 24px" }}>
            {currentStep && !currentStep.isAutomatic && (
              <>
                <button className="btn btn-secondary" type="button" onClick={saveStep} disabled={saving || !!uploadingFieldKey}>
                  <Save size={16} />
                  {saving ? "Salvando..." : "Salvar dados"}
                </button>
                <button className="btn btn-primary" type="button" onClick={advance} disabled={advancing || !!uploadingFieldKey}>
                  <Check size={16} />
                  {advancing ? "Concluindo..." : "Concluir etapa"}
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
