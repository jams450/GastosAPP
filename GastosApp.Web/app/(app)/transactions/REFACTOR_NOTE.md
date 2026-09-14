## Nota breve: refactor interno de Transacciones

### Objetivo
- Separar `transactions-client.tsx` por sub-secciones para mejorar mantenibilidad y lectura.
- Mantener comportamiento funcional, lógica de negocio y estilos visuales existentes.

### Archivos nuevos (secciones)
- `app/transactions/_components/sections/income-section.tsx`
- `app/transactions/_components/sections/expense-section.tsx`
- `app/transactions/_components/sections/transfer-section.tsx`
- `app/transactions/_components/sections/history-section.tsx`

### Qué no cambió
- Flujos funcionales de registro/edición de transacciones.
- Estilos y estructura visual de la UI.
- Parámetros de consulta actuales y comportamiento de navegación asociado.
- Integración con hooks y componentes ya existentes en `app/transactions`.

### Validación manual sugerida
1. Abrir pantalla de Transacciones.
2. Verificar render de las 4 vistas: Ingreso, Gasto, Transferencia, Historial.
3. Ejecutar flujo básico en cada sección (crear/editar donde aplique).
4. Confirmar que estilos y layout coinciden con versión previa.
5. Validar que query params se preservan al cambiar de sub-sección o recargar.
