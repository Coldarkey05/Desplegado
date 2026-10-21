# V5 · Multiservicio y pantalla pública

Actualización del 15 de octubre de 2026. Conserva usuarios, roles, turnos, prioridades, historial y modos de atención existentes.

## Actualizar una instalación V5 existente

1. Respaldar la base y detener el backend durante la actualización. Conservar los archivos `.env` locales del backend y del frontend.
2. En PostgreSQL, Neon u otro proveedor compatible, seleccionar la base de la instalación y ejecutar **solo** `base-datos/ACTUALIZAR_V5_MULTISERVICIO_TV.sql` completo. No ejecutar nuevamente `SAT_Puno_V5.sql` sobre una base existente.
3. Reemplazar el código del frontend y backend con este paquete y restaurar sus respectivos `.env`. No mantener servidores de versiones diferentes conectados a la misma base durante el cambio.
4. En `backend-sat-puno`, ejecutar:

```bash
npm ci
npm run prisma:generate
npm run db:check
npm run build
npm start
```

5. En `frontend-sat-puno`, conservar `VITE_API_URL` y `VITE_SOCKET_URL` de la instalación, ejecutar `npm ci` y `npm run build`; publicar el contenido de `dist` con el procedimiento habitual. Para desarrollo, usar `npm run dev`.
6. Volver a iniciar sesión y recargar las pestañas de TV. Comprobar los servicios de cada ventanilla antes de abrir la atención.

No se requiere ejecutar migraciones antiguas, `prisma migrate`, `db push` ni volver a crear usuarios. Tampoco se necesita ejecutar el seed para esta actualización. El SQL agrega las tablas y el permiso nuevo, y copia las asignaciones anteriores de servicio principal.

Para una **base nueva**, ejecutar el `base-datos/SAT_Puno_V5.sql` actualizado y continuar con `INICIAR.md`.

## Habilitar varios servicios

**Administrador:** Administración → Módulos → Nuevo módulo o Editar → marcar las casillas de **Servicios habilitados** → Guardar. Puede seleccionarse uno o más servicios. Para dejar un módulo sin servicios, debe permanecer cerrado.

**Operador:** Mi ventanilla → Módulo y servicios → seleccionar módulo libre y marcar **Servicios de atención** → Guardar asignación → Abrir ventanilla. El cambio de asignación deja la ventanilla cerrada, como en la versión anterior.

Se mantienen `modulos.gestionar` para administración y `ventanilla.asignacion` para cambiar la asignación propia. Los roles personalizados deben tener esos permisos según sus funciones. Finalizar o derivar el ticket actual antes de cambiar servicios. No se permite retirar servicios con derivaciones pendientes destinadas al módulo.

El orden de llamado combina los servicios habilitados: primero prioridad y después antigüedad, con desempate por ID. En automático, una ventanilla libre recibe el próximo turno compatible. En manual, espera a **Llamar siguiente**, junto a la cola. Una ventanilla continúa atendiendo un solo ticket a la vez; cuatro ventanillas pueden mostrar cuatro llamados simultáneos. Se conserva la exclusión de la ventanilla de origen en derivaciones.

## Video y anuncios

En el menú lateral, entrar a **Pantalla pública → Video y anuncios**. Este apartado independiente está disponible para administrador, operador y roles personalizados con `pantalla.gestionar`. El formulario aparece abierto; ya no está dentro de Mi ventanilla ni Módulos.

1. Elegir **Turnos en atención** o **Transmitir video**.
2. Para video, pegar un enlace HTTPS directo a un archivo `.mp4`, `.webm` u `.ogg`, accesible desde el equipo TV. Puede incluir parámetros de acceso en la URL. El servidor de video debe permitir reproducirlo desde el navegador y el formato debe ser compatible con el equipo.
3. Marcar **Expandir video** para ocupar toda el área del navegador manteniendo visible la cinta inferior. Desmarcar para conservar visible el panel lateral de turnos.
4. Escribir el anuncio (hasta 1000 caracteres) y elegir si se desplaza o permanece fijo.
5. Pulsar **Aplicar a las pantallas**. Afecta a todas las TVs conectadas. Si otro usuario guardó una configuración mientras se editaba, usar **Recargar configuración** y revisar antes de volver a guardar.
6. Para regresar a los tickets, seleccionar **Turnos en atención** y aplicar.

Se agrega `pantalla.gestionar`, asignado inicialmente a Admin y Operador; puede concederse o retirarse desde Roles y permisos. Ver pantalla (`pantalla.ver`) por sí solo no permite modificarla. Las claves de dispositivo solo permiten visualizar, no gestionar.

