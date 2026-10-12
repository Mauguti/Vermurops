/**
 * Tarea 104: la importación con IA entiende «por kg cobrable».
 *
 * Las respuestas del extractor son SINTÉTICAS (con la forma de las reales de
 * docs/fixtures/respuestas-extractor): en el repo no hay un tarifario aéreo
 * real, solo el de ONE, que es marítimo por contenedor.
 */
import { describe, it, expect } from 'vitest';
import {
  validarRespuestaN8N, construirLineasEnRevision, clasificarUnidad, normalizarUnidad,
  pareceAereo, mencionaEscalasKg, motivosNoGuardable, problemasCobrableDeLinea,
} from './importacionTarifas';

const CONCEPTOS = [{ id: 'CON-001', nombre: 'Flete aéreo', activo: true }, { id: 'CON-002', nombre: 'Flete marítimo', activo: true }] as never;
const catalogos = { conceptos: CONCEPTOS, puertos: [] };

const linea = (o: Record<string, unknown>) => ({
  lineaId: 'tmp-1', concepto: 'Flete aéreo', monto: 4.2, moneda: 'USD', ...o,
});
const respuesta = (extra: Record<string, unknown>, tarifas: unknown[]) => ({
  ok: true, confianza: 'alta', tarifas, ...extra,
});
const revisar = (r: unknown) => {
  const v = validarRespuestaN8N(r);
  expect(v.valida).toBe(true);
  return construirLineasEnRevision(v.datos!, catalogos);
};

// Tarifario aéreo con escalas: el precio por kg baja al subir el peso.
const AEREO = respuesta({ proveedor: 'Aerolínea Demo', observaciones: 'Tarifa de flete aéreo, AWB' }, [
  linea({ lineaId: 'a1', unidad: 'kg', monto: 5.1, montoMinimo: 85, condiciones: 'Hasta 45 kg' }),
  linea({ lineaId: 'a2', unidad: 'kg', monto: 4.2, condiciones: '+45 kg' }),
  linea({ lineaId: 'a3', unidad: 'kg', monto: 3.6, condiciones: '+100 kg' }),
  linea({ lineaId: 'a4', unidad: 'peso cobrable', monto: 3.1, condiciones: '+300 kg' }),
]);

// Marítimo por tonelada: «ton» y «tonelada» siguen siendo TON.
const MARITIMO = respuesta({ proveedor: 'Naviera Demo' }, [
  linea({ lineaId: 'm1', concepto: 'Flete marítimo', unidad: 'ton', monto: 38 }),
  linea({ lineaId: 'm2', concepto: 'Flete marítimo', unidad: 'tonelada', monto: 40 }),
  linea({ lineaId: 'm3', concepto: 'Flete marítimo', unidad: 'TM', monto: 41 }),
]);

// Ambiguo: dice «kg» y nada en el documento aclara si es aéreo o por tonelada.
const AMBIGUO = respuesta({ proveedor: 'Transportes Demo' }, [
  linea({ lineaId: 'x1', concepto: 'Flete', unidad: 'kg', monto: 0.8 }),
  linea({ lineaId: 'x2', concepto: 'Flete', unidad: 'peso', monto: 0.7 }),
]);

describe('tarifario aéreo con escalas', () => {
  const ls = revisar(AEREO);
  it('«kg», «peso cobrable» → KG_COBRABLE', () => {
    expect(ls.map(l => l.unidad)).toEqual(['KG_COBRABLE', 'KG_COBRABLE', 'KG_COBRABLE', 'KG_COBRABLE']);
    expect(ls.every(l => !l.unidadAmbigua)).toBe(true);
  });
  it('detecta lo aéreo por el contexto del documento', () => {
    expect(ls.every(l => l.aereoDetectado)).toBe(true);
  });
  it('nada nace confirmado: la unidad pide confirmación explícita', () => {
    expect(ls.every(l => !l.unidadConfirmada)).toBe(true);
    expect(motivosNoGuardable(ls[0])).toContain('unidad_sin_confirmar');
  });
  it('el mínimo del extractor viaja en la línea', () => {
    expect(ls[0].montoMinimo).toBe(85);
  });
  it('aéreo sin factor es guardable (rige el 167)', () => {
    const l = { ...ls[1], unidadConfirmada: true, monedaConfirmada: true, conceptoId: 'CON-001', nivelConcepto: 'exacto' as const };
    expect(motivosNoGuardable(l)).toEqual([]);
  });
});

