Lee .noche/NIGHT_RUN.md y CLAUDE.md completos. Ejecuta la VERIFICACIÓN
OBLIGATORIA del contrato antes de abrir el navegador.

FASE DE INVENTARIO. Solo exploras y documentas; no arreglas nada todavía.

1. Recorre el código y lista TODAS las vistas de la app (App.tsx renderContent,
   Sidebar, y las fichas que se abren dentro de cada módulo).
2. Por cada vista, lista los elementos interactivos: botones, links, dropdowns,
   inputs, checkboxes, toggles, modales, tabs, tablas con acciones, filtros,
   uploads, drag-and-drop.
3. Con Playwright (baseURL http://localhost:3100) entra con los CINCO roles.
   Haz clic en todo lo que sea seguro clickear. Screenshot de cada pantalla.
4. Registra cada elemento en .noche/AUDITORIA_UI.json:
   { "id": "modulo.vista.elemento", "ruta": "...", "rol": [...],
     "tipo": "...", "estado": "ok|roto|sin_feedback|feo|inaccesible|no_probado",
     "sintoma": "una línea", "consola": "error textual si hubo",
     "severidad": 1-5, "esfuerzo": "S|M|L", "prohibido": true/false,
     "screenshot": ".noche/screenshots/xxx.png" }
5. Marca prohibido: true en lo que caiga bajo las reglas 5-7 y 11 del contrato.
6. Ordena por severidad descendente, luego esfuerzo ascendente.
7. Resumen en .noche/PROGRESO.md y reescribe .noche/REPORTE_MAÑANA.md.

No modifiques NI UN archivo de src/ en esta fase.
