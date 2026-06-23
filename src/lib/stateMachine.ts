/**
 * stateMachine.ts
 *
 * Máquina de estados pura para el pipeline de cotizaciones.
 * Sin imports de UI ni de Firestore — testeable de forma aislada.
 *
 * Alineada con el modelo de Luis (Solicitud::TRANSICIONES del brief) y
 * extendida a las 9 etapas de VermurOps.
 *
 * API pública:
 *   puedeTransicionarA(desde, hacia, rol, quote) → { ok, razon? }
 *   transicionesDisponibles(desde, rol, quote)   → PipelineStageId[]
 */

import { KanbanQuote, PipelineStageId } from '../components/quotes/QuotesData';

// ─── Tipos internos ────────────────────────────────────────────────────────────

type Rol = 'ventas' | 'pricing' | 'admin';

interface TransitionDef {
  hacia: PipelineStageId;
  /** Roles que pueden ejecutar esta transición ('admin' siempre puede todo). */
  roles: Rol[];
  /**
   * Validación de negocio opcional.
   * Devuelve null si todo está bien, o un string con el mensaje de error.
   */
  validar?: (quote: KanbanQuote) => string | null;
}

// ─── Mapa de transiciones ──────────────────────────────────────────────────────

/**
 * Grafo de transiciones permitidas.
 * Cada entrada lista las salidas posibles desde esa etapa con sus
 * restricciones de rol y validaciones de negocio.
 *
 * Alineación con Luis (vermur-cotizaciones Solicitud::TRANSICIONES):
 *   nueva        → solicitud_cliente
 *   en_revision  → solicitado_pricing | pricing_solicitando | cotizaciones_recibidas
 *   cotizada     → consolidada
 *   enviada      → enviada_cliente | negociacion
 *   rechazada    → perdida
 */
const TRANSITIONS: Record<PipelineStageId, TransitionDef[]> = {

  // ── 1. Solicitud del cliente (nueva) ────────────────────────────────────────
  solicitud_cliente: [
    {
      hacia: 'solicitado_pricing',
      roles: ['ventas', 'admin'],
      validar: q =>
        q.servicios.length === 0
          ? 'Agrega al menos un servicio antes de enviar a Pricing.'
          : null,
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'admin'],
    },
  ],

  // ── 2. Solicitado a Pricing (en_revision) ───────────────────────────────────
  solicitado_pricing: [
    {
      hacia: 'pricing_solicitando',
      roles: ['pricing', 'admin'],
    },
    {
      // Devolver: Ventas retira la solicitud para corregir
      hacia: 'solicitud_cliente',
      roles: ['ventas', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'admin'],
    },
  ],

  // ── 3. Pricing solicitando proveedores (en_revision) ────────────────────────
  pricing_solicitando: [
    {
      hacia: 'cotizaciones_recibidas',
      roles: ['pricing', 'admin'],
    },
    {
      // Devolver: Pricing lo regresa a Ventas para aclaración
      hacia: 'solicitado_pricing',
      roles: ['pricing', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'pricing', 'admin'],
    },
  ],

  // ── 4. Cotizaciones de proveedor recibidas (en_revision) ────────────────────
  cotizaciones_recibidas: [
    {
      hacia: 'consolidada',
      roles: ['pricing', 'admin'],
      validar: q => {
        const falta = q.servicios.some(
          s => !(s.cotizacionesProveedor ?? []).some(cp => cp.seleccionada)
        );
        return falta
          ? 'Selecciona un proveedor por cada servicio antes de consolidar.'
          : null;
      },
    },
    {
      // Recotizar: Pricing vuelve a solicitar proveedores
      hacia: 'pricing_solicitando',
      roles: ['pricing', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'pricing', 'admin'],
    },
  ],

  // ── 5. Cotización consolidada (cotizada) ────────────────────────────────────
  consolidada: [
    {
      hacia: 'enviada_cliente',
      roles: ['ventas', 'admin'],
    },
    {
      // Recotizar: Pricing corrige la consolidación
      hacia: 'cotizaciones_recibidas',
      roles: ['pricing', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'admin'],
    },
  ],

  // ── 6. Enviada al cliente (enviada) ─────────────────────────────────────────
  enviada_cliente: [
    {
      hacia: 'negociacion',
      roles: ['ventas', 'admin'],
    },
    {
      hacia: 'ganada',
      roles: ['ventas', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'admin'],
    },
    {
      // Devolver: reenviar propuesta corregida (Luis: enviada → cotizada)
      hacia: 'consolidada',
      roles: ['ventas', 'admin'],
    },
  ],

  // ── 7. En negociación (enviada) ─────────────────────────────────────────────
  negociacion: [
    {
      hacia: 'ganada',
      roles: ['ventas', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'admin'],
    },
    {
      // Devolver: reenviar propuesta corregida
      hacia: 'enviada_cliente',
      roles: ['ventas', 'admin'],
    },
  ],

  // ── 8 & 9. Estados terminales ────────────────────────────────────────────────
  ganada:  [],
  perdida: [],
};

// ─── API pública ───────────────────────────────────────────────────────────────

export interface TransicionResult {
  ok: boolean;
  razon?: string;
}

/**
 * Evalúa si la transición `desde → hacia` es válida para el rol dado
 * y el estado actual de la cotización.
 *
 * Checks en orden:
 *  1. ¿Existe el arco `desde → hacia` en el mapa?
 *  2. ¿El rol está autorizado?  (admin siempre pasa)
 *  3. ¿La validación de negocio pasa?
 */
export function puedeTransicionarA(
  desde: PipelineStageId,
  hacia: PipelineStageId,
  rol: Rol,
  quote: KanbanQuote,
): TransicionResult {
  const salidas = TRANSITIONS[desde] ?? [];
  const def = salidas.find(t => t.hacia === hacia);

  if (!def) {
    return { ok: false, razon: `La transición ${desde} → ${hacia} no está permitida.` };
  }

  if (!def.roles.includes(rol)) {
    return { ok: false, razon: `Tu rol (${rol}) no puede realizar esta transición.` };
  }

  if (def.validar) {
    const msg = def.validar(quote);
    if (msg !== null) return { ok: false, razon: msg };
  }

  return { ok: true };
}

/**
 * Devuelve la lista de etapas a las que se puede pasar desde `desde`
 * dado el rol y el estado actual de la cotización.
 * Útil para filtrar opciones del SELECT y botones de acción.
 */
export function transicionesDisponibles(
  desde: PipelineStageId,
  rol: Rol,
  quote: KanbanQuote,
): PipelineStageId[] {
  const salidas = TRANSITIONS[desde] ?? [];
  return salidas
    .filter(def => puedeTransicionarA(desde, def.hacia, rol, quote).ok)
    .map(def => def.hacia);
}
