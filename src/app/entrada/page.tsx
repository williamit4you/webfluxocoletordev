"use client";

import { api } from "@/lib/api";
import type { Flow, Instance } from "@/lib/types";
import { Play, Search, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type EntryToastState = {
  title: string;
  message: string;
};

export default function EntryPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [flowFilter, setFlowFilter] = useState("");
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

  const filteredFlows = flows.filter(item =>
    item.name.toLowerCase().includes(flowFilter.toLowerCase()) ||
    item.description.toLowerCase().includes(flowFilter.toLowerCase())
  );
  const flow = flows.find(item => item.id === flowId);
  const firstStep = flow?.steps[0];

  useEffect(() => {
    if (filteredFlows.length === 0) {
      if (flowId) {
        setFlowId("");
      }
      return;
    }

    if (!filteredFlows.some(item => item.id === flowId)) {
      setFlowId(filteredFlows[0].id);
    }
  }, [filteredFlows, flowId]);

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
        <span className="eyebrow">Operação</span>
        <h1 className="title">Nova entrada</h1>
        <p className="subtitle">Escolha o fluxo e inicie. A coleta de dados acontece na primeira etapa da execução.</p>
      </div>
    </div>

    <section className="card formcard">
      <div className="section-header" style={{ marginBottom: 18 }}>
        <div>
          <h2 className="section-title">Escolha o fluxo</h2>
          <p className="section-copy">Use o filtro para localizar rapidamente o processo desejado e iniciar uma nova entrada.</p>
        </div>
        <div className="entry-filter">
          <Search size={16} />
          <input
            className="input"
            placeholder="Filtrar fluxos por nome..."
            value={flowFilter}
            onChange={e => setFlowFilter(e.target.value)}
          />
        </div>
      </div>

      {filteredFlows.length === 0 && <div className="empty compact">Nenhum fluxo encontrado com esse filtro.</div>}

      {filteredFlows.length > 0 && <div className="entry-flow-grid">
        {filteredFlows.map(item => {
          const itemFirstStep = item.steps[0];
          const isSelected = item.id === flowId;

          return <button
            key={item.id}
            type="button"
            className={`entry-flow-card card ${isSelected ? "selected" : ""}`}
            onClick={() => setFlowId(item.id)}
          >
            <div className="entry-flow-card-head">
              <span className={`badge ${item.active ? "completed" : "cancelled"}`}>{item.active ? "Ativo" : "Inativo"}</span>
              {isSelected && <span className="entry-flow-selected">Selecionado</span>}
            </div>
            <strong>{item.name}</strong>
            <small>{itemFirstStep ? `Primeira etapa: ${itemFirstStep.name}` : "Sem etapa inicial cadastrada"}</small>
          </button>;
        })}
      </div>}

      {firstStep && <div className="notice" style={{ marginTop: 18 }}>
        Fluxo selecionado: <strong>{flow?.name}</strong> {firstStep ? <>• Primeira etapa: <strong>{firstStep.name}</strong></> : null}
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
