import type{Progress}from"@/lib/types";
export function Trail({steps}:{steps:Progress[]}){return <div className="trail" aria-label="Progresso do fluxo">{steps.map(s=><div key={s.id} title={s.name} className={`trail-item ${s.status===2?"done":s.status===1?"current":""}`}><span>{s.name.length>19?s.name.slice(0,17)+"…":s.name}</span></div>)}</div>}
