import { BadRequestException } from "@nestjs/common";
export const ACTIVE = [
  "GENERADO",
  "EN ESPERA",
  "DERIVADO",
  "LLAMADO",
  "EN ATENCION",
];
export const BUSY = ["LLAMADO", "EN ATENCION"];
export const WAITING = ["EN ESPERA", "DERIVADO"];
export function requireState(state: string | null, allowed: string[]) {
  if (!state || !allowed.includes(state))
    throw new BadRequestException(`Acción no permitida desde ${state}`);
}
export function limaDay(now = new Date()) {
  return new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now) + "T00:00:00.000Z",
  );
}
export function orderQueue<
  T extends { fecha_cola: Date; prioridad: number; id_turno: number },
>(rows: T[], now: Date, maxWait: number) {
  return [...rows].sort(
    (a, b) =>
      b.prioridad - a.prioridad ||
      a.fecha_cola.getTime() - b.fecha_cola.getTime() ||
      a.id_turno - b.id_turno,
  );
}
