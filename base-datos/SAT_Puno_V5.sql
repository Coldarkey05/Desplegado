-- SAT Puno V5: instalación directa. Ejecutar sobre base VACÍA. Sin Prisma Migrate.
-- SOLO BASE VACIA. No borra ni reemplaza una instalacion existente.
-- Crear previamente: CREATE DATABASE sat_puno_colas ENCODING 'UTF8';
-- Conectarse a esa base y ejecutar ESTE archivo completo.
-- Los TIMESTAMP representan UTC; fecha_jornada representa el dia en America/Lima.
BEGIN;
SET LOCAL search_path = public;


CREATE TABLE roles (
 id_rol INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 codigo VARCHAR(30) NOT NULL UNIQUE CHECK(codigo ~ '^[A-Za-z][A-Za-z0-9_]{0,29}$'),
 nombre VARCHAR(80) NOT NULL CHECK(length(trim(nombre))>0), descripcion VARCHAR(255),
 es_sistema BOOLEAN NOT NULL DEFAULT FALSE, activo BOOLEAN NOT NULL DEFAULT TRUE,
 fecha_creacion TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE TABLE permisos (
 id_permiso INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 codigo VARCHAR(80) NOT NULL UNIQUE, nombre VARCHAR(100) NOT NULL, descripcion VARCHAR(255)
);
CREATE TABLE roles_permisos (
 id_rol INT NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
 id_permiso INT NOT NULL REFERENCES permisos(id_permiso) ON DELETE CASCADE,
 PRIMARY KEY(id_rol,id_permiso)
);
INSERT INTO roles(codigo,nombre,descripcion,es_sistema) VALUES
 ('Admin','Administrador','Administración del sistema',TRUE),
 ('Operador','Operador','Atención en ventanilla',TRUE),
 ('Orientador','Orientador','Tickets y preferencias',TRUE),
 ('Supervisor','Supervisor','Supervisión de atención y reportes',TRUE),
 ('Usuario','Usuario','Consulta de servicios y cola',TRUE);
INSERT INTO permisos(codigo,nombre) VALUES
('usuarios.ver','Consultar usuarios'),
('usuarios.crear','Crear usuarios'),
('usuarios.editar','Editar usuarios'),
('usuarios.eliminar','Eliminar usuarios'),
('roles.ver','Consultar roles'),
('roles.crear','Crear roles'),
('roles.editar','Editar roles y permisos'),
('roles.eliminar','Eliminar roles'),
('roles.asignar','Asignar roles'),
('servicios.ver','Consultar servicios'),
('servicios.gestionar','Gestionar servicios'),
('modulos.ver','Consultar módulos'),
('modulos.gestionar','Gestionar módulos'),
('contribuyentes.ver','Consultar contribuyentes'),
('contribuyentes.gestionar','Gestionar contribuyentes'),
('preferencias.gestionar','Gestionar preferencias'),
('tickets.emitir','Emitir tickets'),
('tickets.cancelar','Cancelar tickets'),
('cola.ver','Consultar cola y derivaciones'),
('pantalla.ver','Ver pantalla de atención'),
('ventanilla.atender','Atender, finalizar y derivar'),
('ventanilla.asignacion','Cambiar asignación propia'),
('ventanilla.relevar','Abrir módulos y relevar personal'),
('reportes.ver','Ver reportes'),
('auditoria.ver','Ver auditoría');
INSERT INTO roles_permisos SELECT r.id_rol,p.id_permiso FROM roles r CROSS JOIN permisos p WHERE r.codigo='Admin';
INSERT INTO roles_permisos SELECT r.id_rol,p.id_permiso FROM roles r CROSS JOIN permisos p WHERE r.codigo='Operador' AND p.codigo IN ('servicios.ver','modulos.ver','contribuyentes.ver','cola.ver','pantalla.ver','ventanilla.atender','ventanilla.asignacion');
INSERT INTO roles_permisos SELECT r.id_rol,p.id_permiso FROM roles r CROSS JOIN permisos p WHERE r.codigo='Orientador' AND p.codigo IN ('servicios.ver','contribuyentes.ver','contribuyentes.gestionar','preferencias.gestionar','tickets.emitir','cola.ver','pantalla.ver');
INSERT INTO roles_permisos SELECT r.id_rol,p.id_permiso FROM roles r CROSS JOIN permisos p WHERE r.codigo='Supervisor' AND p.codigo IN ('servicios.ver','modulos.ver','contribuyentes.ver','cola.ver','pantalla.ver','ventanilla.relevar','tickets.cancelar','reportes.ver');
INSERT INTO roles_permisos SELECT r.id_rol,p.id_permiso FROM roles r CROSS JOIN permisos p WHERE r.codigo='Usuario' AND p.codigo IN ('cola.ver','pantalla.ver');

CREATE TABLE servicios (
 id_servicio INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 nombre_servicio VARCHAR(100) NOT NULL UNIQUE,
 descripcion VARCHAR(255), activo BOOLEAN DEFAULT TRUE
);
CREATE TABLE tipospreferencia (
 id_tipo_preferencia INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 nombre_tipo VARCHAR(50) NOT NULL UNIQUE,
 prioridad INT NOT NULL DEFAULT 1 CHECK (prioridad BETWEEN 0 AND 100)
);
INSERT INTO tipospreferencia(nombre_tipo,prioridad) VALUES
 ('Ninguna',0),('Adulto Mayor',1),('Gestante',1),('Discapacitado',1);

CREATE SEQUENCE cola_orden_asignacion_seq;
CREATE TABLE modulos (
 atencion_automatica BOOLEAN NOT NULL DEFAULT TRUE,
 id_modulo INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 numero_modulo VARCHAR(20) NOT NULL UNIQUE,
 estado VARCHAR(20) DEFAULT 'Disponible',
 id_servicio_principal INT REFERENCES servicios(id_servicio) ON DELETE SET NULL,
 orden_ultima_asignacion BIGINT NOT NULL DEFAULT 0,
 CONSTRAINT chk_modulo_estado CHECK (estado IN ('Disponible','Ocupado','Cerrado'))
);
CREATE TABLE usuarios (
 id_usuario INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 dni VARCHAR(8) NOT NULL UNIQUE,
 nombres VARCHAR(100) NOT NULL, apellidos VARCHAR(100) NOT NULL,
 nombre_usuario VARCHAR(50) NOT NULL UNIQUE,
 contrasena_hash VARCHAR(255) NOT NULL, correo VARCHAR(100),
 rol_sistema VARCHAR(30) NOT NULL DEFAULT 'Usuario' REFERENCES roles(codigo) ON UPDATE CASCADE ON DELETE RESTRICT,
 id_modulo_asignado INT REFERENCES modulos(id_modulo) ON DELETE SET NULL,
 fecha_creacion TIMESTAMP DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 ultimo_acceso TIMESTAMP, activo BOOLEAN DEFAULT TRUE,
 version_token INT NOT NULL DEFAULT 1,
 retiro_pendiente BOOLEAN NOT NULL DEFAULT FALSE,
 id_creador INT REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
 nivel_admin INT CHECK (nivel_admin >= 0)
);
-- rol_sistema = rol principal; usuarios_roles = conjunto de accesos autorizados.
-- No existe usuarios.rol ni credenciales_sistema.
CREATE TABLE usuarios_roles (
 id_usuario INT NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
 rol VARCHAR(30) NOT NULL REFERENCES roles(codigo) ON UPDATE CASCADE ON DELETE RESTRICT,
 fecha_asignacion TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
 PRIMARY KEY(id_usuario,rol)
);
CREATE TABLE contribuyentes (
 id_contribuyente INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 dni VARCHAR(8) NOT NULL UNIQUE,
 nombres VARCHAR(100) NOT NULL, apellidos VARCHAR(100) NOT NULL,
 es_preferencial BOOLEAN DEFAULT FALSE,
 id_tipo_preferencia INT NOT NULL DEFAULT 1,
 fecha_registro TIMESTAMP DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 CONSTRAINT fk_contribuyente_tipo_preferencia FOREIGN KEY(id_tipo_preferencia)
 REFERENCES tipospreferencia(id_tipo_preferencia)
);
CREATE TABLE turnos (
 id_turno INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 codigo_ticket VARCHAR(10) NOT NULL,
 id_contribuyente INT REFERENCES contribuyentes(id_contribuyente) ON DELETE SET NULL,
 id_servicio INT NOT NULL REFERENCES servicios(id_servicio) ON DELETE RESTRICT,
 id_modulo_atencion INT REFERENCES modulos(id_modulo) ON DELETE SET NULL,
 id_usuario_atencion INT REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
 fecha_hora_emision TIMESTAMP DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 fecha_hora_llamado TIMESTAMP,
 fecha_hora_inicio_atencion TIMESTAMP,
 fecha_hora_fin_atencion TIMESTAMP,
 estado VARCHAR(20) DEFAULT 'GENERADO', intentos_llamado INT DEFAULT 0,
 fecha_jornada DATE NOT NULL,
 prioridad INT NOT NULL DEFAULT 0,
 fecha_cola TIMESTAMP NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 id_modulo_destino INT REFERENCES modulos(id_modulo) ON DELETE RESTRICT,
 id_modulo_excluido INT REFERENCES modulos(id_modulo) ON DELETE RESTRICT,
 solicitud_id UUID UNIQUE,
 motivo_cierre VARCHAR(255),
 CONSTRAINT chk_turno_estado CHECK (estado IN
 ('GENERADO','EN ESPERA','LLAMADO','EN ATENCION','DERIVADO','FINALIZADO','NO PRESENTADO','CANCELADO'))
);
CREATE TABLE derivaciones (
 id_derivacion INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_turno INT NOT NULL REFERENCES turnos(id_turno) ON DELETE CASCADE,
 id_modulo_origen INT NOT NULL REFERENCES modulos(id_modulo) ON DELETE RESTRICT,
 id_modulo_destino INT NOT NULL REFERENCES modulos(id_modulo) ON DELETE RESTRICT,
 fecha_hora_derivacion TIMESTAMP DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 motivo VARCHAR(255),
 id_servicio_origen INT REFERENCES servicios(id_servicio) ON DELETE RESTRICT,
 id_servicio_destino INT REFERENCES servicios(id_servicio) ON DELETE RESTRICT
);
-- Destino provisional al derivar; el backend actualiza el destino cuando despacha.
-- Conservar NOT NULL: el backend V5 exige un modulo destino abierto habilitado.
CREATE TABLE contadores_ticket (
 fecha DATE NOT NULL, prefijo VARCHAR(1) NOT NULL, valor INT NOT NULL,
 PRIMARY KEY(fecha,prefijo)
);
CREATE TABLE auditoria (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 fecha TIMESTAMP NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 id_usuario INT, accion VARCHAR(60) NOT NULL,
 entidad VARCHAR(40) NOT NULL, entidad_id INT,
 detalle JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE historial_turnos (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id_turno INT NOT NULL REFERENCES turnos(id_turno) ON DELETE RESTRICT,
 fecha TIMESTAMP NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'UTC'),
 estado VARCHAR(20) NOT NULL,
 id_servicio INT NOT NULL, id_modulo INT, id_usuario INT, detalle VARCHAR(255)
);
-- IDs historicos sin FK al personal: se conservan aunque se elimine una cuenta.
-- El backend registra cada transicion e identifica a su actor.

CREATE UNIQUE INDEX uq_ticket_jornada ON turnos(fecha_jornada,codigo_ticket);
CREATE UNIQUE INDEX uq_modulo_atencion_activa ON turnos(id_modulo_atencion)
 WHERE estado IN ('LLAMADO','EN ATENCION');
CREATE UNIQUE INDEX uq_contribuyente_activo ON turnos(id_contribuyente)
 WHERE estado IN ('GENERADO','EN ESPERA','DERIVADO','LLAMADO','EN ATENCION');
CREATE INDEX idx_turno_codigo ON turnos(codigo_ticket);
CREATE INDEX idx_turno_estado ON turnos(estado);
CREATE INDEX idx_turno_fecha ON turnos(fecha_hora_emision);
CREATE INDEX idx_cola_seleccion ON turnos(id_servicio,estado,fecha_cola);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);
CREATE INDEX idx_historial_turno ON historial_turnos(id_turno,fecha);

