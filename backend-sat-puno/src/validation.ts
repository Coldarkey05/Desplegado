import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
export function parse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  return r.data;
}
export const positive = z.number().int().positive();
export const dni = z.string().regex(/^\d{8}$/, "DNI debe contener 8 dígitos");
export const name = z.string().trim().min(1).max(100);
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const createSchemas = {
  servicios: z
    .object({
      nombre_servicio: name,
      descripcion: z.string().max(255).nullable().optional(),
      activo: z.boolean().optional(),
    })
    .strict(),
  modulos: z
    .object({
      numero_modulo: z.string().trim().min(1).max(20),
      estado: z.enum(["Disponible", "Cerrado"]).optional(),
      id_servicio_principal: positive.nullable().optional(),
      servicios_ids: z.array(positive).max(100).optional(),
    })
    .strict(),
  usuarios: z
    .object({
      dni,
      nombres: name,
      apellidos: name,
      rol_sistema: z
        .string()
        .regex(/^[A-Za-z][A-Za-z0-9_]{0,29}$/)
        .optional(),
      id_modulo_asignado: positive.nullable().optional(),
      nombre_usuario: z.string().trim().min(3).max(50),
      password: z
        .string()
        .min(12)
        .max(72)
        .refine(
          (v) => Buffer.byteLength(v, "utf8") <= 72,
          "Máximo 72 bytes UTF-8",
        ),
      correo: z.string().email().max(100).nullable().optional(),
      activo: z.boolean().optional(),
    })
    .strict(),
  tipospreferencia: z
    .object({
      nombre_tipo: z.string().trim().min(1).max(50),
      prioridad: z.number().int().min(0).max(100),
    })
    .strict(),
  contribuyentes: z
    .object({
      dni,
      nombres: name,
      apellidos: name,
      id_tipo_preferencia: positive,
    })
    .strict(),
};
export type Resource = keyof typeof createSchemas;
export function resource(s: string): Resource {
  if (!Object.hasOwn(createSchemas, s))
    throw new BadRequestException("Recurso no permitido");
  return s as Resource;
}
export const issueSchema = z
  .object({ dni, id_servicio: positive, solicitud_id: z.string().uuid() })
  .strict();
export const reasonSchema = z
  .object({ motivo: z.string().trim().min(3).max(255) })
  .strict();
export const transferSchema = reasonSchema
  .extend({ id_servicio_destino: positive })
  .strict();
