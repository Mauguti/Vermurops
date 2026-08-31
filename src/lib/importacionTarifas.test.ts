/**
 * importacionTarifas.test.ts
 *
 * TA-1. El principio que estos tests protegen: n8n EXTRAE Y PROPONE, la app
 * DECIDE Y ESCRIBE. La IA se equivoca, y una tarifa mal cargada no falla — se
 * propaga a cotizaciones reales y de ahí a facturas.
 */

import { describe, it, expect } from 'vitest';
import {
  validarRespuestaN8N, textoDeAviso,
  resolverConcepto, resolverPuerto, resolverProveedor,
  motivosNoGuardable, esGuardable, resumenRevision, ordenarParaRevision,
  vigenciasSeTraslapan, detectarColisiones,
  LineaEnRevision,
} from './importacionTarifas';
import { TarifaVermur } from '../components/tarifas/TarifasData';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CONCEPTOS = [
  { id: 'CON-001', nombre: 'Flete marítimo' },
  { id: 'CON-002', nombre: 'Almacenaje IN' },
  { id: 'CON-003', nombre: 'Almacenaje OUT' },
  { id: 'CON-004', nombre: 'Maniobras de descarga' },
];

const PUERTOS = [
  { id: 'PTO-001', nombre: 'Manzanillo', codigo: 'MZO' },
  { id: 'PTO-002', nombre: 'Shanghai', codigo: 'SHA' },
  { id: 'PTO-003', nombre: 'Lázaro Cárdenas', codigo: 'LZC' },
];

const PROVEEDORES = [
  { id: 'PRV-001', nombre: 'Sunway Logistics' },
  { id: 'PRV-002', nombre: 'Maersk México' },
];

