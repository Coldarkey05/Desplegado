import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Ticket, Clock, CheckCircle2, GitBranch } from "lucide-react";
import { api, msg } from "../lib/api";
import { day, duration, downloadCsv } from "../lib/utils";
import { Stat, ErrorNotice, Loading, Empty } from "../components/ui";
export function Reports() {
  const [from, setFrom] = useState(day());
  const [to, setTo] = useState(day());
  const [range, setRange] = useState({ from: day(), to: day() });
  const [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["report", range.from, range.to],
    queryFn: ({ signal }) =>
      api(`/admin/reportes?desde=${range.from}&hasta=${range.to}`, { signal }),
  });
  const data = q.data;
  function apply(e: FormEvent) {
    e.preventDefault();
    if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) {
      setError("Selecciona un rango válido de hasta 366 días.");
      return;
    }
    setError("");
    setRange({ from, to });
  }
  function exportReport() {
    if (!data) return;
    const rows = [
      ...Object.entries(data.tiempos).map(([indicador, valor]) => ({
        grupo: "Tiempos y totales",
        indicador,
        valor,
      })),
      ...data.estados.map((r: any) => ({
        grupo: "Estados",
        indicador: r.estado,
        valor: r.cantidad,
      })),
      { grupo: "Derivaciones", indicador: "Total", valor: data.derivaciones },
      ...data.finalizados_por_servicio.map((r: any) => ({
        grupo: "Servicio",
        indicador: r.nombre_servicio,
        valor: r.finalizados,
      })),
      ...data.por_operador_modulo.map((r: any) => ({
        grupo: "Operador",
        indicador: `${r.nombres ?? ""} ${r.apellidos ?? ""} / ${r.numero_modulo ?? ""}`,
        valor: r.segundos_atencion,
      })),
    ];
    downloadCsv(`reporte-${range.from}-${range.to}.csv`, rows);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / INDICADORES</span>
          <h1>Reportes de atención</h1>
          <p>Consulta resultados y tiempos por rango de fechas.</p>
        </div>
        <button
          className="btn"
          disabled={!data || !!q.error}
          onClick={exportReport}
        >
          <Download size={18} />
          Descargar CSV
        </button>
      </div>
      <form className="panel filter-toolbar" onSubmit={apply}>
        <label>
          Desde
          <input
            required
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            required
            type="date"
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="btn primary">Consultar reporte</button>
        <span className="muted small">
          Hora local de Lima · Máximo 366 días
        </span>
      </form>
      {(error || q.error) && (
        <ErrorNotice
          error={error || msg(q.error)}
          retry={() => void q.refetch()}
        />
      )}
      {q.isPending ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="stats">
              <Stat
                title="Emitidos"
                value={data.tiempos.emitidos}
                icon={<Ticket />}
              />
              <Stat
                title="Espera inicial"
                value={duration(data.tiempos.promedio_espera_inicial_segundos)}
                icon={<Clock />}
              />
              <Stat
                title="Tiempo total"
                value={duration(
                  data.tiempos.promedio_total_finalizados_segundos,
                )}
                detail="Solo finalizados"
                icon={<CheckCircle2 />}
              />
              <Stat
                title="Derivaciones"
                value={data.derivaciones}
                icon={<GitBranch />}
              />
            </div>
            <div className="grid-two">
              <section className="panel">
                <div className="panel-header">
                  <h2>Turnos por estado</h2>
                </div>
                <div className="panel-body">
                  {data.estados.length ? (
                    data.estados.map((r: any) => (
                      <div className="bar-row" key={r.estado}>
                        <div>
                          <span>{r.estado}</span>
                          <strong>{r.cantidad}</strong>
                        </div>
                        <div className="bar-track">
                          <i
                            style={{
                              width: `${(r.cantidad / Math.max(1, data.tiempos.emitidos)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty title="Sin datos en el período" />
                  )}
                </div>
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h2>Demanda por hora</h2>
                </div>
                <div className="panel-body">
                  {data.demanda_por_hora.length ? (
                    data.demanda_por_hora.map((r: any) => (
                      <div className="bar-row" key={r.hora}>
                        <div>
                          <span>{String(r.hora).padStart(2, "0")}:00</span>
                          <strong>{r.cantidad} turnos</strong>
                        </div>
                        <div className="bar-track teal">
                          <i
                            style={{
                              width: `${(r.cantidad / Math.max(...data.demanda_por_hora.map((h: any) => h.cantidad), 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty title="Sin demanda registrada" />
                  )}
                </div>
              </section>
            </div>
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Atención por operador y módulo</h2>
                  <p>Duración acumulada de segmentos cerrados de atención.</p>
                </div>
              </div>
              {data.por_operador_modulo.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Operador</th>
                        <th>Módulo</th>
                        <th>Segmentos</th>
                        <th>Tiempo de atención</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_operador_modulo.map((r: any, i: number) => (
                        <tr key={i}>
                          <td>
                            {r.nombres
                              ? `${r.nombres} ${r.apellidos}`
                              : "Usuario #" + r.id_usuario}
                          </td>
                          <td>{r.numero_modulo ?? "Módulo #" + r.id_modulo}</td>
                          <td>{r.segmentos_atencion}</td>
                          <td>{duration(r.segundos_atencion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title="Sin atenciones cerradas" />
              )}
            </section>
            <p className="inline-help">
              Los estados corresponden a turnos emitidos en el rango. Las
              derivaciones corresponden a eventos del rango. Un segmento no
              equivale a una persona; un rellamado puede dividir una atención.
            </p>
          </>
        )
      )}
    </>
  );
}
