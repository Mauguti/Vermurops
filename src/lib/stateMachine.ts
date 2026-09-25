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
import { razonSinCliente } from './frenoCliente';
import { razonExpediente } from './frenoExpediente';
import type { ClienteVermur } from '../components/clientes/ClientesData';

/**
 * Contexto opcional de una transición (Bloque 2b): el cliente vinculado,
 * para el freno del expediente. Si quien pregunta no lo pasa, la máquina
 * solo revisa lo que sabe (el clienteId); los puntos que ESCRIBEN exigen el
 * expediente por su cuenta con `exigirExpediente`.
 */
export interface ContextoTransicion {
  cliente?: ClienteVermur | null;
  justificacion?: string;
  rol?: Rol;
}
import type { UserRole } from '../auth/users';
import { evaluarProntitud, resumenFaltantes, serviciosSinLineas } from './prontitudCotizacion';

// ─── Tipos internos ────────────────────────────────────────────────────────────

/**
 * Roles que pueden mover el pipeline.
 *
 * Se alía a UserRole en vez de duplicar la lista: así, añadir un rol al sistema
 * no deja esta máquina con un tipo desincronizado. Los roles que no aparecen en
 * ninguna transición ('operaciones', 'administracion') simplemente no pueden
 * mover cotizaciones — que es lo correcto.
 */
export type Rol = UserRole;

