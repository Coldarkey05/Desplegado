import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
test("TV: cuatro llamadas, retiro al iniciar atención, video expandido y cinta visible", async ({
  page,
  request,
}) => {
  const base = process.env.BACKEND_URL!,
    suffix = String(Date.now()).slice(-6),
    password = "Browser-" + randomUUID();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const call = async (
    p: string,
    method = "GET",
    data?: any,
    token?: string,
    status = 200,
  ) => {
    const r = await request.fetch(base + p, {
      method,
      data,
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    expect(r.status(), await r.text()).toBe(status);
    return r.json();
  };
  const login = async (name: string, pw: string, role: string) => {
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
  };
  const admin = await login("admin", process.env.TEST_ADMIN_PASSWORD!, "Admin");
  const service = await call(
    "/admin/servicios",
    "POST",
    { nombre_servicio: "TV " + suffix },
    admin,
    201,
  );
  const tickets: any[] = [],
    ops: string[] = [];
  for (let i = 0; i < 4; i++) {
    const m = await call(
      "/admin/modulos",
      "POST",
      {
        numero_modulo: `TV${i}-${suffix}`,
        servicios_ids: [service.id_servicio],
      },
      admin,
      201,
    );
    const u = await call(
      "/admin/usuarios",
      "POST",
      {
        dni: `3${suffix}${i}`,
        nombres: "TV",
        apellidos: "Pruebas",
        nombre_usuario: `tv${i}${suffix}`,
        password,
        rol_sistema: "Operador",
        id_modulo_asignado: m.id_modulo,
      },
      admin,
      201,
    );
    const op = await login(u.nombre_usuario, password, "Operador");
    ops.push(op);
    await call("/ventanilla/modo", "PATCH", { atencion_automatica: false }, op);
    await call("/ventanilla/abrir", "POST", {}, op, 201);
    tickets.push(
      await call(
        "/turnos",
        "POST",
        {
          dni: `4${suffix}${i}`,
          id_servicio: service.id_servicio,
          solicitud_id: randomUUID(),
        },
        admin,
        201,
      ),
    );
  }
  for (let i = 4; i < 10; i++)
    tickets.push(
      await call(
        "/turnos",
        "POST",
        {
          dni: `4${suffix}${i}`,
          id_servicio: service.id_servicio,
          solicitud_id: randomUUID(),
        },
        admin,
        201,
      ),
    );
  for (const op of ops)
    await call("/ventanilla/llamar-siguiente", "POST", {}, op, 201);
  await page.addInitScript(
    (key) => sessionStorage.setItem("sat.device.pantalla", key),
    process.env.DISPLAY_API_KEY!,
  );
  await page.goto("/pantalla");
  await expect(page.getByTestId("display-ticket")).toHaveText(
    tickets[3].codigo_ticket,
  );
  await expect(page.locator(".recent-calls article")).toHaveCount(3);
  expect((await page.locator(".recent-calls").boundingBox())!.y).toBeLessThan(
    (await page.locator(".current-call").boundingBox())!.y,
  );
  await expect(page.locator(".tv-latest>div")).toHaveCount(4);
  await expect(page.locator(".display-waiting>div").first()).toContainText(
    tickets[4].codigo_ticket,
  );
  await page.screenshot({ path: "test-results/tv-cuatro.png", fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: "test-results/tv-1366.png", fullPage: true });
  const tickerTop = (await page.locator(".public-footer").boundingBox())!.y;
  const destination = (await page
    .locator(".destination>strong")
    .boundingBox())!;
  expect(destination.y + destination.height).toBeLessThan(tickerTop);
  const lastWaiting = (await page
    .locator(".display-waiting>div")
    .last()
    .boundingBox())!;
  expect(lastWaiting.y + lastWaiting.height).toBeLessThanOrEqual(tickerTop);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await call("/turnos/" + tickets[3].id_turno + "/iniciar", "POST", {}, ops[3], 201);
  await expect(page.getByText(tickets[3].codigo_ticket, { exact: true })).toHaveCount(0, { timeout: 4000 });
  await expect(page.getByTestId("display-ticket")).toHaveText(tickets[2].codigo_ticket);
  await expect(page.locator(".recent-calls article")).toHaveCount(2);
  await expect(page.locator(".tv-latest>div")).toHaveCount(3);
  await call("/turnos/" + tickets[3].id_turno + "/finalizar", "POST", {}, ops[3], 201);
  await expect(page.getByText(tickets[3].codigo_ticket, { exact: true })).toHaveCount(0);
  await page.route("https://media.example.org/video.webm", (r) =>
    r.fulfill({
      path: path.resolve("tests/fixtures/video.webm"),
      contentType: "video/webm",
    }),
  );
  let cfg = await call("/pantalla/configuracion", "GET", undefined, admin);
  delete cfg.id;
  await call(
    "/pantalla/configuracion",
    "PATCH",
    {
      ...cfg,
      modo: "video",
      video_url: "https://media.example.org/video.webm",
      video_expandido: true,
      anuncio: "Atención al contribuyente · Bienvenidos",
      anuncio_desplazable: false,
    },
    ops[0],
  );
  await expect(page.locator("video")).toBeVisible();
  expect(await page.locator("video").evaluate(v => getComputedStyle(v).objectFit)).toBe("cover");
  const frameBox = (await page.locator(".tv-video").boundingBox())!;
  const videoBox = (await page.locator("video").boundingBox())!;
  expect(Math.abs(frameBox.width - videoBox.width)).toBeLessThan(2);
  expect(Math.abs(frameBox.height - videoBox.height)).toBeLessThan(2);

  await expect(page.locator(".screen-page")).toHaveClass(/video-expanded/);
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThan(1);
  const footer = page.locator(".public-footer");
  await expect(footer).toContainText("Bienvenidos");
  const visible = await footer.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return el.contains(
      document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
    );
  });
  expect(visible).toBe(true);
  await page.screenshot({ path: "test-results/tv-video.png", fullPage: true });
  await page
    .getByRole("button", { name: "Pantalla completa", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await expect(footer).toBeVisible();
  await page.evaluate(() => document.exitFullscreen());
  cfg = await call("/pantalla/configuracion", "GET", undefined, admin);
  delete cfg.id;
  await call(
    "/pantalla/configuracion",
    "PATCH",
    { ...cfg, modo: "turnos" },
    admin,
  );
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByTestId("display-ticket")).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await call("/turnos/" + tickets[i].id_turno + "/iniciar", "POST", {}, ops[i], 201);
    await expect(page.getByText(tickets[i].codigo_ticket, { exact: true })).toHaveCount(0, { timeout: 4000 });
  }
  await expect(page.getByTestId("display-ticket")).toHaveCount(0);
  await expect(page.locator(".recent-calls article")).toHaveCount(0);
  await expect(page.locator(".tv-latest>div")).toHaveCount(0);
  await expect(page.locator(".display-empty")).toContainText("Sin llamados activos");
  await page.reload();
  await expect(page.locator(".display-empty")).toContainText("Sin llamados activos");
  for (const t of tickets) {
    const detail = await call("/turnos/" + t.id_turno, "GET", undefined, admin);
    if (detail.estado !== "FINALIZADO")
      await call(
        "/turnos/" + t.id_turno + "/cancelar",
        "POST",
        { motivo: "Fin prueba TV" },
        admin,
        201,
      );
  }
  for (const op of ops)
    await call("/ventanilla/finalizar-jornada", "POST", {}, op, 201);
  expect(errors).toEqual([]);
});

