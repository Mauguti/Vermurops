import { describe, it, expect } from 'vitest';
import {
  esProveedorExtranjero,
  docsParaProveedor,
  resumenExpediente,
  DOCS_PROVEEDOR_NACIONAL,
  DOCS_PROVEEDOR_EXTRANJERO,
  DOCS_ALTA_PROVEEDOR_DEFAULT,
} from './expedienteProveedor';
import type { DocsAlta } from '../components/clientes/ClientesData';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const provNacional = { direccion: { pais: 'MX' } };
const provNacionalMexico = { direccion: { pais: 'MEXICO' } };
const provNacionalMex = { direccion: { pais: 'MEX' } };
const provNacionalAcento = { direccion: { pais: 'MÉXICO' } };
const provNacionalMinuscula = { direccion: { pais: 'mx' } };
const provExtranjero = { direccion: { pais: 'US' } };
const provExtranjeroChina = { direccion: { pais: 'China' } };
const provSinPais = { direccion: { pais: null } };
const provSinDireccion = {};
const provDireccionNull = { direccion: null };

// ── esProveedorExtranjero ────────────────────────────────────────────────────

describe('esProveedorExtranjero', () => {
  it('MX, MEX, MEXICO, MÉXICO son nacionales', () => {
    expect(esProveedorExtranjero(provNacional)).toBe(false);
    expect(esProveedorExtranjero(provNacionalMexico)).toBe(false);
    expect(esProveedorExtranjero(provNacionalMex)).toBe(false);
    expect(esProveedorExtranjero(provNacionalAcento)).toBe(false);
  });

  it('insensible a mayúsculas', () => {
    expect(esProveedorExtranjero(provNacionalMinuscula)).toBe(false);
  });

  it('US y China son extranjeros', () => {
    expect(esProveedorExtranjero(provExtranjero)).toBe(true);
    expect(esProveedorExtranjero(provExtranjeroChina)).toBe(true);
  });

  it('sin país se asume nacional', () => {
    expect(esProveedorExtranjero(provSinPais)).toBe(false);
    expect(esProveedorExtranjero(provSinDireccion)).toBe(false);
    expect(esProveedorExtranjero(provDireccionNull)).toBe(false);
  });

  it('recorta espacios', () => {
    expect(esProveedorExtranjero({ direccion: { pais: '  MX  ' } })).toBe(false);
    expect(esProveedorExtranjero({ direccion: { pais: ' US ' } })).toBe(true);
  });
});

// ── docsParaProveedor ────────────────────────────────────────────────────────

describe('docsParaProveedor', () => {
  it('nacional devuelve DOCS_PROVEEDOR_NACIONAL', () => {
    expect(docsParaProveedor(provNacional)).toBe(DOCS_PROVEEDOR_NACIONAL);
  });

  it('extranjero devuelve DOCS_PROVEEDOR_EXTRANJERO', () => {
    expect(docsParaProveedor(provExtranjero)).toBe(DOCS_PROVEEDOR_EXTRANJERO);
  });

  it('sin dirección devuelve nacional', () => {
    expect(docsParaProveedor(provSinDireccion)).toBe(DOCS_PROVEEDOR_NACIONAL);
  });

  it('extranjero tiene etiqueta distinta para CSF', () => {
    const nacional = DOCS_PROVEEDOR_NACIONAL.find(d => d.campo === 'csf');
    const extranjero = DOCS_PROVEEDOR_EXTRANJERO.find(d => d.campo === 'csf');
    expect(nacional?.etiqueta).toBe('Constancia de Situación Fiscal');
    expect(extranjero?.etiqueta).toBe('Documento fiscal de su país');
  });

  it('los dos tienen 4 documentos', () => {
    expect(DOCS_PROVEEDOR_NACIONAL).toHaveLength(4);
    expect(DOCS_PROVEEDOR_EXTRANJERO).toHaveLength(4);
  });
});

// ── resumenExpediente ────────────────────────────────────────────────────────

describe('resumenExpediente', () => {
  it('sin docsAlta cuenta todos como faltantes', () => {
    const r = resumenExpediente(undefined, DOCS_PROVEEDOR_NACIONAL);
    expect(r.total).toBe(4);
    expect(r.cargados).toBe(0);
    expect(r.faltantes).toHaveLength(4);
  });

  it('con todo completo no tiene faltantes', () => {
    const docsAlta: DocsAlta = {
      acta: true, poder: false, identificacion: false,
      csf: true, comprobante: true, bancaria: true,
    };
    const r = resumenExpediente(docsAlta, DOCS_PROVEEDOR_NACIONAL);
    expect(r.total).toBe(4);
    expect(r.cargados).toBe(4);
    expect(r.faltantes).toHaveLength(0);
  });

  it('cuenta correctamente los parciales', () => {
    const docsAlta: DocsAlta = {
      acta: false, poder: false, identificacion: false,
      csf: true, comprobante: true, bancaria: false,
    };
    const r = resumenExpediente(docsAlta, DOCS_PROVEEDOR_NACIONAL);
    expect(r.cargados).toBe(2);
    expect(r.faltantes).toEqual(['Estado de cuenta bancario', 'Acta constitutiva']);
  });

  it('el default tiene todo en false', () => {
    expect(DOCS_ALTA_PROVEEDOR_DEFAULT).toEqual({
      acta: false, poder: false, identificacion: false,
      csf: false, comprobante: false, bancaria: false,
    });
  });
});

// ── Permisos ─────────────────────────────────────────────────────────────────

describe('permisos para validar expediente del proveedor', () => {
  // La validación está condicionada a puede('proveedor.alta')
  // que según la matriz §4.1 es solo de administracion y admin.
  it('solo administracion y admin tienen proveedor.alta', async () => {
    const { CAPACIDADES_POR_ROL } = await import('../auth/permisos');
    expect(CAPACIDADES_POR_ROL.administracion).toContain('proveedor.alta');
    expect(CAPACIDADES_POR_ROL.admin).toContain('proveedor.alta');
    expect(CAPACIDADES_POR_ROL.ventas).not.toContain('proveedor.alta');
    expect(CAPACIDADES_POR_ROL.pricing).not.toContain('proveedor.alta');
    expect(CAPACIDADES_POR_ROL.operaciones).not.toContain('proveedor.alta');
  });
});
