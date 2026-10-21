# Verificación de SAT Puno V5

Se ejecutaron la compilación TypeScript del backend, la generación de Prisma Client y la compilación de producción de React/Vite.

## Base y API

El SQL se ejecutó sobre una base nueva aislada con PGlite 0.5.8 y el adaptador PostgreSQL por socket 0.2.11. La API NestJS real se conectó a esa base mediante Prisma. El proceso no usó migraciones ni historial de versiones anteriores.

Pasaron cinco pruebas unitarias: clasificación de errores SQL, jornada de Lima, orden preferencial, prioridad sobre espera regular prolongada y validación de estados.

Pasaron dos recorridos integrados de API:

1. Login, selector de rol, usuarios unificados, jerarquía, bloqueo de accesos, prioridad, atención, derivación al mismo servicio, limpieza de la pantalla al finalizar, relevo y reservas concurrentes del mismo módulo mediante peticiones HTTP.
2. Creación de rol personalizado con permisos combinados, creación de cuenta con ese rol, cambio de módulo desde edición, acción administrativa permitida, denegación de acciones no otorgadas, atención con rol nuevo, bloqueo del cambio durante una atención, revocación de permisos y sesiones, desactivación y eliminación de roles sin usuarios.

## Navegador

Pasaron tres recorridos con Chromium/Playwright:

1. Login, selección de rol, alta de usuario y asignación múltiple; accesos separados y vista móvil del selector.
2. Módulos reservados visibles como no disponibles al crear una cuenta.
3. Creación de rol mixto desde el formulario, selección de permisos, cambio de módulo desde Editar usuario, navegación del rol personalizado y vista móvil de ventanilla sin desbordamiento horizontal.

Se revisaron visualmente las capturas de móvil y del formulario de roles. Las capturas incluidas contienen datos sintéticos de prueba.

## Límites

PGlite serializa conexiones de forma distinta a PostgreSQL servidor; estas pruebas no certifican rendimiento ni concurrencia bajo carga de un servidor real. No se conectó a la base del usuario, no se publicó un servidor y no se verificaron servicios PostgreSQL de terceros. La conexión TLS y la red deben comprobarse en el destino. La impresora y los avisos de voz deben probarse en los equipos donde se utilizará el sistema.

La comprobación `db:check` valida conexión, tablas y columnas esperadas y catálogos esenciales. No ejecuta SQL de creación ni intenta reparar datos o deducir esquemas anteriores.

## Actualización: nombres de roles y modos de atención (12/10/2026)

La regresión de API incluye el nombre almacenado en Asignar roles, modo manual al abrir y emitir tickets, reanudación global sin asignación manual, dos llamadas simultáneas (una aceptada y otra rechazada), inicio explícito, finalización sin recibir otro turno, cola vacía, cierre, persistencia del modo y cambio de modo conservando el turno activo. Los endpoints rechazan usuarios sin permiso de atención.

Se comprobó por separado el SQL de actualización sobre el esquema V5 anterior con datos: conserva los registros, activa automático por defecto y permite una segunda ejecución sin duplicar la columna. La validación utilizó PGlite, con los mismos límites indicados arriba.

Pasaron las cinco pruebas unitarias, los dos recorridos de API y los tres recorridos de navegador. El navegador comprobó el nombre del rol personalizado, la persistencia del modo manual tras recargar y los botones Llamar siguiente e Iniciar atención. Las compilaciones de backend y frontend finalizaron correctamente.

## Control del administrador y ubicación del llamado (13/10/2026)

Compilaron backend y frontend. Pasaron cinco pruebas unitarias, dos recorridos de API y tres de navegador. La regresión verifica el cambio administrativo sin módulo propio, rechazo por falta de permiso, datos inválidos y módulo inexistente; paso a automático con cola y conservación de la atención al volver a manual. El navegador verifica selector administrativo persistente, botón dentro de Cola de atención, actualización del operador por cambio administrativo, mantenimiento del turno actual y vista móvil sin desbordamiento.

La prueba de cambio remoto inicia una sesión administrativa nueva: cerrar sesión invalida el token anterior. Capturas revisadas internamente, con datos sintéticos. Se mantienen los límites de PGlite y de validación local indicados arriba.

## Multiservicio y TV (15/10/2026)

Compilación de backend y frontend correcta. Pasaron las cinco pruebas unitarias, los dos recorridos de API anteriores y un nuevo recorrido de API que comprueba:

- Dos servicios habilitados por ventanilla desde administrador y operador; rechazo de servicios repetidos.
- Selección manual entre servicios, cuatro ventanillas ocupadas simultáneamente y cola de espera sin duplicar llamados.
- Finalización y retiro de la atención vigente; bloqueo de cambios durante una atención; retiro de un servicio en una ventanilla libre.
- Derivación a otro servicio habilitado y continuidad automática del servicio restante.
- Persistencia de video y anuncios, rechazo de enlaces inválidos, conflicto por revisión desactualizada y denegación a usuarios sin permiso.

Pasaron cinco recorridos de navegador: los tres anteriores y dos nuevos que verifican selección múltiple en formularios de administrador y operador, persistencia del anuncio, cuatro llamados, tres tarjetas superiores, próximos turnos, retiro del ticket finalizado, reproducción WebM de prueba, expansión del video, pantalla completa nativa y cinta visible por encima del video, y regreso a turnos.

El SQL incremental se comprobó sobre el SQL V5 anterior con datos sintéticos: copió el servicio previo, conservó el modo manual y el anuncio personalizado al repetir la actualización. También se verificó la creación de una base nueva con el SQL completo actualizado.

Se usó PGlite mediante su adaptador PostgreSQL, API real NestJS/Prisma y Chromium/Playwright. Los videos usados son archivos sintéticos locales interceptados por la prueba; no se garantiza disponibilidad ni compatibilidad de un enlace externo concreto. Se mantiene la necesidad de comprobar red, codecs y avisos de voz en la TV real. No se ejecutó ninguna actualización sobre la base del usuario ni se desplegó en producción.

Las capturas nuevas se revisaron internamente. La carpeta `capturas` conserva las imágenes históricas del paquete anterior; la guía vigente de estas mejoras es `ACTUALIZACION_MULTISERVICIO_TV.md`.

La revisión final de TV también pasó en 1366 × 768: las seis filas de espera y la ventanilla de destino quedan por encima de la cinta. Se volvió a comprobar reproducción, expansión, pantalla completa y retorno a turnos tras el ajuste.

## Apartado independiente de pantalla pública (16/10/2026)

Video y anuncios se trasladó a `/control-pantalla`, bajo el grupo Pantalla pública del menú. Mi ventanilla y Módulos ya no contienen el formulario. El enlace, la ruta y el formulario conservan el permiso `pantalla.gestionar`; Ver pantalla conserva `pantalla.ver`. No se modificó el backend ni el esquema SQL.

Compilación del frontend correcta. Pasó el recorrido de navegador actualizado: acceso del administrador al apartado, ausencia del control en Módulos y Mi ventanilla, selección multiservicio conservada, acceso del operador desde el menú, guardado del anuncio y persistencia al recargar la URL independiente.
