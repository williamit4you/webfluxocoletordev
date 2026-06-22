"use client";

import { useAuth } from "@/components/Auth";
import { api } from "@/lib/api";
import type { Flow } from "@/lib/types";
import { PencilLine, Plus, Workflow } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function FlowsPage() {
  const { user } = useAuth();
  const [flows, setFlows] = useState<Flow[]>([]);

  useEffect(() => {
    api<Flow[]>("/flows").then(setFlows);
  }, []);

  return <>
    <div className="pagehead">
      <div>
        <span className="eyebrow">Configuração</span>
        <h1 className="title">Fluxos</h1>
        <p className="subtitle">Processos disponíveis, etapas configuradas e integrações vinculadas.</p>
      </div>
      {user?.role === "SuperAdmin" && <Link href="/fluxos/novo" className="btn btn-primary"><Plus size={17} />Criar fluxo</Link>}
    </div>

    <div className="flow-grid">
      {flows.map(flow =>
        <article className="card flow-card" key={flow.id}>
          <div className="flow-card-top">
            <span className={`badge ${flow.active ? "completed" : "cancelled"}`}>{flow.active ? "Ativo" : "Inativo"}</span>
            {user?.role === "SuperAdmin" && <Link className="icon-btn" href={`/fluxos/${flow.id}`}><PencilLine size={16} /></Link>}
          </div>
          <Workflow color="#176b51" />
          <h2 className="section-title" style={{ marginTop: 14 }}>{flow.name}</h2>
          <p className="section-copy">{flow.description}</p>
          <div className="flow-card-metrics">
            <span>{flow.steps.length} etapa(s)</span>
            <span>{flow.steps.reduce((sum, step) => sum + step.fields.length, 0)} campo(s)</span>
            <span>{flow.tokens.length} token(s)</span>
          </div>
        </article>)}
    </div>
  </>;
}
