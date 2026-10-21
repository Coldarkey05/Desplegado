import { requireManaged, managementReason } from "./hierarchy";
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  ServiceUnavailableException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiSecurity,
  ApiBody,
  ApiOperation,
} from "@nestjs/swagger";
import { z } from "zod";
import { requirePermission } from "./permissions";
import { audit } from "./database";
import { Database } from "./database";
import { Access, AccessGuard, Permit } from "./auth";
import { CatalogService } from "./catalog";
import { QueueService } from "./queue";
import { Reports } from "./reports";
import { parse, pageSchema } from "./validation";
import { ACTIVE } from "./policy";
@ApiTags("Administración")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(AccessGuard)
@Access("Admin")
export class AdminController {
  constructor(
    private catalogs: CatalogService,
    private db: Database,
    private queue: QueueService,
    private reports: Reports,
  ) {}
  @Patch("modulos/:id/modo")
  @Permit("modulos.gestionar")
  moduleMode(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() r: any,
  ) {
    return this.queue.setAttentionMode(r.actor, body, id);
  }
  @Post("modulos/:id/abrir")
  @Permit("ventanilla.relevar")
  openModule(@Param("id", ParseIntPipe) id: number, @Req() r: any) {
    return this.queue.open(r.actor, true, id);
  }
  @Post("modulos/:id/liberar")
  @Permit("ventanilla.relevar")
  releaseModule(@Param("id", ParseIntPipe) id: number, @Req() r: any) {
    return this.queue.endShift(r.actor, id);
  }
  @Get("reportes") @Permit("reportes.ver") reportsGet(@Query() q: unknown) {
    return this.reports.summary(q);
  }
  @Get("auditoria") @Permit("auditoria.ver") async audit(@Query() q: unknown) {
    const p = parse(pageSchema, q);
    return {
      items: await this.db.auditoria.findMany({
        orderBy: { id: "desc" },
        skip: (p.page - 1) * p.limit,
        take: p.limit,
      }),
      total: await this.db.auditoria.count(),
      ...p,
    };
  }
  @Get("turnos") @Permit("turnos.ver") async turns(@Query() q: unknown) {
    const p = parse(
      pageSchema.extend({
        estado: z
          .enum([
            "GENERADO",
            "EN ESPERA",
            "DERIVADO",
            "LLAMADO",
            "EN ATENCION",
            "FINALIZADO",
            "NO PRESENTADO",
            "CANCELADO",
          ])
          .optional(),
        fecha: z.string().date().optional(),
        id_servicio: z.coerce.number().int().positive().optional(),
      }),
      q,
    );
    const where = {
      ...(p.estado ? { estado: p.estado } : {}),
      ...(p.fecha ? { fecha_jornada: new Date(p.fecha + "T00:00:00Z") } : {}),
      ...(p.id_servicio ? { id_servicio: p.id_servicio } : {}),
    };
    return {
      items: await this.db.turnos.findMany({
        where,
        orderBy: { id_turno: "desc" },
        skip: (p.page - 1) * p.limit,
        take: p.limit,
      }),
      total: await this.db.turnos.count({ where }),
      page: p.page,
      limit: p.limit,
    };
  }
  @Get("derivaciones") @Permit("derivaciones.ver") async transfers(
    @Query() q: unknown,
  ) {
    const p = parse(pageSchema, q);
    return {
      items: await this.db.derivaciones.findMany({
        orderBy: { id_derivacion: "desc" },
        skip: (p.page - 1) * p.limit,
        take: p.limit,
      }),
      total: await this.db.derivaciones.count(),
      ...p,
    };
  }
  @Post("cola/reanudar") @Permit("ventanilla.relevar") resume() {
    return this.queue.tick();
  }
  @Get(":recurso") @Permit("catalog") list(
    @Param("recurso") r: string,
    @Query() q: unknown,
    @Req() req: any,
  ) {
    return this.catalogs.list(r, q, req.actor);
  }
  @Get(":recurso/:id") @Permit("catalog") get(
    @Param("recurso") r: string,
    @Param("id", ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.catalogs.get(r, id, req.actor);
  }
  @Post(":recurso")
  @Permit("catalog")
  @ApiBody({ schema: { type: "object", additionalProperties: true } })
  create(@Param("recurso") r: string, @Body() b: unknown, @Req() req: any) {
    return this.catalogs.mutate(r, undefined, b, req.actor);
  }
  @Patch(":recurso/:id")
  @Permit("catalog")
  @ApiBody({ schema: { type: "object", additionalProperties: true } })
  update(
    @Param("recurso") r: string,
    @Param("id", ParseIntPipe) id: number,
    @Body() b: unknown,
    @Req() req: any,
  ) {
    return this.catalogs.mutate(r, id, b, req.actor);
  }
  @Delete(":recurso/:id") @Permit("catalog") remove(
    @Param("recurso") r: string,
    @Param("id", ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    return this.catalogs.mutate(r, id, {}, req.actor, true);
  }
}
@ApiTags("Turnos y ventanilla")
@ApiBearerAuth()
@Controller()
@UseGuards(AccessGuard)
export class QueueController {
  constructor(
    private queue: QueueService,
    private db: Database,
  ) {}
  @Get("opciones/:recurso")
  @Access("Workspace")
  async options(@Param("recurso") resource: string, @Req() req: any) {
    const needs: Record<string, string[]> = {
      servicios: ["servicios", "modulos", "cola", "ventanilla", "tickets"],
      modulos: ["usuarios", "modulos", "cola", "ventanilla"],
      usuarios: ["usuarios", "cola"],
      tipospreferencia: ["contribuyentes", "preferencias"],
      roles: ["usuarios", "roles"],
    };
    const deps = needs[resource];
    if (!deps) throw new ForbiddenException();
    if (
      req.actor.rol_sistema !== "Admin" &&
      !deps.some((d) =>
        req.actor.permisos?.some((p: string) => p.startsWith(d + ".")),
      )
    )
      throw new ForbiddenException();
    if (resource === "roles")
      return this.db.roles.findMany({
        where: { activo: true },
        select: { codigo: true, nombre: true },
        orderBy: { nombre: "asc" },
      });
    const select: Record<string, any> = {
      servicios: { id_servicio: true, nombre_servicio: true, activo: true },
      modulos: { id_modulo: true, numero_modulo: true },
      usuarios: {
        id_usuario: true,
        nombres: true,
        apellidos: true,
        activo: true,
      },
      tipospreferencia: {
        id_tipo_preferencia: true,
        nombre_tipo: true,
        prioridad: true,
      },
    };
    if (resource === "modulos") {
      const modules = await this.db.modulos.findMany({
        orderBy: { numero_modulo: "asc" },
        include: {
          _count: {
            select: {
              usuarios: true,
              turnos_turnos_id_modulo_atencionTomodulos: {
                where: { estado: { in: ["LLAMADO", "EN ATENCION"] } },
              },
            },
          },
        },
      });
      return modules.map((m) => ({
        id_modulo: m.id_modulo,
        numero_modulo: m.numero_modulo,
        disponible_para_asignar:
          m.estado !== "Ocupado" &&
          m._count.usuarios === 0 &&
          m._count.turnos_turnos_id_modulo_atencionTomodulos === 0,
      }));
    }
    return (this.db as any)[resource].findMany({ select: select[resource] });
  }
  @Get("orientacion/preferencias")
  @Permit("preferencias.asignar")
  preferences() {
    return this.db.tipospreferencia.findMany({
      orderBy: { prioridad: "desc" },
    });
  }
  @Get("orientacion/contribuyente/:dni")
  @Permit("preferencias.asignar")
  contributor(@Param("dni") dni: string) {
    return this.queue.contributor(dni);
  }
  @Patch("orientacion/contribuyente/:dni")
  @Permit("preferencias.asignar")
  preference(
    @Param("dni") dni: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    return this.queue.setPreference(dni, body, req.actor);
  }
  @Get("servicios")
  @Access("Workspace", "Kiosco")
  @ApiSecurity("device")
  services() {
    return this.db.servicios.findMany({
      where: { activo: true },
      select: { id_servicio: true, nombre_servicio: true, descripcion: true },
      orderBy: { nombre_servicio: "asc" },
    });
  }
  @Post("turnos")
  @Permit("tickets.emitir")
  @Access("Admin", "Operador", "Ventanilla", "Kiosco")
  @ApiSecurity("device")
  @ApiOperation({
    summary: "Emitir ticket; solicitud_id UUID evita duplicar al reintentar",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["dni", "id_servicio", "solicitud_id"],
      properties: {
        dni: { type: "string", example: "12345678" },
        id_servicio: { type: "integer", example: 1 },
        solicitud_id: { type: "string", format: "uuid" },
      },
    },
  })
  issue(@Body() b: unknown, @Req() r: any) {
    return this.queue.issue(b, r.actor);
  }
  @Get("turnos/:id")
  @Access("Workspace")
  detail(@Param("id", ParseIntPipe) id: number, @Req() r: any) {
    return this.queue.detail(id, r.actor);
  }
  @Post("turnos/:id/:accion")
  @Access("Workspace")
  @ApiOperation({
    summary: "iniciar, rellamar, finalizar, no-presentado, cancelar o derivar",
  })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        id_servicio_destino: { type: "integer" },
      },
    },
  })
  action(
    @Param("id", ParseIntPipe) id: number,
    @Param("accion") action: string,
    @Body() b: unknown,
    @Req() r: any,
  ) {
    return this.queue.action(id, action, b, r.actor);
  }
  @Post("ventanilla/finalizar-jornada")
  @Permit("ventanilla.atender")
  endShift(@Req() r: any) {
    return this.queue.endShift(r.actor);
  }
  @Get("ventanilla/asignacion")
  @Permit("ventanilla.atender")
  assignmentOptions(@Req() r: any) {
    return this.queue.assignmentOptions(r.actor);
  }
  @Patch("ventanilla/asignacion")
  @Permit("ventanilla.asignacion")
  changeAssignment(@Req() r: any, @Body() body: unknown) {
    return this.queue.changeAssignment(r.actor, body);
  }
  @Patch("ventanilla/modo")
  @Permit("ventanilla.atender")
  attentionMode(@Req() r: any, @Body() body: unknown) {
    return this.queue.setAttentionMode(r.actor, body);
  }
  @Post("ventanilla/llamar-siguiente")
  @Permit("ventanilla.atender")
  callNext(@Req() r: any) {
    return this.queue.callNext(r.actor);
  }
  @Get("ventanilla")
  @Permit("ventanilla.atender")
  current(@Req() r: any) {
    return this.queue.current(r.actor);
  }
  @Post("ventanilla/abrir")
  @Permit("ventanilla.atender")
  open(@Req() r: any) {
    return this.queue.open(r.actor, true);
  }
  @Post("ventanilla/cerrar")
  @Permit("ventanilla.atender")
  close(@Req() r: any) {
    return this.queue.open(r.actor, false);
  }
  @Get("pantalla/configuracion")
  @Permit("pantalla.gestionar")
  screenSettings() {
    return this.queue.screenSettings();
  }
  @Patch("pantalla/configuracion")
  @Permit("pantalla.gestionar")
  updateScreen(@Req() r: any, @Body() b: unknown) {
    return this.queue.setScreenSettings(r.actor, b);
  }
  @Get("pantalla")
  @Permit("pantalla.ver")
  @Access("Admin", "Operador", "Ventanilla", "Pantalla")
  @ApiSecurity("device")
  screen() {
    return this.queue.screen();
  }
}
@ApiTags("Salud")
@Controller("health")
export class HealthController {
  constructor(private db: Database) {}
  @Get() async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (e) {
      console.error(
        "Health database failure",
        e instanceof Error ? e.message : "unknown",
      );
      throw new ServiceUnavailableException("Base de datos no disponible");
    }
  }
}
