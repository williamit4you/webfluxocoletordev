"use client";

import { api } from "@/lib/api";
import type { Flow, Instance } from "@/lib/types";
import { Play, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type EntryToastState = {
  title: string;
  message: string;
};

export default function EntryPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [warning, setWarning] = useState("");
  const [toast, setToast] = useState<EntryToastState | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api<Flow[]>("/flows")
      .then(result => {
        setFlows(result);
        if (result[0]) {
          setFlowId(result[0].id);
        }
      })
      .catch(e => setWarning(e instanceof Error ? e.message : "Nao foi possivel carregar os fluxos."));
  }, []);

  const flow = flows.find(item => item.id === flowId);
  const firstStep = flow?.steps[0];

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  async function createInstance() {
    if (!flow) {
      return;
    }

    setCreating(true);
    setWarning("");

    try {
      const result = await api<{ id: string }>("/instances", {
        method: "POST",
        body: JSON.stringify({ flowDefinitionId: flow.id, data: {} })
      });

      try {
        await api<Instance>(`/instances/${result.id}`);
      } catch (e) {
        if (e instanceof Error && e.message === "Acesso negado.") {
          setToast({
            title: "Acesso negado",
            message: "Voce nao possui permissao para acessar a execucao criada."
          });
          return;
        }

        throw e;
      }

      router.push(`/execucoes/${result.id}`);
    } catch (e) {
      setWarning(e instanceof Error ? e.message : "Falha ao iniciar o fluxo.");
    } finally {
      setCreating(false);
    }
  }

  return <>
    {toast && (
      <div className="toast-stack" aria-live="polite">
        <div className="toast-card toast-card-danger card">
          <div className="toast-head">
            <div className="toast-icon toast-icon-danger">
              <ShieldAlert size={18} />
            </div>
          </div>
          <span className="toast-eyebrow">Permissao necessaria</span>
          <strong className="toast-title">{toast.title}</strong>
          <p className="toast-copy">{toast.message}</p>
        </div>
      </div>
    )}

    <div className="pagehead">
      <div>
        <span className="eyebrow">Operacao</span>
        <h1 className="title">Nova entrada</h1>
        <p className="subtitle">Escolha o fluxo e inicie. A coleta de dados acontece na primeira etapa da execucao.</p>
      </div>
    </div>

    <section className="card formcard">
      <div className="formgrid">
        <div className="field span2">
          <label>Fluxo *</label>
          <select className="select" value={flowId} onChange={e => setFlowId(e.target.value)}>
            {flows.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>

      {firstStep && <div className="notice" style={{ marginTop: 18 }}>
        Primeira etapa: <strong>{firstStep.name}</strong>
      </div>}

      {warning && <div className="error" style={{ marginTop: 15 }}>{warning}</div>}

      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={createInstance} disabled={creating || !flowId}>
          <Play size={17} />
          {creating ? "Iniciando..." : "Iniciar fluxo"}
        </button>
      </div>
    </section>
  </>;
}
