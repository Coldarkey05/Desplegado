import { RolesController } from "./roles";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { config } from "./config";
import { Database } from "./database";
import { AuthService, AuthController, AccessGuard } from "./auth";
import { Events } from "./events";
import { QueueService } from "./queue";
import { CatalogService } from "./catalog";
import { Reports } from "./reports";
import {
  AdminController,
  QueueController,
  HealthController,
} from "./controllers";
@Module({
  imports: [
    JwtModule.register({
      secret: config.JWT_SECRET,
      signOptions: {
        algorithm: "HS256",
        issuer: "sat-puno-colas",
        audience: "sat-puno",
      },
      verifyOptions: {
        algorithms: ["HS256"],
        issuer: "sat-puno-colas",
        audience: "sat-puno",
      },
    }),
  ],
  controllers: [
    RolesController,
    AuthController,
    AdminController,
    QueueController,
    HealthController,
  ],
  providers: [
    Database,
    AuthService,
    AccessGuard,
    Events,
    QueueService,
    CatalogService,
    Reports,
  ],
})
export class AppModule {}
