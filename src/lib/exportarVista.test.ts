/**
 * exportarVista.test.ts (tarea 61)
 *
 * Lo que protegen: que el archivo con el que Julio cierra el mes traiga las
 * MISMAS columnas que la pantalla, en el mismo orden. El bug que esto evita
 * no truena: exporta un CSV con una columna de menos, o con «[object Object]»
 * donde iba un badge, y se descubre en Excel.
 */

import { describe, it, expect } from 'vitest';
import { createColumnHelper } from '@tanstack/react-table';
import { columnasDeVista, csvDeVista, tablaDeVista } from './exportarVista';

interface Fila {
  folio: string;
  monto: number;
  moneda: string;
  bloqueado?: boolean;
  nota: string | null;
}

const col = createColumnHelper<Fila>();

const CATALOGO = [
  col.accessor('folio', { id: 'folio', header: 'Folio' }),
  col.accessor('monto', { id: 'monto', header: 'Monto' }),
  col.accessor('moneda', { id: 'moneda', header: 'Moneda' }),
  // Una columna de badge: su valor plano vive en meta.csv.
  col.accessor(f => (f.bloqueado ? 'si' : 'no'), {
    id: 'bloqueado', header: 'No pagar',
    meta: { csv: (f: Fila) => (f.bloqueado ? 'Sí' : '') },
  }),
  col.accessor(f => f.nota ?? '', { id: 'nota', header: 'Nota' }),
];

const DATOS: Fila[] = [
  { folio: 'OC-2026-0581', monto: 12000, moneda: 'MXN', bloqueado: true, nota: null },
  { folio: 'OC-2026-0583', monto: 900, moneda: 'USD', nota: 'dice "urgente"' },
];

describe('A · las columnas son las de la vista', () => {
  it('respeta el orden de la vista, no el del catálogo', () => {
    const vista = { columnas: [{ id: 'moneda' }, { id: 'folio' }] };
    expect(columnasDeVista(CATALOGO, vista).map(c => (c as { id: string }).id))
      .toEqual(['moneda', 'folio']);
    expect(tablaDeVista(CATALOGO, vista, DATOS).headers).toEqual(['Moneda', 'Folio']);
  });

  it('una columna oculta en la vista NO se exporta', () => {
    const { headers } = tablaDeVista(CATALOGO, { columnas: [{ id: 'folio' }] }, DATOS);
    expect(headers).toEqual(['Folio']);
  });

  /*
   * Una vista guardada hace meses puede nombrar una columna que ya no existe.
   * La tabla la ignora en silencio; el CSV tiene que hacer lo mismo, o el
   * export truena justo para quien tiene la vista más vieja.
   */
  it('ignora una columna que el catálogo ya no tiene', () => {
    const vista = { columnas: [{ id: 'folio' }, { id: 'columnaQueSeFue' }, { id: 'monto' }] };
    expect(tablaDeVista(CATALOGO, vista, DATOS).headers).toEqual(['Folio', 'Monto']);
  });

  it('sin vista exporta el catálogo completo', () => {
    expect(tablaDeVista(CATALOGO, null, DATOS).headers)
      .toEqual(['Folio', 'Monto', 'Moneda', 'No pagar', 'Nota']);
  });
});

describe('B · el valor de la celda', () => {
  it('una columna de badge usa meta.csv, no el accessor', () => {
    const vista = { columnas: [{ id: 'bloqueado' }] };
    expect(tablaDeVista(CATALOGO, vista, DATOS).rows).toEqual([['Sí'], ['']]);
  });

  it('un número sigue siendo número: la hoja lo suma', () => {
    const { rows } = tablaDeVista(CATALOGO, { columnas: [{ id: 'monto' }] }, DATOS);
    expect(rows).toEqual([[12000], [900]]);
  });

  it('un null sale vacío, nunca «null»', () => {
    const { rows } = tablaDeVista(CATALOGO, { columnas: [{ id: 'nota' }] }, DATOS);
    expect(rows[0]).toEqual(['']);
  });
});

describe('C · el CSV', () => {
  it('entrecomilla todo y dobla las comillas internas', () => {
    const csv = csvDeVista(CATALOGO, { columnas: [{ id: 'folio' }, { id: 'nota' }] }, DATOS);
    expect(csv.split('\n')).toEqual([
      '"Folio","Nota"',
      '"OC-2026-0581",""',
      '"OC-2026-0583","dice ""urgente"""',
    ]);
  });

  it('sin datos queda el encabezado solo, no un archivo vacío', () => {
    expect(csvDeVista(CATALOGO, { columnas: [{ id: 'folio' }] }, []))
      .toBe('"Folio"');
  });
});
