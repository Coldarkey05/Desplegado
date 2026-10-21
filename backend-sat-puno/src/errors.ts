import { randomUUID } from "node:crypto";
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
@Catch()
export class Errors implements ExceptionFilter {
  private logger = new Logger("API");
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const requestId = randomUUID();
    let code = "ERROR_INTERNO";
    let status = 500;
    let message: unknown = "Error interno";
    if (e instanceof HttpException) {
      status = e.getStatus();
      const r = e.getResponse();
      message = typeof r === "string" ? r : (r as any).message;
    } else if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        status = 409;
        message = "Registro duplicado o conflicto de atención";
      } else if (["P2003", "P2014"].includes(e.code)) {
        status = 409;
        message =
          "Referencia inexistente o registro usado por otras tablas; desactive cuando sea posible";
      } else if (e.code === "P2025") {
        status = 404;
        message = "Registro no encontrado";
      } else if (
        ["P2021", "P2022"].includes(e.code) ||
        (e.code === "P2010" &&
          ["42P01", "42703"].includes(String(e.meta?.code)))
      ) {
        status = 503;
        code = "ESQUEMA_INCOMPATIBLE";
        message =
          "La base no tiene el esquema V5 requerido. Ejecuta npm run db:check y revisa la base seleccionada; no ejecutes migraciones antiguas.";
      } else if (e.code === "P2010" && String(e.meta?.code) === "42501") {
        status = 503;
        code = "PERMISOS_BASE_DATOS";
        message =
          "La cuenta de conexión no tiene permisos suficientes en la base de datos. Contacta al administrador.";
      } else if (
        ["P2034", "P2028"].includes(e.code) ||
        (e.code === "P2010" &&
          ["40001", "40P01", "55P03"].includes(String(e.meta?.code)))
      ) {
        status = 503;
        code = "BASE_DATOS_OCUPADA";
        message =
          "La base de datos está ocupada. Reintenta la operación; en emisión conserva la misma solicitud.";
      }
      this.logger.error(
        JSON.stringify({ requestId, prisma: e.code, sqlstate: e.meta?.code }),
      );
    }
    if (status === 500)
      this.logger.error(e instanceof Error ? e.stack : "Error no identificado");
    res.status(status).json({
      statusCode: status,
      message,
      code: status >= 500 ? code : undefined,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
