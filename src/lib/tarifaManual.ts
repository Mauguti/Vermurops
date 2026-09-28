/**
 * tarifaManual.ts
 *
 * Darle proveedor y moneda a un costo tecleado a mano.
 *
 * ── El callejón que cierra ─────────────────────────────────────────────────
 * `proveedorNombre` de una línea sale ÚNICAMENTE de las tarifas elegidas. Un
 * costo tecleado sin tarifa nacía sin proveedor y sin forma de ponerle uno, y
 * el freno de prontitud —«hay costo, hace falta proveedor»— le pedía un dato
 * que la pantalla no dejaba capturar. Le pasó a Operaciones con «Inland
 * Freight Coordination» de COT-2026-0034.
 *
 * ── Por qué una tarifa y no un campo nuevo ─────────────────────────────────
 * El componente de costo `'manual'` NO existe en el documento: lo sintetiza
 * `lineaDesdeConcepto` al vuelo. No hay dónde escribirle un proveedor sin
 * inventar un campo. En cambio `concepto.tarifas[]` ya es el lugar donde vive
 * «este proveedor cobra esto por este concepto», y usarlo deja el costo con
 * una procedencia declarada en vez de un número huérfano.
 *
 * Consecuencia aceptada: la línea pasa a ser DERIVADA y su costo se bloquea.
 * Es coherente —ahora viene de algo— y el candado lo dice y lleva a editarlo.
 *
 * ── Tres condiciones que la gobiernan ──────────────────────────────────────
 *   1. Vive SOLO en la cotización. No se escribe en el tarifario general del
 *      proveedor: es un precio de esta operación, no una tarifa publicada.
 *   2. La moneda se ELIGE. Nada de caer a 'USD', que es justo como un costo
 *      en pesos terminaba rotulado en dólares.
 *   3. Se marca oficial escribiendo `proveedoresOficialIds` Y `seleccionada`
 *      en la misma operación. Son los dos campos que deciden «cuál está
 *      elegida», y actualizar uno solo es lo que produjo «comparativa 60,
 *      tabla 20».
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { KanbanQuote, CotizacionProveedor } from '../components/quotes/QuotesData';

export interface DatosTarifaManual {
  proveedorId: string | null;
  proveedorNombre: string;
  monto: number;
  /** Se elige. No hay valor por omisión a propósito. */
  moneda: 'MXN' | 'USD';
  contacto?: string;
}

/** Lo que hace inválida una captura, en palabras. `null` = adelante. */
export function razonInvalida(d: Partial<DatosTarifaManual>): string | null {
  if (!d.proveedorNombre?.trim()) return 'Elige el proveedor al que se le paga.';
  if (!d.moneda) return 'Elige la moneda: no se asume ninguna.';
  if (!Number.isFinite(d.monto) || (d.monto ?? 0) <= 0) {
    return 'El costo tiene que ser mayor que cero.';
  }
  return null;
}

/**
 * Crea la tarifa dentro del concepto y la deja elegida.
 *
 * Devuelve la cotización nueva; no muta la que recibe. Si el servicio o el
 * concepto no existen, la devuelve intacta en vez de reventar: la tabla puede
 * ir un render por detrás de los datos.
 */
export function capturarTarifaManual(
  quote: KanbanQuote,
  servicioId: string,
  conceptoLocalId: string,
  datos: DatosTarifaManual,
  idNuevo = `tm-${Date.now()}`,
): KanbanQuote {
  if (razonInvalida(datos)) return quote;

  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv => {
      if (srv.id !== servicioId) return srv;
      return {
        ...srv,
        conceptos: (srv.conceptos ?? []).map(c => {
          if (c.id !== conceptoLocalId) return c;

          const nueva: CotizacionProveedor = {
            id: idNuevo,
            proveedor: datos.proveedorNombre.trim(),
            contacto: datos.contacto ?? '',
            monto: datos.monto,
            moneda: datos.moneda,
            seleccionada: true,
            proveedorId: datos.proveedorId ?? null,
            conceptoId: c.conceptoId ?? null,
            /*
             * Sin tarifa de origen: no vino del tarifario, se capturó aquí.
             * Es lo que distingue «este precio lo negociamos para esta
             * operación» de «esta es la tarifa publicada del proveedor».
             */
            tarifaOrigenId: null,
            capturadaEnCotizacion: true,
            /*
             * La modalidad del servicio que la contiene. No hace falta para
             * encontrarla —vive dentro del concepto— pero sí para que el
             * filtro por modalidad nunca la confunda con una de otra.
             */
            modalidad: srv.tipo,
          };

          return {
            ...c,
            // Las dos marcas de «elegida», en la misma operación.
            proveedoresOficialIds: [nueva.id],
            tarifas: [
              ...(c.tarifas ?? []).map(t => ({ ...t, seleccionada: false })),
              nueva,
            ],
          };
        }),
      };
    }),
  };
}

/** ¿El costo de este concepto viene de una tarifa capturada en la cotización? */
export function tarifaCapturadaAqui(
  tarifas: readonly CotizacionProveedor[] | undefined,
  oficialesIds: readonly string[],
): CotizacionProveedor | null {
  if (oficialesIds.length !== 1) return null;
  const t = (tarifas ?? []).find(x => x.id === oficialesIds[0]);
  return t?.capturadaEnCotizacion ? t : null;
}

export const TEXTO_CANDADO_MANUAL =
  'Viene de la tarifa que capturaste aquí. Ábrela para cambiar el costo, el proveedor o la moneda.';
