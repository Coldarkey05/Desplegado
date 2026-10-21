# SAT Puno · Edición nube para Render

Versión independiente basada en la V5 actualizada. Conserva las funciones y el esquema PostgreSQL V5. La versión del esquema sigue siendo 5: no representa una instalación nueva de la base.

## Desplegar en un solo Web Service

1. Extrae este ZIP. Sube el **contenido de sat-puno-render** a la raíz de tu repositorio GitHub (package.json y render.yaml deben quedar en la raíz). No subas archivos .env.
2. En Render selecciona **New → Web Service** y conecta el repositorio.
3. Configura:

| Campo | Valor |
|---|---|
| Language | Node |
| Root Directory | Vacío si subiste el contenido a la raíz; sat-puno-render si subiste la carpeta completa |
| Build Command | npm run build |
| Start Command | npm start |
| Health Check Path | /api/health |
| Instancias | 1 |

4. En **Environment** agrega las variables de la tabla siguiente. Luego crea el servicio. Alternativamente, usa **New → Blueprint** con render.yaml: genera las tres claves automáticamente y solicita DATABASE_URL. Elige el plan según tus necesidades; esta entrega no contrata ni despliega servicios.
5. Espera a que Render termine el despliegue. Abre su URL HTTPS. Frontend, API y Socket.io usan esa misma URL. No necesitas una IP fija ni configurar URLs VITE del backend. No copies antiguas variables VITE_API_URL o VITE_SOCKET_URL que apunten a localhost: elimina esos valores de Render.

## Variables de entorno

| Variable | Valor |
|---|---|
| DATABASE_URL | Pega la cadena completa de Neon que proporcionaste, como secreto de Render, sin comillas exteriores |
| NODE_VERSION | 22.18.0 |
| NODE_ENV | production |
| HOST | 0.0.0.0 |
| JWT_SECRET | Cadena aleatoria de al menos 32 caracteres |
| KIOSK_API_KEY | Otra cadena aleatoria de al menos 32 caracteres |
| DISPLAY_API_KEY | Otra cadena aleatoria de al menos 32 caracteres |
| ATTENTION_MODE | confirmacion |
| ENABLE_SWAGGER | false |

Render proporciona PORT. No lo fijes a 3000. El dominio onrender.com se incorpora automáticamente a CORS. Si agregas un dominio propio, configura CORS_ORIGINS con ese origen HTTPS exacto; para varios orígenes, sepáralos con comas.

La cadena de Neon debe conservar el host con `-pooler`, la base `neondb` y los parámetros SSL entregados por Neon. Puedes añadir `&connect_timeout=30&pool_timeout=30&connection_limit=5` para el arranque en frío y un límite moderado de conexiones. La contraseña no se incluye en este ZIP ni en variables VITE. Si cambias la contraseña en Neon, reemplaza DATABASE_URL en Render.

Para generar cada clave puedes usar localmente:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Conexión a la base existente

El backend lee DATABASE_URL directamente y verifica el esquema al iniciar. **No ejecuta migraciones, no recrea tablas y no ejecuta seed en cada despliegue.** Usa tus usuarios, roles, servicios y turnos existentes. No ejecutes SAT_Puno_V5.sql sobre la base que ya tienes.

Si el arranque indica tablas o columnas faltantes, revisa el mensaje: una base V5 anterior a multiservicio puede necesitar únicamente `base-datos/ACTUALIZAR_V5_MULTISERVICIO_TV.sql`, previa copia de seguridad. Tener una base Neon vacía no equivale a tener el esquema instalado. La conexión real de tu cuenta Neon no se ha comprobado en esta entrega; la integración se valida con una base de pruebas.

Si la base ya tiene administrador, entra con sus credenciales actuales. Para una instalación sin usuario administrador, configura ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DNI, ADMIN_NOMBRES y ADMIN_APELLIDOS y ejecuta **una sola vez** `npm run db:seed` en un entorno conectado a esa base (la consola de Render si tu plan la incluye, o desde tu equipo). No uses la semilla como comando de inicio.

## Direcciones

- `/login`: acceso de usuarios.
- `/pantalla`: dispositivo TV; introducir DISPLAY_API_KEY una vez en ese navegador.
- `/kiosco`: emisión de tickets; introducir KIOSK_API_KEY.
- `/api/health`: estado del servicio.

La recarga directa de las páginas React está soportada. `/api` sigue devolviendo respuestas de API, incluso para rutas inexistentes.

## Pantalla pública y videos

En **Video y anuncios**, pega una URL HTTPS directa de un archivo MP4/WebM accesible por el navegador. Esta versión conserva la función de enlace existente; no añade almacenamiento de videos en el disco temporal de Render. Para publicar un archivo, usa almacenamiento externo o un servidor HTTPS que entregue el archivo, no una página de YouTube.

El video ocupa todo el recuadro mediante `object-fit: cover`: conserva su proporción y recorta los bordes sobrantes. Al expandir, ocupa el área disponible y mantiene visible la cinta inferior. En móviles, el recuadro normal usa proporción 16:9.

Los tickets se muestran mientras están LLAMADO y desaparecen al iniciar atención. ATTENTION_MODE=confirmacion permite ese paso explícito; la recepción automática de nuevos tickets por ventanilla sigue siendo independiente y puede gestionarse desde sus controles habituales.

## Diseño adaptable

Nueva paleta azul petróleo y verde, navegación más legible, tarjetas y formularios uniformes, controles táctiles y diseño de una columna en pantallas pequeñas. Las tablas conservan todas sus columnas con desplazamiento horizontal dentro del recuadro. La pantalla de TV mantiene el diseño de llamados, espera, video y anuncios.

## Operación

Mantén una instancia: los avisos Socket.io y límites de solicitudes son locales al proceso. Para escalar a varias instancias se necesita coordinar Socket.io con un adaptador compartido y revisar los límites de solicitudes. Los datos permanecen en Neon.

Si eliges un plan que suspende el servicio por inactividad, el primer acceso puede tardar y la interfaz puede pedir reintentar. Comprueba las condiciones del plan antes de usarlo durante atención al público.

## Desarrollo local

Instala las dependencias de backend y frontend con npm ci en cada carpeta. Configura backend-sat-puno/.env a partir de su ejemplo. Ejecuta backend en 3000 y Vite en 5173: Vite reenvía /api y /socket.io. Para simular el servicio único, ejecuta npm run build desde la raíz y npm start con las variables del backend disponibles en el entorno o en backend-sat-puno/.env.

## Referencias de despliegue

- https://render.com/docs/web-services
- https://render.com/docs/websocket
- https://render.com/docs/environment-variables
- https://www.prisma.io/docs/orm/v6/overview/databases/neon
