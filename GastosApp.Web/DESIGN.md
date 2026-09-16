# Amitzi Finance Web — Design Contract

Single source of truth for tokens and primitives used by the web UI. Every color,
spacing value, radius and state in a component must trace back to a token defined here
or in `app/globals.css`. When a new value is needed, add the token (here + `globals.css`)
**before** using it. Do not hardcode hex/`rgb()` or arbitrary pixel offsets in components.

Tailwind v4 is configured in CSS (`@import "tailwindcss"` in `app/globals.css`); there is
no `tailwind.config.*`. Tokens are CSS custom properties consumed through semantic utility
classes (`.text-primary`, `.app-panel`, `.input-semantic`, `.table-*`, `.txn-*`).

## 0. Source Analysis (no greenfield research lanes)

This contract was extracted from the existing app, not invented:

- Token layer: `app/globals.css` (`:root`, `.dark`, `[data-theme="blue|light-blue"]`).
- Existing primitives: `components/ui/{button,input,alert,card,select}.tsx`,
  `lib/ui/cn.ts`, `lib/ui/table-action-styles.ts`, `components/data-grid/data-grid.tsx`.
- Existing patterns: semantic classes (`btn-*-semantic`, `input-semantic`, `table-*`,
  `app-panel`, `app-card`) instead of raw Tailwind color utilities.
- Theme starts dark by default (`app/layout.tsx` init script), so dark values are the
  primary surface and are tuned as such.
- No new external design reference or imagegen lane was run: the task is a reconciliation
  of the existing internal system (consistent, documented) rather than a net-new brand.

## 1. Principles

1. **No component without a token.** Color, spacing, radius, shadow and motion values are
   tokens, never one-off literals.
2. **Amitzi Finance is dark-native.** The default canvas is deep navy/ink with a blue financial
   signal, layered shell surfaces, and restrained luminous edges. Light mode is a deliberate
   porcelain/ink counterpart, not an inverted afterthought.
3. **Premium utility.** The shell should feel like a private financial workspace: clear hierarchy,
   calm density, and depth created by tonal layering rather than decorative noise.
4. **Modern financial SaaS.** Dense workflows keep crisp semantic actions and restrained elevation.
3. **Semantics over decoration.** Money direction is encoded by sign + token color, not by
   ornament. Blue identifies Amitzi brand and actions; green/red stay reserved for
   money and status.
4. **Additive compatibility.** Shared primitives (`DataGrid`) may gain optional props but
   never rename/remove existing props or column IDs — nine screens depend on them.
5. **Accessible by default.** Every interactive element exposes a visible keyboard focus
   state and a semantic role/label. Touch surfaces (mobile drawer, coarse pointers) keep
   44px targets; pointer-only desktop nav rows may compress to the density tokens below
   (`--shell-nav-item-size`, `--shell-nav-subitem-size`), never under 24px.

### Shell direction

- Amitzi Finance brand mark is a geometric AM monogram rendered by `app/icon.svg`; the same mark
  appears as the shell and login anchor, paired with the exact `Amitzi Finance` wordmark.
- Desktop shell uses a `16rem` expanded sidebar (within the 240–256px target) that can toggle to a
  `5.5rem` compact icon rail. The toggle lives inside the sidebar header (not the topbar) and is
  desktop-only (`lg` and up).
- The sidebar header is a two-row stack: brand row (monogram + `Amitzi Finance` wordmark), then a
  tools row holding the tagline `Control financiero personal` on the left and the compact toggle on
  the right. The tagline is the only header copy; no headline/slogan competes with the app title or
  the toggle, so the control can never overlap or crowd the wordmark.
- Compact state is persisted in `localStorage` under the key `gastosapp:shell-sidebar-compact`
  (string `"true"`/`"false"`); it is applied after mount so SSR markup is stable.
- In compact state navigation is icon-only: the wordmark, tagline and section label are hidden,
  the compact session renders as its own centered icon stack, each item keeps an `aria-label`/`title`
  tooltip, and rail controls stay at 44px.
 - Topbar is a quiet utility surface; `PageHeader` is the stronger page-level hierarchy. The utility bar identifies the current workspace without duplicating page title content.

- Mobile uses a full-height drawer with a scrim, grouped navigation, safe close affordance and
  preserved focus trap. The drawer is always expanded (no compact mode). Business screens remain
  unchanged; mobile cards are a later phase.
