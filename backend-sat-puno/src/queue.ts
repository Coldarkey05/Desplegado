import { serviceIds, setServices } from "./module-services";
import { requireManaged } from "./hierarchy";
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { turnos, Prisma } from "@prisma/client";
import { Database, Tx, audit } from "./database";
import { can, requirePermission, userCanAttend } from "./permissions";
import { z } from "zod";
import { dni as dniSchema, positive, name } from "./validation";

import { Actor } from "./auth";
import { config } from "./config";
import { Events } from "./events";
import {
  ACTIVE,
  BUSY,
  WAITING,
  limaDay,
  orderQueue,
  requireState,
} from "./policy";
import { issueSchema, parse, transferSchema, reasonSchema } from "./validation";
@Injectable()
export class QueueService {
  constructor(
    private db: Database,
    private events: Events,
  ) {}
  async record(tx: Tx, t: turnos, detail?: string) {
    await tx.historial_turnos.create({
      data: {
        id_turno: t.id_turno,
        estado: t.estado!,
        id_servicio: t.id_servicio,
        id_modulo: t.id_modulo_atencion,
        id_usuario: t.id_usuario_atencion,
        detalle: detail,
      },
    });
  }
  async operator(tx: Tx, a: Actor, requireModule = true) {
    if (!a.id_usuario) throw new ForbiddenException("Sesión sin usuario");
    const u = await tx.usuarios.findUnique({
      where: { id_usuario: a.id_usuario },
      include: { roles: true },
    });
    if (
      !u?.activo ||
      !can(a, "ventanilla.atender") ||
      !(await userCanAttend(tx, u.id_usuario)) ||
      (requireModule && !u.id_modulo_asignado)
    )
      throw new ForbiddenException("Usuario inactivo o sin módulo");
    return u;
  }
  async allowed(tx: Tx, a: Actor, t: turnos) {
    if (a.rol_sistema === "Admin") return;
    if (!can(a, "ventanilla.atender"))
      throw new ForbiddenException(
        "Esta cuenta no tiene atención de ventanilla",
      );
    const u = await this.operator(tx, a);
    if (
      t.id_modulo_atencion !== u.id_modulo_asignado ||
      t.id_usuario_atencion !== u.id_usuario
    )
      throw new ForbiddenException("Turno de otro operador");
  }
  async availableOperator(tx: Tx, module: number) {
    const users = await tx.usuarios.findMany({
      where: {
        activo: true,
        retiro_pendiente: false,
        id_modulo_asignado: module,
      },
      orderBy: { id_usuario: "asc" },
    });
    for (const u of users)
      if (await userCanAttend(tx, u.id_usuario)) return u.id_usuario;
    return undefined;
  }

