# Contrato V5

Prefijo `/api`. Bearer token para el personal. `x-device-key` solo para los accesos de kiosco y pantalla permitidos. Login devuelve token de selección sin permisos; POST `/auth/seleccionar-rol` recibe `{ "rol": "CodigoDelRol" }` y devuelve el token del rol seleccionado.

| Endpoint | Función |
|---|---|
| POST /auth/login | Credenciales nombre_usuario y password |
| GET /auth/me | Perfil, roles activos y permisos del rol seleccionado |
| POST /auth/seleccionar-rol | Elegir un rol asignado activo |
| POST /auth/logout | Revocar las sesiones de la cuenta |
| GET /admin/roles | Catálogo de roles, permisos y cantidades de usuarios |
| POST /admin/roles | Crear código, nombre, descripción, activo y array de códigos de permisos |
| PATCH /admin/roles/:id | Actualizar nombre, descripción, activo y array de permisos; código inmutable |
| DELETE /admin/roles/:id | Eliminar un rol personalizado sin usuarios |
| GET /admin/privilegios | Cuentas y roles disponibles para asignar |
| PATCH /admin/privilegios/:id | Sustituir roles con `{ "roles": ["Operador", "MiRol"] }` |
| GET/POST /admin/:recurso | Consultar o crear servicios, modulos, usuarios, tipospreferencia o contribuyentes |
| GET/PATCH/DELETE /admin/:recurso/:id | Consultar, editar o eliminar un registro según permisos |
| PATCH /admin/usuarios/:id | Admite id_modulo_asignado, incluido null; roles se gestionan por separado |
| GET /opciones/:recurso | Referencias autorizadas; módulos incluyen disponibilidad |
| GET /servicios | Servicios activos |
| POST /turnos | Emitir con dni, id_servicio y solicitud_id UUID |
| POST /turnos/:id/:accion | iniciar, rellamar, finalizar, no-presentado, cancelar o derivar |
| GET /turnos/:id | Detalle e historial autorizado |
| GET /ventanilla | Estado del operador y su atención |
| GET/PATCH /ventanilla/asignacion | Consultar opciones o cambiar id_modulo e id_servicio |
| POST /ventanilla/abrir, /cerrar | Estado de recepción de turnos |
| POST /ventanilla/finalizar-jornada | Dejar de recibir y liberar al terminar |
| POST /admin/modulos/:id/abrir, /liberar | Apertura o relevo por supervisor autorizado |
| GET /orientacion/preferencias | Tipos de preferencia |
| GET/PATCH /orientacion/contribuyente/:dni | Consultar o actualizar preferencia e identidad |
| GET /pantalla | Solo turnos activos y datos públicos |
| GET /admin/turnos, /derivaciones | Consultas paginadas de cola |
| GET /admin/reportes | Indicadores entre desde y hasta (AAAA-MM-DD) |
| GET /admin/auditoria | Registro paginado de operaciones |
| GET /health | Disponibilidad de conexión |

Los permisos se recuperan desde PostgreSQL en cada petición; no se confía en un array enviado por el cliente. Cambiar roles o permisos revoca versiones de token. Los mensajes Socket.io `/cola`, evento `cola:actualizada`, solo invalidan consultas; no difunden datos personales.

Los permisos `gestionar` autorizan crear/editar/eliminar del catálogo correspondiente. Los de Usuarios son separados. La interfaz usa aliases internos para compatibilidad, resueltos a los códigos guardados en permisos.

## Atención configurable por módulo
- `PATCH /api/ventanilla/modo`: `{ "atencion_automatica": false }` o `true`. Requiere `ventanilla.atender`; afecta exclusivamente al módulo del usuario autenticado.
- `POST /api/ventanilla/llamar-siguiente`: en modo manual, reserva y llama un único turno elegible por prioridad. Devuelve 409 si hay turno activo, está cerrado, no hay turnos, está en automático o existe salida pendiente.
- `GET /api/ventanilla`: incluye `modulo.atencion_automatica`.
- `GET /api/admin/privilegios`: añade `roles_detalle` (código, nombre, descripción) y conserva `roles` como lista de códigos.

### Control administrativo del modo (13/10/2026)

- `PATCH /api/admin/modulos/:id/modo`: `{ "atencion_automatica": true }` o `false`. Requiere `modulos.gestionar`. Permite gestionar cualquier ventanilla sin asignársela al administrador, incluso con atención activa. Conserva ese turno y no abre una ventanilla cerrada. Activar automático puede despachar el siguiente si está libre y abierta.
- El operador conserva `PATCH /api/ventanilla/modo`. Ambos controles usan el mismo dato persistente; prevalece el último cambio guardado. Se registra `CAMBIAR_MODO_ATENCION` y se emite la actualización de cola.
