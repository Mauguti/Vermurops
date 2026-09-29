#!/usr/bin/env bash
#
# El recorrido del jueves, contra EMULADORES: levanta Auth+Firestore+Storage,
# siembra las cinco cuentas, arranca la app en :3100 con VITE_USAR_EMULADORES=1
# y corre tests/e2e/recorrido-jueves.spec.ts. Sin deploy, sin producción.
#
# ── Siempre desde cero (28-sep-2026) ───────────────────────────────────────
# Antes REUTILIZABA lo que estuviera arriba: si había emuladores de una sesión
# anterior, corría contra sus datos, y si había un vite viejo, contra otro
# código. Y pasaba de crear las cuentas directo al paso 1, sin esperar a que la
# app sembrara los catálogos —que es quien los siembra, no ningún script—, así
# que el paso 1 se quedaba sin el cliente, los puertos y los conceptos que
# necesita en su primera pantalla. Fallaba y al reintento pasaba: una
# intermitencia que se veía igual que una regresión y nos quitaba la red.
#
# Ahora: apagar todo → arrancar limpio → cuentas → CALENTAR (la app siembra)
# → esperar a que los catálogos estén EN FIRESTORE → recorrido.
#
# Uso:  ./scripts/e2e.sh            (todo el recorrido)
#       ./scripts/e2e.sh --headed   (viéndolo)
#       KEEP=1 ./scripts/e2e.sh     (deja emuladores y app arriba al terminar)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
mkdir -p .noche/reportes
PUERTO=3100
PUERTOS_EMU="8080,9099,9199,4000,4400"
FS="http://127.0.0.1:8080/v1/projects/vermur-logistics-app/databases/(default)/documents"

esperar() { local i=0; until curl -s -o /dev/null --max-time 2 "$1"; do sleep 2; i=$((i+2)); [[ $i -ge $2 ]] && { echo "✗ $3 no respondió"; exit 1; }; done; echo "✓ $3"; }

# Apaga TODO lo que pueda estorbar y espera a que los puertos queden libres de
# verdad: matar el proceso no libera el puerto en el mismo instante, y arrancar
# encima es la mitad de la intermitencia que veníamos viendo.
apagar() {
  kill "${EMU:-}" "${DEV:-}" 2>/dev/null
  # shellcheck disable=SC2046
  lsof -ti:"$PUERTOS_EMU","$PUERTO" 2>/dev/null | xargs kill -9 2>/dev/null
  local i=0
  while lsof -ti:"$PUERTOS_EMU","$PUERTO" >/dev/null 2>&1; do
    sleep 1; i=$((i+1)); [[ $i -ge 30 ]] && { echo "✗ los puertos siguen ocupados" >&2; break; }
  done
}

limpiar_al_salir() { [[ "${KEEP:-0}" == "1" ]] && return; apagar; }

echo "· apagando lo que haya (emuladores y app)"
apagar
trap limpiar_al_salir EXIT

./scripts/reglasEmulador.sh >/dev/null
npx firebase emulators:start --config firebase.emulador.json --only auth,firestore,storage > .noche/reportes/emu-e2e.log 2>&1 &
EMU=$!
VITE_USAR_EMULADORES=1 npx vite --port "$PUERTO" --strictPort > .noche/reportes/dev-e2e.log 2>&1 &
DEV=$!

esperar "http://127.0.0.1:8080" 120 "emulador Firestore"
esperar "http://127.0.0.1:9099" 60  "emulador Auth"
esperar "http://localhost:$PUERTO" 60 "app :$PUERTO"
./scripts/sembrarEmuladores.sh > /dev/null

# ── Calentar: la app siembra los catálogos ────────────────────────────────
echo "· calentando (la app siembra los catálogos)"
if ! npx playwright test tests/e2e/calentar.spec.ts --workers=1 --retries=0 --reporter=line; then
  echo "✗ el calentamiento falló: la app no sembró los catálogos. Mira .noche/reportes/dev-e2e.log" >&2
  exit 1
fi

# ── Esperar a que la siembra esté EN FIRESTORE ────────────────────────────
# Contar documentos contra el servidor es la única prueba: que el navegador
# haya terminado no dice que la escritura llegó.
contar() { python3 scripts/contarColeccion.py "$1"; }

# Mínimos, no exactos: el recorrido va creando documentos y el catálogo puede
# crecer. Lo que importa es que lo que el paso 1 necesita ya exista.
esperar_catalogo() {
  local col=$1 minimo=$2 i=0 n=0
  while true; do
    n=$(contar "$col")
    [[ "$n" -ge "$minimo" ]] && { echo "  ✓ $col: $n"; return 0; }
    sleep 2; i=$((i+2))
    if [[ $i -ge 30 ]]; then
      echo "✗ $col se quedó en $n de $minimo esperados" >&2
      return 1
    fi
  done
}

echo "· confirmando los catálogos contra Firestore"
fallo=0
esperar_catalogo conceptos    105 || fallo=1
esperar_catalogo puertos       47 || fallo=1
esperar_catalogo clientes       3 || fallo=1
esperar_catalogo proveedores  544 || fallo=1
esperar_catalogo terminosPago  25 || fallo=1
esperar_catalogo cotizaciones   8 || fallo=1
[[ $fallo -eq 1 ]] && { echo "✗ los catálogos no quedaron completos: el recorrido no corre" >&2; exit 1; }

npx playwright test tests/e2e/recorrido-jueves.spec.ts --workers=1 "$@"
