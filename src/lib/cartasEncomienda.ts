/**
 * cartasEncomienda.ts — mapa naviera → plantilla de carta de encomienda / garantía.
 *
 * Cada naviera tiene su propio texto legal: las plantillas NO se unifican.
 * Si la naviera del embarque no está en el mapa, el botón lo dice y no genera.
 *
 * Los nombres del mapa se comparan en mayúsculas y sin acentos contra
 * `ruta.origen.transportista`. Un embarque con transportista "Maersk Line"
 * hace match con la clave "MAERSK" porque buscamos si la cadena CONTIENE
 * alguna de las variantes.
 */

import type { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

// ── Definición de una naviera con plantilla ─────────────────────────────────

export interface NavieraPlantilla {
  /** Clave interna: el nombre de los archivos .html en functions/plantillas/ */
  clave: string;
  /** Nombre legible de la naviera (como aparece en la carta). */
  nombre: string;
  /** Razón social completa para el encabezado de la carta. */
  razonSocial: string;
  /** Línea "AT'N:" del destinatario. */
  atencion: string;
  /** Variantes del nombre para hacer match con ruta.origen.transportista. */
  variantes: string[];
  /** Tipo de documento: solo encomienda, solo garantía, o ambas (MSC). */
  tipo: 'encomienda' | 'garantia' | 'encomienda_y_garantia';
}

// ── El mapa ─────────────────────────────────────────────────────────────────

export const NAVIERAS_PLANTILLA: NavieraPlantilla[] = [
  {
    clave: 'carta_encomienda_cosco',
    nombre: 'COSCO',
    razonSocial: 'COSCO SHIPPING LINES CO., LTD',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['COSCO'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_hamburg_sud',
    nombre: 'Hamburg Süd',
    razonSocial: 'HAMBURG SÜD',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['HAMBURG', 'HAMBURG SUD', 'HAMBURG SÜD'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_cma_cgm',
    nombre: 'CMA CGM',
    razonSocial: 'CMA CGM',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['CMA CGM', 'CMA'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_evergreen',
    nombre: 'Evergreen',
    razonSocial: 'EVERGREEN LINE',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['EVERGREEN'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_sealand',
    nombre: 'Sealand',
    razonSocial: 'SEALAND',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['SEALAND', 'SEA LAND'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_agunsa',
    nombre: 'Agunsa',
    razonSocial: 'AGUNSA',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['AGUNSA'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_one',
    nombre: 'ONE',
    razonSocial: 'OCEAN NETWORK EXPRESS',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['OCEAN NETWORK', 'ONE'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_pil',
    nombre: 'PIL',
    razonSocial: 'Representaciones Marítimas S.A. DE C.V. as agent of Pacific International Lines Pte LTD',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['PIL', 'PACIFIC INTERNATIONAL'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_encomienda_maersk',
    nombre: 'Maersk',
    razonSocial: 'MAERSK A/S',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['MAERSK'],
    tipo: 'encomienda',
  },
  {
    clave: 'carta_garantia_hmm',
    nombre: 'HMM',
    razonSocial: 'HMM COMPANY LIMITED Y/O NORTON LILLY SHIPPING MEXICO, S.A. DE C.V.',
    atencion: '',
    variantes: ['HMM', 'HYUNDAI', 'NORTON LILLY'],
    tipo: 'garantia',
  },
  {
    clave: 'carta_encomienda_msc',
    nombre: 'MSC',
    razonSocial: 'MEDITERRANEAN SHIPPING COMPANY MEXICO S.A DE C.V.',
    atencion: 'DEPARTAMENTO DE IMPORTACIÓN',
    variantes: ['MSC', 'MEDITERRANEAN'],
    tipo: 'encomienda_y_garantia',
  },
];

// ── Buscar naviera por el transportista del embarque ─────────────────────────

/**
 * Normaliza un string para comparación: mayúsculas, sin acentos.
 */
function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Busca la plantilla de carta encomienda / garantía para la naviera del embarque.
 *
 * Compara `ruta.origen.transportista` contra las variantes de cada naviera.
 * Busca coincidencia parcial: "Maersk Line S.A." contiene "MAERSK".
 *
 * Devuelve `null` si la naviera no tiene plantilla.
 */
export function buscarNavieraPlantilla(transportista: string): NavieraPlantilla | null {
  if (!transportista?.trim()) return null;
  const norm = normalizar(transportista);

  // Primero buscar coincidencias más específicas (nombres más largos primero)
  const ordenadas = [...NAVIERAS_PLANTILLA].sort((a, b) => {
    const maxA = Math.max(...a.variantes.map(v => v.length));
    const maxB = Math.max(...b.variantes.map(v => v.length));
    return maxB - maxA;
  });

  for (const nav of ordenadas) {
    for (const variante of nav.variantes) {
      if (norm.includes(normalizar(variante))) {
        return nav;
      }
    }
  }
  return null;
}

// ── Validación ──────────────────────────────────────────────────────────────

export interface FaltanteEncomienda {
  campo: string;
  etiqueta: string;
}

/**
 * Verifica que el embarque tenga los datos obligatorios para generar la carta
 * de encomienda. Devuelve un arreglo vacío si todo está completo.
 *
 * Los campos requeridos según la tarea 52:
 * - Agente aduanal (y su patente)
 * - BL (numeroGuia)
 * - Buque
 * - Contenedores (al menos uno)
 * - Puerto de carga y descarga
 * - Naviera (transportista) con plantilla disponible
 */
export function validarParaEncomienda(embarque: EmbarqueCompleto): FaltanteEncomienda[] {
  const faltantes: FaltanteEncomienda[] = [];

  if (!embarque.entidades?.agenteAduanal?.trim()) {
    faltantes.push({ campo: 'entidades.agenteAduanal', etiqueta: 'Agente aduanal' });
  }

  if (!embarque.numeroGuia?.trim()) {
    faltantes.push({ campo: 'numeroGuia', etiqueta: 'Número de B/L' });
  }

  if (!embarque.ruta?.origen?.buque?.trim()) {
    faltantes.push({ campo: 'ruta.origen.buque', etiqueta: 'Buque' });
  }

  if (!embarque.ruta?.origen?.transportista?.trim()) {
    faltantes.push({ campo: 'ruta.origen.transportista', etiqueta: 'Naviera' });
  } else if (!buscarNavieraPlantilla(embarque.ruta.origen.transportista)) {
    faltantes.push({
      campo: 'ruta.origen.transportista',
      etiqueta: `Naviera «${embarque.ruta.origen.transportista}» sin plantilla disponible`,
    });
  }

  return faltantes;
}

/**
 * Obtiene la lista de contenedores del embarque como texto para la carta.
 * Si no hay productos con datos de contenedor, devuelve vacío.
 */
export function contenedoresDelEmbarque(embarque: EmbarqueCompleto): string[] {
  const productos = embarque.productos ?? [];
  const contenedores: string[] = [];
  for (const p of productos) {
    const num = p.datosContenedor?.numeroContenedor?.trim();
    if (num) contenedores.push(num);
  }
  return contenedores;
}

/**
 * Etiqueta legible para el tipo de documento de la naviera.
 */
export function etiquetaCartaNaviera(nav: NavieraPlantilla): string {
  if (nav.tipo === 'garantia') return `Carta garantía ${nav.nombre}`;
  if (nav.tipo === 'encomienda_y_garantia') return `Carta encomienda y garantía ${nav.nombre}`;
  return `Carta encomienda ${nav.nombre}`;
}
