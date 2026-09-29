import { describe, it, expect } from 'vitest';
import {
  tipoDeArchivo, validarArchivo, rutaStorage, formatoTamano,
  admitePrevisualizacion, resumenDocumento, admiteReintento, TAMANO_MAXIMO_BYTES,
  DocumentoTarifario,
} from './documentoTarifario';

describe('tipo de archivo', () => {
  it('reconoce por mime', () => {
    expect(tipoDeArchivo('application/pdf', 'x.pdf')).toBe('pdf');
    expect(tipoDeArchivo('image/png', 'captura.png')).toBe('imagen');
    expect(tipoDeArchivo('text/csv', 'tarifas.csv')).toBe('excel');
  });

  it('cae a la extensión cuando el mime viene vacío o genérico', () => {
    // Windows manda mimes vacíos con frecuencia; sin este fallback, un Excel
    // legítimo se rechazaría.
    expect(tipoDeArchivo('', 'tarifario.xlsx')).toBe('excel');
    expect(tipoDeArchivo('application/octet-stream', 'cotizacion.pdf')).toBe('pdf');
  });

  it('lo desconocido es «otro», no se asume nada', () => {
    expect(tipoDeArchivo('application/zip', 'todo.zip')).toBe('otro');
  });
});

describe('validación antes de subir', () => {
  it('acepta un Excel normal', () => {
    expect(validarArchivo('tarifas.xlsx', '', 50_000).valido).toBe(true);
  });

  it('rechaza el archivo vacío', () => {
    expect(validarArchivo('x.pdf', 'application/pdf', 0).valido).toBe(false);
  });

  it('rechaza por tamaño y DICE QUÉ HACER', () => {
    // Rechazar aquí ahorra una subida y una ejecución del agente, que cuesta.
    const v = validarArchivo('escaneo.pdf', 'application/pdf', TAMANO_MAXIMO_BYTES + 1);
    expect(v.valido).toBe(false);
    expect(v.motivo).toContain('10 MB');
    expect(v.motivo).toContain('menos páginas');
  });

  it('rechaza formatos que el extractor no lee', () => {
    const v = validarArchivo('todo.zip', 'application/zip', 1000);
    expect(v.valido).toBe(false);
    expect(v.motivo).toContain('Excel, CSV, PDF');
  });
});

