/**
 * Tests de los tipos y constantes de documentos operativos (tarea 40).
 */

import { describe, it, expect } from 'vitest';
import {
  ETIQUETAS_DOC,
  EMPRESA_DEFAULT,
  type TipoDocEmbarque,
  type DocumentoGenerado,
  type ConfiguracionEmpresa,
} from './documentosOperativos';

describe('documentosOperativos', () => {
  it('ETIQUETAS_DOC cubre todos los tipos de documento', () => {
    const tipos: TipoDocEmbarque[] = [
      'booking', 'notificacion_arribo', 'carta_encomienda',
      'carta_porte', 'formato_318', 'hbl', 'prueba',
    ];
    for (const tipo of tipos) {
      expect(ETIQUETAS_DOC[tipo]).toBeTruthy();
    }
  });

  it('EMPRESA_DEFAULT tiene los datos reales de Vermur', () => {
    expect(EMPRESA_DEFAULT.razonSocial).toContain('Vermur');
    expect(EMPRESA_DEFAULT.rfc).toBe('ILV190723FN1');
    expect(EMPRESA_DEFAULT.direccion).toContain('Juriquilla');
    expect(EMPRESA_DEFAULT.apoderadoLegal).toContain('Gabriela');
    // Teléfono vacío: pendiente de confirmar (pregunta G11)
    expect(EMPRESA_DEFAULT.telefono).toBe('');
  });

  it('ConfiguracionEmpresa extiende los defaults sin perder nada', () => {
    const empresa: ConfiguracionEmpresa = {
      ...EMPRESA_DEFAULT,
      telefono: '442 123 4567',
      email: 'contacto@vermur.com',
    };
    expect(empresa.razonSocial).toBe(EMPRESA_DEFAULT.razonSocial);
    expect(empresa.telefono).toBe('442 123 4567');
    expect(empresa.email).toBe('contacto@vermur.com');
  });

  it('DocumentoGenerado tiene la forma correcta', () => {
    const doc: DocumentoGenerado = {
      tipo: 'notificacion_arribo',
      version: 1,
      storagePath: 'embarques/abc/docs/notificacion_arribo-v1-1234.pdf',
      url: 'https://storage.example.com/...',
      generadoPor: 'uid-123',
      generadoPorNombre: 'angel.luna@vermur.com',
      fechaGeneracion: '2026-10-01T12:00:00Z',
    };
    expect(doc.tipo).toBe('notificacion_arribo');
    expect(doc.version).toBe(1);
  });

  it('DocumentoGenerado acepta parámetros opcionales', () => {
    const doc: DocumentoGenerado = {
      tipo: 'carta_encomienda',
      version: 1,
      storagePath: 'embarques/abc/docs/carta_encomienda-v1-1234.pdf',
      url: 'https://storage.example.com/...',
      generadoPor: 'uid-123',
      generadoPorNombre: 'angel.luna@vermur.com',
      fechaGeneracion: '2026-10-01T12:00:00Z',
      parametros: { aduana: 'Manzanillo', patente: '1234' },
    };
    expect(doc.parametros?.aduana).toBe('Manzanillo');
  });
});
