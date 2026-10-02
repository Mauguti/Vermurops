/**
 * ivaOrdenCompra.test.ts — Tarea 36
 *
 * Cinco casos del negocio:
 *   A. Nacional 16%: fijo16, monto 10,000 → IVA esperado 1,600
 *   B. Extranjero 0%: fijo0, monto 5,000 → IVA esperado 0
 *   C. Aéreo 25/75: aereo_split, monto 8,000 → IVA esperado 320
 *   D. Terrestre con retención: terrestre_retencion, monto 6,000 → IVA 960, ret 240
 *   E. Factura sin IVA declarado: estado sin_capturar
 *
 * Más: tolerancia, espejo sin contexto, concepto sin regla, sin factura.
 */

import { describe, it, expect } from 'vitest';
import {
  ivaEsperadoDeOC,
  compararIVAFactura,
  etiquetaIVA,
  type EstadoIVAOC,
} from './ivaOrdenCompra';
import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';

// Helper: OC mínima con facturaDatos
function ocConFactura(
  monto: number,
  iva: number | null,
  extra: Partial<NonNullable<OrdenCompra['facturaDatos']>> = {},
): Pick<OrdenCompra, 'monto' | 'facturaDatos'> {
  return {
    monto,
    facturaDatos: {
      numero: 'F-001',
      fecha: '2026-10-01',
      emisor: 'Proveedor Test',
      total: iva !== null ? monto + iva : monto,
      subtotal: monto,
      iva,
      moneda: 'MXN',
      documentoId: 'doc-1',
      cotejo: 'coincide',
      ...extra,
    },
  };
}

// ─── A. Nacional 16% (fijo16) ────────────────────────────────────────────────

describe('A · Nacional 16% (fijo16)', () => {
  it('calcula IVA esperado = 1,600 para monto 10,000', () => {
    const r = ivaEsperadoDeOC(10_000, 'fijo16');
    expect(r).not.toBeNull();
    expect(r!.iva).toBe(1_600);
    expect(r!.retencion).toBe(0);
    expect(r!.tasa).toBe(16);
    expect(r!.especial).toBeUndefined();
  });

  it('cuadra cuando la factura declara 1,600', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 1_600), 'fijo16');
    expect(r.estado).toBe('cuadra');
    expect(r.ivaEsperado).toBe(1_600);
    expect(r.ivaDeclarado).toBe(1_600);
    expect(r.mensaje).toBe('');
  });

  it('no cuadra cuando la factura declara 1,200', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 1_200), 'fijo16');
    expect(r.estado).toBe('no_cuadra');
    expect(r.ivaEsperado).toBe(1_600);
    expect(r.ivaDeclarado).toBe(1_200);
    expect(r.mensaje).toContain('1,600');
    expect(r.mensaje).toContain('1,200');
  });
});

// ─── B. Extranjero 0% (fijo0) ───────────────────────────────────────────────

describe('B · Extranjero 0% (fijo0)', () => {
  it('calcula IVA esperado = 0 para monto 5,000', () => {
    const r = ivaEsperadoDeOC(5_000, 'fijo0');
    expect(r).not.toBeNull();
    expect(r!.iva).toBe(0);
    expect(r!.retencion).toBe(0);
    expect(r!.tasa).toBe(0);
  });

  it('cuadra cuando la factura declara 0', () => {
    const r = compararIVAFactura(ocConFactura(5_000, 0), 'fijo0');
    expect(r.estado).toBe('cuadra');
  });

  it('no cuadra si la factura declara 800', () => {
    const r = compararIVAFactura(ocConFactura(5_000, 800), 'fijo0');
    expect(r.estado).toBe('no_cuadra');
    expect(r.ivaEsperado).toBe(0);
    expect(r.ivaDeclarado).toBe(800);
  });
});

// ─── C. Aéreo 25/75 (aereo_split) ───────────────────────────────────────────

describe('C · Aéreo 25/75 (aereo_split)', () => {
  it('calcula IVA esperado = 320 para monto 8,000 (25% × 16%)', () => {
    const r = ivaEsperadoDeOC(8_000, 'aereo_split');
    expect(r).not.toBeNull();
    expect(r!.iva).toBe(320);
    expect(r!.retencion).toBe(0);
    expect(r!.tasa).toBeNull(); // no hay una sola tasa
    expect(r!.especial).toBe('aereo_split');
  });

  it('cuadra cuando la factura declara 320', () => {
    const r = compararIVAFactura(ocConFactura(8_000, 320), 'aereo_split');
    expect(r.estado).toBe('cuadra');
  });

  it('no cuadra si la factura declara 1,280 (16% pleno)', () => {
    const r = compararIVAFactura(ocConFactura(8_000, 1_280), 'aereo_split');
    expect(r.estado).toBe('no_cuadra');
  });
});

// ─── D. Terrestre con retención (terrestre_retencion) ────────────────────────

