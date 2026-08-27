/**
 * stateMachineOC.ts
 *
 * Máquina de estados pura para el pipeline de Órdenes de Compra.
 * Sin imports de UI ni de Firestore — testeable de forma aislada.
 *
 * Flujo principal:
 *   solicitada → en_gestion → autorizada → pagada
 * Con rechazo posible desde solicitada, en_gestion y autorizada.
 *
 * API pública:
 *   puedeTransicionarOC(desde, hacia, rol, oc, fondeoCtx?) → { ok, razon? }
 *   transicionesDisponiblesOC(desde, rol, oc, fondeoCtx?)  → EstadoOC[]
 */

import type { EstadoOC, OrdenCompra, FondeoContext } from '../components/ordenesCompra/OrdenesCompraData';

// ─── Tipos internos ────────────────────────────────────────────────────────────

export type RolOC = 'ventas' | 'pricing' | 'operaciones' | 'admin';

interface TransitionDefOC {
  hacia: EstadoOC;
  /** Roles que pueden ejecutar esta transición. */
  roles: RolOC[];
  /**
   * Validación de negocio opcional.
   * Devuelve null si todo está bien, o un string con el mensaje de error.
   */
  validar?: (oc: OrdenCompra, fondeoCtx?: FondeoContext) => string | null;
}

// ─── Mapa de transiciones ──────────────────────────────────────────────────────

/**
 * Grafo de transiciones permitidas para OCs.
 *
 * solicitada ──→ en_gestion ──→ autorizada ──→ pagada
 *      │              │              │
 *      └─ rechazada ←─┘── rechazada ←┘
 */
const TRANSITIONS_OC: Record<EstadoOC, TransitionDefOC[]> = {

  // ── 1. Solicitada (creada por Pricing) ───────────────────────────────────────
  solicitada: [
    {
      hacia: 'en_gestion',
      roles: ['operaciones', 'admin'],
    },
    {
      hacia: 'rechazada',
      roles: ['operaciones', 'admin'],
      validar: (oc) =>
        !oc.motivoRechazo
          ? 'Debes indicar un motivo de rechazo.'
          : null,
    },
  ],

  // ── 2. En gestión (Operaciones gestiona) ─────────────────────────────────────
  en_gestion: [
    {
      hacia: 'autorizada',
      roles: ['admin'],
      validar: (oc, fondeoCtx) => {
        // Fondeo solo aplica para OCs de embarque
        if (oc.origen === 'embarque' && fondeoCtx) {
          if (fondeoCtx.totalFondeo < fondeoCtx.totalOCsPendientes) {
            return `Fondeo insuficiente: depósitos $${fondeoCtx.totalFondeo.toLocaleString()} < OCs pendientes $${fondeoCtx.totalOCsPendientes.toLocaleString()}.`;
          }
        }
        return null;
      },
    },
    {
      hacia: 'rechazada',
      roles: ['operaciones', 'admin'],
      validar: (oc) =>
        !oc.motivoRechazo
          ? 'Debes indicar un motivo de rechazo.'
          : null,
    },
  ],

  // ── 3. Autorizada (Admin autorizó, pendiente de pago) ────────────────────────
  autorizada: [
    {
      hacia: 'pagada',
      roles: ['admin'],
      validar: (oc) =>
        !oc.comprobantePago
          ? 'Debes adjuntar el comprobante de pago antes de marcar como pagada.'
          : null,
    },
    {
      hacia: 'rechazada',
      roles: ['admin'],
      validar: (oc) =>
        !oc.motivoRechazo
          ? 'Debes indicar un motivo de rechazo.'
          : null,
    },
  ],

  // ── 4 & 5. Estados terminales ────────────────────────────────────────────────
  pagada: [],
  rechazada: [],
};

// ─── API pública ───────────────────────────────────────────────────────────────

export interface TransicionResultOC {
  ok: boolean;
  razon?: string;
}

/**
 * Evalúa si la transición `desde → hacia` es válida para el rol dado
 * y el estado actual de la OC.
 *
 * Checks en orden:
 *  1. ¿Existe el arco `desde → hacia` en el mapa?
 *  2. ¿El rol está autorizado?
 *  3. ¿La validación de negocio pasa?
 */
export function puedeTransicionarOC(
  desde: EstadoOC,
  hacia: EstadoOC,
  rol: RolOC,
  oc: OrdenCompra,
  fondeoCtx?: FondeoContext,
): TransicionResultOC {
  const salidas = TRANSITIONS_OC[desde] ?? [];
  const def = salidas.find(t => t.hacia === hacia);

  if (!def) {
    return { ok: false, razon: `La transición ${desde} → ${hacia} no está permitida.` };
  }

  if (!def.roles.includes(rol)) {
    return { ok: false, razon: `Tu rol (${rol}) no puede realizar esta transición.` };
  }

  if (def.validar) {
    const msg = def.validar(oc, fondeoCtx);
    if (msg !== null) return { ok: false, razon: msg };
  }

  return { ok: true };
}

/**
 * Devuelve la lista de estados a los que se puede pasar desde `desde`
 * dado el rol y el estado actual de la OC.
 * Útil para filtrar botones de acción en la UI.
 */
export function transicionesDisponiblesOC(
  desde: EstadoOC,
  rol: RolOC,
  oc: OrdenCompra,
  fondeoCtx?: FondeoContext,
): EstadoOC[] {
  const salidas = TRANSITIONS_OC[desde] ?? [];
  return salidas
    .filter(def => puedeTransicionarOC(desde, def.hacia, rol, oc, fondeoCtx).ok)
    .map(def => def.hacia);
}
