"use client";

import { api } from "@/lib/api";
import type { Field, Flow } from "@/lib/types";
import { Camera, FileText, Play, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isUploadField(type: number) {
  return type === 3 || type === 7;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function renderUploadChooser(
  field: Field,
  pendingFiles: File[],
  onFilesChange: (files: File[]) => void
) {
  const isPhoto = field.type === 7;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="btn btn-secondary">
          {isPhoto ? <Camera size={16} /> : <Upload size={16} />}
          {isPhoto ? "Selecionar foto" : "Selecionar arquivo"}
          <input
            hidden
            type="file"
            accept={isPhoto ? "image/*" : undefined}
            capture={isPhoto ? "environment" : undefined}
            onChange={event => onFilesChange(event.target.files ? Array.from(event.target.files) : [])}
          />
        </label>

        {isPhoto && (
          <label className="btn btn-ghost">
            <Camera size={16} />
            Tirar foto
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={event => onFilesChange(event.target.files ? Array.from(event.target.files) : [])}
            />
          </label>
        )}
      </div>

      {pendingFiles.length > 0 ? (
        <div className="section-copy">
          {pendingFiles.map(file => file.name).join(", ")}
        </div>
      ) : (
        <div className="section-copy">Nenhum arquivo selecionado.</div>
      )}
    </div>
  );
}

function renderInput(
  field: Field,
  value: unknown,
  pendingFiles: File[],
  onChange: (next: unknown) => void,
  onFilesChange: (files: File[]) => void
) {
  if (field.type === 5) {
    return (
      <select className="select" value={toText(value)} onChange={e => onChange(e.target.value)}>
        <option value="">Selecione</option>
        {field.options.map((option, index) => <option key={`${option.value}-${index}`} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (field.type === 8) {
    return (
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {field.options.map((option, index) => <label key={`${option.value}-${index}`} className="toggle-line compact">
          <input type="radio" name={field.key} checked={toText(value) === option.value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>)}
      </div>
    );
  }

  if (field.type === 6) {
    return (
      <select className="select" value={toText(value)} onChange={e => onChange(e.target.value)}>
        <option value="">Selecione</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  }

  if (isUploadField(field.type)) {
    return renderUploadChooser(field, pendingFiles, onFilesChange);
  }

  if (field.key === "observacoes") {
    return <textarea className="textarea" value={toText(value)} onChange={e => onChange(e.target.value)} />;
  }

  return (
    <input
      className="input"
      type={field.type === 1 ? "number" : field.type === 2 ? "date" : field.type === 4 ? "email" : "text"}
      value={toText(value)}
      onChange={e => onChange(e.target.value)}
    />
  );
}

export default function EntryPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});
  const [pendingFiles, setPendingFiles] = useState<Record<string, File[]>>({});
  const [code, setCode] = useState("");
  const [warning, setWarning] = useState("");
  const [scanning, setScanning] = useState(false);
  const [creating, setCreating] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const router = useRouter();

  useEffect(() => {
    api<Flow[]>("/flows").then(result => {
      setFlows(result);
      if (result[0]) {
        setFlowId(result[0].id);
      }
    });
  }, []);

  const flow = flows.find(item => item.id === flowId);
  const firstStep = flow?.steps[0];
  const firstStepFields = firstStep?.fields ?? [];
  const readerMode = firstStep?.type === 0;

  async function readPdf(file?: File) {
    if (!file) {
      return;
    }

    const body = new FormData();
    body.append("file", file);

    try {
      const result = await api<{ fields: Record<string, string>; warnings: string[] }>("/documents/nfe/extract", { method: "POST", body });
      setData(current => ({ ...current, ...result.fields }));
      setCode(result.fields.chaveAcesso || result.fields.numeroNfe || code);
      setWarning(result.warnings.join(" "));
    } catch (e) {
      setWarning(e instanceof Error ? e.message : "Falha na leitura.");
    }
  }

  async function scanCode() {
    setWarning("");
    if (!navigator.mediaDevices) {
      setWarning("Câmera indisponível. Use o coletor como teclado no campo código.");
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
        setWarning("Este navegador não oferece leitura nativa. Use o coletor físico ou preencha manualmente.");
        return;
      }

      const detector = new Detector({ formats: ["qr_code", "code_128", "ean_13", "data_matrix"] });
      const loop = async () => {
        if (!video.current) {
          return;
        }

        const codes = await detector.detect(video.current);
        if (codes[0]) {
          const rawValue = codes[0].rawValue;
          setCode(rawValue);
          setData(current => ({ ...current, chaveAcesso: rawValue }));
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
      setWarning("Não foi possível abrir a câmera. Verifique a permissão e use HTTPS ou localhost.");
    }
  }

  async function createInstance() {
    if (!flow) {
      return;
    }

    setCreating(true);
    setWarning("");

    try {
      const baseData = Object.fromEntries(
        Object.entries(data).filter(([key]) => !isUploadField(firstStepFields.find(field => field.key === key)?.type ?? -1))
      );

      const result = await api<{ id: string }>("/instances", {
        method: "POST",
        body: JSON.stringify({ flowDefinitionId: flow.id, code, data: baseData })
      });

      for (const field of firstStepFields.filter(item => isUploadField(item.type))) {
        const files = pendingFiles[field.key] ?? [];
        for (const file of files) {
          const body = new FormData();
          body.append("fieldKey", field.key);
          body.append("file", file);
          await api(`/instances/${result.id}/upload`, { method: "POST", body });
        }
      }

      router.push(`/execucoes/${result.id}`);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : "Falha ao iniciar o fluxo.");
    } finally {
      setCreating(false);
    }
  }

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Operação</span>
        <h1 className="title">Nova entrada</h1>
        <p className="subtitle">A entrada usa os campos da primeira etapa do fluxo selecionado.</p>
      </div>
    </div>

    <section className="card formcard">
      <div className="formgrid">
        <div className="field">
          <label>Fluxo *</label>
          <select className="select" value={flowId} onChange={e => { setFlowId(e.target.value); setData({}); setPendingFiles({}); }}>
            {flows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Código do registro</label>
          <input className="input" autoFocus value={code} onChange={e => setCode(e.target.value)} placeholder="Leitor físico pode escrever aqui" />
        </div>
      </div>

      {readerMode && <div className="scanbox" style={{ marginTop: 18 }}>
        <strong>Entrada assistida</strong>
        <p className="section-copy">Envie um DANFE digital ou leia o código com a câmera. Os dados capturados podem preencher os campos abaixo.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label className="btn btn-secondary">
            <Upload size={16} />
            Ler PDF
            <input hidden type="file" accept="application/pdf" onChange={e => void readPdf(e.target.files?.[0])} />
          </label>
          <button className="btn btn-secondary" type="button" onClick={scanCode}>
            <Camera size={16} />
            Abrir câmera
          </button>
        </div>
        {scanning && <video ref={video} className="camera" muted playsInline />}
      </div>}

      {warning && <div className={warning.includes("Nenhum") ? "notice" : "error"} style={{ marginTop: 15 }}>{warning}</div>}

      <hr className="divider" />

      <h2 className="section-title"><FileText size={19} style={{ verticalAlign: "middle", marginRight: 7 }} />Campos da etapa inicial</h2>
      <p className="section-copy">{firstStep ? `Etapa: ${firstStep.name}` : "Selecione um fluxo com etapas configuradas."}</p>

      <div className="formgrid">
        {firstStepFields.map(field =>
          <div className={`field ${field.key === "observacoes" ? "span2" : ""}`} key={field.key}>
            <label>{field.label}{field.required ? " *" : ""}</label>
            {renderInput(
              field,
              data[field.key] ?? "",
              pendingFiles[field.key] ?? [],
              next => setData(current => ({ ...current, [field.key]: next })),
              files => setPendingFiles(current => ({ ...current, [field.key]: files }))
            )}
          </div>)}
      </div>

      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={createInstance} disabled={creating}>
          <Play size={17} />
          {creating ? "Iniciando..." : "Iniciar fluxo"}
        </button>
      </div>
    </section>
  </>;
}
