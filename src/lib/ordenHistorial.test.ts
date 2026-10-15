import { describe, it, expect } from 'vitest';
import { ordenarPorFechaDesc } from './ordenHistorial';

describe('ordenarPorFechaDesc', () => {
  it('lo más reciente primero', () => {
    const r = ordenarPorFechaDesc([{ date: '2026-01-01' }, { date: '2026-03-01' }]);
    expect(r.map(e => e.date)).toEqual(['2026-03-01', '2026-01-01']);
  });
  it('una entrada sin createdAt no truena y queda al final', () => {
    const r = ordenarPorFechaDesc([{ date: undefined, id: 'a' }, { date: '2026-03-01', id: 'b' }, { date: null, id: 'c' }]);
    expect(r.map(e => e.id)).toEqual(['b', 'a', 'c']);
  });
  it('no muta la entrada', () => {
    const e = [{ date: 'a' }, { date: 'b' }];
    ordenarPorFechaDesc(e);
    expect(e[0].date).toBe('a');
  });
});