describe('ruta en Storage', () => {
  it('agrupa por año y mes', () => {
    expect(rutaStorage('abc', 'tarifas.xlsx', new Date('2026-08-31T12:00:00Z')))
      .toBe('tarifarios/2026/08/abc-tarifas.xlsx');
  });

  it('limpia caracteres que rompen la ruta', () => {
    const r = rutaStorage('id', 'Tarifas Sunway (agosto) #2.pdf', new Date('2026-08-01T00:00:00Z'));
    expect(r).not.toMatch(/[()#\s]/);
    expect(r).toContain('.pdf');
  });
});

describe('presentación', () => {
  it('formatea el tamaño', () => {
    expect(formatoTamano(512)).toBe('512 B');
    expect(formatoTamano(2048)).toBe('2 KB');
    expect(formatoTamano(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('imagen y PDF se previsualizan dentro de la ficha', () => {
    expect(admitePrevisualizacion('imagen')).toBe(true);
    expect(admitePrevisualizacion('pdf')).toBe(true);
    expect(admitePrevisualizacion('excel')).toBe(false);
  });
});

describe('resumen del documento', () => {
  const doc = (p: Partial<DocumentoTarifario>): DocumentoTarifario =>
    ({ tarifasExtraidas: 0, procesadoConIA: true, ...p } as DocumentoTarifario);

  it('dice cuántas tarifas salieron', () => {
    expect(resumenDocumento(doc({ tarifasExtraidas: 14 }))).toBe('14 tarifas extraídas');
    expect(resumenDocumento(doc({ tarifasExtraidas: 1 }))).toBe('1 tarifa extraída');
  });

  it('distingue el respaldo del tarifario', () => {
    // No todo documento es un tarifario: a veces es solo la evidencia.
    expect(resumenDocumento(doc({ procesadoConIA: false }))).toBe('Solo respaldo');
  });

  it('procesado sin resultados lo dice, no finge cero tarifas', () => {
    expect(resumenDocumento(doc({ tarifasExtraidas: 0 }))).toBe('Sin tarifas extraídas');
  });
});

// ─── Cómo terminó la extracción (28-sep-2026) ────────────────────────────────

describe('un tarifario que falla deja de verse igual que uno que nadie guardó', () => {
  const doc = (p: Partial<DocumentoTarifario>): DocumentoTarifario =>
    ({ tarifasExtraidas: 0, procesadoConIA: true, ...p } as DocumentoTarifario);

  /*
   * El agujero: `tarifasExtraidas: 0` era el estado de TRES cosas distintas —
   * la extracción falló, el documento no traía tarifas, o nadie guardó. Por
   * eso el equipo volvió a subir la misma captura cinco veces y el mismo PDF
   * cuatro: no había forma de saber si había servido.
   */
  it('«Falló» cuando el extractor no contestó', () => {
    expect(resumenDocumento(doc({ estadoExtraccion: 'fallo' }))).toBe('Falló');
  });

  it('«Sin tarifas» cuando contestó pero no traía nada utilizable', () => {
    // Es el caso de subir una factura al wizard de tarifarios.
    expect(resumenDocumento(doc({ estadoExtraccion: 'sin_tarifas' }))).toBe('Sin tarifas');
  });

  it('el estado manda sobre el conteo', () => {
    expect(resumenDocumento(doc({ estadoExtraccion: 'fallo', tarifasExtraidas: 0 })))
      .not.toBe('Sin tarifas extraídas');
  });

  it('«Solo respaldo» sigue ganando: ése nunca pasó por el extractor', () => {
    expect(resumenDocumento(doc({ procesadoConIA: false, estadoExtraccion: 'fallo' })))
      .toBe('Solo respaldo');
  });

  it('los documentos anteriores no traen estado y se siguen leyendo igual', () => {
    // Campo opcional con respaldo: nada se migra (§ regla de trabajo).
    expect(resumenDocumento(doc({ tarifasExtraidas: 7 }))).toBe('7 tarifas extraídas');
    expect(resumenDocumento(doc({ tarifasExtraidas: 0 }))).toBe('Sin tarifas extraídas');
  });
});

describe('a cuál se le ofrece «Reintentar»', () => {
  const doc = (p: Partial<DocumentoTarifario>): DocumentoTarifario =>
    ({ tarifasExtraidas: 0, procesadoConIA: true, ...p } as DocumentoTarifario);

  it('al que falló, sí', () => {
    expect(admiteReintento(doc({ estadoExtraccion: 'fallo' }))).toBe(true);
  });

  it('al que contestó sin tarifas, NO', () => {
    // Reintentar una factura da otra vez cero: lo que hace falta es subirla
    // donde va, no volver a gastar una ejecución del agente.
    expect(admiteReintento(doc({ estadoExtraccion: 'sin_tarifas' }))).toBe(false);
  });

  it('al que sí trajo tarifas, no', () => {
    expect(admiteReintento(doc({ estadoExtraccion: 'ok', tarifasExtraidas: 12 }))).toBe(false);
  });

  it('al respaldo, nunca: no pasó por el extractor a propósito', () => {
    expect(admiteReintento(doc({ procesadoConIA: false }))).toBe(false);
  });

  it('a los de antes en cero, sí: son los 22 de la auditoría', () => {
    // Sin estado y sin tarifas es justo el grupo que hay que recuperar.
    expect(admiteReintento(doc({ tarifasExtraidas: 0 }))).toBe(true);
  });
});
