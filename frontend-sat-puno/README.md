# Frontend SAT Puno V5

React + TypeScript + Vite. Requiere backend V5. Lee `../INICIAR.md`.

Copia `.env.example` a `.env`, configura las URLs de API y Socket.io, ejecuta `npm ci` y `npm run dev`. `npm run build` genera el frontend estático en `dist`.

Roles dinámicos: selector al ingresar, navegación por permisos, gestión de roles, asignación múltiple y edición de módulo desde Usuarios. Se mantienen kiosco, orientación, ventanilla, pantalla, catálogos, reportes y auditoría.

Pruebas de navegador: `npx playwright install chromium`, después `npm run test:e2e`, con API y frontend de pruebas levantados. Configura `BACKEND_URL` (incluye /api), `FRONTEND_URL` y `TEST_ADMIN_PASSWORD`. No uses una base de producción.
