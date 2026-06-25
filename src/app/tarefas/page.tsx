"use client";

import { api } from "@/lib/api";
import { useAuth } from "@/components/Auth";
import type { Instance } from "@/lib/types";
import { Eye, PlayCircle, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TaskFilter = "all" | "pending" | "completed" | "cancelled";

function getInstanceStatusMeta(item: Instance) {
  if (item.status === 1) {
    return { key: "completed" as const, label: "Concluida" };
  }

  if (item.status === 2) {
    return { key: "cancelled" as const, label: "Cancelada" };
  }

  return { key: "inprogress" as const, label: "Pendente" };
}

export default function TasksPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api<Instance[]>("/instances")
      .then(result => {
        setRows(result);
        setUsingFallback(false);
      })
      .catch(async () => {
        try {
          const fallbackRows = await api<Instance[]>("/instances/pending-tasks");
          setRows(fallbackRows);
          setUsingFallback(true);
          setError("");
        } catch (fallbackError) {
          setError(fallbackError instanceof Error ? fallbackError.message : "Nao foi possivel carregar as tarefas.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const tasks = useMemo(() => rows.map(item => {
    const currentStep = item.steps.find(step => step.id === item.currentStepExecutionId) ?? item.steps.find(step => step.status === 1);
    const status = getInstanceStatusMeta(item);
    const completedByUser = !!user?.id && item.steps.some(step => step.completedByUserId === user.id);
    const canExecute = item.status === 0 && !!currentStep && !currentStep.isAutomatic && currentStep.status === 1;

    return {
      item,
      currentStep,
      status,
      completedByUser,
      canExecute
    };
  }), [rows, user?.id]);

  const counts = useMemo(() => ({
    all: tasks.length,
    pending: tasks.filter(task => task.status.key === "inprogress").length,
    completed: tasks.filter(task => task.status.key === "completed").length,
    cancelled: tasks.filter(task => task.status.key === "cancelled").length
  }), [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return tasks.filter(task => {
      if (statusFilter === "pending" && task.status.key !== "inprogress") {
        return false;
      }

      if (statusFilter === "completed" && task.status.key !== "completed") {
        return false;
      }

      if (statusFilter === "cancelled" && task.status.key !== "cancelled") {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        task.item.code,
        task.item.flowName,
        task.currentStep?.name ?? ""
      ].some(value => value.toLowerCase().includes(normalizedSearch));
    });
  }, [search, statusFilter, tasks]);

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Operacao</span>
        <h1 className="title">Tarefas</h1>
        <p className="subtitle">
          {usingFallback
            ? "Exibindo as tarefas que voce pode executar agora, com filtros de busca para localizar mais rapido."
            : "Visualize tudo o que esta pendente, concluido ou cancelado, com filtros para encontrar mais rapido."}
        </p>
      </div>
    </div>

    {!loading && !error && (
      <div className="metrics">
        <article className="card metric">
          <div className="label">Total visivel</div>
          <div className="value">{counts.all}</div>
          <div className="hint">{usingFallback ? "tarefas carregadas" : "todas as execucoes"}</div>
        </article>
        <article className="card metric">
          <div className="label">Pendentes</div>
          <div className="value">{counts.pending}</div>
          <div className="hint">prontas para acao</div>
        </article>
        <article className="card metric">
          <div className="label">Concluidas</div>
          <div className="value">{counts.completed}</div>
          <div className="hint">{usingFallback ? "indisponivel neste modo" : "ja finalizadas"}</div>
        </article>
        <article className="card metric">
          <div className="label">Canceladas</div>
          <div className="value">{counts.cancelled}</div>
          <div className="hint">{usingFallback ? "indisponivel neste modo" : "fora da operacao"}</div>
        </article>
      </div>
    )}

    <section className="card tablewrap">
      {loading && <div className="empty">Carregando tarefas...</div>}
      {error && <div className="error" style={{ margin: 16 }}>{error}</div>}

      {!loading && !error && (
        <>
          {usingFallback && <div className="notice" style={{ margin: 16 }}>
            A listagem completa ainda nao respondeu como esperado no backend. Por enquanto, esta tela carregou automaticamente as tarefas pendentes disponiveis para execucao.
          </div>}

          <div className="filters">
            <label className="field search">
              <span>Buscar</span>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }} />
                <input
                  className="input"
                  style={{ paddingLeft: 38 }}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Registro, fluxo ou etapa atual"
                />
              </div>
            </label>

            <label className="field" style={{ minWidth: 220 }}>
              <span>Status</span>
              <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskFilter)}>
                <option value="all">Todas ({counts.all})</option>
                <option value="pending">Pendentes ({counts.pending})</option>
                {!usingFallback && <option value="completed">Concluidas ({counts.completed})</option>}
                {!usingFallback && <option value="cancelled">Canceladas ({counts.cancelled})</option>}
              </select>
            </label>
          </div>

          {filteredTasks.length === 0 && <div className="empty">Nenhuma tarefa encontrada com os filtros atuais.</div>}

          {filteredTasks.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Registro</th>
                  <th>Fluxo</th>
                  <th>Status</th>
                  <th>Etapa atual</th>
                  <th>Atualizado</th>
                  <th>Acao</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map(({ item, currentStep, status, completedByUser, canExecute }) => (
                  <tr key={item.id}>
                    <td>
                      <Link className="code" href={`/execucoes/${item.id}`}>{item.code}</Link>
                      {completedByUser && <div className="section-copy" style={{ marginTop: 4 }}>Voce ja atuou neste registro</div>}
                    </td>
                    <td>{item.flowName}</td>
                    <td>
                      <span className={`badge ${status.key}`}>{status.label}</span>
                    </td>
                    <td>{currentStep?.name ?? (status.key === "completed" ? "Fluxo concluido" : "Sem etapa manual")}</td>
                    <td>{new Date(item.updatedAt).toLocaleString("pt-BR")}</td>
                    <td>
                      <Link className="btn btn-primary" href={`/execucoes/${item.id}`}>
                        {canExecute ? <PlayCircle size={16} /> : <Eye size={16} />}
                        {canExecute ? "Executar" : "Ver"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  </>;
}
