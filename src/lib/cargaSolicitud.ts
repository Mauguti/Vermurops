/**
 * cargaSolicitud.ts (S-1 — rediseño de la solicitud de cotización)
 *
 * Lógica pura de la carga tipada: validación por modalidad, resumen para
 * bandejas, espejo de campos legacy, fallback para solicitudes viejas,
 * precarga de conceptos requeridos y herencia de mercancías al embarque.
 *
 * ── El principio ───────────────────────────────────────────────────────────
 * Ventas SEÑALA qué se necesita; Pricing DECIDE conceptos y precios. Este
 * módulo tipa lo primero para que Pricing cotice sin volver a preguntar.
 *
 * Sin React, sin Firestore, sin red.
 */

import type {
  CargaSolicitada, CargaFCL, ConceptoRequerido, MercanciaDetalle,
  ServicioSolicitado, ConceptoCotizacion, TipoContenedor, TipoUnidadTerrestre,
} from '../components/quotes/QuotesData';
import type { MercanciaLine } from '../components/shipments/EmbarquesData';
import { calcLinea } from './cotizacionCalculator';
import { idUnico } from './idUnico';

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Modalidad: derivada de la carga, nunca guardada aparte
// ─────────────────────────────────────────────────────────────────────────────

export type ModalidadSolicitud = 'maritimo' | 'aereo' | 'terrestre' | 'despacho_aduanal';

export function modalidadDeCarga(carga: CargaSolicitada): ModalidadSolicitud {
  switch (carga.tipo) {
    case 'fcl':
    case 'lcl': return 'maritimo';
    case 'aereo': return 'aereo';
    case 'terrestre': return 'terrestre';
    case 'despacho': return 'despacho_aduanal';
  }
}

export const ETIQUETA_MODALIDAD: Record<ModalidadSolicitud, string> = {
  maritimo: 'Marítimo',
  aereo: 'Aéreo',
  terrestre: 'Terrestre',
  despacho_aduanal: 'Despacho aduanal',
};

export const ETIQUETA_CONTENEDOR: Record<TipoContenedor, string> = {
  '20': "20'",
  '40': "40'",
  '40hc': "40'HC",
  reefer: 'Reefer',
  open_top: 'Open Top',
  flat_rack: 'Flat Rack',
};

export const ETIQUETA_UNIDAD_TERRESTRE: Record<TipoUnidadTerrestre, string> = {
  caja_seca_53: "Caja seca 53'",
  caja_seca_48: "Caja seca 48'",
  plataforma: 'Plataforma',
  refrigerada: 'Refrigerada',
  torton: 'Tortón',
  rabon: 'Rabón',
};

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Validación por modalidad
//
// Los faltantes se devuelven como texto listo para mostrar. La regla dura:
// peligrosa sin clase IMO o refrigerado sin temperatura NO pasa — un «sí» a
// medias es peor que un «no», porque viaja como si estuviera resuelto.
// ─────────────────────────────────────────────────────────────────────────────