El video se reproduce en bucle y sin sonido para permitir el inicio automático y mantener audibles los avisos de turnos. Los avisos de voz se activan localmente en la TV con **Activar sonido**. Si el video falla, se muestran los tickets y un aviso; corregir el enlace y aplicar nuevamente para reintentarlo. Esta versión reproduce archivos por URL; no incluye carga de archivos al servidor, retransmisión de cámara ni enlaces de páginas de YouTube.

**Pantalla completa del equipo:** pulsar el botón Pantalla completa en la propia TV. El navegador exige interacción local para ocultar su barra; el administrador controla la expansión del contenido dentro de la página. En video expandido, mover el puntero a la parte superior permite acceder a los controles. La cinta permanece por encima del video.

## Distribución de TV

- Centro/izquierda: último ticket llamado activo en grande; encima, hasta tres llamados activos adicionales y sus ventanillas.
- Derecha: últimos llamados que continúan activos y, debajo, próximos turnos en espera ordenados por prioridad y antigüedad. Los llamados ya no aparecen en espera.
- Abajo: anuncio fijo o desplazable. Se respeta la preferencia de movimiento reducido del navegador.

La TV muestra únicamente tickets en estado LLAMADO. Al iniciar la atención (EN ATENCION), el ticket desaparece del panel principal, las tarjetas superiores y la lista lateral. Finalizados, cancelados, no presentados y tickets derivados fuera del llamado actual tampoco aparecen. El historial completo se conserva en la base para consultas; no se confunde con atención en curso. La actualización normal se realiza por Socket.io tras confirmar la operación. Si se pierde esa conexión, existe consulta de respaldo cada 5 segundos; con desconexión total se muestra aviso de información sin actualizar.

## Estructura y compatibilidad

- `modulos_servicios`: relación muchos a muchos con clave compuesta y claves foráneas; índice por servicio.
- `id_servicio_principal`: se conserva por compatibilidad; las escrituras nuevas sincronizan el primer servicio seleccionado y la relación múltiple.
- `configuracion_pantalla`: registro único persistente, revisión para detectar ediciones simultáneas, modo, enlace y anuncios.
- La misma transacción y bloqueo de cola protegen asignaciones, llamados y cambios de servicios. Se registra auditoría de la configuración de pantalla.
- Para clientes API anteriores se conserva `id_servicio` en asignación e `id_servicio_principal` en módulos. Clientes nuevos deben enviar `servicios_ids: [1,2]`; no enviar ambas formas juntas.

## Comprobación tras instalar

Crear dos servicios de prueba y habilitarlos en una ventanilla; emitir un turno de cada uno, llamar en manual y finalizar; cambiar a automático y comprobar el avance. Abrir cuatro ventanillas y verificar los cuatro llamados en TV. Iniciar la atención de uno y comprobar su retiro inmediato; repetir hasta que no queden llamados y verificar el estado vacío. Aplicar un video compatible y un anuncio, expandir, y volver a turnos. Realizarlo en un entorno de prueba antes de abrir atención al público.

No ejecutar el SQL original como reversión: recrearía tablas. Si fuera necesario volver atrás, detener la atención y restaurar conjuntamente el respaldo de la base y del código anterior. Las tablas agregadas son compatibles con lectura anterior, pero el código antiguo no entiende las asignaciones múltiples.


## Corrección del 19 de octubre de 2026 · Solo llamados en TV

Para aplicar únicamente esta corrección sobre la V5 multiservicio ya instalada, actualizar el código y recompilar backend y frontend; reiniciar el backend y recargar la TV. Conservar los archivos .env. No ejecutar SQL ni migraciones para esta corrección.

La pantalla pública muestra solo LLAMADO; EN ATENCION sigue visible en la ventanilla del operador y se conserva en el historial. Los avisos de voz mantienen su historial de eventos. La actualización usa Socket.io y conserva la consulta de respaldo cada 5 segundos.

Si el backend usa ATTENTION_MODE=automatico, los tickets asignados automáticamente pasan directamente a EN ATENCION y, por tanto, no permanecen en la TV. Para que se muestren hasta que el operador pulse Iniciar atención, usar ATTENTION_MODE=confirmacion en el .env del backend y reiniciarlo. Esto permite mantener activada la recepción automática de siguientes tickets por ventanilla: recepción automática e inicio de atención son configuraciones distintas. El paquete conserva los valores de configuración existentes.

Verificado: compilación backend/frontend y dos pruebas de navegador (cuatro llamados, retiro al iniciar, ausencia tras recarga, video y cinta; gestión multiservicio y controles separados).
