import {
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  Controller,
  Post,
  Body,
  Get,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiBearerAuth, ApiBody, ApiTags } from "@nestjs/swagger";
import { permissionsFor, can } from "./permissions";
import { Database, Tx, audit } from "./database";
import { config } from "./config";
import { parse } from "./validation";
export type Actor = {
  permisos?: string[];
  nivel_admin?: number | null;
  id_creador?: number | null;
  id_usuario: number | null;
  nombre_usuario?: string;
  nombres?: string;
  apellidos?: string;
  roles?: string[];
  role_details?: {codigo:string;nombre:string;descripcion:string|null}[];
  rol_sistema: string;
};
export const Permit = (key: string) => SetMetadata("permission", key);
export const Access = (...roles: string[]) => SetMetadata("roles", roles);
export function equalSecret(a: unknown, b: string) {
  return (
    typeof a === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
@Injectable()
export class AuthService {
  private dummy = hash("dummy-timing-comparison-never-valid", 12);
  constructor(
    private db: Database,
    private jwt: JwtService,
  ) {}
  private async actor(c: any, role: string | null, tx:Tx=this.db): Promise<Actor> {
    const active = await tx.roles.findMany({where:{activo:true,codigo:{in:c.roles.map((r:any)=>r.rol)}}});
    return { id_usuario: c.id_usuario, nombre_usuario: c.nombre_usuario,
      nombres: c.nombres, apellidos: c.apellidos,
      roles: active.map(r=>r.codigo), role_details: active.map(r=>({codigo:r.codigo,nombre:r.nombre,descripcion:r.descripcion})), rol_sistema: role ?? "Seleccion",
      nivel_admin: c.nivel_admin, id_creador: c.id_creador,
      permisos: role ? await permissionsFor(tx,role) : [] };
  }
  private async session(c: any, role: string | null, tx:Tx=this.db) {
    return {
      access_token: await this.jwt.signAsync({ sub: c.id_usuario, v: c.version_token, role, schema: 5 }, { expiresIn: config.JWT_TTL_SECONDS }),
      token_type: "Bearer", expires_in: config.JWT_TTL_SECONDS, usuario: await this.actor(c, role,tx),
    };
  }
  async login(body: unknown) {
    const d = parse(z.object({ nombre_usuario: z.string().min(1).max(50),
      password: z.string().min(1).max(72).refine(v => Buffer.byteLength(v, "utf8") <= 72) }).strict(), body);
    const c = await this.db.usuarios.findUnique({ where: { nombre_usuario: d.nombre_usuario }, include: { roles: true } });
    const valid = await compare(d.password, c?.contrasena_hash ?? (await this.dummy));
    if (!c?.activo || !valid) throw new UnauthorizedException("Credenciales inválidas");
    await this.db.usuarios.update({ where: { id_usuario: c.id_usuario }, data: { ultimo_acceso: new Date() } });
    // Siempre pasa por el selector, aunque tenga un único rol.
    return this.session(c, null);
  }
  async token(token: string): Promise<Actor> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: number; v: number; role: string | null; schema: number }>(token);
      if (p.schema !== 5) throw new Error();
      const c = await this.db.usuarios.findUnique({ where: { id_usuario: p.sub }, include: { roles: true } });
      if (!c?.activo || c.version_token !== p.v || (p.role !== null && !c.roles.some(r => r.rol === p.role))) throw new Error();
      if(p.role && !(await this.db.roles.findUnique({where:{codigo:p.role}}))?.activo) throw new Error();
      return await this.actor(c, p.role);
    } catch { throw new UnauthorizedException("Sesión inválida o expirada; ingresa nuevamente"); }
  }
  async selectRole(a: Actor, body: unknown) {
    const d = parse(z.object({ rol: z.string().min(1).max(30) }).strict(), body);
    return this.db.atomic(async tx => {
      const c = await tx.usuarios.findUniqueOrThrow({ where: { id_usuario: a.id_usuario! }, include: { roles: true } });
      if (!c.activo || !c.roles.some(r => r.rol === d.rol) || !(await tx.roles.findUnique({where:{codigo:d.rol}}))?.activo) throw new ForbiddenException("No tienes asignado ese rol");
      // No deja una ventanilla recibiendo mientras trabaja en otro panel.
      if (!(await permissionsFor(tx,d.rol)).includes("ventanilla.atender") && c.id_modulo_asignado !== null)
        throw new ForbiddenException("Usa Dejar de atender y libera tu ventanilla antes de cambiar de rol");
      await audit(tx, c.id_usuario, "SELECCIONAR_ROL", "usuarios", c.id_usuario, { rol: d.rol });
      return this.session(c, d.rol,tx);
    });
  }
  async logout(a: Actor) {
    await this.db.usuarios.update({ where: { id_usuario: a.id_usuario! }, data: { version_token: { increment: 1 } } });
    return { ok: true };
  }

}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const allowed =
      this.reflector.getAllAndOverride<string[]>("roles", [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    let actor: Actor;
    if (
      allowed.includes("Kiosco") &&
      equalSecret(req.headers["x-device-key"], config.KIOSK_API_KEY)
    )
      actor = {
        id_usuario: null,
        rol_sistema: "Kiosco",
      };
    else if (
      allowed.includes("Pantalla") &&
      equalSecret(req.headers["x-device-key"], config.DISPLAY_API_KEY)
    )
      actor = {
        id_usuario: null,
        rol_sistema: "Pantalla",
      };
    else {
      const h = req.headers.authorization;
      if (!h?.startsWith("Bearer ")) throw new UnauthorizedException();
      actor = await this.auth.token(h.slice(7));
    }
    const permission = this.reflector.getAllAndOverride<string>("permission", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const device =
      actor.rol_sistema === "Kiosco" || actor.rol_sistema === "Pantalla";
    const permitted =
      permission && !device
        ? can(
            actor,
            permission === "catalog"
              ? `${req.params.recurso}.${({ GET: "ver", POST: "crear", PATCH: "editar", DELETE: "eliminar" } as Record<string, string>)[req.method]}`
              : permission,
          )
        : allowed.includes(actor.rol_sistema) || (allowed.includes("Authenticated") && actor.id_usuario !== null) || (allowed.includes("Workspace") && actor.id_usuario !== null && actor.rol_sistema !== "Seleccion");
    if (!permitted) throw new ForbiddenException("No tiene permisos");
    req.actor = actor;
    return true;
  }
}
@ApiTags("Autenticación")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}
  @Post("login")
  @ApiBody({
    schema: {
      type: "object",
      required: ["nombre_usuario", "password"],
      properties: {
        nombre_usuario: { type: "string" },
        password: { type: "string", format: "password" },
      },
    },
  })
  login(@Body() b: unknown) {
    return this.auth.login(b);
  }
  @Get("me")
  @UseGuards(AccessGuard)
  @Access("Authenticated")
  @ApiBearerAuth()
  me(@Req() r: any) {
    return r.actor;
  }
  @Post("seleccionar-rol")
  @UseGuards(AccessGuard)
  @Access("Authenticated")
  select(@Req() r: any, @Body() b: unknown) { return this.auth.selectRole(r.actor, b); }
  @Post("logout")
  @UseGuards(AccessGuard)
  @Access("Authenticated")
  @ApiBearerAuth()
  logout(@Req() r: any) {
    return this.auth.logout(r.actor);
  }
}
