import { describe, it, expect } from 'vitest';
import {
  problemaArchivoContrato, rutaStorageContrato, sinContratoFirmado, estadoContrato, avisoContrato,
  textoReemplazoContrato, MAX_BYTES_CONTRATO,
} from './contratoCotizacion';

const contrato = (firmado: boolean) => ({
  storagePath: 'cotizaciones/COT-1/contrato/x.pdf', nombreArchivo: 'x.pdf', subidoPor: 'ventas@vermur.com',
  subidoEn: '2026-10-09T10:00:00.000Z', firmado,
});

describe('problemaArchivoContrato', () => {
  it('acepta PDF, JPG, PNG y HEIC', () => {
    for (const [name, type] of [['a.pdf', 'application/pdf'], ['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.heic', 'image/heic']]) {
      expect(problemaArchivoContrato({ name, type, size: 1000 })).toBeNull();
    }
  });
  it('un HEIC sin tipo del navegador pasa por extensión', () => {
    expect(problemaArchivoContrato({ name: 'foto.HEIC', type: '', size: 1000 })).toBeNull();
  });
  it('rechaza otros formatos, vacío y más de 20 MB', () => {
    expect(problemaArchivoContrato({ name: 'a.docx', type: 'application/msword', size: 1000 })).toMatch(/PDF/);
    expect(problemaArchivoContrato({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/vacío/);
    expect(problemaArchivoContrato({ name: 'a.pdf', type: 'application/pdf', size: MAX_BYTES_CONTRATO + 1 })).toMatch(/20 MB/);
    expect(problemaArchivoContrato({ name: 'a.pdf', type: 'application/pdf', size: MAX_BYTES_CONTRATO })).toBeNull();
  });
});

describe('rutaStorageContrato', () => {
  it('cae en contrato/ y no se repite entre subidas', () => {
    const a = rutaStorageContrato('COT-1', 'Contrato final.pdf', '2026-10-09T10:00:00.000Z');
    const b = rutaStorageContrato('COT-1', 'Contrato final.pdf', '2026-10-09T10:00:05.000Z');
    expect(a.startsWith('cotizaciones/COT-1/contrato/')).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain(' ');
  });
});

describe('sinContratoFirmado / avisoContrato', () => {
  it('ganada sin contrato: aviso', () => {
    expect(sinContratoFirmado({ etapa: 'ganada' })).toBe(true);
    expect(estadoContrato({ etapa: 'ganada', contrato: null })).toBe('sin_contrato');
    expect(avisoContrato({ etapa: 'ganada' })).toBe('Sin contrato firmado');
  });
  it('subido pero sin firmar sigue avisando', () => {
    expect(sinContratoFirmado({ etapa: 'ganada', contrato: contrato(false) })).toBe(true);
    expect(estadoContrato({ etapa: 'ganada', contrato: contrato(false) })).toBe('sin_firmar');
    expect(avisoContrato({ etapa: 'ganada', contrato: contrato(false) })).toMatch(/no se marcó/);
  });
  it('firmado: sin aviso', () => {
    expect(sinContratoFirmado({ etapa: 'ganada', contrato: contrato(true) })).toBe(false);
    expect(avisoContrato({ etapa: 'ganada', contrato: contrato(true) })).toBeNull();
  });
  it('no ganada: nunca avisa ni cuenta', () => {
    expect(sinContratoFirmado({ etapa: 'negociacion' })).toBe(false);
    expect(estadoContrato({ etapa: 'perdida' })).toBeNull();
    expect(avisoContrato({ etapa: 'enviada_cliente' })).toBeNull();
  });
});

describe('textoReemplazoContrato', () => {
  it('dice cuál era, quién, y dónde sigue', () => {
    const t = textoReemplazoContrato(contrato(true), 'nuevo.pdf');
    expect(t).toContain('x.pdf');
    expect(t).toContain('ventas@vermur.com');
    expect(t).toContain('2026-10-09');
    expect(t).toContain('firmado');
    expect(t).toContain('cotizaciones/COT-1/contrato/x.pdf');
    expect(t).toContain('nuevo.pdf');
  });
});
