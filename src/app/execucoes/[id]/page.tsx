"use client";

import { api } from "@/lib/api";
import type { ExecutionField, FieldOption, Instance } from "@/lib/types";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronUp, Clock, Paperclip, Play, Save } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";

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

function isStructuredListField(field: ExecutionField) {
  return field.type === 5 && field.options.some(option => option.key?.trim() && option.type !== undefined && option.type !== null);
}

function parseStructuredRows(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<Record<string, unknown>>;
  }

  return value
    .map(item => item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : null)
    .filter((item): item is Record<string, unknown> => !!item);
}

function rowHasContent(row: Record<string, unknown>, field: ExecutionField) {
  return field.options.some(option => {
    const key = option.key?.trim();
    return key ? toText(row[key]).trim() : false;
  });
}

function sanitizeStructuredListValue(field: ExecutionField, value: unknown) {
  const rows = parseStructuredRows(value);

  return rows
    .map(row => Object.fromEntries(
      field.options
        .map(option => option.key?.trim())
        .filter((key): key is string => !!key)
        .map(key => [key, toText(row[key]).trim()])
    ))
    .filter(row => rowHasContent(row, field));
}

function sanitizeStepPayload(currentStep: Instance["steps"][number] | undefined, formData: Record<string, unknown>) {
  if (!currentStep) {
    return formData;
  }

  return Object.fromEntries(currentStep.fields.map(field => [
    field.key,
    isStructuredListField(field)
      ? sanitizeStructuredListValue(field, formData[field.key])
      : formData[field.key]
  ]));
}

function buildReaderCode(currentStep: Instance["steps"][number] | undefined, formData: Record<string, unknown>) {
  if (!currentStep) {
    return "";
  }

  for (const key of ["chaveAcesso", "numeroNfe", "codigo", "code"]) {
    const value = toText(formData[key]).trim();
    if (value) {
      return value;
    }
  }

  return "";
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
    accumulator[field.key] = currentStep.data[field.key] ?? field.value ?? (isUploadField(field.type) ? [] : isStructuredListField(field) ? [] : "");
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
              <small>{asset.isPhoto ? "Foto" : "Anexo"} | {formatBytes(asset.size)}</small>
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

function renderStructuredCellInput(option: FieldOption, value: unknown, onChange: (next: unknown) => void) {
  const fieldType = option.type ?? 0;

  if (fieldType === 6) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label className="toggle-line compact">
          <input type="radio" name={option.key ?? option.label} checked={toText(value) === "true"} onChange={() => onChange("true")} />
          Sim
        </label>
        <label className="toggle-line compact">
          <input type="radio" name={option.key ?? option.label} checked={toText(value) === "false"} onChange={() => onChange("false")} />
          Nao
        </label>
      </div>
    );
  }

  const inputType = fieldType === 1 ? "number" : fieldType === 2 ? "date" : fieldType === 4 ? "email" : "text";
  return <input className="input" type={inputType} value={toText(value)} onChange={event => onChange(event.target.value)} />;
}

