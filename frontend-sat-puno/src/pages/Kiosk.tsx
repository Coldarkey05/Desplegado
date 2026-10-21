import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket as TicketIcon,
  CheckCircle2,
  Printer,
  ArrowRight,
  Delete,
  RotateCcw,
  Building2,
  Car,
  Wallet,
  FileCheck,
  Search,
  HelpCircle,
} from "lucide-react";
import { api, msg, ApiError } from "../lib/api";
import { useSession, can } from "../lib/session";
import { useLive } from "../lib/live";
import { uuid, dateTime } from "../lib/utils";
import type { Service, Ticket } from "../lib/types";
import {
  Logo,
  Clock,
  Connection,
  ErrorNotice,
  Loading,
  Empty,
  Fullscreen,
} from "../components/ui";
import { PreferenceForm } from "../components/PreferenceForm";
import { DeviceExit } from "./Devices";
type Pending = { dni: string; id_servicio: number; solicitud_id: string };
function ServiceIcon({ name }: { name: string }) {
  return /predial/i.test(name) ? (
    <Building2 />
  ) : /vehic/i.test(name) ? (
    <Car />
  ) : /caja|pago/i.test(name) ? (
    <Wallet />
  ) : /constancia/i.test(name) ? (
    <FileCheck />
  ) : /fiscal/i.test(name) ? (
    <Search />
  ) : (
    <HelpCircle />
  );
}
export function Kiosk({
  deviceKey,
  disconnect,
  orientation = false,
}: {
  orientation?: boolean;
  deviceKey?: string;
  disconnect?: () => void;
}) {
  const { actor } = useSession();
  const live = useLive(deviceKey, !!deviceKey);
  const publicMode = !!deviceKey;
  const emitAllowed = publicMode || can(actor, "tickets.emitir");
  const [preferenceDirty, setPreferenceDirty] = useState(false);
  const slot = publicMode
    ? "sat.pending.device"
    : `sat.pending.staff.${actor?.id_usuario}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const p = JSON.parse(sessionStorage.getItem(slot) || "null");
      return p &&
        /^\d{8}$/.test(p.dni) &&
        Number.isInteger(p.id_servicio) &&
        typeof p.solicitud_id === "string"
        ? p
        : null;
    } catch {
      return null;
    }
  });
  const [dni, setDni] = useState(pending?.dni ?? "");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(!!pending);
  const [seconds, setSeconds] = useState(60);
  const q = useQuery({
    queryKey: [publicMode ? "device-services" : "services"],
    queryFn: ({ signal }) =>
      api<Service[]>("/servicios", {
        signal,
        deviceKey,
        anonymous: publicMode,
      }),
  });
  function reset() {
    setDni("");
    setTicket(null);
    setPending(null);
    setError("");
    setUncertain(false);
    sessionStorage.removeItem(slot);
    setSeconds(60);
  }
  useEffect(() => {
    if (!ticket || !publicMode) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [ticket, publicMode]);
  useEffect(() => {
    if (ticket && seconds <= 0) reset();
  }, [seconds, ticket]);
  async function issue(service: number, retry = false) {
    if (
      !emitAllowed ||
      preferenceDirty ||
      busy ||
      (!retry && pending) ||
      !/^\d{8}$/.test(dni)
    )
      return;
    const body =
      retry && pending
        ? pending
        : { dni, id_servicio: service, solicitud_id: uuid() };
    setPending(body);
    sessionStorage.setItem(slot, JSON.stringify(body));
    setBusy(true);
    setError("");
    setUncertain(false);
    try {
      const t = await api<Ticket>("/turnos", {
        method: "POST",
        body,
        deviceKey,
        anonymous: publicMode,
      });
      setTicket(t);
      setDni("");
      setPending(null);
      sessionStorage.removeItem(slot);
      setSeconds(60);
    } catch (e) {
      setError(msg(e));
      if (e instanceof ApiError && e.status > 0 && e.status < 500) {
        setPending(null);
        sessionStorage.removeItem(slot);
      } else setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  const selected = q.data?.find((s) => s.id_servicio === ticket?.id_servicio);
  return (
    <div className={publicMode ? "kiosk-page" : "staff-emission"}>
      {publicMode ? (
        <header className="public-header">
          <Logo sub="Atención al contribuyente" />
          <div className="actions">
            <Connection state={live} />
            <Clock />
            <Fullscreen />
          </div>
        </header>
      ) : (
        <div className="page-heading">
          <div>
            <span className="eyebrow">ATENCIÓN AL CONTRIBUYENTE</span>
            <h1>
              {orientation ? "Tickets y preferencias" : "Emitir un ticket"}
            </h1>
            <p>Ingresa el DNI y selecciona el servicio solicitado.</p>
          </div>
        </div>
      )}
      <main className="kiosk-grid">
        <section className="kiosk-input">
          <div className="kiosk-heading">
            <span className="eyebrow">BIENVENIDO AL SAT PUNO</span>
            <h1>Solicita tu turno</h1>
            <p>Solo necesitas tu DNI y elegir una operación.</p>
          </div>
          <div className="step-label">
            <span>1</span>
            <h2>Ingresa tu DNI</h2>
          </div>
          <label className="dni-field">
            <span className="sr-only">Número de DNI</span>
            <input
              value={dni}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              autoComplete="off"
              placeholder="_ _ _ _ _ _ _ _"
              disabled={busy || !!ticket || !!pending}
              onChange={(e) =>
                setDni(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
            />
            <small>8 dígitos · Sin espacios ni guiones</small>
          </label>
          {publicMode && (
            <div className="keypad" aria-label="Teclado numérico">
              {[
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "Limpiar",
                "0",
                "Borrar",
              ].map((k) => (
                <button
                  className={k.length > 1 ? "key-action" : ""}
                  key={k}
                  disabled={busy || !!ticket || !!pending}
                  aria-label={k === "Borrar" ? "Borrar último dígito" : k}
                  onClick={() =>
                    setDni((d) =>
                      k === "Limpiar"
                        ? ""
                        : k === "Borrar"
                          ? d.slice(0, -1)
                          : (d + k).slice(0, 8),
                    )
                  }
                >
                  {k === "Borrar" ? <Delete size={20} /> : k}
                </button>
              ))}
            </div>
          )}
          {(error || q.error) && (
            <ErrorNotice
              error={error || msg(q.error)}
              retry={q.error ? () => void q.refetch() : undefined}
            />
          )}{" "}
          {uncertain && pending && (
            <div className="info-note">
              <p>
                No se ha confirmado el resultado de la emisión. Reintenta para
                recuperar el mismo ticket sin duplicarlo.
              </p>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void issue(pending.id_servicio, true)}
              >
                <RotateCcw size={18} />
                Reintentar emisión
              </button>
            </div>
          )}
          {!publicMode && can(actor, "preferencias.asignar") && (
            <PreferenceForm
              key={dni}
              dni={dni}
              disabled={busy || !!ticket || !!pending}
              onDirty={setPreferenceDirty}
            />
          )}
          {!emitAllowed && (
            <div className="info-note">
              Tu cuenta no tiene habilitada la emisión de tickets. Puedes usar
              los apartados autorizados en el menú.
            </div>
          )}
          <div className="step-label">
            <span>2</span>
            <h2>Elige tu operación</h2>
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.data?.length ? (
            <div className="service-buttons">
              {q.data.map((s) => (
                <button
                  key={s.id_servicio}
                  className="service-button"
                  disabled={
                    !emitAllowed ||
                    preferenceDirty ||
                    dni.length !== 8 ||
                    busy ||
                    !!ticket ||
                    !!pending ||
                    !!q.error
                  }
                  onClick={() => void issue(s.id_servicio)}
                >
                  <ServiceIcon name={s.nombre_servicio} />
                  <strong>{s.nombre_servicio}</strong>
                  <ArrowRight size={20} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="No hay servicios disponibles"
              text="Por favor, consulta con el personal de orientación."
            />
          )}
          {busy && (
            <p className="issuing" role="status">
              Generando tu ticket…
            </p>
          )}
        </section>
        <aside className={"receipt-panel " + (ticket ? "issued" : "")}>
          <div className="receipt" id="print-ticket">
            {ticket ? (
              <>
                <CheckCircle2 className="receipt-check" size={40} />
                <h2>¡Tu turno está listo!</h2>
                <p>SAT PUNO</p>
                <span className="receipt-label">TU NÚMERO DE TURNO ES</span>
                <strong className="receipt-number" data-testid="issued-ticket">
                  {ticket.codigo_ticket}
                </strong>
                <h3>
                  {selected?.nombre_servicio ??
                    `Servicio #${ticket.id_servicio}`}
                </h3>
                <div className="receipt-divider" />
                <p>{dateTime(ticket.fecha_hora_emision)}</p>
                <small>Ticket #{ticket.id_turno}</small>
                <div className="receipt-instruction">
                  Conserva tu ticket y espera el llamado en la pantalla de
                  atención.
                </div>
              </>
            ) : (
              <>
                <div className="receipt-placeholder">
                  <TicketIcon size={55} />
                </div>
                <h2>Aquí aparecerá tu ticket</h2>
                <p>Ingresa tu DNI y selecciona el servicio que necesitas.</p>
                <div className="ticket-sample">— — —</div>
                <small>Tu número te permitirá identificar el llamado.</small>
              </>
            )}
          </div>
          {ticket && (
            <div className="receipt-controls">
              <button
                className="btn primary full"
                onClick={() => {
                  setSeconds(60);
                  window.print();
                }}
              >
                <Printer size={19} />
                Imprimir ticket
              </button>
              <button className="btn full" onClick={reset}>
                Atender a otra persona
                <ArrowRight size={18} />
              </button>
              {publicMode && (
                <small>
                  La pantalla se limpiará en {Math.max(0, seconds)} segundos.
                </small>
              )}
            </div>
          )}
        </aside>
      </main>
      {publicMode && (
        <footer className="public-footer">
          <strong>SAT Puno</strong>
          <span>Una atención ordenada para todos.</span>
          {disconnect && <DeviceExit disconnect={disconnect} />}
        </footer>
      )}
    </div>
  );
}
