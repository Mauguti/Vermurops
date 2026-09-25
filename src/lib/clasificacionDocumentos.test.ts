/**
 * Tests de clasificacionDocumentos.ts (D-1).
 *
 * La frontera con n8n es contrato externo: puede cambiar sin avisar. Estos
 * tests fijan que lo malformado se rechaza, lo desconocido se degrada (nunca
 * se promueve), y ningún aviso se pierde por no estar en el diccionario.
 */

import { describe, it, expect } from 'vitest';
import {
  validarClasificacion,
  traducirAviso,
  resolverTipoEsperado,
  etiquetaDocExpediente,
  etiquetaDocEmbarque,
  estadoGuardable,
  estadoChecklist,
  derivarDocsAlta,
  precargaFacturaProveedor,
  cotejarTotalConOC,
  DOCUMENTOS_EXPEDIENTE,
  type ExpedienteCliente,
  type DocExpediente,
} from './clasificacionDocumentos';
import type { DocsAlta } from '../components/clientes/ClientesData';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const respuestaExpediente = {
  ok: true,
  tipo: 'acta_constitutiva',
  confianza: 'alta',
  razonTipo: 'Encabezado notarial con número de escritura',
  razonSocial: 'SIEMENS SA DE CV',
  rfc: 'SIE840101AAA',
  nombreOriginal: 'IMG-20260904-WA0012.jpg',
  nombrePropuesto: 'Acta constitutiva Siemens',
  datos: { numeroEscritura: '12,345', notario: 'Lic. Pérez' },
  legible: true,
  vencido: false,
  observaciones: '',
  avisos: [],
  requiereRevision: false,
};

const docCargado = (estado: DocExpediente['estado'] = 'cargado'): DocExpediente => ({
  nombre: 'Acta constitutiva Siemens',
  nombreOriginal: 'IMG.jpg',
  storagePath: 'expedientes/CLI-1/acta.jpg',
  url: 'https://storage/acta.jpg',
  confianza: 'alta',
  estado,
  datos: {},
  avisos: [],
  subidoPor: 'admin@vermur.com',
  fechaSubida: '2026-09-04T10:00:00Z',
});

const DOCS_VACIO: DocsAlta = {
  acta: false, poder: false, identificacion: false,
  csf: false, comprobante: false, bancaria: false,
};

// ─── A · Frontera ────────────────────────────────────────────────────────────

describe('validarClasificacion — frontera con n8n', () => {
  it('acepta la respuesta bien formada del flujo expediente', () => {
    const r = validarClasificacion(respuestaExpediente);
    expect(r.valida).toBe(true);
    expect(r.datos?.tipo).toBe('acta_constitutiva');
    expect(r.datos?.nombrePropuesto).toBe('Acta constitutiva Siemens');
    expect(r.datos?.rfc).toBe('SIE840101AAA');
  });

  it('rechaza lo que no es objeto', () => {
    for (const bruto of [null, undefined, 'error', 42, ['ok']]) {
      expect(validarClasificacion(bruto).valida).toBe(false);
    }
  });

  it('rechaza ok:false y propaga el detalle del error', () => {
    const r = validarClasificacion({ ok: false, error: 'archivo corrupto' });
    expect(r.valida).toBe(false);
    expect(r.motivo).toContain('archivo corrupto');
  });

  it('rechaza la respuesta sin tipo: sin clasificar no es clasificado', () => {
    const r = validarClasificacion({ ...respuestaExpediente, tipo: '' });
    expect(r.valida).toBe(false);
    expect(r.motivo).toContain('tipo');
  });

  it('sin nombrePropuesto cae al nombre original, no a vacío', () => {
    const r = validarClasificacion({ ...respuestaExpediente, nombrePropuesto: undefined });
    expect(r.datos?.nombrePropuesto).toBe('IMG-20260904-WA0012.jpg');
  });

  it('confianza desconocida se degrada a baja, nunca se promueve', () => {
    const r = validarClasificacion({ ...respuestaExpediente, confianza: 'altísima' });
    expect(r.datos?.confianza).toBe('baja');
  });

  it('legible ausente se asume true: ilegible debe ser afirmación, no accidente', () => {
    const r = validarClasificacion({ ...respuestaExpediente, legible: undefined });
    expect(r.datos?.legible).toBe(true);
  });

  it('descarta avisos que no son texto sin tirar los demás', () => {
    const r = validarClasificacion({ ...respuestaExpediente, avisos: ['vencido', 42, null, '  '] });
    expect(r.datos?.avisos).toEqual(['vencido']);
  });

  it('destinoSugerido inválido queda null: el clasificador propone, no impone', () => {
    const r = validarClasificacion({ ...respuestaExpediente, destinoSugerido: 'papelera' });
    expect(r.datos?.destinoSugerido).toBeNull();
    const r2 = validarClasificacion({ ...respuestaExpediente, destinoSugerido: 'facturas_proveedor' });
    expect(r2.datos?.destinoSugerido).toBe('facturas_proveedor');
  });

  it('datos que no son objeto quedan como objeto vacío', () => {
    const r = validarClasificacion({ ...respuestaExpediente, datos: 'n/a' });
    expect(r.datos?.datos).toEqual({});
  });
});

