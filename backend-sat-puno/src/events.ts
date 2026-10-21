import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { config, origins } from "./config";
import { AuthService, equalSecret } from "./auth";
@WebSocketGateway({
  namespace: "/cola",
  cors: { origin: origins, credentials: false },
  maxHttpBufferSize: 10000,
})
export class Events implements OnGatewayInit {
  @WebSocketServer() server!: Server;
  constructor(private auth: AuthService) {}
  afterInit(server: Server) {
    server.use(async (socket, next) => {
      try {
        const a = socket.handshake.auth;
        if (
          !equalSecret(a.deviceKey, config.DISPLAY_API_KEY) &&
          !equalSecret(a.deviceKey, config.KIOSK_API_KEY)
        )
          await this.auth.token(a.token ?? "");
        next();
      } catch {
        next(new Error("No autorizado"));
      }
    });
  }
  // Solo invalidaciones: nunca DNI, nombres, credenciales ni datos de atención privados.
  // Los clientes recuperan snapshot por HTTP al conectar y al recibir este evento.
  changed() {
    this.server?.emit("cola:actualizada", { fecha: new Date().toISOString() });
  }
}
