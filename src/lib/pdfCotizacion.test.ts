import { describe, it, expect } from 'vitest';
import { armarPayloadPdf, cargaParaPdf, lineasParaPdf, nombreArchivoPdf, rutaStoragePdf, vigenciaSugerida } from './pdfCotizacion';
import { aplanarCotizacion } from './lineasCotizacion';
import type { KanbanQuote, ServicioSolicitado } from '../components/quotes/QuotesData';

const tarifa = (id: string, monto: number, moneda: 'USD' | 'MXN', vigencia?: string) =>
  ({ id, proveedor: 'Hapag', proveedorId: 'PRV-1', contacto: '', monto, moneda, seleccionada: true, vigencia });

const servicio: ServicioSolicitado = {
  id: 's1', tipo: 'maritimo', ruta: { origen: 'Shanghai', destino: 'Manzanillo' }, incoterm: 'FOB',
  mercancia: 'Textiles', peso: 18500, volumen: 0, estado: 'cotizado', trafico: 'impo',
  carga: { tipo: 'fcl', contenedores: [{ tipoContenedor: '40hc', cantidad: 2 }, { tipoContenedor: '20', cantidad: 1 }], pesoBrutoKg: 18500, peligrosa: { esPeligrosa: false }, refrigeracion: { requiere: false } },
  cotizacionesProveedor: [], profit: 0, recargosPct: 0,
  conceptos: [
    { id: 'c1', nombre: 'Flete marítimo', conceptoId: 'CON-001', costo: 0, profit: 300, venta: 0, margen: 0, subconceptos: [], tarifas: [tarifa('t1', 1500, 'USD', '2026-10-15')], proveedoresOficialIds: ['t1'], orden: 1 },
    { id: 'c2', nombre: 'Maniobras', conceptoId: 'CON-004', costo: 0, profit: 1000, venta: 0, margen: 0, subconceptos: [], tarifas: [tarifa('t2', 8000, 'MXN', '2026-09-30')], proveedoresOficialIds: ['t2'], orden: 0 },
  ],
} as unknown as ServicioSolicitado;

const quote = { id: 'COT-2026-0014', versionActual: 2, etapa: 'consolidada', prospecto: { empresa: 'Alfa S.A.', contacto: 'Ana', email: 'ana@alfa.mx', telefono: '', origen: 'web' }, servicios: [servicio], moneda: 'USD' } as unknown as KanbanQuote;

const opts = { idioma: 'es' as const, vigencia: '2026-09-30', notas: 'Sujeto a disponibilidad', contacto: 'Gabi · pricing@vermur.com', hoy: '2026-09-21' };

describe('el payload del PDF', () => {
  const p = armarPayloadPdf(quote, opts);

  it('folio con versión, cliente y ruta', () => {
    expect(p.folio).toBe('COT-2026-0014 v2');
    expect(p.cliente).toEqual({ nombre: 'Alfa S.A.', contacto: 'Ana', correo: 'ana@alfa.mx' });
    expect(p.modalidad).toBe('Marítimo');
    expect(p.ruta).toBe('Shanghai → Manzanillo');
    expect(p.incoterm).toBe('FOB');
  });

  it('las líneas llevan SOLO concepto y venta, en el orden de la tabla, con su moneda', () => {
    expect(p.lineas).toEqual([
      { concepto: 'Maniobras', venta: 9000, moneda: 'MXN' },
      { concepto: 'Flete marítimo', venta: 1800, moneda: 'USD' },
    ]);
    for (const l of p.lineas) {
      expect(l).not.toHaveProperty('costo');
      expect(l).not.toHaveProperty('proveedor');
      expect(l).not.toHaveProperty('margen');
    }
  });

  it('la carga tipada se mapea al bloque de carga', () => {
    expect(p.carga).toEqual({ tipo: 'FCL', contenedores: "2×40'HC + 1×20'", piezas: 0, peso: 18500, volumen: 0 });
  });

  it('el cliente del catálogo manda sobre el prospecto en el nombre', () => {
    const q = armarPayloadPdf(quote, { ...opts, cliente: { nombre: 'Alfa Corporativo S.A. de C.V.', contactos: [{ nombre: 'Roberto', email: 'r@alfa.mx', principal: true }] } });
    expect(q.cliente.nombre).toBe('Alfa Corporativo S.A. de C.V.');
    // el contacto capturado en la solicitud se conserva
    expect(q.cliente.contacto).toBe('Ana');
  });
});

describe('carga, vigencia y nombre', () => {
  it('LCL, aéreo, terrestre y despacho', () => {
    expect(cargaParaPdf({ ...servicio, carga: { tipo: 'lcl', pesoBrutoKg: 900, volumenM3: 4.5, piezas: 12, bultos: [], estibable: true, peligrosa: { esPeligrosa: false } } }))
      .toEqual({ tipo: 'LCL', contenedores: '', piezas: 12, peso: 900, volumen: 4.5 });
    expect(cargaParaPdf({ ...servicio, carga: { tipo: 'aereo', pesoBrutoKg: 300, pesoVolumetricoKg: 420, piezas: 5, bultos: [], peligrosa: { esPeligrosa: false } } }).volumen).toBe(420);
    expect(cargaParaPdf({ ...servicio, carga: { tipo: 'terrestre', tipoUnidad: 'caja_seca_53', pesoBrutoKg: 20000, piezas: 24, requiereManiobras: false } }).tipo).toContain('53');
    expect(cargaParaPdf({ ...servicio, carga: { tipo: 'despacho', aduana: 'Manzanillo', operacion: 'importacion', fraccionesArancelarias: [], valorMercancia: { monto: 1, moneda: 'USD' }, requierePrevio: false, requiereNOM: false } }).tipo).toBe('Despacho importación');
  });

  it('sin carga tipada cae al espejo legacy; sin servicio, vacío', () => {
    const legacy = { ...servicio, carga: undefined, peso: 500, volumen: 2 } as ServicioSolicitado;
    expect(cargaParaPdf(legacy).peso).toBe(500);
    expect(cargaParaPdf(undefined)).toEqual({ tipo: '', contenedores: '', piezas: 0, peso: 0, volumen: 0 });
  });

  it('la vigencia sugerida es la más corta de las tarifas elegidas', () => {
    expect(vigenciaSugerida(aplanarCotizacion(quote))).toBe('2026-09-30');
    expect(vigenciaSugerida([])).toBe('');
  });

  it('«COT-2026-0014 v2.pdf», y en inglés lo dice', () => {
    expect(nombreArchivoPdf(quote, 'es')).toBe('COT-2026-0014 v2.pdf');
    expect(nombreArchivoPdf(quote, 'en')).toBe('COT-2026-0014 v2 EN.pdf');
    expect(nombreArchivoPdf({ id: 'COT-2026-0001' }, 'es')).toBe('COT-2026-0001 v1.pdf');
  });

  it('la ruta en Storage es un solo segmento bajo cotizaciones/{id}/pdf/', () => {
    const r = rutaStoragePdf(quote, 'es', '2026-09-21T15:04:05.000Z');
    expect(r).toBe('cotizaciones/COT-2026-0014/pdf/20260921150405-v2-es.pdf');
  });

  it('una línea sin concepto no sale al cliente', () => {
    expect(lineasParaPdf([{ concepto: '  ', venta: 10, moneda: 'USD', orden: 0 } as never])).toEqual([]);
  });
});
