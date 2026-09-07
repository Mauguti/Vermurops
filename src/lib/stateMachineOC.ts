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

import type { EstadoOC, OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { evaluarFondeo, type FondeoEmbarque } from './fondeoCliente';

// ─── Tipos internos ────────────────────────────────────────────────────────────

/**
 * Roles que participan en el flujo de una OC.
 *
 * ⚠️ 'administracion' es el ÁREA —la que autoriza y paga, Julio en el
 * levantamiento— y 'admin' es el superusuario TÉCNICO. La máquina nació solo
 * con 'admin', así que el área que de verdad autoriza los pagos no podía
 * hacerlo: el flujo entero se quedaba trabado en «en gestión». Misma
 * distinción que en §4.1 del CLAUDE.md.
 */
export type RolOC = 'ventas' | 'pricing' | 'operaciones' | 'administracion' | 'admin';

interface TransitionDefOC {
  hacia: EstadoOC;
  /** Roles que pueden ejecutar esta transición. */
  roles: RolOC[];
  /**
   * Validación de negocio opcional.
   * Devuelve null si todo está bien, o un string con el mensaje de error.
   */
  validar?: (oc: OrdenCompra, fondeoCtx?: FondeoEmbarque) => string | null;
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
      roles: ['administracion', 'admin'],
      validar: (oc, fondeoCtx) => {
        /*
         * ── 1.1 · El fondeo del cliente ────────────────────────────────────
         * El veredicto vive en lib/fondeoCliente.ts porque tiene dos reglas
         * distintas —crédito para gastos normales, depósito completo para
         * impuestos— y ambas necesitan mirar la moneda (§4.3), cosa que un
         * par de escalares no permite.
         *
         * El flag «No pagar» se evalúa SIEMPRE, incluso sin contexto de
         * fondeo y para gastos de oficina: es una decisión humana explícita
         * y no puede depender de que quien llame se acuerde de pasar datos.
         */
        if (oc.noPagar) {
          return oc.motivoNoPagar
            ? `Marcada «No pagar»: ${oc.motivoNoPagar}`
            : 'Marcada «No pagar»: alguien la detuvo a propósito. Quita la marca para autorizarla.';
        }

        if (oc.origen !== 'embarque') return null;

        if (!fondeoCtx) {
          // Sin contexto no se puede afirmar que hay dinero. Antes esto
          // dejaba pasar la orden; ahora se detiene: en una regla que
          // protege dinero, la ausencia de datos no es una aprobación.
          return 'No se pudo verificar el fondeo del embarque. Recarga e intenta de nuevo.';
        }

        return evaluarFondeo(oc, fondeoCtx).motivo ?? null;
      },
    },
    {
      hacia: 'rechazada',
      roles: ['operaciones', 'administracion', 'admin'],
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
      roles: ['administracion', 'admin'],
      validar: (oc) =>
        !oc.comprobantePago
          ? 'Debes adjuntar el comprobante de pago antes de marcar como pagada.'
          : null,
    },
    {
      hacia: 'rechazada',
      roles: ['administracion', 'admin'],
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
  fondeoCtx?: FondeoEmbarque,
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
  fondeoCtx?: FondeoEmbarque,
): EstadoOC[] {
  const salidas = TRANSITIONS_OC[desde] ?? [];
  return salidas
    .filter(def => puedeTransicionarOC(desde, def.hacia, rol, oc, fondeoCtx).ok)
    .map(def => def.hacia);
}
