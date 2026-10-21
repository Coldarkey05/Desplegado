import { serviceIds, setServices } from "./module-services";
import { permissionsFor, userCanAttend } from "./permissions";
import { authorizeGrant, accountLevel } from "./roles";
import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { requireManaged, managementReason } from "./hierarchy";
import { ForbiddenException } from "@nestjs/common";
import { hash } from "bcryptjs";
import { Database, Tx, audit } from "./database";
import {
  createSchemas,
  parse,
  resource,
  pageSchema,
  Resource,
} from "./validation";
import { Actor } from "./auth";
import { ACTIVE, BUSY, WAITING } from "./policy";
import { Events } from "./events";
import { QueueService } from "./queue";
export const keys: Record<Resource, string> = {
  servicios: "id_servicio",
  modulos: "id_modulo",
  usuarios: "id_usuario",
  tipospreferencia: "id_tipo_preferencia",
  contribuyentes: "id_contribuyente",
};
export function safe(row: any) {
  if (!row) return row;
  const { contrasena_hash, version_token, ...rest } = row;
  return rest;
}
@Injectable()
export class CatalogService {
  constructor(
    private db: Database,
    private events: Events,
    private queue: QueueService,
  ) {}
  async decorate(row: any, kind: string, a: Actor) {
    let reason: string | null = null;
    if (kind === "usuarios") reason = await managementReason(this.db, a, row);
    return {
      ...safe(row),
      ...(kind === "modulos"
        ? { servicios_ids: await serviceIds(this.db, row.id_modulo) }
        : {}),
      ...(kind === "usuarios"
        ? {
            roles: (
              await this.db.usuarios_roles.findMany({
                where: { id_usuario: row.id_usuario },
              })
            ).map((r) => r.rol),
          }
        : {}),
      puede_editar: !reason,
      puede_eliminar: !reason,
      motivo_proteccion: reason,
    };
  }
  async list(r: string, q: unknown, a: Actor) {
    const kind = resource(r);
    const p = parse(pageSchema, q);
    const model = (this.db as any)[kind];
    return {
      items: await Promise.all(
        (
          await model.findMany({
            skip: (p.page - 1) * p.limit,
            take: p.limit,
            orderBy: { [keys[kind]]: "asc" },
          })
        ).map((row: any) => this.decorate(row, kind, a)),
      ),
      total: await model.count(),
      ...p,
    };
  }
  async get(r: string, id: number, a: Actor) {
    const kind = resource(r);
    const row = await (this.db as any)[kind].findUnique({
      where: { [keys[kind]]: id },
    });
    if (!row) throw new NotFoundException();
    return this.decorate(row, kind, a);
  }
  async mutate(
    r: string,
    id: number | undefined,
    body: unknown,
    a: Actor,
    remove = false,
  ) {
    const kind = resource(r);
    const schema = createSchemas[kind];
    const d: any = remove ? {} : parse(id ? schema.partial() : schema, body);
    if (!remove && id && !Object.keys(d).length)
      throw new BadRequestException("No hay campos para modificar");
    if (d.password) {
      d.contrasena_hash = await hash(d.password, 12);
      delete d.password;
    }
    const result = await this.db.atomic(async (tx) => {
      const model = (tx as any)[kind];
      const where = { [keys[kind]]: id };
      const previous = id ? await model.findUnique({ where }) : null;
      if (id && !previous) throw new NotFoundException();
      let moduleServices: number[] | undefined;
      if (kind === "modulos" && !remove) {
        if (
          d.servicios_ids !== undefined &&
          Object.hasOwn(d, "id_servicio_principal")
        )
          throw new BadRequestException(
            "Envía servicios_ids o servicio principal, no ambos",
          );
        moduleServices =
          d.servicios_ids ??
          (Object.hasOwn(d, "id_servicio_principal")
            ? d.id_servicio_principal
              ? [d.id_servicio_principal]
              : []
            : undefined);
        delete d.servicios_ids;
        if (moduleServices) d.id_servicio_principal = moduleServices[0] ?? null;
      }
      const merged = { ...previous, ...d };
      if (kind === "usuarios") {
        if (previous) await requireManaged(tx, a, previous);
        if (id && Object.hasOwn(d, "rol_sistema"))
          throw new BadRequestException("Asigna los roles desde Asignar roles");
        if (!id) {
          d.id_creador = a.id_usuario;
          d.rol_sistema ??= "Usuario";
        }
        if (!id) {
          const role = await tx.roles.findUnique({
            where: { codigo: d.rol_sistema },
          });
          if (!role?.activo)
            throw new BadRequestException("Rol inexistente o inactivo");
          const ps = await permissionsFor(tx, role.codigo);
          await authorizeGrant(tx, a, ps);
          d.nivel_admin = await accountLevel(tx, a, ps, null);
        }
        if (
          Object.hasOwn(d, "id_modulo_asignado") &&
          (!id || d.id_modulo_asignado !== previous.id_modulo_asignado)
        ) {
          const targetId: number | null = d.id_modulo_asignado;
          if (
            targetId &&
            (merged.activo === false ||
              !(id
                ? await userCanAttend(tx, id)
                : (await permissionsFor(tx, d.rol_sistema)).includes(
                    "ventanilla.atender",
                  )))
          )
            throw new BadRequestException(
              "La cuenta debe estar activa y tener permiso de atención de ventanilla",
            );
          const ids = [previous?.id_modulo_asignado, targetId].filter(
            (x): x is number => !!x,
          );
          if (
            await tx.turnos.count({
              where: {
                estado: { in: BUSY },
                OR: [
                  ...(id ? [{ id_usuario_atencion: id }] : []),
                  { id_modulo_atencion: { in: ids } },
                ],
              },
            })
          )
            throw new ConflictException(
              "Finaliza la atención antes de cambiar el módulo",
            );
          if (targetId) {
            const module = await tx.modulos.findUnique({
              where: { id_modulo: targetId },
            });
            if (!module) throw new NotFoundException("Módulo inexistente");
            if (
              module.estado === "Ocupado" ||
              (await tx.usuarios.count({
                where: {
                  id_modulo_asignado: targetId,
                  ...(id ? { id_usuario: { not: id } } : {}),
                },
              }))
            )
              throw new ConflictException(
                "Módulo no disponible: ya está asignado",
              );
            await tx.modulos.update({
              where: { id_modulo: targetId },
              data: { estado: "Cerrado" },
            });
          }
          if (previous?.id_modulo_asignado)
            await tx.modulos.update({
              where: { id_modulo: previous.id_modulo_asignado },
              data: { estado: "Cerrado" },
            });
          d.retiro_pendiente = false;
          if (id)
            await audit(
              tx,
              a.id_usuario,
              "CAMBIAR_MODULO_ADMIN",
              "usuarios",
              id,
              { anterior: previous.id_modulo_asignado, nuevo: targetId },
            );
        }
        if (remove && (await tx.usuarios.count({ where: { id_creador: id } })))
          throw new ConflictException(
            "Usuario con cuentas creadas; desactívalo para conservar su jerarquía",
          );
        if (
          previous?.nivel_admin !== null &&
          previous?.nivel_admin !== undefined &&
          previous.activo &&
          (remove || d.activo === false) &&
          (await tx.usuarios.count({
            where: { activo: true, roles: { some: { rol: "Admin" } } },
          })) <= 1
        )
          throw new ConflictException("Debe existir al menos un Admin activo");
        if (
          (Object.hasOwn(d, "id_modulo_asignado")
            ? d.id_modulo_asignado
            : previous?.id_modulo_asignado) &&
          (remove || d.activo === false)
        )
          throw new ConflictException(
            "Libera la ventanilla con Relevar o Dejar de atender antes de cambiar esta cuenta",
          );
        if (
          id &&
          !remove &&
          (d.contrasena_hash || Object.hasOwn(d, "activo") || d.nombre_usuario)
        )
          d.version_token = { increment: 1 };
      }
      if (kind === "servicios" && id) {
        if (
          remove &&
          ((await tx.turnos.count({ where: { id_servicio: id } })) ||
            (await tx.derivaciones.count({
              where: {
                OR: [{ id_servicio_origen: id }, { id_servicio_destino: id }],
              },
            })))
        )
          throw new ConflictException(
            "Servicio con historial; use activo:false",
          );
        if (
          (remove || d.activo === false) &&
          (await tx.turnos.count({
            where: { id_servicio: id, estado: { in: ACTIVE } },
          }))
        )
          throw new ConflictException("Servicio con turnos activos");
      }
      if (kind === "modulos" && id) {
        if (
          remove &&
          ((await tx.derivaciones.count({
            where: {
              OR: [{ id_modulo_origen: id }, { id_modulo_destino: id }],
            },
          })) ||
            (await tx.turnos.count({ where: { id_modulo_destino: id } })))
        )
          throw new ConflictException(
            "Módulo usado en derivaciones; use estado Cerrado",
          );
        if (
          await tx.turnos.count({
            where: { id_modulo_atencion: id, estado: { in: BUSY } },
          })
        )
          throw new ConflictException(
            "Módulo ocupado; finalice o derive primero",
          );
        if (
          (remove ||
            d.estado === "Cerrado" ||
            (Object.hasOwn(d, "id_servicio_principal") &&
              d.id_servicio_principal !== previous.id_servicio_principal)) &&
          (await tx.turnos.count({
            where: { id_modulo_destino: id, estado: { in: WAITING } },
          }))
        )
          throw new ConflictException("Módulo con derivaciones pendientes");
      }
      if (kind === "usuarios") {
        if (
          id &&
          (await tx.turnos.count({
            where: { id_usuario_atencion: id, estado: { in: BUSY } },
          }))
        )
          throw new ConflictException("Usuario atendiendo un turno");
        if (
          !remove &&
          merged.activo !== false &&
          merged.id_modulo_asignado &&
          (await tx.usuarios.count({
            where: {
              id_modulo_asignado: merged.id_modulo_asignado,
              activo: true,
              ...(id ? { id_usuario: { not: id } } : {}),
            },
          }))
        )
          throw new ConflictException(
            "Ya existe un usuario activo asignado a ese módulo",
          );
      }
      if (kind === "contribuyentes") {
        if (
          id &&
          (await tx.turnos.count({
            where: {
              id_contribuyente: id,
              estado: { in: remove ? ACTIVE : BUSY },
            },
          }))
        )
          throw new ConflictException("Contribuyente con turno activo");
        if (!remove) {
          const p = await tx.tipospreferencia.findUnique({
            where: { id_tipo_preferencia: merged.id_tipo_preferencia },
          });
          if (!p)
            throw new BadRequestException("Tipo de preferencia inexistente");
          d.es_preferencial = p.prioridad > 0;
        }
      }
      if (kind === "tipospreferencia") {
        if (
          remove &&
          (await tx.contribuyentes.count({
            where: { id_tipo_preferencia: id },
          }))
        )
          throw new ConflictException(
            "Tipo de preferencia usado por contribuyentes",
          );
        if (
          previous?.nombre_tipo === "Ninguna" &&
          (remove ||
            (d.nombre_tipo && d.nombre_tipo !== "Ninguna") ||
            (d.prioridad !== undefined && d.prioridad !== 0))
        )
          throw new ConflictException(
            "Ninguna es el tipo base y debe conservar prioridad 0",
          );
        if (!remove && id && d.prioridad !== undefined)
          await tx.contribuyentes.updateMany({
            where: { id_tipo_preferencia: id },
            data: { es_preferencial: d.prioridad > 0 },
          });
      }
      const row = remove
        ? await model.delete({ where })
        : id
          ? await model.update({ where, data: d })
          : await model.create({ data: d });
      if (!remove && kind === "modulos") {
        if (moduleServices)
          await setServices(tx, row.id_modulo, moduleServices);
        if (
          row.estado === "Disponible" &&
          (!(await serviceIds(tx, row.id_modulo, true)).length ||
            !(await this.queue.availableOperator(tx, row.id_modulo)))
        )
          throw new ConflictException(
            "Asigna servicios activos y operador antes de abrir la ventanilla",
          );
      }
      if (!remove && kind === "contribuyentes")
        await this.queue.syncPreference(tx, row.id_contribuyente, a);
      if (!remove && kind === "tipospreferencia" && d.prioridad !== undefined) {
        const contributors = await tx.contribuyentes.findMany({
          where: { id_tipo_preferencia: row.id_tipo_preferencia },
        });
        for (const c of contributors)
          await this.queue.syncPreference(tx, c.id_contribuyente, a);
      }
      if (kind === "usuarios" && !id && !remove)
        await tx.usuarios_roles.create({
          data: { id_usuario: row.id_usuario, rol: row.rol_sistema },
        });
      // Se registran nombres de campos, jamás contraseñas/hashes/DNI.
      await audit(
        tx,
        a.id_usuario,
        remove ? "ELIMINAR" : id ? "EDITAR" : "CREAR",
        kind,
        row[keys[kind]],
        {
          campos: Object.keys(d).filter(
            (k) => !["contrasena_hash", "version_token"].includes(k),
          ),
        },
      );
      await this.queue.dispatch(tx);
      return remove ? { ok: true } : safe(row);
    });
    this.events.changed();
    return result;
  }
}
