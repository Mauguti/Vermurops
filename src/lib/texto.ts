/**
 * texto.ts
 *
 * Operaciones de texto que NO truenan con un campo ausente.
 *
 * ── Por qué existe (Bloque 4, 25-sep-2026) ─────────────────────────────────
 * Los datos de Magaya traen campos opcionales vacíos —817 de 817 clientes y
 * 544 de 544 proveedores sin `rfc`— y el código asumía que existían. Un
 * `undefined.toLowerCase()` dentro de un render tira la app entera a
 * pantalla en blanco; dentro del `sort` de un hook que carga el catálogo,
 * la tira al arrancar. El buscador de «Vincular cliente» fue el primero
 * (bloque 3); esta es la familia completa.
 *
 * Regla: sobre un campo que puede faltar, nunca `.toLowerCase()`,
 * `.localeCompare()`, `.trim()`, `.split()`, `.includes()` ni
 * `.startsWith()` a pelo. Se pasa por aquí.
 */

/** El valor como string; ausente o nulo → ''. Números y booleanos también. */
export function texto(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

/** Minúsculas, sin acentos, sin espacios en los extremos. Para comparar y buscar. */
export function normalizarTexto(v: unknown): string {
  return texto(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** ¿`v` contiene `consulta`? Sin importar mayúsculas ni acentos. Consulta vacía → true. */
export function contiene(v: unknown, consulta: unknown): boolean {
  const q = normalizarTexto(consulta);
  if (!q) return true;
  return normalizarTexto(v).includes(q);
}

/** Comparador para `sort` alfabético en español que tolera ausentes (van al final). */
export function compararTexto(a: unknown, b: unknown): number {
  const ta = texto(a);
  const tb = texto(b);
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta.localeCompare(tb, 'es');
}

/** Lo que va antes de la primera coma: «Shanghai, CHN» → «Shanghai». Ausente → ''. */
export function antesDeLaComa(v: unknown): string {
  return texto(v).split(',')[0].trim();
}
