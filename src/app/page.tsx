"use client";

import { Trail } from "@/components/Trail";
import { api } from "@/lib/api";
import type { DashboardInstancesResult, Flow, Instance } from "@/lib/types";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const statusName = ["Em andamento", "Concluído", "Cancelado"];

function versionLabel(instance: Instance) {
  const version = instance.flowVersionNumber ? `v${instance.flowVersionNumber}` : "versão anterior";
  return instance.isCurrentFlowVersion ? `${version} atual` : `${version} anterior`;
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Instance[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("statusFilter") ?? "all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [loadingFlows, setLoadingFlows] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [warning, setWarning] = useState("");
  const focusInstanceId = searchParams.get("focusInstance") ?? "";
  const focusedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    api<Flow[]>("/flows")
      .then(result => {
        setFlows(result);
        const requestedFlowId = searchParams.get("flowId");
        const resolvedFlowId = requestedFlowId && result.some(flow => flow.id === requestedFlowId)
          ? requestedFlowId
          : result[0]?.id ?? "";
        setFlowId(resolvedFlowId);
      })
      .catch(e => setWarning(e instanceof Error ? e.message : "Não foi possível carregar os fluxos."))
      .finally(() => setLoadingFlows(false));
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [flowId, startDate, statusFilter, pageSize]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    if (!flowId) {
      setRows([]);
      setTotalCount(0);
      setInProgressCount(0);
      setCompletedCount(0);
      setCancelledCount(0);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLoadingRows(true);
      setWarning("");

      const params = new URLSearchParams({
        flowId,
        page: String(page),
        pageSize: String(pageSize)
      });

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (startDate) {
        params.set("startDate", startDate);
      }

      api<DashboardInstancesResult>(`/instances/dashboard?${params.toString()}`)
        .then(result => {
          setRows(result.items);
          setTotalCount(result.totalCount);
          setInProgressCount(result.inProgressCount);
          setCompletedCount(result.completedCount);
          setCancelledCount(result.cancelledCount);
        })
        .catch(e => setWarning(e instanceof Error ? e.message : "Não foi possível carregar os registros."))
        .finally(() => setLoadingRows(false));
    }, search ? 300 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [flowId, page, pageSize, search, startDate, statusFilter]);

  const selectedFlow = flows.find(flow => flow.id === flowId);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    if (!focusInstanceId || !focusedRowRef.current) {
      return;
    }

    focusedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusInstanceId, rows.length]);

  const paginationLabel = useMemo(() => {
    const start = totalCount === 0 ? 0 : ((page - 1) * pageSize) + 1;
    const end = Math.min(page * pageSize, totalCount);
    return `Exibindo ${start}-${end} de ${totalCount}`;
  }, [page, pageSize, totalCount]);

  function buildExecutionHref(instanceId: string) {
    const params = new URLSearchParams();
    if (flowId) {
      params.set("flowId", flowId);
    }
    if (search) {
      params.set("search", search);
    }
    if (startDate) {
      params.set("startDate", startDate);
    }
    if (statusFilter && statusFilter !== "all") {
      params.set("statusFilter", statusFilter);
    }
    params.set("focusInstance", instanceId);

    return `/execucoes/${instanceId}?returnTo=${encodeURIComponent(`/?${params.toString()}`)}`;
  }

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Visão geral</span>
        <h1 className="title">Fluxos em movimento</h1>
        <p className="subtitle">Selecione um fluxo para enxergar a operação com a trilha visual de cada registro.</p>
      </div>
      <Link href="/entrada" className="btn btn-primary"><Plus size={17} />Nova entrada</Link>
    </div>

    <div className="metrics">
      <div className="card metric">
        <div className="label">Fluxo selecionado</div>
        <div className="value">{selectedFlow?.steps.length ?? 0}</div>
        <div className="hint">etapas mapeadas</div>
      </div>
      <div className="card metric">
        <div className="label">Em andamento</div>
        <div className="value">{inProgressCount}</div>
        <div className="hint">neste fluxo</div>
      </div>
      <div className="card metric">
        <div className="label">Concluídos</div>
        <div className="value">{completedCount}</div>
        <div className="hint">neste fluxo</div>
      </div>
      <div className="card metric">
        <div className="label">Tokens</div>
        <div className="value">{selectedFlow?.tokens.length ?? 0}</div>
        <div className="hint">integrações disponíveis</div>
      </div>
    </div>

    <div className="card filters">
      <div className="field" style={{ minWidth: 260 }}>
        <label>Fluxo</label>
        <select className="select" value={flowId} onChange={e => setFlowId(e.target.value)} disabled={loadingFlows || flows.length === 0}>
          {flows.map(flow => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
        </select>
      </div>
      <div className="field" style={{ minWidth: 190 }}>
        <label>Data inicial</label>
        <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
      </div>
      <div className="field" style={{ minWidth: 200 }}>
        <label>Status do processo</label>
        <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Todos</option>
          <option value="0">Em andamento</option>
          <option value="1">Concluído</option>
          <option value="2">Cancelado</option>
        </select>
      </div>
      <div className="field search">
        <label>Buscar registro</label>
        <div style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: "#82908a" }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Código do registro..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
    </div>

    {warning && <div className="error" style={{ marginBottom: 16 }}>{warning}</div>}

    <div className="card tablewrap">
      {(loadingFlows || loadingRows) && <div className="empty">Carregando operação...</div>}
      {!loadingFlows && !flowId && <div className="empty">Nenhum fluxo disponível.</div>}
      {!loadingRows && flowId && rows.length === 0 && <div className="empty"><strong>Nenhum registro encontrado.</strong><br />Inicie uma nova entrada para este fluxo.</div>}
      {!loadingRows && rows.length > 0 && <>
        <table className="table">
          <thead>
            <tr>
              <th>Registro</th>
              <th>Status</th>
              <th style={{ minWidth: 530 }}>Etapas</th>
              <th>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row =>
              <tr
                key={row.id}
                ref={focusInstanceId === row.id ? element => {
                  focusedRowRef.current = element;
                } : null}
                className={focusInstanceId === row.id ? "row-focus" : ""}
              >
                <td>
                  <Link className="code" href={buildExecutionHref(row.id)}>{row.code}</Link>
                  <div className="record-version-line">
                    <span className={`version-chip ${row.isCurrentFlowVersion ? "version-chip-current" : "version-chip-legacy"}`}>
                      {versionLabel(row)}
                    </span>
                    {!row.isCurrentFlowVersion && <span className="version-note">não é o fluxo atual</span>}
                  </div>
                </td>
                <td><span className={`badge ${row.status === 0 ? "inprogress" : row.status === 1 ? "completed" : "cancelled"}`}>{statusName[row.status]}</span></td>
                <td><Trail steps={row.steps} /></td>
                <td>{new Date(row.updatedAt).toLocaleDateString("pt-BR")}</td>
              </tr>)}
          </tbody>
        </table>

        <div className="pagination-bar">
          <div className="pagination-actions">
            <span className="pagination-page">{paginationLabel}</span>
            <label className="pagination-size-control">
              <span>Por página</span>
              <select className="select" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <div className="pagination-actions">
            <button className="btn btn-secondary" type="button" disabled={page <= 1 || loadingRows} onClick={() => setPage(current => current - 1)}>
              Anterior
            </button>
            <span className="pagination-page">Página {page} de {totalPages}</span>
            <button className="btn btn-secondary" type="button" disabled={page >= totalPages || loadingRows} onClick={() => setPage(current => current + 1)}>
              Próxima
            </button>
          </div>
        </div>
      </>}
    </div>
  </>;
}
