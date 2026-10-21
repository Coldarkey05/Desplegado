import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { Errors } from "../src/errors";
test("Errores SQL distinguen esquema, permisos y bloqueo temporal", () => {
  for (const [sqlstate, expected] of [
    ["42P01", "ESQUEMA_INCOMPATIBLE"],
    ["42501", "PERMISOS_BASE_DATOS"],
    ["55P03", "BASE_DATOS_OCUPADA"],
    ["42601", "ERROR_INTERNO"],
  ]) {
    let status = 0;
    let body: any;
    const response = {
      status(value: number) {
        status = value;
        return this;
      },
      json(value: any) {
        body = value;
      },
    };
    new Errors().catch(
      new Prisma.PrismaClientKnownRequestError("Prueba SQL", {
        code: "P2010",
        clientVersion: "6.19.0",
        meta: { code: sqlstate },
      }),
      { switchToHttp: () => ({ getResponse: () => response }) } as any,
    );
    assert.equal(status, sqlstate === "42601" ? 500 : 503);
    assert.equal(body.code, expected);
    assert.ok(body.requestId);
    assert.notEqual(status, 409);
  }
});
