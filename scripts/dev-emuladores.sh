#!/usr/bin/env bash
#
# Levanta ESTE checkout contra emuladores, para validar en navegador sin
# tocar producción: Auth + Firestore + Storage, las cinco cuentas de prueba,
# y la app en :3100 con VITE_USAR_EMULADORES=1.
#
# SIEMPRE arranca limpio: apaga lo que haya en esos puertos (emuladores o
# app de una corrida anterior, incluida la de e2e.sh) y levanta lo suyo.
# Reusar lo que «responde» no sirve: un proceso recién matado sigue
# contestando un segundo y el script se quedaba sin nada que esperar
# (24-sep-2026). Los datos de ejemplo los siembra la app sola (seedGuard).
#
# Uso:  ./scripts/dev-emuladores.sh      → abre http://localhost:3100
#       Ctrl+C apaga todo.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p .noche/reportes
PUERTO="${PUERTO:-3100}"
PUERTOS="$PUERTO,8080,9099,9199,4000,4400"

# ── 1 · Limpiar ─────────────────────────────────────────────────────────────
if [[ -n "$(lsof -ti:$PUERTOS 2>/dev/null)" ]]; then
  echo "· apagando lo que había en :$PUERTOS"
  lsof -ti:$PUERTOS | xargs kill 2>/dev/null
  for _ in $(seq 1 15); do
    [[ -z "$(lsof -ti:$PUERTOS 2>/dev/null)" ]] && break
    sleep 1
  done
  lsof -ti:$PUERTOS | xargs kill -9 2>/dev/null
fi

# ── 2 · Levantar ────────────────────────────────────────────────────────────
./scripts/reglasEmulador.sh >/dev/null && npx firebase emulators:start --config firebase.emulador.json --only auth,firestore,storage > .noche/reportes/emu-dev.log 2>&1 &
EMU=$!
VITE_USAR_EMULADORES=1 npx vite --port "$PUERTO" --strictPort > .noche/reportes/dev-emu.log 2>&1 &
DEV=$!
cleanup() { kill $EMU $DEV 2>/dev/null; lsof -ti:$PUERTOS | xargs kill 2>/dev/null; }
trap cleanup EXIT INT TERM

esperar() { local i=0; until curl -s -o /dev/null --max-time 2 "$1"; do sleep 2; i=$((i+2)); [[ $i -ge $2 ]] && { echo "✗ $3 no respondió (ver .noche/reportes/emu-dev.log)"; exit 1; }; done; echo "✓ $3"; }
esperar "http://127.0.0.1:8080" 120 "emulador Firestore"
esperar "http://127.0.0.1:9099" 60 "emulador Auth"
esperar "http://localhost:$PUERTO" 60 "app :$PUERTO"

# ── 3 · Cuentas de prueba, con reintentos: Auth contesta antes de estar listo ──
for intento in 1 2 3 4 5; do
  if ./scripts/sembrarEmuladores.sh > /dev/null 2>&1; then echo "✓ cuentas de prueba"; break; fi
  [[ $intento -eq 5 ]] && { echo "✗ no se pudieron sembrar las cuentas"; exit 1; }
  sleep 2
done

echo
echo "  Sirviendo $REPO"
echo "  http://localhost:$PUERTO  ·  cuentas: ventas@ / pricing@ / operaciones@ / administracion@ / admin@vermur.com  (contraseña 123456)"
echo "  Ctrl+C para apagar emuladores y app."
echo
wait
