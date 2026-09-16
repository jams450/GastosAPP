#!/usr/bin/env bash
#
# Plantilla de humo E5 — Fase 1 Telegram (solo lectura de secretos desde el entorno).
#
# IMPORTANTE
#   - NO ejecutar contra producción. Usar un entorno local/staging con DB desechable.
#   - No contiene secretos: TELEGRAM_WEBHOOK_SECRET y TELEGRAM_TEST_USER_ID se pasan por entorno.
#   - No requiere Docker. Solo `curl`.
#   - El API debe tener Telegram__Enabled=true y Telegram__AllowedUserId = TELEGRAM_TEST_USER_ID.
#     Si el token del bot no es válido, el envío real del mensaje fallará en silencio, pero el
#     status HTTP del webhook (lo que este script verifica) sigue siendo el esperado.
#
# Uso:
#   API_URL=http://localhost:5000 \
#   TELEGRAM_WEBHOOK_SECRET='<secreto de prueba>' \
#   TELEGRAM_TEST_USER_ID=123456789 \
#   TELEGRAM_TEST_CATEGORY='<categoría existente en el catálogo del usuario de prueba>' \
#   ./scripts/smoke-telegram-fase1.sh
#
# Salida: PASS/FAIL por caso y exit code != 0 si algo falla.

set -euo pipefail

BASE_URL="${API_URL:-http://localhost:5000}"
SECRET="${TELEGRAM_WEBHOOK_SECRET:?Define TELEGRAM_WEBHOOK_SECRET (valor de prueba, no de producción)}"
FROM_ID="${TELEGRAM_TEST_USER_ID:?Define TELEGRAM_TEST_USER_ID (id numérico autorizado en el entorno de prueba)}"
CATEGORY="${TELEGRAM_TEST_CATEGORY:?Define TELEGRAM_TEST_CATEGORY (categoría existente en el entorno de prueba)}"
UNKNOWN_ID="${TELEGRAM_UNKNOWN_USER_ID:-999999999}"
PATH_WEBHOOK="/api/telegram/webhook"

FAILURES=0
LAST_HTTP=""

post_update() {
  local update_json="$1"
  local header_secret="${2-__OMIT__}"
  local extra_update_id="${3:-}"

  local -a args=(-s -o /tmp/smoke-telegram-body.json -w '%{http_code}' -X POST "${BASE_URL}${PATH_WEBHOOK}" -H 'Content-Type: application/json')

  if [[ "$header_secret" != "__OMIT__" ]]; then
    args+=(-H "X-Telegram-Bot-Api-Secret-Token: ${header_secret}")
  fi

  args+=(--data "${update_json}")

  LAST_HTTP="$(curl "${args[@]}")"
}

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS  ${name} (HTTP ${actual})"
  else
    echo "FAIL  ${name}: esperado HTTP ${expected}, obtenido ${actual}"
    FAILURES=$((FAILURES + 1))
  fi
}

build_update() {
  local update_id="$1" user_id="$2" chat_id="$3" chat_type="$4" text="$5"
  printf '{"update_id":%s,"message":{"message_id":1,"date":0,"chat":{"id":%s,"type":"%s"},"from":{"id":%s,"is_bot":false,"first_name":"Smoke"},"text":"%s"}}' \
    "$update_id" "$chat_id" "$chat_type" "$user_id" "$text"
}

echo "== Smoke Fase 1 Telegram contra ${BASE_URL} =="

# --- Caso 7: secret ausente -> 401 -------------------------------------------------
post_update "$(build_update 900001 "$FROM_ID" "$FROM_ID" private '/ayuda')" "__OMIT__"
check "secret ausente" "401" "$LAST_HTTP"

# --- Caso 7b: secret incorrecto -> 401 ---------------------------------------------
post_update "$(build_update 900002 "$FROM_ID" "$FROM_ID" private '/ayuda')" "incorrecto"
check "secret incorrecto" "401" "$LAST_HTTP"

