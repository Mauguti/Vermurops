import { describe, it, expect } from 'vitest';
import {
  normalizarTipoClasificado,
  resumenLote,
  conflictosDeTipo,
  textoCorreccionTipo,
  observacionesConCorreccion,
  clasificacionDeLinea,
  etiquetaConfianza,
  etiquetaDocOC,
  DOCUMENTOS_OC,
  type LineaLote,
  type TipoDocLote,
} from './loteDocumentos';
import { DOCUMENTOS_EXPEDIENTE, etiquetaDocExpediente } from './clasificacionDocumentos';
import { DOCS_PROVEEDOR_NACIONAL, DOCS_PROVEEDOR_EXTRANJERO } from './expedienteProveedor';

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

describe('normalizarTipoClasificado · catálogo del proveedor', () => {
  // El expediente del proveedor indexa por clave de DocsAlta ('csf'), no por
  // el nombre largo: el agente contesta el largo y tiene que caer igual.
  const CATALOGO_PROVEEDOR: TipoDocLote[] = DOCS_PROVEEDOR_NACIONAL.map(d => ({
    tipo: d.campo,
    etiqueta: d.etiqueta,
  }));

  it('el nombre largo del agente cae en la clave corta del proveedor', () => {
    expect(normalizarTipoClasificado('constancia_situacion_fiscal', CATALOGO_PROVEEDOR)).toBe('csf');
    expect(normalizarTipoClasificado('acta_constitutiva', CATALOGO_PROVEEDOR)).toBe('acta');
    expect(normalizarTipoClasificado('comprobante_domicilio', CATALOGO_PROVEEDOR)).toBe('comprobante');
    expect(normalizarTipoClasificado('caratula_bancaria', CATALOGO_PROVEEDOR)).toBe('bancaria');
  });

  it('el proveedor extranjero mapea su documento fiscal al mismo campo', () => {
    const extranjero: TipoDocLote[] = DOCS_PROVEEDOR_EXTRANJERO.map(d => ({
      tipo: d.campo, etiqueta: d.etiqueta,
    }));
    expect(normalizarTipoClasificado('constancia_situacion_fiscal', extranjero)).toBe('csf');
    expect(normalizarTipoClasificado('documento_fiscal', extranjero)).toBe('csf');
  });

  it('el poder y la identificación no están en el checklist del proveedor', () => {
    // No se fuerzan a otra casilla: quedan sin clasificar y lo resuelve quien sube.
    expect(normalizarTipoClasificado('poder_notarial', CATALOGO_PROVEEDOR)).toBeNull();
    expect(normalizarTipoClasificado('identificacion_oficial', CATALOGO_PROVEEDOR)).toBeNull();
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

// ── D-bis · El registro empacado para el expediente (tarea 71) ───────────────

/** Las etiquetas del expediente del proveedor, que se indexa por clave de DocsAlta. */
const etiquetaProveedor = (tipo: string) =>
  DOCS_PROVEEDOR_NACIONAL.find(d => d.campo === tipo)?.etiqueta ?? tipo.replace(/_/g, ' ');

const AUTOR = {
  por: 'administracion@vermur.com',
  fecha: '2026-10-05T18:30:00.000Z',
  etiqueta: etiquetaProveedor,
};

describe('clasificacionDeLinea', () => {
  it('escribe el registro cuando la persona corrigió el tipo', () => {
    const c = clasificacionDeLinea(
      linea({ tipoCrudo: 'acta_constitutiva', tipoPropuesto: 'acta', tipoElegido: 'csf', corregidoAMano: true }),
      AUTOR,
    );
    expect(c?.tipoCrudo).toBe('acta_constitutiva');
    expect(c?.observaciones).toContain('administracion@vermur.com');
    expect(c?.observaciones).toContain('2026-10-05');
    // Las dos cosas: qué leyó el agente y qué decidió la persona.
    expect(c?.observaciones).toContain('el clasificador lo leyó como');
    expect(c?.observaciones).toContain(etiquetaProveedor('csf'));
  });

  it('conserva la observación del agente junto a la corrección', () => {
    const c = clasificacionDeLinea(
      linea({ tipoElegido: 'csf', corregidoAMano: true, observaciones: 'Escaneo ilegible en la parte baja' }),
      AUTOR,
    );
    expect(c?.observaciones).toContain('Escaneo ilegible en la parte baja');
    expect(c?.observaciones).toContain('Tipo corregido a mano');
  });

  it('sin corrección guarda lo que dijo el agente y nada más', () => {
    const c = clasificacionDeLinea(linea({ confianza: 'alta' }), AUTOR);
    expect(c).toEqual({ tipoCrudo: 'constancia_situacion_fiscal', confianza: 'alta' });
    expect(c?.observaciones).toBeUndefined();
  });

  it('cuando el agente no contestó nada, devuelve undefined en vez de un objeto vacío', () => {
    // Firestore rechaza undefined dentro del documento y tumba la escritura
    // entera: aquí la clave no se escribe.
    const c = clasificacionDeLinea(
      linea({ tipoCrudo: '', tipoPropuesto: null, confianza: undefined, observaciones: undefined }),
      AUTOR,
    );
    expect(c).toBeUndefined();
  });

  it('ninguna clave queda en undefined', () => {
    const c = clasificacionDeLinea(linea({ tipoCrudo: 'csf' }), AUTOR);
    expect(Object.values(c ?? {}).every(v => v !== undefined)).toBe(true);
  });

  it('un tipo que el agente no determinó se registra como corrección sin lectura', () => {
    const c = clasificacionDeLinea(
      linea({ tipoCrudo: '', tipoPropuesto: null, tipoElegido: 'csf', corregidoAMano: true }),
      AUTOR,
    );
    expect(c?.tipoCrudo).toBeUndefined();
    expect(c?.observaciones).toContain('el clasificador no pudo determinar el tipo');
  });
});

describe('etiquetaConfianza', () => {
  it('la escala de texto se lee tal cual', () => {
    expect(etiquetaConfianza('alta')).toBe('alta');
  });

  it('un número no se convierte a porcentaje: no se sabe su escala', () => {
    expect(etiquetaConfianza(0.8)).toBe('0.8');
    expect(etiquetaConfianza(80)).toBe('80');
  });

  it('sin valor no hay etiqueta', () => {
    expect(etiquetaConfianza(undefined)).toBeNull();
    expect(etiquetaConfianza(null)).toBeNull();
    // Un documento viejo con el campo en blanco no pinta «confianza » a secas.
    expect(etiquetaConfianza('  ' as unknown as 'alta')).toBeNull();
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
