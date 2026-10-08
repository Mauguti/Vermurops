#!/usr/bin/env bash
#
# Crea las cinco cuentas de prueba en el emulador de Auth.
#
# El emulador arranca VACÍO: sin esto, el login de la operación nocturna falla
# en el primer paso y todo lo demás no corre. Los catálogos NO se siembran
# aquí — la app lo hace sola al detectar la base vacía (seedGuard).
#
# Idempotente: si la cuenta ya existe, el emulador responde EMAIL_EXISTS y se
# sigue con la siguiente.
set -uo pipefail

AUTH="http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulador"

if ! curl -s -o /dev/null --max-time 3 "http://127.0.0.1:9099"; then
  echo "El emulador de Auth no responde en :9099. Levanta 'firebase emulators:start' primero." >&2
  exit 1
fi

# El claim `rol` va junto con la cuenta.
#
# Sin él, TODA cuenta del emulador cae en la vía de convivencia de las reglas
# por rol («sin claim se comporta como hoy»), y el recorrido pasaría sin
# ejercitar ni una sola restricción: verde que no prueba nada. El valor es el
# mismo que `getRolByEmail` le daría, así que la app se comporta igual.
# Poner un claim exige privilegio de administrador. En el emulador eso es
# `Authorization: Bearer owner`, y la ruta va con el proyecto: sin las dos
# cosas el emulador contesta 200 y NO guarda nada.
UPDATE="http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/vermur-logistics-app/accounts:update"

for par in admin@vermur.com:admin ventas@vermur.com:ventas pricing@vermur.com:pricing \
           operaciones@vermur.com:operaciones administracion@vermur.com:administracion; do
  correo="${par%%:*}"; rol="${par##*:}"
  r=$(curl -s -X POST "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$correo\",\"password\":\"123456\",\"returnSecureToken\":true}")
  if echo "$r" | grep -q '"idToken"'; then estado="✓ $correo"
  elif echo "$r" | grep -q 'EMAIL_EXISTS'; then estado="· $correo (ya existía)"
  else echo "  ✗ $correo → $r" >&2; continue; fi

  # El localId se saca del alta o, si ya existía, de la sesión.
  uid=$(echo "$r" | sed -n 's/.*"localId": *"\([^"]*\)".*/\1/p')
  if [[ -z "$uid" ]]; then
    s=$(curl -s -X POST "${AUTH/signUp/signInWithPassword}" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$correo\",\"password\":\"123456\",\"returnSecureToken\":true}")
    uid=$(echo "$s" | sed -n 's/.*"localId": *"\([^"]*\)".*/\1/p')
  fi
  if [[ -n "$uid" ]]; then
    curl -s -o /dev/null -X POST "$UPDATE" \
      -H 'Content-Type: application/json' -H 'Authorization: Bearer owner' \
      -d "{\"localId\":\"$uid\",\"customAttributes\":\"{\\\"rol\\\":\\\"$rol\\\"}\"}"
    echo "  $estado · rol=$rol"
  else
    echo "  $estado · ⚠️ sin uid: no se pudo poner el claim" >&2
  fi
done
