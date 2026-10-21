> **Edición Render:** para desplegar este paquete usa primero [LEEME_RENDER.md](LEEME_RENDER.md). Las instrucciones siguientes se conservan como referencia de instalación local V5.

> **16/10/2026 — Apartado independiente:** video y anuncios ahora están en **Pantalla pública → Video y anuncios**. Si ya instalaste la actualización multiservicio/TV, solo actualiza y recompila el frontend (`npm ci`, `npm run build`; en desarrollo `npm run dev`). Este cambio de ubicación no requiere SQL ni migraciones nuevas.

> **Actualización multiservicio y TV:** si ya tienes una base V5, sigue `ACTUALIZACION_MULTISERVICIO_TV.md` y ejecuta únicamente el SQL incremental indicado allí. Conserva tus archivos `.env`.

# SAT Puno V5 — instalación nueva y conexión directa

Esta versión incluye React, NestJS, Socket.io y PostgreSQL. Usa el nuevo esquema con roles dinámicos. No incluye ni ejecuta migraciones de versiones anteriores. Prisma se utiliza como cliente de consultas: `prisma:generate` genera código local y no modifica la base.

## Actualización del 13/10/2026

El administrador puede elegir **Automático** o **Manual** por ventanilla desde **Administración → Módulos → Modo de atención**. Requiere `modulos.gestionar`, incluido en Admin y asignable a roles personalizados. El operador conserva su selector; ambos modifican el mismo valor y prevalece el último cambio guardado. Se registra en auditoría y se notifica a las sesiones conectadas.

En **Mi ventanilla**, el botón **Llamar siguiente** está dentro de **Cola de atención**, encima de los turnos. Solo aparece en manual y se habilita cuando la ventanilla está libre y abierta, hay cola y no hay salida pendiente.

Si ya usas la versión con los dos modos, **esta actualización no necesita SQL ni migraciones**. Reemplaza el código conservando tus `.env`, compila backend y frontend y reinicia los servicios. No borres ni recrees la base. El SQL de actualización descrito debajo solo es necesario si tu V5 todavía no tiene `atencion_automatica`.

## 1. Preparar PostgreSQL

Si todavía no creaste la base, conectado a `postgres` ejecuta por separado:

```sql
CREATE DATABASE sat_puno_colas ENCODING 'UTF8';
```

Conéctate a esa base y ejecuta **una sola vez** `base-datos/SAT_Puno_V5.sql` completo. En una nube PostgreSQL puedes usar la base que proporciona el servicio y su editor SQL; el script crea las tablas dentro de `public`.

Para una **V5 ya instalada**, detén el backend y ejecuta `base-datos/ACTUALIZAR_V5_MODOS.sql` en tu base existente. Añade únicamente `modulos.atencion_automatica`, conserva los datos y mantiene el modo automático de las ventanillas actuales. Después actualiza el código, conserva tus `.env`, ejecuta `npm run prisma:generate`, `npm run db:check` y `npm run build` en el backend, y vuelve a iniciarlo. En el frontend ejecuta `npm run build` si publicas la aplicación compilada, o reinicia `npm run dev` si estás desarrollando. No necesitas repetir el seed.

Si ya ejecutaste el SQL de roles dinámicos compartido en la conversación (tablas `roles`, `permisos`, `roles_permisos`, `usuarios_roles`, además de las tablas de cola), no vuelvas a crear las tablas. Aplica primero `ACTUALIZAR_V5_MODOS.sql`, configura la conexión y ejecuta `db:check`. Si informa una diferencia, revisa esa diferencia concreta; no ejecutes migraciones antiguas ni un reset. El SQL nuevo conserva el contrato de columnas de aquel esquema.

Esto es una instalación nueva. No importa automáticamente datos de V3/V4 ni utiliza `_prisma_migrations`.

## 2. Backend

Requiere Node.js 22 o 24 y npm. Dentro de `backend-sat-puno`, copia `.env.example` como `.env`.

Conexión local de ejemplo (reemplaza usuario, clave y nombre de base):

