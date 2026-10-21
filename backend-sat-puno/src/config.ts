import "dotenv/config";
import { z } from "zod";
const secret = z
  .string()
  .min(32)
  .refine((v) => !v.includes("CAMBIA"), "Reemplaza el valor de ejemplo");
const env = z
  .object({
    DATABASE_URL: z.string().startsWith("postgres"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default("0.0.0.0"),
    CORS_ORIGINS: z.string().default("http://localhost:5173"),
    JWT_SECRET: secret,
    JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(28800),
    KIOSK_API_KEY: secret,
    DISPLAY_API_KEY: secret,
    ATTENTION_MODE: z
      .enum(["automatico", "confirmacion"])
      .default("confirmacion"),
    MAX_CALL_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
    MAX_WAIT_MINUTES: z.coerce.number().int().min(1).max(240).default(30),
    ENABLE_SWAGGER: z.enum(["true", "false"]).default("true"),
  })
  .safeParse(process.env);
if (!env.success)
  throw new Error(
    "Configuración inválida: " +
      env.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "),
  );
export const config = env.data;
export const origins = [config.CORS_ORIGINS, process.env.RENDER_EXTERNAL_URL ?? ""].join(",").split(",")
  .map((s) => s.trim())
  .filter(Boolean);
