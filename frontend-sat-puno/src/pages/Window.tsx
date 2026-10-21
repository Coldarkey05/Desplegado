import { can, useSession } from "../lib/session";
import { useState, useEffect, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Ticket,
  CheckCircle2,
  GitBranch,
  Volume2,
  ArrowRight,
  Power,
  UserRound,
  AlertTriangle,
  History,
} from "lucide-react";
import { api, msg, refresh, MAX_CALLS } from "../lib/api";
import type { WindowState, Service, Ticket as TicketType } from "../lib/types";
import {
  Stat,
  ErrorNotice,
  Loading,
  Empty,
  Badge,
  Modal,
  Confirm,
  useToast,
} from "../components/ui";
import { dateTime, time } from "../lib/utils";
import { HistoryModal } from "./Records";
function Elapsed({ since }: { since?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = since
    ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000))
    : 0;
  return (
    <span className="elapsed">
      <Clock size={16} />
      {String(Math.floor(s / 60)).padStart(2, "0")}:
      {String(s % 60).padStart(2, "0")}
    </span>
  );
}
export function WindowPage() {
  const { actor } = useSession();
  const editAssignment = can(actor, "ventanilla.asignacion");
  const query = useQuery({
    queryKey: ["window"],
    queryFn: ({ signal }) => api<WindowState>("/ventanilla", { signal }),
  });
  const services = useQuery({
    queryKey: ["services"],
    queryFn: ({ signal }) => api<Service[]>("/servicios", { signal }),
  });
  const assignment = useQuery({
    queryKey: ["window-assignment"],
    queryFn: ({ signal }) =>
      api<{
        id_modulo_actual: number | null;
        modulos: {
          id_modulo: number;
          numero_modulo: string;
          id_servicio_principal: number | null;
          servicios_ids: number[];
          estado: string;
          disponible_para_asignar: boolean;
        }[];
        servicios: { id_servicio: number; nombre_servicio: string }[];
      }>("/ventanilla/asignacion", { signal }),
  });
  const [moduleId, setModuleId] = useState("");
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const assignedId = assignment.data?.id_modulo_actual;
  const assignedService =
    assignment.data?.modulos
      .find((m) => m.id_modulo === assignedId)
      ?.servicios_ids.join(",") ?? "";
  useEffect(() => {
    setModuleId(assignedId ? String(assignedId) : "");
    setServiceIds(
      assignedService ? assignedService.split(",").map(Number) : [],
    );
  }, [assignedId, assignedService]);
  const [action, setAction] = useState<{
    name: string;
    ticket: TicketType;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dest, setDest] = useState("");
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<number | null>(null);
  const [endShift, setEndShift] = useState(false);
  const [closeModule, setCloseModule] = useState(false);
  const toast = useToast();
  const data = query.data;
  const t = data?.turno_actual;
  async function changeMode(automatic: boolean) {
    setBusy(true);
    setError("");
    try {
      await api("/ventanilla/modo", {
        method: "PATCH",
        body: { atencion_automatica: automatic },
      });
      await refresh();
      toast(
        automatic
          ? "Atención automática activada"
          : "Modo manual activado. Pulsa Llamar siguiente para recibir un turno.",
      );
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(name: string, id?: number, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await api(id ? `/turnos/${id}/${name}` : `/ventanilla/${name}`, {
        method: "POST",
        body,
      });
      await refresh();
      setAction(null);
      setCloseModule(false);
      setEndShift(false);
      toast(
        name === "finalizar"
          ? data?.modulo?.atencion_automatica
            ? "Atención finalizada. La cola continúa automáticamente."
            : "Atención finalizada. Pulsa Llamar siguiente cuando estés listo."
          : "Operación realizada",
      );
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveAssignment(e: FormEvent) {
    e.preventDefault();
    if (!editAssignment) return;
    setBusy(true);
    setError("");
    try {
      await api("/ventanilla/asignacion", {
        method: "PATCH",
        body: { id_modulo: Number(moduleId), servicios_ids: serviceIds },
      });
      await refresh();
      toast("Asignación guardada. Abre la ventanilla cuando estés listo.");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  function choose(name: string) {
    if (!t) return;
    setError("");
    setDest("");
    setReason("");
    setAction({ name, ticket: t });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (action)
      void run(action.name, action.ticket.id_turno, {
        motivo: reason,
        ...(action.name === "derivar"
          ? { id_servicio_destino: Number(dest) }
          : {}),
      });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ATENCIÓN AL CONTRIBUYENTE</span>
          <h1>Mi ventanilla</h1>
          <p>
            {data?.modulo?.numero_modulo ?? "Tu módulo asignado"} ·{" "}
            {services.data
              ?.filter((s) =>
                data?.modulo?.servicios_ids?.includes(s.id_servicio),
              )
              .map((s) => s.nombre_servicio)
              .join(" · ") || "Servicios de atención"}
          </p>
        </div>
        {data?.modulo && (
          <div className="actions">
            <Badge value={data.modulo.estado} />
            <button
              className="btn"
              disabled={busy || data.retiro_pendiente}
              onClick={() => {
                setError("");
                setEndShift(true);
              }}
            >
              {data.retiro_pendiente ? "Salida pendiente" : "Dejar de atender"}
            </button>
            {data.modulo.estado === "Cerrado" ? (
              <button
                className="btn primary"
                disabled={busy || !!query.error || data.retiro_pendiente}
                onClick={() => void run("abrir")}
              >
                <Power size={17} />
                Abrir ventanilla
              </button>
            ) : (
              <button
                className="btn"
                disabled={busy || !!t || !!query.error}
                onClick={() => {
                  setError("");
                  setCloseModule(true);
                }}
              >
                <Power size={17} />
                Cerrar ventanilla
              </button>
            )}
          </div>
        )}
      </div>
      {data?.retiro_pendiente && (
        <div className="info-note">
          Tu salida está programada. Termina o deriva el turno actual; no
          recibirás otro y el módulo quedará libre para el siguiente operador.
        </div>
      )}
      {data && !data.modulo && (
        <div className="info-note">
          No estás atendiendo en ningún módulo. Selecciona uno libre, guarda tu
          asignación y abre la ventanilla.
        </div>
      )}
      {data?.modulo && (
        <section className="panel">
          <div className="panel-body">
            <label>
              Modo de atención
              <select
                aria-label="Modo de atención"
                value={
                  data.modulo.atencion_automatica ? "automatico" : "manual"
                }
                disabled={busy || !!query.error || data.retiro_pendiente}
                onChange={(e) =>
                  void changeMode(e.target.value === "automatico")
                }
              >
                <option value="automatico">Automático</option>
                <option value="manual">Manual · llamar siguiente</option>
              </select>
            </label>
            <p className="inline-help">
              {data.modulo.atencion_automatica
                ? "La ventanilla recibe el siguiente turno automáticamente al quedar libre."
                : "Los turnos esperan hasta que pulses Llamar siguiente. Después puedes iniciar la atención cuando llegue la persona."}{" "}
              El modo se guarda para esta ventanilla. Cambiarlo conserva el
              turno actual.
            </p>
          </div>
        </section>
      )}
      {assignment.data && (
        <section className="panel assignment-panel">
          <div className="panel-header">
            <div>
              <h2>Módulo y servicios</h2>
              <p>
                Elige dónde atenderás y qué servicios brindará esa ventanilla.
              </p>
            </div>
          </div>
          <form className="assignment-form" onSubmit={saveAssignment}>
            <label>
              Módulo de atención
              <select
                aria-label="Módulo de atención"
                value={moduleId}
                required
                disabled={busy || !!t || !editAssignment}
                onChange={(e) => {
                  setModuleId(e.target.value);
                  const m = assignment.data?.modulos.find(
                    (m) => m.id_modulo === Number(e.target.value),
                  );
                  setServiceIds(m?.servicios_ids ?? []);
                }}
              >
                <option value="">Selecciona un módulo</option>
                {assignment.data.modulos.map((m) => (
                  <option
                    key={m.id_modulo}
                    value={m.id_modulo}
                    disabled={!m.disponible_para_asignar}
                  >
                    {m.numero_modulo}
                    {!m.disponible_para_asignar ? " · No disponible" : ""}
                  </option>
                ))}
              </select>
            </label>
            <fieldset
              className="service-checks"
              disabled={busy || !!t || !editAssignment}
            >
              <legend>Servicios de atención</legend>
              {assignment.data.servicios.map((s) => (
                <label className="check-field" key={s.id_servicio}>
                  <input
                    type="checkbox"
                    checked={serviceIds.includes(s.id_servicio)}
                    onChange={(e) =>
                      setServiceIds(
                        e.target.checked
                          ? [...serviceIds, s.id_servicio]
                          : serviceIds.filter((id) => id !== s.id_servicio),
                      )
                    }
                  />
                  {s.nombre_servicio}
                </label>
              ))}
            </fieldset>
            <button
              className="btn primary"
              type="submit"
              disabled={
                busy ||
                !editAssignment ||
                !!t ||
                !moduleId ||
                !serviceIds.length ||
                (Number(moduleId) === assignedId &&
                  [...serviceIds].sort((a, b) => a - b).join(",") ===
                    assignedService
                      .split(",")
                      .map(Number)
                      .sort((a, b) => a - b)
                      .join(","))
              }
            >
              Guardar asignación
            </button>
          </form>
          <p className="assignment-help">
            {t
              ? "Finaliza o deriva el turno actual para cambiar tu asignación."
              : "Al guardar, la ventanilla queda cerrada. Ábrela para recibir tickets de los servicios seleccionados. No se puede ocupar un módulo de otro usuario ni cambiar uno con derivaciones pendientes."}
          </p>
        </section>
      )}
      {assignment.error && (
        <ErrorNotice
          error={msg(assignment.error)}
          retry={() => void refresh()}
        />
      )}
      {((query.error && assignedId !== null) || services.error) && (
        <ErrorNotice
          error={msg(query.error || services.error)}
          retry={() => void refresh()}
        />
      )}{" "}
      {error && !action && !closeModule && !endShift && (
        <ErrorNotice error={error} />
      )}
      {query.isPending ? (
        <Loading />
      ) : (
        data?.modulo && (
          <>
            <div className="stats">
              <Stat
                title="En espera"
                value={data.en_espera}
                icon={<Clock />}
                detail="Para este módulo"
              />
              <Stat
                title="En atención"
                value={t ? 1 : 0}
                icon={<Ticket />}
                detail="Turno actual"
              />
              <Stat
                title="Finalizados hoy"
                value={data.finalizados_hoy}
                icon={<CheckCircle2 />}
              />
              <Stat
                title="Derivados hoy"
                value={data.derivados_hoy}
                icon={<GitBranch />}
              />
            </div>
            <div className="attention-grid">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Cola de atención</h2>
                    <p>Prioridad y orden de espera de tu servicio.</p>
                  </div>
                  <span className="count-chip">{data.en_espera}</span>
                </div>
                {!data.modulo.atencion_automatica && (
                  <div className="queue-call-action">
                    <button
                      className="btn primary"
                      disabled={
                        busy ||
                        !!query.error ||
                        !!t ||
                        data.modulo.estado !== "Disponible" ||
                        data.retiro_pendiente ||
                        !data.en_espera
                      }
                      onClick={() => void run("llamar-siguiente")}
                    >
                      <Volume2 size={18} />
                      Llamar siguiente
                    </button>
                    <p className="inline-help">
                      {t
                        ? "Termina la atención actual antes de llamar otro turno."
                        : data.modulo.estado !== "Disponible" ||
                            data.retiro_pendiente
                          ? "Abre la ventanilla y verifica que no tengas una salida pendiente."
                          : !data.en_espera
                            ? "No hay turnos en espera para esta ventanilla."
                            : "Llama al siguiente contribuyente según la prioridad de la cola."}
                    </p>
                  </div>
                )}
                <div className="waiting-list">
                  {data.proximos.length ? (
                    data.proximos.map((r, i) => (
                      <div className="waiting-item" key={r.id_turno}>
                        <span className="position">{i + 1}</span>
                        <div>
                          <strong>{r.codigo_ticket}</strong>
                          {(r.prioridad ?? 0) > 0 && (
                            <span className="badge warning">Preferencial</span>
                          )}
                          <small>Emitido {time(r.fecha_hora_emision)}</small>
                        </div>
                        <Badge value={r.estado} />
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="Sin turnos pendientes"
                      text="Los nuevos turnos aparecerán aquí automáticamente."
                    />
                  )}
                </div>
                <p className="panel-note">
                  Se muestran hasta 10 próximos turnos. El siguiente llamado
                  respeta la prioridad y el orden de espera.
                </p>
              </section>
              <section className="panel current-attention">
                <div className="panel-header">
                  <div>
                    <h2>Atención actual</h2>
                    <p>Acciones para el contribuyente asignado.</p>
                  </div>
                  {t && <Elapsed since={t.fecha_hora_inicio_atencion} />}
                </div>
                {t ? (
                  <div className="panel-body">
                    <div className="current-ticket-header">
                      <span className="eyebrow">TURNO ASIGNADO</span>
                      <Badge value={t.estado} />
                    </div>
                    <div
                      className="operator-ticket"
                      data-testid="current-ticket"
                    >
                      {t.codigo_ticket}
                    </div>
                    <div className="contributor">
                      <div className="avatar">
                        <UserRound />
                      </div>
                      <div>
                        <strong>
                          {t.contribuyente
                            ? `${t.contribuyente.nombres} ${t.contribuyente.apellidos}`
                            : "Sin contribuyente asociado"}
                        </strong>
                        <span>DNI: {t.contribuyente?.dni ?? "—"}</span>
                      </div>
                      {(t.prioridad ?? 0) > 0 && (
                        <span className="badge info">Preferencial</span>
                      )}
                    </div>
                    <div className="attention-meta">
                      <span>
                        Emisión<strong>{dateTime(t.fecha_hora_emision)}</strong>
                      </span>
                      <span>
                        Llamados
                        <strong>
                          {t.intentos_llamado ?? 0} de {MAX_CALLS}
                        </strong>
                      </span>
                    </div>
                    <div className="attention-actions">
                      {t.estado === "LLAMADO" ? (
                        <button
                          className="btn primary"
                          disabled={busy || !!query.error}
                          onClick={() => void run("iniciar", t.id_turno)}
                        >
                          <ArrowRight size={19} />
                          Iniciar atención
                        </button>
                      ) : (
                        <button
                          className="btn success"
                          disabled={busy || !!query.error}
                          onClick={() => choose("finalizar")}
                        >
                          <CheckCircle2 size={19} />
                          Finalizar atención
                        </button>
                      )}
                      <button
                        className="btn purple"
                        disabled={
                          busy ||
                          t.estado !== "EN ATENCION" ||
                          !!query.error ||
                          !!services.error
                        }
                        onClick={() => choose("derivar")}
                      >
                        <GitBranch size={19} />
                        Derivar o cambiar ventanilla
                      </button>
                      <button
                        className="btn"
                        disabled={
                          busy ||
                          (t.intentos_llamado ?? 0) >= MAX_CALLS ||
                          !!query.error
                        }
                        onClick={() => void run("rellamar", t.id_turno)}
                      >
                        <Volume2 size={18} />
                        Volver a llamar
                      </button>
                      <button
                        className="btn warning"
                        disabled={
                          busy ||
                          (t.intentos_llamado ?? 0) < MAX_CALLS ||
                          !!query.error
                        }
                        onClick={() => choose("no-presentado")}
                      >
                        <AlertTriangle size={18} />
                        No se presentó
                      </button>
                    </div>
                    <div className="attention-bottom">
                      <button
                        className="text-link"
                        onClick={() => setHistory(t.id_turno)}
                      >
                        <History size={16} />
                        Ver historial
                      </button>
                      <button
                        className="text-link danger-text"
                        disabled={busy || !!query.error}
                        onClick={() => choose("cancelar")}
                      >
                        Cancelar turno
                      </button>
                    </div>
                  </div>
                ) : (
                  <Empty
                    title={
                      data.modulo.estado === "Cerrado"
                        ? "Ventanilla cerrada"
                        : "Lista para atender"
                    }
                    text={
                      data.modulo.estado === "Cerrado"
                        ? "Abre tu ventanilla para recibir al siguiente contribuyente."
                        : data.modulo.atencion_automatica
                          ? "El siguiente turno se asignará automáticamente cuando llegue."
                          : "Pulsa Llamar siguiente para recibir al próximo contribuyente de la cola."
                    }
                  />
                )}
              </section>
            </div>
          </>
        )
      )}
      {action && ["derivar", "cancelar"].includes(action.name) && (
        <Modal
          title={
            action.name === "derivar" ? "Derivar atención" : "Cancelar turno"
          }
          onClose={() => setAction(null)}
          busy={busy}
        >
          <form onSubmit={submit}>
            <div className="modal-body">
              <p className="form-summary">
                Turno <strong>{action.ticket.codigo_ticket}</strong>
              </p>
              {action.name === "derivar" && (
                <label>
                  Servicio destino
                  <select
                    required
                    value={dest}
                    onChange={(e) => setDest(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">Selecciona un servicio</option>
                    {services.data?.map((s) => (
                      <option value={s.id_servicio} key={s.id_servicio}>
                        {s.nombre_servicio}
                        {s.id_servicio === action.ticket.id_servicio
                          ? " · Otra ventanilla"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Motivo
                <textarea
                  required
                  minLength={3}
                  maxLength={255}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </label>
              {action.name === "derivar" && (
                <p className="info-note">
                  Puedes elegir el mismo servicio para encolar en otra
                  ventanilla. Se excluye la ventanilla de origen y se conserva
                  el ticket; si las demás están ocupadas, espera su turno según
                  prioridad.
                </p>
              )}
              {error && <ErrorNotice error={error} />}
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                type="button"
                onClick={() => setAction(null)}
                disabled={busy}
              >
                Volver
              </button>
              <button
                className={
                  "btn " + (action.name === "derivar" ? "purple" : "danger")
                }
                disabled={busy}
              >
                {busy
                  ? "Procesando…"
                  : action.name === "derivar"
                    ? "Confirmar derivación"
                    : "Cancelar turno"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {action && ["finalizar", "no-presentado"].includes(action.name) && (
        <Confirm
          title={
            action.name === "finalizar"
              ? "Finalizar atención"
              : "Marcar no presentado"
          }
          text={`Se cerrará el turno ${action.ticket.codigo_ticket}. ${data?.retiro_pendiente ? "Tu módulo quedará libre para el relevo." : data?.modulo?.atencion_automatica ? "La cola continuará automáticamente." : "Podrás llamar al siguiente turno cuando estés listo."}`}
          busy={busy}
          error={error}
          onClose={() => setAction(null)}
          onConfirm={() => run(action.name, action.ticket.id_turno)}
        />
      )}
      {endShift && (
        <Confirm
          title="Dejar de atender"
          text={
            t
              ? "Terminarás tu jornada después de resolver el turno actual. No recibirás más tickets y se liberará el módulo automáticamente."
              : "Tu módulo se cerrará y quedará libre para que otro operador lo tome. Los tickets pendientes se conservan."
          }
          busy={busy}
          error={error}
          onClose={() => setEndShift(false)}
          onConfirm={() => run("finalizar-jornada")}
        />
      )}
      {closeModule && (
        <Confirm
          title="Cerrar ventanilla"
          text="Dejarás de recibir turnos hasta volver a abrir la ventanilla."
          busy={busy}
          error={error}
          onClose={() => setCloseModule(false)}
          onConfirm={() => run("cerrar")}
        />
      )}
      {history && (
        <HistoryModal id={history} onClose={() => setHistory(null)} />
      )}
    </>
  );
}
