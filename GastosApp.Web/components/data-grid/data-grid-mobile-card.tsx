import type { ReactNode } from "react";
import type { GridMobileCardLayout, GridMobileField } from "@/lib/ui/grid-responsive";

type Props = {
  layout: GridMobileCardLayout;
  /** Dibuja el valor ya renderizado de la columna. */
  renderValue: (field: GridMobileField) => ReactNode;
  /** Acciones de la fila; se dibujan al pie, separadas del contenido. */
  actions: ReactNode;
};

/**
 * Tarjeta automática de fila para pantallas por debajo de 640px.
 *
 * La composición sale de `GridMobileCardLayout`: título y subtítulos arriba, importe y
 * estado a la derecha, el resto de campos como pares etiqueta/valor, y las acciones en un
 * pie separado. Así el ancho de los botones deja de competir con el de los datos, que es
 * exactamente el problema que las tablas tenían en móvil.
 */
export function DataGridMobileCard({ layout, renderValue, actions }: Props) {
  const { title, subtitle, status, amount, fields } = layout;
  const hasAside = amount.length > 0 || status.length > 0;

  return (
    <article className="app-panel rounded-[var(--radius-md)] p-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {title ? (
            <p className="text-primary text-sm font-semibold break-words">{renderValue(title)}</p>
          ) : null}
          {subtitle.map((field) => (
            <p key={field.columnId} className="text-muted text-xs break-words">
              {renderValue(field)}
            </p>
          ))}
        </div>

        {hasAside ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {amount.map((field) => (
              <span key={field.columnId} className="text-primary text-sm font-semibold tabular-nums">
                {renderValue(field)}
              </span>
            ))}
            {status.map((field) => (
              <span key={field.columnId}>{renderValue(field)}</span>
            ))}
          </div>
        ) : null}
      </header>

      {fields.length > 0 ? (
        <dl className="mt-2.5 space-y-1">
          {fields.map((field) => (
            <div key={field.columnId} className="flex items-baseline justify-between gap-3 text-xs">
              <dt className="text-muted shrink-0">{field.label}</dt>
              <dd className="text-primary min-w-0 text-right font-semibold tabular-nums">{renderValue(field)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? (
        <footer
          className="mt-3 border-t border-default pt-2.5 [&>div]:flex [&>div]:flex-wrap [&>div]:justify-start [&>div]:gap-2 [&_a]:min-h-10 [&_a]:flex-1 [&_button]:min-h-10 [&_button]:flex-1"
        >
          {actions}
        </footer>
      ) : null}
    </article>
  );
}