-- Refuerzo de integridad: no inventa identidades, no reasigna modulos ni elimina datos.
-- Una infraccion aborta la transaccion: corregir datos conscientemente y repetir.
ALTER TABLE servicios ALTER COLUMN activo SET NOT NULL;
ALTER TABLE modulos ALTER COLUMN estado SET NOT NULL,
 ALTER COLUMN estado SET DEFAULT 'Cerrado';
ALTER TABLE usuarios ALTER COLUMN activo SET NOT NULL,
 ALTER COLUMN fecha_creacion SET NOT NULL,
 ADD CONSTRAINT uq_usuario_modulo UNIQUE(id_modulo_asignado),
 ADD CONSTRAINT chk_usuario_dni CHECK(dni ~ '^[0-9]{8}$'),
 ADD CONSTRAINT chk_usuario_token CHECK(version_token >= 1),
 ADD CONSTRAINT chk_usuario_creador_distinto CHECK(id_creador IS NULL OR id_creador <> id_usuario),
 ADD CONSTRAINT chk_usuario_identidad CHECK(length(trim(nombres))>0 AND length(trim(apellidos))>0 AND length(trim(nombre_usuario))>=3);
-- Diferida: permite crear usuario y roles, o reemplazar sus roles, en una transaccion.
ALTER TABLE usuarios ADD CONSTRAINT fk_usuario_rol_principal
 FOREIGN KEY(id_usuario,rol_sistema) REFERENCES usuarios_roles(id_usuario,rol)
 DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE contribuyentes ALTER COLUMN es_preferencial SET NOT NULL,
 ALTER COLUMN fecha_registro SET NOT NULL,
 ADD CONSTRAINT chk_contribuyente_dni CHECK(dni ~ '^[0-9]{8}$');
