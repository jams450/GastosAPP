/**
 * Proyección de columnas a los tres modos de presentación del `DataGrid`.
 *
 * El patrón híbrido acordado es: tarjetas por debajo de 640px, tabla reducida con menú
 * de acciones entre 640px y 1024px, y tabla completa por encima de 1024px. Este módulo
 * es la parte pura y determinista de esa decisión: recibe la forma estructural de las
 * columnas y devuelve qué columnas alimentan la tarjeta y cuáles se retiran de la tabla
 * intermedia. No conoce React, así que se puede probar sin DOM.
 *
 * Sin `meta` una columna conserva el comportamiento anterior: sigue en la tabla y no se
 * inventa una etiqueta para la tarjeta.
 */

export type GridMobileRole = "title" | "subtitle" | "status" | "amount" | "field" | "hidden";

export type GridColumnMeta = {
  /** Etiqueta que se muestra junto al valor dentro de la tarjeta móvil. */
  mobileLabel?: string;
  /** Dónde se coloca el valor dentro de la tarjeta. Por defecto `field`. */
  mobileRole?: GridMobileRole;
  /** Retira la columna de la tabla reducida de 640–1024px. */
  tabletHidden?: boolean;
};

/** Forma mínima de una columna: lo único que la proyección necesita leer. */
export type GridColumnLike = {
  id?: string;
  accessorKey?: unknown;
  header?: unknown;
  meta?: unknown;
};

export type GridMobileField = {
  /** Identificador estable de la columna; se usa como clave de render. */
  columnId: string;
  label: string;
  align: "start" | "end";
};

export type GridMobileCardLayout = {
  title: GridMobileField | null;
  subtitle: GridMobileField[];
  status: GridMobileField[];
  amount: GridMobileField[];
  fields: GridMobileField[];
};

export type GridResponsivePlan = {
  card: GridMobileCardLayout;
  /** Ids de columna que se retiran de la tabla de 640–1024px. */
  tabletHiddenIds: string[];
  /** Verdadero cuando al menos una columna declaró metadatos de tarjeta. */
  hasCardLayout: boolean;
};

export const ACTIONS_COLUMN_ID = "actions";

/**
 * Azúcar para declarar metadatos de columna con validación de forma.
 *
 * `ColumnDef.meta` está tipado como `unknown` en TanStack Table y no se puede aumentar
 * (es un alias de tipo, no una interfaz), así que la comprobación se hace en el punto de
 * declaración de cada pantalla: `meta: gridMeta({ mobileLabel: "Nombre", mobileRole: "title" })`.
 */
export function gridMeta(meta: GridColumnMeta): GridColumnMeta {
  return meta;
}

const EMPTY_CARD: GridMobileCardLayout = {
  title: null,
  subtitle: [],
  status: [],
  amount: [],
  fields: []
};

export function resolveColumnId(column: GridColumnLike): string | null {
  if (typeof column.id === "string" && column.id.length > 0) {
    return column.id;
  }
  if (column.accessorKey !== undefined && column.accessorKey !== null) {
    return String(column.accessorKey);
  }
  return null;
}

function readMeta(value: unknown): GridColumnMeta {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return value as GridColumnMeta;
}

function readHeaderLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Decide el destino de cada columna en los modos móvil e intermedio.
 *
 * Reglas:
 * - La columna `actions` nunca entra a la tarjeta; sus acciones se dibujan en el pie.
 * - Una columna sin etiqueta utilizable (ni `meta.mobileLabel` ni un `header` de texto)
 *   no se proyecta: no se inventan etiquetas.
 * - `mobileRole: "hidden"` la excluye de la tarjeta sin retirarla de la tabla.
 */
export function projectGridResponsive(columns: readonly GridColumnLike[]): GridResponsivePlan {
  const tabletHiddenIds: string[] = [];
  const subtitle: GridMobileField[] = [];
  const status: GridMobileField[] = [];
  const amount: GridMobileField[] = [];
  const fields: GridMobileField[] = [];
  let title: GridMobileField | null = null;
  let hasCardLayout = false;

  for (const column of columns) {
    const columnId = resolveColumnId(column);
    if (columnId === null || columnId === ACTIONS_COLUMN_ID) {
      continue;
    }

    const meta = readMeta(column.meta);

    if (meta.tabletHidden === true) {
      tabletHiddenIds.push(columnId);
    }

    const role = meta.mobileRole ?? "field";
    if (role === "hidden") {
      continue;
    }

    const label = meta.mobileLabel ?? readHeaderLabel(column.header);
    if (label === null) {
      continue;
    }

    const field: GridMobileField = {
      columnId,
      label,
      align: role === "amount" ? "end" : "start"
    };

    hasCardLayout = true;

    if (role === "title") {
      // Una sola columna puede ser el título de la tarjeta; la primera declarada gana.
      if (title === null) {
        title = field;
      } else {
        subtitle.push(field);
      }
      continue;
    }

    if (role === "subtitle") {
      subtitle.push(field);
    } else if (role === "status") {
      status.push(field);
    } else if (role === "amount") {
      amount.push(field);
    } else {
      fields.push(field);
    }
  }

  return {
    card: hasCardLayout
      ? { title, subtitle, status, amount, fields }
      : { ...EMPTY_CARD },
    tabletHiddenIds,
    hasCardLayout
  };
}