test("Admin y operador seleccionan múltiples servicios desde sus pantallas", async ({
  page,
  request,
}) => {
  const suffix = String(Date.now()).slice(-6),
    password = "Browser-" + randomUUID();
  async function login(name: string, pw: string, role: string) {
    await page.goto("/login");
    await page.getByLabel("Nombre de usuario", { exact: true }).fill(name);
    await page.getByLabel("Contraseña", { exact: true }).fill(pw);
    await page.getByRole("button", { name: "Ingresar al sistema" }).click();
    await page
      .getByRole("button", { name: "Entrar como " + role, exact: true })
      .click();
  }
  await login("admin", process.env.TEST_ADMIN_PASSWORD!, "Admin");
  await expect(
    page.getByRole("link", { name: "Módulos", exact: true }),
  ).toBeVisible();
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("sat.session")!).token,
  );
  const create = async (p: string, data: any) => {
    const r = await request.post(process.env.BACKEND_URL + p, {
      headers: { Authorization: "Bearer " + token },
      data,
    });
    expect(r.status(), await r.text()).toBe(201);
    return r.json();
  };
  const a = await create("/admin/servicios", {
      nombre_servicio: "MS A " + suffix,
    }),
    b = await create("/admin/servicios", { nombre_servicio: "MS B " + suffix });
  await page.getByRole("link", { name: "Video y anuncios", exact: true }).click();
  await expect(page.getByLabel("Anuncio a los contribuyentes")).toBeVisible();
  await page.getByRole("link", { name: "Módulos", exact: true }).click();
  await expect(page.locator(".screen-controls")).toHaveCount(0);
  await page.getByRole("button", { name: "Nuevo módulo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nombre / número de módulo", { exact: false })
    .fill("MS-" + suffix);
  await dialog
    .getByRole("checkbox", { name: a.nombre_servicio, exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: b.nombre_servicio, exact: true })
    .check();
  await dialog.getByRole("button", { name: "Crear registro" }).click();
  await expect(dialog).toHaveCount(0);
  const mods = await request.get(
    process.env.BACKEND_URL + "/admin/modulos?limit=100",
    { headers: { Authorization: "Bearer " + token } },
  );
  const m = (await mods.json()).items.find(
    (r: any) => r.numero_modulo === "MS-" + suffix,
  );
  expect(m.servicios_ids).toEqual([a.id_servicio, b.id_servicio]);
  const u = await create("/admin/usuarios", {
    dni: "2" + suffix + "0",
    nombres: "UI",
    apellidos: "Multi",
    nombre_usuario: "uimulti" + suffix,
    password,
    rol_sistema: "Operador",
    id_modulo_asignado: m.id_modulo,
  });
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await login(u.nombre_usuario, password, "Operador");
  await page.getByRole("link", { name: "Mi ventanilla", exact: true }).click();
  const checks = page.getByRole("group", { name: "Servicios de atención" });
  await expect(
    checks.getByRole("checkbox", { name: a.nombre_servicio, exact: true }),
  ).toBeChecked();
  await expect(
    checks.getByRole("checkbox", { name: b.nombre_servicio, exact: true }),
  ).toBeChecked();
  await checks
    .getByRole("checkbox", { name: a.nombre_servicio, exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Guardar asignación", exact: true })
    .click();
  await expect(
    page.getByText(
      "Asignación guardada. Abre la ventanilla cuando estés listo.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    checks.getByRole("checkbox", { name: a.nombre_servicio, exact: true }),
  ).not.toBeChecked();
  await expect(page.locator(".screen-controls")).toHaveCount(0);
  await page.getByRole("link", { name: "Video y anuncios", exact: true }).click();
  await expect(page).toHaveURL(/\/control-pantalla$/);
  await expect(page.getByRole("heading", {name:"Control de pantalla pública", exact:true})).toBeVisible();
  await page
    .getByLabel("Anuncio a los contribuyentes")
    .fill("Aviso actualizado desde el operador");
  await page.getByRole("button", { name: "Aplicar a las pantallas" }).click();
  await expect(
    page.getByText("Pantalla pública actualizada", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/control-pantalla$/);
  await expect(page.getByLabel("Anuncio a los contribuyentes")).toHaveValue(
    "Aviso actualizado desde el operador",
  );
});
