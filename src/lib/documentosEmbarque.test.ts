import { describe, it, expect } from 'vitest';
import {
  etiquetaTipoDocumento, grupoPropuesto, grupoDe, agruparDocumentos,
  contenedoresDelEmbarque, contenedorNoCoincide, documentoDesdeRevision,
  proponerParaOC, esTipoLegacy, TIPOS_DOC_EMBARQUE, TIPOS_DOC_OPERATIVOS, esDocumentoFactura, bloqueoEnDocumentos,
} from './documentosEmbarque';
import { precargaFacturaProveedor, type ClasificacionValidada } from './clasificacionDocumentos';
import type { EmbarqueDocumento } from '../components/shipments/EmbarquesData';

const doc = (over: Partial<EmbarqueDocumento>): EmbarqueDocumento => ({
  id: 'd', tipo: 'otro', nombre: 'x', url: '#', fechaCarga: '2026-09-10 10:00', cargadoPor: 'ops', ...over,
});

describe('etiquetas y grupos', () => {
  it('lee la taxonomía nueva Y la legacy', () => {
    expect(etiquetaTipoDocumento('bl_maritimo')).toBe('BL marítimo');
    expect(etiquetaTipoDocumento('bl')).toBe('Bill of Lading (BL)');
    expect(etiquetaTipoDocumento('lo_que_sea')).toBe('lo que sea');
    expect(esTipoLegacy('bl')).toBe(true);
    expect(esTipoLegacy('bl_maritimo')).toBe(false);
  });

  it('el destino sugerido manda; sin él, el tipo decide', () => {
    expect(grupoPropuesto('factura_proveedor', null)).toBe('facturas_proveedor');
    expect(grupoPropuesto('factura_cliente', null)).toBe('facturas_cliente');
    expect(grupoPropuesto('bl_maritimo', null)).toBe('documentos');
    expect(grupoPropuesto('bl_maritimo', 'facturas_proveedor')).toBe('facturas_proveedor');
  });

  it('un documento legacy sin grupo cae en documentos', () => {
    expect(grupoDe(doc({ tipo: 'bl' }))).toBe('documentos');
    expect(grupoDe(doc({ tipo: 'factura' }))).toBe('documentos');
  });

  it('agrupa por destino y dentro por tipo, solo grupos con algo', () => {
    const g = agruparDocumentos([
      doc({ id: '1', tipo: 'packing_list', grupo: 'documentos' }),
      doc({ id: '2', tipo: 'bl_maritimo', grupo: 'documentos' }),
      doc({ id: '3', tipo: 'factura_proveedor', grupo: 'facturas_proveedor' }),
      doc({ id: '4', tipo: 'bl' }), // legacy
    ]);
    expect(g.map(x => x.grupo)).toEqual(['documentos', 'facturas_proveedor']);
    expect(g[0].tipos.map(t => t.tipo)).toEqual(['bl_maritimo', 'packing_list', 'bl']);
    expect(g[0].total).toBe(3);
  });

  it('ofrece los 13 tipos del clasificador al subir', () => {
    expect(TIPOS_DOC_EMBARQUE).toHaveLength(13);
  });
});

describe('contenedores', () => {
  it('saca los contenedores de los productos, sin repetir ni vacíos', () => {
    const e = { productos: [
      { datosContenedor: { numeroContenedor: 'maeu1234567', tipoContenedor: '', numeroSello: '', folioSello: '' } },
      { datosContenedor: { numeroContenedor: 'MAEU1234567', tipoContenedor: '', numeroSello: '', folioSello: '' } },
      { datosContenedor: { numeroContenedor: '', tipoContenedor: '', numeroSello: '', folioSello: '' } },
      {},
    ] };
    expect(contenedoresDelEmbarque(e)).toEqual(['MAEU1234567']);
    expect(contenedoresDelEmbarque({})).toEqual([]);
  });

  it('detecta el aviso de contenedor: el error que hoy nadie cacha', () => {
    expect(contenedorNoCoincide(['contenedor_no_coincide'])).toBe(true);
    expect(contenedorNoCoincide(['sin_fecha'])).toBe(false);
  });
});

const clasificacion = (over: Partial<ClasificacionValidada> = {}): ClasificacionValidada => ({
  tipo: 'factura_proveedor', confianza: 'alta', razonTipo: '', nombreOriginal: 'IMG-001.pdf',
  nombrePropuesto: 'Factura Oñate 4521', datos: { numeroDocumento: 'A-4521', fecha: '2026-09-01', emisor: 'Transportes Oñate', total: 15000, moneda: 'mxn' },
  legible: true, vencido: false, observaciones: '', avisos: [], requiereRevision: false,
  destinoSugerido: 'facturas_proveedor', razonSocial: '', rfc: '', ...over,
});

