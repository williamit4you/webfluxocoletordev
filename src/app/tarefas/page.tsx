"use client";

import { api } from "@/lib/api";
import type { Instance } from "@/lib/types";
import { PlayCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function PendingTasksPage() {
  const [rows, setRows] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Instance[]>("/instances/pending-tasks")
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : "Nao foi possivel carregar as tarefas."))
      .finally(() => setLoading(false));
  }, []);

  const tasks = useMemo(() => rows.map(item => ({
    item,
    currentStep: item.steps.find(step => step.id === item.currentStepExecutionId) ?? item.steps.find(step => step.status === 1)
  })), [rows]);

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Operacao</span>
        <h1 className="title">Tarefas pendentes</h1>
        <p className="subtitle">Lista automatica das etapas que voce pode executar agora.</p>
      </div>
    </div>

    <section className="card tablewrap">
      {loading && <div className="empty">Carregando tarefas...</div>}
      {error && <div className="error" style={{ margin: 16 }}>{error}</div>}
      {!loading && !error && tasks.length === 0 && <div className="empty">Nenhuma tarefa pendente disponivel para voce neste momento.</div>}

      {!loading && !error && tasks.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Registro</th>
              <th>Fluxo</th>
              <th>Etapa atual</th>
              <th>Atualizado</th>
              <th>Acao</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(({ item, currentStep }) => (
              <tr key={item.id}>
                <td><Link className="code" href={`/execucoes/${item.id}`}>{item.code}</Link></td>
                <td>{item.flowName}</td>
                <td>{currentStep?.name ?? "Etapa atual"}</td>
                <td>{new Date(item.updatedAt).toLocaleString("pt-BR")}</td>
                <td>
                  <Link className="btn btn-primary" href={`/execucoes/${item.id}`}>
                    <PlayCircle size={16} />
                    Executar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  </>;
}
