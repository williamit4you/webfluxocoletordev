"use client";

import { api } from "@/lib/api";
import type { Field, FieldOption, Flow, FlowToken, Step, StepApiConfig } from "@/lib/types";
import { Eye, EyeOff, PencilLine, Plus, Save, Shield, Trash2, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const stepTypeOptions = [
  { value: 0, label: "Leitor / câmera" },
  { value: 1, label: "Direcionamento para usuário" },
  { value: 2, label: "Acompanhamento externo" },
  { value: 3, label: "Automática (start)" },
  { value: 4, label: "API envio" },
  { value: 5, label: "API consulta" }
];

const fieldTypeOptions = [
  { value: 0, label: "Texto" },
  { value: 1, label: "Número" },
  { value: 2, label: "Data" },
  { value: 3, label: "Documento" },
  { value: 4, label: "E-mail" },
  { value: 5, label: "Lista" }
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function createOption(): FieldOption {
  return { label: "", value: "", order: 1 };
}

function createField(): Field {
  return { label: "", key: "", type: 0, required: false, order: 1, options: [] };
}

function createApiConfig(): StepApiConfig {
  return { validateTls: true, method: "GET", scheduleMode: "manual" };
}

function createStep(name = ""): Step {
  return {
    name,
    description: "",
    type: 1,
    order: 1,
    fields: [],
    apiConfig: createApiConfig()
  };
}

function createToken(): FlowToken {
  return { name: "", value: "", type: 0, headerName: "", active: true };
}

function typeNeedsApi(stepType: number) {
  return stepType === 2 || stepType === 4 || stepType === 5;
}

function firstEditableIndex(steps: Step[]) {
  return steps.length === 0 ? -1 : 0;
}

export function FlowBuilder({ flowId }: { flowId?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [tokens, setTokens] = useState<FlowToken[]>([]);
  const [steps, setSteps] = useState<Step[]>([
    { ...createStep("Entrada do caminhão"), type: 0 },
    { ...createStep("Saída para Sandra"), type: 1 }
  ]);
  const [editingStep, setEditingStep] = useState(0);
  const [loading, setLoading] = useState(!!flowId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [visibleTokens, setVisibleTokens] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!flowId) {
      return;
    }

    let activeRequest = true;
    setLoading(true);
    api<Flow>(`/flows/${flowId}`)
      .then(flow => {
        if (!activeRequest) {
          return;
        }

        setName(flow.name);
        setDescription(flow.description);
        setActive(flow.active);
        setTokens(flow.tokens.map(token => ({ ...token, value: "" })));
        setSteps(flow.steps.length > 0 ? flow.steps : [createStep()]);
        setEditingStep(firstEditableIndex(flow.steps));
      })
      .catch(e => {
        if (activeRequest) {
          setError(e instanceof Error ? e.message : "Não foi possível carregar o fluxo.");
        }
      })
      .finally(() => {
        if (activeRequest) {
          setLoading(false);
        }
      });

    return () => {
      activeRequest = false;
    };
  }, [flowId]);

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps(current => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  }

  function updateField(stepIndex: number, fieldIndex: number, patch: Partial<Field>) {
    setSteps(current => current.map((step, currentStepIndex) => {
      if (currentStepIndex !== stepIndex) {
        return step;
      }

      return {
        ...step,
        fields: step.fields.map((field, currentFieldIndex) => currentFieldIndex === fieldIndex ? { ...field, ...patch } : field)
      };
    }));
  }

  function updateOption(stepIndex: number, fieldIndex: number, optionIndex: number, patch: Partial<FieldOption>) {
    setSteps(current => current.map((step, currentStepIndex) => {
      if (currentStepIndex !== stepIndex) {
        return step;
      }

      return {
        ...step,
        fields: step.fields.map((field, currentFieldIndex) => {
          if (currentFieldIndex !== fieldIndex) {
            return field;
          }

          return {
            ...field,
            options: field.options.map((option, currentOptionIndex) => currentOptionIndex === optionIndex ? { ...option, ...patch } : option)
          };
        })
      };
    }));
  }

  function updateToken(index: number, patch: Partial<FlowToken>) {
    setTokens(current => current.map((token, tokenIndex) => tokenIndex === index ? { ...token, ...patch } : token));
  }

  function updateApiConfig(stepIndex: number, patch: Partial<StepApiConfig>) {
    setSteps(current => current.map((step, currentStepIndex) => currentStepIndex === stepIndex
      ? { ...step, apiConfig: { ...createApiConfig(), ...step.apiConfig, ...patch } }
      : step));
  }

  function addStep() {
    setSteps(current => [...current, createStep()]);
    setEditingStep(steps.length);
  }

  function removeStep(index: number) {
    const next = steps.filter((_, stepIndex) => stepIndex !== index);
    setSteps(next.length > 0 ? next : [createStep()]);
    setEditingStep(next.length === 0 ? 0 : Math.max(0, index - 1));
  }

  async function saveFlow() {
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      name,
      description,
      active,
      tokens: tokens.map((token, tokenIndex) => ({ ...token, name: token.name.trim(), headerName: token.headerName?.trim(), value: token.value ?? "", active: token.active, type: token.type, id: token.id })),
      steps: steps.map((step, stepIndex) => ({
        ...step,
        order: stepIndex + 1,
        fields: step.fields.map((field, fieldIndex) => ({
          ...field,
          order: fieldIndex + 1,
          key: field.key.trim(),
          label: field.label.trim(),
          options: field.options.map((option, optionIndex) => ({
            ...option,
            order: optionIndex + 1,
            label: option.label.trim(),
            value: option.value.trim()
          }))
        }))
      }))
    };

    try {
      if (flowId) {
        await api(`/flows/${flowId}`, { method: "PUT", body: JSON.stringify(payload) });
        setSuccess("Fluxo atualizado com sucesso.");
      } else {
        await api(`/flows`, { method: "POST", body: JSON.stringify(payload) });
        router.push("/fluxos");
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o fluxo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="empty">Carregando estrutura do fluxo...</div>;
  }

  const currentStep = steps[editingStep];

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Construtor</span>
        <h1 className="title">{flowId ? "Editar fluxo" : "Criar novo fluxo"}</h1>
        <p className="subtitle">Cada etapa pode ter seus próprios campos, gatilhos e integrações.</p>
      </div>
    </div>

    {error && <div className="error">{error}</div>}
    {success && <div className="notice">{success}</div>}

    <section className="card formcard">
      <h2 className="section-title">Informações básicas</h2>
      <p className="section-copy">Defina a identidade do fluxo e mantenha o cadastro ativo para a operação.</p>
      <div className="formgrid">
        <div className="field">
          <label>Nome do fluxo *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <label className="toggle-line">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            Fluxo ativo para novas entradas
          </label>
        </div>
        <div className="field span2">
          <label>Descrição</label>
          <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
      </div>

      <hr className="divider" />

      <div className="section-header">
        <div>
          <h2 className="section-title">Tokens do fluxo</h2>
          <p className="section-copy">Cadastre credenciais reutilizáveis para as integrações das etapas.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => setTokens(current => [...current, createToken()])}>
          <Shield size={16} />
          Adicionar token
        </button>
      </div>

      <div className="token-list">
        {tokens.length === 0 && <div className="empty compact">Nenhum token cadastrado neste fluxo.</div>}
        {tokens.map((token, index) =>
          <div className="token-card" key={`${token.id ?? "new"}-${index}`}>
            <div className="token-grid">
              <div className="field">
                <label>Nome</label>
                <input className="input" value={token.name} onChange={e => updateToken(index, { name: e.target.value })} />
              </div>
              <div className="field">
                <label>Tipo</label>
                <select className="select" value={token.type} onChange={e => updateToken(index, { type: Number(e.target.value) })}>
                  <option value={0}>Bearer</option>
                  <option value={1}>API key</option>
                </select>
              </div>
              <div className="field">
                <label>Header</label>
                <input className="input" placeholder="Authorization ou X-API-Key" value={token.headerName ?? ""} onChange={e => updateToken(index, { headerName: e.target.value })} />
              </div>
              <div className="field">
                <label>Valor</label>
                <div className="password-wrap">
                  <input
                    className="input"
                    type={visibleTokens[index] ? "text" : "password"}
                    placeholder={flowId ? "Preencha apenas se quiser atualizar" : "Token"}
                    value={token.value ?? ""}
                    onChange={e => updateToken(index, { value: e.target.value })}
                  />
                  <button className="icon-btn" type="button" onClick={() => setVisibleTokens(current => ({ ...current, [index]: !current[index] }))}>
                    {visibleTokens[index] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="row-actions">
              <label className="toggle-line">
                <input type="checkbox" checked={token.active} onChange={e => updateToken(index, { active: e.target.checked })} />
                Token ativo
              </label>
              <button className="btn btn-ghost" type="button" onClick={() => setTokens(current => current.filter((_, tokenIndex) => tokenIndex !== index))}>
                <Trash2 size={16} />
                Remover
              </button>
            </div>
          </div>)}
      </div>

      <hr className="divider" />

      <div className="section-header">
        <div>
          <h2 className="section-title">Etapas sequenciais</h2>
          <p className="section-copy">Use o lápis para abrir os campos e a configuração específica de cada etapa.</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={addStep}>
          <Plus size={16} />
          Adicionar etapa
        </button>
      </div>

      <div className="step-board">
        <div className="step-list">
          {steps.map((step, index) =>
            <article className={`step-card ${editingStep === index ? "active" : ""}`} key={`${step.id ?? "new"}-${index}`}>
              <div className="step-card-top">
                <span className="step-chip">{index + 1}</span>
                <button className="icon-btn" type="button" onClick={() => setEditingStep(index)}>
                  <PencilLine size={16} />
                </button>
              </div>
              <strong>{step.name || `Etapa ${index + 1}`}</strong>
              <small>{stepTypeOptions.find(option => option.value === step.type)?.label}</small>
              <div className="step-meta">
                <span>{step.fields.length} campo(s)</span>
                {typeNeedsApi(step.type) && <span>Integração</span>}
              </div>
              <button className="btn btn-ghost btn-inline" type="button" onClick={() => removeStep(index)}>
                <Trash2 size={15} />
                Excluir
              </button>
            </article>)}
        </div>

        {currentStep && <div className="step-editor card">
          <div className="step-editor-header">
            <div>
              <span className="eyebrow">Etapa {editingStep + 1}</span>
              <h3>{currentStep.name || "Configuração da etapa"}</h3>
            </div>
            <Workflow size={20} />
          </div>

          <div className="formgrid">
            <div className="field">
              <label>Nome da etapa *</label>
              <input className="input" value={currentStep.name} onChange={e => updateStep(editingStep, { name: e.target.value })} />
            </div>
            <div className="field">
              <label>Tipo de entrada</label>
              <select className="select" value={currentStep.type} onChange={e => updateStep(editingStep, { type: Number(e.target.value), apiConfig: createApiConfig() })}>
                {stepTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field span2">
              <label>Descrição</label>
              <textarea className="textarea" value={currentStep.description ?? ""} onChange={e => updateStep(editingStep, { description: e.target.value })} />
            </div>
          </div>

          <div className="editor-block">
            <div className="section-header">
              <div>
                <h4>Campos de registro da etapa</h4>
                <p className="section-copy">Esses campos aparecem quando a etapa precisa capturar dados.</p>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => updateStep(editingStep, { fields: [...currentStep.fields, createField()] })}>
                <Plus size={16} />
                Adicionar campo
              </button>
            </div>

            <div className="builder">
              {currentStep.fields.length === 0 && <div className="empty compact">Nenhum campo cadastrado nesta etapa.</div>}
              {currentStep.fields.map((field, fieldIndex) =>
                <div className="field-block" key={`${field.id ?? "new"}-${fieldIndex}`}>
                  <div className="builder-row builder-row-field">
                    <input
                      className="input"
                      placeholder="Rótulo"
                      value={field.label}
                      onChange={e => updateField(editingStep, fieldIndex, { label: e.target.value, key: field.key || slugify(e.target.value) })}
                    />
                    <input className="input" placeholder="chave_do_campo" value={field.key} onChange={e => updateField(editingStep, fieldIndex, { key: slugify(e.target.value) })} />
                    <select className="select" value={field.type} onChange={e => updateField(editingStep, fieldIndex, { type: Number(e.target.value), options: Number(e.target.value) === 5 ? (field.options.length ? field.options : [createOption()]) : [] })}>
                      {fieldTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <label className="toggle-line compact">
                      <input type="checkbox" checked={field.required} onChange={e => updateField(editingStep, fieldIndex, { required: e.target.checked })} />
                      Obrigatório
                    </label>
                    <button className="btn btn-ghost" type="button" onClick={() => updateStep(editingStep, { fields: currentStep.fields.filter((_, currentFieldIndex) => currentFieldIndex !== fieldIndex) })}>
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {field.type === 5 && <div className="options-box">
                    <div className="section-header">
                      <div>
                        <h4>Opções da lista</h4>
                        <p className="section-copy">Cada item pode ter nome e valor próprios.</p>
                      </div>
                      <button className="btn btn-secondary" type="button" onClick={() => updateField(editingStep, fieldIndex, { options: [...field.options, createOption()] })}>
                        <Plus size={14} />
                        Nova opção
                      </button>
                    </div>
                    {field.options.map((option, optionIndex) =>
                      <div className="builder-row option-row" key={`${option.id ?? "new"}-${optionIndex}`}>
                        <input className="input" placeholder="Nome da opção" value={option.label} onChange={e => updateOption(editingStep, fieldIndex, optionIndex, { label: e.target.value })} />
                        <input className="input" placeholder="Valor enviado" value={option.value} onChange={e => updateOption(editingStep, fieldIndex, optionIndex, { value: e.target.value })} />
                        <button className="btn btn-ghost" type="button" onClick={() => updateField(editingStep, fieldIndex, { options: field.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) })}>
                          <Trash2 size={15} />
                        </button>
                      </div>)}
                  </div>}
                </div>)}
            </div>
          </div>

          {typeNeedsApi(currentStep.type) && <div className="editor-block">
            <div className="section-header">
              <div>
                <h4>Integração da etapa</h4>
                <p className="section-copy">Configure envio, consulta ou monitoramento por API na própria etapa.</p>
              </div>
            </div>

            <div className="formgrid">
              <div className="field">
                <label>URL</label>
                <input className="input" placeholder="https://api.exemplo.com/recurso" value={currentStep.apiConfig?.url ?? ""} onChange={e => updateApiConfig(editingStep, { url: e.target.value })} />
              </div>
              <div className="field">
                <label>Método</label>
                <select className="select" value={currentStep.apiConfig?.method ?? (currentStep.type === 4 ? "POST" : "GET")} onChange={e => updateApiConfig(editingStep, { method: e.target.value })}>
                  {currentStep.type === 4 && <>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </>}
                  {currentStep.type !== 4 && <option value="GET">GET</option>}
                </select>
              </div>
              <div className="field">
                <label>Token</label>
                <select className="select" value={currentStep.apiConfig?.tokenName ?? ""} onChange={e => updateApiConfig(editingStep, { tokenName: e.target.value || undefined })}>
                  <option value="">Sem autenticação</option>
                  {tokens.map((token, index) => <option key={`${token.id ?? "new"}-${index}`} value={token.name}>{token.name || `Token ${index + 1}`}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Agendamento</label>
                <select className="select" value={currentStep.apiConfig?.scheduleMode ?? "manual"} onChange={e => updateApiConfig(editingStep, { scheduleMode: e.target.value })}>
                  <option value="manual">Manual</option>
                  <option value="interval">Intervalo</option>
                  <option value="cron">Cron</option>
                </select>
              </div>
              {(currentStep.apiConfig?.scheduleMode === "interval" || currentStep.apiConfig?.scheduleMode === "cron") &&
                <div className="field span2">
                  <label>{currentStep.apiConfig?.scheduleMode === "interval" ? "Intervalo" : "Expressão cron"}</label>
                  <input className="input" placeholder={currentStep.apiConfig?.scheduleMode === "interval" ? "Ex.: 30 minutos" : "Ex.: */30 * * * *"} value={currentStep.apiConfig?.scheduleValue ?? ""} onChange={e => updateApiConfig(editingStep, { scheduleValue: e.target.value })} />
                </div>}
              {currentStep.type === 5 &&
                <div className="field span2">
                  <label>Template da consulta</label>
                  <input className="input" placeholder="Ex.: ?id={{chaveAcesso}}" value={currentStep.apiConfig?.queryTemplate ?? ""} onChange={e => updateApiConfig(editingStep, { queryTemplate: e.target.value })} />
                </div>}
              <div className="field span2">
                <label className="toggle-line">
                  <input type="checkbox" checked={currentStep.apiConfig?.validateTls ?? true} onChange={e => updateApiConfig(editingStep, { validateTls: e.target.checked })} />
                  Validar certificado TLS/HTTPS
                </label>
              </div>
            </div>
          </div>}
        </div>}
      </div>

      <div className="actions">
        <button className="btn btn-secondary" type="button" onClick={() => router.back()}>Cancelar</button>
        <button className="btn btn-primary" type="button" disabled={saving} onClick={saveFlow}>
          <Save size={16} />
          {saving ? "Salvando..." : flowId ? "Salvar alterações" : "Criar fluxo"}
        </button>
      </div>
    </section>
  </>;
}
