import { describe, it, expect } from 'vitest';
import { estadoDe, agruparPorEstado, tieneCapturaMinima, ETAPAS_EMBARQUE } from './estadoEmbarque';
import { EmbarqueCompleto } from '../components/shipments/EmbarquesData';

const emb = (p: Partial<EmbarqueCompleto>): EmbarqueCompleto =>
  ({ id: 'SHP-1', folio: 'SHP-1', cierres: { operativo: false, pago: false, administrativo: false },
     numeroGuia: '', numeroReservacion: '', ...p } as EmbarqueCompleto);

describe('estado del embarque', () => {
  it('el que nació de una cotización y nadie tocó es «nuevo»', () => {
    // «cómo distingue Operaciones que es un embarque que les acaba de enviar
    // Ventas, y no un embarque que ellos ya abrieron»
    expect(estadoDe(emb({ requiereCaptura: true }))).toBe('nuevo');
  });

  it('capturado pero sin cerrar es «en proceso»', () => {
    expect(estadoDe(emb({ requiereCaptura: false }))).toBe('en_proceso');
  });

  it('con los tres cierres es «finalizado»', () => {
    expect(estadoDe(emb({ cierres: { operativo: true, pago: true, administrativo: true } })))
      .toBe('finalizado');
  });

  it('los tres cierres ganan sobre requiereCaptura', () => {
    // Si está cerrado, ya no es nuevo aunque la bandera siguiera puesta.
    expect(estadoDe(emb({
      requiereCaptura: true,
      cierres: { operativo: true, pago: true, administrativo: true },
    }))).toBe('finalizado');
  });

  it('dos de tres cierres NO es finalizado', () => {
    expect(estadoDe(emb({ cierres: { operativo: true, pago: true, administrativo: false } })))
      .toBe('en_proceso');
  });

  it('un embarque manual sin la bandera es «en proceso», no «nuevo»', () => {
    expect(estadoDe(emb({}))).toBe('en_proceso');
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
  it('tres columnas, en orden', () => {
    expect(ETAPAS_EMBARQUE.map(e => e.label)).toEqual(['Nuevo', 'En proceso', 'Finalizado']);
  });

  it('INVARIANTE: cada embarque cae en exactamente una columna', () => {
    const lista = [
      emb({ id: 'a', requiereCaptura: true }),
      emb({ id: 'b' }),
      emb({ id: 'c', cierres: { operativo: true, pago: true, administrativo: true } }),
    ];
    const grupos = agruparPorEstado(lista);
    const total = grupos.reduce((n, g) => n + g.embarques.length, 0);
    expect(total).toBe(lista.length);
    expect(grupos.map(g => g.embarques.map(e => e.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('columnas vacías se conservan: el Kanban siempre muestra las tres', () => {
    const grupos = agruparPorEstado([]);
    expect(grupos).toHaveLength(3);
    expect(grupos.every(g => g.embarques.length === 0)).toBe(true);
  });
});