describe('D · Terrestre con retención (terrestre_retencion)', () => {
  it('calcula IVA 960 y retención 240 para monto 6,000', () => {
    const r = ivaEsperadoDeOC(6_000, 'terrestre_retencion');
    expect(r).not.toBeNull();
    expect(r!.iva).toBe(960);
    expect(r!.retencion).toBe(240);
    expect(r!.tasa).toBe(16);
    expect(r!.especial).toBe('terrestre_retencion');
  });

  it('cuadra cuando la factura declara IVA 960', () => {
    const r = compararIVAFactura(
      ocConFactura(6_000, 960, { retencion: 240 }),
      'terrestre_retencion',
    );
    expect(r.estado).toBe('cuadra');
    expect(r.retencionEsperada).toBe(240);
    expect(r.retencionDeclarada).toBe(240);
  });
});

// ─── E. Factura sin IVA declarado ────────────────────────────────────────────

describe('E · Factura sin IVA declarado', () => {
  it('estado sin_capturar cuando iva es null', () => {
    const r = compararIVAFactura(ocConFactura(10_000, null), 'fijo16');
    expect(r.estado).toBe('sin_capturar');
    expect(r.ivaEsperado).toBe(1_600);
    expect(r.ivaDeclarado).toBeNull();
    expect(r.mensaje).toContain('sin capturar');
  });
});

// ─── Tolerancia ──────────────────────────────────────────────────────────────

describe('Tolerancia', () => {
  it('cuadra con diferencia de 1 peso (dentro de tolerancia mínima)', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 1_601), 'fijo16');
    expect(r.estado).toBe('cuadra');
  });

  it('cuadra con diferencia de centavos', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 1_599.50), 'fijo16');
    expect(r.estado).toBe('cuadra');
  });

  it('no cuadra con diferencia de 10 pesos', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 1_610), 'fijo16');
    expect(r.estado).toBe('no_cuadra');
  });

  it('tolerancia 0.5% se aplica cuando es mayor que 1 peso', () => {
    // monto 100,000 → esperado 16,000 → 0.5% = 80 pesos de tolerancia
    const r = compararIVAFactura(ocConFactura(100_000, 16_079), 'fijo16');
    expect(r.estado).toBe('cuadra');
    const r2 = compararIVAFactura(ocConFactura(100_000, 16_081), 'fijo16');
    expect(r2.estado).toBe('no_cuadra');
  });
});

// ─── Espejo sin contexto ─────────────────────────────────────────────────────

describe('Espejo sin contexto', () => {
  it('ivaEsperadoDeOC devuelve null para espejo', () => {
    expect(ivaEsperadoDeOC(10_000, 'espejo')).toBeNull();
  });

  it('compararIVAFactura devuelve sin_tasa para espejo', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 1_600), 'espejo');
    expect(r.estado).toBe('sin_tasa');
    expect(r.mensaje).toContain('regla espejo');
  });
});

// ─── Revisar ─────────────────────────────────────────────────────────────────

describe('Revisar', () => {
  it('ivaEsperadoDeOC devuelve null para revisar', () => {
    expect(ivaEsperadoDeOC(10_000, 'revisar')).toBeNull();
  });

  it('compararIVAFactura devuelve sin_tasa para revisar', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 0), 'revisar');
    expect(r.estado).toBe('sin_tasa');
    expect(r.mensaje).toContain('captura manual');
  });
});

// ─── Sin concepto ────────────────────────────────────────────────────────────

describe('Sin concepto', () => {
  it('compararIVAFactura con regla null → sin_tasa', () => {
    const r = compararIVAFactura(ocConFactura(10_000, 1_600), null);
    expect(r.estado).toBe('sin_tasa');
  });
});

// ─── Sin factura ─────────────────────────────────────────────────────────────

describe('Sin factura', () => {
  it('compararIVAFactura sin facturaDatos → sin_factura', () => {
    const r = compararIVAFactura({ monto: 10_000, facturaDatos: undefined }, 'fijo16');
    expect(r.estado).toBe('sin_factura');
  });
});

// ─── Exento ──────────────────────────────────────────────────────────────────

describe('Exento', () => {
  it('calcula IVA esperado = 0 y cuadra', () => {
    const r = ivaEsperadoDeOC(3_000, 'exento');
    expect(r).not.toBeNull();
    expect(r!.iva).toBe(0);
    expect(r!.tasa).toBe(0);

    const c = compararIVAFactura(ocConFactura(3_000, 0), 'exento');
    expect(c.estado).toBe('cuadra');
  });
});

// ─── Etiqueta para la bandeja ────────────────────────────────────────────────

describe('etiquetaIVA', () => {
  const casos: [EstadoIVAOC, ReturnType<typeof etiquetaIVA>][] = [
    ['cuadra', 'ok'],
    ['no_cuadra', 'alerta'],
    ['sin_capturar', 'pendiente'],
    ['sin_tasa', 'pendiente'],
    ['sin_factura', null],
  ];

  it.each(casos)('%s → %s', (estado, esperado) => {
    expect(etiquetaIVA(estado)).toBe(esperado);
  });
});
