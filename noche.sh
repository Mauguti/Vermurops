#!/usr/bin/env bash
#
# Operación nocturna de VermurOps.
#
# Loop headless: audita la UI, arregla por lotes, pule, y cierra a las 06:00
# con .noche/REPORTE_MAÑANA.md listo. Todo en una rama noche/<fecha>, contra
# EMULADORES de Firebase. Sin deploy, sin main, sin producción.
#
# Uso:  caffeinate -i ./noche.sh          (Mac, evita que se suspenda)
#       nohup ./noche.sh > .noche/reportes/nohup.log 2>&1 &
set -uo pipefail

# El repo es donde vive este script: funciona igual en el checkout principal
# que en un worktree. OJO: audita la rama que esté ahí — si el trabajo del día
# está en otra, mergéala o corre el script desde su worktree.
REPO="$(cd "$(dirname "$0")" && pwd)"
DEADLINE="06:00"
RAMA="noche/$(date +%Y-%m-%d)"
PUERTO=3100          # el 3000 puede ser la sesión diurna de Mau: no se toca
LOG="$REPO/.noche/reportes/run_$(date +%Y%m%d_%H%M).log"

cd "$REPO"
mkdir -p .noche/reportes .noche/screenshots

# ─── Guardas duras antes de arrancar ─────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Hay cambios sin commitear. Commitea o guárdalos antes de dormir." | tee -a "$LOG"
  exit 1
fi
if [[ "$(git branch --show-current)" != "$RAMA" ]]; then
  git checkout -b "$RAMA" || { echo "No pude crear $RAMA. Abortando." | tee -a "$LOG"; exit 1; }
fi

# ─── Servicios de fondo ──────────────────────────────────────────────────────
firebase emulators:start --only auth,firestore,storage \
  > .noche/reportes/emu.log 2>&1 &
EMU=$!

# LA guarda que separa esta corrida de producción: el dev server nace con los
# emuladores conectados. Sin esta variable, la app le pega a la base real.
VITE_USAR_EMULADORES=1 npx vite --port "$PUERTO" --strictPort \
  > .noche/reportes/dev.log 2>&1 &
DEV=$!

cleanup() { kill $EMU $DEV 2>/dev/null; }
trap cleanup EXIT

# Espera activa: los emuladores tardan (la primera vez descargan sus jars).
esperar() { # esperar <url> <segundos> <nombre>
  local i=0
  until curl -s -o /dev/null --max-time 2 "$1"; do
    sleep 2; i=$((i+2))
    [[ $i -ge $2 ]] && { echo "✗ $3 no respondió en $2 s. ABORTO." | tee -a "$LOG"; exit 1; }
  done
  echo "✓ $3 arriba" | tee -a "$LOG"
}
esperar "http://127.0.0.1:8080"          120 "emulador Firestore"
esperar "http://127.0.0.1:9099"          60  "emulador Auth"
esperar "http://localhost:$PUERTO"       60  "dev server :$PUERTO"

# Cuentas de prueba de los cinco roles (idempotente).
./scripts/sembrarEmuladores.sh | tee -a "$LOG"

# ─── Deadline (portable Mac/Linux) ───────────────────────────────────────────
FIN=$(python3 - "$DEADLINE" <<'PY'
import sys, datetime as d
h, m = map(int, sys.argv[1].split(':'))
ahora = d.datetime.now()
fin = ahora.replace(hour=h, minute=m, second=0, microsecond=0)
if fin <= ahora: fin += d.timedelta(days=1)
print(int(fin.timestamp()))
PY
)
restante() { echo $(( FIN - $(date +%s) )); }

corre() {  # corre <comando-slash> <minutos-de-timeout>
  local cmd="$1" mins="$2"
  echo "=== $(date +%H:%M) → $cmd ===" | tee -a "$LOG"
  timeout "${mins}m" claude -p "$cmd" \
    --dangerously-skip-permissions \
    --allowedTools "Read,Write,Edit,Bash,Glob,Grep" \
    >> "$LOG" 2>&1
  echo "   salida: $? · restante: $(( $(restante) / 60 )) min" | tee -a "$LOG"
}

# ─── FASE 1: inventario (una vez) ────────────────────────────────────────────
corre "/auditar" 60

# ─── FASE 2: lotes hasta 40 min antes del deadline ───────────────────────────
LOTE=1
while [[ $(restante) -gt 2400 ]]; do
  echo "--- LOTE $LOTE · faltan $(( $(restante) / 60 )) min ---" | tee -a "$LOG"
  corre "/lote" 45
  (( LOTE % 3 == 0 )) && corre "/pulir" 45

  # Circuit breakers: build roto o suite rota = fuera lo no commiteado.
  if ! npm run build > /dev/null 2>&1 || ! npx vitest run > /dev/null 2>&1; then
    echo "!! BUILD O TESTS ROTOS en lote $LOTE — limpiando lo sin commitear" | tee -a "$LOG"
    git checkout -- . 2>/dev/null
    git clean -fd src/ 2>/dev/null
  fi

  LOTE=$(( LOTE + 1 ))
  sleep 10
done

# ─── FASE 3: cierre ──────────────────────────────────────────────────────────
corre "/cierre" 25

echo "=== FIN $(date +%H:%M) · $((LOTE-1)) lotes ===" | tee -a "$LOG"
cat .noche/REPORTE_MAÑANA.md 2>/dev/null
