#!/usr/bin/env bash
#
# Tests de las reglas de Firestore y Storage contra emuladores efímeros.
# Levanta y apaga los emuladores solo; no toca los que estén corriendo para
# el recorrido, porque usa puertos propios.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
# Puertos propios (8085 / 9195) para no chocar con los emuladores del
# recorrido, que corren en 8080 / 9199 y suelen quedarse arriba.
npx firebase emulators:exec --only firestore,storage \
  --config firebase.reglas.json --project vermur-reglas-test \
  'npx vitest run tests/reglas --config vitest.reglas.config.ts'
