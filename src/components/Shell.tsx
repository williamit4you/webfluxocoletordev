"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronRight, FilePlus2, Gauge, ListChecks, LogOut, Menu, Play, Settings2, UserCircle2, Users, Workflow } from "lucide-react";
import { useAuth } from "./Auth";

const items = [
  { href: "/", label: "Visão geral", icon: Gauge },
  { href: "/entrada", label: "Nova entrada", icon: Play },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks },
  { href: "/fluxos", label: "Fluxos", icon: Workflow },
  { href: "/fluxos/novo", label: "Criar fluxo", icon: FilePlus2, roles: ["SuperAdmin"] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: ["SuperAdmin", "Admin"] },
  { href: "/configuracao", label: "Configuração", icon: Settings2, roles: ["SuperAdmin"] }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { user, logout } = useAuth();

  if (path === "/login") return children;

  return <div className="app">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brandmark"><Activity size={19} /></span>It4you Track</Link>
      <div className="nav-label">Operação</div>
      <nav className="nav">
        {items
          .filter(item => !item.roles || item.roles.includes(user?.role || ""))
          .map(item =>
            <Link key={item.href} href={item.href} className={path === item.href || path.startsWith(`${item.href}/`) ? "active" : ""}>
              <item.icon size={18} />
              {item.label}
            </Link>)}
      </nav>
      <div className="userbox">
        <Link href="/minha-conta" className="userbox-link">
          <span className="userbox-head">
            <span>
              <strong>{user?.name}</strong>
              <small>{user?.role?.replace("SuperAdmin", "Super admin")}</small>
            </span>
            <ChevronRight size={16} />
          </span>
          <span className="userbox-copy">Minha conta e senha</span>
        </Link>
        <button className="btn btn-ghost" onClick={logout}><LogOut size={16} /> Sair</button>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <button className="btn btn-ghost mobile-only"><Menu /></button>
        <div><strong>Controle operacional</strong></div>
        <div className="topbar-right">
          <Link href="/minha-conta" className="topbar-user-link">
            <UserCircle2 size={16} />
            {user?.name || "Minha conta"}
          </Link>
          <span className="badge completed">Sistema online</span>
        </div>
      </header>
      <div className="content">{children}</div>
    </main>
  </div>;
}
