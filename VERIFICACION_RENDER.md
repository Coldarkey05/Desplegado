# Verificación · Edición Render

- Compilación TypeScript del backend y compilación Vite del frontend: correctas.
- Arranque con el esquema V5 en una base aislada compatible con PostgreSQL, sin modificar Neon.
- Prueba HTTP del servicio único: /login, rutas internas, TV y kiosco; API y rutas inexistentes; acceso a .env denegado; bundle sin conexión privada.
- Tres pruebas Playwright aprobadas: navegación en 360, 390, 768, 1024 y 1440 px sin desbordamiento horizontal de la página; formulario de usuario en móvil; cuatro llamados y retiro al iniciar atención; reproducción de video expandido y cinta; multiservicio desde administrador y operador.
- Inspección visual de capturas de TV y móvil.

Los tests se incluyen en frontend-sat-puno/tests/cloud-responsive.spec.ts, frontend-sat-puno/tests/multiservicio-tv.spec.ts y backend-sat-puno/test/integration/cloud.test.ts. Requieren un entorno aislado con los catálogos y administrador inicial, FRONTEND_URL, BACKEND_URL, TEST_ADMIN_PASSWORD y DISPLAY_API_KEY. Usar exclusivamente una base de pruebas, porque los tests funcionales crean servicios, módulos, usuarios y tickets.

No se ha desplegado en la cuenta Render del usuario ni comprobado su conexión Neon real. Docker se incluye como alternativa; su imagen no se ejecutó en esta validación. El camino validado es Node con backend y frontend compilados en un único servidor.
