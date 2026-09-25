/**
 * pedimentosEmbarque.ts
 *
 * Los números de pedimento del embarque, que son VARIOS.
 *
 * ── Por qué más de uno ─────────────────────────────────────────────────────
 * El modelo heredado de Magaya guardaba `aduana.pedimento`, en singular. En la
 * junta pidieron «al menos dos»: un embarque puede despacharse en partes —una
 * rectificación, un complementario, o dos pedimentos por dos contenedores del
 * mismo BL— y cada uno tiene su número.
 *
 * ── El respaldo del campo viejo ────────────────────────────────────────────
 * `aduana.pedimentos` es el arreglo nuevo. Cuando no existe, el singular se
 * LEE como primer elemento. Nada se reescribe y no hay migración: un embarque
 * que nadie ha abierto desde este bloque sigue teniendo solo el campo viejo, y
 * se ve igual de bien.
 *
 * Al guardar se escriben LOS DOS: el arreglo con todo y el singular con el
 * primero. El singular todavía lo leen la plantilla del pedimento y los datos
 * de ejemplo, y dejarlo desactualizado sería peor que duplicarlo.
 *
 * Lógica pura: sin React ni Firestore.
 */

export interface AduanaEmbarque {
  aes?: boolean;
  /** Campo heredado de Magaya. Se sigue leyendo y escribiendo. */
  pedimento?: string;
  /** Todos los pedimentos del embarque, en orden de captura. */
  pedimentos?: string[];
}

const limpio = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Los pedimentos que tiene el embarque, sin vacíos.
 *
 * Arreglo vacío = no tiene ninguno. Nunca devuelve `['']`, que en pantalla se
 * ve como «tiene uno» y al cotejar contra aduana no encuentra nada.
 */
export function pedimentosDe(aduana: AduanaEmbarque | undefined | null): string[] {
  if (!aduana) return [];
  if (Array.isArray(aduana.pedimentos)) {
    return aduana.pedimentos.map(limpio).filter(Boolean);
  }
  const uno = limpio(aduana.pedimento);
  return uno ? [uno] : [];
}

/**
 * Lo que se pinta en el formulario: siempre al menos dos renglones, como
 * pidieron, aunque estén vacíos. Un formulario con un solo campo no comunica
 * que se puede capturar otro.
 */
export function renglonesPedimento(
  aduana: AduanaEmbarque | undefined | null,
  minimo = 2,
): string[] {
  const p = pedimentosDe(aduana);
  while (p.length < minimo) p.push('');
  return p;
}

/**
 * Guarda la lista. Devuelve la aduana nueva; no muta la que recibe.
 *
 * Escribe el arreglo Y el singular, para que lo que todavía lee el campo viejo
 * no se quede con un número que ya no es el primero.
 */
export function guardarPedimentos<T extends AduanaEmbarque>(
  aduana: T | undefined | null,
  valores: string[],
): T & { pedimento: string; pedimentos: string[] } {
  const limpios = valores.map(limpio).filter(Boolean);
  return {
    ...((aduana ?? {}) as T),
    pedimentos: limpios,
    pedimento: limpios[0] ?? '',
  };
}

/**
 * ¿Esta pantalla enseña los campos que solo aplican a exportación?
 *
 * «Límite de documentación» y «Orden General de Aduana» son de expo. En
 * importación confunden, y si aparecen en un booking confirmation el cliente
 * pregunta. Un tráfico que no se pudo determinar NO los enseña: es el caso
 * dudoso, y de los dos errores posibles, esconder un campo que hacía falta se
 * nota al capturar; enseñar uno de más se cuela al cliente.
 */
export function aplicaSoloExportacion(trafico: 'impo' | 'expo' | null | undefined): boolean {
  return trafico === 'expo';
}
