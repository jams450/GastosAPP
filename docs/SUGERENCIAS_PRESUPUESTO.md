# Sugerencias de enlace de partidas

La consulta de sugerencias es de solo lectura: ninguna candidata se enlaza por mostrarla. El usuario confirma el enlace con la acción existente.

## Prioridad visible

1. **Coincidencia fuerte:** cumple las reglas vigentes de cuenta + alcance + importe exacto, o comercio + importe dentro de tolerancia.
2. **Coincidencia débil:** cumple alcance y ventana del periodo, pero no las señales fuertes. Se conserva como alternativa, no se convierte en coincidencia fuerte por compartir día.

La fuerza tiene prioridad sobre la cercanía de fecha. Dentro de una misma fuerza, la vista conserva el orden por fecha planeada, distancia e identificador. No se eliminan las alternativas débiles cuando existe una fuerte.

El backend ahora incluye cuenta y comercio de la transacción al evaluar cada par; antes esos datos no llegaban al evaluador de sugerencias. El campo existente `strength` transporta `strong` o `weak`. La vista distingue ambos con etiqueta y color, sin depender solo del color.

## Lo que no cambia

- Propiedad del usuario, categoría/subcategoría, ventana y periodo siguen validados.
- Las reglas de enlace automático al capturar movimientos no se modifican.
- No se cambia importe, cuenta ni estado de movimientos o partidas por consultar sugerencias.
- La columna de contexto existente muestra cuenta/comercio de la **partida**, no datos nuevos de la transacción candidata.

## Verificación

```bash
dotnet run --project GastosApp.Dashboard.Tests/GastosApp.Dashboard.Tests.csproj
dotnet build code.sln
npm --prefix GastosApp.Web test
cd GastosApp.Web && npx tsc --noEmit --incremental false
```

Regresiones focales: reconocimiento de cuenta/comercio, selección de coincidencia exacta posterior antes de una débil cercana, conservación de alternativa débil, orden y etiqueta en frontend. Las pruebas no consultan producción. No se ha probado el endpoint con datos reales ni el navegador autenticado.
