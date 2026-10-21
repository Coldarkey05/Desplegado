-- Para una base V5 existente. Ejecutar una vez antes de iniciar el backend actualizado.
-- No elimina datos ni requiere el historial de migraciones anteriores.
BEGIN;
ALTER TABLE public.modulos
 ADD COLUMN IF NOT EXISTS atencion_automatica BOOLEAN NOT NULL DEFAULT TRUE;
COMMIT;