const respuestaOk = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  proveedor: 'Sunway Logistics',
  vigenciaTexto: 'válido hasta el 15 de septiembre',
  fechaInicio: '2026-08-01',
  fechaFin: '2026-09-15',
  confianza: 'alta',
  tarifas: [
    { lineaId: 'tmp-1', concepto: 'Flete marítimo', monto: 1200, moneda: 'USD', unidad: 'contenedor' },
  ],
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
describe('la frontera con n8n: se valida, no se confía', () => {
  it('acepta una respuesta bien formada', () => {
    const r = validarRespuestaN8N(respuestaOk());
    expect(r.valida).toBe(true);
    expect(r.datos?.tarifas).toHaveLength(1);
  });

  it('rechaza lo que no es un objeto', () => {
    expect(validarRespuestaN8N('boom').valida).toBe(false);
    expect(validarRespuestaN8N(null).valida).toBe(false);
    expect(validarRespuestaN8N([]).valida).toBe(false);
  });

  it('rechaza ok:false y muestra el error del agente', () => {
    const r = validarRespuestaN8N({ ok: false, error: 'PDF ilegible' });
    expect(r.valida).toBe(false);
    expect(r.motivo).toContain('PDF ilegible');
  });

  it('rechaza si falta «ok»: no se asume éxito', () => {
    expect(validarRespuestaN8N({ tarifas: [] }).valida).toBe(false);
  });

  it('rechaza si no viene la lista de tarifas', () => {
    expect(validarRespuestaN8N({ ok: true }).valida).toBe(false);
  });

  it('rechaza un documento sin ninguna tarifa', () => {
    expect(validarRespuestaN8N({ ok: true, tarifas: [] }).valida).toBe(false);
  });

  it('DESCARTA la línea sin monto numérico en vez de crearla en cero', () => {
    // Es el modo de fallo que importa: un campo renombrado en n8n llegaría
    // como undefined y produciría tarifas de $0 que nadie nota.
    const r = validarRespuestaN8N(respuestaOk({
      tarifas: [
        { lineaId: 'a', concepto: 'Flete marítimo', monto: 1200 },
        { lineaId: 'b', concepto: 'Almacenaje IN', monto: undefined },
        { lineaId: 'c', concepto: 'Maniobras', monto: 'mil doscientos' },
      ],
    }));
    expect(r.datos?.tarifas?.map(l => l.lineaId)).toEqual(['a']);
    expect(r.reparos.some(x => x.includes('Almacenaje IN'))).toBe(true);
  });

  it('descarta montos negativos', () => {
    const r = validarRespuestaN8N(respuestaOk({
      tarifas: [{ lineaId: 'a', concepto: 'Flete', monto: -500 }],
    }));
    expect(r.valida).toBe(false);
  });

  it('descarta la línea sin concepto', () => {
    const r = validarRespuestaN8N(respuestaOk({
      tarifas: [{ lineaId: 'a', concepto: '  ', monto: 100 }],
    }));
    expect(r.valida).toBe(false);
  });

  it('una moneda desconocida no se acepta en silencio: se deja vacía y se repara', () => {
    const r = validarRespuestaN8N(respuestaOk({
      tarifas: [{ lineaId: 'a', concepto: 'Flete marítimo', monto: 100, moneda: 'EUR' }],
    }));
    expect(r.datos?.tarifas?.[0].moneda).toBeUndefined();
    expect(r.reparos.some(x => x.includes('EUR'))).toBe(true);
  });

  it('rechaza fechas fuera de formato sin tumbar la respuesta', () => {
    const r = validarRespuestaN8N(respuestaOk({ fechaFin: '15/09/2026' }));
    expect(r.valida).toBe(true);
    expect(r.datos?.fechaFin).toBeUndefined();
    expect(r.reparos.some(x => x.includes('AAAA-MM-DD'))).toBe(true);
  });

  it('avisa si la vigencia termina antes de empezar', () => {
    const r = validarRespuestaN8N(respuestaOk({ fechaInicio: '2026-09-15', fechaFin: '2026-08-01' }));
    expect(r.reparos.some(x => x.includes('termina antes de empezar'))).toBe(true);
  });

  it('una confianza ausente o rara se trata como BAJA, no como alta', () => {
    expect(validarRespuestaN8N(respuestaOk({ confianza: undefined })).datos?.confianza).toBe('baja');
    expect(validarRespuestaN8N(respuestaOk({ confianza: 'excelente' })).datos?.confianza).toBe('baja');
  });

  it('recalcula los contadores en vez de creerle al agente', () => {
    const r = validarRespuestaN8N(respuestaOk({
      totalLineas: 99,
      tarifas: [
        { lineaId: 'a', concepto: 'Flete marítimo', monto: 100, requiereRevision: true },
        { lineaId: 'b', concepto: 'Almacenaje IN', monto: 200 },
      ],
    }));
    expect(r.datos?.totalLineas).toBe(2);
    expect(r.datos?.lineasConAviso).toBe(1);
  });
});

