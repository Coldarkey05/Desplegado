import { test } from "node:test";
import assert from "node:assert/strict";
import { limaDay, orderQueue, requireState } from "../src/policy";
test("La jornada usa medianoche de Lima, no UTC", () => {
  assert.equal(
    limaDay(new Date("2026-09-29T04:59:59Z")).toISOString(),
    "2026-09-28T00:00:00.000Z",
  );
  assert.equal(
    limaDay(new Date("2026-09-29T05:00:00Z")).toISOString(),
    "2026-09-29T00:00:00.000Z",
  );
});
test("Preferenciales primero, FIFO dentro de la prioridad", () => {
  const now = new Date("2026-09-29T15:00Z");
  const rows = [
    { id_turno: 1, prioridad: 0, fecha_cola: new Date("2026-09-29T14:50Z") },
    { id_turno: 2, prioridad: 1, fecha_cola: new Date("2026-09-29T14:52Z") },
    { id_turno: 3, prioridad: 1, fecha_cola: new Date("2026-09-29T14:51Z") },
  ];
  assert.deepEqual(
    orderQueue(rows, now, 30).map((x) => x.id_turno),
    [3, 2, 1],
  );
});
test("La preferencia adelanta incluso a un turno regular antiguo", () => {
  const rows = [
    { id_turno: 1, prioridad: 0, fecha_cola: new Date("2026-09-29T14:00Z") },
    { id_turno: 2, prioridad: 100, fecha_cola: new Date("2026-09-29T14:52Z") },
  ];
  assert.equal(
    orderQueue(rows, new Date("2026-09-29T15:00Z"), 30)[0].id_turno,
    2,
  );
});
test("Rechaza iniciar/finalizar estados incompatibles", () => {
  assert.throws(() => requireState("FINALIZADO", ["EN ATENCION"]));
  assert.throws(() => requireState(null, ["LLAMADO"]));
  assert.doesNotThrow(() => requireState("LLAMADO", ["LLAMADO"]));
});
