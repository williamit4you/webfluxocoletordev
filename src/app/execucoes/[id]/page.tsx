"use client";

import { api } from "@/lib/api";
import type { ExecutionField, FieldOption, Flow, Instance, StepApiConfig } from "@/lib/types";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronUp, Clock, Paperclip, Play, RotateCw, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function getAutomaticStepTechnicalData(step: Instance["steps"][number]) {
  return Object.entries(step.data).filter(([key]) => key.startsWith("_integration."));
}

function tryParseIntervalMinutes(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  const direct = Number(trimmed);
  if (!Number.isNaN(direct) && direct > 0) {
    return direct;
  }

  const match = trimmed.match(/^(\d+)\s*(min|mins|minuto|minutos|h|hr|hora|horas)?$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "min").toLowerCase();
  return unit === "h" || unit === "hr" || unit === "hora" || unit === "horas"
    ? amount * 60
    : amount;
}

function parseCronPart(part: string, min: number, max: number) {
  if (part === "*") {
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }

  const values = new Set<number>();

  for (const segment of part.split(",")) {
    const item = segment.trim();
    if (!item) {
      continue;
    }

    if (item.includes("/")) {
      const [base, stepRaw] = item.split("/");
      const step = Number(stepRaw);
      if (Number.isNaN(step) || step <= 0) {
        continue;
      }

      const start = base === "*" || !base ? min : Number(base);
      const safeStart = Number.isNaN(start) ? min : Math.max(min, Math.min(max, start));
      for (let current = safeStart; current <= max; current += step) {
        values.add(current);
      }
      continue;
    }

    if (item.includes("-")) {
      const [startRaw, endRaw] = item.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (Number.isNaN(start) || Number.isNaN(end)) {
        continue;
      }

      for (let current = Math.max(min, start); current <= Math.min(max, end); current += 1) {
        values.add(current);
      }
      continue;
    }

    const value = Number(item);
    if (!Number.isNaN(value) && value >= min && value <= max) {
      values.add(value);
    }
  }

  return [...values].sort((left, right) => left - right);
}

