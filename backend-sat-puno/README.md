# Backend SAT Puno V5

NestJS + Prisma Client + PostgreSQL + Socket.io. Lee `../INICIAR.md`.

Conexión directa a una base creada con el SQL V5; no incluye historial de migraciones ni aplica DDL al arrancar.

```sh
npm ci
npm run prisma:generate
npm run db:check
npm run db:seed
npm run build
npm start
```

Configura `.env` antes de ejecutar. `db:seed` se utiliza para preparar la primera cuenta, no en cada arranque. `db:check` es de solo lectura.

Pruebas unitarias: `npm test`. Pruebas API: `npm run test:integration`, solo contra una base de pruebas con API levantada, `TEST_API_URL` y `ADMIN_PASSWORD` configurados. Las pruebas crean datos sintéticos y modifican cuentas de prueba; no ejecutarlas en producción.

Contrato resumido en `docs/API.md` y Swagger `/docs`.
