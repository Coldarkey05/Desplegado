import { QueryClient } from "@tanstack/react-query";
export const API = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "");
export const SOCKET = (
  import.meta.env.VITE_SOCKET_URL || new URL(API, window.location.origin).origin
).replace(/\/$/, "");
export const POLL =
  Math.max(5, Number(import.meta.env.VITE_POLL_SECONDS) || 15) * 1000;
export const MAX_CALLS = Math.max(
  1,
  Number(import.meta.env.VITE_MAX_CALL_ATTEMPTS) || 3,
);
export const sessionKey = "sat.session";
export function token() {
  try {
    return JSON.parse(sessionStorage.getItem(sessionKey) || "null")?.token as
      string | undefined;
  } catch {
    return undefined;
  }
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Options = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  deviceKey?: string;
  anonymous?: boolean;
};
export async function api<T = any>(
  path: string,
  options: Options = {},
): Promise<T> {
  const auth = !options.anonymous && !options.deviceKey ? token() : undefined;
  const timeout = AbortSignal.timeout(18000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: options.method ?? "GET",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + auth } : {}),
        ...(options.deviceKey ? { "X-Device-Key": options.deviceKey } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  } catch (e) {
    if (options.signal?.aborted) throw e;
    throw new ApiError(
      0,
      "No se pudo conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.",
    );
  }
  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { message: raw };
  }
  if (!res.ok) {
    if (res.status === 403 && auth && token() === auth)
      window.dispatchEvent(new Event("sat:permissions"));
    if (res.status === 401 && auth && token() === auth)
      window.dispatchEvent(new Event("sat:expired"));
    throw new ApiError(
      res.status,
      res.status === 429
        ? "Demasiadas solicitudes. Espera un momento."
        : Array.isArray(data?.message)
          ? data.message.join(" · ")
          : (data?.message || `Error ${res.status}`) +
            (res.status >= 500 && data?.requestId
              ? ` Referencia: ${data.requestId}`
              : ""),
    );
  }
  return data;
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      refetchOnWindowFocus: true,
      retry: (count, e) =>
        e instanceof ApiError && e.status >= 400 && e.status < 500
          ? false
          : count < 1,
      refetchInterval: POLL,
    },
    mutations: { retry: false },
  },
});
export const refresh = () =>
  queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] !== "session",
  });
export async function catalogAll(resource: string, signal?: AbortSignal) {
  const rows: any[] = [];
  for (let page = 1; ; page++) {
    const result = await api<{ items: any[]; total: number }>(
      `/admin/${resource}?page=${page}&limit=100`,
      { signal },
    );
    rows.push(...result.items);
    if (rows.length >= result.total || !result.items.length) break;
  }
  return rows;
}
export const msg = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar la operación";
