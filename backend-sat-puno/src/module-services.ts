import { BadRequestException, ConflictException } from "@nestjs/common";
import { Tx } from "./database";
import { BUSY, WAITING } from "./policy";
// Legacy principal is retained for old integrations. All new writes synchronize both.
export async function serviceIds(
  tx: Tx,
  id: number,
  activeOnly = false,
): Promise<number[]> {
  const m = await tx.modulos.findUnique({
    where: { id_modulo: id },
    include: { habilitaciones: true },
  });
  if (!m) return [];
  const ids = [
    ...new Set([
      ...m.habilitaciones.map((h) => h.id_servicio),
      ...(m.id_servicio_principal ? [m.id_servicio_principal] : []),
    ]),
  ];
  if (!activeOnly) return ids.sort((a, b) => a - b);
  return (
    await tx.servicios.findMany({
      where: { id_servicio: { in: ids }, activo: true },
      select: { id_servicio: true },
      orderBy: { id_servicio: "asc" },
    })
  ).map((s) => s.id_servicio);
}
export async function setServices(tx: Tx, id: number, ids: number[]) {
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException("No repitas servicios");
  if (
    (await tx.servicios.count({
      where: { id_servicio: { in: ids }, activo: true },
    })) !== ids.length
  )
    throw new BadRequestException("Selecciona servicios activos existentes");
  if (
    await tx.turnos.count({
      where: {
        id_servicio: { notIn: ids },
        OR: [
          { id_modulo_atencion: id, estado: { in: BUSY } },
          { id_modulo_destino: id, estado: { in: WAITING } },
        ],
      },
    })
  )
    throw new ConflictException(
      "No puedes retirar un servicio con atención o derivaciones pendientes",
    );
  await tx.modulos_servicios.deleteMany({ where: { id_modulo: id } });
  if (ids.length)
    await tx.modulos_servicios.createMany({
      data: ids.map((id_servicio) => ({ id_modulo: id, id_servicio })),
    });
  await tx.modulos.update({
    where: { id_modulo: id },
    data: { id_servicio_principal: ids[0] ?? null },
  });
}
