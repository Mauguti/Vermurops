import { describe, it, expect } from 'vitest';
import { tocados, fusionarListaPorId, parcheFusionado, iguales } from './diffCotizacion';

const nota = (id: string, titulo = id) => ({ id, titulo });

describe('tocados', () => {
  it('lista solo las claves de primer nivel que cambiaron', () => {
    const a = { etapa: 'x', servicios: [{ n: 1 }], actividades: [] };
    const n = { etapa: 'x', servicios: [{ n: 2 }], actividades: [] };
    expect(tocados(a, n)).toEqual(['servicios']);
  });
  it('updatedAt solo no es nada tocado', () => {
    expect(tocados({ a: 1, updatedAt: 'x' }, { a: 1, updatedAt: 'y' })).toEqual([]);
  });
  it('updatedAt viaja cuando hay algo más', () => {
    expect(tocados({ a: 1, updatedAt: 'x' }, { a: 2, updatedAt: 'y' })).toEqual(['a', 'updatedAt']);
  });
  it('una clave que aparece o desaparece cuenta; undefined equivale a ausente', () => {
    expect(tocados({ a: 1 }, { a: 1, b: 2 })).toEqual(['b']);
    expect(tocados({ a: 1, b: 2 }, { a: 1 })).toEqual(['b']);
    expect(tocados({ a: 1 }, { a: 1, b: undefined })).toEqual([]);
  });
  it('compara en profundidad, no por referencia', () => {
    expect(tocados({ s: [{ x: { y: 1 } }] }, { s: [{ x: { y: 1 } }] })).toEqual([]);
  });
});

describe('iguales', () => {
  it('distingue orden de listas y NaN', () => {
    expect(iguales([1, 2], [2, 1])).toBe(false);
    expect(iguales(NaN, NaN)).toBe(true);
    expect(iguales(null, undefined)).toBe(false);
  });
});

describe('fusionarListaPorId', () => {
  it('la repro del plan: nota externa + nota local quedan las dos', () => {
    const anterior = [nota('a1')];
    const servidor = [nota('a1'), nota('EXTERNA')];
    const nuevo = [nota('a1'), nota('local')];
    expect(fusionarListaPorId(servidor, anterior, nuevo).map(x => x.id)).toEqual(['a1', 'EXTERNA', 'local']);
  });
  it('no duplica un agregado que el servidor ya tiene', () => {
    const r = fusionarListaPorId([nota('a'), nota('b', 'del servidor')], [nota('a')], [nota('a'), nota('b', 'local')]);
    expect(r).toEqual([nota('a'), nota('b', 'del servidor')]);
  });
  it('quitar quita del servidor y conserva lo ajeno', () => {
    expect(fusionarListaPorId([nota('a'), nota('b'), nota('c')], [nota('a'), nota('b')], [nota('a')]).map(x => x.id)).toEqual(['a', 'c']);
  });
  it('editar reemplaza al del servidor; si otro lo borró, no se resucita', () => {
    const ant = [nota('a', 'viejo')];
    const nue = [nota('a', 'editado')];
    expect(fusionarListaPorId([nota('a', 'viejo'), nota('z')], ant, nue)).toEqual([nota('a', 'editado'), nota('z')]);
    expect(fusionarListaPorId([nota('z')], ant, nue)).toEqual([nota('z')]);
  });
  it('sin cambios locales devuelve la lista del servidor', () => {
    const srv = [nota('a'), nota('b')];
    expect(fusionarListaPorId(srv, [nota('a')], [nota('a')])).toEqual(srv);
  });
  it('tolera listas ausentes y no muta las entradas', () => {
    expect(fusionarListaPorId(undefined, undefined, [nota('a')])).toEqual([nota('a')]);
    expect(fusionarListaPorId(null, null, null)).toEqual([]);
    const srv = [nota('a')];
    const copia = JSON.stringify(srv);
    fusionarListaPorId(srv, [], [nota('b')]);
    expect(JSON.stringify(srv)).toBe(copia);
  });
  it('elementos sin id se reconocen por contenido', () => {
    const r = fusionarListaPorId([{ x: 1 }, { x: 9 }] as any[], [{ x: 1 }] as any[], [{ x: 1 }, { x: 2 }] as any[]);
    expect(r).toEqual([{ x: 1 }, { x: 9 }, { x: 2 }]);
  });
});

describe('parcheFusionado', () => {
  const pdf = { id: 'pdf-1', nombreArchivo: 'COT v1.pdf' };
  it('el PDF generado y luego una nota: el PDF se conserva', () => {
    // la ficha abrió sin PDFs; usePdfCotizacion escribió el PDF en el servidor
    const anterior = { actividades: [nota('a1')], pdfs: [] as any[], updatedAt: '1' };
    const servidor = { actividades: [nota('a1')], pdfs: [pdf] };
    const nuevo = { actividades: [nota('a1'), nota('nota-local')], pdfs: [] as any[], updatedAt: '2' };
    const p = parcheFusionado(servidor, anterior, nuevo);
    expect(Object.keys(p).sort()).toEqual(['actividades', 'updatedAt']);
    expect((p.actividades as any[]).map(x => x.id)).toEqual(['a1', 'nota-local']);
    // pdfs no se tocó: ni viaja, así que no pisa el registro
    expect('pdfs' in p).toBe(false);
  });
  it('si la edición sí toca pdfs, fusiona y conserva el ajeno', () => {
    const p = parcheFusionado({ pdfs: [pdf] }, { pdfs: [] }, { pdfs: [{ id: 'pdf-2' }] });
    expect((p.pdfs as any[]).map(x => x.id)).toEqual(['pdf-1', 'pdf-2']);
  });
  it('servicios es atómico: gana lo local', () => {
    const p = parcheFusionado({ servicios: [{ a: 'srv' }] }, { servicios: [{ a: 1 }] }, { servicios: [{ a: 2 }] });
    expect(p.servicios).toEqual([{ a: 2 }]);
  });
  it('nunca emite undefined', () => {
    const p = parcheFusionado({}, { a: 1 }, { a: undefined });
    expect(Object.values(p).includes(undefined)).toBe(false);
  });
});
