"use client";

import { api } from "@/lib/api";
import type { Flow } from "@/lib/types";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function EntryPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [warning, setWarning] = useState("");
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
