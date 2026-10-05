import { describe, it, expect } from 'vitest';
import {
  normalizarTipoClasificado,
  resumenLote,
  conflictosDeTipo,
  textoCorreccionTipo,
  observacionesConCorreccion,
  etiquetaDocOC,
  DOCUMENTOS_OC,
  type LineaLote,
  type TipoDocLote,
} from './loteDocumentos';
import { DOCUMENTOS_EXPEDIENTE, etiquetaDocExpediente } from './clasificacionDocumentos';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** El catálogo del expediente KYC, en la forma que pide el lote. */
const CATALOGO_KYC: TipoDocLote[] = DOCUMENTOS_EXPEDIENTE.map(d => ({
  tipo: d.tipo,
  etiqueta: d.etiqueta,
}));

const linea = (over: Partial<LineaLote> = {}): LineaLote => ({
  id: 'l1',
  nombreArchivo: 'archivo.pdf',
  estado: 'listo',
  tipoCrudo: 'constancia_situacion_fiscal',
  tipoPropuesto: 'constancia_situacion_fiscal',
  tipoElegido: 'constancia_situacion_fiscal',
  corregidoAMano: false,
  avisos: [],
  storagePath: 'expedientes/CLI-1/1-archivo.pdf',
  url: 'https://x/1',
  nombre: 'Constancia',
  ...over,
});

// ── A · normalizarTipoClasificado ────────────────────────────────────────────

describe('normalizarTipoClasificado', () => {
  it('reconoce el tipo exacto del catálogo', () => {
    expect(normalizarTipoClasificado('acta_constitutiva', CATALOGO_KYC))
      .toBe('acta_constitutiva');
  });

  it('reconoce sinónimos del expediente', () => {
    expect(normalizarTipoClasificado('csf', CATALOGO_KYC)).toBe('constancia_situacion_fiscal');
    expect(normalizarTipoClasificado('INE', CATALOGO_KYC)).toBe('identificacion_oficial');
    expect(normalizarTipoClasificado('estado_de_cuenta', CATALOGO_KYC)).toBe('caratula_bancaria');
  });

  it('ignora acentos, mayúsculas, espacios y guiones', () => {
    expect(normalizarTipoClasificado('Constancia de Situación Fiscal', CATALOGO_KYC))
      .toBe('constancia_situacion_fiscal');
    expect(normalizarTipoClasificado('  ACTA-CONSTITUTIVA  ', CATALOGO_KYC))
      .toBe('acta_constitutiva');
  });

  it('reconoce la etiqueta cuando el agente contesta con ella', () => {
    expect(normalizarTipoClasificado('Complemento de pago', DOCUMENTOS_OC))
      .toBe('complemento_pago');
  });

  it('devuelve null para «otro» cuando el catálogo no lo ofrece', () => {
    // El checklist del expediente no tiene casilla «otro»: dejarlo entrar
    // guardaría un documento que ninguna casilla enseña.
    expect(normalizarTipoClasificado('otro', CATALOGO_KYC)).toBeNull();
  });

  it('respeta «otro» cuando el catálogo sí lo ofrece', () => {
    expect(normalizarTipoClasificado('otro', DOCUMENTOS_OC)).toBe('otro');
  });

  it('devuelve null para un tipo de OTRO contexto, sin forzar el parecido', () => {
    // Un BL no es ninguno de los seis del expediente. Forzarlo al más
    // parecido es el error de Gaby escrito en código.
    expect(normalizarTipoClasificado('bl_maritimo', CATALOGO_KYC)).toBeNull();
    expect(normalizarTipoClasificado('pedimento', CATALOGO_KYC)).toBeNull();
  });

  it('devuelve null para vacío, nulo o indefinido', () => {
    expect(normalizarTipoClasificado('', CATALOGO_KYC)).toBeNull();
    expect(normalizarTipoClasificado('   ', CATALOGO_KYC)).toBeNull();
    expect(normalizarTipoClasificado(null, CATALOGO_KYC)).toBeNull();
    expect(normalizarTipoClasificado(undefined, CATALOGO_KYC)).toBeNull();
  });

  it('traduce el vocabulario del flujo del embarque al de la orden de compra', () => {
    expect(normalizarTipoClasificado('factura_proveedor', DOCUMENTOS_OC)).toBe('factura');
    expect(normalizarTipoClasificado('REP', DOCUMENTOS_OC)).toBe('complemento_pago');
    expect(normalizarTipoClasificado('spei', DOCUMENTOS_OC)).toBe('comprobante_pago');
  });

  it('no mete una factura en el checklist del expediente', () => {
    expect(normalizarTipoClasificado('factura_proveedor', CATALOGO_KYC)).toBeNull();
  });
});

// ── B · resumenLote ──────────────────────────────────────────────────────────

