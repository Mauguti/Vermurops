import { describe, it, expect } from 'vitest';
import { sanitizarParaFirestore } from './sanitizarFirestore';

describe('sanitizarParaFirestore', () => {
  it('quita las claves con undefined', () => {
    expect(sanitizarParaFirestore({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' });
  });

  it('CONSERVA null: en Firestore significa algo distinto a ausente', () => {
    // masterId: null = «este embarque no cuelga de ningún master».
    expect(sanitizarParaFirestore({ masterId: null })).toEqual({ masterId: null });
  });

  it('limpia en profundidad', () => {
    const entrada = {
      cargos: { moneda: 'USD', nota: undefined, detalles: [{ monto: 10, ref: undefined }] },
    };
    expect(sanitizarParaFirestore(entrada)).toEqual({
      cargos: { moneda: 'USD', detalles: [{ monto: 10 }] },
    });
  });

  it('conserva arrays vacíos y objetos vacíos', () => {
    expect(sanitizarParaFirestore({ documentos: [], cierres: {} }))
      .toEqual({ documentos: [], cierres: {} });
  });

  it('no toca valores primitivos ni false ni 0 ni cadena vacía', () => {
    expect(sanitizarParaFirestore({ a: false, b: 0, c: '', d: NaN }))
      .toEqual({ a: false, b: 0, c: '', d: NaN });
  });

  it('deja intactas las instancias de clase, como Date', () => {
    const fecha = new Date('2026-08-28T00:00:00.000Z');
    const salida = sanitizarParaFirestore({ creado: fecha });
    expect(salida.creado).toBeInstanceOf(Date);
    expect(salida.creado.getTime()).toBe(fecha.getTime());
  });

  it('no muta el objeto original', () => {
    const entrada = { a: 1, b: undefined };
    const copia = { ...entrada };
    sanitizarParaFirestore(entrada);
    expect(entrada).toEqual(copia);
    expect('b' in entrada).toBe(true);
  });

  it('un embarque con opcionales sin definir queda escribible', () => {
    const embarque = {
      id: 'SHP-2026-0001',
      masterId: null,
      nombreEmbarque: undefined,
      productos: undefined,
      cargos: { ingresos: 0, detalles: [] },
    };
    const salida = sanitizarParaFirestore(embarque);
    expect(salida).toEqual({
      id: 'SHP-2026-0001',
      masterId: null,
      cargos: { ingresos: 0, detalles: [] },
    });
    expect(JSON.stringify(salida)).not.toContain('undefined');
  });
});