// ─── B · Avisos ──────────────────────────────────────────────────────────────

describe('traducirAviso — nunca se pierde un aviso', () => {
  it('traduce los códigos conocidos', () => {
    expect(traducirAviso('rfc_no_coincide')).toContain('RFC');
    expect(traducirAviso('contenedor_no_coincide')).toContain('otro embarque');
  });

  it('un código nuevo de n8n se humaniza en vez de ocultarse', () => {
    const msg = traducirAviso('sello_fiscal_invalido');
    expect(msg).toContain('sello fiscal invalido');
    expect(msg).toContain('clasificador');
  });
});

// ─── C · Tipo esperado vs detectado ──────────────────────────────────────────

describe('resolverTipoEsperado', () => {
  it('coincide cuando no se declaró esperado o cuando son iguales', () => {
    expect(resolverTipoEsperado(null, 'acta_constitutiva', etiquetaDocExpediente).coincide).toBe(true);
    expect(resolverTipoEsperado('acta_constitutiva', 'acta_constitutiva', etiquetaDocExpediente).coincide).toBe(true);
  });

  it('la discrepancia nombra ambos tipos con su etiqueta', () => {
    const r = resolverTipoEsperado('poder_notarial', 'acta_constitutiva', etiquetaDocExpediente);
    expect(r.coincide).toBe(false);
    expect(r.mensaje).toContain('Poder notarial');
    expect(r.mensaje).toContain('Acta constitutiva');
  });

  it('las etiquetas cubren tipos fuera de taxonomía sin tronar', () => {
    expect(etiquetaDocExpediente('algo_raro')).toBe('algo raro');
    expect(etiquetaDocEmbarque('bl_maritimo')).toBe('BL marítimo');
    expect(etiquetaDocEmbarque('algo_raro')).toBe('algo raro');
  });
});

// ─── D · Estado guardable ────────────────────────────────────────────────────

describe('estadoGuardable — el criterio de TA-5', () => {
  const base = { tipoConfirmado: 'acta_constitutiva', nombre: 'Acta Siemens', legible: true, vencido: false, avisos: [] as string[] };

  it('limpio → guarda como cargado', () => {
    const v = estadoGuardable(base);
    expect(v.puedeGuardar).toBe(true);
    expect(v.estadoResultante).toBe('cargado');
  });

  it('sin tipo confirmado o sin nombre no se guarda', () => {
    expect(estadoGuardable({ ...base, tipoConfirmado: null }).puedeGuardar).toBe(false);
    expect(estadoGuardable({ ...base, nombre: '  ' }).puedeGuardar).toBe(false);
  });

  it('rfc_no_coincide NO bloquea pero marca con observaciones — decisión visible, no silencio', () => {
    const v = estadoGuardable({ ...base, avisos: ['rfc_no_coincide'] });
    expect(v.puedeGuardar).toBe(true);
    expect(v.estadoResultante).toBe('con_observaciones');
  });

  it('ilegible o vencido se guarda, pero nunca como completo', () => {
    expect(estadoGuardable({ ...base, legible: false }).estadoResultante).toBe('con_observaciones');
    expect(estadoGuardable({ ...base, vencido: true }).estadoResultante).toBe('con_observaciones');
  });
});

