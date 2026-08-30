/**
 * traficoServicio.test.ts
 *
 * La regla que gobierna todo esto: ante la duda NO se inventa el dato. Un
 * folio mal formado queda impreso en documentos que salen al cliente.
 */

import { describe, it, expect } from 'vitest';
import { modalidadDeServicio, resolverTrafico, traficoParaIVA } from './traficoServicio';
import { ServicioSolicitado } from '../components/quotes/QuotesData';
import { Servicio } from '../config/serviciosStore';

const CATALOGO: Servicio[] = [
  { id: 'srv-def-1', nombre: 'Flete Internacional',  categoria: 'transporte', activo: true, icono: 'Ship',  modalidad: 'maritimo' },
  { id: 'srv-def-2', nombre: 'Transporte Terrestre', categoria: 'transporte', activo: true, icono: 'Truck', modalidad: 'terrestre' },
  { id: 'srv-def-9', nombre: 'Asesoría Aduanal',     categoria: 'aduana',     activo: true, icono: 'File',  modalidad: null },
  { id: 'srv-cus-1', nombre: 'Cabotaje',             categoria: 'transporte', activo: true, icono: 'Ship',  modalidad: 'maritimo' },
];

const srv = (p: Partial<ServicioSolicitado>): ServicioSolicitado =>
  ({ id: 's', tipo: 'maritimo', ruta: { origen: '', destino: '' }, incoterm: 'FOB',
     mercancia: '', peso: 0, volumen: 0, estado: 'pendiente',
     cotizacionesProveedor: [], profit: 0, recargosPct: 0, conceptos: [], ...p } as ServicioSolicitado);

describe('modalidad desde el catálogo', () => {
  it('resuelve por id, que es lo que guarda el formulario', () => {
    expect(modalidadDeServicio('srv-def-2', CATALOGO)).toBe('terrestre');
  });

  it('resuelve por nombre canónico, que es lo que traen los datos viejos', () => {
    expect(modalidadDeServicio('terrestre', CATALOGO)).toBe('terrestre');
    expect(modalidadDeServicio('maritimo', CATALOGO)).toBe('maritimo');
  });

  it('tolera acentos y mayúsculas', () => {
    expect(modalidadDeServicio('Marítimo', CATALOGO)).toBe('maritimo');
    expect(modalidadDeServicio('AÉREO', CATALOGO)).toBe('aereo');
  });

  it('un servicio creado por Administración también declara su modalidad', () => {
    // Es la razón de poner el campo en el catálogo y no en un mapeo por id.
    expect(modalidadDeServicio('srv-cus-1', CATALOGO)).toBe('maritimo');
  });

  it('los que no definen modalidad devuelven null, no un default', () => {
    expect(modalidadDeServicio('srv-def-9', CATALOGO)).toBeNull();
  });

  it('un tipo desconocido devuelve null en vez de reventar', () => {
    expect(modalidadDeServicio('srv-def-999', CATALOGO)).toBeNull();
    expect(modalidadDeServicio('', CATALOGO)).toBeNull();
  });
});

describe('tráfico declarado', () => {
  it('si viene declarado se usa tal cual', () => {
    const r = resolverTrafico(srv({ trafico: 'exportacion' }));
    expect(r.trafico).toBe('exportacion');
    expect(r.fuente).toBe('declarado');
  });

  it('lo declarado gana sobre lo que sugiera la ruta', () => {
    const r = resolverTrafico(srv({
      trafico: 'exportacion',
      ruta: { origen: 'Shanghai', destino: 'Manzanillo' }, // parecería impo
    }));
    expect(r.trafico).toBe('exportacion');
  });
});

describe('tráfico derivado de la ruta (cotizaciones anteriores al campo)', () => {
  it('destino en México es importación', () => {
    const r = resolverTrafico(srv({ ruta: { origen: 'Shanghai', destino: 'Manzanillo' } }));
    expect(r.trafico).toBe('importacion');
    expect(r.fuente).toBe('derivado');
  });

  it('origen en México es exportación', () => {
    const r = resolverTrafico(srv({ ruta: { origen: 'Veracruz', destino: 'Hamburgo' } }));
    expect(r.trafico).toBe('exportacion');
  });

  it('reconoce ciudades y puertos, no solo el país', () => {
    expect(resolverTrafico(srv({ ruta: { origen: 'Ningbo', destino: 'Lázaro Cárdenas' } })).trafico)
      .toBe('importacion');
    expect(resolverTrafico(srv({ ruta: { origen: 'Querétaro', destino: 'Laredo, USA' } })).trafico)
      .toBe('exportacion');
  });

  it('«Laredo, USA» NO es México, pero «Nuevo Laredo» sí', () => {
    // El cotejo es por token justo por esto: con subcadena, «Laredo, USA»
    // matcheaba como mexicano y convertía una exportación en indeterminada.
    expect(resolverTrafico(srv({ ruta: { origen: 'Monterrey', destino: 'Laredo, USA' } })).trafico)
      .toBe('exportacion');
    expect(resolverTrafico(srv({ ruta: { origen: 'Houston', destino: 'Nuevo Laredo' } })).trafico)
      .toBe('importacion');
  });

  it('no confunde subcadenas dentro de otras palabras', () => {
    // 'mex' está dentro de 'Mexborough' (Inglaterra) — token distinto.
    expect(resolverTrafico(srv({ ruta: { origen: 'Mexborough', destino: 'Rotterdam' } })).trafico)
      .toBeNull();
  });
});

describe('cuando NO se puede saber, no se inventa', () => {
  it('los dos extremos en México: null con explicación', () => {
    const r = resolverTrafico(srv({ ruta: { origen: 'Monterrey', destino: 'CDMX' } }));
    expect(r.trafico).toBeNull();
    expect(r.fuente).toBe('desconocido');
    expect(r.motivo).toContain('los dos extremos en México');
  });

  it('ningún extremo reconocible: null', () => {
    const r = resolverTrafico(srv({ ruta: { origen: 'Shanghai', destino: 'Hamburgo' } }));
    expect(r.trafico).toBeNull();
  });

  it('«Por definir» no cuenta como lugar', () => {
    const r = resolverTrafico(srv({ ruta: { origen: 'Por definir', destino: 'Por definir' } }));
    expect(r.trafico).toBeNull();
  });

  it('ruta vacía: null en vez de reventar', () => {
    expect(resolverTrafico(srv({ ruta: { origen: '', destino: '' } })).trafico).toBeNull();
  });

  it('el motivo siempre explica por qué, para poder mostrarlo', () => {
    const r = resolverTrafico(srv({ ruta: { origen: 'Shanghai', destino: 'Hamburgo' } }));
    expect(r.motivo).toBeTruthy();
    expect(r.motivo).toContain('Shanghai');
  });
});

describe('puente hacia calcularIVA', () => {
  it('traduce al vocabulario corto que usa calcularIVA', () => {
    expect(traficoParaIVA('importacion')).toBe('impo');
    expect(traficoParaIVA('exportacion')).toBe('expo');
  });
});
