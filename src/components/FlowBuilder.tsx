"use client";

import { api } from "@/lib/api";
import type { Field, FieldOption, Flow, FlowToken, Step, StepApiConfig } from "@/lib/types";
import { Eye, EyeOff, PencilLine, Plus, Save, Send, Shield, Trash2, Workflow } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const stepTypeOptions = [
  { value: 0, label: "Leitor / camera" },
  { value: 1, label: "Direcionamento para usuario" },
  { value: 2, label: "Acompanhamento externo" },
  { value: 3, label: "Automatica (start)" },
  { value: 4, label: "API envio" },
  { value: 5, label: "API consulta" }
];

const fieldTypeOptions = [
  { value: 0, label: "Texto" },
  { value: 1, label: "Numero" },
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

export function FlowBuilder({ flowId }: { flowId?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [tokens, setTokens] = useState<FlowToken[]>([]);
  const [steps, setSteps] = useState<Step[]>([
    { ...createStep("Entrada do caminhao"), type: 0 },
    { ...createStep("Saida para Sandra"), type: 1 }
  ]);
  const [editingStep, setEditingStep] = useState(0);
  const [loading, setLoading] = useState(!!flowId);
  const [saving, setSaving] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [visibleTokens, setVisibleTokens] = useState<Record<number, boolean>>({});
  const [flowStatus, setFlowStatus] = useState("Draft");
  const [flowVersion, setFlowVersion] = useState(1);

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
        setTokens(flow.tokens);
        setSteps(flow.steps.length > 0 ? flow.steps : [createStep()]);
        setEditingStep(0);
        setFlowStatus(flow.lifecycleStatus);
        setFlowVersion(flow.versionNumber);
      })
      .catch(e => {
        if (activeRequest) {
          setError(e instanceof Error ? e.message : "Nao foi possivel carregar o fluxo.");
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

  const isDraft = !flowId || flowStatus === "Draft";
  const currentStep = steps[editingStep];

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
    setEditingStep(Math.max(0, index - 1));
  }

  async function saveFlow() {
    if (flowId && !isDraft) {
      setError("Crie um rascunho antes de alterar uma versao publicada.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      name,
      description,
      active,
      tokens: tokens.map(token => ({
        ...token,
        name: token.name.trim(),
        headerName: token.headerName?.trim(),
        value: token.value ?? ""
      })),
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
        setSuccess("Rascunho salvo com sucesso.");
      } else {
        const result = await api<{ id: string }>(`/flows`, { method: "POST", body: JSON.stringify(payload) });
        router.replace(`/fluxos/${result.id}`);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel salvar o fluxo.");
    } finally {
      setSaving(false);
    }
  }

  async function createDraftFromPublished() {
    if (!flowId) {
      return;
    }

    setCreatingDraft(true);
    setError("");

    try {
      const result = await api<{ id: string }>(`/flows/${flowId}/draft`, { method: "POST" });
      router.replace(`/fluxos/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel criar o rascunho.");
    } finally {
      setCreatingDraft(false);
    }
  }

  async function publishDraft() {
    if (!flowId) {
      return;
    }

    setPublishing(true);
    setError("");
    setSuccess("");

    try {
      await api(`/flows/${flowId}/publish`, { method: "POST" });
      setFlowStatus("Published");
      setSuccess("Fluxo publicado com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel publicar o fluxo.");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return <div className="empty">Carregando estrutura do fluxo...</div>;
  }

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Construtor</span>
        <h1 className="title">{flowId ? "Editar fluxo" : "Criar novo fluxo"}</h1>
        <p className="subtitle">Cada etapa pode ter seus proprios campos, gatilhos e integracoes.</p>
      </div>
      {flowId && <span className={`badge ${isDraft ? "inprogress" : "completed"}`}>v{flowVersion} - {isDraft ? "Rascunho" : "Publicado"}</span>}
    </div>

    {error && <div className="error">{error}</div>}
    {success && <div className="notice">{success}</div>}
    {flowId && !isDraft && <div className="notice">Esta versao publicada esta protegida. Crie um rascunho para editar sem afetar as execucoes em andamento.</div>}

    <section className="card formcard">
      <h2 className="section-title">Informacoes basicas</h2>
      <p className="section-copy">Defina a identidade do fluxo e mantenha o cadastro ativo para a operacao.</p>
      <div className="formgrid">
        <div className="field">
          <label>Nome do fluxo *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} disabled={!isDraft} />
        </div>
        <div className="field">
          <label>Status</label>
          <label className="toggle-line">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} disabled={!isDraft} />
            Fluxo ativo para novas entradas
          </label>
        </div>
        <div className="field span2">
          <label>Descricao</label>
          <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)} disabled={!isDraft} />
        </div>
      </div>

      <hr className="divider" />

      <div className="section-header">
        <div>
          <h2 className="section-title">Tokens do fluxo</h2>
          <p className="section-copy">Cadastre credenciais reutilizaveis para as integracoes das etapas.</p>
        </div>
        <button className="btn btn-secondary" type="button" disabled={!isDraft} onClick={() => setTokens(current => [...current, createToken()])}>
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
                <input className="input" value={token.name} onChange={e => updateToken(index, { name: e.target.value })} disabled={!isDraft} />
              </div>
              <div className="field">
                <label>Tipo</label>
                <select className="select" value={token.type} onChange={e => updateToken(index, { type: Number(e.target.value) })} disabled={!isDraft}>
                  <option value={0}>Bearer</option>
                  <option value={1}>API key</option>
                </select>
              </div>
              <div className="field">
                <label>Header</label>
                <input className="input" placeholder="Authorization ou X-API-Key" value={token.headerName ?? ""} onChange={e => updateToken(index, { headerName: e.target.value })} disabled={!isDraft} />
              </div>
              <div className="field">
                <label>Valor</label>
                <div className="password-wrap">
                  <input className="input" type={visibleTokens[index] ? "text" : "password"} value={token.value ?? ""} onChange={e => updateToken(index, { value: e.target.value })} disabled={!isDraft} />
                  <button className="icon-btn" type="button" onClick={() => setVisibleTokens(current => ({ ...current, [index]: !current[index] }))}>
                    {visibleTokens[index] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="row-actions">
              <label className="toggle-line">
                <input type="checkbox" checked={token.active} onChange={e => updateToken(index, { active: e.target.checked })} disabled={!isDraft} />
                Token ativo
              </label>
              <button className="btn btn-ghost" type="button" disabled={!isDraft} onClick={() => setTokens(current => current.filter((_, tokenIndex) => tokenIndex !== index))}>
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
          <p className="section-copy">Use o lapis para abrir os campos e a configuracao especifica de cada etapa.</p>
        </div>
        <button className="btn btn-secondary" type="button" disabled={!isDraft} onClick={addStep}>
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
                {typeNeedsApi(step.type) && <span>Integracao</span>}
              </div>
              <button className="btn btn-ghost btn-inline" type="button" disabled={!isDraft} onClick={() => removeStep(index)}>
                <Trash2 size={15} />
                Excluir
              </button>
            </article>)}
        </div>

        {currentStep && <div className="step-editor card">
          <div className="step-editor-header">
            <div>
              <span className="eyebrow">Etapa {editingStep + 1}</span>
              <h3>{currentStep.name || "Configuracao da etapa"}</h3>
            </div>
            <Workflow size={20} />
          </div>

          <div className="formgrid">
            <div className="field">
              <label>Nome da etapa *</label>
              <input className="input" value={currentStep.name} onChange={e => updateStep(editingStep, { name: e.target.value })} disabled={!isDraft} />
            </div>
            <div className="field">
              <label>Tipo de entrada</label>
              <select className="select" value={currentStep.type} onChange={e => updateStep(editingStep, { type: Number(e.target.value), apiConfig: createApiConfig() })} disabled={!isDraft}>
                {stepTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field span2">
              <label>Descricao</label>
              <textarea className="textarea" value={currentStep.description ?? ""} onChange={e => updateStep(editingStep, { description: e.target.value })} disabled={!isDraft} />
            </div>
          </div>

          <div className="editor-block">
            <div className="section-header">
              <div>
                <h4>Campos de registro da etapa</h4>
                <p className="section-copy">Esses campos aparecem quando a etapa precisa capturar dados.</p>
              </div>
              <button className="btn btn-secondary" type="button" disabled={!isDraft} onClick={() => updateStep(editingStep, { fields: [...currentStep.fields, createField()] })}>
                <Plus size={16} />
                Adicionar campo
              </button>
            </div>

            <div className="builder">
              {currentStep.fields.length === 0 && <div className="empty compact">Nenhum campo cadastrado nesta etapa.</div>}
              {currentStep.fields.map((field, fieldIndex) =>
                <div className="field-block" key={`${field.id ?? "new"}-${fieldIndex}`}>
                  <div className="builder-row builder-row-field">
                    <input className="input" placeholder="Rotulo" value={field.label} onChange={e => updateField(editingStep, fieldIndex, { label: e.target.value, key: field.key || slugify(e.target.value) })} disabled={!isDraft} />
                    <input className="input" placeholder="chave_do_campo" value={field.key} onChange={e => updateField(editingStep, fieldIndex, { key: slugify(e.target.value) })} disabled={!isDraft} />
                    <select className="select" value={field.type} onChange={e => updateField(editingStep, fieldIndex, { type: Number(e.target.value), options: Number(e.target.value) === 5 ? (field.options.length ? field.options : [createOption()]) : [] })} disabled={!isDraft}>
                      {fieldTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <label className="toggle-line compact">
                      <input type="checkbox" checked={field.required} onChange={e => updateField(editingStep, fieldIndex, { required: e.target.checked })} disabled={!isDraft} />
                      Obrigatorio
                    </label>
                    <button className="btn btn-ghost" type="button" disabled={!isDraft} onClick={() => updateStep(editingStep, { fields: currentStep.fields.filter((_, currentFieldIndex) => currentFieldIndex !== fieldIndex) })}>
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {field.type === 5 && <div className="options-box">
                    <div className="section-header">
                      <div>
                        <h4>Opcoes da lista</h4>
                        <p className="section-copy">Cada item pode ter nome e valor proprios.</p>
                      </div>
                      <button className="btn btn-secondary" type="button" disabled={!isDraft} onClick={() => updateField(editingStep, fieldIndex, { options: [...field.options, createOption()] })}>
                        <Plus size={14} />
                        Nova opcao
                      </button>
                    </div>
                    {field.options.map((option, optionIndex) =>
                      <div className="builder-row option-row" key={`${option.id ?? "new"}-${optionIndex}`}>
                        <input className="input" placeholder="Nome da opcao" value={option.label} onChange={e => updateOption(editingStep, fieldIndex, optionIndex, { label: e.target.value })} disabled={!isDraft} />
                        <input className="input" placeholder="Valor enviado" value={option.value} onChange={e => updateOption(editingStep, fieldIndex, optionIndex, { value: e.target.value })} disabled={!isDraft} />
                        <button className="btn btn-ghost" type="button" disabled={!isDraft} onClick={() => updateField(editingStep, fieldIndex, { options: field.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) })}>
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
                <h4>Integracao da etapa</h4>
                <p className="section-copy">Configure envio, consulta ou monitoramento por API na propria etapa.</p>
              </div>
            </div>

            <div className="formgrid">
              <div className="field">
                <label>URL</label>
                <input className="input" placeholder="https://api.exemplo.com/recurso" value={currentStep.apiConfig?.url ?? ""} onChange={e => updateApiConfig(editingStep, { url: e.target.value })} disabled={!isDraft} />
              </div>
              <div className="field">
                <label>Metodo</label>
                <select className="select" value={currentStep.apiConfig?.method ?? (currentStep.type === 4 ? "POST" : "GET")} onChange={e => updateApiConfig(editingStep, { method: e.target.value })} disabled={!isDraft}>
                  {currentStep.type === 4 && <>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </>}
                  {currentStep.type !== 4 && <option value="GET">GET</option>}
                </select>
              </div>
              <div className="field">
                <label>Token</label>
                <select className="select" value={currentStep.apiConfig?.tokenName ?? ""} onChange={e => updateApiConfig(editingStep, { tokenName: e.target.value || undefined })} disabled={!isDraft}>
                  <option value="">Sem autenticacao</option>
                  {tokens.map((token, index) => <option key={`${token.id ?? "new"}-${index}`} value={token.name}>{token.name || `Token ${index + 1}`}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Agendamento</label>
                <select className="select" value={currentStep.apiConfig?.scheduleMode ?? "manual"} onChange={e => updateApiConfig(editingStep, { scheduleMode: e.target.value })} disabled={!isDraft}>
                  <option value="manual">Manual</option>
                  <option value="interval">Intervalo</option>
                  <option value="cron">Cron</option>
                </select>
              </div>
              {(currentStep.apiConfig?.scheduleMode === "interval" || currentStep.apiConfig?.scheduleMode === "cron") &&
                <div className="field span2">
                  <label>{currentStep.apiConfig?.scheduleMode === "interval" ? "Intervalo" : "Expressao cron"}</label>
                  <input className="input" placeholder={currentStep.apiConfig?.scheduleMode === "interval" ? "Ex.: 30 minutos" : "Ex.: */30 * * * *"} value={currentStep.apiConfig?.scheduleValue ?? ""} onChange={e => updateApiConfig(editingStep, { scheduleValue: e.target.value })} disabled={!isDraft} />
                </div>}
              {currentStep.type === 5 &&
                <div className="field span2">
                  <label>Template da consulta</label>
                  <input className="input" placeholder="Ex.: ?id={{chaveAcesso}}" value={currentStep.apiConfig?.queryTemplate ?? ""} onChange={e => updateApiConfig(editingStep, { queryTemplate: e.target.value })} disabled={!isDraft} />
                </div>}
              <div className="field span2">
                <label className="toggle-line">
                  <input type="checkbox" checked={currentStep.apiConfig?.validateTls ?? true} onChange={e => updateApiConfig(editingStep, { validateTls: e.target.checked })} disabled={!isDraft} />
                  Validar certificado TLS/HTTPS
                </label>
              </div>
            </div>
          </div>}
        </div>}
      </div>

      <div className="actions">
        <button className="btn btn-secondary" type="button" onClick={() => router.back()}>Cancelar</button>
        {flowId && !isDraft && <button className="btn btn-secondary" type="button" disabled={creatingDraft} onClick={createDraftFromPublished}>
          <PencilLine size={16} />
          {creatingDraft ? "Gerando rascunho..." : "Criar rascunho"}
        </button>}
        {flowId && isDraft && <button className="btn btn-secondary" type="button" disabled={publishing} onClick={publishDraft}>
          <Send size={16} />
          {publishing ? "Publicando..." : "Publicar fluxo"}
        </button>}
        <button className="btn btn-primary" type="button" disabled={saving || !isDraft} onClick={saveFlow}>
          <Save size={16} />
          {saving ? "Salvando..." : flowId ? "Salvar alteracoes" : "Criar fluxo"}
        </button>
      </div>
    </section>
  </>;
}