```dotenv
DATABASE_URL="postgresql://USUARIO:CLAVE@localhost:5432/sat_puno_colas?schema=public"
HOST=127.0.0.1
PORT=3000
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Para una nube PostgreSQL, usa la cadena de conexión del proveedor, con su host, puerto, usuario y base. Conserva las opciones TLS requeridas por ese proveedor. Ejemplo de forma:

```dotenv
DATABASE_URL="postgresql://USUARIO:CLAVE@HOST:5432/BASE?schema=public&sslmode=require"
```

Codifica caracteres reservados de usuario/contraseña en la URL. La cuenta necesita consultar y modificar las tablas de la aplicación y usar sus secuencias; no necesita crear tablas al arrancar. Usa conexión directa o un pool compatible con Prisma y transacciones. El sistema usa bloqueos de transacción para serializar operaciones de cola.

Configura también:

- `JWT_SECRET`, `KIOSK_API_KEY`, `DISPLAY_API_KEY`: secretos distintos y aleatorios, de al menos 32 caracteres.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_DNI`, `ADMIN_NOMBRES`, `ADMIN_APELLIDOS`: datos reales del primer administrador.
- `ATTENTION_MODE=automatico` o `confirmacion`.

Para generar un secreto:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ejecuta:

```sh
npm ci
npm run prisma:generate
npm run db:check
npm run db:seed
npm run build
npm start
```

`db:check` solo consulta. El arranque vuelve a comprobar la conexión y las columnas esperadas, sin ejecutar CREATE, ALTER ni migraciones. `db:seed` crea el administrador inicial con hash bcrypt y servicios iniciales; no sobrescribe cuentas existentes. Si tu cuenta de administrador ya existe, utiliza sus credenciales o gestiona el acceso desde el sistema.

API: `http://localhost:3000/api`. Diagnóstico: `/api/health`. Documentación de endpoints: `http://localhost:3000/docs` cuando `ENABLE_SWAGGER=true`.

En los siguientes arranques solo necesitas `npm start`; el seed no es un paso recurrente. No hay un comando `db:migrate` en V5.

## 3. Frontend

Dentro de `frontend-sat-puno`, copia `.env.example` como `.env`:

```dotenv
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

Después:

```sh
npm ci
npm run dev
```

Abre `http://localhost:5173`. Ingresa con el administrador creado y selecciona Admin.

Para compilar: `npm run build`. El resultado es `dist`, que requiere fallback de rutas a `index.html` al alojarlo. Cambiar las variables VITE de una compilación requiere recompilar.

## 4. Roles, permisos y usuarios

- **Roles y permisos** crea perfiles nuevos. Elige las funciones de administración, ventanilla, orientación y reportes que necesiten.
- **Asignar roles** asigna uno o varios perfiles a una persona.
- Al ingresar aparece el selector; se usan exclusivamente los permisos del rol elegido.
- Los roles personalizados muestran un espacio de trabajo con accesos según sus permisos. No es necesario crear una pantalla específica para cada nombre de rol.
- Admin, Operador, Orientador, Supervisor y Usuario vienen por defecto. Admin está protegido. Los otros roles predeterminados se pueden ajustar, pero no eliminar.
- Para que una función administrativa aparezca en el menú, incluye su permiso de consulta además del de modificación. Por ejemplo: `servicios.ver` + `servicios.gestionar`; para Usuarios se separan crear, editar y eliminar.
- Un rol sin permisos puede existir como borrador, pero no autoriza acciones.
- Solo se pueden conceder permisos que tenga el rol actual. Conceder facultades de gestión de usuarios o roles requiere Admin con rango. Las cuentas que reciben esas facultades quedan protegidas por jerarquía, incluso si posteriormente se retiran.
- No se pueden modificar cuentas administrativas desde un rol personalizado, aunque tenga permiso de editar usuarios: requiere Admin de rango superior. Se mantienen las protecciones al creador y a la propia cuenta.
- No se permite editar un rol si afecta a la propia cuenta o a cuentas protegidas superiores. Cambiar permisos invalida las sesiones de sus usuarios.
- Para desactivar un rol o retirarle atención, libera previamente los módulos de sus usuarios. Un rol asignado no se puede eliminar; primero reasigna a las personas.

## 5. Cambiar módulo al editar usuario

Usuarios → Editar → Módulo asignado → Guardar cambios.

