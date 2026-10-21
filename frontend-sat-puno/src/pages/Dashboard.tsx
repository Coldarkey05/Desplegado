import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Ticket,
  CheckCircle2,
  Clock,
  GitBranch,
  ArrowUpRight,
  Plus,
  PanelTop,
  Users,
} from "lucide-react";
import { api, catalogAll, msg, refresh } from "../lib/api";
import { day, duration } from "../lib/utils";
import {
  Stat,
  Badge,
  ErrorNotice,
  Loading,
  Empty,
  useToast,
} from "../components/ui";
import { useState } from "react";
export function Dashboard() {
  const date = day();
  const report = useQuery({
    queryKey: ["report", date, date],
    queryFn: () => api(`/admin/reportes?desde=${date}&hasta=${date}`),
  });
  const modules = useQuery({
    queryKey: ["all", "modulos"],
    queryFn: ({ signal }) => catalogAll("modulos", signal),
  });
  const services = useQuery({
    queryKey: ["all", "servicios"],
    queryFn: ({ signal }) => catalogAll("servicios", signal),
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const r = report.data;
  const count = (s: string) =>
    r?.estados?.find((x: any) => x.estado === s)?.cantidad ?? 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Resumen de atención</h1>
          <p>
            Una mirada a la jornada de hoy,{" "}
            {new Date().toLocaleDateString("es-PE", {
              timeZone: "America/Lima",
              day: "numeric",
              month: "long",
            })}
            .
          </p>
        </div>
        <Link className="btn primary" to="/emitir">
          <Plus size={18} />
          Emitir ticket
        </Link>
      </div>
      {(report.error || modules.error || services.error) && (
        <ErrorNotice
          error={msg(report.error || modules.error || services.error)}
          retry={() => void refresh()}
        />
      )}
      {report.isPending ? (
        <Loading />
      ) : (
        <div className="stats">
          <Stat
            title="Turnos emitidos"
            value={r?.tiempos.emitidos ?? "—"}
            icon={<Ticket />}
            detail="Durante la jornada"
          />
          <Stat
            title="En espera"
            value={count("EN ESPERA") + count("DERIVADO")}
            icon={<Clock />}
            detail="De los emitidos hoy"
          />
          <Stat
            title="Finalizados"
            value={count("FINALIZADO")}
            icon={<CheckCircle2 />}
            detail="De los emitidos hoy"
          />
          <Stat
            title="Derivaciones"
            value={r?.derivaciones ?? "—"}
            icon={<GitBranch />}
            detail="Realizadas hoy"
          />
        </div>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Estado de módulos</h2>
              <p>Disponibilidad actual de las ventanillas</p>
            </div>
            <Link to="/admin/modulos" className="text-link">
              Gestionar <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="module-grid">
            {modules.isPending ? (
              <Loading />
            ) : modules.data?.length ? (
              modules.data.map((m) => (
                <article className="module-tile" key={m.id_modulo}>
                  <div className="module-icon">
                    <PanelTop />
                  </div>
                  <Badge value={m.estado} />
                  <h3>{m.numero_modulo}</h3>
                  <p>
                    {services.data?.find(
                      (s) => s.id_servicio === m.id_servicio_principal,
                    )?.nombre_servicio ?? "Sin servicio asignado"}
                  </p>
                </article>
              ))
            ) : (
              <Empty
                title="Aún no hay módulos"
                text="Crea un módulo y asigna un usuario para iniciar la atención."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Indicadores del día</h2>
              <p>Tiempos promedio de la jornada</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="metric-row">
              <span>Espera inicial</span>
              <strong>
                {duration(r?.tiempos.promedio_espera_inicial_segundos)}
              </strong>
            </div>
            <div className="metric-row">
              <span>Tiempo total finalizados</span>
              <strong>
                {duration(r?.tiempos.promedio_total_finalizados_segundos)}
              </strong>
            </div>
            <div className="metric-row">
              <span>Turnos preferenciales</span>
              <strong>{r?.tiempos.preferenciales ?? "—"}</strong>
            </div>
            <div className="metric-row">
              <span>Módulos disponibles</span>
              <strong>
                {modules.data?.filter((m) => m.estado === "Disponible")
                  .length ?? "—"}
              </strong>
            </div>
            <Link className="btn full" to="/admin/reportes">
              Ver reportes
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
      </div>
      <div className="setup-banner">
        <Users size={28} />
        <div>
          <h3>Prepara a tu equipo</h3>
          <p>
            Asigna el servicio al módulo, el usuario a la ventanilla y su
            credencial de acceso.
          </p>
        </div>
        <Link className="btn" to="/admin/usuarios">
          Gestionar usuarios
        </Link>
      </div>
      <div className="inline-help">
        <span>
          ¿Reconciliaste turnos importados? Puedes reevaluar las asignaciones
          disponibles.
        </span>
        <button
          className="text-link"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/admin/cola/reanudar", { method: "POST", body: {} });
              await refresh();
              toast("Asignaciones reevaluadas");
            } catch (e) {
              toast(msg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Reanudar cola
        </button>
      </div>
    </>
  );
}
