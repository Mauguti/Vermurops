/**
 * El lector de .xlsx, con un libro armado a mano.
 *
 * El test que importa es el de la **celda autocerrada**: la primera versión
 * de este lector corría todas las columnas un lugar a partir de la primera
 * celda vacía —el RFC donde va el comercial, el correo donde va el RFC— y lo
 * atrapó cotejar contra una lectura independiente del archivo de Luis, no un
 * test. Esto es ese cotejo, convertido en red.
 */
import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'zlib';
import {
  desescapar, entradaZip, hojasDelLibro, leerCadenasCompartidas, leerHoja, leerXlsx,
} from './leerXlsx';

/** Un ZIP mínimo (deflate), suficiente para que el lector lo recorra. */
function zip(entradas: Array<[string, string]>): Buffer {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let offset = 0;
  for (const [nombre, contenido] of entradas) {
    const crudo = Buffer.from(contenido, 'utf8');
    const comp = deflateRawSync(crudo);
    const n = Buffer.from(nombre, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);                      // deflate
    local.writeUInt32LE(0, 14);                     // crc: el lector no lo mira
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    locales.push(local, n, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(crudo.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    centrales.push(central, n);
    offset += 30 + n.length + comp.length;
  }
  const cuerpo = Buffer.concat(locales);
  const dir = Buffer.concat(centrales);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, dir, eocd]);
}

const COMPARTIDAS = `<sst><si><t>ACME</t></si><si><t>MX</t></si><si><t>Rico &amp; Co</t></si></sst>`;
const WORKBOOK = `<workbook><sheets><sheet name="Maestro" sheetId="1" r:id="rId1"/><sheet name="Otra" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const RELS = `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`;

/*
 * La fila 2 es el caso del bug: C está AUTOCERRADA y vacía, y D trae valor.
 * Si el regex se come las dos, D aterriza en C.
 */
const HOJA1 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2"><v>7</v></c><c r="B2"/><c r="C2"/><c r="D2" t="s"><v>2</v></c></row>
<row r="3"/>
<row r="4"><c r="A4" t="inlineStr"><is><t>en línea</t></is></c></row>
</sheetData></worksheet>`;

const libro = () => zip([
  ['xl/workbook.xml', WORKBOOK],
  ['xl/_rels/workbook.xml.rels', RELS],
  ['xl/sharedStrings.xml', COMPARTIDAS],
  ['xl/worksheets/sheet1.xml', HOJA1],
  ['xl/worksheets/sheet2.xml', `<worksheet><sheetData/></worksheet>`],
]);

describe('el zip', () => {
  it('saca una entrada por nombre', () => {
    expect(entradaZip(libro(), 'xl/workbook.xml')).toBe(WORKBOOK);
  });
  it('una entrada que no está da null, no revienta', () => {
    expect(entradaZip(libro(), 'xl/noExiste.xml')).toBeNull();
  });
  it('lo que no es un zip lo dice claro', () => {
    expect(() => entradaZip(Buffer.from('no soy un zip'), 'x')).toThrow(/no se encontró el fin del directorio/);
  });
});

describe('🔴 la celda autocerrada NO se come a la siguiente', () => {
  it('la columna D se queda en D, no se corre a C', () => {
    const filas = leerXlsx(libro(), 'Maestro');
    expect(filas[1].A).toBe('7');
    expect(filas[1].B).toBe('');
    expect(filas[1].C).toBe('');
    expect(filas[1].D).toBe('Rico & Co');   // ← aquí vivía el bug
  });

  it('una FILA autocerrada tampoco se come a la siguiente', () => {
    const filas = leerXlsx(libro(), 'Maestro');
    expect(filas.length).toBe(4);
    expect(filas[2]).toEqual({});           // <row r="3"/>
    expect(filas[3].A).toBe('en línea');
  });
});

describe('las cadenas y el texto', () => {
  it('resuelve el índice de las compartidas', () => {
    const filas = leerXlsx(libro(), 'Maestro');
    expect(filas[0]).toEqual({ A: 'ACME', B: 'MX' });
  });
  it('un <si> autocerrado no desalinea el índice de los que siguen', () => {
    const ss = leerCadenasCompartidas(`<sst><si/><si><t>dos</t></si></sst>`);
    expect(ss).toEqual(['', 'dos']);
  });
  it('desescapar resuelve &amp; AL FINAL, para no decodificar dos veces', () => {
    expect(desescapar('&amp;lt;')).toBe('&lt;');
    expect(desescapar('&#193;rea &#x41;')).toBe('Área A');
  });
  it('acentos y UTF-8 de verdad', () => {
    expect(desescapar('Landstra&#xDF;e')).toBe('Landstraße');
  });
});

describe('las hojas', () => {
  it('resuelve nombre → ruta, aunque el orden de los atributos cambie', () => {
    const h = hojasDelLibro(
      `<workbook><sheets><sheet r:id="rId9" name="Verificación"/></sheets></workbook>`,
      `<Relationships><Relationship Target="/xl/worksheets/sheet3.xml" Id="rId9"/></Relationships>`,
    );
    expect(h.get('Verificación')).toBe('xl/worksheets/sheet3.xml');
  });
  it('una hoja que no existe dice cuáles sí', () => {
    expect(() => leerXlsx(libro(), 'Maestro de clientes')).toThrow(/Hojas: Maestro, Otra/);
  });
  it('leerHoja sin compartidas no truena: deja la celda vacía', () => {
    expect(leerHoja(`<sheetData><row><c r="A1" t="s"><v>5</v></c></row></sheetData>`, [])).toEqual([{ A: '' }]);
  });
});
