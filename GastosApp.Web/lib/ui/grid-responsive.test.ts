import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACTIONS_COLUMN_ID,
  gridMeta,
  projectGridResponsive,
  resolveColumnId,
  type GridColumnLike
} from "./grid-responsive.ts";

test("sin meta ninguna columna se proyecta a la tarjeta y la tabla no pierde columnas", () => {
  const columns: GridColumnLike[] = [
    { accessorKey: "name", header: "Nombre" },
    { accessorKey: "amount", header: "Importe" }
  ];

  const plan = projectGridResponsive(columns);

  // C4: comportamiento anterior intacto; el header de texto sí da etiqueta.
  assert.equal(plan.hasCardLayout, true);
  assert.deepEqual(plan.card.fields.map((field) => field.columnId), ["name", "amount"]);
  assert.equal(plan.card.title, null);
  assert.deepEqual(plan.tabletHiddenIds, []);
});

test("una columna sin etiqueta utilizable no se inventa en la tarjeta", () => {
  const columns: GridColumnLike[] = [
    { id: "name", header: "Nombre" },
    { id: "actions", header: "" },
    { id: "mystery", header: () => null }
  ];

  const plan = projectGridResponsive(columns);

  assert.deepEqual(plan.card.fields.map((field) => field.columnId), ["name"]);
});

test("la columna actions nunca entra a la tarjeta aunque declare metadatos", () => {
  const columns: GridColumnLike[] = [
    { id: "name", header: "Nombre", meta: gridMeta({ mobileRole: "title" }) },
    { id: ACTIONS_COLUMN_ID, header: "", meta: gridMeta({ mobileLabel: "Acciones", mobileRole: "field" }) }
  ];

  const plan = projectGridResponsive(columns);

  assert.equal(plan.card.title?.columnId, "name");
  assert.deepEqual(plan.card.fields, []);
  assert.equal(plan.hasCardLayout, true);
});

test("tabletHidden retira la columna sólo de la tabla intermedia", () => {
  const columns: GridColumnLike[] = [
    { accessorKey: "name", header: "Nombre" },
    { accessorKey: "color", header: "Color", meta: gridMeta({ tabletHidden: true }) },
    { accessorKey: "tags", header: "Tags", meta: gridMeta({ tabletHidden: true }) }
  ];

  const plan = projectGridResponsive(columns);

  assert.deepEqual(plan.tabletHiddenIds, ["color", "tags"]);
  // La columna sigue disponible para la tarjeta: retirarla de la tabla no la borra del dato.
  assert.deepEqual(plan.card.fields.map((field) => field.columnId), ["name", "color", "tags"]);
});

test("mobileLabel sobrescribe el header de texto", () => {
  const columns: GridColumnLike[] = [
    { accessorKey: "active", header: "Estado", meta: gridMeta({ mobileLabel: "Situación" }) }
  ];

  assert.equal(projectGridResponsive(columns).card.fields[0]?.label, "Situación");
});

test("los roles reparten la tarjeta y conservan el orden de declaración", () => {
  const columns: GridColumnLike[] = [
    { accessorKey: "name", header: "Nombre", meta: gridMeta({ mobileRole: "title" }) },
    { accessorKey: "category", header: "Categoría", meta: gridMeta({ mobileRole: "subtitle" }) },
    { accessorKey: "amount", header: "Importe", meta: gridMeta({ mobileRole: "amount" }) },
    { accessorKey: "active", header: "Estado", meta: gridMeta({ mobileRole: "status" }) },
    { accessorKey: "type", header: "Tipo" },
    { accessorKey: "tags", header: "Tags" },
    { id: ACTIONS_COLUMN_ID, header: "" }
  ];

  const plan = projectGridResponsive(columns);

  assert.equal(plan.card.title?.columnId, "name");
  assert.deepEqual(plan.card.subtitle.map((field) => field.columnId), ["category"]);
  assert.deepEqual(plan.card.amount.map((field) => field.columnId), ["amount"]);
  assert.deepEqual(plan.card.status.map((field) => field.columnId), ["active"]);
  assert.deepEqual(plan.card.fields.map((field) => field.columnId), ["type", "tags"]);
  assert.equal(plan.card.amount[0]?.align, "end");
  assert.equal(plan.card.fields[0]?.align, "start");
});

test("un segundo title cae en subtitle para no perder el dato", () => {
  const columns: GridColumnLike[] = [
    { accessorKey: "name", header: "Nombre", meta: gridMeta({ mobileRole: "title" }) },
    { accessorKey: "alias", header: "Alias", meta: gridMeta({ mobileRole: "title" }) }
  ];

  const plan = projectGridResponsive(columns);

  assert.equal(plan.card.title?.columnId, "name");
  assert.deepEqual(plan.card.subtitle.map((field) => field.columnId), ["alias"]);
});

test("mobileRole hidden saca la columna de la tarjeta sin retirarla de la tabla", () => {
  const columns: GridColumnLike[] = [
    { accessorKey: "name", header: "Nombre" },
    { accessorKey: "internalId", header: "Folio interno", meta: gridMeta({ mobileRole: "hidden" }) }
  ];

  const plan = projectGridResponsive(columns);

  assert.deepEqual(plan.card.fields.map((field) => field.columnId), ["name"]);
  assert.deepEqual(plan.tabletHiddenIds, []);
});

test("hasCardLayout es falso cuando ninguna columna aporta etiqueta", () => {
  const plan = projectGridResponsive([
    { id: ACTIONS_COLUMN_ID, header: "" },
    { id: "renderOnly", header: () => null }
  ]);

  assert.equal(plan.hasCardLayout, false);
  assert.equal(plan.card.title, null);
  assert.deepEqual(plan.card.fields, []);
});

test("resolveColumnId prefiere id y cae a accessorKey", () => {
  assert.equal(resolveColumnId({ id: "actions", accessorKey: "name" }), "actions");
  assert.equal(resolveColumnId({ accessorKey: "name" }), "name");
  assert.equal(resolveColumnId({ accessorKey: 42 }), "42");
  assert.equal(resolveColumnId({ header: "Sin id" }), null);
});

test("la proyección no muta las columnas de entrada", () => {
  const columns: GridColumnLike[] = [
    { accessorKey: "name", header: "Nombre", meta: gridMeta({ mobileRole: "title" }) },
    { accessorKey: "color", header: "Color", meta: gridMeta({ tabletHidden: true }) }
  ];
  const snapshot = JSON.stringify(columns);

  projectGridResponsive(columns);

  assert.equal(JSON.stringify(columns), snapshot);
});
