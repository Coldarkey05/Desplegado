import { useEffect, useState } from "react";
import { createApi } from "./api-client";
type Snapshot = {
  actuales: {
    id_turno: number;
    codigo_ticket: string;
    numero_modulo: string;
    nombre_servicio: string;
  }[];
  proximos: { codigo_ticket: string; nombre_servicio: string }[];
};
// Ejemplo para dispositivo controlado. En despliegue público usa proxy de dispositivo.
export function PantallaCola({
  server,
  deviceKey,
}: {
  server: string;
  deviceKey: string;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const api = createApi(server, () => ({ deviceKey }));
    let live = true;
    let pending = false;
    let dirty = false;
    const refresh = async () => {
      if (pending) {
        dirty = true;
        return;
      }
      pending = true;
      try {
        const d = await api.request<Snapshot>("/pantalla");
        if (live) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Sin conexión");
      } finally {
        pending = false;
        if (dirty && live) {
          dirty = false;
          void refresh();
        }
      }
    };
    const socket = api.conectar();
    socket.on("connect", refresh);
    socket.on("cola:actualizada", refresh);
    socket.on("connect_error", () => {
      if (live) setError("Reconectando con el servidor…");
    });
    void refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      live = false;
      clearInterval(timer);
      socket.disconnect();
    };
  }, [server, deviceKey]);
  return (
    <main>
      <h1>SAT Puno · Atención al contribuyente</h1>
      {error && <p role="status">{error}</p>}
      {!data && <p>Cargando turnos…</p>}
      {data?.actuales.map((t) => (
        <section key={t.id_turno}>
          <p>Turno</p>
          <strong style={{ fontSize: 72 }}>{t.codigo_ticket}</strong>
          <p>Diríjase a</p>
          <h2>{t.numero_modulo}</h2>
          <p>{t.nombre_servicio}</p>
        </section>
      ))}
      {data && data.actuales.length === 0 && <p>Esperando próximo llamado</p>}
      <h2>Próximos</h2>
      <ul>
        {data?.proximos.map((t, i) => (
          <li key={i}>
            {t.codigo_ticket} · {t.nombre_servicio}
          </li>
        ))}
      </ul>
    </main>
  );
}
