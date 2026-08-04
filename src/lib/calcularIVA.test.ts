import { describe, it, expect } from 'vitest';
import { calcularIVA, ContextoIVA, ResultadoIVA } from './calcularIVA';
import type { ReglaIVA } from '../components/conceptos/ConceptosData';

// ─── Helpers ────────────────────────────────────────────────────────────────────

const impoDestino: ContextoIVA = { trafico: 'impo', ubicacion: 'destino' };
const impoOrigen: ContextoIVA = { trafico: 'impo', ubicacion: 'origen' };
const expoOrigen: ContextoIVA = { trafico: 'expo', ubicacion: 'origen' };
const expoDestino: ContextoIVA = { trafico: 'expo', ubicacion: 'destino' };

// ═════════════════════════════════════════════════════════════════════════════════
// REGLA ESPEJO — la más importante (4 combinaciones)
//
// Conceptos reales: Maneuvers (CON-009), Customs Clearance (CON-005)
// Regla: 16% donde el servicio ocurre en México, 0% en el extranjero.
//   Impo + Destino → México → 16%
//   Impo + Origen  → extranjero → 0%
//   Expo + Origen  → México → 16%
//   Expo + Destino → extranjero → 0%
// ═════════════════════════════════════════════════════════════════════════════════

describe('calcularIVA — regla espejo', () => {
  const regla: ReglaIVA = 'espejo';

  it('impo + destino → 16% (servicio en México)', () => {
    const r = calcularIVA(regla, impoDestino);
    expect(r).toEqual({ tasa: 16 });
  });

  it('impo + origen → 0% (servicio en el extranjero)', () => {
    const r = calcularIVA(regla, impoOrigen);
    expect(r).toEqual({ tasa: 0 });
  });

  it('expo + origen → 16% (servicio en México)', () => {
    const r = calcularIVA(regla, expoOrigen);
    expect(r).toEqual({ tasa: 16 });
  });

  it('expo + destino → 0% (servicio en el extranjero)', () => {
    const r = calcularIVA(regla, expoDestino);
    expect(r).toEqual({ tasa: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// CASOS ESPECIALES
// ═════════════════════════════════════════════════════════════════════════════════

describe('calcularIVA — aereo_split (Air Freight CON-021)', () => {
  const regla: ReglaIVA = 'aereo_split';

  it('devuelve split con 25% al 16% y 75% al 0%', () => {
    const r = calcularIVA(regla, impoDestino);
    expect(r).not.toBeNull();
    expect(r!.split).toEqual([
      { porcentaje: 25, tasa: 16 },
      { porcentaje: 75, tasa: 0 },
    ]);
  });

  it('tasa efectiva es 4% (referencia)', () => {
    const r = calcularIVA(regla, impoDestino);
    expect(r!.tasa).toBe(4);
  });

  it('el resultado es el mismo sin importar el contexto', () => {
    const r1 = calcularIVA(regla, impoDestino);
    const r2 = calcularIVA(regla, expoOrigen);
    const r3 = calcularIVA(regla, impoOrigen);
    const r4 = calcularIVA(regla, expoDestino);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
    expect(r3).toEqual(r4);
  });
});

describe('calcularIVA — terrestre_retencion (Inland Freight CON-008)', () => {
  const regla: ReglaIVA = 'terrestre_retencion';

  it('devuelve tasa 16% con retención 4%', () => {
    const r = calcularIVA(regla, impoDestino);
    expect(r).toEqual({ tasa: 16, retencion: 4 });
  });

  it('el resultado es el mismo sin importar el contexto', () => {
    const r1 = calcularIVA(regla, impoDestino);
    const r2 = calcularIVA(regla, expoDestino);
    expect(r1).toEqual(r2);
  });
});

describe('calcularIVA — exento (seguros)', () => {
  const regla: ReglaIVA = 'exento';

  it('siempre 0% en cualquier contexto', () => {
    expect(calcularIVA(regla, impoDestino)).toEqual({ tasa: 0 });
    expect(calcularIVA(regla, impoOrigen)).toEqual({ tasa: 0 });
    expect(calcularIVA(regla, expoOrigen)).toEqual({ tasa: 0 });
    expect(calcularIVA(regla, expoDestino)).toEqual({ tasa: 0 });
  });
});

describe('calcularIVA — fijo16 (servicio nacional)', () => {
  const regla: ReglaIVA = 'fijo16';

  it('siempre 16% sin importar el contexto', () => {
    expect(calcularIVA(regla, impoDestino)).toEqual({ tasa: 16 });
    expect(calcularIVA(regla, impoOrigen)).toEqual({ tasa: 16 });
    expect(calcularIVA(regla, expoOrigen)).toEqual({ tasa: 16 });
    expect(calcularIVA(regla, expoDestino)).toEqual({ tasa: 16 });
  });
});

describe('calcularIVA — fijo0 (servicio internacional)', () => {
  const regla: ReglaIVA = 'fijo0';

  it('siempre 0% sin importar el contexto', () => {
    expect(calcularIVA(regla, impoDestino)).toEqual({ tasa: 0 });
    expect(calcularIVA(regla, impoOrigen)).toEqual({ tasa: 0 });
    expect(calcularIVA(regla, expoOrigen)).toEqual({ tasa: 0 });
    expect(calcularIVA(regla, expoDestino)).toEqual({ tasa: 0 });
  });
});

describe('calcularIVA — revisar (captura manual)', () => {
  const regla: ReglaIVA = 'revisar';

  it('devuelve null en cualquier contexto', () => {
    expect(calcularIVA(regla, impoDestino)).toBeNull();
    expect(calcularIVA(regla, impoOrigen)).toBeNull();
    expect(calcularIVA(regla, expoOrigen)).toBeNull();
    expect(calcularIVA(regla, expoDestino)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════════
// BORDES
// ═════════════════════════════════════════════════════════════════════════════════

describe('calcularIVA — casos borde', () => {
  it('espejo con contexto parcial (valores válidos pero concepto solo aplica origen): la función calcula igual', () => {
    // CON-002 Amsat Origin: aplicaOrigen=true, aplicaDestino=false
    // La función NO valida dimensiones del concepto — eso es responsabilidad de la UI.
    // Si le pido destino, la función responde con la regla espejo normal.
    const r = calcularIVA('espejo', { trafico: 'impo', ubicacion: 'destino' });
    expect(r).toEqual({ tasa: 16 });
  });

  it('espejo: contexto con valores válidos siempre devuelve un resultado (nunca null)', () => {
    const r = calcularIVA('espejo', impoDestino);
    expect(r).not.toBeNull();
    expect(typeof r!.tasa).toBe('number');
  });

  it('fijo16 no tiene retencion ni split', () => {
    const r = calcularIVA('fijo16', impoDestino)!;
    expect(r.retencion).toBeUndefined();
    expect(r.split).toBeUndefined();
  });

  it('fijo0 no tiene retencion ni split', () => {
    const r = calcularIVA('fijo0', expoOrigen)!;
    expect(r.retencion).toBeUndefined();
    expect(r.split).toBeUndefined();
  });

  it('exento no tiene retencion ni split', () => {
    const r = calcularIVA('exento', impoOrigen)!;
    expect(r.retencion).toBeUndefined();
    expect(r.split).toBeUndefined();
  });

  it('terrestre_retencion no tiene split', () => {
    const r = calcularIVA('terrestre_retencion', impoDestino)!;
    expect(r.split).toBeUndefined();
  });

  it('aereo_split no tiene retencion', () => {
    const r = calcularIVA('aereo_split', impoDestino)!;
    expect(r.retencion).toBeUndefined();
  });

  it('todas las reglas válidas devuelven el tipo correcto', () => {
    const reglas: ReglaIVA[] = [
      'espejo', 'aereo_split', 'terrestre_retencion',
      'exento', 'fijo16', 'fijo0', 'revisar',
    ];

    for (const regla of reglas) {
      const r = calcularIVA(regla, impoDestino);
      if (regla === 'revisar') {
        expect(r).toBeNull();
      } else {
        expect(r).not.toBeNull();
        expect(typeof r!.tasa).toBe('number');
      }
    }
  });
});
