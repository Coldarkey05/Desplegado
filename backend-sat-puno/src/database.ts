import { checkSchema } from "./check-schema";
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient, Prisma } from "@prisma/client";
export type Tx = Prisma.TransactionClient;
@Injectable()
export class Database
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    await checkSchema(this);
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  // Un bloqueo transaccional compartido por todas las mutaciones de cola y catálogo.
  // ReadCommitted ve el commit anterior DESPUÉS de adquirir el bloqueo.
  async atomic<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout = '8s'`;
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(726001)::text`;
            return fn(tx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 10000,
            timeout: 20000,
          },
        );
      } catch (e) {
        const transient =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          (e.code === "P2034" ||
            (e.code === "P2010" &&
              ["40001", "40P01", "55P03"].includes(String(e.meta?.code))));
        if (!transient || attempt >= 2) throw e;
        await new Promise((resolve) =>
          setTimeout(resolve, 80 * (attempt + 1) + Math.random() * 100),
        );
      }
    }
  }
}
export async function audit(
  tx: Tx,
  actor: number | null,
  action: string,
  entity: string,
  id: number | null,
  detail: Prisma.InputJsonValue = {},
) {
  await tx.auditoria.create({
    data: {
      id_usuario: actor,
      accion: action,
      entidad: entity,
      entidad_id: id,
      detalle: detail,
    },
  });
}
