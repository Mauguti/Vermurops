/**
 * Las reglas de la carga del Excel de Luis.
 *
 * Cada bloque corresponde a una decisión que, si se equivoca, escribe un dato
 * malo en 342 clientes de producción sin que nadie lo note en pantalla.
 */
import { describe, expect, it } from 'vitest';
import {
  cpDeDireccion, esDireccionMexicana, leerCreditoLuis, leerDiasLuis, leerRenglonesLuis,
  leerRfcLuis, plataformaTieneNombreMasCompleto, resolverColumnas, resolverComercial,
} from './cargaClientesLuis';

describe('las columnas se buscan por encabezado, no por letra', () => {
  it('resuelve los diez campos de la hoja real', () => {
    const { mapeo, faltan } = resolverColumnas({
      A: '#', B: 'Cliente (nombre correcto)', C: 'Comercial', D: 'RFC', E: 'Antigüedad',
      F: 'Correo', G: 'Telefono', H: 'Dirección', I: 'Dias de Credito', J: 'Crédito (MXN)',
    });
    expect(faltan).toEqual([]);
    expect(mapeo).toEqual({
      numero: 'A', nombre: 'B', comercial: 'C', rfc: 'D', antiguedad: 'E',
      correo: 'F', telefono: 'G', direccion: 'H', dias: 'I', credito: 'J',
    });
  });

  /*
   * La hoja trae dos columnas sueltas (O y P con un 0). Por letra, cualquier
   * inserción futura correría todo; por encabezado, no.
   */
  it('una columna extra no corre nada', () => {
    const { mapeo } = resolverColumnas({ A: '#', B: 'Cliente', C: 'Nueva', D: 'RFC' });
    expect(mapeo.rfc).toBe('D');
  });

  it('sin la columna del nombre no se procesa nada', () => {
    expect(resolverColumnas({ A: 'RFC' }).faltan).toEqual(['Cliente (nombre correcto)']);
    expect(leerRenglonesLuis([{ A: 'RFC' }, { A: 'X' }]).renglones).toEqual([]);
  });

  it('una fila sin nombre se descarta, no se carga vacía', () => {
    const { renglones } = leerRenglonesLuis([
      { A: '#', B: 'Cliente' },
      { A: '2', B: 'ACME' },
      { A: '3', B: '   ' },
    ]);
    expect(renglones.map(r => r.nombre)).toEqual(['ACME']);
    expect(renglones[0].fila).toBe(2);
  });
});

describe('el ejecutivo de ventas', () => {
  it.each([
    ['NOEMI', 'noemi.casas@vermur.com'],
    ['ITZEL', 'itzel.laurean@vermur.com'],
    ['NOHEMA', 'nohema.sosa@vermur.com'],
    ['JOSÉ MARÍA', 'jose.tejeda@vermur.com'],
    ['jose maria', 'jose.tejeda@vermur.com'],
  ])('«%s» → %s', (valor, correo) => {
    expect(resolverComercial(valor)).toEqual({ tipo: 'usuario', correo });
  });

  it('CLIENTES OFICINA es cuenta de la casa: sin ejecutivo', () => {
    expect(resolverComercial('CLIENTES OFICINA')).toEqual({ tipo: 'sin_ejecutivo' });
  });

  /* 180 de 342 vienen vacíos: eso NO es «quitarle el ejecutivo». */
  it('vacío no toca nada', () => {
    expect(resolverComercial('')).toEqual({ tipo: 'vacio' });
  });

  it.each(['GABRIELA', 'KAREN'])('%s va a revisión hasta que Luis conteste', (q) => {
    const r = resolverComercial(q);
    expect(r.tipo).toBe('revision');
  });

  it('un nombre que no está en el mapeo NO se adivina', () => {
    expect(resolverComercial('PEDRO').tipo).toBe('revision');
  });
});

describe('🔴 el cero es «no capturado», no «cero»', () => {
  /*
   * 277 de 342 traen días en 0 y 309 traen crédito en 0. Escribirlos pondría
   * «pago de contado» y «sin línea de crédito» en casi toda la cartera.
   */
  it('días en 0 no se escribe', () => {
    expect(leerDiasLuis('0')).toBeNull();
  });
  it('crédito en 0 no se escribe', () => {
    expect(leerCreditoLuis('0')).toBeNull();
  });
  it.each([['30', 30], ['90', 90], ['Net 90', 90], ['45 días', 45]])('«%s» → %s', (v, n) => {
    expect(leerDiasLuis(v)).toBe(n);
  });
  it.each(['', 'contado', 'N/A'])('«%s» no se escribe', (v) => {
    expect(leerDiasLuis(v)).toBeNull();
  });
  it('un plazo absurdo no se carga', () => {
    expect(leerDiasLuis('900')).toBeNull();
  });
  it.each([['150000', 150000], ['$1,500,000', 1500000], ['  250000  ', 250000]])('crédito «%s» → %s', (v, n) => {
    expect(leerCreditoLuis(v)).toBe(n);
  });
  it('un crédito negativo no se carga', () => {
    expect(leerCreditoLuis('-5000')).toBeNull();
  });
});