function getNextCronOccurrence(expression?: string, fromDate = new Date()) {
  if (!expression?.trim()) {
    return null;
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minutePart, hourPart, dayPart, monthPart, weekdayPart] = parts;
  const minutes = parseCronPart(minutePart, 0, 59);
  const hours = parseCronPart(hourPart, 0, 23);
  const days = parseCronPart(dayPart, 1, 31);
  const months = parseCronPart(monthPart, 1, 12);
  const weekdays = parseCronPart(weekdayPart, 0, 6);

  if (!minutes.length || !hours.length || !days.length || !months.length || !weekdays.length) {
    return null;
  }

  const cursor = new Date(fromDate);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  for (let iteration = 0; iteration < 60 * 24 * 90; iteration += 1) {
    if (
      months.includes(cursor.getMonth() + 1)
      && days.includes(cursor.getDate())
      && weekdays.includes(cursor.getDay())
      && hours.includes(cursor.getHours())
      && minutes.includes(cursor.getMinutes())
    ) {
      return new Date(cursor);
    }

    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

function formatScheduleDate(date: Date) {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function describeAutomaticSchedule(
  config: StepApiConfig | null | undefined,
  step: Instance["steps"][number]
) {
  const scheduleMode = config?.scheduleMode?.trim().toLowerCase();
  const scheduleValue = config?.scheduleValue?.trim();

  if (!scheduleMode || scheduleMode === "manual") {
    return null;
  }

  if (scheduleMode === "interval") {
    const intervalMinutes = tryParseIntervalMinutes(scheduleValue);
    if (!intervalMinutes) {
      return {
        label: "Agendamento em intervalo",
        detail: scheduleValue || "Intervalo nao informado",
        nextAt: null as Date | null
      };
    }

    const latestAttempt = step.integrationAttempts[0]?.createdAt;
    const baseDate = latestAttempt
      ? new Date(latestAttempt)
      : step.startedAt
        ? new Date(step.startedAt)
        : new Date();
    const nextAt = new Date(baseDate.getTime() + intervalMinutes * 60 * 1000);

    return {
      label: "Agendamento em intervalo",
      detail: `A cada ${intervalMinutes} minuto(s)`,
      nextAt
    };
  }

  if (scheduleMode === "cron") {
    const nextAt = getNextCronOccurrence(scheduleValue);
    return {
      label: "Agendamento cron",
      detail: scheduleValue || "Expressao cron nao informada",
      nextAt
    };
  }

  return null;
}

function formatTechnicalDataLabel(key: string) {
  switch (key) {
    case "_integration.success":
      return "Sucesso";
    case "_integration.method":
      return "Metodo";
    case "_integration.url":
      return "URL";
    case "_integration.durationMs":
      return "Duracao (ms)";
    case "_integration.executedAtUtc":
      return "Executado em";
    case "_integration.statusCode":
      return "Status HTTP";
    case "_integration.requestHeaders":
      return "Headers enviados";
    case "_integration.requestBody":
      return "Body enviado";
    case "_integration.responsePreview":
      return "Resposta";
    case "_integration.errorMessage":
      return "Erro";
    default:
      return key.replace("_integration.", "");
  }
}

function digitsOnly(value: string) {
  return value.replace(/\D+/g, "");
}

function formatCurrency(value: string) {
  const digits = digitsOnly(value);
  if (!digits) {
    return "";
  }

  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function applyMask(mask: string | null | undefined, value: string) {
  if (!mask) {
    return value;
  }

  const normalized = value ?? "";
  const digits = digitsOnly(normalized);

  switch (mask) {
    case "cep":
      return digits.replace(/^(\d{0,5})(\d{0,3}).*$/, (_, a, b) => b ? `${a}-${b}` : a);
    case "cpf":
      return digits
        .replace(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2}).*$/, (_, a, b, c, d) =>
          [a, b && `.${b}`, c && `.${c}`, d && `-${d}`].filter(Boolean).join(""));
    case "cnpj":
      return digits
        .replace(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*$/, (_, a, b, c, d, e) =>
          [a, b && `.${b}`, c && `.${c}`, d && `/${d}`, e && `-${e}`].filter(Boolean).join(""));
    case "telefone":
    case "celular": {
      const limited = digits.slice(0, mask === "celular" ? 11 : 11);
      if (limited.startsWith("0")) {
        return limited.replace(/^(\d{0,3})(\d{0,5})(\d{0,4}).*$/, (_, a, b, c) =>
          [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
      }

      if (mask === "celular") {
        return limited.replace(/^(\d{0,2})(\d{0,5})(\d{0,4}).*$/, (_, a, b, c) =>
          [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
      }

      return limited.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*$/, (_, a, b, c) =>
        [a && `(${a})`, b && ` ${b}`, c && `-${c}`].filter(Boolean).join(""));
    }
    case "valor":
      return formatCurrency(normalized);
    case "data":
      return digits.replace(/^(\d{0,2})(\d{0,2})(\d{0,4}).*$/, (_, a, b, c) =>
        [a, b && `/${b}`, c && `/${c}`].filter(Boolean).join(""));
    default:
      return normalized;
  }
}

function resolveInputType(fieldType: number, mask?: string | null) {
  if (mask) {
    return "text";
  }

  return fieldType === 1 ? "number" : fieldType === 2 ? "date" : fieldType === 4 ? "email" : "text";
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

function buildCurrentStepFormData(result: Instance) {
  const currentStep = result.steps.find(step => step.id === result.currentStepExecutionId) ?? result.steps.find(step => step.status === 1);
  if (!currentStep) {
    return { currentStep: undefined, formData: {} as Record<string, unknown> };
  }

  const formData = currentStep.fields.reduce<Record<string, unknown>>((accumulator, field) => {
    accumulator[field.key] = currentStep.data[field.key] ?? field.value ?? (isUploadField(field.type) ? [] : isStructuredListField(field) ? [] : "");
    return accumulator;
  }, {});

  return { currentStep, formData };
}

function syncCurrentStepState(result: Instance, setItem: (value: Instance) => void, setFormData: (value: Record<string, unknown>) => void, setNotes: (value: string) => void) {
  setItem(result);
  const { currentStep, formData } = buildCurrentStepFormData(result);
  if (!currentStep) {
    setFormData({});
    setNotes("");
    return;
  }

  setFormData(formData);
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

function renderStructuredCellInput(option: FieldOption, value: unknown, inputName: string, onChange: (next: unknown) => void) {
  const fieldType = option.type ?? 0;

  if (fieldType === 6) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label className="toggle-line compact">
          <input type="radio" name={inputName} checked={toText(value) === "true"} onChange={() => onChange("true")} />
          Sim
        </label>
        <label className="toggle-line compact">
          <input type="radio" name={inputName} checked={toText(value) === "false"} onChange={() => onChange("false")} />
          Nao
        </label>
      </div>
    );
  }

  const inputType = resolveInputType(fieldType, option.mask);
  return <input className="input" type={inputType} value={toText(value)} onChange={event => onChange(applyMask(option.mask, event.target.value))} />;
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

      {rows.length > 0 && (
        <div className="tablewrap" style={{ border: "1px solid var(--line)", borderRadius: 16 }}>
          <table className="table">
            <thead>
              <tr>
                {field.options.map(option => {
                  const key = option.key?.trim();
                  if (!key || option.type === undefined || option.type === null) {
                    return null;
                  }

                  return <th key={`${field.key}-header-${key}`}>{option.label}{option.required ? " *" : ""}</th>;
                })}
                <th style={{ width: 96 }}>Acao</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${field.key}-row-${rowIndex}`}>
                  {field.options.map(option => {
                    const key = option.key?.trim();
                    if (!key || option.type === undefined || option.type === null) {
                      return null;
                    }

                    return (
                      <td key={`${field.key}-${key}-${rowIndex}`}>
                        {renderStructuredCellInput(option, row[key] ?? "", `${field.key}-${key}-${rowIndex}`, next => updateRow(rowIndex, key, next))}
                      </td>
                    );
                  })}
                  <td>
                    <button className="btn btn-ghost" type="button" onClick={() => removeRow(rowIndex)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

  const inputType = resolveInputType(field.type, field.mask);
  return <input className="input" type={inputType} value={toText(value)} onChange={event => onChange(applyMask(field.mask, event.target.value))} />;
}

export default function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<Instance | null>(null);
  const [flowDefinition, setFlowDefinition] = useState<Flow | null>(null);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [uploadingFieldKey, setUploadingFieldKey] = useState("");
  const [reprocessingStepId, setReprocessingStepId] = useState("");
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [journeyView, setJourneyView] = useState<"timeline" | "diagram">("timeline");
  const [readerWarning, setReaderWarning] = useState("");
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  function exitIfForbidden(cause: unknown) {
    if (!(cause instanceof Error) || cause.message !== "Acesso negado.") {
      return false;
    }

    window.alert("Voce concluiu sua tarefa e nao possui permissao para executar a proxima etapa.");
    router.push("/tarefas");
    return true;
  }

  const load = () => api<Instance>(`/instances/${id}`)
    .then(async result => {
      syncCurrentStepState(result, setItem, setFormData, setNotes);
      try {
        setFlowDefinition(await api<Flow>(`/flows/${result.flowDefinitionId}`));
      } catch {
        setFlowDefinition(null);
      }
    })
    .catch(e => {
      if (exitIfForbidden(e)) {
        return;
      }

      setError(e.message);
    });

  useEffect(() => {
    void load();
  }, [id]);

  const currentStep = useMemo(
    () => item?.steps.find(step => step.id === item.currentStepExecutionId) ?? item?.steps.find(step => step.status === 1),
    [item]
  );
  const readerMode = currentStep?.type === 0;
  const selectedJourneyStep = useMemo(
    () => item?.steps.find(step => expandedSteps[step.id]),
    [expandedSteps, item]
  );
  const currentStepDefinition = useMemo(
    () => currentStep && flowDefinition
      ? flowDefinition.steps.find(step => step.id === currentStep.flowStepId)
      : undefined,
    [currentStep, flowDefinition]
  );
  const automaticSchedule = useMemo(
    () => currentStep?.isAutomatic
      ? describeAutomaticSchedule(currentStepDefinition?.apiConfig, currentStep)
      : null,
    [currentStep, currentStepDefinition]
  );

  function canReprocessStep(step: Instance["steps"][number]) {
    const isIntegration = step.type === 4 || step.type === 5;
    const isCurrentAutomatic = step.isAutomatic && step.status === 1;
    const isCompletedIntegration = isIntegration && step.status === 2;
    return isCurrentAutomatic || isCompletedIntegration;
  }

  function toggleStepDetails(stepId: string) {
    setExpandedSteps(current => ({ ...current, [stepId]: !current[stepId] }));
  }

  function toggleJourneyDiagramDetails(stepId: string) {
    setExpandedSteps(current => current[stepId] ? {} : { [stepId]: true });
  }

  function renderStepDetails(step: Instance["steps"][number]) {
    const technicalData = getAutomaticStepTechnicalData(step);

    return (
      <div style={{ marginTop: 14, paddingLeft: 38 }}>
        {canReprocessStep(step) && (
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" type="button" onClick={() => void reprocessStep(step.id)} disabled={reprocessingStepId === step.id}>
              <RotateCw size={16} />
              {reprocessingStepId === step.id ? "Reprocessando..." : "Reprocessar etapa"}
            </button>
          </div>
        )}

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
                      <div className="tablewrap" style={{ marginTop: 6, border: "1px solid var(--line)", borderRadius: 14 }}>
                        <table className="table">
                          <thead>
                            <tr>
                              {field.options.map(option => {
                                const key = option.key?.trim();
                                if (!key) {
                                  return null;
                                }

                                return <th key={`${field.key}-history-header-${key}`}>{option.label}</th>;
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {structuredRows.map((row, rowIndex) => (
                              <tr key={`${field.key}-history-row-${rowIndex}`}>
                                {field.options.map(option => {
                                  const key = option.key?.trim();
                                  if (!key) {
                                    return null;
                                  }

                                  return <td key={`${field.key}-${key}-${rowIndex}`}>{toText(row[key]) || "-"}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
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

        {technicalData.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <strong>Dados tecnicos da automacao</strong>
            <div className="data-list" style={{ marginTop: 10 }}>
              {technicalData.map(([key, value]) => (
                <div className="data-item" key={`${step.id}-${key}`}>
                  <small>{formatTechnicalDataLabel(key)}</small>
                  {key === "_integration.responsePreview" || key === "_integration.requestHeaders" || key === "_integration.requestBody" ? (
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{toText(value) || "-"}</pre>
                  ) : (
                    <strong>{toText(value) || "-"}</strong>
                  )}
                </div>
              ))}
            </div>
          </div>
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
                  {attempt.requestHeaders && <>
                    <div className="section-copy" style={{ marginTop: 8 }}>Headers enviados</div>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{attempt.requestHeaders}</pre>
                  </>}
                  {attempt.requestBody && <>
                    <div className="section-copy" style={{ marginTop: 8 }}>Body enviado</div>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{attempt.requestBody}</pre>
                  </>}
                  {attempt.responsePreview && <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{attempt.responsePreview}</pre>}
                  {attempt.errorMessage && <div className="section-copy" style={{ marginTop: 8 }}>{attempt.errorMessage}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

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
      setItem(result);
      const { currentStep: nextStep, formData: nextServerData } = buildCurrentStepFormData(result);
      setFormData(current => {
        if (!nextStep) {
          return {};
        }

        return { ...current, ...nextServerData, [fieldKey]: nextServerData[fieldKey] ?? current[fieldKey] ?? [] };
      });
      setNotes(nextStep?.notes ?? "");
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
      if (exitIfForbidden(e)) {
        return;
      }

      setError(e instanceof Error ? e.message : "Nao foi possivel concluir a etapa.");
    } finally {
      setAdvancing(false);
    }
  }

  async function reprocessStep(stepId: string) {
    setReprocessingStepId(stepId);
    setError("");

    try {
      const result = await api<Instance>(`/instances/${id}/steps/${stepId}/reprocess`, {
        method: "POST"
      });
      syncCurrentStepState(result, setItem, setFormData, setNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nao foi possivel reprocessar a etapa.");
    } finally {
      setReprocessingStepId("");
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

      <div className="detailstack">
        <section className="card">
          <div style={{ padding: "24px 24px 0" }}>
            <h2 className="section-title">Execucao da etapa atual</h2>
            {currentStep && <h1 style={{ fontSize: 36, lineHeight: 1.05, margin: "8px 0 10px", letterSpacing: "-0.04em" }}>{currentStep.name}</h1>}
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
            <div style={{ margin: 24, display: "grid", gap: 12 }}>
              <div className="notice">
                Esta etapa e automatica. Use o historico abaixo para acompanhar a execucao sistemica ou consultar detalhes da integracao.
              </div>
              {automaticSchedule && (
                <div className="data-list" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <div className="data-item">
                    <small>Agendamento configurado</small>
                    <strong>{automaticSchedule.label}</strong>
                    <div className="section-copy" style={{ marginTop: 6 }}>{automaticSchedule.detail}</div>
                  </div>
                  <div className="data-item">
                    <small>Proxima execucao prevista</small>
                    <strong>{automaticSchedule.nextAt ? formatScheduleDate(automaticSchedule.nextAt) : "Nao foi possivel calcular"}</strong>
                    <div className="section-copy" style={{ marginTop: 6 }}>
                      O worker verifica etapas agendadas em ciclos de aproximadamente 30 segundos.
                    </div>
                  </div>
                </div>
              )}
              {canReprocessStep(currentStep) && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn btn-secondary" type="button" onClick={() => void reprocessStep(currentStep.id)} disabled={reprocessingStepId === currentStep.id}>
                    <RotateCw size={16} />
                    {reprocessingStepId === currentStep.id ? "Reprocessando..." : "Reprocessar etapa"}
                  </button>
                </div>
              )}
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

        <section className="card timeline">
          <div className="section-header">
            <div>
              <h2 className="section-title">Jornada do registro</h2>
              <p className="section-copy">Acompanhe o status, executor e os detalhes de cada etapa.</p>
            </div>
            <div className="view-toggle" role="tablist" aria-label="Modo de visualizacao da jornada">
              <button
                className={`view-toggle-btn ${journeyView === "timeline" ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={journeyView === "timeline"}
                onClick={() => setJourneyView("timeline")}
              >
                Visao 1
              </button>
              <button
                className={`view-toggle-btn ${journeyView === "diagram" ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={journeyView === "diagram"}
                onClick={() => setJourneyView("diagram")}
              >
                Visao 2
              </button>
            </div>
          </div>

          {journeyView === "timeline" && item.steps.map(step => {
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
                  <button className="btn btn-ghost" type="button" onClick={() => toggleStepDetails(step.id)}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Mais informacoes
                  </button>
                </div>

                {expanded && renderStepDetails(step)}
              </div>
            );
          })}

          {journeyView === "diagram" && (
            <div className="journey-diagram">
              <div className="step-diagram-scroll">
                <div className="step-diagram-canvas" role="list" aria-label="Jornada do registro em diagrama">
                  {item.steps.map(step => {
                    const expanded = !!expandedSteps[step.id];
                    const stateLabel = step.status === 2 ? "Concluida" : step.status === 1 ? "Atual" : "Aguardando";
                    const actorLabel = step.isAutomatic ? "Execucao automatica/sistemica" : `Executado por ${step.completedByName || "usuario nao identificado"}`;

                    return (
                      <div key={step.id} className={`diagram-node ${step.status === 1 ? "active" : ""}`} role="listitem">
                        <button className="diagram-node-card" type="button" onClick={() => toggleJourneyDiagramDetails(step.id)}>
                          <div className="diagram-node-top">
                            <span className="step-chip">{step.order}</span>
                            <span className="diagram-node-kind">{stateLabel}</span>
                          </div>
                          <strong>{step.name}</strong>
                          <small>{actorLabel}</small>
                          <div className="step-meta">
                            <span>Etapa {step.order}</span>
                            {step.integrationAttempts.length > 0 && <span>Integracao</span>}
                          </div>
                        </button>

                        <div className="diagram-node-actions">
                          <button className="btn btn-ghost btn-inline" type="button" onClick={() => toggleJourneyDiagramDetails(step.id)}>
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            Mais informacoes
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedJourneyStep && (
                <div className="journey-diagram-panel">
                  <div className="journey-diagram-panel-head">
                    <div>
                      <span className="eyebrow">Etapa {selectedJourneyStep.order}</span>
                      <h3>{selectedJourneyStep.name}</h3>
                      <p className="section-copy">
                        {selectedJourneyStep.status === 2
                          ? `Concluida ${selectedJourneyStep.completedAt ? new Date(selectedJourneyStep.completedAt).toLocaleString("pt-BR") : ""}`
                          : selectedJourneyStep.status === 1
                            ? "Etapa atual em execucao."
                            : "Etapa aguardando liberacao."}
                      </p>
                    </div>
                    <button className="btn btn-ghost" type="button" onClick={() => toggleJourneyDiagramDetails(selectedJourneyStep.id)}>
                      <ChevronUp size={16} />
                      Recolher
                    </button>
                  </div>

                  <div className="journey-diagram-details journey-diagram-details-wide">
                    {renderStepDetails(selectedJourneyStep)}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
