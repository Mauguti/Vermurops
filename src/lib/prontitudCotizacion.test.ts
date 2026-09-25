/**
 * prontitudCotizacion.test.ts
 *
 * BC-1. Lo que estos tests protegen: que un botón solo aparezca cuando puede
 * cumplir su promesa, y que cuando no aparezca se sepa por qué.
 *
 * «Marcar ganada» es el caso crítico: de esa transición nace el embarque
 * heredando los cargos. Si falta un costo, el embarque nace mal y nadie se
 * entera hasta pagarle al proveedor.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluarProntitud, faltantesDeLinea, textoFaltante,
  resumenFaltantes, faltantesPorLinea, textoFaltantesLinea,
} from './prontitudCotizacion';
import { LineaPlana } from './lineasCotizacion';
import {
  KanbanQuote, ServicioSolicitado, ConceptoCotizacion, CotizacionProveedor,
} from '../components/quotes/QuotesData';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function tarifa(p: Partial<CotizacionProveedor> & { id: string; monto: number }): CotizacionProveedor {
  return { proveedor: 'Maersk', contacto: 'C', moneda: 'USD', seleccionada: false, ...p } as CotizacionProveedor;
}
function concepto(p: Partial<ConceptoCotizacion> & { id: string; nombre: string }): ConceptoCotizacion {
  return { costo: 0, profit: 0, venta: 0, margen: 0, subconceptos: [], tarifas: [], proveedoresOficialIds: [], ...p } as ConceptoCotizacion;
}
function servicio(conceptos: ConceptoCotizacion[]): ServicioSolicitado {
  return {
    id: 'srv-1', tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' },
    incoterm: 'FOB', mercancia: 'General', peso: 1000, volumen: 10, estado: 'cotizado',
    cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos,
  } as ServicioSolicitado;
}
function quote(conceptos: ConceptoCotizacion[]): KanbanQuote {
  return {
    id: 'COT-1', etapa: 'consolidada',
    prospecto: { empresa: 'Alfa', contacto: 'A', telefono: '', email: '', origen: 'web' },
    vendedorId: 'v', pricingId: 'p', servicios: conceptos.length ? [servicio(conceptos)] : [],
    valorTotalConsolidado: 0, moneda: 'USD', estadoFinal: null, motivoPerdida: null,
    createdAt: '', updatedAt: '', historialEtapas: [], actividades: [], chat: [],
  } as KanbanQuote;
}

/** Concepto completo: con catálogo, tarifa elegida y monto. */
const COMPLETO = concepto({
  id: 'c1', nombre: 'Flete marítimo', conceptoId: 'CON-001', profit: 500,
  tarifas: [tarifa({ id: 't1', monto: 2000, proveedorId: 'PRV-1' })],
  proveedoresOficialIds: ['t1'],
});

describe('una cotización completa está lista', () => {
  it('sin faltantes', () => {
    const p = evaluarProntitud(quote([COMPLETO]));
    expect(p.lista).toBe(true);
    expect(p.conConceptos).toBe(true);
    expect(p.faltantes).toEqual([]);
    expect(p.lineasCompletas).toBe(1);
  });

  it('resumenFaltantes no dice nada cuando no falta nada', () => {
    expect(resumenFaltantes(evaluarProntitud(quote([COMPLETO])))).toBe('');
  });
});

describe('una cotización vacía', () => {
  const p = () => evaluarProntitud(quote([]));

  it('no tiene conceptos, así que no se puede enviar a Pricing', () => {
    expect(p().conConceptos).toBe(false);
  });

  it('tampoco está lista', () => {
    expect(p().lista).toBe(false);
  });

  it('lo dice con sus palabras, no con un hueco', () => {
    expect(resumenFaltantes(p())).toBe('Esta cotización todavía no tiene conceptos.');
  });
});

