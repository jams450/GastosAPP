# Guía rápida de colores (tema UI)

## Archivo central

`app/globals.css`. Ahí viven los tokens; ningún componente debería usar hex sueltos.

## Temas

Hay exactamente **dos temas**: claro (`:root`) y oscuro (`.dark`).

La app arranca en oscuro por defecto (ver el script de inicialización en `app/layout.tsx`).
El selector de tema (`components/theme/theme-toggle.tsx`) alterna la clase `dark` en
`<html>` y guarda la elección en `localStorage` bajo la clave `theme`.

Las variantes `data-theme="blue"` y `data-theme="light-blue"` **fueron retiradas**: el
atributo se elimina al arrancar y la clave `paletteTheme` se limpia del almacenamiento.

## Variables clave

### Base (`--tabler-*`)

- `--tabler-page-bg` → fondo general de la app.
- `--tabler-sidebar-bg` → fondo del shell lateral.
- `--tabler-surface-1` / `-2` / `-3` → tarjetas, paneles y superficies elevadas.
- `--tabler-border` / `--tabler-border-strong` → borde hairline y borde enfatizado.
- `--tabler-text` / `--tabler-text-soft` → texto principal y secundario.
- `--tabler-primary` / `--tabler-primary-hover` → acción de marca.
- `--tabler-radius-sm` / `-md` / `-lg` → 10 / 14 / 20 px.
- `--tabler-shadow-sm` / `-md` → elevación en reposo y elevación de superposición.

### Semánticas (`--color-*`)

Son las que consumen los componentes. Se derivan de las `--tabler-*` y no cambian de
nombre entre temas:

- `--color-page-bg`, `--color-page-grad-a`, `--color-page-grad-b` → fondo y ambiente.
- `--color-surface-1..3`, `--color-border`, `--color-border-strong`, `--color-border-focus`.
- `--color-accent`, `--color-accent-hover`, `--color-accent-soft`, `--color-accent-contrast`.
- `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`.
- `--color-success`, `--color-warning`, `--color-danger`, `--color-info`, `--color-credit`.

El azul de marca es decorativo/de acción: **nunca** significa dinero. Verde y rojo quedan
reservados para ingreso/gasto y estado.

### Shell (`--shell-*` y `--color-shell-*`)

Ancho de barra lateral, tamaños de control (44px táctil), tipografía de navegación y
superficies del armazón. Ver `DESIGN.md` § Shell tokens.

## Fondo con gradiente general

En `app/globals.css`, bloque `body` (y su contraparte `.dark body`). Ahí se controla el
ambiente radial. Es el único lugar donde se declara ese gradiente.

## Menú lateral

Componente real: `components/navigation/admin-navigation.tsx` (usado por `AppShell`).
Los estados de hover/activo se expresan con clases semánticas `.shell-nav-link` y
`.shell-nav-group-toggle`, no con utilidades de color crudas. Para ajustar el tono del
hover o del elemento activo, se cambian `--color-shell-hover` y `--color-shell-active`
en `globals.css`.

> `components/navigation/admin-shell.tsx` es un duplicado sin importadores: elimínalo en
> lugar de extenderlo.
