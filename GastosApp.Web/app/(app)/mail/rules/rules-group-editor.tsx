"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  EMAIL_RULE_COMBINATORS,
  EMAIL_RULE_COMBINATOR_LABELS,
  EMAIL_RULE_MATCH_FIELDS,
  EMAIL_RULE_MATCH_FIELD_LABELS,
  EMAIL_RULE_MATCH_TYPES,
  EMAIL_RULE_MATCH_TYPE_LABELS
} from "@/lib/contracts/email-rules";
import type { EmailRuleCondition, EmailRuleGroup } from "@/lib/contracts/email-rules";

/**
 * Niveles que expone la interfaz. El modelo y el motor aguantan más, pero un árbol escrito a mano
 * con más de tres niveles es ilegible y nadie lo puede auditar después.
 */
const UI_MAX_DEPTH = 3;

export function emptyCondition(): EmailRuleCondition {
  return { matchField: "sender_domain", matchType: "ends_with", matchValue: "", negated: false };
}

export function emptyGroup(combinator: EmailRuleGroup["combinator"] = "and"): EmailRuleGroup {
  return { combinator, negated: false, conditions: [emptyCondition()], groups: [] };
}

type Props = {
  group: EmailRuleGroup;
  depth: number;
  onChange: (next: EmailRuleGroup) => void;
  onRemove?: () => void;
};

/**
 * Editor recursivo de un grupo. Cada grupo combina sus condiciones y sus subgrupos con su propio
 * operador, así que el mismo componente sirve para la raíz y para cualquier subgrupo.
 */
export function RulesGroupEditor({ group, depth, onChange, onRemove }: Props) {
  function updateCondition(index: number, patch: Partial<EmailRuleCondition>) {
    onChange({
      ...group,
      conditions: group.conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition
      )
    });
  }

  function removeCondition(index: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, position) => position !== index) });
  }

  function updateChild(index: number, next: EmailRuleGroup) {
    onChange({
      ...group,
      groups: group.groups.map((child, position) => (position === index ? next : child))
    });
  }

  function removeChild(index: number) {
    onChange({ ...group, groups: group.groups.filter((_, position) => position !== index) });
  }

  const canNest = depth < UI_MAX_DEPTH;
  const labelPrefix = depth === 0 ? "raíz" : `subgrupo-${depth}`;

  return (
    <div
      className={
        depth === 0
          ? "grid gap-3 rounded-none border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
          : "grid gap-3 border-l-2 border-[var(--color-accent)]/50 pl-3"
      }
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <Select
            label={depth === 0 ? "Combinar" : "Combinar subgrupo"}
            value={group.combinator}
            onChange={(event) =>
              onChange({ ...group, combinator: event.target.value as EmailRuleGroup["combinator"] })
            }
          >
            {EMAIL_RULE_COMBINATORS.map((combinator) => (
              <option key={combinator} value={combinator}>
                {EMAIL_RULE_COMBINATOR_LABELS[combinator]}
              </option>
            ))}
          </Select>
        </div>
        {/*
          El «NO» es un booleano, no otro comparador: invierte el resultado ya combinado del grupo
          («NO (factura O invoice)»). Va junto al operador Y/O y con nombre propio para que no se
          confunda con él.
        */}
        <label
          className="text-secondary flex items-center gap-1.5 pb-2 text-xs"
          title="Invierte el resultado del grupo: casa cuando el grupo NO se cumple"
        >
          <input
            type="checkbox"
            checked={group.negated}
            aria-label={depth === 0 ? "Negar grupo raíz" : "Negar subgrupo"}
            onChange={(event) => onChange({ ...group, negated: event.target.checked })}
          />
          NO
        </label>
        {onRemove ? (
          <Button type="button" variant="ghost" onClick={onRemove} aria-label="Quitar subgrupo">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Quitar subgrupo</span>
          </Button>
        ) : null}
      </div>

      {group.conditions.map((condition, index) => (
        <div key={`${labelPrefix}-condition-${index}`} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr_1.4fr_auto]">
          <label
            className="text-secondary flex items-center gap-1.5 self-center text-xs"
            title="Invierte solo esta condición: casa cuando NO se cumple"
          >
            <input
              type="checkbox"
              checked={condition.negated}
              aria-label="Negar condición"
              onChange={(event) => updateCondition(index, { negated: event.target.checked })}
            />
            NO
          </label>
          <Select
            label={index === 0 ? "Campo" : undefined}
            aria-label="Campo de la condición"
            value={condition.matchField}
            onChange={(event) =>
              updateCondition(index, { matchField: event.target.value as EmailRuleCondition["matchField"] })
            }
          >
            {EMAIL_RULE_MATCH_FIELDS.map((field) => (
              <option key={field} value={field}>
                {EMAIL_RULE_MATCH_FIELD_LABELS[field]}
              </option>
            ))}
          </Select>
          <Select
            label={index === 0 ? "Comparación" : undefined}
            aria-label="Comparación de la condición"
            value={condition.matchType}
            onChange={(event) =>
              updateCondition(index, { matchType: event.target.value as EmailRuleCondition["matchType"] })
            }
          >
            {EMAIL_RULE_MATCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {EMAIL_RULE_MATCH_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <Input
            label={index === 0 ? "Valor" : undefined}
            aria-label="Valor de la condición"
            value={condition.matchValue}
            onChange={(event) => updateCondition(index, { matchValue: event.target.value })}
            placeholder="mercadolibre.com"
            className="input-semantic rounded-none placeholder:text-muted"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => removeCondition(index)}
            aria-label="Quitar condición"
            disabled={group.conditions.length === 1 && group.groups.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      ))}

      {group.groups.map((child, index) => (
        <RulesGroupEditor
          key={`${labelPrefix}-group-${index}`}
          group={child}
          depth={depth + 1}
          onChange={(next) => updateChild(index, next)}
          onRemove={() => removeChild(index)}
        />
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-7 rounded-none px-2 text-[11px] font-bold"
          onClick={() => onChange({ ...group, conditions: [...group.conditions, emptyCondition()] })}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          <span>Agregar condición</span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-7 rounded-none px-2 text-[11px] font-bold"
          onClick={() =>
            onChange({
              ...group,
              groups: [...group.groups, emptyGroup(group.combinator === "and" ? "or" : "and")]
            })
          }
          disabled={!canNest}
          title={canNest ? undefined : `La interfaz permite hasta ${UI_MAX_DEPTH} niveles`}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          <span>Agregar subgrupo</span>
        </Button>
      </div>
    </div>
  );
}
