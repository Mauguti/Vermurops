/**
 * agrupacionModalidad.ts
 *
 * Agrupa las líneas de la cotización por MODALIDAD, para la vista de tarjetas.
 *
 * ── Por qué se rehízo la estructura ────────────────────────────────────────
 * Sesión 30-ago-2026. Luis: «no me queda claro por qué estamos segmentando los
 * servicios y tampoco por qué esos segmentos». Mauricio: «fue un error de mi
 * parte la categorización».
 *
 * La capa de «Servicios» con categorías inventadas (Flete Internacional,
 * Maniobras, Almacenaje Nacional, Recolección, Asesoría Aduanal) desaparece.
 * La estructura correcta tiene tres niveles y ninguno es inventado:
 *
 *     MODALIDAD (marítimo · aéreo · terrestre · despacho aduanal)
 *       └── CONCEPTO (del catálogo de 105)
 *             └── SUBCONCEPTO (opcional)
 *
 * Los subconceptos existen porque un proveedor cotiza paquetes: un almacén
 * cobra IN, OUT, pick & pack, etiquetado y desechos, y cada uno se factura por
 * separado.
 */

import { LineaPlana } from './lineasCotizacion';
import { Servicio } from '../config/serviciosStore';
import { modalidadDeServicio } from './traficoServicio';

/** Las cuatro modalidades de la ficha. «Aduanal» no es transporte pero sí agrupa. */
export type ModalidadFicha = 'maritimo' | 'aereo' | 'terrestre' | 'aduanal';

export const MODALIDADES_FICHA: { id: ModalidadFicha; label: string }[] = [
  { id: 'maritimo',  label: 'Marítimo' },
  { id: 'aereo',     label: 'Aéreo' },
  { id: 'terrestre', label: 'Terrestre' },
  { id: 'aduanal',   label: 'Despacho aduanal' },
];

export interface TarjetaModalidad {
  modalidad: ModalidadFicha;
  label: string;
  lineas: LineaPlana[];
  costoTotal: number;
  profitTotal: number;
  ventaTotal: number;
  /** profit / venta de esta modalidad. 0 si no hay venta. */
  margen: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Modalidad para efectos de la FICHA, que incluye 'aduanal'.
 *
 * `modalidadDeServicio` solo devuelve modalidades de transporte porque de eso
 * dependen los folios de embarque. Aquí el despacho aduanal sí es una tarjeta
 * propia: es como el cliente lee su cotización.
 */
export function modalidadDeLinea(linea: LineaPlana, catalogo: Servicio[]): ModalidadFicha {
  const transporte = modalidadDeServicio(linea.servicioTipo, catalogo);
  if (transporte) return transporte;

  const t = linea.servicioTipo.trim().toLowerCase();
  if (t.includes('aduan')) return 'aduanal';

  const porNombre = catalogo.find(s => s.id === linea.servicioTipo);
  if (porNombre?.categoria === 'aduana') return 'aduanal';

  // Todo lo que no es transporte ni aduana —maniobras, seguro, almacenaje—
  // cuelga del despacho aduanal, que es donde el cliente espera ver los
  // cargos locales de la operación.
  return 'aduanal';
}

/**
 * Arma una tarjeta por modalidad presente.
 *
 * Las modalidades sin líneas NO se muestran: una cotización marítima no tiene
 * por qué enseñar una tarjeta aérea vacía.
 */
export function agruparPorModalidad(
  lineas: LineaPlana[],
  catalogo: Servicio[],
): TarjetaModalidad[] {
  const porModalidad = new Map<ModalidadFicha, LineaPlana[]>();

  lineas.forEach(l => {
    const m = modalidadDeLinea(l, catalogo);
    porModalidad.set(m, [...(porModalidad.get(m) ?? []), l]);
  });

  return MODALIDADES_FICHA
    .filter(m => porModalidad.has(m.id))
    .map(m => {
      const ls = (porModalidad.get(m.id) ?? []).sort((a, b) => a.orden - b.orden);
      const costoTotal = redondear(ls.reduce((a, l) => a + l.costo, 0));
      const profitTotal = redondear(ls.reduce((a, l) => a + l.profit, 0));
      const ventaTotal = redondear(costoTotal + profitTotal);
      return {
        modalidad: m.id,
        label: m.label,
        lineas: ls,
        costoTotal,
        profitTotal,
        ventaTotal,
        margen: ventaTotal === 0 ? 0 : profitTotal / ventaTotal,
      };
    });
}