describe('qué bloquea que esté lista', () => {
  it('un concepto sin proveedor', () => {
    const sinProv = concepto({ id: 'c2', nombre: 'Maniobras', conceptoId: 'CON-002', costo: 500 });
    const p = evaluarProntitud(quote([sinProv]));
    expect(p.lista).toBe(false);
    expect(p.faltantes.map(f => f.tipo)).toContain('sin_proveedor');
  });

  it('1a · una línea de pura venta NO bloquea, y se avisa', () => {
    // El caso de producción: «Documentation», venta 50, sin costo y sin
    // proveedor. Es un concepto que Vermur cobra y no le paga a nadie.
    const soloVenta = concepto({ id: 'c3', nombre: 'Documentation', conceptoId: 'CON-003', profit: 50 });
    const p = evaluarProntitud(quote([soloVenta]));
    expect(p.lista).toBe(true);
    expect(p.faltantes).toHaveLength(0);
    expect(p.avisos.map(a => a.tipo)).toEqual(['venta_sin_costo']);
  });

  it('1a · un proveedor sin costo capturado SÍ bloquea', () => {
    // Lo que `sin_monto` siempre protegió: un costo que se quedó a medias
    // hace nacer el embarque mal y nadie se entera hasta pagarle al proveedor.
    const aMedias = concepto({
      id: 'c3b', nombre: 'Seguro', conceptoId: 'CON-003', profit: 100,
      tarifas: [tarifa({ id: 't3b', monto: 0, proveedorId: 'PRV-3' })],
    });
    const p = evaluarProntitud(quote([aMedias]));
    expect(p.faltantes.map(f => f.tipo)).not.toContain('sin_proveedor');
  });

  it('un concepto SIN conceptoId del catálogo también bloquea', () => {
    // Es el agujero de CC-1..CC-4: la línea sería un texto suelto que ninguna
    // tarifa puede encontrar.
    const suelto = concepto({
      id: 'c4', nombre: 'Almajenaje', costo: 300,
      tarifas: [tarifa({ id: 't4', monto: 300, proveedorId: 'PRV-9' })],
      proveedoresOficialIds: ['t4'],
    });
    const p = evaluarProntitud(quote([suelto]));
    expect(p.lista).toBe(false);
    expect(p.faltantes.map(f => f.tipo)).toContain('sin_concepto');
  });

  it('una sola línea incompleta tumba toda la cotización', () => {
    const incompleto = concepto({ id: 'c5', nombre: 'Almacenaje', conceptoId: 'CON-005' });
    const p = evaluarProntitud(quote([COMPLETO, incompleto]));
    expect(p.lista).toBe(false);
    expect(p.lineasCompletas).toBe(1);
    expect(p.totalLineas).toBe(2);
  });
});

describe('a una línea le puede faltar más de una cosa', () => {
  const pelado = concepto({ id: 'c6', nombre: 'Gestoría' });

  it('una línea sin nada acumula concepto y monto', () => {
    // Ya no acumula `sin_proveedor`: sin costo, no hay a quién pagarle, así
    // que exigir proveedor era pedir un dato que no significa nada (1a).
    const p = evaluarProntitud(quote([pelado]));
    const tipos = p.faltantes.map(f => f.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['sin_concepto', 'sin_monto']));
    expect(tipos).not.toContain('sin_proveedor');
  });

  it('el resumen cuenta CONCEPTOS, no faltantes', () => {
    // Decir «faltan 3» cuando es 1 concepto confunde más de lo que informa.
    expect(resumenFaltantes(evaluarProntitud(quote([pelado])))).toBe('Falta 1 concepto por completar');
  });

  it('con dos conceptos incompletos dice dos', () => {
    const otro = concepto({ id: 'c7', nombre: 'Otro' });
    expect(resumenFaltantes(evaluarProntitud(quote([pelado, otro]))))
      .toBe('Faltan 2 conceptos por completar');
  });

  it('los agrupa por línea para no repetir el nombre', () => {
    const grupos = faltantesPorLinea(evaluarProntitud(quote([pelado])));
    expect(grupos).toHaveLength(1);
    expect(grupos[0].concepto).toBe('Gestoría');
    expect(grupos[0].tipos).toHaveLength(2);
  });
});

describe('algunProveedor: hay respuestas que registrar', () => {
  it('false cuando ninguna línea tiene proveedor', () => {
    const sin = concepto({ id: 'c8', nombre: 'Maniobras', conceptoId: 'CON-008', costo: 100 });
    expect(evaluarProntitud(quote([sin])).algunProveedor).toBe(false);
  });

  it('true en cuanto una lo tenga, aunque las demás no', () => {
    const sin = concepto({ id: 'c9', nombre: 'Maniobras', conceptoId: 'CON-009' });
    expect(evaluarProntitud(quote([COMPLETO, sin])).algunProveedor).toBe(true);
  });
});

