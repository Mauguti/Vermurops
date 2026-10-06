#!/usr/bin/env bash
#
# La suite e2e COMPLETA contra emuladores: el recorrido del jueves (lo que
# corre `e2e.sh`) y, después, todos los demás specs de tests/e2e: barridos 45
# y 47, los de cada tarea y los de capturas. Hasta la tarea 84 esos no corrían
# en ningún script y solo se enteraba uno cuando alguien los lanzaba a mano.
#
# Mismo arranque limpio que e2e.sh (apaga, levanta, siembra, calienta).
# Tarda bastante más que el recorrido solo: mide el tiempo y lo imprime.
#
# Uso:  ./scripts/e2e-completo.sh
#       KEEP=1 ./scripts/e2e-completo.sh   (deja emuladores arriba)
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

# Todo spec salvo el recorrido (va primero) y el calentamiento (ya corrió).
# Tampoco entran los que necesitan el emulador de FUNCTIONS (:5001), que este
# script no levanta: gestion-usuarios y capturas-21 (`CON_FUNCTIONS=1
# ./scripts/dev-emuladores.sh`, y se lanzan a mano). Con el emulador apagado
# fallaban con ECONNREFUSED y dejaban la suite en rojo por una causa que no es
# del código (tarea 90).
ESPECS_DESPUES="$(ls tests/e2e/*.spec.ts | grep -v -e '/recorrido-jueves\.spec\.ts$' -e '/calentar\.spec\.ts$' -e '/gestion-usuarios\.spec\.ts$' -e '/capturas-21\.spec\.ts$' | tr '\n' ' ')"
export ESPECS_DESPUES

inicio=$(date +%s)
./scripts/e2e.sh "$@"
rc=$?
fin=$(date +%s)
echo "· suite completa: $(( (fin - inicio) / 60 )) min $(( (fin - inicio) % 60 )) s · código de salida $rc"
exit $rc
