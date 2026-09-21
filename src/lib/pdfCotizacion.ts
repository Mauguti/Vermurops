/**
 * pdfCotizacion.ts (Bloque 1, sep-2026)
 *
 * Arma lo que el generador de PDF de n8n necesita, a partir de la
 * cotización, y decide cómo se llama y dónde se guarda el archivo.
 *
 * ── Lo que NO va ───────────────────────────────────────────────────────────
 * Las líneas llevan SOLO concepto y venta. Nada de costo, proveedor ni
 * margen: el PDF sale al cliente, y esos datos son de Pricing. Es la misma
 * regla que gobierna lo que ve Ventas.
 *
 * Sin React, sin Firestore, sin red.
 */

import type { KanbanQuote, ServicioSolicitado, CargaSolicitada } from '../components/quotes/QuotesData';
import { aplanarCotizacion, type LineaPlana } from './lineasCotizacion';
import { cargaDesdeLegacy, modalidadDeCarga, ETIQUETA_MODALIDAD, ETIQUETA_CONTENEDOR, ETIQUETA_UNIDAD_TERRESTRE } from './cargaSolicitud';
import { numeroVersionActual } from './versionesCotizacion';

export type IdiomaPdf = 'es' | 'en';

/** El contrato del webhook generar-pdf-cotizacion. */
export interface PayloadPdf {
  folio: string;
  fecha: string;
  vigencia: string;
  idioma: IdiomaPdf;
  cliente: { nombre: string; contacto: string; correo: string };
  modalidad: string;
  ruta: string;
  incoterm: string;
  mercancia: string;
  carga: { tipo: string; contenedores: string; piezas: number; peso: number; volumen: number };
  lineas: { concepto: string; detalle?: string; venta: number; moneda: string }[];
  notas: string;
  contacto: string;
}

export interface OpcionesPdf {
  idioma: IdiomaPdf;
  vigencia: string;
  notas: string;
  /** Quién firma: nombre y correo de quien genera. */
  contacto: string;
  /** YYYY-MM-DD. Inyectable para pruebas. */
  hoy: string;
  /** Cliente del catálogo, si la cotización está vinculada. */
  cliente?: { nombre: string; contactos?: { nombre: string; email?: string | null; principal?: boolean }[] } | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** El bloque de carga del PDF, desde la carga tipada (o su espejo legacy). */
export function cargaParaPdf(servicio: ServicioSolicitado | undefined): PayloadPdf['carga'] {
  const carga: CargaSolicitada | null = servicio ? (servicio.carga ?? cargaDesdeLegacy(servicio)) : null;
  if (!carga) {
    return { tipo: '', contenedores: '', piezas: 0, peso: servicio?.peso ?? 0, volumen: servicio?.volumen ?? 0 };
  }
  switch (carga.tipo) {
    case 'fcl':
      return {
        tipo: 'FCL',
        contenedores: carga.contenedores.filter(c => c.cantidad > 0)
          .map(c => `${c.cantidad}×${ETIQUETA_CONTENEDOR[c.tipoContenedor]}`).join(' + '),
        piezas: 0, peso: carga.pesoBrutoKg, volumen: 0,
      };
    case 'lcl':
      return { tipo: 'LCL', contenedores: '', piezas: carga.piezas, peso: carga.pesoBrutoKg, volumen: carga.volumenM3 };
    case 'aereo':
      return { tipo: 'Aéreo', contenedores: '', piezas: carga.piezas, peso: carga.pesoBrutoKg, volumen: carga.pesoVolumetricoKg };
    case 'terrestre':
      return { tipo: ETIQUETA_UNIDAD_TERRESTRE[carga.tipoUnidad], contenedores: '', piezas: carga.piezas, peso: carga.pesoBrutoKg, volumen: 0 };
    case 'despacho':
      return { tipo: `Despacho ${carga.operacion === 'importacion' ? 'importación' : 'exportación'}`, contenedores: '', piezas: 0, peso: 0, volumen: 0 };
  }
}

/** Solo concepto y venta. La moneda va por línea (§4.3). */
export function lineasParaPdf(lineas: readonly LineaPlana[]): PayloadPdf['lineas'] {
  return [...lineas]
    .sort((a, b) => a.orden - b.orden)
    .filter(l => l.concepto.trim() !== '')
    .map(l => ({ concepto: l.concepto, venta: r2(l.venta), moneda: l.moneda }));
}

/**
 * La vigencia que se propone: la MÁS CORTA de las tarifas elegidas. Una
 * cotización vale lo que valga su tarifa más frágil. Vacío si ninguna la
 * declara: Pricing la escribe.
 */
export function vigenciaSugerida(lineas: readonly LineaPlana[]): string {
  const fechas = lineas.flatMap(l => (l.costos ?? []).map(c => c.vigencia).filter((v): v is string => !!v));
  return fechas.length ? fechas.sort()[0].slice(0, 10) : '';
}

export function armarPayloadPdf(quote: KanbanQuote, o: OpcionesPdf): PayloadPdf {
  const servicio = quote.servicios?.[0];
  const carga = servicio ? (servicio.carga ?? cargaDesdeLegacy(servicio)) : null;
  const contactoPrincipal = o.cliente?.contactos?.find(c => c.principal) ?? o.cliente?.contactos?.[0];

  return {
    folio: `${quote.id} v${numeroVersionActual(quote)}`,
    fecha: o.hoy,
    vigencia: o.vigencia,
    idioma: o.idioma,
    cliente: {
      nombre: o.cliente?.nombre || quote.prospecto?.empresa || '',
      contacto: quote.prospecto?.contacto || contactoPrincipal?.nombre || '',
      correo: quote.prospecto?.email || contactoPrincipal?.email || '',
    },
    modalidad: carga ? ETIQUETA_MODALIDAD[modalidadDeCarga(carga)] : (servicio?.tipo ?? ''),
    ruta: servicio ? `${servicio.ruta?.origen ?? ''} → ${servicio.ruta?.destino ?? ''}` : '',
    incoterm: servicio?.incoterm ?? '',
    mercancia: servicio?.mercancia ?? '',
    carga: cargaParaPdf(servicio),
    lineas: lineasParaPdf(aplanarCotizacion(quote)),
    notas: o.notas,
    contacto: o.contacto,
  };
}

/** «COT-2026-0014 v2.pdf» — y en inglés lo dice, para no confundir las dos. */
export function nombreArchivoPdf(quote: Pick<KanbanQuote, 'id' | 'versionActual'>, idioma: IdiomaPdf): string {
  return `${quote.id} v${numeroVersionActual(quote)}${idioma === 'en' ? ' EN' : ''}.pdf`;
}

/** Un segmento de archivo bajo cotizaciones/{id}/pdf/, como exige la regla. */
export function rutaStoragePdf(quote: Pick<KanbanQuote, 'id' | 'versionActual'>, idioma: IdiomaPdf, ahora: string): string {
  const stamp = ahora.replace(/[-:.TZ]/g, '').slice(0, 14);
  return `cotizaciones/${quote.id}/pdf/${stamp}-v${numeroVersionActual(quote)}-${idioma}.pdf`;
}
