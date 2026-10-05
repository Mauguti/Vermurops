/**
 * exportarVista.ts
 *
 * El CSV de una tabla configurable sale con las columnas DE LA VISTA: las
 * mismas, en el mismo orden, con el mismo encabezado que se ve en pantalla.
 *
 * Antes cada pantalla llevaba su lista de encabezados escrita a mano al lado
 * de la tabla, así que agregar una columna la dejaba fuera del archivo sin
 * que nadie se enterara — y Julio cierra el mes con ese archivo. Aquí el
 * catálogo de columnas es la única fuente: lo que se ve es lo que se exporta.
 *
 * Una columna de badges, enlaces o iconos declara su valor plano en
 * `meta.csv`; sin eso se usa el accessor, que es lo correcto para texto y
 * números.
 *
 * Sin React, sin Firestore.
 */

import type { ColumnDef } from '@tanstack/react-table';
import type { ColumnaVista, SpreadsheetColumnMeta } from '../components/table/SpreadsheetTable';

/** El id de una columna, venga de `id` o de `accessorKey`. */
function idDeColumna(c: ColumnDef<any, any>): string {
  return (c as { id?: string }).id ?? String((c as { accessorKey?: string }).accessorKey ?? '');
}

/** El encabezado legible. Si el header es JSX se cae al id, no a basura. */
function encabezadoDeColumna(c: ColumnDef<any, any>): string {
  return typeof c.header === 'string' ? c.header : idDeColumna(c);
}

/**
 * El valor plano de una celda: `meta.csv` si la columna lo declara, y si no
 * el accessor (función o llave). Un `null`/`undefined` sale como texto vacío,
 * nunca como «null» en la celda de una hoja de cálculo.
 */
function valorDeCelda<T>(columna: ColumnDef<T, any>, fila: T): string | number {
  const meta = columna.meta as SpreadsheetColumnMeta<T> | undefined;
  if (meta?.csv) return meta.csv(fila);

  const fn = (columna as { accessorFn?: (f: T, i: number) => unknown }).accessorFn;
  const llave = (columna as { accessorKey?: string }).accessorKey;
  const v = fn ? fn(fila, 0) : llave ? (fila as Record<string, unknown>)[llave] : '';

  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}

export interface TablaCSV {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Las columnas de la vista, en su orden, resueltas contra el catálogo. Una
 * columna que la vista nombra y el catálogo ya no tiene se ignora en silencio
 * —igual que hace la tabla— para que una vista guardada hace meses siga
 * exportando. Sin vista: el catálogo completo.
 */
export function columnasDeVista<T>(
  catalogo: readonly ColumnDef<T, any>[],
  vista?: { columnas: ColumnaVista[] } | null,
): ColumnDef<T, any>[] {
  if (!vista || vista.columnas.length === 0) return [...catalogo];
  const porId = new Map(catalogo.map(c => [idDeColumna(c), c]));
  return vista.columnas
    .map(c => porId.get(c.id))
    .filter((c): c is ColumnDef<T, any> => !!c);
}

/** Encabezados y renglones, ya planos. Es lo que se prueba. */
export function tablaDeVista<T>(
  catalogo: readonly ColumnDef<T, any>[],
  vista: { columnas: ColumnaVista[] } | null | undefined,
  datos: readonly T[],
): TablaCSV {
  const cols = columnasDeVista(catalogo, vista);
  return {
    headers: cols.map(encabezadoDeColumna),
    rows: datos.map(fila => cols.map(c => valorDeCelda(c, fila))),
  };
}

/** Un campo de CSV: siempre entrecomillado, con las comillas internas dobladas. */
function campo(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}

/** El CSV completo, listo para el Blob. */
export function csvDeVista<T>(
  catalogo: readonly ColumnDef<T, any>[],
  vista: { columnas: ColumnaVista[] } | null | undefined,
  datos: readonly T[],
): string {
  const { headers, rows } = tablaDeVista(catalogo, vista, datos);
  return [headers.map(campo).join(','), ...rows.map(r => r.map(campo).join(','))].join('\n');
}

/**
 * Baja el archivo. Lo único que toca el DOM, aparte para que todo lo de
 * arriba se pueda probar sin navegador.
 */
export function descargarCSV(nombreBase: string, csv: string): void {
  const nombre = `${nombreBase}_${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