- El módulo actual permanece seleccionable.
- Los módulos reservados por otras personas muestran «No disponible».
- El usuario debe estar activo y tener un rol activo con `ventanilla.atender`.
- No puede haber una atención activa del usuario o de los módulos implicados.
- El cambio libera y cierra el módulo anterior; reserva cerrado el nuevo. El operador puede abrirlo cuando tenga un servicio válido.
- Elegir «Sin asignar» libera el módulo si no hay atención activa. Si está atendiendo, usa el relevo y termina el ticket antes.
- La reserva se valida de nuevo en el servidor y está protegida por unicidad en PostgreSQL.

El servicio sigue configurándose en Módulos o desde Mi ventanilla cuando se tiene `ventanilla.asignacion`.

## 6. Flujos conservados

Emisión e impresión de tickets; DNI y preferencias; atención automática o con confirmación; llamados y reintentos; cancelación, ausencia, finalización y derivación; derivación al mismo servicio excluyendo el origen; reparto rotativo; relevo; pantalla pública con turno y módulo; avisos por voz; reportes y auditoría.

Los preferenciales se adelantan a los turnos pendientes, sin interrumpir una atención activa. La pantalla muestra turnos activos y retira el último al finalizar. Derivar requiere un módulo destino abierto con operador habilitado; si está ocupado, espera por servicio y puede asignarse a otro compatible.

## 7. Red local o alojamiento

Para que otras computadoras accedan al backend, configura `HOST=0.0.0.0`, permite el puerto en el firewall y usa la IP o dominio real del servidor en el frontend. `localhost` en una computadora de atención se refiere a esa misma computadora, no al servidor.

`CORS_ORIGINS` debe contener los orígenes exactos del frontend, separados por comas, sin barras invertidas. Si alojas el backend, el servicio debe soportar un proceso Node persistente y WebSockets. Configura HTTPS, las variables del servidor y el proxy de Socket.io. Alojar solo la base en nube no aloja automáticamente la API ni el frontend.

Las claves de PostgreSQL y JWT van únicamente en el backend. Las claves de kiosco/pantalla se introducen en el dispositivo correspondiente (`/kiosco` y `/pantalla`), no en variables VITE públicas.

Docker del backend: `docker build -t sat-puno-v5 .` y `docker run --env-file .env -e HOST=0.0.0.0 -p 3000:3000 sat-puno-v5`. El contenedor tampoco aplica SQL al iniciar. Desde un contenedor, `localhost` no apunta a PostgreSQL del equipo anfitrión: usa un host accesible.

## 8. Verificación y resolución de errores

Consulta `VERIFICACION.md` para las pruebas realizadas y sus límites. Antes de uso operativo, comprueba tu conexión real, los equipos de atención, la impresora y la voz del navegador.

En PowerShell puedes usar `npm.cmd` y `npx.cmd` si `npm.ps1` está bloqueado. El mensaje `ESQUEMA_INCOMPATIBLE` indica revisar la conexión o columnas con `db:check`, no ejecutar migraciones antiguas.

## Modos de atención por ventanilla

En **Mi ventanilla → Modo de atención**, cualquier usuario con permiso `ventanilla.atender` puede elegir:

- **Automático:** recibe el siguiente turno al quedar libre. Conserva la configuración `ATTENTION_MODE` del backend para iniciar directamente (`automatico`) o esperar confirmación de inicio (`confirmacion`).
- **Manual · llamar siguiente:** abrir o finalizar una atención no trae otro turno. El operador pulsa **Llamar siguiente**, el turno pasa a `LLAMADO` y se anuncia en pantalla; cuando llega la persona, pulsa **Iniciar atención**. No se puede elegir arbitrariamente un ticket ni saltarse la prioridad.

La elección se conserva en la base por módulo, incluso al recargar, reiniciar o relevar al operador. Cambiar el modo no interrumpe el turno actual. Activar automático con la ventanilla abierta y libre puede asignar inmediatamente el próximo turno. Una ventanilla cerrada o con salida pendiente no puede llamar. Las peticiones simultáneas se serializan mediante el bloqueo de cola existente.

En **Asignar roles**, las tarjetas muestran el nombre y la descripción guardados del rol. El código permanece como identificador interno para la asignación.
