/**
 * analitica.ts
 *
 * Google Analytics de la plataforma: SOLO en producción, y solo eventos —
 * nunca datos de la operación.
 *
 * ── La regla que gobierna este módulo ──────────────────────────────────────
 * Se mide CÓMO se usa la plataforma, no QUÉ mueve Vermur. Ningún evento lleva
 * nombres de clientes, montos, RFC, folios ni descripciones de mercancía. Un
 * parámetro es admisible solo si sigue siendo verdad al mirarlo un año
 * después sin contexto: «modalidad: maritimo» sí, «cliente: Siemens» no.
 *
 * El límite no es una convención que haya que recordar en cada llamada: los
 * parámetros pasan por `limpiarParametros`, que descarta todo lo que no sea
 * una clave permitida. Una llamada descuidada pierde el parámetro, no manda
 * el dato.
 *
 * ── Por qué es asíncrono y silencioso ──────────────────────────────────────
 * `getAnalytics` truena fuera del navegador (SSR, tests, jsdom sin las APIs
 * que usa) y `isSupported()` es la comprobación oficial. Ningún fallo de
 * medición puede tumbar una pantalla: la analítica es observación, no
 * funcionalidad. Todo lo de aquí falla en silencio a propósito.
 */

import type { Analytics } from 'firebase/analytics';
import app, { USANDO_EMULADORES } from '../firebase';

/**
 * Producción y nada más. Con emuladores la app corre contra bases de prueba y
 * sus clics no son uso real; en local pasa lo mismo. Misma condición que ya
 * gobierna a qué base le hablamos.
 */
const HABILITADA = !USANDO_EMULADORES && import.meta.env.PROD;

/** Promesa única: `isSupported()` es asíncrono y no vale la pena repetirlo. */
let instancia: Promise<Analytics | null> | null = null;

function obtener(): Promise<Analytics | null> {
  if (!HABILITADA) return Promise.resolve(null);
  if (!instancia) {
    instancia = import('firebase/analytics')
      .then(async ({ getAnalytics, isSupported }) =>
        (await isSupported()) ? getAnalytics(app) : null)
      .catch(() => null);
  }
  return instancia;
}

// ─────────────────────────────────────────────────────────────────────────────
// La lista blanca de parámetros
//
// Lo que NO está aquí no viaja. Cada clave es una dimensión de USO; ninguna
// identifica a un cliente, un proveedor ni una operación.
// ─────────────────────────────────────────────────────────────────────────────

const PARAMETROS_PERMITIDOS = new Set([
  'seccion',        // dashboard | quotes | shipments | …
  'rol',            // ventas | pricing | operaciones | administracion | admin
  'modalidad',      // maritimo | aereo | terrestre | despacho_aduanal
  'flujo',          // solicitud_cotizacion | carga_tarifario | …
  'etapa',          // en qué punto del flujo ocurrió
  'motivo',         // por qué terminó así (cancelado, validacion, error)
  'origen',         // desde dónde se disparó (kanban, bandeja, ficha)
  'resultado',      // exito | error
  'conteo',         // cuántos (líneas, tarifas): número, no importe
  'tiene_detalle',  // booleano: si venía con detalle de mercancía
]);

/** Valores admisibles: cortos, sin espacios sospechosos, sin PII posible. */
type ValorParametro = string | number | boolean;

function limpiarParametros(
  params: Record<string, ValorParametro> = {},
): Record<string, ValorParametro> {
  const limpio: Record<string, ValorParametro> = {};
  for (const [clave, valor] of Object.entries(params)) {
    if (!PARAMETROS_PERMITIDOS.has(clave)) continue;
    if (typeof valor === 'number' || typeof valor === 'boolean') {
      limpio[clave] = valor;
      continue;
    }
    if (typeof valor !== 'string') continue;
    // Un texto largo es prosa, y la prosa lleva nombres. Se recorta a lo que
    // puede ser una etiqueta.
    const t = valor.trim();
    if (t === '' || t.length > 40) continue;
    limpio[clave] = t;
  }
  return limpio;
}

/** Registra un evento. Nunca lanza; si algo falla, no pasa nada. */
export function registrarEvento(
  nombre: string,
  params: Record<string, ValorParametro> = {},
): void {
  if (!HABILITADA) return;
  obtener()
    .then(async (analytics) => {
      if (!analytics) return;
      const { logEvent } = await import('firebase/analytics');
      logEvent(analytics, nombre, limpiarParametros(params));
    })
    .catch(() => { /* medir nunca puede romper la pantalla */ });
}

// ─────────────────────────────────────────────────────────────────────────────
// Los eventos que se miden
//
// Nombres fijos y en un solo lugar: un evento tecleado distinto en dos
// pantallas se convierte en dos series que nadie vuelve a juntar.
// ─────────────────────────────────────────────────────────────────────────────

/** Qué módulos se usan y cuáles están muertos. */
export function medirVistaDeSeccion(seccion: string, rol?: string): void {
  registrarEvento('page_view', { seccion, ...(rol ? { rol } : {}) });
}

/** Qué roles entran y con qué frecuencia. */
export function medirInicioDeSesion(rol: string): void {
  registrarEvento('login', { rol });
}

/** Cuántas cotizaciones se crean, y de qué modalidad. */
export function medirCotizacionCreada(
  modalidad: string,
  origen: 'formulario' | 'alta_rapida',
  conceptosSenalados: number,
): void {
  registrarEvento('cotizacion_creada', {
    modalidad, origen, conteo: conceptosSenalados,
  });
}

/** Cuántos tarifarios se cargan con IA y cuántas tarifas produjeron. */
export function medirTarifarioCargado(
  resultado: 'exito' | 'error',
  tarifasExtraidas = 0,
): void {
  registrarEvento('tarifario_cargado', { resultado, conteo: tarifasExtraidas });
}

/**
 * Dónde se abandona un flujo a medias.
 *
 * `flujo_iniciado` y `flujo_terminado` se emiten en pares; la diferencia entre
 * ambos ES el abandono. `flujo_abandonado` se emite además cuando la salida es
 * explícita (cancelar, cerrar) y dice en qué etapa iba.
 */
export function medirFlujoIniciado(flujo: string): void {
  registrarEvento('flujo_iniciado', { flujo });
}

export function medirFlujoTerminado(flujo: string, etapa = 'completado'): void {
  registrarEvento('flujo_terminado', { flujo, etapa });
}

export function medirFlujoAbandonado(
  flujo: string,
  etapa: string,
  motivo: 'cancelado' | 'validacion' | 'error' = 'cancelado',
): void {
  registrarEvento('flujo_abandonado', { flujo, etapa, motivo });
}

/** Expuesto solo para tests: la lista blanca en acción. */
export const _limpiarParametros = limpiarParametros;
