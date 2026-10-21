import type { PrismaClient } from "@prisma/client";
export async function checkSchema(db: PrismaClient) {
  try {
    // Read-only checks. No CREATE/ALTER and no migration history.
    await db.$queryRaw`SELECT 1`;
    for (const name of [
      "modulos_servicios",
      "configuracion_pantalla",
      "usuarios",
      "usuarios_roles",
      "roles",
      "permisos",
      "roles_permisos",
      "servicios",
      "modulos",
      "contribuyentes",
      "tipospreferencia",
      "turnos",
      "derivaciones",
      "historial_turnos",
      "auditoria",
      "contadores_ticket",
    ] as const) {
      await (db[name] as any).findFirst();
    }
    const admin = await db.roles.findUnique({ where: { codigo: "Admin" } });
    const none = await db.tipospreferencia.findUnique({
      where: { nombre_tipo: "Ninguna" },
    });
    if (!admin?.activo || !none)
      throw Error("Faltan catálogos iniciales Admin o Ninguna");
    const seq = await db.$queryRaw<
      { name: string | null }[]
    >`SELECT to_regclass('public.cola_orden_asignacion_seq')::text AS name`;
    if (!seq[0].name) throw Error("Falta la secuencia de asignación");
    return { status: "ok", version: "5", mode: "conexion-directa" };
  } catch (e) {
    throw new Error(
      "No se pudo validar el esquema V5. Comprueba DATABASE_URL, permisos y el SQL base-datos/SAT_Puno_V5.sql (base nueva) o ACTUALIZAR_V5_MULTISERVICIO_TV.sql (V5 existente). No se ejecutaron migraciones. " +
        (e instanceof Error ? e.message : "Error de conexión"),
    );
  }
}
