import { describe, it, expect } from 'vitest';
import {
  estadoDe, agruparPorEstado, tieneCapturaMinima, patchParaEtapa, ETAPAS_EMBARQUE,
} from './estadoEmbarque';
import { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

const HOY = '2026-09-10';
const emb = (p: Partial<EmbarqueCompleto>): EmbarqueCompleto =>
  ({ id: 'SHP-1', folio: 'SHP-1', cierres: { operativo: false, pago: false, administrativo: false },
     numeroGuia: '', numeroReservacion: '', fechas: { arribo: '' }, ...p } as EmbarqueCompleto);

describe('las cinco etapas, derivadas', () => {
  it('el que nació de una cotización y nadie tocó es «nuevo»', () => {
    expect(estadoDe(emb({ requiereCaptura: true }), HOY)).toBe('nuevo');
  });

  it('capturado y sin salir es «cargado» (antes: en proceso)', () => {
    expect(estadoDe(emb({}), HOY)).toBe('cargado');
    expect(estadoDe(emb({ requiereCaptura: false }), HOY)).toBe('cargado');
  });

  it('en tránsito reparte por la ETA: antes de la ETA en tránsito, después en destino', () => {
    expect(estadoDe(emb({ enTransito: true, fechas: { arribo: '2026-09-20' } as never }), HOY)).toBe('en_transito');
    expect(estadoDe(emb({ enTransito: true, fechas: { arribo: '2026-09-10' } as never }), HOY)).toBe('en_destino');
    expect(estadoDe(emb({ enTransito: true, fechas: { arribo: '2026-09-01' } as never }), HOY)).toBe('en_destino');
    // sin ETA no se puede saber que llegó
    expect(estadoDe(emb({ enTransito: true }), HOY)).toBe('en_transito');
  });

  it('el cierre operativo es la entrega: «entregado» (antes: finalizado)', () => {
    expect(estadoDe(emb({ cierres: { operativo: true, pago: true, administrativo: true } }), HOY)).toBe('entregado');
    expect(estadoDe(emb({ cierres: { operativo: true, pago: false, administrativo: false } }), HOY)).toBe('entregado');
  });

  it('el cierre operativo gana sobre requiereCaptura y sobre el override', () => {
    expect(estadoDe(emb({ requiereCaptura: true, cierres: { operativo: true, pago: false, administrativo: false } }), HOY)).toBe('entregado');
    expect(estadoDe(emb({ etapaOperativa: 'cargado', cierres: { operativo: true, pago: false, administrativo: false } }), HOY)).toBe('entregado');
  });

  it('el override manual manda sobre la derivación, y uno inválido se ignora', () => {
    expect(estadoDe(emb({ etapaOperativa: 'en_destino' }), HOY)).toBe('en_destino');
    expect(estadoDe(emb({ etapaOperativa: 'en_proceso' }), HOY)).toBe('cargado');
    expect(estadoDe(emb({ etapaOperativa: null, requiereCaptura: true }), HOY)).toBe('nuevo');
  });
});

describe('mover a mano', () => {
  it('a tránsito o destino marca enTransito; a cargado lo quita; nada cierra el operativo', () => {
    expect(patchParaEtapa(emb({}), 'en_transito')).toEqual({ etapaOperativa: 'en_transito', enTransito: true, requiereCaptura: false });
    expect(patchParaEtapa(emb({}), 'cargado')).toEqual({ etapaOperativa: 'cargado', enTransito: false, requiereCaptura: false });
    const p = patchParaEtapa(emb({}), 'entregado');
    expect(p).toEqual({ etapaOperativa: 'entregado', requiereCaptura: false });
    expect('cierres' in p).toBe(false);
  });

  it('con el cierre operativo hecho no se regresa desde aquí', () => {
    const r = patchParaEtapa(emb({ cierres: { operativo: true, pago: false, administrativo: false } }), 'en_destino');
    expect('error' in r).toBe(true);
  });
});

describe('captura mínima', () => {
  it('basta la guía o la reservación', () => {
    expect(tieneCapturaMinima(emb({ numeroGuia: 'MSKU123' }))).toBe(true);
    expect(tieneCapturaMinima(emb({ numeroReservacion: 'BKG-9' }))).toBe(true);
  });
  it('sin ninguna de las dos, no', () => {
    expect(tieneCapturaMinima(emb({}))).toBe(false);
    expect(tieneCapturaMinima(emb({ numeroGuia: '   ' }))).toBe(false);
  });
});

describe('Kanban de embarques', () => {
  it('cinco columnas, en orden', () => {
    expect(ETAPAS_EMBARQUE.map(e => e.label)).toEqual(['Nuevo', 'Cargado', 'En tránsito', 'En destino', 'Entregado']);
  });

  it('INVARIANTE: cada embarque cae en exactamente una columna', () => {
    const lista = [
      emb({ id: 'a', requiereCaptura: true }),
      emb({ id: 'b' }),
      emb({ id: 'c', enTransito: true, fechas: { arribo: '2026-12-01' } as never }),
      emb({ id: 'd', enTransito: true, fechas: { arribo: '2026-09-01' } as never }),
      emb({ id: 'e', cierres: { operativo: true, pago: true, administrativo: true } }),
    ];
    const grupos = agruparPorEstado(lista, HOY);
    expect(grupos.reduce((n, g) => n + g.embarques.length, 0)).toBe(lista.length);
    expect(grupos.map(g => g.embarques.map(e => e.id))).toEqual([['a'], ['b'], ['c'], ['d'], ['e']]);
  });
});
