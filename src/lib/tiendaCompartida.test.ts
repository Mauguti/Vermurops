import { describe, it, expect, vi } from 'vitest';
import { crearTiendaCompartida } from './tiendaCompartida';

function fuente() {
  const cierres = vi.fn();
  let alDato: (d: number[]) => void = () => {};
  let alError: () => void = () => {};
  const abrir = vi.fn((d: (x: number[]) => void, e: () => void) => { alDato = d; alError = e; return cierres; });
  return { abrir, cierres, dato: (d: number[]) => alDato(d), error: () => alError() };
}

describe('crearTiendaCompartida', () => {
  it('tres suscriptores abren UNA sola suscripción', () => {
    const f = fuente();
    const t = crearTiendaCompartida<number>(f.abrir);
    const a = vi.fn(), b = vi.fn(), c = vi.fn();
    t.suscribir(a); t.suscribir(b); t.suscribir(c);
    expect(f.abrir).toHaveBeenCalledTimes(1);
    f.dato([1, 2]);
    for (const o of [a, b, c]) expect(o).toHaveBeenLastCalledWith({ datos: [1, 2], loading: false });
  });

  it('el que llega tarde recibe lo último sin abrir otra', () => {
    const f = fuente();
    const t = crearTiendaCompartida<number>(f.abrir);
    t.suscribir(() => {});
    f.dato([7]);
    const tarde = vi.fn();
    t.suscribir(tarde);
    expect(tarde).toHaveBeenCalledWith({ datos: [7], loading: false });
    expect(f.abrir).toHaveBeenCalledTimes(1);
  });

  it('se cierra al irse el último y reabre limpia', () => {
    const f = fuente();
    const t = crearTiendaCompartida<number>(f.abrir);
    const x = t.suscribir(() => {}); const y = t.suscribir(() => {});
    x(); expect(f.cierres).not.toHaveBeenCalled();
    y(); expect(f.cierres).toHaveBeenCalledTimes(1);
    expect(t.vivas).toBe(0);
    t.suscribir(() => {});
    expect(f.abrir).toHaveBeenCalledTimes(2);
    expect(t.abiertas).toBe(2);
  });

  it('un error deja la lista vacía y sin cargando', () => {
    const f = fuente();
    const t = crearTiendaCompartida<number>(f.abrir);
    const o = vi.fn();
    t.suscribir(o);
    f.error();
    expect(o).toHaveBeenLastCalledWith({ datos: [], loading: false });
  });
});