describe('avisos en lenguaje claro', () => {
  it('traduce los códigos conocidos', () => {
    expect(textoDeAviso('falta_precio_40')).toBe('Falta el precio de 40 pies');
  });

  it('un código desconocido se muestra legible, no se oculta', () => {
    expect(textoDeAviso('algo_nuevo_del_agente')).toBe('algo nuevo del agente');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('resolución de conceptos', () => {
  it('match exacto', () => {
    const r = resolverConcepto('Flete marítimo', CONCEPTOS);
    expect(r.nivel).toBe('exacto');
    expect(r.match?.id).toBe('CON-001');
  });

  it('ignora acentos y mayúsculas', () => {
    expect(resolverConcepto('FLETE MARITIMO', CONCEPTOS).nivel).toBe('exacto');
  });

  it('un parecido se marca como SUGERIDO, no como exacto', () => {
    // Aceptar parecidos a ciegas es cómo «Almacenaje IN» acaba apuntando a
    // «Almacenaje OUT».
    const r = resolverConcepto('Almacenaje', CONCEPTOS);
    expect(r.nivel).toBe('sugerido');
    expect(r.match).not.toBeNull();
  });

  it('sin parecido devuelve sin_match', () => {
    expect(resolverConcepto('Servicio inventado', CONCEPTOS).nivel).toBe('sin_match');
  });

  it('un nombre vacío no inventa un match', () => {
    expect(resolverConcepto('   ', CONCEPTOS).nivel).toBe('sin_match');
  });
});

describe('resolución de puertos', () => {
  it('por código', () => {
    expect(resolverPuerto('MZO', PUERTOS).match?.id).toBe('PTO-001');
  });

  it('por nombre, con acentos', () => {
    expect(resolverPuerto('lazaro cardenas', PUERTOS).match?.id).toBe('PTO-003');
  });

  it('parcial se marca como sugerido', () => {
    expect(resolverPuerto('Manzanillo, México', PUERTOS).nivel).toBe('sugerido');
  });

  it('sin puerto no revienta', () => {
    expect(resolverPuerto(undefined, PUERTOS).nivel).toBe('sin_match');
  });
});

describe('resolución de proveedor', () => {
  it('exacto y parcial', () => {
    expect(resolverProveedor('Sunway Logistics', PROVEEDORES).nivel).toBe('exacto');
    expect(resolverProveedor('Sunway', PROVEEDORES).nivel).toBe('sugerido');
  });

  it('desconocido no se inventa', () => {
    expect(resolverProveedor('Naviera Nueva', PROVEEDORES).nivel).toBe('sin_match');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
const linea = (p: Partial<LineaEnRevision> = {}): LineaEnRevision => ({
  lineaId: 'l1',
  extraida: { lineaId: 'l1', concepto: 'Flete marítimo', monto: 1200 },
  conceptoId: 'CON-001',
  conceptoNombre: 'Flete marítimo',
  nivelConcepto: 'exacto',
  puertoOrigenId: 'PTO-002',
  puertoDestinoId: 'PTO-001',
  rutaTexto: null,
  monto: 1200,
  moneda: 'USD',
  unidad: 'CONTENEDOR' as LineaEnRevision['unidad'],
  monedaConfirmada: true,
  unidadConfirmada: true,
  descartada: false,
  ...p,
});

describe('qué se puede guardar', () => {
  it('una línea completa y confirmada sí', () => {
    expect(esGuardable(linea())).toBe(true);
  });

  it('SIN conceptoId no se guarda: la tarifa existiría y sería invisible', () => {
    // Es el agujero que cerró CC-1..CC-4 y que reintrodujimos hoy en la tabla.
    expect(motivosNoGuardable(linea({ conceptoId: null }))).toContain('sin_concepto');
    expect(esGuardable(linea({ conceptoId: null }))).toBe(false);
  });

  it('un concepto SUGERIDO no basta: hay que confirmarlo', () => {
    expect(motivosNoGuardable(linea({ nivelConcepto: 'sugerido' })))
      .toContain('concepto_sin_confirmar');
  });

  it('la moneda tiene que confirmarse a mano, no solo estar puesta', () => {
    // Un 1,200 que era MXN cargado como USD se ve perfectamente bien en la
    // pantalla y nadie lo atrapa hasta que llega la factura.
    expect(motivosNoGuardable(linea({ monedaConfirmada: false })))
      .toContain('moneda_sin_confirmar');
  });

  it('la unidad también', () => {
    expect(motivosNoGuardable(linea({ unidadConfirmada: false })))
      .toContain('unidad_sin_confirmar');
  });

  it('monto en cero o negativo no se guarda', () => {
    expect(motivosNoGuardable(linea({ monto: 0 }))).toContain('monto_invalido');
    expect(motivosNoGuardable(linea({ monto: -5 }))).toContain('monto_invalido');
  });

  it('una descartada nunca es guardable, aunque esté completa', () => {
    expect(esGuardable(linea({ descartada: true }))).toBe(false);
  });

  it('acumula todos los motivos, no solo el primero', () => {
    const m = motivosNoGuardable(linea({ conceptoId: null, moneda: null, monto: 0 }));
    expect(m).toEqual(expect.arrayContaining(['sin_concepto', 'sin_moneda', 'monto_invalido']));
  });
});

describe('resumen y orden de la revisión', () => {
  const LISTA = [
    linea({ lineaId: 'ok1' }),
    linea({ lineaId: 'falla', conceptoId: null }),
    linea({ lineaId: 'ok2' }),
    linea({ lineaId: 'fuera', descartada: true }),
  ];

  it('cuenta guardables, descartadas y las que faltan', () => {
    const r = resumenRevision(LISTA);
    expect(r.total).toBe(4);
    expect(r.guardables).toBe(2);
    expect(r.requierenRevision).toBe(1);
    expect(r.descartadas).toBe(1);
  });

  it('las que necesitan atención van primero', () => {
    // Con cuarenta líneas, las dos que fallan se perderían al final.
    expect(ordenarParaRevision(LISTA)[0].lineaId).toBe('falla');
  });

  it('las descartadas van al final', () => {
    const o = ordenarParaRevision(LISTA);
    expect(o[o.length - 1].lineaId).toBe('fuera');
  });

  it('ordenar no pierde ni duplica líneas', () => {
    expect(ordenarParaRevision(LISTA)).toHaveLength(LISTA.length);
    expect(new Set(ordenarParaRevision(LISTA).map(l => l.lineaId)).size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('traslape de vigencias', () => {
  it('dos rangos que se cruzan', () => {
    expect(vigenciasSeTraslapan('2026-08-01', '2026-09-15', '2026-09-01', '2026-10-01')).toBe(true);
  });

  it('rangos separados no se traslapan', () => {
    expect(vigenciasSeTraslapan('2026-08-01', '2026-08-31', '2026-09-01', '2026-09-30')).toBe(false);
  });

  it('una vigencia sin fin se traslapa con todo lo posterior', () => {
    expect(vigenciasSeTraslapan('2026-08-01', null, '2027-01-01', '2027-02-01')).toBe(true);
  });

  it('el borde exacto cuenta como traslape', () => {
    expect(vigenciasSeTraslapan('2026-08-01', '2026-09-01', '2026-09-01', '2026-10-01')).toBe(true);
  });
});

describe('detección de duplicados contra el catálogo vivo', () => {
  const existente = {
    id: 'TAR-0001', activo: true,
    proveedorId: 'PRV-001', conceptoId: 'CON-001',
    puertoOrigenId: 'PTO-002', puertoDestinoId: 'PTO-001',
    fechaInicio: '2026-08-01', fechaFin: '2026-12-31',
  } as TarifaVermur;

  const vigencia = { fechaInicio: '2026-09-01', fechaFin: '2026-10-01' };

  it('detecta la misma tarifa con vigencia traslapada', () => {
    const c = detectarColisiones([linea()], 'PRV-001', vigencia, [existente]);
    expect(c).toHaveLength(1);
    expect(c[0].detalle).toContain('Flete marítimo');
  });

  it('otro proveedor no colisiona', () => {
    expect(detectarColisiones([linea()], 'PRV-002', vigencia, [existente])).toEqual([]);
  });

  it('otra ruta no colisiona', () => {
    const otra = linea({ puertoOrigenId: 'PTO-003' });
    expect(detectarColisiones([otra], 'PRV-001', vigencia, [existente])).toEqual([]);
  });

  it('una tarifa dada de baja no colisiona', () => {
    const baja = { ...existente, activo: false };
    expect(detectarColisiones([linea()], 'PRV-001', vigencia, [baja])).toEqual([]);
  });

  it('vigencias que no se cruzan no colisionan', () => {
    const vieja = { ...existente, fechaInicio: '2025-01-01', fechaFin: '2025-12-31' };
    expect(detectarColisiones([linea()], 'PRV-001', vigencia, [vieja])).toEqual([]);
  });

  it('las descartadas y las que no tienen concepto no se cotejan', () => {
    expect(detectarColisiones([linea({ descartada: true })], 'PRV-001', vigencia, [existente])).toEqual([]);
    expect(detectarColisiones([linea({ conceptoId: null })], 'PRV-001', vigencia, [existente])).toEqual([]);
  });
});
