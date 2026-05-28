# Changelog

## [Unreleased]

### Documentation
- Ajuste menor de consistencia en `API_DOCUMENTATION.md` (Catálogos):
  - se explicita que **no hay flujo legacy activo en runtime**,
  - se deja listado explícito de pantallas vigentes del flujo final (`/catalogs/categories`, `/catalogs/subcategories`, `/catalogs/merchants`, `/catalogs/tags`, `/catalogs/billable-parties`).
- Se actualizó `API_DOCUMENTATION.md` para registrar la **Fase A de Accounts** en `GastosApp.Web`:
  - estructura alineada a patrón `Users` (**header + toolbar + results**),
  - archivos tocados: `accounts-client.tsx`, `accounts-toolbar.tsx` y nuevo `accounts-results.tsx`,
  - restricción explícita: **sin cambios de lógica/BFF/auth/backend**,
  - estado de validación documentado (lint/build pendiente de evidencia en esta fase),
  - riesgos pendientes de réplica/homogeneización entre módulos.
- Se actualizó `API_DOCUMENTATION.md` para registrar la **Fase 3 de Catálogos (redirect de `/catalogs`)**:
  - `/catalogs` deja de renderizar la vista legacy y redirige a `/catalogs/categories`,
  - se ejecuta cleanup final del legado (`catalogs-client.tsx`, `catalogs-types.ts`, y `GET /api/bff/catalogs/bootstrap` eliminados),
  - se documenta el flujo final de navegación para usuarios autenticados y no autenticados,
  - se agregan validaciones manuales y rollback específico de la fase.
- Se actualizó `API_DOCUMENTATION.md` para registrar la ejecución de **Fase 0, 1 y 2 únicamente en Users + navegación compartida** en `GastosApp.Web`, incluyendo:
  - archivos nuevos `nav-config.ts` y `users-ui.ts`,
  - archivos ajustados: `app-menu.tsx`, `admin-shell.tsx`, `users-table.tsx`, `users-mobile-list.tsx`, `users-client.tsx`,
  - alcance y restricción explícita: **sin cambios en BFF/auth/backend**,
  - validación ejecutada (`npm run lint` y `npm run build`),
  - riesgos pendientes para siguiente fase de réplica en otros módulos.
- Se actualizó `API_DOCUMENTATION.md` para registrar la **Fase 2 de Catálogos (desacople por pantalla)**:
  - nuevas rutas individuales (`/catalogs/categories`, `/catalogs/subcategories`, `/catalogs/merchants`, `/catalogs/tags`, `/catalogs/billable-parties`),
  - clientes por pantalla y contenedor compartido `CatalogSingleScreenClient`,
  - endpoints BFF consumidos por cada pantalla,
  - estado compartido que se elimina respecto al cliente unificado,
  - pasos de validación manual y riesgos pendientes.
- Se actualizó `API_DOCUMENTATION.md` para reflejar el **hard replace UI del módulo Users** con base layout real tipo Tabler:
  - alcance exacto del cambio visual (sin cambios de lógica/contratos API-BFF),
  - archivos clave modificados en layout/navegación/UI base y `app/users/_components/*`,
  - validación requerida de handoff (`npm run lint` y `npm run build`),
  - pendientes mínimos de QA manual antes de iniciar migración de `Catalogs`.