function renderStructuredListField(
  field: ExecutionField,
  value: unknown,
  onChange: (next: unknown) => void
) {
  const rows = parseStructuredRows(value);

  function addRow() {
    const nextRow = Object.fromEntries(
      field.options
        .map(option => option.key?.trim())
        .filter((key): key is string => !!key)
        .map(key => [key, ""])
    );

    onChange([...rows, nextRow]);
  }

  function updateRow(rowIndex: number, key: string, nextValue: unknown) {
    onChange(rows.map((row, currentIndex) => currentIndex === rowIndex ? { ...row, [key]: nextValue } : row));
  }

  function removeRow(rowIndex: number) {
    onChange(rows.filter((_, currentIndex) => currentIndex !== rowIndex));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.length === 0 && <div className="section-copy">Nenhum item adicionado.</div>}

      {rows.map((row, rowIndex) => (
        <div key={`${field.key}-row-${rowIndex}`} style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 14, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <strong>Item {rowIndex + 1}</strong>
            <button className="btn btn-ghost" type="button" onClick={() => removeRow(rowIndex)}>Remover</button>
          </div>

          <div className="formgrid">
            {field.options.map(option => {
              const key = option.key?.trim();
              if (!key || option.type === undefined || option.type === null) {
                return null;
              }

              return (
                <div className="field" key={`${field.key}-${key}-${rowIndex}`}>
                  <label>{option.label}{option.required ? " *" : ""}</label>
                  {renderStructuredCellInput(option, row[key] ?? "", next => updateRow(rowIndex, key, next))}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <button className="btn btn-secondary" type="button" onClick={addRow}>Adicionar item</button>
      </div>
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
  if (isStructuredListField(field)) {
    return renderStructuredListField(field, value, onChange);
  }

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
          Nao
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
  const [readerWarning, setReaderWarning] = useState("");
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

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
  const readerMode = currentStep?.type === 0;

  function applyReaderData(nextData: Record<string, unknown>) {
    setFormData(current => ({ ...current, ...nextData }));
  }

  async function readPdf(file?: File) {
    if (!file) {
      return;
    }

    setReaderWarning("");

    const body = new FormData();
    body.append("file", file);

    try {
      const result = await api<{ fields: Record<string, string>; warnings: string[] }>("/documents/nfe/extract", { method: "POST", body });
      applyReaderData(result.fields);
      setReaderWarning(result.warnings.join(" "));
    } catch (e) {
      setReaderWarning(e instanceof Error ? e.message : "Falha na leitura.");
    }
  }

  async function scanCode() {
    setReaderWarning("");
    if (!navigator.mediaDevices) {
      setReaderWarning("Camera indisponivel. Use o coletor como teclado nos campos da etapa.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      setScanning(true);

      setTimeout(() => {
        if (video.current) {
          video.current.srcObject = stream;
          void video.current.play();
        }
      }, 0);

      const Detector = (window as unknown as {
        BarcodeDetector?: new (args: { formats: string[] }) => { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
      }).BarcodeDetector;

      if (!Detector) {
        setReaderWarning("Este navegador nao oferece leitura nativa. Use o coletor fisico ou preencha manualmente.");
        return;
      }

      const detector = new Detector({ formats: ["qr_code", "code_128", "ean_13", "data_matrix"] });
      const loop = async () => {
        if (!video.current) {
          return;
        }

        const codes = await detector.detect(video.current);
        if (codes[0]) {
          applyReaderData({ chaveAcesso: codes[0].rawValue });
          stream.getTracks().forEach(track => track.stop());
          setScanning(false);
          return;
        }

        if (stream.active) {
          requestAnimationFrame(loop);
        }
      };

      setTimeout(() => void loop(), 700);
    } catch {
      setReaderWarning("Nao foi possivel abrir a camera. Verifique a permissao e use HTTPS ou localhost.");
    }
  }

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
      setError(e instanceof Error ? e.message : "Nao foi possivel enviar o arquivo.");
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
          data: sanitizeStepPayload(currentStep, formData)
        })
      });
      syncCurrentStepState(result, setItem, setFormData, setNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel salvar a etapa.");
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
          data: sanitizeStepPayload(currentStep, formData)
        })
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel concluir a etapa.");
    } finally {
      setAdvancing(false);
    }
  }

  if (error) {
    return <div className="error">{error}</div>;
  }

  if (!item) {
    return <div className="empty">Carregando execucao...</div>;
  }

  return (
    <>
      <Link href="/" className="btn btn-ghost"><ArrowLeft size={16} />Voltar</Link>

      <div className="pagehead">
        <div>
          <span className="eyebrow">{item.flowName}</span>
          <h1 className="title">{buildReaderCode(currentStep, formData) || item.code}</h1>
          <p className="subtitle">Criado em {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
        </div>
        <span className={`badge ${item.status === 0 ? "inprogress" : "completed"}`}>{item.status === 0 ? "Em andamento" : "Concluido"}</span>
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
                      {step.status === 2 ? `Concluida ${step.completedAt ? new Date(step.completedAt).toLocaleString("pt-BR") : ""}` : step.status === 1 ? "Etapa atual" : "Aguardando"}
                    </div>
                    <div className="section-copy" style={{ marginTop: 4 }}>
                      {step.isAutomatic ? "Execucao automatica/sistemica" : `Executado por ${step.completedByName || "usuario nao identificado"}`}
                    </div>
                  </div>
                  <small>Etapa {step.order}</small>
                  <button className="btn btn-ghost" type="button" onClick={() => setExpandedSteps(current => ({ ...current, [step.id]: !current[step.id] }))}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Mais informacoes
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
                            const structuredRows = isStructuredListField(field) ? parseStructuredRows(step.data[field.key]) : [];

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
                                ) : structuredRows.length > 0 ? (
                                  <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
                                    {structuredRows.map((row, rowIndex) => (
                                      <div key={`${field.key}-history-row-${rowIndex}`} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 10 }}>
                                        <small>Item {rowIndex + 1}</small>
                                        <div className="data-list" style={{ marginTop: 8 }}>
                                          {field.options.map(option => {
                                            const key = option.key?.trim();
                                            if (!key) {
                                              return null;
                                            }

                                            return (
                                              <div className="data-item" key={`${field.key}-${key}-${rowIndex}`}>
                                                <small>{option.label}</small>
                                                <strong>{toText(row[key]) || "-"}</strong>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <strong>{field.value || "-"}</strong>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {step.integrationAttempts.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <strong>Integracoes da etapa</strong>
                        <div className="data-list" style={{ marginTop: 10 }}>
                          {step.integrationAttempts.map(attempt => (
                            <div className="data-item" key={attempt.id}>
                              <small>{attempt.method} | {new Date(attempt.createdAt).toLocaleString("pt-BR")}</small>
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
            <h2 className="section-title">Execucao da etapa atual</h2>
            <p className="section-copy">
              {currentStep ? `Preencha os campos e conclua a etapa "${currentStep.name}".` : "Nenhuma etapa manual ativa no momento."}
            </p>
          </div>

          {currentStep && !currentStep.isAutomatic && (
            <div className="formgrid" style={{ padding: 24 }}>
              {readerMode && (
                <div className="field span2">
                  <div className="scanbox">
                    <strong>Entrada assistida</strong>
                    <p className="section-copy">Leia um DANFE digital ou capture o codigo pela camera para preencher a etapa atual.</p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <label className="btn btn-secondary">
                        <Paperclip size={16} />
                        Ler PDF
                        <input hidden type="file" accept="application/pdf" onChange={event => void readPdf(event.target.files?.[0])} />
                      </label>
                      <button className="btn btn-secondary" type="button" onClick={scanCode}>
                        <Camera size={16} />
                        Abrir camera
                      </button>
                    </div>
                    {scanning && <video ref={video} className="camera" muted playsInline />}
                    {readerWarning && <div className="notice" style={{ marginTop: 12 }}>{readerWarning}</div>}
                  </div>
                </div>
              )}

              {currentStep.fields.map(field => (
                <div className={`field ${isStructuredListField(field) ? "span2" : ""}`} key={`${currentStep.id}-${field.key}`}>
                  <label>{field.label}{field.required ? " *" : ""}</label>
                  {renderFieldInput(
                    field,
                    formData[field.key] ?? (isStructuredListField(field) ? [] : ""),
                    next => setFormData(current => ({ ...current, [field.key]: next })),
                    uploadFile,
                    uploadingFieldKey === field.key
                  )}
                </div>
              ))}

              <div className="field span2">
                <label>Observacoes da etapa</label>
                <textarea className="textarea" value={notes} onChange={event => setNotes(event.target.value)} />
              </div>
            </div>
          )}

          {currentStep?.isAutomatic && (
            <div className="notice" style={{ margin: 24 }}>
              Esta etapa e automatica. Use o historico ao lado para acompanhar a execucao sistemica ou consultar detalhes da integracao.
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
