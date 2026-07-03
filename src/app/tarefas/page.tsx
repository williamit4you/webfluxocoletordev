"use client";

import { api } from "@/lib/api";
import { useAuth } from "@/components/Auth";
import type { Instance } from "@/lib/types";
import { LoaderCircle, PlayCircle, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PendingTasksResponse = {
  items: Instance[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type TaskFilter = "pending" | "executed" | "all";

export default function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(Number(searchParams.get("page") ?? "1"));
  const [pageSize, setPageSize] = useState(Number(searchParams.get("pageSize") ?? "10"));
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<TaskFilter>((searchParams.get("statusFilter") as TaskFilter) || "pending");
  const [totalCount, setTotalCount] = useState(0);
  const [launchingTaskId, setLaunchingTaskId] = useState("");
  const focusInstanceId = searchParams.get("focusInstance") ?? "";
  const focusedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    setLoading(true);
    api<PendingTasksResponse>(`/instances/pending-tasks?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}&statusFilter=${statusFilter}`)
      .then(result => {
        setRows(result.items);
        setTotalCount(result.totalCount);
        setError("");
      })
      .catch(fetchError => {
        setError(fetchError instanceof Error ? fetchError.message : "Não foi possível carregar as tarefas.");
      })
      .finally(() => setLoading(false));
  }, [page, pageSize, search, statusFilter]);

  const tasks = useMemo(() => rows.map(item => {
    const currentStep = item.steps.find(step => step.id === item.currentStepExecutionId) ?? item.steps.find(step => step.status === 1);
    const completedByUser = !!user?.id && item.steps.some(step => step.completedByUserId === user.id);
    const canExecute = item.status === 0 && !!currentStep && !currentStep.isAutomatic && currentStep.status === 1;

    return {
      item,
      currentStep,
      completedByUser,
      canExecute
    };
  }), [rows, user?.id]);

  useEffect(() => {
    if (!focusInstanceId || !focusedRowRef.current) {
      return;
    }

    focusedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusInstanceId, tasks.length]);

  function buildExecutionHref(instanceId: string) {
    const params = new URLSearchParams();
    if (search) {
      params.set("search", search);
    }
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("statusFilter", statusFilter);
    params.set("focusInstance", instanceId);
    return `/execucoes/${instanceId}?returnTo=${encodeURIComponent(`/tarefas?${params.toString()}`)}`;
  }

  function openTask(instanceId: string) {
    setLaunchingTaskId(instanceId);
    router.push(buildExecutionHref(instanceId));
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return <>
    {launchingTaskId && (
      <div className="page-loading-overlay" aria-live="polite" aria-busy="true">
        <div className="page-loading-card card">
          <LoaderCircle size={22} className="spin" />
          <strong>Abrindo tarefa...</strong>
          <span>Estamos preparando a execução selecionada.</span>
        </div>
      </div>
    )}

    <div className="pagehead">
      <div>
        <span className="eyebrow">Operação</span>
        <h1 className="title">Tarefas</h1>
        <p className="subtitle">Acompanhe as tarefas relacionadas a você, com filtros de pendência e paginação para manter a tela rápida.</p>
      </div>
    </div>

    {!loading && !error && (
      <div className="metrics">
        <article className="card metric">
          <div className="label">Total disponível</div>
          <div className="value">{totalCount}</div>
          <div className="hint">tarefas relacionadas</div>
        </article>
        <article className="card metric">
          <div className="label">Nesta página</div>
          <div className="value">{tasks.length}</div>
          <div className="hint">tarefas carregadas</div>
        </article>
        <article className="card metric">
          <div className="label">Página atual</div>
          <div className="value">{page}</div>
          <div className="hint">de {totalPages}</div>
        </article>
        <article className="card metric">
          <div className="label">Exibição</div>
          <div className="value">{pageSize}</div>
          <div className="hint">itens por página</div>
        </article>
      </div>
    )}

    <section className="card tablewrap">
      {loading && <div className="empty">Carregando tarefas...</div>}
      {error && <div className="error" style={{ margin: 16 }}>{error}</div>}

      {!loading && !error && (
        <>
          <div className="filters">
            <label className="field search">
              <span>Buscar</span>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "var(--muted)" }} />
                <input
                  className="input"
                  style={{ paddingLeft: 38 }}
                  value={search}
                  onChange={e => {
                    setPage(1);
                    setSearch(e.target.value);
                  }}
                  placeholder="Registro, fluxo ou etapa atual"
                />
              </div>
            </label>

            <label className="field" style={{ minWidth: 220 }}>
              <span>Filtro</span>
              <select className="select" value={statusFilter} onChange={e => {
                setPage(1);
                setStatusFilter(e.target.value as TaskFilter);
              }}>
                <option value="pending">Pendentes</option>
                <option value="executed">Executadas</option>
                <option value="all">Todas</option>
              </select>
            </label>

            <label className="field" style={{ minWidth: 220 }}>
              <span>Exibir</span>
              <select className="select" value={pageSize} onChange={e => {
                setPage(1);
                setPageSize(Number(e.target.value));
              }}>
                <option value={10}>10 tarefas</option>
                <option value={30}>30 tarefas</option>
                <option value={50}>50 tarefas</option>
              </select>
            </label>
          </div>

          {tasks.length === 0 && <div className="empty">Nenhuma tarefa encontrada com os filtros atuais.</div>}

          {tasks.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Registro</th>
                  <th>Fluxo</th>
                  <th>Status</th>
                  <th>Etapa atual</th>
                  <th>Atualizado</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(({ item, currentStep, completedByUser, canExecute }) => (
                  <tr
                    key={item.id}
                    ref={focusInstanceId === item.id ? element => {
                      focusedRowRef.current = element;
                    } : null}
                    className={focusInstanceId === item.id ? "row-focus" : ""}
                  >
                    <td>
                      <span className="code">{item.code}</span>
                      {completedByUser && <div className="section-copy" style={{ marginTop: 4 }}>Você já atuou neste registro</div>}
                    </td>
                    <td>{item.flowName}</td>
                    <td>
                      <span className={`badge ${canExecute ? "inprogress" : completedByUser ? "completed" : "cancelled"}`}>
                        {canExecute ? "Pendente" : completedByUser ? "Executada" : "Relacionada"}
                      </span>
                    </td>
                    <td>{currentStep?.name ?? "Sem etapa manual"}</td>
                    <td>{new Date(item.updatedAt).toLocaleString("pt-BR")}</td>
                    <td>
                      {canExecute ? (
                        <button className="btn btn-primary" type="button" onClick={() => openTask(item.id)} disabled={loading || launchingTaskId === item.id}>
                          {launchingTaskId === item.id ? <LoaderCircle size={16} className="spin" /> : <PlayCircle size={16} />}
                          {launchingTaskId === item.id ? "Abrindo..." : "Executar"}
                        </button>
                      ) : (
                        <span className="section-copy" style={{ margin: 0 }}>Sem ação disponível</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="pagination-bar">
            <span className="section-copy" style={{ margin: 0 }}>
              Mostrando {tasks.length} de {totalCount} tarefas.
            </span>
            <div className="pagination-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1}>
                Anterior
              </button>
              <span className="pagination-page">Página {page} de {totalPages}</span>
              <button className="btn btn-secondary" type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  </>;
}
