import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = (process.env.TEST_API_URL ?? "http://127.0.0.1:3100") + "/api";
test("Multiservicio: manual, automático, derivaciones, cuatro llamados, video y control de acceso", async () => {
  const suffix = String(Date.now()).slice(-6),
    password = "Test-" + randomUUID();
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    token?: string,
    status = 200,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json();
    assert.equal(r.status, status, JSON.stringify(d));
    return d;
  }
  async function login(name: string, pw: string, role: string) {
    const s = await call(
      "/auth/login",
      "POST",
      { nombre_usuario: name, password: pw },
      undefined,
      201,
    );
    return (
      await call(
        "/auth/seleccionar-rol",
        "POST",
        { rol: role },
        s.access_token,
        201,
      )
    ).access_token;
  }
  const admin = await login("admin", process.env.ADMIN_PASSWORD!, "Admin");
  const sv = [];
  for (let i = 0; i < 3; i++)
    sv.push(
      await call(
        "/admin/servicios",
        "POST",
        { nombre_servicio: `Multi ${i} ${suffix}` },
        admin,
        201,
      ),
    );
  const ids = sv.slice(0, 2).map((s) => s.id_servicio),
    mods = [],
    ops = [];
  for (let i = 0; i < 4; i++) {
    const m = await call(
      "/admin/modulos",
      "POST",
      { numero_modulo: `MT${i}-${suffix}`, servicios_ids: ids },
      admin,
      201,
    );
    mods.push(m);
    const user = await call(
      "/admin/usuarios",
      "POST",
      {
        dni: `8${suffix}${i}`,
        nombres: "Multi",
        apellidos: "Prueba",
        nombre_usuario: `multi${i}${suffix}`,
        password,
        rol_sistema: "Operador",
      },
      admin,
      201,
    );
    const op = await login(user.nombre_usuario, password, "Operador");
    ops.push(op);
    await call(
      "/ventanilla/asignacion",
      "PATCH",
      { id_modulo: m.id_modulo, servicios_ids: ids },
      op,
    );
    await call("/ventanilla/modo", "PATCH", { atencion_automatica: false }, op);
    await call("/ventanilla/abrir", "POST", {}, op, 201);
  }
  const issue = async (i: number, service = ids[i % 2]) =>
    call(
      "/turnos",
      "POST",
      {
        dni: `7${suffix}${i}`,
        id_servicio: service,
        solicitud_id: randomUUID(),
      },
      admin,
      201,
    );
  const tickets = [];
  for (let i = 0; i < 6; i++) tickets.push(await issue(i));
  const unrelated = await issue(6, sv[2].id_servicio);
  await call(
    "/ventanilla/asignacion",
    "PATCH",
    { id_modulo: mods[0].id_modulo, servicios_ids: [ids[0], ids[0]] },
    ops[0],
    400,
  );
  for (let i = 0; i < 4; i++) {
    const t = await call(
      "/ventanilla/llamar-siguiente",
      "POST",
      {},
      ops[i],
      201,
    );
    assert.equal(t.id_turno, tickets[i].id_turno);
    await call(`/turnos/${t.id_turno}/iniciar`, "POST", {}, ops[i], 201);
  }
  let screen = await call("/pantalla", "GET", undefined, admin);
  assert.equal(screen.actuales.length, 4);
  assert.deepEqual(
    screen.proximos.slice(0, 3).map((t: any) => t.codigo_ticket),
    [tickets[4], tickets[5], unrelated].map((t) => t.codigo_ticket),
  );
  await call(
    "/admin/modulos/" + mods[0].id_modulo,
    "PATCH",
    { servicios_ids: [ids[1]] },
    admin,
    409,
  );
  await call(
    "/turnos/" + tickets[0].id_turno + "/finalizar",
    "POST",
    {},
    ops[0],
    201,
  );
  screen = await call("/pantalla", "GET", undefined, admin);
  assert.ok(
    !screen.actuales.some((t: any) => t.id_turno === tickets[0].id_turno),
  );
  await call(
    "/admin/modulos/" + mods[0].id_modulo,
    "PATCH",
    { servicios_ids: [ids[1]] },
    admin,
  );
  assert.deepEqual(
    (await call("/admin/modulos/" + mods[0].id_modulo, "GET", undefined, admin))
      .servicios_ids,
    [ids[1]],
  );
  const next = await call(
    "/ventanilla/llamar-siguiente",
    "POST",
    {},
    ops[0],
    201,
  );
  assert.equal(next.id_turno, tickets[5].id_turno);
  await call("/turnos/" + next.id_turno + "/iniciar", "POST", {}, ops[0], 201);
  await call(
    "/turnos/" + tickets[2].id_turno + "/derivar",
    "POST",
    { id_servicio_destino: ids[1], motivo: "Derivación multiservicio" },
    ops[2],
    201,
  );
  await call(
    "/admin/modulos/" + mods[2].id_modulo + "/modo",
    "PATCH",
    { atencion_automatica: true },
    admin,
  );
  assert.equal(
    (await call("/ventanilla", "GET", undefined, ops[2])).turno_actual.id_turno,
    tickets[4].id_turno,
  );
  let cfg = await call("/pantalla/configuracion", "GET", undefined, admin);
  const { id, ...draft } = cfg;
  const update = {
    ...draft,
    modo: "video",
    video_url: "https://media.example.org/video.mp4",
    video_expandido: true,
    anuncio: "Bienvenidos a SAT Puno",
    anuncio_desplazable: false,
  };
  await call(
    "/pantalla/configuracion",
    "PATCH",
    { ...update, video_url: "javascript:alert(1)" },
    ops[0],
    400,
  );
  await call("/pantalla/configuracion", "PATCH", update, ops[0]);
  await call("/pantalla/configuracion", "PATCH", update, admin, 409);
  screen = await call("/pantalla", "GET", undefined, admin);
  assert.equal(screen.configuracion.modo, "video");
  assert.equal(screen.configuracion.anuncio, update.anuncio);
  const viewer = await call(
    "/admin/usuarios",
    "POST",
    {
      dni: `9${suffix}0`,
      nombres: "Solo",
      apellidos: "Lectura",
      nombre_usuario: "viewer" + suffix,
      password,
      rol_sistema: "Usuario",
    },
    admin,
    201,
  );
  const view = await login(viewer.nombre_usuario, password, "Usuario");
  await call("/pantalla/configuracion", "GET", undefined, view, 403);
  cfg = await call("/pantalla/configuracion", "GET", undefined, admin);
  delete cfg.id;
  await call(
    "/pantalla/configuracion",
    "PATCH",
    { ...cfg, modo: "turnos" },
    admin,
  );
  // Cleanup own tickets and windows so other suites have no active calls.
  for (const t of [...tickets, unrelated]) {
    const detail = await call("/turnos/" + t.id_turno, "GET", undefined, admin);
    if (
      ["EN ATENCION", "LLAMADO", "EN ESPERA", "DERIVADO"].includes(
        detail.estado,
      )
    )
      await call(
        "/turnos/" + t.id_turno + "/cancelar",
        "POST",
        { motivo: "Fin prueba" },
        admin,
        201,
      );
  }
  for (const op of ops)
    await call("/ventanilla/finalizar-jornada", "POST", {}, op, 201);
});
