import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD;
  if (
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    password.includes("CAMBIA")
  )
    throw new Error(
      "Configure ADMIN_PASSWORD segura de al menos 12 caracteres",
    );
  const hashed = await hash(password, 12);
  await db.$transaction(async (tx) => {
    for (const [nombre_tipo, prioridad] of [
      ["Ninguna", 0],
      ["Adulto Mayor", 1],
      ["Gestante", 1],
      ["Discapacitado", 1],
    ] as const) {
      await tx.tipospreferencia.upsert({
        where: { nombre_tipo },
        update: {},
        create: { nombre_tipo, prioridad },
      });
    }
    for (const nombre_servicio of [
      "Impuesto Predial",
      "Impuesto Vehicular",
      "Fiscalización",
      "Beneficios",
      "Constancia de No Adeudo",
      "Caja (pagos)",
      "Otros",
    ])
      await tx.servicios.upsert({
        where: { nombre_servicio },
        update: {},
        create: { nombre_servicio },
      });
    const existing = await tx.usuarios.findUnique({ where: { nombre_usuario: username } });
    if (!existing) {
      const dni = process.env.ADMIN_DNI ?? "";
      const nombres = process.env.ADMIN_NOMBRES?.trim();
      const apellidos = process.env.ADMIN_APELLIDOS?.trim();
      if (!/^\d{8}$/.test(dni) || !nombres || !apellidos)
        throw new Error("Configure ADMIN_DNI (8 dígitos), ADMIN_NOMBRES y ADMIN_APELLIDOS para crear al administrador inicial");
      const parent = await tx.usuarios.findFirst({ where: { activo: true, roles: { some: { rol: "Admin" } } }, orderBy: { nivel_admin: "asc" } });
      await tx.usuarios.create({ data: { dni, nombres, apellidos, nombre_usuario: username,
        contrasena_hash: hashed, rol_sistema: "Admin", nivel_admin: parent ? parent.nivel_admin! + 1 : 0,
        id_creador: parent?.id_usuario, roles: { create: { rol: "Admin" } } } });
    }

  });
  console.log(
    "Catálogos y administrador inicial preparados. No se sobrescribieron datos existentes.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
