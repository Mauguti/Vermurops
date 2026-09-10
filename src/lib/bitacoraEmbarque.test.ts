import { describe, it, expect } from 'vitest';
import {
  diffParaBitacora, conBitacora, comentario, editarComentario, filtrarBitacora, tituloOC,
} from './bitacoraEmbarque';
import type { EmbarqueCompleto, EntradaBitacora } from '../components/shipments/EmbarquesData';

const AHORA = '2026-09-10T15:00:00.000Z';
const HOY = '2026-09-10';
const ANGEL = { uid: 'u-angel', nombre: 'Ángel' };
const OTRO = { uid: 'u-otro', nombre: 'Otro' };

const emb = (over: Partial<EmbarqueCompleto> = {}): EmbarqueCompleto => ({
  id: 'E1', folio: 'VLIM-1', numeroGuia: 'X', numeroReservacion: '',
  cierres: { operativo: false, pago: false, administrativo: false },
  entidades: { expedidor: '', consignatario: 'Alfa', notificar: '', agenteAduanal: '', agenteCarga: '', agenteDestino: '', importador: '', clienteCobrar: 'Alfa' },
  ruta: { origen: { puertoCarga: '', transportista: 'Maersk', buque: '', bandera: '', viaje: '' }, destino: { puertoDescarga: '', transportistaEntrega: '', lugarEntrega: '' }, aduana: { aes: false, pedimento: '' } },
  fechas: { salida: '', arribo: '', ordenGeneral: '', limiteDocumentacion: '', libreDemoras: '', libreAlmacenaje: '' },
  cargos: { detalles: [{ id: 'g1', concepto: 'Flete', tipo: 'gasto', monto: 1500, moneda: 'USD' }], ingresos: 0, gastos: 1500, ganancia: 0, moneda: 'USD' },
  documentos: [], eventos: [],
  ...over,
} as EmbarqueCompleto);

describe('lo que el sistema registra solo', () => {
  it('cambio de etapa: «Ángel movió el embarque de Cargado a En tránsito»', () => {
    const d = diffParaBitacora(emb(), emb({ enTransito: true }), ANGEL, AHORA, HOY);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ tipo: 'sistema', evento: 'etapa', titulo: 'Ángel movió el embarque de Cargado a En tránsito', autor: ANGEL, fecha: AHORA });
  });

  it('los tres cierres, quién y cuándo (marcar y reabrir)', () => {
    const d = diffParaBitacora(emb(), emb({ cierres: { operativo: true, pago: true, administrativo: false } }), ANGEL, AHORA, HOY);
    const cierres = d.filter(e => e.evento === 'cierre').map(e => e.titulo);
    expect(cierres).toEqual(['Ángel marcó el cierre operativo', 'Ángel marcó el cierre de pago']);
    // marcar el operativo también mueve la etapa a entregado
    expect(d.some(e => e.evento === 'etapa' && /Entregado/.test(e.titulo))).toBe(true);
    const r = diffParaBitacora(emb({ cierres: { operativo: true, pago: false, administrativo: false } }), emb(), ANGEL, AHORA, HOY);
    expect(r.find(e => e.evento === 'cierre')?.titulo).toBe('Ángel reabrió el cierre operativo');
  });

  it('un costo modificado, con el valor anterior', () => {
    const despues = emb({ cargos: { detalles: [{ id: 'g1', concepto: 'Flete', tipo: 'gasto', monto: 1650, moneda: 'USD' }], ingresos: 0, gastos: 1650, ganancia: 0, moneda: 'USD' } });
    const d = diffParaBitacora(emb(), despues, ANGEL, AHORA, HOY);
    expect(d).toHaveLength(1);
    expect(d[0].titulo).toBe('Ángel cambió el costo de «Flete»');
    expect(d[0].detalle).toBe('De USD 1,500.00 a USD 1,650.00');
  });

  it('cargo agregado y cargo quitado', () => {
    const conExtra = emb({ cargos: { detalles: [...emb().cargos.detalles, { id: 'g2', concepto: 'Demoras', tipo: 'gasto', monto: 90, moneda: 'USD' }], ingresos: 0, gastos: 0, ganancia: 0, moneda: 'USD' } });
    expect(diffParaBitacora(emb(), conExtra, ANGEL, AHORA, HOY)[0].titulo).toBe('Ángel agregó el cargo «Demoras»');
    expect(diffParaBitacora(conExtra, emb(), ANGEL, AHORA, HOY)[0].titulo).toBe('Ángel quitó el cargo «Demoras»');
  });

  it('responsable, entidades, transportista y documentos', () => {
    const despues = emb({
      responsableOperativo: 'angel.luna@vermur.com',
      entidades: { ...emb().entidades, agenteAduanal: 'Torres S.C.' },
      ruta: { ...emb().ruta, origen: { ...emb().ruta.origen, transportista: 'Hapag' } },
      documentos: [{ id: 'd1', tipo: 'bl_maritimo', nombre: 'BL 123', url: '', fechaCarga: '', cargadoPor: '' }],
    });
    const t = diffParaBitacora(emb(), despues, ANGEL, AHORA, HOY).map(e => `${e.evento}: ${e.titulo}`);
    expect(t).toEqual([
      'responsable: Ángel asignó el embarque a angel.luna@vermur.com',
      'entidad: Ángel cambió Agente aduanal',
      'entidad: Ángel cambió el transportista',
      'documento: Ángel subió el documento «BL 123»',
    ]);
  });

  it('sin cambios relevantes no anota nada: un guardado igual no es un evento', () => {
    expect(diffParaBitacora(emb(), emb({ updatedAt: 'x', eventos: [{ id: 'h', titulo: 'En puerto', descripcion: '', fecha: '', tipo: 'info' }] }), ANGEL, AHORA, HOY)).toEqual([]);
  });
});

