# Changelog

## [Unreleased]

### Documentation
- Se actualizó `API_DOCUMENTATION.md` para reflejar el **hard replace UI del módulo Users** con base layout real tipo Tabler:
  - alcance exacto del cambio visual (sin cambios de lógica/contratos API-BFF),
  - archivos clave modificados en layout/navegación/UI base y `app/users/_components/*`,
  - validación requerida de handoff (`npm run lint` y `npm run build`),
  - pendientes mínimos de QA manual antes de iniciar migración de `Catalogs`.
