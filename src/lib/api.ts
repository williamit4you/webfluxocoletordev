const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("flowtrack_token") : null;
  const headers = new Headers(options.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE}${path}`, { ...options, headers, cache: "no-store" });

  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.clear();
    window.location.href = "/login";
    throw new Error("Sessao expirada");
  }

  if (!response.ok) {
    let message = response.status === 403 ? "Acesso negado." : "Nao foi possivel concluir a operacao.";

    try {
      const body = await response.json();
      const firstError = body.errors ? Object.values(body.errors)[0] as string[] : null;
      message = body.message || firstError?.[0] || body.title || message;
    } catch {
      // Keep fallback message when the response body is not JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
