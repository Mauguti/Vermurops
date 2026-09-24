#!/usr/bin/env bash
#
# Genera las reglas que usan los EMULADORES a partir de las de producción.
#
# ── Por qué (Bloque 9, 25-sep-2026) ─────────────────────────────────────────
# Desde el parche de seguridad, las reglas solo dejan entrar a los correos del
# equipo. El recorrido e2e corre con cinco cuentas de prueba
# (ventas@vermur.com y compañía) que NO deben estar en las reglas de
# producción: es exactamente el error que tuvimos en el mapa de roles de las
# Functions, donde una cuenta de prueba valía en producción.
#
# La alternativa —mantener dos archivos de reglas a mano— los deja divergir en
# silencio, que es peor: el recorrido pasaría con unas reglas y producción
# correría con otras. Aquí hay UNA fuente de verdad, `firestore.rules` y
# `storage.rules`, y esto deriva la versión del emulador inyectando las
# cuentas de prueba entre los marcadores EQUIPO:INICIO / EQUIPO:FIN.
#
# Los archivos generados están en .gitignore: no se editan ni se despliegan.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

CUENTAS_PRUEBA="          'admin@vermur.com',\n          'pricing@vermur.com',\n          'ventas@vermur.com',\n          'operaciones@vermur.com',\n          'administracion@vermur.com',"

for archivo in firestore storage; do
  origen="$archivo.rules"
  destino="$archivo.emulador.rules"
  grep -q "EQUIPO:INICIO" "$origen" || { echo "✗ $origen no tiene el marcador EQUIPO:INICIO"; exit 1; }
  awk -v cuentas="$CUENTAS_PRUEBA" '
    /EQUIPO:INICIO/ { print; print "          // ── solo emulador, generado por scripts/reglasEmulador.sh ──"; printf "%s\n", cuentas; next }
    { print }
  ' "$origen" > "$destino"
  grep -q "ventas@vermur.com" "$destino" || { echo "✗ no se inyectaron las cuentas en $destino"; exit 1; }
done
echo "✓ reglas del emulador generadas desde las de producción"
