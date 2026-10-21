import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { NestExpressApplication } from "@nestjs/platform-express";
import { resolve, extname } from "node:path";
import { existsSync } from "node:fs";
import type { Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import { AppModule } from "./app";
import { config, origins } from "./config";
import { Errors } from "./errors";
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // BIGINT de auditoría como cadena: preserva precisión JSON.
  app
    .getHttpAdapter()
    .getInstance()
    .set("json replacer", (_key: string, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  app.enableCors({
    origin: origins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Key"],
  });
  // Render termina TLS y reenvía la IP del cliente mediante su proxy.
  if (process.env.RENDER === "true") app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: { directives: {
    "media-src": ["'self'", "https:"],
    "connect-src": ["'self'", ...origins, ...origins.map(o => o.replace(/^http/, "ws"))],
    "upgrade-insecure-requests": process.env.NODE_ENV === "production" ? [] : null,
  } } }));
  // Una única URL para React, REST y Socket.io. Nunca servir código ni .env.
  const webRoot = resolve(__dirname, "../../public");
  if (existsSync(resolve(webRoot, "index.html"))) {
    app.useStaticAssets(webRoot, { index: false, dotfiles: "deny" });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (!["GET", "HEAD"].includes(req.method) ||
          /^\/(api|socket\.io|docs)(\/|$)/.test(req.path) || extname(req.path) || req.path.split("/").some(part => part.startsWith("."))) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(resolve(webRoot, "index.html"));
    });
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("Frontend compilado no encontrado. Ejecuta el build de la raíz.");
  }
  app.use(
    "/api/auth/login",
    rateLimit({
      skip: (req) => req.method === "OPTIONS",
      windowMs: 15 * 60000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(
    "/api",
    rateLimit({
      skip: (req) => req.method === "OPTIONS",
      windowMs: 60000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  if (config.ENABLE_SWAGGER === "true") {
    const options = new DocumentBuilder()
      .setTitle("SAT Puno — Sistema de colas")
      .setDescription(
        "V5: roles dinámicos, permisos y conexión directa a PostgreSQL.",
      )
      .setVersion("5.0.0")
      .addBearerAuth()
      .addApiKey(
        { type: "apiKey", in: "header", name: "X-Device-Key" },
        "device",
      )
      .build();
    SwaggerModule.setup(
      "docs",
      app,
      SwaggerModule.createDocument(app, options),
    );
  }
  await app.listen(config.PORT, config.HOST);
  console.log(`API http://${config.HOST}:${config.PORT}/api — Swagger /docs`);
}
bootstrap().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