- Use semantic shell classes (`.shell-*`) instead of raw color utilities in navigation components.

### Shell tokens

 - Surfaces: `--color-shell-bg`, `--color-shell-surface`, `--color-shell-raised`, `--color-shell-hover`, `--color-shell-active`, `--color-shell-muted`, `--color-shell-brand`, `--color-shell-divider`, `--color-shell-glow`, `--color-shell-ink`.
 - Layout: `--shell-sidebar-width` (`16rem` expanded), `--shell-sidebar-compact-width` (`5.5rem`
   compact rail), `--shell-content-gap`, `--shell-topbar-height`, `--shell-sidebar-padding`,
   `--shell-compact-rail-padding` (`0.25rem` rail gutter), `--shell-compact-rail-gap` (`0.375rem`
   rail spacing), `--shell-control-size` (`2.75rem` / 44px touch minimum), `--shell-nav-item-size`
   (`2.25rem` / 36px nav row), `--shell-nav-subitem-size` (`1.875rem` / 30px submenu row), and
   existing 4px-grid spacing.

- Typography: `--type-shell-kicker`, `--type-shell-title`, `--type-shell-body`; nav rows use
  `--type-shell-nav` (`0.8125rem`) and submenu rows `--type-shell-subnav` (`0.75rem`). Use the
  existing system stack, tight titles, uppercase kickers with tracked labels.
- Radius/elevation: existing `--radius-sm/md/lg`, `--shadow-sm/md`; shell surfaces use a
  hairline border plus restrained shadow, not ornamental cards.
- Focus/motion: existing focus ring token; transitions use `--motion-fast` and GPU-safe
  `color`, `background`, `border-color`, `opacity`, `transform`. Respect
  `prefers-reduced-motion` already defined by the global contract.

## 2. Color & Surfaces

Amitzi palette: graphite-black dark canvas (`#0f1115`), graphite sidebar (`#15181d`), layered
near-black surfaces (`#181b21`, `#1e2229`, `#262b34`), porcelain light (`#f4f7f6`) and blue
signal (`#3b82f6` dark / `#2563eb` light, with deeper hover ramp stops). Dark surfaces avoid pure
black so borders, text and blue focus states retain readable separation. Surfaces use a double-bezel
recipe: translucent outer shell, hairline rim, then a raised inner core. Glow is reserved for brand
mark, active navigation and primary action. Authoritative definitions live in `app/globals.css`.
Summary of the contract:

| Token | Role |
|---|---|
| `--color-page-bg` | App background base (gradient overlays sit on top) |
| `--color-page-grad-a` / `--color-page-grad-b` | Ambient brand gradient radials (blue, both themes) |
| `--color-surface-1` | Cards, primary elevated surfaces |
| `--color-surface-2` | Panels, table body surface |
| `--color-surface-3` | Headers, inset/zebra surface |
| `--color-border` / `--color-border-strong` | Hairline / emphasized borders |
| `--color-border-focus` | Focus ring + focused border |
| `--color-accent` / `--color-accent-soft` | Brand action / soft tint |
| `--color-dashboard-balance-bg` / `--color-dashboard-balance-border` | Premium balance module surface |
| `--color-dashboard-cutoff-bg` / `--color-dashboard-cutoff-border` | Blue cutoff module surface |
| `--color-success`, `--color-danger`, `--color-warning`, `--color-info` | Semantic states |

Dark surface tuning (this contract): graphite-black layered surfaces with a blue brand signal.
Light themes remain porcelain/white and unchanged. Brand blue is decorative/action only — it never
carries money meaning; green/red remain reserved for money and status. Shared semantic token names
remain stable across themes, so components do not need theme-specific classes.

Ambient brand gradient: `color-page-grad-a/b` feed `body` and `.tabler-page-gradient` in both
themes, so the app glow and the login canvas stay blue. Change the gradient there, never inline.

Transaction semantics reuse existing state tokens — no new colors:

| Transaction | Token | Treatment |
|---|---|---|
| `income` | `--color-success` | `+` amount, success badge/tint |
| `expense` / `opening_credit` | `--color-danger` | `−` amount, danger badge/tint |
| `transfer` | `--color-info` | unsigned neutral amount, info badge/tint |
| `opening_credit` (label) | `--color-warning` | warning badge, danger-signed amount (inherited debt) |

