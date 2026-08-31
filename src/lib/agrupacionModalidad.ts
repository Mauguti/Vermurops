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

/**
 * Agrupadores de la ficha.
 *
 * Las cuatro que nombró el cliente son de TRANSPORTE más el despacho aduanal.
 * «Cargos locales» es la quinta y existe porque un seguro de mercancía o unas
 * maniobras no son despacho aduanal: meterlos ahí sería forzarlos donde no van.
 */
export type ModalidadFicha = 'maritimo' | 'aereo' | 'terrestre' | 'aduanal' | 'locales';

export const MODALIDADES_FICHA: { id: ModalidadFicha; label: string }[] = [
  { id: 'maritimo',  label: 'Marítimo' },
  { id: 'aereo',     label: 'Aéreo' },
  { id: 'terrestre', label: 'Terrestre' },
  { id: 'aduanal',   label: 'Despacho aduanal' },
  { id: 'locales',   label: 'Cargos locales' },
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
  return modalidadDeServicioTipo(linea.servicioTipo, catalogo);
}

/** Modalidad de ficha a partir del `tipo` de un servicio. */
export function modalidadDeServicioTipo(tipo: string, catalogo: Servicio[]): ModalidadFicha {
  const transporte = modalidadDeServicio(tipo, catalogo);
  if (transporte) return transporte;

  const t = tipo.trim().toLowerCase();
  if (t.includes('aduan')) return 'aduanal';

  const delCatalogo = catalogo.find(s => s.id === tipo)
    ?? catalogo.find(s => s.nombre.trim().toLowerCase() === t);
  if (delCatalogo?.categoria === 'aduana') return 'aduanal';

  // Maniobras, seguro, almacenaje y demás cargos de la operación tienen su
  // propia tarjeta. Un seguro de mercancía no es despacho aduanal.
  return 'locales';
}

/**
 * Arma una tarjeta por modalidad presente.
 *
 * «Presente» son dos cosas, y omitir la segunda era un bug: las modalidades que
 * ya tienen líneas, Y las de los servicios que se eligieron al crear la
 * cotización aunque todavía no tengan ningún concepto.
 *
 * Sin eso, una cotización recién creada —que nace con servicios y
 * `conceptos: []`— no mostraba ninguna tarjeta, y la única forma de agregar
 * conceptos era abrir el detalle plegado con la interfaz anterior.
 *
 * Lo que sigue sin mostrarse son las modalidades que nadie eligió: una
 * cotización marítima no enseña una tarjeta aérea vacía.
 */
export function agruparPorModalidad(
  lineas: LineaPlana[],
  catalogo: Servicio[],
  serviciosDeLaCotizacion: { id: string; tipo: string }[] = [],
): TarjetaModalidad[] {
  const porModalidad = new Map<ModalidadFicha, LineaPlana[]>();

  // Primero las modalidades de los servicios elegidos, aunque vayan vacías.
  serviciosDeLaCotizacion.forEach(srv => {
    const m = modalidadDeServicioTipo(srv.tipo, catalogo);
    if (!porModalidad.has(m)) porModalidad.set(m, []);
  });

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
