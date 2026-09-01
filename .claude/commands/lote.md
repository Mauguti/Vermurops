Lee .noche/NIGHT_RUN.md, .noche/AUDITORIA_UI.json y .noche/PROGRESO.md.
Ejecuta la VERIFICACIÓN OBLIGATORIA del contrato antes de abrir el navegador.

FASE DE ARREGLO. UN LOTE de máximo 4 items y te detienes.

1. Toma los 4 pendientes de mayor severidad SIN prohibido: true y que no hayan
   fallado ya 2 veces (checa PROGRESO.md).
2. Por cada item, en orden estricto:
   a. Screenshot ANTES.
   b. Primero el test de Playwright que reproduce el problema y FALLA.
   c. Arregla el código.
   d. Corre el test hasta que pase.
   e. `npm run build` y `npx vitest run`.
   f. Screenshot DESPUÉS.
   g. Si los 6 criterios de "listo" se cumplen: commit atómico.
      Si no: `git checkout -- <archivos>` y márcalo como intento fallido.
3. Actualiza el item en AUDITORIA_UI.json.
4. Append a PROGRESO.md: lote, items, resultado, tiempo.
5. Reescribe REPORTE_MAÑANA.md completo.
6. Termina. No empieces otro lote — el script te vuelve a llamar.
