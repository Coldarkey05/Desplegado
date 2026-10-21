import { useState, useEffect, type ReactNode, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Monitor, Ticket, ArrowLeft, LogOut } from "lucide-react";
import { api, msg, queryClient } from "../lib/api";
import type { DeviceMode } from "../lib/types";
import { Logo, ErrorNotice } from "../components/ui";
export function DeviceGate({
  mode,
  children,
}: {
  mode: DeviceMode;
  children: (key: string, disconnect: () => void) => ReactNode;
}) {
  const slot = `sat.device.${mode}`;
  const [key, setKey] = useState(() => sessionStorage.getItem(slot) || "");
  function disconnect() {
    sessionStorage.removeItem(slot);
    sessionStorage.removeItem("sat.pending.device");
    setKey("");
    queryClient.removeQueries({
      predicate: (q) => String(q.queryKey[0]).startsWith("device"),
    });
  }
  return key ? (
    <>{children(key, disconnect)}</>
  ) : (
    <SetupDevice
      mode={mode}
      onReady={(value) => {
        sessionStorage.setItem(slot, value);
        setKey(value);
      }}
    />
  );
}
function SetupDevice({
  mode,
  onReady,
}: {
  mode: DeviceMode;
  onReady: (key: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(mode === "kiosco" ? "/servicios" : "/pantalla", {
        deviceKey: value.trim(),
        anonymous: true,
      });
      onReady(value.trim());
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="device-setup">
      <div className="device-setup-card">
        <Logo sub="Configuración del equipo" />
        <div className="setup-icon">
          {mode === "kiosco" ? <Ticket size={32} /> : <Monitor size={32} />}
        </div>
        <h1>
          {mode === "kiosco"
            ? "Habilitar kiosco de turnos"
            : "Habilitar pantalla de atención"}
        </h1>
        <p className="muted">
          Solicita al administrador que active este equipo. Después quedará
          listo para atender al público en esta pestaña.
        </p>
        <form onSubmit={submit}>
          <label>
            Clave del dispositivo
            <div className="input-with-icon">
              <KeyRound size={18} />
              <input
                type="password"
                required
                minLength={32}
                autoComplete="off"
                value={value}
                disabled={busy}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Ingresa la clave asignada"
              />
            </div>
          </label>
          {error && <ErrorNotice error={error} />}
          <button className="btn primary full" disabled={busy}>
            {busy ? "Verificando…" : "Habilitar equipo"}
          </button>
        </form>
        <Link to="/login" className="text-link">
          <ArrowLeft size={16} />
          Volver al ingreso del personal
        </Link>
      </div>
    </main>
  );
}
export function DeviceExit({ disconnect }: { disconnect: () => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 7000);
    return () => clearTimeout(t);
  }, [confirm]);
  return (
    <button
      className="device-exit"
      title="Desactivar equipo"
      onClick={() => (confirm ? disconnect() : setConfirm(true))}
    >
      <LogOut size={16} />
      {confirm ? "Confirmar desactivación" : "Desactivar equipo"}
    </button>
  );
}
