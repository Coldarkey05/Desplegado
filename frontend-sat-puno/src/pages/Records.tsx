import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Download, Search } from "lucide-react";
import { useSession, can } from "../lib/session";
import { api, catalogAll, msg, refresh } from "../lib/api";
import type { Row, Page } from "../lib/types";
import { day, dateTime, downloadCsv } from "../lib/utils";
import {
  Modal,
  Loading,
  ErrorNotice,
  Badge,
  Empty,
  Pager,
  useToast,
} from "../components/ui";
export function HistoryModal({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["ticket", id],
    queryFn: ({ signal }) => api(`/turnos/${id}`, { signal }),
  });
  return (
    <Modal title={`Historial del turno #${id}`} onClose={onClose} wide>
      <div className="modal-body">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorNotice error={msg(q.error)} retry={() => void q.refetch()} />
        ) : (
          <>
            <div className="history-title">
              <strong>{q.data.codigo_ticket}</strong>
              <Badge value={q.data.estado} />
            </div>
            <ol className="timeline">
              {q.data.historial.map((h: any) => (
                <li key={h.id}>
                  <i />
                  <div>
                    <strong>{h.estado}</strong>
                    <time>{dateTime(h.fecha)}</time>
                    <p>
                      Servicio #{h.id_servicio}
                      {h.id_modulo ? ` · Módulo #${h.id_modulo}` : ""}
                      {h.id_usuario ? ` · Usuario #${h.id_usuario}` : ""}
                    </p>
                    {h.detalle && <small>{h.detalle}</small>}
                  </div>
                </li>
              ))}
            </ol>
            <h3>Derivaciones</h3>
            {q.data.derivaciones.length ? (
              q.data.derivaciones.map((d: any) => (
                <div className="history-transfer" key={d.id_derivacion}>
                  <strong>
                    Módulo #{d.id_modulo_origen} → Módulo #{d.id_modulo_destino}
                  </strong>
                  <p>{d.motivo ?? "Sin motivo registrado"}</p>
                  <small>{dateTime(d.fecha_hora_derivacion)}</small>
                </div>
              ))
            ) : (
              <p className="muted">Sin derivaciones registradas.</p>
            )}
          </>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
export function Records({
  kind,
}: {
  kind: "turnos" | "derivaciones" | "auditoria";
}) {
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(day());
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [history, setHistory] = useState<number | null>(null);
  const { actor } = useSession();
  const [cancel, setCancel] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const limit = 20;
  const title = {
    turnos: "Control de turnos",
    derivaciones: "Derivaciones",
    auditoria: "Auditoría del sistema",
  }[kind];
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (kind === "turnos") {
    if (date) params.set("fecha", date);
    if (status) params.set("estado", status);
    if (service) params.set("id_servicio", service);
  }
  const q = useQuery({
    queryKey: ["records", kind, params.toString()],
    queryFn: ({ signal }) => api<Page>(`/admin/${kind}?${params}`, { signal }),
  });
  const services = useQuery({
    queryKey: ["all", "servicios"],
    enabled: kind !== "auditoria",
    queryFn: ({ signal }) => api<Row[]>("/opciones/servicios", { signal }),
  });
  const modules = useQuery({
    queryKey: ["all", "modulos"],
    enabled: kind !== "auditoria",
    queryFn: ({ signal }) => api<Row[]>("/opciones/modulos", { signal }),
  });
  const serviceName = (id: number) =>
    services.data?.find((s) => s.id_servicio === id)?.nombre_servicio ??
    (id ? "#" + id : "—");
  const moduleName = (id: number) =>
    modules.data?.find((s) => s.id_modulo === id)?.numero_modulo ??
    (id ? "#" + id : "—");
  async function doCancel(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/turnos/${cancel.id_turno}/cancelar`, {
        method: "POST",
        body: { motivo: reason },
      });
      await refresh();
      setCancel(null);
      toast("Turno cancelado");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / SEGUIMIENTO</span>
          <h1>{title}</h1>
          <p>
            {kind === "turnos"
              ? "Consulta estados, revisa el historial y gestiona los turnos."
              : kind === "derivaciones"
                ? "Trazabilidad de los traslados entre servicios y ventanillas."
                : "Acciones registradas y cambios realizados por el personal."}
          </p>
        </div>
        <button
          className="btn"
          disabled={!q.data?.items.length}
          onClick={() =>
            downloadCsv(`${kind}-pagina-${page}.csv`, q.data!.items)
          }
        >
          <Download size={18} />
          Exportar página
        </button>
      </div>
      {q.error && (
        <ErrorNotice error={msg(q.error)} retry={() => void q.refetch()} />
      )}
      <section className="panel">
        {kind === "turnos" && (
          <div className="filter-toolbar">
            <label>
              Fecha de emisión
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Estado
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos los estados</option>
                {[
                  "GENERADO",
                  "EN ESPERA",
                  "LLAMADO",
                  "EN ATENCION",
                  "DERIVADO",
                  "FINALIZADO",
                  "NO PRESENTADO",
                  "CANCELADO",
                ].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Servicio
              <select
                value={service}
                onChange={(e) => {
                  setService(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos los servicios</option>
                {services.data?.map((s) => (
                  <option key={s.id_servicio} value={s.id_servicio}>
                    {s.nombre_servicio}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              onClick={() => {
                setDate("");
                setStatus("");
                setService("");
                setPage(1);
              }}
            >
              <Search size={17} />
              Ver todos
            </button>
          </div>
        )}
        {q.isPending ? (
          <Loading />
        ) : q.data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                {kind === "turnos" ? (
                  <tr>
                    <th>Ticket</th>
                    <th>Servicio</th>
                    <th>Módulo</th>
                    <th>Emisión</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                ) : kind === "derivaciones" ? (
                  <tr>
                    <th>ID</th>
                    <th>Turno</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Motivo</th>
                    <th>Fecha</th>
                  </tr>
                ) : (
                  <tr>
                    <th>ID</th>
                    <th>Fecha</th>
                    <th>Cuenta</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                    <th>Detalle</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {q.data.items.map((row) =>
                  kind === "turnos" ? (
                    <tr key={row.id_turno}>
                      <td className="ticket-cell">
                        {row.codigo_ticket}
                        <small>#{row.id_turno}</small>
                      </td>
                      <td>{serviceName(row.id_servicio)}</td>
                      <td>{moduleName(row.id_modulo_atencion)}</td>
                      <td>{dateTime(row.fecha_hora_emision)}</td>
                      <td>
                        <Badge value={row.estado} />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            className="btn small"
                            disabled={!can(actor, "turnos.ver")}
                            onClick={() => setHistory(row.id_turno)}
                          >
                            <Eye size={16} />
                            Historial
                          </button>
                          {can(actor, "turnos.cancelar") &&
                            [
                              "GENERADO",
                              "EN ESPERA",
                              "LLAMADO",
                              "EN ATENCION",
                              "DERIVADO",
                            ].includes(row.estado) && (
                              <button
                                className="text-link danger-text"
                                onClick={() => {
                                  setCancel(row);
                                  setReason("");
                                  setError("");
                                }}
                              >
                                Cancelar
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ) : kind === "derivaciones" ? (
                    <tr key={row.id_derivacion}>
                      <td>#{row.id_derivacion}</td>
                      <td>
                        <button
                          className="text-link"
                          disabled={!can(actor, "turnos.ver")}
                          onClick={() => setHistory(row.id_turno)}
                        >
                          #{row.id_turno}
                        </button>
                      </td>
                      <td>
                        {moduleName(row.id_modulo_origen)}
                        <small className="cell-note">
                          {serviceName(row.id_servicio_origen)}
                        </small>
                      </td>
                      <td>
                        {moduleName(row.id_modulo_destino)}
                        <small className="cell-note">
                          {serviceName(row.id_servicio_destino)}
                        </small>
                      </td>
                      <td>{row.motivo ?? "—"}</td>
                      <td>{dateTime(row.fecha_hora_derivacion)}</td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>#{row.id}</td>
                      <td>{dateTime(row.fecha)}</td>
                      <td>
                        {row.id_usuario
                          ? "#" + row.id_usuario
                          : "Dispositivo"}
                      </td>
                      <td>
                        <Badge value={row.accion} />
                      </td>
                      <td>
                        {row.entidad} #{row.entidad_id}
                      </td>
                      <td className="detail-cell">
                        {row.detalle?.campos?.join(", ") || "—"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay registros para mostrar" />
        )}
        <Pager
          page={page}
          limit={limit}
          total={q.data?.total ?? 0}
          setPage={setPage}
        />
      </section>
      {history && (
        <HistoryModal id={history} onClose={() => setHistory(null)} />
      )}{" "}
      {cancel && (
        <Modal
          title={`Cancelar turno ${cancel.codigo_ticket}`}
          onClose={() => setCancel(null)}
          busy={busy}
        >
          <form onSubmit={doCancel}>
            <div className="modal-body">
              <label>
                Motivo de cancelación
                <textarea
                  required
                  minLength={3}
                  maxLength={255}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {error && <ErrorNotice error={error} />}
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                type="button"
                onClick={() => setCancel(null)}
                disabled={busy}
              >
                Volver
              </button>
              <button className="btn danger" disabled={busy}>
                Confirmar cancelación
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