interface TransitionDef {
  hacia: PipelineStageId;
  /** Roles que pueden ejecutar esta transición ('admin' siempre puede todo). */
  roles: Rol[];
  /**
   * Validación de negocio opcional.
   * Devuelve null si todo está bien, o un string con el mensaje de error.
   */
  validar?: (quote: KanbanQuote, ctx?: ContextoTransicion) => string | null;
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
      // 1b · 'pricing' incluido: los clientes de oficina y los agentes de
      // carga no tienen vendedor asignado por definición, así que su
      // solicitud nace y avanza sin pasar por Ventas.
      roles: ['ventas', 'pricing', 'admin'],
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
      // 1b · regresar es parte de trabajar la cotización, y no saltea ningún
      // freno: los de cliente y expediente viven en las transiciones a ganada.
      roles: ['ventas', 'pricing', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'pricing', 'admin'],
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
      /*
       * El guard lee por el MISMO adaptador que los botones del footer.
       *
       * Antes leía solo `servicio.cotizacionesProveedor[].seleccionada` — la
       * ruta B de la dualidad de §6, la única que existía cuando se escribió.
       * La ficha rediseñada asigna proveedores en `concepto.tarifas` (ruta A),
       * así que Pricing capturaba todo en las tarjetas, los botones decían
       * «listo» y la máquina pedía «selecciona un proveedor por cada
       * servicio» refiriéndose a una estructura que ya nadie llenaba.
       *
       * `evaluarProntitud` → `aplanarCotizacion` resuelve ambas rutas con la
       * precedencia probada, y su condición es la que el cliente definió para
       * consolidar: todos los conceptos con proveedor y monto. Un solo lector
       * para una sola pregunta; si mañana aparece una ruta C, se arregla en el
       * adaptador y no aquí.
       */
      validar: q => {
        // Un servicio sin líneas es invisible para la vista plana: se pregunta
        // aparte, o una multimodal a medio cotizar pasaría como completa.
        const vacios = serviciosSinLineas(q);
        if (vacios.length > 0) {
          return `El servicio «${vacios[0].tipo}» no tiene ningún concepto con proveedor todavía.`;
        }
        const p = evaluarProntitud(q);
        if (p.lista) return null;
        if (!p.conConceptos) return 'Esta cotización no tiene conceptos que consolidar.';
        return `${resumenFaltantes(p)}. Completa proveedor y costo antes de consolidar.`;
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
      /*
       * 1b · Antes solo 'ventas'. En la práctica eso significaba «solo la
       * persona de Ventas», y dejaba trabada una categoría entera: los
       * clientes de oficina y los agentes de carga no tienen vendedor
       * asignado. También trababa la cotización cuando el vendedor estaba de
       * vacaciones. El modelo de equipos viene después; esto es el arreglo
       * inmediato. Los frenos de cliente vinculado y expediente no cambian.
       */
      roles: ['ventas', 'pricing', 'admin'],
    },
    {
      // Recotizar: Pricing corrige la consolidación
      hacia: 'cotizaciones_recibidas',
      roles: ['pricing', 'admin'],
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'pricing', 'admin'],
    },
  ],

  // ── 6. Enviada al cliente (enviada) ─────────────────────────────────────────
  enviada_cliente: [
    {
      hacia: 'negociacion',
      // 1b · misma razón que enviar: sin vendedor asignado, nadie más podía.
      roles: ['ventas', 'pricing', 'admin'],
    },
    {
      // 'pricing' incluido por §4.1: Pricing abre cotizaciones directas de
      // clientes y agentes de carga sin pasar por Ventas, así que no puede
      // depender de Ventas para cerrarlas. Corregido el 28-ago-2026.
      hacia: 'ganada',
      roles: ['ventas', 'pricing', 'admin'],
      // Bloque 2a: sin cliente vinculado no se gana. Sin salto para nadie.
      validar: (q, ctx) => razonSinCliente(q)
        ?? (ctx && 'cliente' in ctx ? razonExpediente(q, { cliente: ctx.cliente, rol: ctx.rol, justificacion: ctx.justificacion, saltoPrevio: q.saltoExpediente }) : null),
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'pricing', 'admin'],
    },
    {
      // Devolver: reenviar propuesta corregida (Luis: enviada → cotizada)
      hacia: 'consolidada',
      // 1b · regresar de «enviada al cliente» a consolidada.
      roles: ['ventas', 'pricing', 'admin'],
    },
  ],

  // ── 7. En negociación (enviada) ─────────────────────────────────────────────
  negociacion: [
    {
      // 'pricing' incluido por §4.1: Pricing abre cotizaciones directas de
      // clientes y agentes de carga sin pasar por Ventas, así que no puede
      // depender de Ventas para cerrarlas. Corregido el 28-ago-2026.
      hacia: 'ganada',
      roles: ['ventas', 'pricing', 'admin'],
      // Bloque 2a: sin cliente vinculado no se gana. Sin salto para nadie.
      validar: (q, ctx) => razonSinCliente(q)
        ?? (ctx && 'cliente' in ctx ? razonExpediente(q, { cliente: ctx.cliente, rol: ctx.rol, justificacion: ctx.justificacion, saltoPrevio: q.saltoExpediente }) : null),
    },
    {
      hacia: 'perdida',
      roles: ['ventas', 'pricing', 'admin'],
    },
    {
      // Devolver: reenviar propuesta corregida
      hacia: 'enviada_cliente',
      // 1b · reenviar después de negociar.
      roles: ['ventas', 'pricing', 'admin'],
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
  ctx?: ContextoTransicion,
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
    const msg = def.validar(quote, { ...ctx, rol });
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
  ctx?: ContextoTransicion,
): PipelineStageId[] {
  const salidas = TRANSITIONS[desde] ?? [];
  return salidas
    .filter(def => puedeTransicionarA(desde, def.hacia, rol, quote, ctx).ok)
    .map(def => def.hacia);
}

/**
 * Quién puede ejecutar una transición, sin mirar la cotización.
 *
 * Es para DECIRLO, no para permitirlo: la franja de próximos pasos avisa «le
 * toca a Pricing» cuando el rol que mira la ficha no es el que avanza. Para
 * permitir sigue mandando `puedeTransicionarA`, que además valida el negocio.
 */
export function rolesQuePueden(desde: PipelineStageId, hacia: PipelineStageId): Rol[] {
  const def = (TRANSITIONS[desde] ?? []).find(t => t.hacia === hacia);
  return def ? [...def.roles] : [];
}

/**
 * Todas las salidas de una etapa para un rol, con su veredicto. Para el
 * selector de etapa (Bloque 2a): una transición que el rol SÍ tiene pero la
 * cotización no cumple se muestra deshabilitada con la razón, en vez de
 * esconderse en silencio.
 */
export function salidasPara(
  desde: PipelineStageId,
  rol: Rol,
  quote: KanbanQuote,
  ctx?: ContextoTransicion,
): { hacia: PipelineStageId; ok: boolean; razon: string | null }[] {
  return (TRANSITIONS[desde] ?? [])
    .filter(def => def.roles.includes(rol))
    .map(def => {
      const r = puedeTransicionarA(desde, def.hacia, rol, quote, ctx);
      return { hacia: def.hacia, ok: r.ok, razon: r.ok ? null : (r.razon ?? null) };
    });
}