describe('resumenLote', () => {
  it('con todo clasificado, se puede guardar', () => {
    const r = resumenLote([linea(), linea({ id: 'l2', tipoElegido: 'acta_constitutiva' })]);
    expect(r.conTipo).toBe(2);
    expect(r.sinClasificar).toBe(0);
    expect(r.puedeGuardar).toBe(true);
    expect(r.faltante).toBe('');
  });

  it('un renglón sin tipo bloquea y lo dice en singular', () => {
    const r = resumenLote([linea(), linea({ id: 'l2', tipoElegido: null, tipoPropuesto: null })]);
    expect(r.sinClasificar).toBe(1);
    expect(r.puedeGuardar).toBe(false);
    expect(r.faltante).toBe('Elige el tipo del documento sin clasificar.');
  });

  it('varios sin tipo se cuentan en plural', () => {
    const sinTipo = { tipoElegido: null, tipoPropuesto: null };
    const r = resumenLote([
      linea({ id: 'a', ...sinTipo }),
      linea({ id: 'b', ...sinTipo }),
      linea({ id: 'c', ...sinTipo }),
    ]);
    expect(r.faltante).toBe('Elige el tipo de los 3 documentos sin clasificar.');
  });

  it('mientras algo se procesa, no se guarda nada', () => {
    const r = resumenLote([linea(), linea({ id: 'l2', estado: 'procesando' })]);
    expect(r.procesando).toBe(1);
    expect(r.puedeGuardar).toBe(false);
    expect(r.faltante).toBe('Falta que termine de procesarse un archivo.');
  });

  it('un renglón en error NO bloquea a los demás', () => {
    const r = resumenLote([
      linea(),
      linea({ id: 'l2', estado: 'error', error: 'El archivo pesa 12 MB', tipoElegido: null }),
    ]);
    expect(r.conError).toBe(1);
    expect(r.conTipo).toBe(1);
    expect(r.puedeGuardar).toBe(true);
  });

  it('un lote que solo trae errores no tiene nada que guardar', () => {
    const r = resumenLote([linea({ estado: 'error', tipoElegido: null })]);
    expect(r.puedeGuardar).toBe(false);
    expect(r.faltante).toBe('No hay documentos que guardar.');
  });

  it('cuenta los corregidos a mano', () => {
    const r = resumenLote([
      linea(),
      linea({ id: 'l2', tipoElegido: 'acta_constitutiva', corregidoAMano: true }),
    ]);
    expect(r.corregidos).toBe(1);
  });

  it('un lote vacío no se puede guardar', () => {
    const r = resumenLote([]);
    expect(r.total).toBe(0);
    expect(r.puedeGuardar).toBe(false);
  });
});

// ── C · conflictosDeTipo ─────────────────────────────────────────────────────

describe('conflictosDeTipo', () => {
  it('avisa cuando dos archivos del lote quedaron con el mismo tipo', () => {
    const c = conflictosDeTipo([
      linea({ id: 'a', nombreArchivo: 'csf-2024.pdf' }),
      linea({ id: 'b', nombreArchivo: 'csf-2026.pdf' }),
    ]);
    expect(c).toEqual([
      { tipo: 'constancia_situacion_fiscal', archivos: ['csf-2024.pdf', 'csf-2026.pdf'] },
    ]);
  });

  it('no avisa de tipos distintos', () => {
    expect(conflictosDeTipo([
      linea({ id: 'a' }),
      linea({ id: 'b', tipoElegido: 'acta_constitutiva' }),
    ])).toEqual([]);
  });

  it('ignora los renglones en error y los que no tienen tipo', () => {
    expect(conflictosDeTipo([
      linea({ id: 'a' }),
      linea({ id: 'b', estado: 'error' }),
      linea({ id: 'c', tipoElegido: null }),
    ])).toEqual([]);
  });
});

// ── D · El registro de la corrección ─────────────────────────────────────────

describe('textoCorreccionTipo', () => {
  it('dice qué leyó el agente y qué decidió la persona', () => {
    const t = textoCorreccionTipo({
      tipoCrudo: 'acta_constitutiva',
      tipoFinal: 'constancia_situacion_fiscal',
      por: 'julio.gutierrez@vermur.com',
      fecha: '2026-10-05T18:30:00.000Z',
      etiqueta: etiquetaDocExpediente,
    });
    expect(t).toContain('«Constancia de Situación Fiscal»');
    expect(t).toContain('julio.gutierrez@vermur.com');
    expect(t).toContain('2026-10-05');
    expect(t).toContain('el clasificador lo leyó como «Acta constitutiva»');
  });

  it('cuando el agente no propuso nada, lo dice así', () => {
    const t = textoCorreccionTipo({
      tipoCrudo: '',
      tipoFinal: 'complemento_pago',
      por: 'gaby',
      fecha: '2026-10-05T18:30:00.000Z',
      etiqueta: etiquetaDocOC,
    });
    expect(t).toContain('el clasificador no pudo determinar el tipo');
    expect(t).toContain('«Complemento de pago»');
  });
});

describe('observacionesConCorreccion', () => {
  it('conserva las dos', () => {
    expect(observacionesConCorreccion('Documento escaneado al revés', 'Tipo corregido…'))
      .toBe('Documento escaneado al revés · Tipo corregido…');
  });

  it('deja undefined cuando no hay ninguna (Firestore rechaza undefined)', () => {
    expect(observacionesConCorreccion(undefined, null)).toBeUndefined();
    expect(observacionesConCorreccion('   ', null)).toBeUndefined();
  });

  it('con solo una, no mete el separador', () => {
    expect(observacionesConCorreccion(undefined, 'Tipo corregido…')).toBe('Tipo corregido…');
    expect(observacionesConCorreccion('Ilegible', null)).toBe('Ilegible');
  });
});

// ── E · Catálogo de la orden de compra ───────────────────────────────────────

describe('DOCUMENTOS_OC', () => {
  it('incluye el complemento de pago, que es lo que no tenía dónde cargarse', () => {
    expect(DOCUMENTOS_OC.map(d => d.tipo)).toContain('complemento_pago');
  });

  it('etiquetaDocOC humaniza un tipo desconocido en vez de ocultarlo', () => {
    expect(etiquetaDocOC('algo_nuevo')).toBe('algo nuevo');
    expect(etiquetaDocOC('factura')).toBe('Factura del proveedor');
  });
});
