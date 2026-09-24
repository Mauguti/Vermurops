#!/usr/bin/env bash
#
# Levanta ESTE checkout contra emuladores, para validar en navegador sin
# tocar producción: Auth + Firestore + Storage, las cinco cuentas de prueba,
# y la app en :3100 con VITE_USAR_EMULADORES=1.
#
# Es lo mismo que hace scripts/e2e.sh, sin correr el recorrido. Los datos
# de ejemplo (COT-2026-0001..0008) los siembra la app sola al arrancar
# vacía (seedGuard).
#
# Uso:  ./scripts/dev-emuladores.sh      → abre http://localhost:3100
#       Ctrl+C apaga todo.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p .noche/reportes
PUERTO="${PUERTO:-3100}"

esperar() { local i=0; until curl -s -o /dev/null --max-time 2 "$1"; do sleep 2; i=$((i+2)); [[ $i -ge $2 ]] && { echo "✗ $3 no respondió"; exit 1; }; done; echo "✓ $3"; }

if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:8080; then
  npx firebase emulators:start --only auth,firestore,storage > .noche/reportes/emu-dev.log 2>&1 &
  EMU=$!
fi
if ! curl -s -o /dev/null --max-time 2 "http://localhost:$PUERTO"; then
  VITE_USAR_EMULADORES=1 npx vite --port "$PUERTO" --strictPort > .noche/reportes/dev-emu.log 2>&1 &
  DEV=$!
fi
cleanup() { kill ${EMU:-} ${DEV:-} 2>/dev/null; lsof -ti:8080,9099,9199,4000,4400 | xargs kill 2>/dev/null; }
trap cleanup EXIT INT TERM

esperar "http://127.0.0.1:8080" 120 "emulador Firestore"
esperar "http://127.0.0.1:9099" 60 "emulador Auth"
esperar "http://localhost:$PUERTO" 60 "app :$PUERTO"
./scripts/sembrarEmuladores.sh > /dev/null

echo
echo "  Sirviendo $REPO"
echo "  http://localhost:$PUERTO  ·  cuentas: ventas@ / pricing@ / operaciones@ / administracion@ / admin@vermur.com  (contraseña 123456)"
echo "  Ctrl+C para apagar emuladores y app."
echo
wait
