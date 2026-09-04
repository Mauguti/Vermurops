/**
 * idUnico.ts
 *
 * Ids que no colisionan aunque se acuñen en el mismo milisegundo.
 *
 * ── El bug que motivó esto (4-sep-2026) ────────────────────────────────────
 * `agregarLinea` acuñaba `con-<servicio>-${Date.now()}`. Dos líneas creadas
 * en el mismo ms nacían con el MISMO id, y desde ahí eran gemelas
 * inseparables: editar el profit de una editaba el de todas, porque toda la
 * edición por línea resuelve contra ese id. El síntoma que reportó Ventas —
 * «el profit se propaga a todos los conceptos»— rompe la estrategia central
 * del negocio: cargar el profit al flete y dejar otro concepto con pérdida.
 *
 * Un timestamp NO es un id. Este helper le suma un contador monotónico (que
 * separa las acuñaciones del mismo ms en esta sesión) y un sufijo aleatorio
 * (que separa sesiones distintas editando la misma cotización).
 */

let contador = 0;

export function idUnico(prefijo: string): string {
  contador += 1;
  const azar = Math.random().toString(36).slice(2, 6);
  return `${prefijo}-${Date.now()}-${contador}-${azar}`;
}