// ─── E · Checklist y DocsAlta ────────────────────────────────────────────────

describe('checklist del expediente', () => {
  it('el checklist tiene exactamente los 6 documentos del alta', () => {
    expect(DOCUMENTOS_EXPEDIENTE).toHaveLength(6);
    expect(DOCUMENTOS_EXPEDIENTE.map(d => d.tipo)).not.toContain('otro');
  });

  it('estadoChecklist refleja el documento guardado', () => {
    const exp: ExpedienteCliente = {
      acta_constitutiva: docCargado(),
      poder_notarial: docCargado('con_observaciones'),
    };
    expect(estadoChecklist(exp, 'acta_constitutiva')).toBe('cargado');
    expect(estadoChecklist(exp, 'poder_notarial')).toBe('con_observaciones');
    expect(estadoChecklist(exp, 'caratula_bancaria')).toBe('pendiente');
    expect(estadoChecklist(undefined, 'acta_constitutiva')).toBe('pendiente');
  });

  it('derivarDocsAlta enciende el checkbox del tipo guardado', () => {
    const exp: ExpedienteCliente = { constancia_situacion_fiscal: docCargado() };
    const docs = derivarDocsAlta(DOCS_VACIO, exp);
    expect(docs.csf).toBe(true);
    expect(docs.acta).toBe(false);
  });

  it('derivarDocsAlta NUNCA apaga: el doc físico en oficina sigue valiendo', () => {
    const marcadoAMano: DocsAlta = { ...DOCS_VACIO, acta: true };
    const docs = derivarDocsAlta(marcadoAMano, {});
    expect(docs.acta).toBe(true);
  });

  it('un doc con observaciones también enciende el checkbox: existe, aunque tenga reparos', () => {
    const exp: ExpedienteCliente = { poder_notarial: docCargado('con_observaciones') };
    expect(derivarDocsAlta(DOCS_VACIO, exp).poder).toBe(true);
  });
});

// ─── F · Precarga de factura y cotejo (§4.3) ─────────────────────────────────

describe('precargaFacturaProveedor y cotejo con la OC', () => {
  const datos = {
    emisor: 'Transportes García', numeroDocumento: 'F-1234', fecha: '2026-09-01',
    total: 15000, moneda: 'mxn', conceptos: ['Flete terrestre', 42, 'Maniobras'],
  };

  it('extrae los campos de la precarga y normaliza la moneda', () => {
    const p = precargaFacturaProveedor(datos);
    expect(p.emisor).toBe('Transportes García');
    expect(p.total).toBe(15000);
    expect(p.moneda).toBe('MXN');
    expect(p.conceptos).toEqual(['Flete terrestre', 'Maniobras']);
  });

  it('un total ausente, no numérico o en cero queda null — se captura a mano', () => {
    expect(precargaFacturaProveedor({}).total).toBeNull();
    expect(precargaFacturaProveedor({ total: '15000' }).total).toBeNull();
    expect(precargaFacturaProveedor({ total: 0 }).total).toBeNull();
  });

  it('coteja con tolerancia de redondeo de IVA', () => {
    const p = precargaFacturaProveedor(datos);
    expect(cotejarTotalConOC(p, { monto: 15000.4, moneda: 'MXN' }).coincide).toBe(true);
    const r = cotejarTotalConOC(p, { monto: 12000, moneda: 'MXN' });
    expect(r.coincide).toBe(false);
    expect(r.mensaje).toContain('15,000.00');
    expect(r.mensaje).toContain('12,000.00');
  });

  it('§4.3: monedas distintas NO se comparan — 1,200 USD no coincide con 1,200 MXN', () => {
    const p = precargaFacturaProveedor({ ...datos, total: 1200, moneda: 'USD' });
    const r = cotejarTotalConOC(p, { monto: 1200, moneda: 'MXN' });
    expect(r.coincide).toBe(false);
    expect(r.mensaje).toContain('USD');
    expect(r.mensaje).toContain('MXN');
  });

  it('sin total legible el cotejo pide captura manual en vez de fingir que cuadra', () => {
    const p = precargaFacturaProveedor({});
    const r = cotejarTotalConOC(p, { monto: 5000, moneda: 'MXN' });
    expect(r.coincide).toBe(false);
    expect(r.mensaje).toContain('a mano');
  });
});

