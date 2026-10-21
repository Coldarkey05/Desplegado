-- V5: ampliación multiservicio y pantalla pública. Compatible con una V5 existente.
-- Detener backend, respaldar y ejecutar completo; no borra registros.
BEGIN;
ALTER TABLE modulos ADD COLUMN IF NOT EXISTS atencion_automatica BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS modulos_servicios (
 id_modulo INT NOT NULL REFERENCES modulos(id_modulo) ON DELETE CASCADE,
 id_servicio INT NOT NULL REFERENCES servicios(id_servicio) ON DELETE RESTRICT,
 PRIMARY KEY(id_modulo,id_servicio)
);
CREATE INDEX IF NOT EXISTS idx_modulos_servicios_servicio ON modulos_servicios(id_servicio,id_modulo);
INSERT INTO modulos_servicios SELECT id_modulo,id_servicio_principal FROM modulos WHERE id_servicio_principal IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS configuracion_pantalla (
 id INT PRIMARY KEY DEFAULT 1 CHECK(id=1),
 modo VARCHAR(10) NOT NULL DEFAULT 'turnos' CHECK(modo IN ('turnos','video')),
 video_url VARCHAR(2048) NOT NULL DEFAULT '',
 video_expandido BOOLEAN NOT NULL DEFAULT FALSE,
 anuncio VARCHAR(1000) NOT NULL DEFAULT 'Mantén tu ticket a la mano · Verifica tu número · Acércate a la ventanilla indicada',
 anuncio_desplazable BOOLEAN NOT NULL DEFAULT TRUE,
 revision INT NOT NULL DEFAULT 1,
 CHECK(modo <> 'video' OR video_url <> '')
);
INSERT INTO configuracion_pantalla(id) VALUES(1) ON CONFLICT DO NOTHING;
INSERT INTO permisos(codigo,nombre) VALUES('pantalla.gestionar','Gestionar video y anuncios de la pantalla pública') ON CONFLICT(codigo) DO NOTHING;
INSERT INTO roles_permisos SELECT r.id_rol,p.id_permiso FROM roles r CROSS JOIN permisos p
 WHERE r.codigo IN ('Admin','Operador') AND p.codigo='pantalla.gestionar' ON CONFLICT DO NOTHING;
COMMIT;
