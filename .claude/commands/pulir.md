Lee .noche/NIGHT_RUN.md. Ejecuta la VERIFICACIÓN OBLIGATORIA antes de abrir
el navegador.

FASE DE UI/UX GENERAL. Un solo tema por invocación, el siguiente pendiente de
esta lista (lleva el conteo en PROGRESO.md):

1. Botones: variantes consistentes (primario #E11D48, secundario, ghost,
   peligro), estados hover/focus/active/disabled/loading en todos.
2. Estados de carga: skeletons en tablas y fichas, no spinners genéricos.
3. Estados vacíos: TODO con ui/EstadoVacio, distinguiendo «no hay» de «el
   filtro no encontró». Ya está en varias listas; complétalo.
4. Errores: toasts consistentes (ui/Toast), español claro y accionable, nunca
   el error crudo de Firebase.
5. Formularios: labels arriba, validación en blur, error bajo el campo,
   submit deshabilitado mientras guarda, sin doble submit.
6. Tablas: header sticky, números a la derecha, densidad consistente,
   acciones al final. Referencia: SpreadsheetTable.
7. Modales: mismo ancho por tipo, cancelar izquierda / primario derecha,
   cierre con ESC y clic fuera, limpieza de estado al cerrar.
8. Jerarquía tipográfica: escala definida, máximo 3 pesos.
9. Accesibilidad AA: contraste, foco visible, aria en iconos sin texto,
   teclado completo.
10. Responsive 1280 / 1440 / 1920: nada desbordado ni encimado.

Las fichas usan ui/ficha/FichaLayout: si una pantalla se sale del patrón,
alinéala en vez de inventar otro. Mismos 6 criterios de "listo". Máximo 45 min
por tema; si se alarga, commitea lo completo y anota el resto.
