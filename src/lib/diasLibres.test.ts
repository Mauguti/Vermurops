import { describe, it, expect } from 'vitest';
import {
  sumarDias,
  fechaLimite,
  resolverDiasLibres,
  diasVencidos,
  ALMACENAJE_SUGERIDO,
} from './diasLibres';

// ─── sumarDias ──────────────────────────────────────────────────────────────

describe('sumarDias', () => {
  it('suma días calendario', () => {
    expect(sumarDias('2026-10-01', 7)).toBe('2026-10-08');
  });

  it('cruza cambio de mes', () => {
    expect(sumarDias('2026-10-28', 5)).toBe('2026-11-02');
  });

  it('cruza cambio de año', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('0 días devuelve la misma fecha', () => {
    expect(sumarDias('2026-10-15', 0)).toBe('2026-10-15');
  });

  it('fecha vacía devuelve null', () => {
    expect(sumarDias('', 7)).toBeNull();
  });

  it('fecha inválida devuelve null', () => {
    expect(sumarDias('no-es-fecha', 7)).toBeNull();
  });

  it('días negativos devuelve null', () => {
    expect(sumarDias('2026-10-01', -1)).toBeNull();
  });

  it('21 días (máximo típico de demoras)', () => {
    expect(sumarDias('2026-10-01', 21)).toBe('2026-10-22');
  });
});

// ─── fechaLimite ─────────────────────────────────────────────────────────────

describe('fechaLimite', () => {
  it('calcula con ETA y días', () => {
    expect(fechaLimite('2026-10-15', 14)).toBe('2026-10-29');
  });

  it('sin ETA devuelve null', () => {
    expect(fechaLimite(null, 14)).toBeNull();
    expect(fechaLimite(undefined, 14)).toBeNull();
    expect(fechaLimite('', 14)).toBeNull();
  });

  it('sin días devuelve null', () => {
    expect(fechaLimite('2026-10-15', null)).toBeNull();
    expect(fechaLimite('2026-10-15', undefined)).toBeNull();
  });
});

// ─── resolverDiasLibres ──────────────────────────────────────────────────────

describe('resolverDiasLibres', () => {
  const embarqueBase = {
    fechas: { arribo: '2026-10-15' },
  };

  it('hereda días de la cotización', () => {
    const info = resolverDiasLibres(
      embarqueBase,
      { diasLibresDemora: 21, diasLibresAlmacenaje: 7 },
    );
    expect(info.demora).toEqual({
      dias: 21,
      fechaLimite: '2026-11-05',
      origen: 'cotizacion',
    });
    expect(info.almacenaje).toEqual({
      dias: 7,
      fechaLimite: '2026-10-22',
      origen: 'cotizacion',
    });
  });

  it('los días del embarque mandan sobre la cotización', () => {
    const info = resolverDiasLibres(
      { ...embarqueBase, diasLibresDemora: 14, diasLibresAlmacenaje: 10 },
      { diasLibresDemora: 21, diasLibresAlmacenaje: 7 },
    );
    expect(info.demora.dias).toBe(14);
    expect(info.demora.origen).toBe('manual');
    expect(info.almacenaje.dias).toBe(10);
    expect(info.almacenaje.origen).toBe('manual');
  });

  it('sin cotización y sin días en el embarque: origen ninguno', () => {
    const info = resolverDiasLibres(embarqueBase, null);
    expect(info.demora.origen).toBe('ninguno');
    expect(info.demora.dias).toBeNull();
    expect(info.demora.fechaLimite).toBeNull();
    expect(info.almacenaje.origen).toBe('ninguno');
  });

  it('sin ETA: días resueltos pero sin fecha', () => {
    const info = resolverDiasLibres(
      { fechas: { arribo: '' } },
      { diasLibresDemora: 21, diasLibresAlmacenaje: 7 },
    );
    expect(info.demora.dias).toBe(21);
    expect(info.demora.fechaLimite).toBeNull();
    expect(info.almacenaje.dias).toBe(7);
    expect(info.almacenaje.fechaLimite).toBeNull();
  });

  it('cotización sin días libres: embarque puede capturarlos', () => {
    const info = resolverDiasLibres(
      { ...embarqueBase, diasLibresDemora: 14 },
      { /* cotización sin días */ },
    );
    expect(info.demora.dias).toBe(14);
    expect(info.demora.origen).toBe('manual');
    expect(info.almacenaje.origen).toBe('ninguno');
  });

  it('0 días es un valor válido (sin plazo libre)', () => {
    const info = resolverDiasLibres(
      { ...embarqueBase, diasLibresDemora: 0 },
      { diasLibresDemora: 21 },
    );
    expect(info.demora.dias).toBe(0);
    expect(info.demora.fechaLimite).toBe('2026-10-15'); // la misma ETA
    expect(info.demora.origen).toBe('manual');
  });
});

// ─── diasVencidos ────────────────────────────────────────────────────────────

describe('diasVencidos', () => {
  it('plazo vigente devuelve negativo', () => {
    expect(diasVencidos('2026-10-20', '2026-10-15')).toBe(-5);
  });

  it('plazo vencido devuelve positivo', () => {
    expect(diasVencidos('2026-10-10', '2026-10-15')).toBe(5);
  });

  it('mismo día devuelve 0', () => {
    expect(diasVencidos('2026-10-15', '2026-10-15')).toBe(0);
  });

  it('sin fecha límite devuelve null', () => {
    expect(diasVencidos(null, '2026-10-15')).toBeNull();
  });
});

// ─── Constante ───────────────────────────────────────────────────────────────

describe('ALMACENAJE_SUGERIDO', () => {
  it('es 7', () => {
    expect(ALMACENAJE_SUGERIDO).toBe(7);
  });
});
