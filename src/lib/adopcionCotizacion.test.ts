import { describe, it, expect } from 'vitest';
import type { KanbanQuote } from '../components/quotes/QuotesData';
import { abrir, avanzar, recargar, type EstadoAdopcion } from './adopcionCotizacion';

const q = (extra: Record<string, unknown> = {}): KanbanQuote => ({
  id: 'COT-1', etapa: 'solicitud_cliente', servicios: [{ id: 's1', monto: 1 }],
  actividades: [{ id: 'a1' }], pdfs: [], versionActual: 1, updatedAt: 't0', ...extra,
} as unknown as KanbanQuote);
const val = (e: EstadoAdopcion, k: string) => (e.abierta as unknown as Record<string, unknown>)[k];

describe('adopcionCotizacion', () => {
  it('sin cambios devuelve el mismo estado (sin renders)', () => {
    const a = q();
    const e = abrir(a, a);
    expect(avanzar(e, a, a)).toBe(e);
  });

  it('adopta de inmediato lo que otra persona cambió y aquí nadie tocó (etapa, nota, PDF)', () => {
    const a = q();
    const e = abrir(a, a);
    const srv = q({
      etapa: 'solicitado_pricing',
      actividades: [{ id: 'a1' }, { id: 'EXT' }],
      pdfs: [{ id: 'p1' }],
    });
    const n = avanzar(e, a, srv);
    expect(val(n, 'etapa')).toBe('solicitado_pricing');
    expect(val(n, 'actividades')).toEqual([{ id: 'a1' }, { id: 'EXT' }]);
    expect(val(n, 'pdfs')).toEqual([{ id: 'p1' }]);
    expect(n.conflictos).toEqual([]);
  });

  it('no pisa lo que la persona ya cambió: su campo se conserva y no es conflicto si el servidor no lo movió', () => {
    const a = q();
    let e = abrir(a, a);
    const editada = q({ servicios: [{ id: 's1', monto: 99 }] });
    e = avanzar(e, editada, a); // la persona edita; el servidor aún no lo ve
    const srv = q({ etapa: 'solicitado_pricing' }); // otra persona mueve la etapa
    const n = avanzar(e, editada, srv);
    expect(val(n, 'servicios')).toEqual([{ id: 's1', monto: 99 }]);
    expect(val(n, 'etapa')).toBe('solicitado_pricing');
    expect(n.conflictos).toEqual([]);
  });

  it('notas de las dos copias se fusionan por id, sin conflicto', () => {
    const a = q();
    let e = abrir(a, a);
    const local = q({ actividades: [{ id: 'a1' }, { id: 'LOCAL' }] });
    e = avanzar(e, local, a);
    const srv = q({ actividades: [{ id: 'a1' }, { id: 'EXT' }] });
    const n = avanzar(e, local, srv);
    expect((val(n, 'actividades') as { id: string }[]).map(x => x.id).sort()).toEqual(['EXT', 'LOCAL', 'a1']);
    expect(n.conflictos).toEqual([]);
  });

  it('la misma tarifa editada en las dos copias es CONFLICTO: gana el local y se avisa', () => {
    const a = q();
    let e = abrir(a, a);
    const local = q({ servicios: [{ id: 's1', monto: 50 }] });
    e = avanzar(e, local, a);
    const srv = q({ servicios: [{ id: 's1', monto: 70 }] });
    const n = avanzar(e, local, srv);
    expect(val(n, 'servicios')).toEqual([{ id: 's1', monto: 50 }]);
    expect(n.conflictos).toEqual(['servicios']);
  });

  it('el eco de MI propia escritura (con otra más reciente en vuelo) no es conflicto', () => {
    const a = q();
    let e = abrir(a, a);
    const v1 = q({ servicios: [{ id: 's1', monto: 10 }] });
    const v2 = q({ servicios: [{ id: 's1', monto: 20 }] });
    e = avanzar(e, v1, a);
    e = avanzar(e, v2, a); // segunda edición antes de que vuelva el snapshot de la primera
    const n = avanzar(e, v2, v1); // llega el snapshot de la primera
    expect(n.conflictos).toEqual([]);
    expect(val(n, 'servicios')).toEqual([{ id: 's1', monto: 20 }]);
  });

  it('el conflicto se apaga cuando el guardado del local alcanza al servidor', () => {
    const a = q();
    let e = abrir(a, a);
    const local = q({ servicios: [{ id: 's1', monto: 50 }] });
    e = avanzar(e, local, a);
    e = avanzar(e, local, q({ servicios: [{ id: 's1', monto: 70 }] }));
    expect(e.conflictos).toEqual(['servicios']);
    const n = avanzar(e, local, q({ servicios: [{ id: 's1', monto: 50 }] }));
    expect(n.conflictos).toEqual([]);
  });

  it('recargar toma la copia del servidor y limpia el aviso', () => {
    const a = q();
    let e = abrir(a, a);
    const local = q({ servicios: [{ id: 's1', monto: 50 }] });
    e = avanzar(e, local, a);
    const srv = q({ servicios: [{ id: 's1', monto: 70 }] });
    e = avanzar(e, local, srv);
    const n = recargar(e, srv);
    expect(val(n, 'servicios')).toEqual([{ id: 's1', monto: 70 }]);
    expect(n.conflictos).toEqual([]);
  });

  it('un cambio de versión adopta la del servidor entera, como el comportamiento anterior', () => {
    const a = q();
    const e = abrir(a, a);
    const srv = q({ versionActual: 2, servicios: [{ id: 's1', monto: 5 }] });
    const n = avanzar(e, a, srv);
    expect(n.abierta).toBe(srv);
  });

  it('updatedAt local no cuenta como cambio ajeno', () => {
    const a = q();
    const e = abrir(a, a);
    const n = avanzar(e, a, q({ updatedAt: 't9' }));
    expect(n.abierta).toBe(a);
  });
});
