import { describe, it, expect } from 'vitest';
import {
  normalizarEncabezado,
  resolverMapeo,
  detectarDelimitador,
  parsearCSV,
  leerRenglones,
  normalizarNombre,
  normalizarClave,
  rfcEfectivo,
  indexarBase,
  empatar,
  leerDias,
  leerRegimen,
  leerCodigoPostal,
  indexarUsuarios,
  resolverResponsable,
  planearRenglon,
  resumir,
  clientesConVariosRenglones,
  updateDePlan,
  completarDiasCredito,
  type ClienteBase,
  type RenglonLista,
} from './cargaClientesOk';

// ── Ayudas ──────────────────────────────────────────────────────────────────

const USUARIOS = indexarUsuarios([
  { email: 'itzel.laurean@vermur.com', nombre: 'Itzel Laurean' },
  { email: 'nohema.sosa@vermur.com', nombre: null },
]);

function renglon(p: Partial<RenglonLista> = {}): RenglonLista {
  return {
    linea: 2, numeroEntidad: '', nombre: '', rfc: '', codigoPostal: '',
    regimenFiscal: '', responsableVentas: '', diasGeneral: '',
    diasMaritimo: '', diasAereo: '', diasTerrestre: '', ...p,
  };
}

function cliente(p: Partial<ClienteBase> = {}): ClienteBase {
  return { id: 'CLI-0001', nombre: 'FIBREMEX', ...p };
}

function plan(r: Partial<RenglonLista>, c: Partial<ClienteBase>) {
  const base = [cliente(c)];
  const indice = indexarBase(base);
  const rr = renglon(r);
  return planearRenglon(rr, empatar(rr, indice), USUARIOS);
}

function accion(p: ReturnType<typeof plan>, campo: string) {
  return p.cambios.find(c => c.campo === campo);
}

