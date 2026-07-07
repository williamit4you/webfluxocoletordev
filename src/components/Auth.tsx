"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import type { User } from "@/lib/types";

const Context = createContext<{ user: User | null; logout: () => void }>({
  user: null,
  logout: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const isLoginPage = path === "/login";

  useEffect(() => {
    const rawUser = localStorage.getItem("flowtrack_user");
    const token = localStorage.getItem("flowtrack_token");

    if (rawUser && token) {
      try {
        setUser(JSON.parse(rawUser));
      } catch {
        localStorage.removeItem("flowtrack_user");
        localStorage.removeItem("flowtrack_token");
        setUser(null);
      }
    } else {
      setUser(null);

      if (!isLoginPage) {
        router.replace("/login");
      }
    }

    setReady(true);
  }, [isLoginPage, router]);

  function logout() {
    localStorage.clear();
    setUser(null);
    router.push("/login");
  }

  if (!ready && !isLoginPage) {
    return <div className="empty">Carregando...</div>;
  }

  return <Context.Provider value={{ user, logout }}>{children}</Context.Provider>;
}

export const useAuth = () => useContext(Context);
