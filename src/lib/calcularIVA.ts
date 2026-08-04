// ============================================================
// calcularIVA.ts — Función pura para derivar IVA de un concepto
//
// Reglas de negocio confirmadas en sesión de levantamiento:
//   espejo:  16% si (impo+destino) o (expo+origen); 0% en caso contrario
//   aereo_split:  25% al 16% + 75% al 0%  (tasa efectiva ~4%)
//   terrestre_retencion:  16% + retención 4%
//   exento / fijo0:  siempre 0%
//   fijo16:  siempre 16%
//   revisar:  null (captura manual)
// ============================================================

import type { ReglaIVA } from '../components/conceptos/ConceptosData';

// ─── Tipos de entrada/salida ────────────────────────────────────────────────────

export interface ContextoIVA {
  trafico: 'impo' | 'expo';
  ubicacion: 'origen' | 'destino';
}

export interface SplitLinea {
  porcentaje: number;  // % del monto base que lleva esta tasa (25, 75)
  tasa: number;        // tasa de IVA (16, 0)
}

export interface ResultadoIVA {
  tasa: number;
  retencion?: number;
  split?: SplitLinea[];
}

// ─── Función principal ──────────────────────────────────────────────────────────

/**
 * Calcula el IVA aplicable a un concepto dado su tráfico y ubicación.
 *
 * Devuelve null si reglaIVA === 'revisar' (captura manual).
 */
export function calcularIVA(
  reglaIVA: ReglaIVA,
  contexto: ContextoIVA,
): ResultadoIVA | null {
  switch (reglaIVA) {
    case 'espejo': {
      // 16% donde el servicio ocurre en México:
      //   Impo + Destino (mercancía llega a MX)
      //   Expo + Origen  (mercancía sale de MX)
      const enMexico =
        (contexto.trafico === 'impo' && contexto.ubicacion === 'destino') ||
        (contexto.trafico === 'expo' && contexto.ubicacion === 'origen');
      return { tasa: enMexico ? 16 : 0 };
    }

    case 'aereo_split':
      // El SAT no admite 4% directo: se factura en 2 líneas
      return {
        tasa: 4, // tasa efectiva (referencia)
        split: [
          { porcentaje: 25, tasa: 16 },
          { porcentaje: 75, tasa: 0 },
        ],
      };

    case 'terrestre_retencion':
      return { tasa: 16, retencion: 4 };

    case 'exento':
      return { tasa: 0 };

    case 'fijo0':
      return { tasa: 0 };

    case 'fijo16':
      return { tasa: 16 };

    case 'revisar':
      return null;
  }
}