// ═════════════════════════════════════════════════════════════════════════
describe('A. Mapeo de columnas', () => {
  it('normaliza acentos, signos y espacios del encabezado', () => {
    expect(normalizarEncabezado('Núm. de Entidad')).toBe('numdeentidad');
    expect(normalizarEncabezado('  RÉGIMEN_FISCAL  ')).toBe('regimenfiscal');
  });

  it('empata encabezados en español, en inglés y con puntuación', () => {
    const m = resolverMapeo(['Entity Number', 'Razón Social', 'Tax ID', 'C.P.', 'Régimen']);
    expect(m.porCampo.numeroEntidad).toBe(0);
    expect(m.porCampo.nombre).toBe(1);
    expect(m.porCampo.rfc).toBe(2);
    expect(m.porCampo.codigoPostal).toBe(3);
    expect(m.porCampo.regimenFiscal).toBe(4);
    expect(m.faltantes).toEqual([]);
  });

  it('las modalidades ganan a la columna general de días', () => {
    const m = resolverMapeo(['Nombre', 'Días crédito marítimo', 'Días de crédito', 'Aéreo']);
    expect(m.porCampo.diasMaritimo).toBe(1);
    expect(m.porCampo.diasGeneral).toBe(2);
    expect(m.porCampo.diasAereo).toBe(3);
  });

  it('una columna solo alimenta un campo', () => {
    const m = resolverMapeo(['Nombre', 'Cliente']);
    // «Cliente» también es alias de nombre, pero la columna 0 ya se usó.
    expect(m.porCampo.nombre).toBe(0);
    expect(m.ignorados).toEqual(['Cliente']);
  });

  it('reporta las columnas que no reconoce y el mínimo que falta', () => {
    const m = resolverMapeo(['Tax ID', 'Vendedor estrella del mes']);
    expect(m.ignorados).toEqual(['Vendedor estrella del mes']);
    expect(m.faltantes).toEqual(['nombre']);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('B. Parseo del archivo', () => {
  it('detecta el punto y coma de Excel en es-MX', () => {
    expect(detectarDelimitador('Nombre;RFC;CP')).toBe(';');
    expect(detectarDelimitador('Nombre,RFC,CP')).toBe(',');
    expect(detectarDelimitador('Nombre\tRFC\tCP')).toBe('\t');
  });

  it('no cuenta los delimitadores que van dentro de comillas', () => {
    expect(detectarDelimitador('"MULLER, S.A. DE C.V.";RFC;CP')).toBe(';');
  });

  it('respeta comillas, comas internas, comillas escapadas y CRLF', () => {
    const csv = 'Nombre,RFC\r\n"MULLER, S.A.",AAA010101AAA\r\n"EL ""GRANDE""",BBB020202BBB\r\n';
    expect(parsearCSV(csv)).toEqual([
      ['Nombre', 'RFC'],
      ['MULLER, S.A.', 'AAA010101AAA'],
      ['EL "GRANDE"', 'BBB020202BBB'],
    ]);
  });

  it('descarta el BOM y los renglones en blanco', () => {
    const csv = '﻿Nombre,RFC\n\nFIBREMEX,\n,,\n';
    expect(parsearCSV(csv)).toEqual([['Nombre', 'RFC'], ['FIBREMEX', '']]);
  });

  it('acepta saltos de línea dentro de comillas', () => {
    const csv = 'Nombre,Domicilio\nFIBREMEX,"Calle 1\nCol. Centro"';
    expect(parsearCSV(csv)[1]).toEqual(['FIBREMEX', 'Calle 1\nCol. Centro']);
  });

  it('leerRenglones salta los renglones sin ninguna llave', () => {
    const celdas = parsearCSV('Nombre,RFC,CP\nFIBREMEX,,54716\n,,99999\n');
    const r = leerRenglones(celdas, resolverMapeo(celdas[0]));
    expect(r).toHaveLength(1);
    expect(r[0].nombre).toBe('FIBREMEX');
    expect(r[0].linea).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('C. Normalización de nombres', () => {
  it('«FIBREMEX SA de CV» y «FIBREMEX» son el mismo cliente', () => {
    expect(normalizarNombre('FIBREMEX SA de CV')).toBe(normalizarNombre('FIBREMEX'));
    expect(normalizarNombre('Fibremex, S.A. de C.V.')).toBe('FIBREMEX');
  });

  it('«UNO RETAIL» y «UNORETAIL» son el mismo cliente (caso real)', () => {
    expect(normalizarNombre('UNO RETAIL')).toBe(normalizarNombre('UNORETAIL'));
  });

  it('quita acentos y resuelve el ampersand', () => {
    expect(normalizarNombre('MULLER TECHNOPLASTICS DE MÉXICO')).toBe('MULLERTECHNOPLASTICSDEMEXICO');
    expect(normalizarNombre('A & B')).toBe('AANDB');
  });

  it('no confunde un sufijo con parte del nombre', () => {
    expect(normalizarNombre('COPARMEX')).toBe('COPARMEX');
    expect(normalizarNombre('SCANIA')).toBe('SCANIA');
    expect(normalizarNombre('INCOTERM SA DE CV')).toBe('INCOTERM');
  });

  it('un nombre que es solo el sufijo no se queda vacío', () => {
    expect(normalizarNombre('SA DE CV')).toBe('SADECV');
  });

  it('el número de entidad ignora ceros a la izquierda y signos', () => {
    expect(normalizarClave('0924')).toBe('924');
    expect(normalizarClave(' 924 ')).toBe('924');
    expect(normalizarClave('ENT-924')).toBe('ENT924');
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('D. Empate', () => {
  const base: ClienteBase[] = [
    { id: 'CLI-0001', nombre: 'MULLER TECHNOPLASTICS DE MÉXICO', referenciaMagaya: '924' },
    { id: 'CLI-0002', nombre: 'FIBREMEX', numeroEntidadMagaya: 'AEL571218HP7' },
    { id: 'CLI-0003', nombre: 'UNO RETAIL' },
    { id: 'CLI-0004', nombre: 'UNORETAIL' },
  ];
  const indice = indexarBase(base);

  it('el número de entidad de Magaya empata contra referenciaMagaya', () => {
    const e = empatar(renglon({ numeroEntidad: '0924', nombre: 'OTRO NOMBRE' }), indice);
    expect(e.resultado).toBe('empatado');
    expect(e.llave).toBe('numeroEntidad');
    expect(e.cliente?.id).toBe('CLI-0001');
  });

  it('el RFC empata contra el Tax ID que Magaya dejó en numeroEntidadMagaya', () => {
    const e = empatar(renglon({ rfc: 'AEL571218HP7', nombre: 'NOMBRE DISTINTO' }), indice);
    expect(e.resultado).toBe('empatado');
    expect(e.llave).toBe('rfc');
    expect(e.cliente?.id).toBe('CLI-0002');
  });

  it('el nombre empata aunque la lista traiga el sufijo societario', () => {
    const e = empatar(renglon({ nombre: 'Fibremex S.A. de C.V.' }), indice);
    expect(e.resultado).toBe('empatado');
    expect(e.llave).toBe('nombre');
    expect(e.cliente?.id).toBe('CLI-0002');
  });

  it('dos clientes con el mismo nombre normalizado son AMBIGUOS y no se escriben', () => {
    const e = empatar(renglon({ nombre: 'Uno Retail' }), indice);
    expect(e.resultado).toBe('ambiguo');
    expect(e.candidatos).toEqual(['CLI-0003', 'CLI-0004']);
    const p = planearRenglon(renglon({ nombre: 'Uno Retail', rfc: 'AAA010101AAA' }), e, USUARIOS);
    expect(p.cambios).toEqual([]);
  });

  it('un renglón sin empate es «nuevo» y no escribe nada', () => {
    const e = empatar(renglon({ nombre: 'CLIENTE QUE NO EXISTE' }), indice);
    expect(e.resultado).toBe('nuevo');
    expect(planearRenglon(renglon({ nombre: 'X' }), e, USUARIOS).cambios).toEqual([]);
  });

  it('un renglón sin ninguna llave se reporta aparte', () => {
    expect(empatar(renglon({ codigoPostal: '54716' }), indice).resultado).toBe('sin_llave');
  });

  it('avisa cuando empata por RFC y los nombres no se parecen', () => {
    const p = plan(
      { nombre: 'EL GRANDE LOGISTICS', rfc: 'AEL571218HP7' },
      { nombre: 'COMERCIAL DEL NORTE', rfc: 'AEL571218HP7' },
    );
    expect(p.empate.llave).toBe('rfc');
    expect(p.avisos.join(' ')).toContain('los nombres no se parecen');
  });

  it('no avisa de nombres distintos cuando el empate fue por nombre', () => {
    const p = plan({ nombre: 'Fibremex SA de CV' }, { nombre: 'FIBREMEX' });
    expect(p.avisos.join(' ')).not.toContain('no se parecen');
  });

  it('rfcEfectivo prefiere el campo rfc y cae al Tax ID de Magaya', () => {
    expect(rfcEfectivo({ id: 'x', nombre: 'x', rfc: 'AEL571218HP7' })).toBe('AEL571218HP7');
    expect(rfcEfectivo({ id: 'x', nombre: 'x', numeroEntidadMagaya: 'AEL571218HP7' })).toBe('AEL571218HP7');
    // Un Tax ID extranjero no es RFC: no se usa como llave.
    expect(rfcEfectivo({ id: 'x', nombre: 'x', numeroEntidadMagaya: 'DE253556233' })).toBe('');
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('E. Lectura de valores', () => {
  it('los días aceptan «45 días» y rechazan lo que no es un plazo', () => {
    expect(leerDias('45')).toBe(45);
    expect(leerDias('45 días')).toBe(45);
    expect(leerDias(' 0 ')).toBe(0);
    expect(leerDias('')).toBeNull();
    expect(leerDias('contado')).toBeNull();
    expect(leerDias('-15')).toBeNull();
    expect(leerDias('30.5')).toBeNull();
    expect(leerDias('9999')).toBeNull();
  });

  it('el régimen acepta la clave suelta o con descripción, y valida el catálogo', () => {
    expect(leerRegimen('601')).toBe('601');
    expect(leerRegimen('601 - General de Ley Personas Morales')).toBe('601');
    expect(leerRegimen('626')).toBe('626');
    expect(leerRegimen('999')).toBeNull();
    expect(leerRegimen('General de Ley')).toBeNull();
  });

  it('el código postal exige 5 dígitos y descarta los extranjeros', () => {
    expect(leerCodigoPostal('54716')).toBe('54716');
    expect(leerCodigoPostal('  06030 ')).toBe('06030');
    expect(leerCodigoPostal('M6H 1C2')).toBeNull();
    expect(leerCodigoPostal('5471')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('F. Responsable de ventas', () => {
  it('empata por nombre contra los usuarios de la plataforma', () => {
    expect(resolverResponsable('Itzel Laurean', USUARIOS)).toBe('itzel.laurean@vermur.com');
    expect(resolverResponsable('ITZEL  LAUREAN', USUARIOS)).toBe('itzel.laurean@vermur.com');
  });

  it('empata por nombre derivado del correo cuando el usuario no trae nombre', () => {
    expect(resolverResponsable('Nohema Sosa', USUARIOS)).toBe('nohema.sosa@vermur.com');
  });

  it('acepta el correo escrito tal cual', () => {
    expect(resolverResponsable('Itzel.Laurean@Vermur.com', USUARIOS)).toBe('itzel.laurean@vermur.com');
  });

  it('un correo que no es usuario de la plataforma no se escribe', () => {
    expect(resolverResponsable('alguien@otraempresa.com', USUARIOS)).toBeNull();
  });

  it('un nombre sin empate se lista, no se inventa el correo', () => {
    const p = plan({ nombre: 'FIBREMEX', responsableVentas: 'Pedro Pérez' }, {});
    expect(accion(p, 'responsableVentas')?.accion).toBe('invalido');
    expect(p.avisos.join(' ')).toContain('Pedro Pérez');
    expect(updateDePlan(p).responsableVentas).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('G. Decisión campo por campo', () => {
  it('escribe el RFC cuando el cliente no tiene ninguno', () => {
    const p = plan({ nombre: 'FIBREMEX', rfc: 'AEL571218HP7' }, {});
    expect(accion(p, 'rfc')?.accion).toBe('escribe');
    expect(updateDePlan(p).rfc).toBe('AEL571218HP7');
  });

  it('NO pisa el RFC capturado a mano: lo lista como conflicto', () => {
    const p = plan({ nombre: 'FIBREMEX', rfc: 'AEL571218HP7' }, { rfc: 'CEM180528UG7' });
    expect(accion(p, 'rfc')?.accion).toBe('conflicto');
    expect(accion(p, 'rfc')?.razon).toContain('No se pisa');
    expect(updateDePlan(p).rfc).toBeUndefined();
  });

  it('el mismo RFC escrito con guiones no es conflicto', () => {
    const p = plan({ nombre: 'FIBREMEX', rfc: 'ael-571218-hp7' }, { rfc: 'AEL571218HP7' });
    expect(accion(p, 'rfc')?.accion).toBe('igual');
  });

  it('un RFC que no pasa la validación del SAT no se escribe', () => {
    const p = plan({ nombre: 'FIBREMEX', rfc: 'AEL571218HP9' }, {});
    expect(accion(p, 'rfc')?.accion).toBe('invalido');
    expect(accion(p, 'rfc')?.razon).toContain('dígito verificador');
  });

  it('un Tax ID extranjero del tipo DE253556233 no se escribe como RFC', () => {
    const p = plan({ nombre: 'FIBREMEX', rfc: 'DE253556233' }, {});
    expect(accion(p, 'rfc')?.accion).toBe('invalido');
  });

  it('avisa cuando el Tax ID de Magaya contradice el RFC de la lista', () => {
    const p = plan(
      { nombre: 'FIBREMEX', rfc: 'CEM180528UG7' },
      { numeroEntidadMagaya: 'AEL571218HP7' },
    );
    expect(accion(p, 'rfc')?.accion).toBe('escribe');
    expect(p.avisos.join(' ')).toContain('no es el RFC de la lista');
  });

  it('un CP extranjero se reporta inválido y el nacional se escribe', () => {
    expect(accion(plan({ nombre: 'FIBREMEX', codigoPostal: 'M6H 1C2' }, {}), 'codigoPostal')?.accion).toBe('invalido');
    expect(accion(plan({ nombre: 'FIBREMEX', codigoPostal: '54716' }, {}), 'codigoPostal')?.accion).toBe('escribe');
  });

  it('un régimen fuera del catálogo del SAT no se escribe', () => {
    const p = plan({ nombre: 'FIBREMEX', regimenFiscal: '999' }, {});
    expect(accion(p, 'regimenFiscal')?.accion).toBe('invalido');
  });

  it('una columna vacía es «sin dato», no un borrado', () => {
    const p = plan({ nombre: 'FIBREMEX' }, { rfc: 'AEL571218HP7', codigoPostal: '54716' });
    expect(accion(p, 'rfc')?.accion).toBe('sin_dato');
    expect(accion(p, 'codigoPostal')?.accion).toBe('sin_dato');
    expect(updateDePlan(p)).toEqual({});
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('H. Días de crédito por modalidad', () => {
  it('el cero de Magaya cuenta como vacío y se llena', () => {
    const p = plan(
      { nombre: 'FIBREMEX', diasMaritimo: '45', diasAereo: '20', diasTerrestre: '15' },
      { diasCreditoPorTipo: { maritimo: 0, aereo: 0, terrestre: 0, general: 0 } },
    );
    expect(accion(p, 'diasCreditoPorTipo.maritimo')?.accion).toBe('escribe');
    const u = updateDePlan(p);
    expect(u['diasCreditoPorTipo.maritimo']).toBe(45);
    expect(u['diasCreditoPorTipo.aereo']).toBe(20);
    expect(u['diasCreditoPorTipo.terrestre']).toBe(15);
  });

  it('un plazo mayor que cero no se pisa', () => {
    const p = plan(
      { nombre: 'FIBREMEX', diasMaritimo: '45' },
      { diasCreditoPorTipo: { maritimo: 30, aereo: 0, terrestre: 0, general: 0 } },
    );
    expect(accion(p, 'diasCreditoPorTipo.maritimo')?.accion).toBe('conflicto');
    expect(updateDePlan(p)['diasCreditoPorTipo.maritimo']).toBeUndefined();
  });

  it('el campo legacy `dias` sigue al general para que no divergan', () => {
    const p = plan({ nombre: 'FIBREMEX', diasGeneral: '30' }, { dias: 0 });
    expect(updateDePlan(p)['diasCreditoPorTipo.general']).toBe(30);
    expect(updateDePlan(p).dias).toBe(30);
  });

  it('un cero en la lista sobre un cero existente no es un cambio', () => {
    const p = plan({ nombre: 'FIBREMEX', diasMaritimo: '0' }, { diasCreditoPorTipo: { maritimo: 0 } });
    expect(accion(p, 'diasCreditoPorTipo.maritimo')?.accion).toBe('sin_dato');
  });

  it('«contado» en la columna de días se reporta inválido', () => {
    const p = plan({ nombre: 'FIBREMEX', diasGeneral: 'contado' }, {});
    expect(accion(p, 'diasCreditoPorTipo.general')?.accion).toBe('invalido');
  });

  it('completarDiasCredito arma el mapa completo cuando el cliente no lo tiene', () => {
    const c = cliente({ dias: 7 });
    const u = completarDiasCredito({ 'diasCreditoPorTipo.maritimo': 45 }, c);
    expect(u.diasCreditoPorTipo).toEqual({ maritimo: 45, aereo: 0, terrestre: 0, general: 7 });
    expect(u['diasCreditoPorTipo.maritimo']).toBeUndefined();
  });

  it('completarDiasCredito respeta el mapa que ya existe y usa rutas con punto', () => {
    const c = cliente({ diasCreditoPorTipo: { maritimo: 0, aereo: 0, terrestre: 0, general: 0 } });
    const u = completarDiasCredito({ 'diasCreditoPorTipo.maritimo': 45 }, c);
    expect(u).toEqual({ 'diasCreditoPorTipo.maritimo': 45 });
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('I. Marca «Heredado de Magaya»', () => {
  it('se completa en un cliente que ya se lee como de Magaya', () => {
    const p = plan({ nombre: 'FIBREMEX', numeroEntidad: '924' }, { referenciaMagaya: '924' });
    expect(accion(p, 'origenDatos')?.accion).toBe('escribe');
    expect(updateDePlan(p).origenDatos).toBe('magaya');
  });

  it('no se toca cuando ya dice magaya', () => {
    const p = plan({ nombre: 'FIBREMEX' }, { referenciaMagaya: '924', origenDatos: 'magaya' });
    expect(accion(p, 'origenDatos')?.accion).toBe('igual');
  });

  it('NO se marca un cliente creado en VermurOps: levantaría el freno de expediente', () => {
    const p = plan({ nombre: 'FIBREMEX', numeroEntidad: '924' }, { origenDatos: 'manual' });
    expect(accion(p, 'origenDatos')?.accion).toBe('conflicto');
    expect(accion(p, 'origenDatos')?.razon).toContain('freno de expediente');
    expect(updateDePlan(p).origenDatos).toBeUndefined();
  });

  it('no se marca a quien no tiene identificadores de Magaya; el enlace solo se sugiere', () => {
    const p = plan({ nombre: 'FIBREMEX', numeroEntidad: '924' }, {});
    expect(accion(p, 'origenDatos')?.accion).toBe('sin_dato');
    expect(p.avisos.join(' ')).toContain('se sugiere, no se escribe');
    expect(updateDePlan(p).numeroEntidadMagaya).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('J. Duplicados dentro de la lista', () => {
  it('detecta dos renglones que reclaman al mismo cliente', () => {
    const base: ClienteBase[] = [{ id: 'CLI-0002', nombre: 'FIBREMEX', rfc: 'CEM180528UG7' }];
    const indice = indexarBase(base);
    const renglones = [
      renglon({ linea: 2, nombre: 'FIBREMEX, S.A. de C.V.', rfc: 'CEM180528UG7', codigoPostal: '06030' }),
      renglon({ linea: 9, nombre: 'Fibremex', rfc: 'CEM180528UG7', codigoPostal: '31000' }),
    ];
    const planes = renglones.map(r => planearRenglon(r, empatar(r, indice), USUARIOS));
    expect(clientesConVariosRenglones(planes)).toEqual([
      { clienteId: 'CLI-0002', nombre: 'FIBREMEX', lineas: [2, 9] },
    ]);
  });

  it('un solo renglón por cliente no se reporta como duplicado', () => {
    const base: ClienteBase[] = [{ id: 'CLI-0001', nombre: 'FIBREMEX' }];
    const indice = indexarBase(base);
    const r = renglon({ nombre: 'FIBREMEX' });
    expect(clientesConVariosRenglones([planearRenglon(r, empatar(r, indice), USUARIOS)])).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
describe('K. Resumen de la corrida', () => {
  const base: ClienteBase[] = [
    { id: 'CLI-0001', nombre: 'FIBREMEX', referenciaMagaya: '1' },
    { id: 'CLI-0002', nombre: 'MULLER', referenciaMagaya: '2' },
    { id: 'CLI-0003', nombre: 'AUSENTE DE LA LISTA', referenciaMagaya: '3' },
  ];

  it('cuenta empatados, nuevos, sin empate, conflictos y ausentes', () => {
    const indice = indexarBase(base);
    const renglones = [
      renglon({ linea: 2, nombre: 'Fibremex SA de CV', rfc: 'AEL571218HP7' }),
      renglon({ linea: 3, nombre: 'MULLER', rfc: 'CEM180528UG7' }),
      renglon({ linea: 4, nombre: 'CLIENTE NUEVO', rfc: 'AEL571218HP7' }),
      renglon({ linea: 5, codigoPostal: '54716' }),
    ];
    const planes = renglones.map(r => planearRenglon(r, empatar(r, indice), USUARIOS));
    const res = resumir(planes, base);

    expect(res.renglones).toBe(4);
    expect(res.empatados).toBe(2);
    // El «nuevo» empata por RFC contra CLI-0001 solo si ya lo tuviera; aquí no.
    expect(res.nuevos + res.sinEmpate).toBe(2);
    expect(res.clientesConCambios).toBe(2);
    expect(res.ausentesDeLaLista).toEqual(['CLI-0003']);
    expect(res.porLlave.nombre).toBe(2);
  });

  it('un cliente ausente de la lista no aparece entre los que se tocan', () => {
    const indice = indexarBase(base);
    const r = renglon({ nombre: 'FIBREMEX', codigoPostal: '54716' });
    const res = resumir([planearRenglon(r, empatar(r, indice), USUARIOS)], base);
    expect(res.ausentesDeLaLista).toContain('CLI-0003');
    // El CP y la marca «Heredado de Magaya», que el cliente traía sin llenar.
    expect(res.camposAEscribir).toBe(2);
  });
});