describe('conBitacora', () => {
  it('anota al final de la bitácora existente', () => {
    const previa: EntradaBitacora = { id: 'p', tipo: 'comentario', titulo: 'hola', autor: ANGEL, fecha: '2026-09-09T10:00:00.000Z' };
    const r = conBitacora(emb({ bitacora: [previa] }), emb({ bitacora: [previa], enTransito: true }), ANGEL, AHORA, HOY);
    expect(r.bitacora!.map(e => e.tipo)).toEqual(['comentario', 'sistema']);
  });

  it('otro id (crear un hijo) no se compara', () => {
    const hijo = emb({ id: 'E2', enTransito: true });
    expect(conBitacora(emb(), hijo, ANGEL, AHORA, HOY)).toBe(hijo);
  });

  it('sin cambios devuelve el mismo objeto', () => {
    const d = emb();
    expect(conBitacora(emb(), d, ANGEL, AHORA, HOY)).toBe(d);
  });
});

describe('comentarios: solo el autor edita, y queda registro', () => {
  const c = comentario('  la naviera confirmó que zarpa el jueves ', ANGEL, AHORA)!;

  it('se crea recortado; vacío no se crea', () => {
    expect(c.titulo).toBe('la naviera confirmó que zarpa el jueves');
    expect(c.tipo).toBe('comentario');
    expect(comentario('   ', ANGEL, AHORA)).toBeNull();
  });

  it('el autor edita y lo anterior se conserva', () => {
    const r = editarComentario([c], c.id, 'zarpa el viernes', ANGEL.uid, '2026-09-10T16:00:00.000Z');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bitacora[0]).toMatchObject({ titulo: 'zarpa el viernes', editadoEn: '2026-09-10T16:00:00.000Z' });
    expect(r.bitacora[0].ediciones).toEqual([{ fecha: '2026-09-10T16:00:00.000Z', textoAnterior: 'la naviera confirmó que zarpa el jueves' }]);
  });

  it('otro usuario no puede; las entradas del sistema tampoco se editan', () => {
    expect(editarComentario([c], c.id, 'x', OTRO.uid, AHORA)).toMatchObject({ ok: false });
    const sistema = diffParaBitacora(emb(), emb({ enTransito: true }), ANGEL, AHORA, HOY)[0];
    const r = editarComentario([sistema], sistema.id, 'x', ANGEL.uid, AHORA);
    expect(r.ok).toBe(false);
    expect('razon' in r ? r.razon : '').toContain('auditoría');
  });
});

describe('lectura', () => {
  it('lo más reciente arriba y el filtro separa comentarios de sistema', () => {
    const a = comentario('a', ANGEL, '2026-09-10T10:00:00.000Z')!;
    const b = diffParaBitacora(emb(), emb({ enTransito: true }), ANGEL, '2026-09-10T12:00:00.000Z', HOY)[0];
    expect(filtrarBitacora([a, b], 'todo').map(e => e.id)).toEqual([b.id, a.id]);
    expect(filtrarBitacora([a, b], 'comentarios')).toEqual([a]);
    expect(filtrarBitacora([a, b], 'sistema')).toEqual([b]);
  });

  it('tituloOC', () => {
    expect(tituloOC('pagada', 'OC-2026-0001', 'Oñate', 'Julio')).toBe('Julio pagó la orden de compra OC-2026-0001 a Oñate');
  });
});
