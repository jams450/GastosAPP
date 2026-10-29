"use client";

import { CatalogSingleScreenClient } from "../../catalogs/_shared/catalog-single-screen-client";
import { fetchEmailLabels } from "../_lib/email-labels-api";
import { fetchEmailRules } from "../_lib/email-rules-api";
import { RulesSection } from "./rules-section";

type Props = { username: string };

/**
 * La pantalla necesita reglas y etiquetas a la vez: el formulario elige la etiqueta destino de la
 * lista real. Se carga en una sola promesa para que la tabla no aparezca sin sus etiquetas.
 */
async function loadRulesScreen() {
  const [rules, labels] = await Promise.all([fetchEmailRules(), fetchEmailLabels()]);
  return { rules, labels };
}

export function RulesClient({ username }: Props) {
  return (
    <CatalogSingleScreenClient
      username={username}
      title="Correo · Reglas"
      subtitle="Qué etiqueta recibe cada correo, decidido por remitente, dominio o asunto. Sin reglas, todo cae en revisión."
      loadData={loadRulesScreen}
      renderSection={({ data, onDataChanged, onError, onSuccess }) => (
        <RulesSection
          rules={data.rules}
          labels={data.labels}
          onCatalogChanged={onDataChanged}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}
    />
  );
}