Encoded as reusable classes (in `globals.css`): `.txn-type-badge` + `.txn-type-income`,
`.txn-type-expense`, `.txn-type-transfer`, `.txn-type-opening`;
`.txn-amount` + `.txn-amount-income`, `.txn-amount-expense`, `.txn-amount-transfer`.
Components use these classes; they never re-declare the mixins inline.

## 3. Typography

- Family: system stack (body in `globals.css`, `font-feature-settings: "cv11","ss01"`).
- Scale in use: `text-xs` (11–12px meta), `text-sm` (body/table), `text-base` (density
  "normal"), `text-lg+` (page headings via shell). No ad-hoc `font-size` in px.
- Table numbers use `tabular-nums`; amounts are `font-semibold`.
- Headings/badges may use `uppercase tracking-wide` at `text-[10px]`/`text-[11px]`.

## 4. Spacing, Radius, Shadow

- Spacing on a 4px grid via Tailwind scale (`gap-1..4`, `p-2..4`). Page sections use
  `space-y-2`/`space-y-4`.
- Radius: `--radius-sm` (controls/buttons), `--radius-md` (panels/table shell),
  `--radius-lg` (cards/drawers). Full round only for status pills/badges.
- Shadow: `--shadow-sm` resting, `--shadow-md` raised/overlays. No bespoke box-shadows.

## 5. Primitives

### App shell

- `AppShell` owns desktop sidebar, utility topbar, mobile trigger and drawer composition.
- `BrandMark` pattern is the shared geometric mark + wordmark treatment used by desktop sidebar,
  mobile drawer and login; compact rail keeps mark only. Inside the header it is the
  `.shell-sidebar-brand` row, with `.shell-sidebar-tools` holding the tagline + compact toggle.
- `ShellTopbar` is a workspace/account utility bar with a concise context label and session menu.
- `ShellPageHeader` is a layered page-level hierarchy with kicker, title, subtitle and wrapping actions.
  It preserves route navigation, logout, auth/session behavior and URL structure.
- `AppShell` owns the compact/expanded sidebar state and the `.shell-sidebar-compact` class named
  in the CSS contract; the header toggle maps to `PanelLeftClose`/`PanelLeftOpen` by state.
- `AdminNavigation` owns route links, active states and collapsible groups. Structure is
  `nav > ul > li`: a route is a `Link`; a group (Transacciones `/transactions`, Catálogos
  `/catalogs`) is a single `<button>` disclosure carrying `aria-expanded`/`aria-controls`, with
  its children as a nested `<ul>` on a guide rail. The group only expands/collapses — it is never
  also a link, so one concept has one control. Both group index routes redirect to a default child
  (`/transactions` → `/transactions/expense`, `/catalogs` → `/catalogs/categories`), which is why
  the parent route is not a nav destination.
- Group open state: manual open/close is local state, cleared on every `pathname` change; the group
  containing the active route is open by default, and the mobile drawer defaults every group open.
  In compact mode no group is open by default.
- In compact state the group toggle stays rendered (icon + tooltip) and an open group shows its
  children in a side flyout, so `/transactions/*` and `/catalogs/*` remain reachable from the rail.
- `PageHeader` owns section kicker, title, subtitle, optional meta and actions. Actions may
  wrap on narrow screens without horizontal page overflow.
- `MobileNavigationDrawer` owns scrim, dialog semantics, close control and mobile navigation.
  Focus trap and body-scroll lock remain in `useMobileNavigation`. The drawer always renders
  `AdminNavigation` in expanded mode.
- `AdminSession` and `AdminUserMenu` reuse semantic shell surfaces and 44px controls. `AdminSession`
  renders two layouts off its `compact` prop: the expanded account card, and a centered icon-only
  stack (40px avatar, 44px theme + logout controls) for the rail. The compact logout passes an empty
  `loadingText` so the spinner never overflows a 44px control.

### DataGrid (`components/data-grid/data-grid.tsx`)
- Props are additive-only. Existing: `columns, rows, mode, density, loading,
  emptyMessage, errorMessage, manualSorting, sorting, onSortingChange, manualPagination,
  pagination, onPaginationChange, rowCount, initialSorting, pageSizeOptions, toolbar,
  stickyHeader, stickyActionsColumn`.
- Added (optional, default off): `enableGlobalFilter`, `globalFilterPlaceholder`,
  `globalFilterFn`.
