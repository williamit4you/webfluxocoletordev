"use client";

import { api } from "@/lib/api";
import type { ExecutionField, Instance } from "@/lib/types";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Clock, Play, Save } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

function renderFieldInput(field: ExecutionField, value: string, onChange: (next: string) => void) {
  if (field.type === 5) {
    return (
      <select className="select" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {field.options.map(option => <option key={`${field.key}-${option.value}`} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (field.type === 6) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label className="toggle-line compact">
          <input type="radio" name={field.key} checked={value === "true"} onChange={() => onChange("true")} />
          Sim
        </label>
        <label className="toggle-line compact">
          <input type="radio" name={field.key} checked={value === "false"} onChange={() => onChange("false")} />
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
            <input type="radio" name={field.key} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 3 || field.type === 7) {
    return <div className="notice">Campo de {field.type === 7 ? "foto" : "anexo"} será habilitado na próxima entrega desta etapa.</div>;
  }

  const inputType = field.type === 1 ? "number" : field.type === 2 ? "date" : field.type === 4 ? "email" : "text";
  return <input className="input" type={inputType} value={value} onChange={event => onChange(event.target.value)} />;
}

export default function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [item, setItem] = useState<Instance | null>(null);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const load = () => api<Instance>(`/instances/${id}`)
    .then(result => {
      setItem(result);
      const currentStep = result.steps.find(step => step.id === result.currentStepExecutionId) ?? result.steps.find(step => step.status === 1);
      if (currentStep) {
        const nextFormData = currentStep.fields.reduce<Record<string, string>>((accumulator, field) => {
          accumulator[field.key] = field.value ? String(field.value) : "";
          return accumulator;
        }, {});
        setFormData(nextFormData);
        setNotes(currentStep.notes ?? "");
      }
    })
    .catch(e => setError(e.message));

  useEffect(() => {
    void load();
  }, [id]);

  const currentStep = useMemo(
    () => item?.steps.find(step => step.id === item.currentStepExecutionId) ?? item?.steps.find(step => step.status === 1),
    [item]
  );

  async function saveStep() {
    if (!currentStep) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        notes,
        data: formData
      };
      const result = await api<Instance>(`/instances/${id}/save-step`, { method: "POST", body: JSON.stringify(payload) });
      setItem(result);
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
          data: formData
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
                          {step.fields.map(field => (
                            <div className="data-item" key={`${step.id}-${field.key}`}>
                              <small>{field.label}</small>
                              <strong>{field.value || "—"}</strong>
                            </div>
                          ))}
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
                  {renderFieldInput(field, formData[field.key] ?? "", next => setFormData(current => ({ ...current, [field.key]: next })))}
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
                <button className="btn btn-secondary" type="button" onClick={saveStep} disabled={saving}>
                  <Save size={16} />
                  {saving ? "Salvando..." : "Salvar dados"}
                </button>
                <button className="btn btn-primary" type="button" onClick={advance} disabled={advancing}>
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