# --- Caso 6: usuario no autorizado -> 403 ------------------------------------------
post_update "$(build_update 900003 "$UNKNOWN_ID" "$UNKNOWN_ID" private '/ayuda')" "$SECRET"
check "usuario no autorizado" "403" "$LAST_HTTP"

# --- Chat no privado -> 403 ---------------------------------------------------------
post_update "$(build_update 900004 "$FROM_ID" "$FROM_ID" group '/ayuda')" "$SECRET"
check "chat no privado" "403" "$LAST_HTTP"

# --- Caso 1a: /gasto sin categoría -> 200 (pide categoría, NO crea borrador) --------
post_update "$(build_update 900005 "$FROM_ID" "$FROM_ID" private '/gasto 200 | efectivo')" "$SECRET"
check "comando /gasto sin categoría" "200" "$LAST_HTTP"

# --- Caso 1b: /gasto con campos delimitados -> 200 (crea borrador) ------------------
post_update "$(build_update 900011 "$FROM_ID" "$FROM_ID" private "/gasto 200 | efectivo | ${CATEGORY} | | | smoke")" "$SECRET"
check "comando /gasto con categoría" "200" "$LAST_HTTP"

# --- Caso 2: confirmación -> 200 ----------------------------------------------------
post_update "$(build_update 900006 "$FROM_ID" "$FROM_ID" private 'sí')" "$SECRET"
check "confirmación (sí)" "200" "$LAST_HTTP"

# --- Caso 3: cancelación -> 200 -----------------------------------------------------
post_update "$(build_update 900007 "$FROM_ID" "$FROM_ID" private 'no')" "$SECRET"
check "cancelación (no)" "200" "$LAST_HTTP"

# --- Caso 4: monto 0 -> 200 con mensaje funcional, sin escritura --------------------
post_update "$(build_update 900008 "$FROM_ID" "$FROM_ID" private '/gasto 0 | efectivo')" "$SECRET"
check "monto 0" "200" "$LAST_HTTP"

# --- Caso 9: comando manual con LLM caído -> 200 ------------------------------------
post_update "$(build_update 900009 "$FROM_ID" "$FROM_ID" private '/cuentas')" "$SECRET"
check "comando /cuentas" "200" "$LAST_HTTP"

# --- Caso 9b: listados de catálogos -> 200 ------------------------------------------
post_update "$(build_update 900012 "$FROM_ID" "$FROM_ID" private '/subcategorias')" "$SECRET"
check "comando /subcategorias" "200" "$LAST_HTTP"

post_update "$(build_update 900013 "$FROM_ID" "$FROM_ID" private '/comercios')" "$SECRET"
check "comando /comercios" "200" "$LAST_HTTP"

# --- Caso 5: update duplicado -> 200 sin segundo efecto -----------------------------
post_update "$(build_update 900010 "$FROM_ID" "$FROM_ID" private '/ayuda')" "$SECRET"
check "update original" "200" "$LAST_HTTP"
post_update "$(build_update 900010 "$FROM_ID" "$FROM_ID" private '/ayuda')" "$SECRET"
check "update duplicado" "200" "$LAST_HTTP"

# --- Verificación manual sugerida (opcional, requiere psql directo, no Docker) -----
cat <<'SQL'

Para comprobar efectos en DB (ajusta host/usuario/base; no incluir credenciales en el repo):

  SELECT count(*) FROM telegram_processed_updates WHERE update_id IN (900011,900010);
  SELECT status, count(*) FROM telegram_expense_drafts WHERE chat_id = <TELEGRAM_TEST_USER_ID> GROUP BY status;
  SELECT count(*) FROM transactions WHERE description = 'smoke';

Esperado: los updates terminan en status 'done'; el borrador creado por el caso 1b (900011) queda
'confirmed' tras 'sí'; el caso sin categoría (900005) y el de monto 0 no crean borrador;
el duplicado (900010) no incrementa filas.

SQL

if [[ "$FAILURES" -gt 0 ]]; then
  echo "Resultado: ${FAILURES} caso(s) con FAIL."
  exit 1
fi

echo "Resultado: todos los casos en verde."