export function validarCarga(carga: CargaSolicitada): string[] {
  const faltantes: string[] = [];
  const pesoPositivo = (kg: number, etiqueta = 'El peso bruto') => {
    if (!(kg > 0)) faltantes.push(`${etiqueta} es obligatorio.`);
  };
  const peligrosaCompleta = (p: { esPeligrosa: boolean; claseIMO?: string; numeroUN?: string }) => {
    if (p.esPeligrosa && !p.claseIMO?.trim()) {
      faltantes.push('Mercancía peligrosa: falta la clase IMO.');
    }
    if (p.esPeligrosa && !p.numeroUN?.trim()) {
      faltantes.push('Mercancía peligrosa: falta el UN number.');
    }
  };

  switch (carga.tipo) {
    case 'fcl': {
      const validos = carga.contenedores.filter(c => c.cantidad > 0);
      if (validos.length === 0) faltantes.push('Indica al menos un contenedor con cantidad.');
      pesoPositivo(carga.pesoBrutoKg);
      peligrosaCompleta(carga.peligrosa);
      if (carga.refrigeracion.requiere && typeof carga.refrigeracion.temperaturaC !== 'number') {
        faltantes.push('Requiere refrigeración: falta la temperatura.');
      }
      break;
    }
    case 'lcl': {
      pesoPositivo(carga.pesoBrutoKg);
      if (!(carga.volumenM3 > 0)) faltantes.push('El volumen en m³ es obligatorio.');
      if (!(carga.piezas > 0)) faltantes.push('El número de piezas o bultos es obligatorio.');
      peligrosaCompleta(carga.peligrosa);
      break;
    }
    case 'aereo': {
      pesoPositivo(carga.pesoBrutoKg);
      if (!(carga.piezas > 0)) faltantes.push('El número de piezas es obligatorio.');
      peligrosaCompleta(carga.peligrosa);
      break;
    }
    case 'terrestre': {
      pesoPositivo(carga.pesoBrutoKg, 'El peso');
      break;
    }
    case 'despacho': {
      if (!carga.aduana.trim()) faltantes.push('La aduana es obligatoria.');
      if (carga.fraccionesArancelarias.filter(f => f.trim()).length === 0) {
        faltantes.push('Indica al menos una fracción arancelaria.');
      }
      if (!(carga.valorMercancia.monto > 0)) {
        faltantes.push('El valor de la mercancía es obligatorio.');
      }
      break;
    }
  }
  return faltantes;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Resumen para bandejas y Kanban
// ─────────────────────────────────────────────────────────────────────────────

const fmtKg = (kg: number) => `${kg.toLocaleString('en-US')} kg`;

/** Una línea legible: «2×40' + 1×20' · 18,500 kg · IMO 3». */
export function resumenCarga(carga: CargaSolicitada): string {
  const partes: string[] = [];
  switch (carga.tipo) {
    case 'fcl': {
      const conts = carga.contenedores
        .filter(c => c.cantidad > 0)
        .map(c => `${c.cantidad}×${ETIQUETA_CONTENEDOR[c.tipoContenedor]}`);
      partes.push(conts.length ? `FCL ${conts.join(' + ')}` : 'FCL');
      if (carga.pesoBrutoKg > 0) partes.push(fmtKg(carga.pesoBrutoKg));
      if (carga.refrigeracion.requiere && typeof carga.refrigeracion.temperaturaC === 'number') {
        partes.push(`${carga.refrigeracion.temperaturaC}°C`);
      }
      break;
    }
    case 'lcl':
      partes.push('LCL');
      if (carga.piezas > 0) partes.push(`${carga.piezas} bultos`);
      if (carga.pesoBrutoKg > 0) partes.push(fmtKg(carga.pesoBrutoKg));
      if (carga.volumenM3 > 0) partes.push(`${carga.volumenM3} m³`);
      if (!carga.estibable) partes.push('no estibable');
      break;
    case 'aereo':
      partes.push('Aéreo');
      if (carga.piezas > 0) partes.push(`${carga.piezas} pzas`);
      if (carga.pesoBrutoKg > 0) partes.push(fmtKg(carga.pesoBrutoKg));
      if (carga.pesoVolumetricoKg > 0) partes.push(`vol. ${fmtKg(carga.pesoVolumetricoKg)}`);
      break;
    case 'terrestre':
      partes.push(ETIQUETA_UNIDAD_TERRESTRE[carga.tipoUnidad]);
      if (carga.pesoBrutoKg > 0) partes.push(fmtKg(carga.pesoBrutoKg));
      if (carga.requiereManiobras) partes.push('con maniobras');
      break;
    case 'despacho':
      partes.push(`Despacho ${carga.operacion === 'importacion' ? 'impo' : 'expo'}`);
      if (carga.aduana.trim()) partes.push(carga.aduana);
      if (carga.requierePrevio) partes.push('previo');
      if (carga.requiereNOM) partes.push('NOM');
      break;
  }
  const peligrosa = 'peligrosa' in carga && carga.peligrosa.esPeligrosa
    ? `IMO ${carga.peligrosa.claseIMO ?? '?'}`
    : null;
  if (peligrosa) partes.push(peligrosa);
  return partes.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Espejo legacy: peso y volumen planos
//
// BandejaPricing y todo lector viejo leen `servicio.peso` y `servicio.volumen`.
// El formulario nuevo escribe AMBOS: la carga tipada manda, el espejo mantiene
// vivos a los lectores sin tocarlos.
// ─────────────────────────────────────────────────────────────────────────────

export function espejoLegacy(carga: CargaSolicitada): { peso: number; volumen: number } {
  switch (carga.tipo) {
    case 'fcl': return { peso: carga.pesoBrutoKg, volumen: 0 };
    case 'lcl': return { peso: carga.pesoBrutoKg, volumen: carga.volumenM3 };
    case 'aereo': return { peso: carga.pesoBrutoKg, volumen: 0 };
    case 'terrestre': return { peso: carga.pesoBrutoKg, volumen: 0 };
    case 'despacho': return { peso: 0, volumen: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Fallback: leer solicitudes viejas
//
// Patrón getOficialIds: se intenta el campo nuevo y se cae al viejo. Los
// campos E4 (fcl_*, lcl_*, ter_*) nunca los capturó el formulario actual,
// pero existen en el modelo y pueden existir en datos: se leen si están.
// Devuelve null cuando no hay NADA que leer — el lector muestra el texto
// plano de siempre y no inventa una carga vacía.
// ─────────────────────────────────────────────────────────────────────────────

export function cargaDesdeLegacy(servicio: ServicioSolicitado): CargaSolicitada | null {
  if (servicio.carga) return servicio.carga;

  const sinPeligro = { esPeligrosa: false };

  if (servicio.tipo_embarque === 'FCL') {
    const contenedores: CargaFCL['contenedores'] = [];
    const texto = (servicio.fcl_contenedor ?? '').toLowerCase();
    // El legacy guardaba UN contenedor como texto («40'HC»); se interpreta lo
    // interpretable y lo demás se pierde con honestidad (lista vacía).
    const tipo: TipoContenedor | null =
      texto.includes('reef') ? 'reefer'
      : texto.includes('40') && texto.includes('hc') ? '40hc'
      : texto.includes('40') ? '40'
      : texto.includes('20') ? '20'
      : null;
    if (tipo) contenedores.push({ tipoContenedor: tipo, cantidad: 1 });
    const factor = servicio.fcl_peso_unidad === 'tons' ? 1000 : 1;
    return {
      tipo: 'fcl',
      contenedores,
      pesoBrutoKg: (servicio.fcl_peso ?? servicio.peso ?? 0) * factor,
      peligrosa: sinPeligro,
      refrigeracion: { requiere: texto.includes('reef') },
    };
  }

  if (servicio.tipo_embarque === 'LCL') {
    return {
      tipo: 'lcl',
      pesoBrutoKg: servicio.peso ?? 0,
      volumenM3: servicio.lcl_cubicaje_total ?? servicio.volumen ?? 0,
      piezas: servicio.lcl_num_pallets ?? 0,
      bultos: [],
      estibable: servicio.lcl_estibable ?? true,
      peligrosa: sinPeligro,
    };
  }

  if (servicio.ter_unidad || servicio.ter_tipo) {
    const texto = (servicio.ter_unidad ?? '').toLowerCase();
    const tipoUnidad: TipoUnidadTerrestre =
      texto.includes('53') ? 'caja_seca_53'
      : texto.includes('48') ? 'caja_seca_48'
      : texto.includes('plataforma') ? 'plataforma'
      : texto.includes('refri') ? 'refrigerada'
      : texto.includes('rab') ? 'rabon'
      : 'torton';
    const factor = servicio.ter_peso_unidad === 'tons' ? 1000 : 1;
    return {
      tipo: 'terrestre',
      tipoUnidad,
      pesoBrutoKg: (servicio.ter_peso ?? servicio.peso ?? 0) * factor,
      piezas: servicio.ter_num_pallets ?? 0,
      requiereManiobras: false,
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Precarga: de requerimientos de Ventas a líneas de Pricing
//
// Un solo catálogo, dos usos: Ventas señala conceptos del catálogo real (105)
// y aquí se convierten en líneas de la tabla, en cero y sin proveedor, listas
// para que Pricing DECIDA. `conceptosRequeridos` queda aparte como registro
// de lo pedido; estas líneas son de Pricing y las cambia libremente.
// ─────────────────────────────────────────────────────────────────────────────

export function precargarConceptos(
  servicioId: string,
  requeridos: ConceptoRequerido[],
): ConceptoCotizacion[] {
  return requeridos.map((r, i) => {
    const { venta, margen } = calcLinea(0, 0);
    return {
      id: idUnico(`con-${servicioId}`),
      nombre: r.nombre,
      conceptoId: r.conceptoId,
      costo: 0,
      profit: 0,
      venta,
      margen,
      // Sin costoCapturado: el cero es un pendiente de Pricing, no una
      // decisión — debe seguir bloqueando (ver ConceptoCotizacion).
      subconceptos: [],
      tarifas: [],
      proveedoresOficialIds: [],
      orden: i,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 · Herencia de mercancías al embarque
//
// Operaciones captura contenedor → pallets → mercancía. Si Ventas ya
// describió los productos, se heredan como MercanciaLine en vez de
// recapturarse. Solo pasan las líneas con lo mínimo que el embarque usa
// (descripción); piezas y peso ausentes viajan en cero y se completan allá.
// ─────────────────────────────────────────────────────────────────────────────

export function mercanciasAEmbarque(mercancias: MercanciaDetalle[] | undefined): MercanciaLine[] {
  return (mercancias ?? [])
    .filter(m => m.descripcion.trim() !== '')
    .map(m => ({
      id: idUnico('mrc'),
      descripcion: m.descripcion.trim(),
      cantidad: m.piezas ?? 0,
      pesoKg: m.pesoKg ?? 0,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8 · Herencia de la carga al embarque (S-3)
//
// Operaciones captura productos → pallets → mercancía en el embarque. Lo que
// Ventas ya declaró en la solicitud se hereda como punto de partida:
// contenedores con su tipo (número pendiente), peso, piezas, y el detalle de
// mercancías como pallet inicial. Nada se inventa: con VARIOS contenedores el
// peso total no se reparte —repartirlo sería inventar— y queda en el primero
// solo cuando el contenedor es único.
// ─────────────────────────────────────────────────────────────────────────────

import type { EmbarqueProducto, Pallet } from '../components/shipments/EmbarquesData';

function palletInicial(
  mercancias: MercanciaDetalle[] | undefined,
  clienteNombre: string,
  cotizacionId: string,
): Pallet[] {
  const lineas = mercanciasAEmbarque(mercancias);
  if (lineas.length === 0) return [];
  return [{
    id: idUnico('pal'),
    numeroPallet: '1',
    clienteNombre,
    cotizacionRef: cotizacionId,
    mercancia: lineas,
  }];
}

/**
 * Productos del embarque a partir de la carga tipada de UN servicio.
 * Lee vía cargaDesdeLegacy: una solicitud vieja también hereda lo que tenga.
 * Devuelve [] cuando no hay nada que heredar — el embarque nace como hoy.
 */
export function productosDesdeCarga(
  servicio: ServicioSolicitado,
  clienteNombre: string,
  cotizacionId: string,
): EmbarqueProducto[] {
  const carga = cargaDesdeLegacy(servicio);
  if (!carga) return [];

  const descripcion = servicio.mercancia && servicio.mercancia !== 'Por definir'
    ? servicio.mercancia
    : 'Mercancía por describir';
  const pallets = palletInicial(carga.mercancias, clienteNombre, cotizacionId);

  switch (carga.tipo) {
    case 'fcl': {
      const unidades = carga.contenedores.flatMap(c =>
        Array.from({ length: Math.max(0, c.cantidad) }, () => c.tipoContenedor));
      if (unidades.length === 0) return [];
      const unico = unidades.length === 1;
      return unidades.map((tipoContenedor, i) => ({
        id: idUnico('prod'),
        descripcion,
        tipoEmbalaje: 'Contenedor',
        // El número lo pone Operaciones cuando la naviera lo asigna.
        datosContenedor: { numeroContenedor: '', tipoContenedor: ETIQUETA_CONTENEDOR[tipoContenedor], numeroSello: '', folioSello: '' },
        tipoConsolidacion: 'FCL' as const,
        piezas: 0,
        peso: unico ? carga.pesoBrutoKg : 0,
        ...(unico || i === 0 ? { pallets } : { pallets: [] }),
      }));
    }
    case 'lcl':
      return [{
        id: idUnico('prod'),
        descripcion,
        tipoEmbalaje: 'Bulto',
        tipoConsolidacion: 'LCL' as const,
        piezas: carga.piezas,
        peso: carga.pesoBrutoKg,
        volumen: carga.volumenM3,
        pallets,
      }];
    case 'aereo':
      return [{
        id: idUnico('prod'),
        descripcion,
        tipoEmbalaje: 'Bulto',
        piezas: carga.piezas,
        peso: carga.pesoBrutoKg,
        pallets,
      }];
    case 'terrestre':
      return [{
        id: idUnico('prod'),
        descripcion,
        tipoEmbalaje: 'Bulto',
        piezas: carga.piezas,
        peso: carga.pesoBrutoKg,
        pallets,
      }];
    case 'despacho':
      // El despacho no mueve carga propia: no hereda productos.
      return [];
  }
}

/** Productos de un GRUPO de servicios (un embarque puede juntar varios). */
export function productosDesdeGrupo(
  servicios: ServicioSolicitado[],
  clienteNombre: string,
  cotizacionId: string,
): EmbarqueProducto[] {
  return servicios.flatMap(s => productosDesdeCarga(s, clienteNombre, cotizacionId));
}
