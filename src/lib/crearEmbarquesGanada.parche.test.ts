import { describe, it, expect } from 'vitest';
import { parcheDeGanada } from './crearEmbarquesGanada';
import type { KanbanQuote } from '../components/quotes/QuotesData';

const q = (extra: Record<string, unknown> = {}) =>
  ({ id: 'COT-1', etapa: 'negociacion', actividades: [{ id: 'a1' }], pdfs: [], ...extra }) as unknown as KanbanQuote;

describe('parcheDeGanada (tarea 112)', () => {
  it('con anterior escribe solo lo tocado más embarqueIds', () => {
    const anterior = q();
    const ganada = q({ etapa: 'ganada', fechaGanada: '2026-10-12' });
    const parche = parcheDeGanada({ ...anterior }, anterior, ganada, ['SHP-1']);
    expect(Object.keys(parche).sort()).toEqual(['embarqueIds', 'etapa', 'fechaGanada']);
    expect(parche.embarqueIds).toEqual(['SHP-1']);
  });

  it('no borra una nota agregada en el servidor mientras tanto', () => {
    const anterior = q();
    const ganada = q({ etapa: 'ganada', actividades: [{ id: 'a1' }, { id: 'a2' }] });
    const servidor = { ...anterior, actividades: [{ id: 'a1' }, { id: 'ajena' }] };
    const parche = parcheDeGanada(servidor as never, anterior, ganada, ['SHP-1']);
    const ids = (parche.actividades as { id: string }[]).map(a => a.id).sort();
    expect(ids).toEqual(['a1', 'a2', 'ajena']);
  });

  it('sin anterior escribe la cotización entera, como antes', () => {
    const ganada = q({ etapa: 'ganada' });
    const parche = parcheDeGanada({}, undefined, ganada, ['SHP-1']);
    expect(parche).toMatchObject({ id: 'COT-1', etapa: 'ganada', embarqueIds: ['SHP-1'] });
  });
});