describe('documentoDesdeRevision', () => {
  const subida = { storagePath: 'embarques/E1/docs/1-IMG-001.pdf', url: 'https://x/1', nombreOriginal: 'IMG-001.pdf', clasificacion: clasificacion() };

  it('lo confirmado manda sobre lo propuesto, y lo extraído se conserva', () => {
    const d = documentoDesdeRevision(subida, {
      tipoConfirmado: 'factura_comercial', nombre: 'Factura comercial 4521', estado: 'cargado', grupo: 'documentos', ocId: null,
    }, 'ops@vermur.com', '2026-09-10T15:00:00.000Z');
    expect(d.tipo).toBe('factura_comercial');
    expect(d.nombre).toBe('Factura comercial 4521');
    expect(d.grupo).toBe('documentos');
    expect(d.storagePath).toBe(subida.storagePath);
    expect(d.datos).toEqual(subida.clasificacion.datos);
    expect(d.fechaCarga).toBe('2026-09-10 15:00');
  });

  it('un nombre vacío cae al original; pendiente se guarda como con observaciones', () => {
    const d = documentoDesdeRevision(subida, {
      tipoConfirmado: 'otro', nombre: '  ', estado: 'pendiente', grupo: 'documentos', ocId: null,
    }, 'ops', '2026-09-10T15:00:00.000Z');
    expect(d.nombre).toBe('IMG-001.pdf');
    expect(d.estado).toBe('con_observaciones');
  });
});

describe('proponerParaOC — sustituir el folio interno por el número real', () => {
  const precarga = precargaFacturaProveedor(clasificacion().datos);

  it('arma la referencia legible y el desglose, y cuadra el total', () => {
    const p = proponerParaOC(precarga, { monto: 15000, moneda: 'MXN' }, 'doc-1');
    expect(p.facturaAsociada).toBe('A-4521 · 2026-09-01 · Transportes Oñate');
    expect(p.facturaDatos).toMatchObject({ numero: 'A-4521', total: 15000, moneda: 'MXN', documentoId: 'doc-1', cotejo: 'coincide' });
    expect(p.aviso).toBeNull();
  });

  it('avisa cuando el total difiere del de la OC', () => {
    const p = proponerParaOC(precarga, { monto: 12000, moneda: 'MXN' }, 'doc-1');
    expect(p.facturaDatos.cotejo).toBe('difiere');
    expect(p.aviso).toContain('no coincide');
  });

  it('§4.3: monedas distintas no se comparan, se avisa', () => {
    const p = proponerParaOC(precarga, { monto: 15000, moneda: 'USD' }, 'doc-1');
    expect(p.facturaDatos.cotejo).toBe('difiere');
    expect(p.aviso).toContain('USD');
  });

  it('sin total legible lo dice y no inventa un cotejo', () => {
    const sinTotal = precargaFacturaProveedor({ numeroDocumento: 'B-1', emisor: 'X' });
    const p = proponerParaOC(sinTotal, { monto: 100, moneda: 'MXN' }, 'doc-2');
    expect(p.facturaDatos.cotejo).toBe('sin_total');
    expect(p.facturaDatos.moneda).toBe('MXN');
    expect(p.aviso).toContain('captura el monto');
  });
});

describe('las facturas salen de Documentos', () => {
  it('los tipos operativos son los 13 menos las dos facturas', () => {
    expect(TIPOS_DOC_OPERATIVOS).toHaveLength(11);
    expect(TIPOS_DOC_OPERATIVOS.some(t => t.tipo === 'factura_proveedor' || t.tipo === 'factura_cliente')).toBe(false);
    // La factura comercial es documento aduanal, no una factura por cobrar o pagar.
    expect(TIPOS_DOC_OPERATIVOS.some(t => t.tipo === 'factura_comercial')).toBe(true);
  });

  it('un documento es factura por su tipo o por su destino, legacy incluido', () => {
    expect(esDocumentoFactura(doc({ tipo: 'factura_proveedor' }))).toBe(true);
    expect(esDocumentoFactura(doc({ tipo: 'otro', grupo: 'facturas_cliente' }))).toBe(true);
    expect(esDocumentoFactura(doc({ tipo: 'factura' }))).toBe(true);
    expect(esDocumentoFactura(doc({ tipo: 'bl_maritimo', grupo: 'documentos' }))).toBe(false);
  });

  it('se bloquea por lo que DETECTÓ el clasificador, aunque se confirme otro tipo', () => {
    expect(bloqueoEnDocumentos({ tipo: 'factura_proveedor', destinoSugerido: null })).toContain('Facturas');
    expect(bloqueoEnDocumentos({ tipo: 'otro', destinoSugerido: 'facturas_proveedor' })).toContain('Facturas');
    expect(bloqueoEnDocumentos({ tipo: 'bl_maritimo', destinoSugerido: 'documentos' })).toBeNull();
    expect(bloqueoEnDocumentos({ tipo: 'packing_list', destinoSugerido: null })).toBeNull();
  });
});