describe('textos para el bloque que sustituye al botón', () => {
  it('nombra el concepto y qué le falta', () => {
    expect(textoFaltante({ lineaId: 'x', concepto: 'Maniobras de descarga', tipo: 'sin_proveedor' }))
      .toBe('Maniobras de descarga — sin proveedor');
  });

  it('una línea sin nombre no queda en blanco', () => {
    const anonimo = concepto({ id: 'c10', nombre: '' });
    expect(evaluarProntitud(quote([anonimo])).faltantes[0].concepto).toBe('(sin nombre)');
  });

  it('varios faltantes se leen como frase, no como lista de códigos', () => {
    expect(textoFaltantesLinea(['sin_proveedor', 'sin_monto']))
      .toBe('sin proveedor y sin costo capturado');
    expect(textoFaltantesLinea(['sin_concepto', 'sin_proveedor', 'sin_monto']))
      .toBe('sin concepto del catálogo, sin proveedor y sin costo capturado');
    expect(textoFaltantesLinea(['sin_monto'])).toBe('sin costo capturado');
  });
});

describe('faltantesDeLinea sobre la línea plana', () => {
  const base = {
    id: 'l', conceptoId: 'CON-1', proveedorNombre: 'Maersk',
    costo: 100, costoCapturado: true,
  } as LineaPlana;

  it('completa no tiene faltantes', () => {
    expect(faltantesDeLinea(base)).toEqual([]);
  });

  it('un cero DECLARADO no cuenta como faltante', () => {
    expect(faltantesDeLinea({ ...base, costo: 0, costoCapturado: true })).not.toContain('sin_monto');
  });

  it('un costo sin capturar sí', () => {
    expect(faltantesDeLinea({ ...base, costo: 0, costoCapturado: false })).toContain('sin_monto');
  });

  it('un proveedor con solo espacios no cuenta', () => {
    expect(faltantesDeLinea({ ...base, proveedorNombre: '   ' })).toContain('sin_proveedor');
  });

  it('un costo no numérico cuenta como faltante aunque diga capturado', () => {
    expect(faltantesDeLinea({ ...base, costo: NaN })).toContain('sin_monto');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cero capturado vs. campo vacío.
//
// «A veces hay que poner el segundo concepto con pérdida, y el profit
// ponérselo al flete internacional». Un concepto absorbido, una cortesía o uno
// puesto con pérdida a propósito valen cero y son válidos. Lo que bloquea es
// que NADIE haya capturado el costo.
// ─────────────────────────────────────────────────────────────────────────────
describe('costo cero: decisión, no olvido', () => {
  const enCero = concepto({
    id: 'z1', nombre: 'Cortesía', conceptoId: 'CON-Z', profit: 0,
    costo: 0, costoCapturado: true,
    tarifas: [], proveedoresOficialIds: [],
  });

  it('un cero DECLARADO no bloquea, si tiene proveedor', () => {
    // Se le pone proveedor aparte: el cero es sobre el costo, no sobre quién presta.
    const conProv = { ...enCero, tarifas: [tarifa({ id: 'tz', monto: 0, proveedorId: 'PRV-Z' })], proveedoresOficialIds: ['tz'] };
    const p = evaluarProntitud(quote([conProv as typeof enCero]));
    expect(p.faltantes.map(f => f.tipo)).not.toContain('sin_monto');
  });

  it('un cero SIN capturar sí bloquea', () => {
    const sinCapturar = concepto({ id: 'z2', nombre: 'Olvidado', conceptoId: 'CON-Y', costo: 0 });
    expect(evaluarProntitud(quote([sinCapturar])).faltantes.map(f => f.tipo))
      .toContain('sin_monto');
  });

  it('un concepto recién creado bloquea: nace en cero sin la marca', () => {
    const nuevo = concepto({ id: 'z3', nombre: '', conceptoId: undefined });
    expect(evaluarProntitud(quote([nuevo])).faltantes.map(f => f.tipo)).toContain('sin_monto');
  });

  it('fallback para lo anterior a la marca: un costo > 0 cuenta como capturado', () => {
    // Los conceptos guardados antes de que existiera costoCapturado no la
    // traen, y no deben empezar a bloquear de un día para otro.
    const legacy = concepto({
      id: 'z4', nombre: 'Viejo', conceptoId: 'CON-X', costo: 500,
      tarifas: [tarifa({ id: 'tv', monto: 500, proveedorId: 'PRV-V' })],
      proveedoresOficialIds: ['tv'],
    });
    expect(evaluarProntitud(quote([legacy])).lista).toBe(true);
  });

  it('el texto dice «sin costo capturado», no «sin monto»', () => {
    // «Sin monto» suena a que el número está mal; lo que falta es capturarlo.
    const sinCapturar = concepto({ id: 'z5', nombre: 'Algo', conceptoId: 'CON-W' });
    const f = evaluarProntitud(quote([sinCapturar])).faltantes.find(x => x.tipo === 'sin_monto')!;
    expect(textoFaltante(f)).toContain('sin costo capturado');
  });
});
