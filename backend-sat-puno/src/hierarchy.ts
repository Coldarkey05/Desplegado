import { ForbiddenException } from "@nestjs/common";
import { Tx } from "./database";
import type { Actor } from "./auth";
export async function managementReason(tx: Tx, a: Actor, target: any): Promise<string | null> {
  const actor = a.id_usuario ? await tx.usuarios.findUnique({
    where: { id_usuario: a.id_usuario }, include: { roles: true },
  }) : null;
  if (!actor?.activo) return "Usuario inactivo";
  if (target.nivel_admin != null && (a.rol_sistema !== "Admin" || !actor.roles.some(r => r.rol === "Admin"))) return "Solo Admin puede modificar cuentas administrativas";
  if (target.nivel_admin !== null && target.nivel_admin !== undefined &&
      (actor.nivel_admin === null || actor.nivel_admin >= target.nivel_admin))
    return "Solo un administrador de rango superior puede modificar esta cuenta";
  const seen = new Set<number>();
  let current: any = actor;
  while (current) {
    if (current.id_usuario === target.id_usuario)
      return "No puedes modificar tu propia cuenta ni la de un administrador que te creó";
    if (seen.has(current.id_usuario)) return "Jerarquía administrativa inválida";
    seen.add(current.id_usuario);
    current = current.id_creador ? await tx.usuarios.findUnique({ where: { id_usuario: current.id_creador } }) : null;
  }
  return null;
}
export async function requireManaged(tx: Tx, a: Actor, target: any) {
  const reason = await managementReason(tx, a, target);
  if (reason) throw new ForbiddenException(reason);
}
