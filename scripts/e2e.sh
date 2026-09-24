#!/usr/bin/env bash
#
# El recorrido del jueves, contra EMULADORES: levanta Auth+Firestore+Storage,
# siembra las cinco cuentas, arranca la app en :3100 con VITE_USAR_EMULADORES=1
# y corre tests/e2e/recorrido-jueves.spec.ts. Sin deploy, sin producción.
#
# Uso:  ./scripts/e2e.sh            (todo el recorrido)
#       ./scripts/e2e.sh --headed   (viéndolo)
#       KEEP=1 ./scripts/e2e.sh     (deja emuladores y app arriba al terminar)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p .noche/reportes
PUERTO=3100

esperar() { local i=0; until curl -s -o /dev/null --max-time 2 "$1"; do sleep 2; i=$((i+2)); [[ $i -ge $2 ]] && { echo "✗ $3 no respondió"; exit 1; }; done; echo "✓ $3"; }

if ! curl -s -o /dev/null --max-time 2 http://127.0.0.1:8080; then
  ./scripts/reglasEmulador.sh >/dev/null && npx firebase emulators:start --config firebase.emulador.json --only auth,firestore,storage > .noche/reportes/emu-e2e.log 2>&1 &
  EMU=$!
fi
if ! curl -s -o /dev/null --max-time 2 "http://localhost:$PUERTO"; then
  VITE_USAR_EMULADORES=1 npx vite --port "$PUERTO" --strictPort > .noche/reportes/dev-e2e.log 2>&1 &
  DEV=$!
fi
cleanup() { [[ "${KEEP:-0}" == "1" ]] && return; kill ${EMU:-} ${DEV:-} 2>/dev/null; lsof -ti:8080,9099,9199,4000,4400 | xargs kill 2>/dev/null; }
trap cleanup EXIT

esperar "http://127.0.0.1:8080" 120 "emulador Firestore"
esperar "http://127.0.0.1:9099" 60 "emulador Auth"
esperar "http://localhost:$PUERTO" 60 "app :$PUERTO"
./scripts/sembrarEmuladores.sh > /dev/null

npx playwright test tests/e2e/recorrido-jueves.spec.ts --workers=1 "$@"
