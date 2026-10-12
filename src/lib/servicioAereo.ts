/**
 * servicioAereo.ts (tarea 98, 9-oct-2026)
 *
 * Aéreo expeditado o aéreo regular: el equivalente aéreo de FCL/LCL. Cambia
 * el precio, el tiempo de tránsito y la tarifa que aplica, así que viaja de
 * la solicitud al embarque y a la tarifa.
 *
 * ── Lo viejo no se asume ───────────────────────────────────────────────────
 * El campo es opcional. Un documento sin valor es «Sin indicar»: no es
 * regular ni expeditado, y nada lo reescribe hasta que alguien elige.
 *
 * Sin React, sin Firestore, sin red.
 */

export type ServicioAereo = 'expeditado' | 'regular';

export const SERVICIOS_AEREO: readonly ServicioAereo[] = ['expeditado', 'regular'];

export const ETIQUETA_SERVICIO_AEREO: Record<ServicioAereo, string> = {
  expeditado: 'Expeditado',
  regular: 'Regular',
};

export const ETIQUETA_SIN_INDICAR = 'Sin indicar';

/** Lee un valor que viene de Firestore: lo que no es uno de los dos es null. */
export function leerServicioAereo(valor: unknown): ServicioAereo | null {
  return valor === 'expeditado' || valor === 'regular' ? valor : null;
}

export function etiquetaServicioAereo(valor: unknown): string {
  const s = leerServicioAereo(valor);
  return s ? ETIQUETA_SERVICIO_AEREO[s] : ETIQUETA_SIN_INDICAR;
}

/**
 * La carga con el servicio puesto o quitado. Quitarlo BORRA la clave: Firestore
 * rechaza `undefined` y tumba la escritura entera.
 */
export function conServicioAereo<T extends { servicioAereo?: ServicioAereo }>(
  carga: T,
  valor: ServicioAereo | null,
): T {
  if (valor) return { ...carga, servicioAereo: valor };
  const { servicioAereo: _quitado, ...resto } = carga;
  return resto as T;
}

// ─── Del embarque ────────────────────────────────────────────────────────────

/** El servicio de cada producto del embarque, sin repetir y sin los vacíos. */
export function serviciosDeProductos(
  productos: readonly { servicioAereo?: ServicioAereo }[] | undefined,
): ServicioAereo[] {
  const vistos = new Set<ServicioAereo>();
  for (const p of productos ?? []) {
    const s = leerServicioAereo(p.servicioAereo);
    if (s) vistos.add(s);
  }
  return SERVICIOS_AEREO.filter(s => vistos.has(s));
}

/**
 * Para la lista y la ficha: «Expeditado», «Regular», «Expeditado + Regular»
 * si los productos no coinciden, o «Sin indicar». null cuando el embarque no
 * es aéreo: ahí la pregunta no existe.
 */
export function etiquetaServicioDeEmbarque(embarque: {
  modalidad: string;
  productos?: readonly { servicioAereo?: ServicioAereo }[];
}): string | null {
  if (embarque.modalidad !== 'aereo') return null;
  const servicios = serviciosDeProductos(embarque.productos);
  return servicios.length ? servicios.map(s => ETIQUETA_SERVICIO_AEREO[s]).join(' + ') : ETIQUETA_SIN_INDICAR;
}

// ─── De la tarifa ────────────────────────────────────────────────────────────

export interface TarifasPorServicio<T> {
  tarifas: T[];
  /** Texto para mostrar cuando lo propuesto no es exactamente lo pedido. */
  aviso: string | null;
}

/**
 * Qué tarifas se proponen para una cotización aérea de cierto servicio.
 *
 *  1. Las del MISMO tipo.
 *  2. Si no hay, las «sin indicar», con aviso: pueden servir, pero nadie dijo
 *     para qué servicio son.
 *  3. Las del otro tipo no se proponen nunca: una tarifa regular ofrecida a
 *     una carga expeditada se aplica sin que nadie note que no era.
 *
 * Sin servicio pedido (la cotización no lo indica) o si ninguna tarifa del
 * concepto distingue servicio (un despacho, un seguro), no hay nada que
 * filtrar y no se avisa: un aviso en todo concepto dejaría de leerse.
 */
export function tarifasPorServicioAereo<T extends { servicioAereo?: ServicioAereo | null }>(
  tarifas: readonly T[],
  pedido: ServicioAereo | null | undefined,
): TarifasPorServicio<T> {
  const querido = leerServicioAereo(pedido);
  if (!querido) return { tarifas: [...tarifas], aviso: null };
  if (!tarifas.some(t => leerServicioAereo(t.servicioAereo))) return { tarifas: [...tarifas], aviso: null };

  const mismoTipo = tarifas.filter(t => leerServicioAereo(t.servicioAereo) === querido);
  if (mismoTipo.length > 0) return { tarifas: mismoTipo, aviso: null };

  const etiqueta = ETIQUETA_SERVICIO_AEREO[querido].toLowerCase();
  const sinIndicar = tarifas.filter(t => !leerServicioAereo(t.servicioAereo));
  if (sinIndicar.length > 0) {
    return {
      tarifas: sinIndicar,
      aviso: `No hay tarifas de servicio ${etiqueta}: se muestran las que no indican servicio. Confirma con el proveedor.`,
    };
  }
  return {
    tarifas: [],
    aviso: `No hay tarifas de servicio ${etiqueta} para este concepto (solo hay del otro tipo).`,
  };
}
