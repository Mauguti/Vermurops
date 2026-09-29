/**
 * diasLibres.ts — Días libres de demora y almacenaje (tarea 08, 28-sep-2026).
 *
 * Pricing captura los días libres en la cotización; Operaciones ve la FECHA
 * LÍMITE = ETA + días, calculada, no guardada. Al pasar, empiezan a correr
 * los cargos.
 *
 * «No confundir con los días de crédito del cliente: son cosas distintas y ya
 * hubo confusión en la sesión con Vermur.» Los días de crédito son plazo de
 * pago; los días libres son plazo del contenedor en puerto o almacén.
 *
 * Lógica pura: sin React ni Firestore.
 */

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Días libres de almacenaje sugeridos (tarea 08: «7 días sugeridos para todos»). */
export const ALMACENAJE_SUGERIDO = 7;

/** Demoras: no hay default — varían por cotización, típicamente hasta 21. */

// ─── Cálculo de fecha límite ─────────────────────────────────────────────────

/**
 * Suma días calendario a una fecha ISO (YYYY-MM-DD).
 *
 * No usa horas ni zonas horarias: opera con la fecha como está. Si la fecha
 * es inválida o los días son negativos, devuelve null.
 */
export function sumarDias(fechaISO: string, dias: number): string | null {
  if (!fechaISO || dias < 0) return null;
  const ms = Date.parse(fechaISO);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Calcula la fecha límite de demora o almacenaje.
 *
 * - Si hay ETA y días → fecha calculada.
 * - Si falta alguno → null.
 */
export function fechaLimite(
  eta: string | undefined | null,
  diasLibres: number | undefined | null,
): string | null {
  if (!eta || diasLibres == null || diasLibres < 0) return null;
  return sumarDias(eta, diasLibres);
}

// ─── Estado para la UI ───────────────────────────────────────────────────────

export type OrigenDiasLibres = 'cotizacion' | 'manual' | 'ninguno';

export interface InfoDiasLibres {
  demora: {
    dias: number | null;
    fechaLimite: string | null;
    origen: OrigenDiasLibres;
  };
  almacenaje: {
    dias: number | null;
    fechaLimite: string | null;
    origen: OrigenDiasLibres;
  };
}

/**
 * Resuelve los días libres y las fechas límite del embarque.
 *
 * Prioridad: lo capturado en el embarque (manual) > lo heredado de la
 * cotización. Si no hay nada, `origen: 'ninguno'` y la UI dice
 * «la cotización no trae días libres».
 */
export function resolverDiasLibres(
  embarque: {
    diasLibresDemora?: number | null;
    diasLibresAlmacenaje?: number | null;
    fechas: { arribo: string };
  },
  cotizacion?: {
    diasLibresDemora?: number | null;
    diasLibresAlmacenaje?: number | null;
  } | null,
): InfoDiasLibres {
  const eta = embarque.fechas.arribo;

  const diasDemora = embarque.diasLibresDemora ?? cotizacion?.diasLibresDemora ?? null;
  const diasAlm = embarque.diasLibresAlmacenaje ?? cotizacion?.diasLibresAlmacenaje ?? null;

  return {
    demora: {
      dias: diasDemora,
      fechaLimite: fechaLimite(eta, diasDemora),
      origen: embarque.diasLibresDemora != null ? 'manual'
        : cotizacion?.diasLibresDemora != null ? 'cotizacion'
        : 'ninguno',
    },
    almacenaje: {
      dias: diasAlm,
      fechaLimite: fechaLimite(eta, diasAlm),
      origen: embarque.diasLibresAlmacenaje != null ? 'manual'
        : cotizacion?.diasLibresAlmacenaje != null ? 'cotizacion'
        : 'ninguno',
    },
  };
}

/**
 * ¿Ya pasó la fecha límite?
 *
 * Sirve para pintar en rojo: «Demora vencida hace 3 días».
 */
export function diasVencidos(
  fechaLimiteISO: string | null,
  hoy?: string,
): number | null {
  if (!fechaLimiteISO) return null;
  const ref = hoy ?? new Date().toISOString().slice(0, 10);
  const diff = Date.parse(ref) - Date.parse(fechaLimiteISO);
  if (Number.isNaN(diff)) return null;
  return Math.floor(diff / 86_400_000);
}
