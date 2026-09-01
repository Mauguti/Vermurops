FASE DE CIERRE. Es hora de terminar, sin importar en qué ibas.

1. Cambios sin commitear: los que cumplan los 6 criterios se commitean; el
   resto se revierte con `git checkout -- .`. Nada a medias en la rama.
2. Corre Playwright completo, `npm run build`, `npx vitest run` y
   `npx tsx scripts/auditarSumasDeDinero.ts`. Registra los cuatro resultados.
3. Reescribe .noche/REPORTE_MAÑANA.md con esta estructura exacta:

   # Reporte de la noche — <fecha>
   ## 1. Resumen en 5 líneas
   ## 2. Arreglado (commit hash + una línea cada uno)
   ## 3. Antes / Después (screenshots de lo más visible)
   ## 4. NO arreglado y por qué (bloqueos, fallidos, prohibidos)
   ## 5. Decisiones que necesito de Mau (numeradas, con opciones y recomendación)
   ## 6. Deuda técnica que encontré (vista, no tocada)
   ## 7. Estado de la rama: commits, build, tests verdes/rojos
   ## 8. Cómo revisar esto en 15 minutos

4. `git log --oneline` de la rama al final del reporte.
5. NO merge, NO push, NO deploy. Termina ahí.
