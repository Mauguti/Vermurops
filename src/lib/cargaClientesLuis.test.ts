/**
 * Las reglas de la carga del Excel de Luis.
 *
 * Cada bloque corresponde a una decisión que, si se equivoca, escribe un dato
 * malo en 342 clientes de producción sin que nadie lo note en pantalla.
 */
import { describe, expect, it } from 'vitest';
import {
  cpDeDireccion, esDireccionMexicana, juntarSiglas, leerCreditoLuis, leerDiasLuis,
  leerRenglonesLuis, leerRfcLuis, leerVerificacion, luisDiceQueNoEsta, masParecido,
  normalizarNombreLuis, plataformaTieneNombreMasCompleto, resolverColumnas,
  resolverComercial, sospechaDeDuplicado,
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

describe('🔴 el empate, y los dos duplicados que casi se crean', () => {
  /*
   * El 15-oct el modo en seco dijo 42 por crear y Luis había marcado 17. Dos
   * de los sobrantes ya existían en la plataforma.
   */
  it('«S.A.S» se ignora como sufijo: TRANSMARES ya no se duplica', () => {
    // Con la lista de la 65 esto NO empataba: «S.A.S» quedaba como «S A S» y
    // la lista tenía «SAS» pegado.
    expect(normalizarNombreLuis('TRANSMARES LOGISTICA S.A.S'))
      .toBe(normalizarNombreLuis('TRANSMARES LOGISTICA'));
  });

  it.each([
    ['ARYES S.A. DE C.V.', 'ARYES'],
    ['AIDA S.R.L.', 'AIDA'],
    ['ALMIG COMPRESSOREN GMBH', 'ALMIG COMPRESSOREN'],
    ['XIAMEN TRANS-CHINA LOGISTICS CO., LTD', 'XIAMEN TRANS-CHINA LOGISTICS'],
    ['SAGA ULUSLARARASI TASIMACILIK LIMITED', 'SAGA ULUSLARARASI TASIMACILIK'],
  ])('«%s» empata con «%s»', (plat, excel) => {
    expect(normalizarNombreLuis(plat)).toBe(normalizarNombreLuis(excel));
  });

  /* `juntarSiglas` NO debe comerse una inicial legítima. */
  it.each([
    ['A KAYSER AUTOMOTIVE', 'A KAYSER AUTOMOTIVE'],
    ['GRUPO A', 'GRUPO A'],
    ['S A S', 'SAS'],
    ['S. de R.L. de C.V.', 'S DE RL DE CV'],
  ])('juntarSiglas(«%s») = «%s»', (v, esperado) => {
    expect(juntarSiglas(v.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim())).toBe(esperado);
  });

  it('dos nombres de verdad distintos NO se fusionan', () => {
    expect(normalizarNombreLuis('TRANSPORTES DEL NORTE'))
      .not.toBe(normalizarNombreLuis('TRANSMARES LOGISTICA'));
  });
});

describe('la hoja «Verificación» de Luis', () => {
  const HOJA = [
    { A: '#', B: 'Cliente (Unificados)', C: 'RFC', E: 'Cliente encontrado en BD', G: 'Estado' },
    { A: '23', B: 'ARYES', E: 'ARYES SA DE CV', G: 'OK – coincide' },
    { A: '210', B: 'NEW TRAFFIC', E: '', G: 'No está en BD → en blanco' },
    { A: '99', B: 'OTRO', E: '', G: 'En BD pero sin dirección → en blanco' },
  ];

  it('indexa por número y trae el nombre exacto de la plataforma', () => {
    const v = leerVerificacion(HOJA);
    expect(v.get('23')?.nombreEnBD).toBe('ARYES SA DE CV');
    expect(v.get('210')?.estado).toMatch(/No está en BD/);
  });

  it('solo «No está en BD» cuenta como «créalo»', () => {
    const v = leerVerificacion(HOJA);
    expect(luisDiceQueNoEsta(v.get('210'))).toBe(true);
    expect(luisDiceQueNoEsta(v.get('23'))).toBe(false);
    /* «En BD pero sin dirección» SÍ está en la base: no se crea. */
    expect(luisDiceQueNoEsta(v.get('99'))).toBe(false);
    expect(luisDiceQueNoEsta(undefined)).toBe(false);
  });

  it('una hoja sin las columnas esperadas devuelve un mapa vacío, no truena', () => {
    expect(leerVerificacion([{ A: 'otra cosa' }]).size).toBe(0);
    expect(leerVerificacion([]).size).toBe(0);
  });
});

describe('🔴 el freno de duplicados', () => {
  const BASE = [
    { id: 'CLI-0162', nombre: 'NEW TRAFIC LOGISTICA S.A.S' },
    { id: 'CLI-0147', nombre: 'TRANSMARES LOGISTICA S.A.S' },
    { id: 'CLI-0500', nombre: 'ACME INDUSTRIAL' },
  ];

  /*
   * El caso real: Luis marcó «NEW TRAFFIC» como «No está en BD» —su cruce
   * falló por la F de diferencia— y el nombre normalizado tampoco empata. Con
   * las dos reglas en la mano se habría creado el duplicado de CLI-0162.
   */
  it('«NEW TRAFFIC» encuentra a «NEW TRAFIC LOGISTICA S.A.S» y NO se crea', () => {
    const p = masParecido('NEW TRAFFIC', BASE);
    expect(p?.id).toBe('CLI-0162');
    expect(sospechaDeDuplicado('NEW TRAFFIC', p)).toBe(true);
  });

  it('un nombre de verdad nuevo sí se crea', () => {
    const p = masParecido('JABONES Y PRODUCTOS ESPECIALIZADOS', BASE);
    expect(sospechaDeDuplicado('JABONES Y PRODUCTOS ESPECIALIZADOS', p)).toBe(false);
  });

  it('sin candidato no hay sospecha', () => {
    expect(sospechaDeDuplicado('MELANGE', null)).toBe(false);
    expect(masParecido('MELANGE', BASE)).toBeNull();
  });

  /* Tres letras en común no son una sospecha: «GLI» no es «GLOBAL». */
  it('un prefijo corto no frena nada', () => {
    const p = masParecido('GLI', [{ id: 'X', nombre: 'GLOBAL LOGISTICS' }]);
    expect(sospechaDeDuplicado('GLI', p)).toBe(false);
  });

  it('el candidato más parecido es el de más prefijo común, no el primero', () => {
    expect(masParecido('TRANSMARES LOGISTICA', BASE)?.id).toBe('CLI-0147');
  });
});