describe('🔴 un C.P. de cinco dígitos puede no ser mexicano', () => {
  it('de una dirección mexicana sí se saca', () => {
    expect(cpDeDireccion('Calle 8 No 11, Naucalpan, Estado De México, C.P. 53370, Mexico'))
      .toEqual({ cp: '53370' });
  });

  /*
   * El caso real: 171 direcciones del extranjero traen un C.P. de cinco
   * dígitos. El 37574 es alemán; en `codigoPostal` se vuelve un CP mexicano
   * para todo lo demás, y los CP deciden cosas fiscales.
   */
  it.each([
    'Hulleser Landstraße 43, Einbeck, Ei, C.P. 37574, Germany',
    'Viale Eiffel 100, Roma, Lazio, C.P. 00148, Italy',
  ])('del extranjero NO: %s', (dir) => {
    const r = cpDeDireccion(dir);
    expect(r.cp).toBeNull();
    expect((r as { razon: string }).razon).toContain('extranjero');
  });

  it('una dirección sin C.P. lo dice', () => {
    expect(cpDeDireccion('Calle Falsa 123, Mexico').cp).toBeNull();
  });

  it('no confunde un número largo con un C.P.', () => {
    expect(cpDeDireccion('Carretera km 123456, Mexico').cp).toBeNull();
  });

  it.each([
    ['Av. Juárez 1, CDMX, Mexico', true],
    ['Av. Juárez 1, CDMX, México', true],
    ['Hafenstrasse 1, Bonn, Germany', false],
    ['Calle 1, Mexico City, Germany', false],
  ])('esDireccionMexicana(«%s») = %s', (dir, esperado) => {
    expect(esDireccionMexicana(dir)).toBe(esperado);
  });
});

describe('el RFC', () => {
  it('uno válido pasa', () => {
    expect(leerRfcLuis('APO5207178H0')).toEqual({ rfc: 'APO5207178H0' });
  });
  it.each(['XAXX010101000', 'XEXX010101000'])('el genérico %s no identifica a nadie', (g) => {
    const r = leerRfcLuis(g);
    expect(r.rfc).toBeNull();
    expect((r as { razon: string }).razon).toContain('genérico');
  });
  it.each(['DE812193831', '7719884', 'AGlobal', '91441302314937699W'])(
    '«%s» no tiene forma de RFC mexicano', (v) => {
      expect(leerRfcLuis(v).rfc).toBeNull();
    });
  it('vacío es vacío, no inválido', () => {
    expect((leerRfcLuis('') as { razon: string }).razon).toBe('sin RFC');
  });
});

describe('🔴 el nombre del Excel a veces es MENOS completo', () => {
  /*
   * 169 de los 322 que empatan. Pisar el nombre borra la forma societaria, y
   * eso es lo que se imprime en la factura y en el BL.
   */
  it.each([
    ['A KAYSER AUTOMOTIVE SYSTEMS GMBH', 'A KAYSER AUTOMOTIVE SYSTEMS'],
    ['ARYES SA DE CV', 'ARYES'],
    ['AIDA SRL', 'AIDA'],
    ['BAODING DANBAO TRADING CO LTD', 'BAODING DANBAO TRADING'],
  ])('la plataforma tiene «%s» y el Excel «%s»: no se pisa', (plat, excel) => {
    expect(plataformaTieneNombreMasCompleto(plat, excel)).toBe(true);
  });

  it('mayúsculas y acentos no cuentan como más completo', () => {
    expect(plataformaTieneNombreMasCompleto(
      'Am Zehnhoff-Söns International Logistic Services',
      'AM ZEHNHOFF-SÖNS INTERNATIONAL LOGISTIC SERVICES',
    )).toBe(false);
  });

  it('dos nombres de verdad distintos NO caen aquí', () => {
    expect(plataformaTieneNombreMasCompleto('TRANSPORTES DEL NORTE', 'ACME LOGISTICS')).toBe(false);
  });

  it('el mismo nombre tampoco', () => {
    expect(plataformaTieneNombreMasCompleto('ACME', 'ACME')).toBe(false);
  });

  /* Un prefijo que NO es sufijo societario igual se protege: no se pisa a ciegas. */
  it('la plataforma más larga por cualquier razón se respeta', () => {
    expect(plataformaTieneNombreMasCompleto('OMEC MOTORS DE MEXICO', 'OMEC MOTORS')).toBe(true);
  });
});