// ─── G · Adopción de datos en la ficha ───────────────────────────────────────

import { camposAdoptablesExpediente } from './clasificacionDocumentos';

describe('camposAdoptablesExpediente — nada se adopta en automático', () => {
  const clasif = {
    rfc: 'SIE840101AAA',
    datos: { representanteLegal: 'Juan Pérez', domicilio: 'Av. Reforma 100', codigoPostal: '06600' },
  };

  it('ofrece solo los campos que el documento trae', () => {
    const campos = camposAdoptablesExpediente({ rfc: '', datos: { domicilio: 'Av. Reforma 100' } }, {});
    expect(campos.map(c => c.campo)).toEqual(['domicilio']);
  });

  it('campo vacío en la ficha → adoptable sin conflicto', () => {
    const campos = camposAdoptablesExpediente(clasif, { rfc: '' });
    const rfc = campos.find(c => c.campo === 'rfc')!;
    expect(rfc.enConflicto).toBe(false);
    expect(rfc.valorDocumento).toBe('SIE840101AAA');
  });

  it('la ficha ya dice OTRA cosa → lado a lado, marcado en conflicto', () => {
    const campos = camposAdoptablesExpediente(clasif, { representante: 'Pedro Gómez' });
    const rep = campos.find(c => c.campo === 'representante')!;
    expect(rep.enConflicto).toBe(true);
    expect(rep.valorActual).toBe('Pedro Gómez');
    expect(rep.valorDocumento).toBe('Juan Pérez');
  });

  it('mismo valor → no hay nada que adoptar (RFC ignora mayúsculas)', () => {
    const campos = camposAdoptablesExpediente(clasif, { rfc: 'sie840101aaa', domicilio: 'Av. Reforma 100' });
    expect(campos.map(c => c.campo)).toEqual(['representante', 'codigoPostal']);
  });
});

// ─── Bloque 11a · el subtotal, verificado contra la debit note de Asia Ship ───

describe('precargaFacturaProveedor · subtotal', () => {
  /** Lo que el extractor devolvió de verdad (docs/fixtures/asia-ship-clasificacion.json). */
  const ASIA_SHIP = {
    numeroDocumento: 'SZHD26070166', fecha: '2026-08-04',
    emisor: 'ASIA SHIP CO., LTD', moneda: 'USD',
    subtotal: 6197, iva: 0, total: 6197,
  };

  it('un proveedor extranjero factura sin IVA: subtotal y total coinciden', () => {
    const p = precargaFacturaProveedor(ASIA_SHIP);
    expect(p.subtotal).toBe(6197);
    expect(p.total).toBe(6197);
    expect(p.iva).toBe(0);
  });

  it('un iva de cero se conserva; no se confunde con «no lo declaró»', () => {
    expect(precargaFacturaProveedor({ ...ASIA_SHIP, iva: 0 }).iva).toBe(0);
    expect(precargaFacturaProveedor({ ...ASIA_SHIP, iva: undefined }).iva).toBeNull();
  });

  it('sin subtotal NO se despeja de total − iva', () => {
    // Un subtotal calculado a partir de un IVA que no se leyó bien se ve
    // igual de creíble que uno leído, y de ahí sale a un excedente falso.
    const p = precargaFacturaProveedor({ ...ASIA_SHIP, subtotal: undefined, iva: 1600, total: 11600 });
    expect(p.subtotal).toBeNull();
    expect(p.total).toBe(11600);
  });

  it('un subtotal en cero o negativo se descarta', () => {
    expect(precargaFacturaProveedor({ ...ASIA_SHIP, subtotal: 0 }).subtotal).toBeNull();
    expect(precargaFacturaProveedor({ ...ASIA_SHIP, subtotal: -5 }).subtotal).toBeNull();
  });
});