  async contributor(dni: string) {
    parse(dniSchema, dni);
    const c = await this.db.contribuyentes.findUnique({ where: { dni } });
    const turno = c
      ? await this.db.turnos.findFirst({
          where: {
            id_contribuyente: c.id_contribuyente,
            estado: { in: ACTIVE },
          },
          select: {
            id_turno: true,
            codigo_ticket: true,
            estado: true,
            prioridad: true,
          },
        })
      : null;
    return { contribuyente: c, turno };
  }
  async setPreference(dni: string, body: unknown, a: Actor) {
    requirePermission(a, "preferencias.asignar");
    parse(dniSchema, dni);
    const d = parse(
      z
        .object({
          id_tipo_preferencia: positive,
          nombres: name.optional(),
          apellidos: name.optional(),
        })
        .strict(),
      body,
    );
    const result = await this.db.atomic(async (tx) => {
      const pref = await tx.tipospreferencia.findUnique({
        where: { id_tipo_preferencia: d.id_tipo_preferencia },
      });
      if (!pref) throw new BadRequestException("Preferencia inexistente");
      const old = await tx.contribuyentes.findUnique({ where: { dni } });
      if (
        old &&
        (await tx.turnos.count({
          where: {
            id_contribuyente: old.id_contribuyente,
            estado: { in: BUSY },
          },
        }))
      )
        throw new ConflictException(
          "El turno ya fue llamado; no se modifica su preferencia durante la atención",
        );
      const c = await tx.contribuyentes.upsert({
        where: { dni },
        create: {
          dni,
          nombres: d.nombres ?? "Por completar",
          apellidos: d.apellidos ?? "Por completar",
          id_tipo_preferencia: pref.id_tipo_preferencia,
          es_preferencial: pref.prioridad > 0,
        },
        update: { ...d, es_preferencial: pref.prioridad > 0 },
      });
      const waiting = await tx.turnos.findMany({
        where: {
          id_contribuyente: c.id_contribuyente,
          estado: { in: WAITING },
        },
      });
      for (const t of waiting) {
        const updated = await tx.turnos.update({
          where: { id_turno: t.id_turno },
          data: { prioridad: pref.prioridad },
        });
        await this.record(
          tx,
          updated,
          "Preferencia actualizada: " + pref.nombre_tipo,
        );
      }
      await audit(
        tx,
        a.id_usuario,
        "ASIGNAR_PREFERENCIA",
        "contribuyentes",
        c.id_contribuyente,
        { id_tipo_preferencia: pref.id_tipo_preferencia },
      );
      await this.dispatch(tx);
      return c;
    });
    this.events.changed();
    return result;
  }
  async syncPreference(tx: Tx, contributorId: number, a: Actor) {
    const c = await tx.contribuyentes.findUniqueOrThrow({
      where: { id_contribuyente: contributorId },
      include: { tipospreferencia: true },
    });
    const waiting = await tx.turnos.findMany({
      where: { id_contribuyente: contributorId, estado: { in: WAITING } },
    });
    for (const t of waiting) {
      if (t.prioridad === c.tipospreferencia.prioridad) continue;
      const updated = await tx.turnos.update({
        where: { id_turno: t.id_turno },
        data: { prioridad: c.tipospreferencia.prioridad },
      });
      await this.record(
        tx,
        updated,
        "Preferencia actualizada: " + c.tipospreferencia.nombre_tipo,
      );
      await audit(
        tx,
        a.id_usuario,
        "ACTUALIZAR_PRIORIDAD",
        "turnos",
        t.id_turno,
        { prioridad: updated.prioridad },
      );
    }
  }
  async dispatch(tx: Tx, manualModule?: number) {
    const now = new Date();
    const modules = await tx.modulos.findMany({
      where: {
        estado: "Disponible",
        ...(manualModule
          ? { id_modulo: manualModule }
          : { atencion_automatica: true }),
      },
      orderBy: [{ orden_ultima_asignacion: "asc" }, { id_modulo: "asc" }],
    });
    const available = [];
    for (const m of modules) {
      const enabled = await serviceIds(tx, m.id_modulo, true);
      if (!enabled.length) continue;
      if (
        await tx.turnos.count({
          where: { id_modulo_atencion: m.id_modulo, estado: { in: BUSY } },
        })
      )
        continue;
      const operator = await this.availableOperator(tx, m.id_modulo);
      if (operator) available.push({ ...m, operator, enabled });
    }
    // Primero se elige el turno; después la ventanilla disponible con asignación más antigua.
    const waiting = orderQueue(
      await tx.turnos.findMany({ where: { estado: { in: WAITING } } }),
      now,
      config.MAX_WAIT_MINUTES,
    );
    for (const next of waiting) {
      const index = available.findIndex(
        (m) =>
          m.enabled.includes(next.id_servicio) &&
          m.id_modulo !== next.id_modulo_excluido &&
          (next.estado === "DERIVADO" ||
            next.id_modulo_destino === null ||
            next.id_modulo_destino === m.id_modulo),
      );
      if (index < 0) continue;
      const m = available.splice(index, 1)[0];
      if (next.estado === "DERIVADO") {
        const transfer = await tx.derivaciones.findFirst({
          where: { id_turno: next.id_turno },
          orderBy: { id_derivacion: "desc" },
        });
        if (transfer)
          await tx.derivaciones.update({
            where: { id_derivacion: transfer.id_derivacion },
            data: { id_modulo_destino: m.id_modulo },
          });
      }
      let t = await tx.turnos.update({
        where: { id_turno: next.id_turno },
        data: {
          estado: "LLAMADO",
          id_modulo_destino:
            next.estado === "DERIVADO" ? m.id_modulo : next.id_modulo_destino,
          id_modulo_excluido: null,
          id_modulo_atencion: m.id_modulo,
          id_usuario_atencion: m.operator,
          fecha_hora_llamado: now,
          intentos_llamado: 1,
        },
      });
      await this.record(
        tx,
        t,
        "Asignación por rotación entre módulos disponibles",
      );
      if (!manualModule && config.ATTENTION_MODE === "automatico") {
        t = await tx.turnos.update({
          where: { id_turno: t.id_turno },
          data: { estado: "EN ATENCION", fecha_hora_inicio_atencion: now },
        });
        await this.record(tx, t, "Inicio automático");
      }
      // El bloqueo compartido serializa este contador sin depender de una secuencia SQL.
      const last = await tx.modulos.aggregate({
        _max: { orden_ultima_asignacion: true },
      });
      const counter = (last._max.orden_ultima_asignacion ?? 0n) + 1n;
      await tx.modulos.update({
        where: { id_modulo: m.id_modulo },
        data: { estado: "Ocupado", orden_ultima_asignacion: counter },
      });
    }
  }
  ticket(t: turnos) {
    return {
      id_turno: t.id_turno,
      codigo_ticket: t.codigo_ticket,
      fecha_jornada: t.fecha_jornada,
      fecha_hora_emision: t.fecha_hora_emision,
      id_servicio: t.id_servicio,
      estado: t.estado,
      prioridad: t.prioridad,
      id_modulo_atencion: t.id_modulo_atencion,
    };
  }
  async issue(b: unknown, a: Actor) {
    const d = parse(issueSchema, b);
    const result = await this.db.atomic(async (tx) => {
      const previous = await tx.turnos.findUnique({
        where: { solicitud_id: d.solicitud_id },
      });
      if (previous) {
        const c = previous.id_contribuyente
          ? await tx.contribuyentes.findUnique({
              where: { id_contribuyente: previous.id_contribuyente },
            })
          : null;
        if (c?.dni !== d.dni)
          throw new ConflictException(
            "solicitud_id reutilizado con datos distintos",
          );
        // El servicio actual puede cambiar por una derivación: validar el servicio original en el historial.
        const first = await tx.historial_turnos.findFirst({
          where: { id_turno: previous.id_turno },
          orderBy: { id: "asc" },
        });
        if (first?.id_servicio !== d.id_servicio)
          throw new ConflictException(
            "solicitud_id reutilizado con otro servicio",
          );
        return this.ticket(previous);
      }
      const s = await tx.servicios.findUnique({
        where: { id_servicio: d.id_servicio },
      });
      if (!s?.activo)
        throw new BadRequestException("Servicio inexistente o inactivo");
      const none = await tx.tipospreferencia.findUnique({
        where: { nombre_tipo: "Ninguna" },
      });
      if (!none)
        throw new ConflictException("Falta el catálogo Ninguna; ejecutar seed");
      const c = await tx.contribuyentes.upsert({
        where: { dni: d.dni },
        update: {},
        create: {
          dni: d.dni,
          nombres: "Por completar",
          apellidos: "Por completar",
          id_tipo_preferencia: none.id_tipo_preferencia,
          es_preferencial: false,
        },
      });
      if (
        await tx.turnos.count({
          where: {
            id_contribuyente: c.id_contribuyente,
            estado: { in: ACTIVE },
          },
        })
      )
        throw new ConflictException(
          "El contribuyente ya tiene un turno activo",
        );
      const p = await tx.tipospreferencia.findUniqueOrThrow({
        where: { id_tipo_preferencia: c.id_tipo_preferencia },
      });
      const day = limaDay();
      const prefix = p.prioridad > 0 ? "P" : "A";
      // Incluye tickets previos a la migración al inicializar el contador.
      const old = await tx.turnos.findMany({
        where: {
          fecha_jornada: day,
          codigo_ticket: { startsWith: prefix + "-" },
        },
        select: { codigo_ticket: true },
      });
      const max = old.reduce(
        (v, t) =>
          /^([AP])-\d+$/.test(t.codigo_ticket)
            ? Math.max(v, Number(t.codigo_ticket.slice(2)))
            : v,
        0,
      );
      const count = await tx.contadores_ticket.upsert({
        where: { fecha_prefijo: { fecha: day, prefijo: prefix } },
        create: { fecha: day, prefijo: prefix, valor: max + 1 },
        update: { valor: { increment: 1 } },
      });
      if (count.valor > 99999999)
        throw new ConflictException("Límite de tickets de la jornada");
      let t = await tx.turnos.create({
        data: {
          codigo_ticket: prefix + "-" + String(count.valor).padStart(3, "0"),
          id_contribuyente: c.id_contribuyente,
          id_servicio: d.id_servicio,
          fecha_jornada: day,
          prioridad: p.prioridad,
          solicitud_id: d.solicitud_id,
          estado: "GENERADO",
        },
      });
      await this.record(tx, t);
      t = await tx.turnos.update({
        where: { id_turno: t.id_turno },
        data: { estado: "EN ESPERA" },
      });
      await this.record(tx, t);
      await audit(tx, a.id_usuario, "EMITIR", "turnos", t.id_turno);
      await this.dispatch(tx);
      return this.ticket(
        await tx.turnos.findUniqueOrThrow({ where: { id_turno: t.id_turno } }),
      );
    });
    this.events.changed();
    return result;
  }
  async action(id: number, action: string, b: unknown, a: Actor) {
    const result = await this.db.atomic(async (tx) => {
      let t = await tx.turnos.findUnique({ where: { id_turno: id } });
      if (!t) throw new NotFoundException("Turno no encontrado");
      if (action === "cancelar" && can(a, "turnos.cancelar")) {
      } else await this.allowed(tx, a, t);
      const now = new Date();
      let data: Prisma.turnosUncheckedUpdateInput = {};
      if (action === "iniciar") {
        requireState(t.estado, ["LLAMADO"]);
        data = { estado: "EN ATENCION", fecha_hora_inicio_atencion: now };
      } else if (action === "rellamar") {
        requireState(t.estado, BUSY);
        if ((t.intentos_llamado ?? 0) >= config.MAX_CALL_ATTEMPTS)
          throw new ConflictException(
            "Máximo de llamados alcanzado; marque no presentado",
          );
        data = { intentos_llamado: { increment: 1 }, fecha_hora_llamado: now };
      } else if (action === "finalizar") {
        requireState(t.estado, ["EN ATENCION"]);
        data = { estado: "FINALIZADO", fecha_hora_fin_atencion: now };
      } else if (action === "no-presentado") {
        requireState(t.estado, BUSY);
        if ((t.intentos_llamado ?? 0) < config.MAX_CALL_ATTEMPTS)
          throw new ConflictException("Complete los intentos de llamado");
        data = { estado: "NO PRESENTADO", fecha_hora_fin_atencion: now };
      } else if (action === "cancelar") {
        const d = parse(reasonSchema, b);
        requireState(t.estado, ACTIVE);
        data = {
          estado: "CANCELADO",
          fecha_hora_fin_atencion: now,
          motivo_cierre: d.motivo,
        };
      } else if (action === "derivar") {
        requireState(t.estado, ["EN ATENCION"]);
        const d = parse(transferSchema, b);

        const s = await tx.servicios.findUnique({
          where: { id_servicio: d.id_servicio_destino },
        });
        if (!s?.activo)
          throw new BadRequestException("Servicio destino inactivo");
        const destinations = await tx.modulos.findMany({
          where: {
            OR: [
              {
                habilitaciones: {
                  some: { id_servicio: d.id_servicio_destino },
                },
              },
              { id_servicio_principal: d.id_servicio_destino },
            ],
            id_modulo: { not: t.id_modulo_atencion! },
            estado: { in: ["Disponible", "Ocupado"] },
          },
          orderBy: [{ orden_ultima_asignacion: "asc" }, { id_modulo: "asc" }],
        });
        // Primero módulos libres y con operador habilitado; la cola pendiente es por servicio.
        let destination: number | undefined;
        let best = Infinity;
        for (const m of destinations) {
          if (!(await this.availableOperator(tx, m.id_modulo))) continue;
          const busy = await tx.turnos.count({
            where: { id_modulo_atencion: m.id_modulo, estado: { in: BUSY } },
          });
          const waiting = await tx.turnos.count({
            where: { id_modulo_destino: m.id_modulo, estado: { in: WAITING } },
          });
          const score =
            (m.estado === "Disponible" && !busy ? 0 : 1000000) + waiting;
          if (score < best) {
            destination = m.id_modulo;
            best = score;
          }
        }
        if (!destination)
          throw new ConflictException(
            "No hay módulo destino abierto con operador habilitado; configure y abra uno antes de derivar",
          );
        await tx.derivaciones.create({
          data: {
            id_turno: id,
            id_modulo_origen: t.id_modulo_atencion!,
            id_modulo_destino: destination,
            id_servicio_origen: t.id_servicio,
            id_servicio_destino: d.id_servicio_destino,
            motivo: d.motivo,
          },
        });
        // Cierra el tramo de origen antes de modificar el servicio.
        await this.record(tx, { ...t, estado: "DERIVADO" }, d.motivo);
        data = {
          estado: "DERIVADO",
          id_servicio: d.id_servicio_destino,
          id_modulo_destino: destination,
          id_modulo_excluido: t.id_modulo_atencion,
          id_modulo_atencion: null,
          id_usuario_atencion: null,
          fecha_cola: now,
          fecha_hora_llamado: null,
          fecha_hora_inicio_atencion: null,
          fecha_hora_fin_atencion: null,
          intentos_llamado: 0,
        };
      } else throw new BadRequestException("Acción desconocida");
      const origin = t.id_modulo_atencion;
      const attendingUser = t.id_usuario_atencion;
      t = await tx.turnos.update({ where: { id_turno: id }, data });
      await this.record(tx, t, action);
      if (
        ["finalizar", "no-presentado", "cancelar", "derivar"].includes(
          action,
        ) &&
        origin
      ) {
        const module = await tx.modulos.findUniqueOrThrow({
          where: { id_modulo: origin },
        });
        const user = attendingUser
          ? await tx.usuarios.findUnique({
              where: { id_usuario: attendingUser },
            })
          : null;
        await tx.modulos.update({
          where: { id_modulo: origin },
          data: {
            estado:
              user?.retiro_pendiente || module.estado === "Cerrado"
                ? "Cerrado"
                : "Disponible",
          },
        });
        if (user?.retiro_pendiente) {
          await tx.usuarios.update({
            where: { id_usuario: user.id_usuario },
            data: { id_modulo_asignado: null, retiro_pendiente: false },
          });
          await audit(
            tx,
            a.id_usuario,
            "RELEVO_COMPLETADO",
            "usuarios",
            user.id_usuario,
            { id_modulo: origin },
          );
        }
      }
      await audit(tx, a.id_usuario, action.toUpperCase(), "turnos", id);
      await this.dispatch(tx);
      return tx.turnos.findUniqueOrThrow({ where: { id_turno: id } });
    });
    this.events.changed();
    return result;
  }
  async assignmentOptions(a: Actor) {
    const u = await this.operator(this.db, a, false);
    const modules = await this.db.modulos.findMany({
      orderBy: { numero_modulo: "asc" },
    });
    const users = await this.db.usuarios.findMany({
      where: { id_usuario: { not: u.id_usuario } },
      select: { id_modulo_asignado: true },
    });
    return {
      id_modulo_actual: u.id_modulo_asignado,
      modulos: await Promise.all(
        modules.map(async (m) => ({
          servicios_ids: await serviceIds(this.db, m.id_modulo, true),
          id_modulo: m.id_modulo,
          numero_modulo: m.numero_modulo,
          id_servicio_principal: m.id_servicio_principal,
          estado: m.estado,
          disponible_para_asignar:
            m.estado !== "Ocupado" &&
            !users.some((v) => v.id_modulo_asignado === m.id_modulo),
        })),
      ),
      servicios: await this.db.servicios.findMany({
        where: { activo: true },
        select: { id_servicio: true, nombre_servicio: true },
        orderBy: { nombre_servicio: "asc" },
      }),
    };
  }
  async changeAssignment(a: Actor, body: unknown) {
    const d = parse(
      z
        .object({
          id_modulo: positive,
          id_servicio: positive.optional(),
          servicios_ids: z.array(positive).min(1).max(100).optional(),
        })
        .strict()
        .refine(
          (d) => !!d.id_servicio !== !!d.servicios_ids,
          "Selecciona servicios",
        ),
      body,
    );
    const idsServicios = d.servicios_ids ?? [d.id_servicio!];
    await this.db.atomic(async (tx) => {
      const u = await this.operator(tx, a, false);
      const target = await tx.modulos.findUnique({
        where: { id_modulo: d.id_modulo },
      });

      if (!target) throw new NotFoundException("Módulo inexistente");

      const ids = [
        ...new Set(
          [u.id_modulo_asignado, d.id_modulo].filter(
            (id): id is number => id !== null,
          ),
        ),
      ];
      if (
        target.estado === "Ocupado" ||
        (await tx.turnos.count({
          where: {
            estado: { in: BUSY },
            OR: [
              { id_usuario_atencion: u.id_usuario },
              { id_modulo_atencion: { in: ids } },
            ],
          },
        }))
      )
        throw new ConflictException(
          "Finaliza la atención antes de cambiar módulo o servicio; el destino también debe estar libre",
        );
      if (
        await tx.usuarios.count({
          where: {
            id_usuario: { not: u.id_usuario },
            id_modulo_asignado: d.id_modulo,
          },
        })
      )
        throw new ConflictException("El módulo ya tiene otro usuario asignado");
      if (
        await tx.turnos.count({
          where: {
            estado: { in: WAITING },
            id_modulo_destino: d.id_modulo,
            id_servicio: { notIn: idsServicios },
          },
        })
      )
        throw new ConflictException(
          "Hay derivaciones pendientes en el módulo de origen o destino",
        );
      if (
        u.id_modulo_asignado &&
        u.id_modulo_asignado !== d.id_modulo &&
        !(await tx.usuarios.count({
          where: {
            activo: true,
            id_modulo_asignado: u.id_modulo_asignado,
            id_usuario: { not: u.id_usuario },
          },
        }))
      ) {
        await tx.modulos.update({
          where: { id_modulo: u.id_modulo_asignado },
          data: { estado: "Cerrado" },
        });
      }
      await tx.usuarios.update({
        where: { id_usuario: u.id_usuario },
        data: { id_modulo_asignado: d.id_modulo, retiro_pendiente: false },
      });
      await tx.modulos.update({
        where: { id_modulo: d.id_modulo },
        data: { estado: "Cerrado" },
      });
      await setServices(tx, d.id_modulo, idsServicios);
      await audit(
        tx,
        a.id_usuario,
        "CAMBIAR_ASIGNACION",
        "usuarios",
        u.id_usuario,
        {
          modulo_anterior: u.id_modulo_asignado,
          modulo_nuevo: d.id_modulo,
          servicio_anterior: target.id_servicio_principal,
          servicios_nuevos: idsServicios,
        },
      );
    });
    this.events.changed();
    return { ok: true };
  }
  async endShift(a: Actor, moduleId?: number) {
    const result = await this.db.atomic(async (tx) => {
      const own = moduleId ? null : await this.operator(tx, a, false);
      if (moduleId) requirePermission(a, "ventanilla.relevar");
      const id = moduleId ?? own?.id_modulo_asignado;
      if (!id) return { ok: true, pendiente: false };
      const module = await tx.modulos.findUnique({ where: { id_modulo: id } });
      if (!module) throw new NotFoundException("Módulo inexistente");
      const users = await tx.usuarios.findMany({
        where: { id_modulo_asignado: id },
      });
      for (const u of users)
        if (moduleId && u.id_usuario !== a.id_usuario)
          await requireManaged(tx, a, u);
      await tx.modulos.update({
        where: { id_modulo: id },
        data: { estado: "Cerrado" },
      });
      let pending = false;
      for (const u of users) {
        const busy = await tx.turnos.count({
          where: { id_usuario_atencion: u.id_usuario, estado: { in: BUSY } },
        });
        pending ||= !!busy;
        await tx.usuarios.update({
          where: { id_usuario: u.id_usuario },
          data: busy
            ? { retiro_pendiente: true }
            : { id_modulo_asignado: null, retiro_pendiente: false },
        });
      }
      await audit(tx, a.id_usuario, "FIN_JORNADA", "modulos", id, {
        pendiente: pending,
      });
      await this.dispatch(tx);
      return { ok: true, pendiente: pending };
    });
    this.events.changed();
    return result;
  }
  async open(a: Actor, open: boolean, moduleId?: number) {
    const result = await this.db.atomic(async (tx) => {
      if (moduleId) requirePermission(a, "ventanilla.relevar");
      const u = moduleId ? null : await this.operator(tx, a);
      const id = moduleId ?? u!.id_modulo_asignado!;
      const m = await tx.modulos.findUniqueOrThrow({
        where: { id_modulo: id },
      });
      if (open && u?.retiro_pendiente)
        throw new ConflictException(
          "Finaliza el turno actual para completar tu salida",
        );
      if (
        open &&
        (!(await serviceIds(tx, id, true)).length ||
          !(await this.availableOperator(tx, id)))
      )
        throw new ConflictException(
          "Asigna un servicio activo y un usuario activo con rol Operador antes de abrir",
        );
      const busy = await tx.turnos.count({
        where: { id_modulo_atencion: id, estado: { in: BUSY } },
      });
      if (!open && busy)
        throw new ConflictException(
          "Usa Dejar de atender para terminar la jornada después de tu turno actual",
        );
      await tx.modulos.update({
        where: { id_modulo: id },
        data: { estado: open ? (busy ? "Ocupado" : "Disponible") : "Cerrado" },
      });
      await audit(tx, a.id_usuario, open ? "ABRIR" : "CERRAR", "modulos", id);
      await this.dispatch(tx);
      return { ok: true };
    });
    this.events.changed();
    return result;
  }
  async setAttentionMode(a: Actor, body: unknown, moduleId?: number) {
    const d = parse(
      z.object({ atencion_automatica: z.boolean() }).strict(),
      body,
    );
    const result = await this.db.atomic(async (tx) => {
      let id: number;
      if (moduleId !== undefined) {
        requirePermission(a, "modulos.gestionar");
        if (!(await tx.modulos.findUnique({ where: { id_modulo: moduleId } })))
          throw new NotFoundException("Módulo inexistente");
        id = moduleId;
      } else {
        const u = await this.operator(tx, a);
        id = u.id_modulo_asignado!;
      }
      const m = await tx.modulos.update({
        where: { id_modulo: id },
        data: d,
      });
      await audit(
        tx,
        a.id_usuario,
        "CAMBIAR_MODO_ATENCION",
        "modulos",
        m.id_modulo,
        d,
      );
      // El turno en curso se conserva. Activar automático puede llamar al siguiente si está libre.
      if (d.atencion_automatica) await this.dispatch(tx);
      return { atencion_automatica: m.atencion_automatica };
    });
    this.events.changed();
    return result;
  }
  async callNext(a: Actor) {
    const result = await this.db.atomic(async (tx) => {
      const u = await this.operator(tx, a);
      const m = await tx.modulos.findUniqueOrThrow({
        where: { id_modulo: u.id_modulo_asignado! },
      });
      if (u.retiro_pendiente || m.estado === "Cerrado")
        throw new ConflictException(
          "Abre tu ventanilla y verifica que no tengas salida pendiente",
        );
      if (m.atencion_automatica)
        throw new ConflictException(
          "Activa el modo manual para llamar al siguiente turno",
        );
      if (
        m.estado !== "Disponible" ||
        (await tx.turnos.count({
          where: { id_modulo_atencion: m.id_modulo, estado: { in: BUSY } },
        }))
      )
        throw new ConflictException("Primero resuelve el turno actual");
      // Usa el mismo bloqueo, prioridad y filtros de servicio que la asignación automática.
      await this.dispatch(tx, m.id_modulo);
      const t = await tx.turnos.findFirst({
        where: { id_modulo_atencion: m.id_modulo, estado: { in: BUSY } },
      });
      if (!t)
        throw new ConflictException(
          "No hay turnos disponibles para tu ventanilla",
        );
      await audit(tx, a.id_usuario, "LLAMAR_SIGUIENTE", "turnos", t.id_turno);
      return this.ticket(t);
    });
    this.events.changed();
    return result;
  }
  async current(a: Actor) {
    const u = await this.operator(this.db, a, false);
    if (!u.id_modulo_asignado)
      return {
        modulo: null,
        retiro_pendiente: false,
        turno_actual: null,
        en_espera: 0,
        finalizados_hoy: 0,
        derivados_hoy: 0,
        proximos: [],
      };
    const m = await this.db.modulos.findUniqueOrThrow({
      where: { id_modulo: u.id_modulo_asignado! },
    });
    const active = await this.db.turnos.findFirst({
      where: { id_modulo_atencion: m.id_modulo, estado: { in: BUSY } },
    });
    const contributor = active?.id_contribuyente
      ? await this.db.contribuyentes.findUnique({
          where: { id_contribuyente: active.id_contribuyente },
        })
      : null;
    const enabled = await serviceIds(this.db, m.id_modulo, true);
    const waiting = enabled.length
      ? await this.db.turnos.findMany({
          where: {
            id_servicio: { in: enabled },
            AND: [
              {
                OR: [
                  { id_modulo_excluido: null },
                  { id_modulo_excluido: { not: m.id_modulo } },
                ],
              },
            ],
            estado: { in: WAITING },
            OR: [
              { estado: "DERIVADO" },
              { id_modulo_destino: null },
              { id_modulo_destino: m.id_modulo },
            ],
          },
        })
      : [];
    const start = new Date(limaDay().getTime() + 5 * 3600000);
    const finalizados = await this.db.historial_turnos.count({
      where: {
        id_modulo: m.id_modulo,
        id_usuario: u.id_usuario,
        estado: "FINALIZADO",
        fecha: { gte: start },
      },
    });
    const derivados = await this.db.derivaciones.count({
      where: {
        id_modulo_origen: m.id_modulo,
        fecha_hora_derivacion: { gte: start },
      },
    });
    return {
      modulo: { ...m, servicios_ids: enabled },
      retiro_pendiente: u.retiro_pendiente,
      turno_actual: active ? { ...active, contribuyente: contributor } : null,
      en_espera: waiting.length,
      finalizados_hoy: finalizados,
      derivados_hoy: derivados,
      proximos: orderQueue(waiting, new Date(), config.MAX_WAIT_MINUTES)
        .slice(0, 10)
        .map((t) => this.ticket(t)),
    };
  }
  async screenSettings() {
    return this.db.configuracion_pantalla.findUniqueOrThrow({
      where: { id: 1 },
    });
  }
  async setScreenSettings(a: Actor, body: unknown) {
    requirePermission(a, "pantalla.gestionar");
    const d = parse(
      z
        .object({
          modo: z.enum(["turnos", "video"]),
          video_url: z
            .string()
            .trim()
            .max(2048)
            .refine((v) => {
              if (!v) return true;
              try {
                const u = new URL(v);
                return (
                  u.protocol === "https:" &&
                  !u.username &&
                  !u.password &&
                  /\.(mp4|webm|ogg)$/i.test(u.pathname)
                );
              } catch {
                return false;
              }
            }, "Usa un enlace HTTPS directo a un video MP4, WebM u OGG"),
          video_expandido: z.boolean(),
          anuncio: z.string().trim().min(1).max(1000),
          anuncio_desplazable: z.boolean(),
          revision: z.number().int().positive(),
        })
        .strict()
        .refine(
          (d) => d.modo !== "video" || !!d.video_url,
          "Indica el video antes de transmitir",
        ),
      body,
    );
    const result = await this.db.atomic(async (tx) => {
      const previous = await tx.configuracion_pantalla.findUniqueOrThrow({
        where: { id: 1 },
      });
      if (previous.revision !== d.revision)
        throw new ConflictException(
          "Otro usuario cambió la pantalla. Recarga la configuración antes de guardar.",
        );
      const { revision, ...data } = d;
      const saved = await tx.configuracion_pantalla.update({
        where: { id: 1 },
        data: { ...data, revision: { increment: 1 } },
      });
      await audit(
        tx,
        a.id_usuario,
        "CONFIGURAR_PANTALLA",
        "configuracion_pantalla",
        1,
        { modo: d.modo, video_expandido: d.video_expandido },
      );
      return saved;
    });
    this.events.changed();
    return result;
  }
  async screen() {
    return this.db.$transaction(
      async (tx) => {
        const active = await tx.$queryRaw<
          any[]
        >`SELECT t.id_turno,t.codigo_ticket,t.estado,t.intentos_llamado,t.fecha_hora_llamado,s.nombre_servicio,m.numero_modulo FROM turnos t JOIN servicios s USING(id_servicio) JOIN modulos m ON m.id_modulo=t.id_modulo_atencion WHERE t.estado = 'LLAMADO' ORDER BY t.fecha_hora_llamado DESC,t.id_turno DESC`;
        const recent = await tx.$queryRaw<
          any[]
        >`SELECT h.id::text AS id_evento,t.codigo_ticket,h.fecha,s.nombre_servicio,m.numero_modulo FROM historial_turnos h JOIN turnos t USING(id_turno) JOIN servicios s ON s.id_servicio=h.id_servicio JOIN modulos m ON m.id_modulo=h.id_modulo WHERE (h.estado='LLAMADO' OR h.detalle='rellamar') AND h.fecha >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')-INTERVAL '24 hours' ORDER BY h.id DESC LIMIT 10`;
        const waiting = await tx.turnos.findMany({
          where: { estado: { in: WAITING } },
        });
        const services = await tx.servicios.findMany();
        const names = new Map(
          services.map((s) => [s.id_servicio, s.nombre_servicio]),
        );
        return {
          fecha: new Date().toISOString(),
          configuracion: await tx.configuracion_pantalla.findUniqueOrThrow({
            where: { id: 1 },
          }),
          actuales: active,
          ultimos_llamados: recent,
          proximos: orderQueue(waiting, new Date(), config.MAX_WAIT_MINUTES)
            .slice(0, 15)
            .map((t) => ({
              codigo_ticket: t.codigo_ticket,
              prioridad: t.prioridad,
              id_servicio: t.id_servicio,
              nombre_servicio: names.get(t.id_servicio),
              id_modulo_destino: t.id_modulo_destino,
            })),
          total_en_espera: waiting.length,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  async detail(id: number, a: Actor) {
    const t = await this.db.turnos.findUnique({ where: { id_turno: id } });
    if (!t) throw new NotFoundException();
    if (!can(a, "turnos.ver")) await this.allowed(this.db, a, t);
    return {
      ...t,
      historial: await this.db.historial_turnos.findMany({
        where: { id_turno: id },
        orderBy: { id: "asc" },
      }),
      derivaciones: await this.db.derivaciones.findMany({
        where: { id_turno: id },
        orderBy: { id_derivacion: "asc" },
      }),
    };
  }
  async tick() {
    await this.db.atomic((tx) => this.dispatch(tx));
    this.events.changed();
    return { ok: true };
  }
}