ALTER TABLE turnos ALTER COLUMN estado SET NOT NULL,
 ALTER COLUMN intentos_llamado SET NOT NULL,
 ALTER COLUMN fecha_hora_emision SET NOT NULL,
 ADD CONSTRAINT chk_turno_intentos CHECK(intentos_llamado >= 0),
 ADD CONSTRAINT chk_turno_prioridad CHECK(prioridad BETWEEN 0 AND 100);
ALTER TABLE derivaciones ALTER COLUMN fecha_hora_derivacion SET NOT NULL,
 ADD CONSTRAINT chk_derivacion_otro_modulo CHECK(id_modulo_origen <> id_modulo_destino);
ALTER TABLE contadores_ticket ADD CONSTRAINT chk_contador_positivo CHECK(valor >= 0);
CREATE UNIQUE INDEX uq_usuario_atencion_activa ON turnos(id_usuario_atencion)
 WHERE estado IN ('LLAMADO','EN ATENCION');
-- Indices de relaciones y consultas presentes en queue.ts y reports.ts.
CREATE INDEX idx_modulos_despacho ON modulos(estado,orden_ultima_asignacion,id_modulo);
CREATE INDEX idx_modulos_servicio ON modulos(id_servicio_principal);
CREATE INDEX idx_usuarios_creador ON usuarios(id_creador);
CREATE INDEX idx_contribuyentes_preferencia ON contribuyentes(id_tipo_preferencia);
CREATE INDEX idx_turnos_contribuyente ON turnos(id_contribuyente);
CREATE INDEX idx_turnos_usuario ON turnos(id_usuario_atencion);
CREATE INDEX idx_turnos_modulo ON turnos(id_modulo_atencion);
CREATE INDEX idx_turnos_destino_pendiente ON turnos(id_modulo_destino)
 WHERE estado IN ('EN ESPERA','DERIVADO');
CREATE INDEX idx_turnos_excluido ON turnos(id_modulo_excluido);
CREATE INDEX idx_cola_pendiente ON turnos(estado,prioridad DESC,fecha_cola,id_turno)
 WHERE estado IN ('EN ESPERA','DERIVADO');
CREATE INDEX idx_derivaciones_turno ON derivaciones(id_turno,id_derivacion DESC);
CREATE INDEX idx_derivaciones_origen ON derivaciones(id_modulo_origen);
CREATE INDEX idx_derivaciones_destino ON derivaciones(id_modulo_destino);
CREATE INDEX idx_derivaciones_servicio_origen ON derivaciones(id_servicio_origen);
CREATE INDEX idx_derivaciones_servicio_destino ON derivaciones(id_servicio_destino);
CREATE INDEX idx_historial_turno_evento ON historial_turnos(id_turno,id);

CREATE INDEX idx_usuarios_roles_rol ON usuarios_roles(rol);
CREATE INDEX idx_roles_permisos_permiso ON roles_permisos(id_permiso);
COMMIT;

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
