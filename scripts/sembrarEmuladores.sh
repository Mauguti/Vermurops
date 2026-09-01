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

for correo in admin@vermur.com ventas@vermur.com pricing@vermur.com \
              operaciones@vermur.com administracion@vermur.com; do
  r=$(curl -s -X POST "$AUTH" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$correo\",\"password\":\"123456\",\"returnSecureToken\":true}")
  if echo "$r" | grep -q '"idToken"'; then echo "  ✓ $correo"
  elif echo "$r" | grep -q 'EMAIL_EXISTS'; then echo "  · $correo (ya existía)"
  else echo "  ✗ $correo → $r" >&2; fi
done
