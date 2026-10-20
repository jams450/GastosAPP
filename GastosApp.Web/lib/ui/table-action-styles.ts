/**
 * Acciones secundarias de tabla.
 *
 * Los nombres de clase son parte del contrato: nueve pantallas los consumen, así que
 * `tableActionBaseClass` y las claves de `tableActionStyles` no se renombran.
 *
 * La apariencia vive en `app/globals.css` (`.table-action*`) para poder apoyarse en los
 * tokens del contrato de diseño en lugar de la paleta cruda de Tailwind. El tono
 * semántico vive en el texto y el borde, nunca en un bloque de color: la fila es el
 * contenido, no los botones.
 */
export const tableActionBaseClass = "table-action h-8 border px-2 text-[11px] font-semibold";

export const tableActionStyles = {
  create: "table-action-create",
  edit: "table-action-edit",
  deactivate: "table-action-deactivate",
  activate: "table-action-activate",
  delete: "table-action-delete"
} as const;
