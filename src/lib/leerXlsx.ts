/**
 * leerXlsx.ts — lee un .xlsx sin dependencias nuevas.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * La carga de la tarea 65 lee CSV, y su nota decía «un Excel se convierte a
 * CSV antes». Ese paso manual es justo donde se pierde información: Excel en
 * es-MX exporta con `;`, una razón social con coma rompe las columnas, y un
 * teléfono como `49  556179022166` se vuelve notación científica. La lista de
 * Luis llega en .xlsx, así que se lee el .xlsx.
 *
 * No se agregó `xlsx` ni `exceljs` al proyecto: un .xlsx es un ZIP con XML
 * dentro, y Node trae `zlib`. Son ~100 líneas contra una dependencia nueva en
 * la ruta de una carga que escribe en producción.
 *
 * Lo que SÍ soporta: ZIP con entradas guardadas (0) o deflate (8),
 * `sharedStrings`, celdas numéricas, de texto compartido e `inlineStr`.
 * Lo que NO: ZIP64, cifrado, fórmulas (se lee el valor cacheado) y fechas
 * (llegan como el número de serie de Excel; esta lista no trae ninguna).
 */

import { inflateRawSync } from 'zlib';

const FIRMA_EOCD = 0x06054b50;
const FIRMA_CENTRAL = 0x02014b50;
const FIRMA_LOCAL = 0x04034b50;

/** Descomprime UNA entrada del zip, por nombre exacto. */
export function entradaZip(buf: Buffer, nombre: string): string | null {
  // El directorio central está al final; se busca su firma hacia atrás
  // porque el comentario del zip es de largo variable.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 0x10000; i--) {
    if (buf.readUInt32LE(i) === FIRMA_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No parece un .xlsx: no se encontró el fin del directorio del ZIP.');

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== FIRMA_CENTRAL) break;
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const offsetLocal = buf.readUInt32LE(p + 42);
    const nombreEntrada = buf.toString('utf8', p + 46, p + 46 + largoNombre);

    if (nombreEntrada === nombre) {
      if (buf.readUInt32LE(offsetLocal) !== FIRMA_LOCAL) {
        throw new Error(`Entrada «${nombre}» con cabecera local inválida.`);
      }
      // La cabecera local repite nombre y extra, y sus largos pueden NO ser
      // los del directorio central: se leen de ahí.
      const lnLocal = buf.readUInt16LE(offsetLocal + 26);
      const leLocal = buf.readUInt16LE(offsetLocal + 28);
      const inicio = offsetLocal + 30 + lnLocal + leLocal;
      const datos = buf.subarray(inicio, inicio + comprimido);
      if (metodo === 0) return datos.toString('utf8');
      if (metodo === 8) return inflateRawSync(datos).toString('utf8');
      throw new Error(`Entrada «${nombre}» comprimida con un método que no se soporta (${metodo}).`);
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return null;
}

/** Deshace las entidades XML. `&amp;` al final, para no decodificar dos veces. */
export function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** Las cadenas compartidas, en orden: una celda `t="s"` guarda su índice. */
export function leerCadenasCompartidas(xml: string | null): string[] {
  if (!xml) return [];
  const fuera: string[] = [];
  for (const si of xml.match(/<si\b[^>]*\/>|<si\b[^>]*>[\s\S]*?<\/si>/g) ?? []) {
    // Un <si> puede traer varios <t> (texto con formato mezclado): se pegan.
    const partes = [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => desescapar(m[1]));
    fuera.push(partes.join(''));
  }
  return fuera;
}

/** Nombre de hoja → ruta de su XML dentro del zip. */
export function hojasDelLibro(workbook: string, rels: string): Map<string, string> {
  /*
   * Id y Target se leen por separado, no con un regex que exija ese orden:
   * en XML el orden de los atributos no está garantizado, y el archivo de
   * Luis los trae en ese orden por casualidad. Lo atrapó un test, no el
   * archivo real.
   */
  const porId = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(m[1])?.[1];
    if (id && target) porId.set(id, target.replace(/^\/?xl\//, '').replace(/^\.\//, ''));
  }
  // El atributo del id de relación va con prefijo de namespace (r:id) y el
  // orden de los atributos no está garantizado: se busca por separado.
  const salida = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const nombre = /name="([^"]*)"/.exec(attrs)?.[1];
    const rid = /r:id="([^"]*)"/.exec(attrs)?.[1] ?? /\bid="([^"]*)"/.exec(attrs)?.[1];
    if (nombre && rid && porId.has(rid)) {
      salida.set(desescapar(nombre), `xl/${porId.get(rid)}`);
    }
  }
  return salida;
}

/**
 * Celdas de una hoja, por letra de columna: `[{A:'2', B:'ACME'}, …]`.
 *
 * ⚠️ El orden de la alternancia de los regex NO es cosmético. Con
 * `<c …>…<\/c>` delante, una celda AUTOCERRADA se traga a la siguiente:
 * `<c r="C1"/><c r="D1"><v>5</v></c>` casaba como UNA sola coincidencia, con
 * la `r=` de C1 y el valor de D1. Resultado: todas las columnas corridas un
 * lugar a partir de la primera celda vacía — el RFC donde va el comercial y
 * el correo donde va el RFC. Lo atrapó cotejar contra una lectura
 * independiente del mismo archivo, no un test.
 */
export function leerHoja(xml: string, compartidas: string[]): Array<Record<string, string>> {
  const filas: Array<Record<string, string>> = [];
  for (const fila of xml.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const celdas: Record<string, string> = {};
    for (const c of fila.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = /\br="([A-Z]+)\d+"/.exec(c)?.[1];
      if (!ref) continue;
      const tipo = /\bt="([^"]+)"/.exec(c)?.[1];
      let valor = '';
      if (tipo === 'inlineStr') {
        valor = [...c.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => desescapar(m[1])).join('');
      } else {
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(c)?.[1];
        if (v != null) {
          valor = tipo === 's' ? (compartidas[Number(v)] ?? '') : desescapar(v);
        }
      }
      celdas[ref] = valor;
    }
    filas.push(celdas);
  }
  return filas;
}

/**
 * Lee una hoja por nombre. Devuelve las filas tal cual, sin interpretar el
 * encabezado: quien llame decide qué columna es qué.
 */
export function leerXlsx(buf: Buffer, nombreHoja: string): Array<Record<string, string>> {
  const workbook = entradaZip(buf, 'xl/workbook.xml');
  const rels = entradaZip(buf, 'xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('El .xlsx no trae xl/workbook.xml: ¿está completo?');

  const hojas = hojasDelLibro(workbook, rels);
  const ruta = hojas.get(nombreHoja);
  if (!ruta) {
    throw new Error(`No hay una hoja llamada «${nombreHoja}». Hojas: ${[...hojas.keys()].join(', ')}.`);
  }
  const xml = entradaZip(buf, ruta);
  if (!xml) throw new Error(`La hoja «${nombreHoja}» apunta a ${ruta} y esa entrada no está en el archivo.`);

  return leerHoja(xml, leerCadenasCompartidas(entradaZip(buf, 'xl/sharedStrings.xml')));
}