- Column IDs are a public contract (`actions`, `sharedExpense`, `categoryId`, …) — never
  renamed.
- Client sorting and client global filtering are built-in via `@tanstack/react-table`
  (`getSortedRowModel`, `getFilteredRowModel`). No new dependency.

### Panels / cards
- `.app-panel` (surface-2 + border + radius-md) for grouped content.
- `.app-card` (surface-1) for standalone cards.
- No hardcoded palette utilities (`bg-blue-50`, `border-blue-200`) for structural panels.

### Buttons / inputs
- `Button` variants: `primary | secondary | ghost | danger`, mapping to
  `.btn-*-semantic`. Inputs use `.input-semantic`.

## 6. Interaction States

- **Hover:** row `--color-accent` at 10% (`.table-row:hover`); buttons per variant class.
  Shell nav and group toggles use `--color-shell-hover` (`.shell-nav-link:hover`,
  `.shell-subnav-link:hover`, `.shell-nav-group-toggle:hover`).
- **Focus (required):** `focus-visible:outline-none` + 2px ring in
  `var(--color-border-focus)`. Applies to sortable header buttons, filter input/clear,
  pagination, density toggles, section collapse toggles and every sidebar nav link, group toggle,
  compact toggle and mobile trigger.
- **Nav active:** the active route renders `data-active="true"` plus `aria-current="page"` on the
  link; `.shell-nav-link[data-active="true"]` uses `--color-shell-active` with the accent rail
  pseudo-element. The accent rail also applies to a group toggle whose child is active, and the
  active submenu link gets accent text plus a dot on the guide rail.
- **Nav group expanded:** `.shell-nav-group-toggle` carries `aria-expanded` and `aria-controls`;
  the chevron rotates via `[data-open="true"]`. Hover alone gets `--color-shell-hover` and never
  changes the open state.
- **Active sort:** header exposes `aria-sort` and a direction icon
  (`ArrowUp`/`ArrowDown`/`ChevronsUpDown`), plus an ordinal when multi-sorting.
- **Loading:** row-level "Cargando..." text (existing behavior) — no layout shift.
- **Empty:** `emptyMessage` rendered in muted text, filter-aware copy from consumers.

## 7. Transaction History Layout

- Two independent client grids (regular transactions, transfer groups) inside collapsible
  `.app-panel` sections; state and callbacks preserved.
- **Type** column: `.txn-type-badge` pill with the semantic label.
- **Amount** column: `.txn-amount` with `+`/`−` sign and semantic color; transfers neutral.
- **Surfaces:** slate/warm neutrals; the near-black table shell is removed.
- Filters (type/account/category) plus in-grid text search (global filter) — both
  client-side.

## 8. Responsive & Containment

- Grid scroll container: `overflow-x-auto` + `overscroll-x-contain` + `max-w-full`, table
  `min-w-full`; horizontal overflow is contained inside the shell, never the page.
- History filter row: `grid` that is single-column on mobile and multi-column at `md`/`lg`.
- Panels/cells use `min-w-0` where flex children could otherwise force overflow.
- Sidebar is `hidden` below `lg`; the mobile trigger and drawer take over. At `lg` and up the
  sidebar is sticky full-height, sized by `--shell-sidebar-width` or, in compact mode,
  `--shell-sidebar-compact-width` (`.shell-sidebar-compact` sets both `inline-size` and
  `min-inline-size`; it does not clip horizontally because the rail flyout extends past the rail).
- Compact collapse is a width transition on the sidebar (`transition-[width]`); nav labels are not
  rendered in the rail, so no content reflows outside it. Group toggles stay in the rail and their
  children open in an absolutely positioned flyout anchored to the rail row.
- Compact-mode overrides are declared in `@layer utilities`, not `@layer components`: Tailwind v4
  utilities outrank the components layer, so a component-layer rule loses to `p-3`/`px-4` on the
  same element regardless of specificity. Keeping the rail rules in the utilities layer is what
  reclaims the padding the 44px controls need — without it the rail collapses to a few pixels of
  usable width and clips. The rail geometry is `5.5rem` wide: `0.25rem` gutters on the aside, card
  and nav area, leaving a centered 44px column.

## 9. Accessibility

- Sortable headers are real `<button>`s with `aria-label` ("Ordenar por <columna>") and
  `aria-sort` on the `<th>`.
