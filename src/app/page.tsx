"use client";

import { Trail } from "@/components/Trail";
import { api } from "@/lib/api";
import type { Flow, Instance } from "@/lib/types";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const statusName = ["Em andamento", "Concluído", "Cancelado"];

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Instance[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowId, setFlowId] = useState("");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("statusFilter") ?? "all");
  const [loading, setLoading] = useState(true);
  const focusInstanceId = searchParams.get("focusInstance") ?? "";
  const focusedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    Promise.all([api<Flow[]>("/flows"), api<Instance[]>("/instances")])
      .then(([loadedFlows, loadedRows]) => {
        setFlows(loadedFlows);
        const requestedFlowId = searchParams.get("flowId");
        const resolvedFlowId = requestedFlowId && loadedFlows.some(flow => flow.id === requestedFlowId)
          ? requestedFlowId
          : loadedFlows[0]?.id ?? "";
        setFlowId(resolvedFlowId);
        setRows(loadedRows);
      })
      .finally(() => setLoading(false));
  }, [searchParams]);

  const selectedFlow = flows.find(flow => flow.id === flowId);
  const filtered = useMemo(() => {
    const startDateValue = startDate ? new Date(`${startDate}T00:00:00`) : null;

    return rows.filter(row =>
      row.flowDefinitionId === flowId &&
      (!search || row.code.toLowerCase().includes(search.toLowerCase())) &&
      (!startDateValue || new Date(row.createdAt) >= startDateValue) &&
      (statusFilter === "all" || String(row.status) === statusFilter));
  }, [flowId, rows, search, startDate, statusFilter]);

  useEffect(() => {
    if (!focusInstanceId || !focusedRowRef.current) {
      return;
    }

    focusedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusInstanceId, filtered.length]);

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
        <div className="value">{filtered.filter(item => item.status === 0).length}</div>
        <div className="hint">neste fluxo</div>
      </div>
      <div className="card metric">
        <div className="label">Concluídos</div>
        <div className="value">{filtered.filter(item => item.status === 1).length}</div>
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
        <select className="select" value={flowId} onChange={e => setFlowId(e.target.value)}>
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

    <div className="card tablewrap">
      {loading && <div className="empty">Carregando operação...</div>}
      {!loading && !flowId && <div className="empty">Nenhum fluxo disponível.</div>}
      {!loading && flowId && filtered.length === 0 && <div className="empty"><strong>Nenhum registro encontrado.</strong><br />Inicie uma nova entrada para este fluxo.</div>}
      {!loading && filtered.length > 0 &&
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
            {filtered.map(row =>
              <tr
                key={row.id}
                ref={focusInstanceId === row.id ? element => {
                  focusedRowRef.current = element;
                } : null}
                className={focusInstanceId === row.id ? "row-focus" : ""}
              >
                <td><Link className="code" href={buildExecutionHref(row.id)}>{row.code}</Link></td>
                <td><span className={`badge ${row.status === 0 ? "inprogress" : row.status === 1 ? "completed" : "cancelled"}`}>{statusName[row.status]}</span></td>
                <td><Trail steps={row.steps} /></td>
                <td>{new Date(row.updatedAt).toLocaleDateString("pt-BR")}</td>
              </tr>)}
          </tbody>
        </table>}
    </div>
  </>;
}