describe('«kg» con escalas pero sin contexto aéreo', () => {
  it('las escalas por kg bastan para decidir', () => {
    const ls = revisar(respuesta({}, [linea({ concepto: 'Flete', unidad: 'kg', condiciones: '+45 kg' })]));
    expect(ls[0].unidad).toBe('KG_COBRABLE');
    expect(ls[0].aereoDetectado).toBeUndefined();
  });
  it('sin factor y sin aéreo NO se puede guardar: terrestre no tiene default', () => {
    const [l] = revisar(respuesta({}, [linea({ concepto: 'Flete', unidad: 'kg', condiciones: '+45 kg' })]));
    const lista = { ...l, unidadConfirmada: true, monedaConfirmada: true, conceptoId: 'CON-001', nivelConcepto: 'exacto' as const };
    expect(motivosNoGuardable(lista)).toEqual(['cobrable_incompleto']);
    expect(problemasCobrableDeLinea(lista).join(' ')).toMatch(/factor/i);
    expect(motivosNoGuardable({ ...lista, factorVolumetricoKgM3: 333 })).toEqual([]);
  });
  it('escalas que vienen estructuradas del extractor se conservan, ordenadas y sin basura', () => {
    const ls = revisar(respuesta({}, [linea({
      concepto: 'Flete', unidad: 'kg', escalas: [{ desdeKg: 100, monto: 3 }, { desdeKg: 45, monto: 4 }, { desdeKg: 0, monto: 9 }, { desdeKg: 'x', monto: 1 }],
    })]));
    expect(ls[0].unidad).toBe('KG_COBRABLE');
    expect(ls[0].escalas).toEqual([{ desdeKg: 45, monto: 4 }, { desdeKg: 100, monto: 3 }]);
  });
});

describe('marítimo por tonelada', () => {
  it('ton, tonelada y TM siguen siendo TON', () => {
    expect(revisar(MARITIMO).map(l => l.unidad)).toEqual(['TON', 'TON', 'TON']);
  });
  it('no marca nada de kg cobrable', () => {
    const ls = revisar(MARITIMO);
    expect(ls.every(l => !l.escalas && !l.aereoDetectado && !l.unidadAmbigua)).toBe(true);
  });
});

describe('ambiguo: se marca para revisión en vez de adivinar', () => {
  const ls = revisar(AMBIGUO);
  it('«kg» y «peso» sin contexto quedan sin unidad y marcados', () => {
    expect(ls.map(l => l.unidad)).toEqual([null, null]);
    expect(ls.every(l => l.unidadAmbigua)).toBe(true);
  });
  it('bloquean el guardado con «Falta la unidad»', () => {
    expect(motivosNoGuardable(ls[0])).toContain('sin_unidad');
  });
  it('una unidad desconocida NO es ambigua: simplemente no se reconoce', () => {
    expect(clasificarUnidad('por bulto')).toEqual({ unidad: null, ambigua: false });
  });
});

describe('clasificarUnidad', () => {
  it.each(['chargeable', 'CW', 'peso cobrable', 'chargeable weight', 'kg cobrable'])('«%s» es KG_COBRABLE aun sin contexto', t => {
    expect(clasificarUnidad(t).unidad).toBe('KG_COBRABLE');
  });
  it.each(['kg', 'kilo', 'por kg', 'per kg', 'peso'])('«%s» depende del contexto', t => {
    expect(clasificarUnidad(t)).toEqual({ unidad: null, ambigua: true });
    expect(clasificarUnidad(t, { aereo: true }).unidad).toBe('KG_COBRABLE');
    expect(clasificarUnidad(t, { escalas: true }).unidad).toBe('KG_COBRABLE');
  });
  it.each(['ton', 'tonelada', 'toneladas', 'TM'])('«%s» es TON siempre, incluso en contexto aéreo', t => {
    expect(clasificarUnidad(t, { aereo: true }).unidad).toBe('TON');
  });
  it('normalizarUnidad conserva su forma de siempre', () => {
    expect(normalizarUnidad('contenedor')).toBe('CONTENEDOR');
    expect(normalizarUnidad('kg')).toBeNull();
  });
});

describe('detección de contexto', () => {
  it('lo aéreo', () => {
    expect(pareceAereo('Flete aéreo MEX-LAX')).toBe(true);
    expect(pareceAereo('Air freight rates')).toBe(true);
    expect(pareceAereo('AWB fee')).toBe(true);
    expect(pareceAereo('Flete marítimo', 'Hairdresser')).toBe(false);
  });
  it('las escalas por kg', () => {
    expect(mencionaEscalasKg('+45 kg')).toBe(true);
    expect(mencionaEscalasKg('+100')).toBe(true);
    expect(mencionaEscalasKg('100 kg+')).toBe(true);
    expect(mencionaEscalasKg('45+')).toBe(true);
    expect(mencionaEscalasKg('Hasta 45 kg')).toBe(false);
    expect(mencionaEscalasKg('1+1 gratis')).toBe(false);
    expect(mencionaEscalasKg(undefined, '')).toBe(false);
  });
});