- Global filter has an associated label (`sr-only` + `htmlFor`) and a labeled clear button.
- Section toggles are buttons with `aria-expanded` and `aria-controls`.
- Sidebar nav exposes `aria-current="page"` on the active route and `data-active` for styling;
  the compact toggle carries `aria-expanded`, `aria-controls="desktop-navigation-sidebar"` and a
  state-dependent `aria-label` ("Compactar"/"Expandir barra lateral").
- Group toggles are real `<button>`s carrying `aria-expanded` and `aria-controls` pointing at the
  group content id; the state is announced by `aria-expanded`, so the label stays the group name.
  A `name`-only `aria-label` + `title` is added in the compact rail, where the visible label is
  not rendered.
- Group content is a nested `<ul>` toggled with the `hidden` attribute, and nav content ids are
  scoped per instance (`desktop-navigation-*` / `mobile-navigation-*`) because the desktop sidebar
  and the mobile drawer can be mounted at the same time.
- The compact rail keeps an accessible name per item via `aria-label` + `title`; the mobile
  drawer exposes its own `aria-label` ("Navegación móvil administrativa") and its own section-label
  id, distinct from the desktop nav.
- Touch targets keep the 44px minimum (`--shell-control-size`, applied by `.shell-control` and by
  `.shell-drawer .shell-nav-*` plus the `@media (pointer: coarse)` override). Desktop pointer rows
  use `--shell-nav-item-size`/`--shell-nav-subitem-size` for density.
- Income/expense/transfer are distinguished by text sign + label in addition to color
  (never color alone).
- Focus is always visible on keyboard navigation.

## 10. Motion

- Brand shell uses only meaningful hover/focus, active-route, collapse, and drawer transitions;
  no decorative autoplay motion. Motion tokens are `--motion-fast` and `--motion-shell`.
- Transitions only on interactive feedback (`transition`, `transition-colors`) using
  `--motion-fast`; GPU-safe properties (`color`, `opacity`, `background`, `border-color`,
  `transform`).
- Sidebar expand/collapse animates width (`transition-[width]`); group chevrons rotate via
  `transform`. Nav link and group-toggle color/background/border transitions use `--motion-fast`.
- `@media (prefers-reduced-motion: reduce)` sets `transition-duration: 0ms` on
   `.shell-sidebar-transition`, `.shell-nav-link`, `.shell-subnav-link` and
   `.shell-nav-group-toggle`; the drawer keeps an instant path for reduced motion. No animated
   decoration on non-interactive elements. Layout-property animation outside the sidebar width
   transition is forbidden.

## 11. Accepted Debt

- Sidebar collapse, group accordion and compact icon rail are implemented; they are no longer
  deferred. Mobile card redesigns and business-screen changes remain out of scope. Add those only
  with explicit product requirements and route/accessibility coverage.
- Sidebar expand/collapse animates `width`, which is a layout property; it is isolated to the
  sidebar and its children are display-toggled, but a future pass could move to a
  `grid-template-columns` or `translate`-based rail if paint cost shows up.
- Nav density deliberately drops below 44px on fine pointers (36px rows, 30px submenu rows) at the
  product owner's request for a more compact sidebar. That is above the 24px WCAG 2.2 minimum and
  is compensated on coarse pointers by the `@media (pointer: coarse)` override plus the drawer
  rules. If a future audit requires 44px everywhere, delete the pointer-only sizes and the
  `.shell-drawer`/coarse-pointer override becomes the single value.
- The compact rail flyout opens on click only (no hover-open, no Escape-to-close, no focus return
  to the toggle). Add those only if the rail becomes a primary navigation path.
- `components/navigation/admin-shell.tsx` is an unused duplicate of `AppShell` (no importer). It
  still compiles against the same `AdminNavigation`, but delete it rather than extend it.

- `use-history-columns.tsx` sorts lookup columns by resolved display name instead of raw
  ID (e.g. category name) and exposes the display value to the global filter. If a future
  server-side sort needs raw IDs, add explicit `sortFn`/`sortingFn` per column rather than
  reverting the accessor.
- Credit-status pill keeps its existing Tailwind emerald/amber/rose/slate tone classes
  (already consistent with the semantic palette); migrate to `.txn-*` tokens only if more
  statuses are introduced.
- No visual-regression/Lighthouse run was executed in this change: the checkout has no
  test project and the API/BFF is required for a live data render. Manual browser QA is
  still owed (see task report).
