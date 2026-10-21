// Copiar dentro del proyecto React. Dependencia: socket.io-client.
import { io } from "socket.io-client";
export function createApi(
  baseUrl: string,
  credentials: () => { token?: string; deviceKey?: string },
) {
  const base = baseUrl.replace(/\/$/, "");
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const { token, deviceKey } = credentials();
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(deviceKey ? { "X-Device-Key": deviceKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        Array.isArray(data?.message)
          ? data.message.join("; ")
          : (data?.message ?? `HTTP ${response.status}`),
      );
    return data as T;
  }
  return {
    request,
    login: (nombre_usuario: string, password: string) =>
      request<{ access_token: string }>("/auth/login", "POST", {
        nombre_usuario,
        password,
      }),
    seleccionarRol: (rol: "Admin" | "Operador" | "Orientador" | "Usuario") =>
      request<{access_token:string}>("/auth/seleccionar-rol", "POST", {rol}),
    emitir: (dni: string, id_servicio: number, solicitud_id: string) =>
      request("/turnos", "POST", { dni, id_servicio, solicitud_id }),
    finalizar: (id: number) => request(`/turnos/${id}/finalizar`, "POST", {}),
    derivar: (id: number, id_servicio_destino: number, motivo: string) =>
      request(`/turnos/${id}/derivar`, "POST", { id_servicio_destino, motivo }),
    conectar: () => {
      const { token, deviceKey } = credentials();
      return io(base + "/cola", { auth: token ? { token } : { deviceKey } });
    },
  };
}
// Mantén el JWT en memoria o usa una estrategia de sesión segura del frontend.
// No guardes contraseñas/JWT_SECRET en el cliente.
// Para emitir: const solicitudId=crypto.randomUUID(); conserva ese UUID ante reintentos.
