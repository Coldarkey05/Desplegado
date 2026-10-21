import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { Database } from "./database";
import { parse } from "./validation";
export const reportQuery = z
  .object({ desde: z.string().date(), hasta: z.string().date() })
  .refine((x) => x.desde <= x.hasta, "Rango inválido")
  .refine(
    (x) => Date.parse(x.hasta) - Date.parse(x.desde) <= 366 * 86400000,
    "Máximo 366 días",
  );
@Injectable()
export class Reports {
  constructor(private db: Database) {}
  async summary(query: unknown) {
    const d = parse(reportQuery, query);
    const from = new Date(d.desde + "T00:00:00-05:00");
    const end = new Date(
      new Date(d.hasta + "T00:00:00-05:00").getTime() + 86400000,
    );
    return this.db.$transaction(
      async (tx) => {
        const estados = await tx.$queryRaw<
          any[]
        >`SELECT estado,COUNT(*)::int AS cantidad FROM turnos WHERE fecha_hora_emision>=${from} AND fecha_hora_emision<${end} GROUP BY estado`;
        const tramos = await tx.$queryRaw<
          any[]
        >`WITH h AS (SELECT *, LEAD(fecha) OVER(PARTITION BY id_turno ORDER BY id) AS fin FROM historial_turnos)
   SELECT h.id_modulo,h.id_usuario,m.numero_modulo,u.nombres,u.apellidos,
   COUNT(*) FILTER(WHERE h.estado='EN ATENCION')::int AS segmentos_atencion,
   COALESCE(SUM(EXTRACT(EPOCH FROM (h.fin-h.fecha))) FILTER(WHERE h.estado='EN ATENCION'),0)::float8 AS segundos_atencion
   FROM h LEFT JOIN modulos m ON m.id_modulo=h.id_modulo LEFT JOIN usuarios u ON u.id_usuario=h.id_usuario
   WHERE h.fecha>=${from} AND h.fecha<${end} AND h.fin IS NOT NULL AND h.estado='EN ATENCION'
   GROUP BY h.id_modulo,h.id_usuario,m.numero_modulo,u.nombres,u.apellidos`;
        const tiempos = await tx.$queryRaw<
          any[]
        >`WITH primera AS (SELECT id_turno,MIN(fecha) AS primer_llamado FROM historial_turnos WHERE estado='LLAMADO' GROUP BY id_turno)
   SELECT COUNT(*)::int AS emitidos,COUNT(*) FILTER(WHERE prioridad>0)::int AS preferenciales,
   AVG(EXTRACT(EPOCH FROM(p.primer_llamado-t.fecha_hora_emision)))::float8 AS promedio_espera_inicial_segundos,
   AVG(EXTRACT(EPOCH FROM(t.fecha_hora_fin_atencion-t.fecha_hora_emision))) FILTER(WHERE t.estado='FINALIZADO')::float8 AS promedio_total_finalizados_segundos
   FROM turnos t LEFT JOIN primera p USING(id_turno) WHERE t.fecha_hora_emision>=${from} AND t.fecha_hora_emision<${end}`;
        const servicios = await tx.$queryRaw<
          any[]
        >`SELECT s.nombre_servicio,COUNT(*)::int AS finalizados FROM historial_turnos h JOIN servicios s ON s.id_servicio=h.id_servicio WHERE h.estado='FINALIZADO' AND h.fecha>=${from} AND h.fecha<${end} GROUP BY s.nombre_servicio`;
        const derivaciones = await tx.derivaciones.count({
          where: { fecha_hora_derivacion: { gte: from, lt: end } },
        });
        const horas = await tx.$queryRaw<
          any[]
        >`SELECT EXTRACT(HOUR FROM(fecha_hora_emision AT TIME ZONE 'UTC' AT TIME ZONE 'America/Lima'))::int AS hora,COUNT(*)::int AS cantidad FROM turnos WHERE fecha_hora_emision>=${from} AND fecha_hora_emision<${end} GROUP BY hora ORDER BY hora`;
        return {
          desde: d.desde,
          hasta: d.hasta,
          zona_horaria: "America/Lima",
          estados,
          tiempos: tiempos[0],
          por_operador_modulo: tramos,
          finalizados_por_servicio: servicios,
          derivaciones,
          demanda_por_hora: horas,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}
