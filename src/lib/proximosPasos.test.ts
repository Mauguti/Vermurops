/**
 * proximosPasos.test.ts
 *
 * La franja de «próximos pasos» (23-sep-2026) es lo primero que se ve al
 * abrir una cotización. Estos tests fijan que la línea de etapas respeta el
 * criterio de roles, que el botón es el de la etapa y el rol, y que cuando
 * no le toca a quien mira se dice a quién sí.
 */

import { describe, it, expect } from 'vitest';
import {
  lineaDeEtapas, indiceEnLinea, proximoPaso, aQuienLeToca, pasoAtras,
  LINEA_TIEMPO_INTERNA, HACIA_ADELANTE, ACCION_DE_AVANCE,
} from './proximosPasos';
import { LINEA_TIEMPO_VENTAS } from './visibilidadCotizacion';
import { transicionesDisponibles, rolesQuePueden, type Rol } from './stateMachine';
import { PIPELINE_STAGES, type KanbanQuote, type PipelineStageId } from '../components/quotes/QuotesData';

/** Una cotización mínima que pasa las validaciones de negocio. */
function cotizacion(etapa: PipelineStageId): KanbanQuote {
  return {
    id: 'COT-TEST', etapa,
    prospecto: { empresa: 'ACME', contacto: 'Ana', email: 'a@acme.mx', telefono: '' },
    servicios: [{
      id: 'S1', tipo: 'maritimo', descripcion: 'Flete', trafico: 'importacion',
      conceptos: [{
        id: 'C1', conceptoId: 'CON-1', nombre: 'Ocean Freight', tipoConcepto: 'costo_venta',
        proveedor: 'Naviera', proveedorId: 'PRV-1',
        costo: 100, costoCapturado: true, venta: 120, moneda: 'USD', montoCotizado: 100,
        tarifas: [{ proveedorId: 'PRV-1', proveedor: 'Naviera', monto: 100, moneda: 'USD', seleccionada: true }],
      }],
      cotizacionesProveedor: [],
    }],
    responsableVentas: 'Itzel', responsablePricing: 'Nohema',
    fechaCreacion: '2026-09-01', ultimaActualizacion: '2026-09-01',
    actividades: [], historialEtapas: [], chat: [], adjuntos: [],
  } as unknown as KanbanQuote;
}

describe('la línea de etapas por rol', () => {
  it('Ventas ve sus cinco pasos', () => {
    expect(lineaDeEtapas('ventas')).toBe(LINEA_TIEMPO_VENTAS);
    expect(lineaDeEtapas('ventas')).toHaveLength(5);
  });

  it('Pricing y Admin ven las etapas internas desglosadas', () => {
    expect(lineaDeEtapas('pricing')).toBe(LINEA_TIEMPO_INTERNA);
    expect(lineaDeEtapas('admin')).toBe(LINEA_TIEMPO_INTERNA);
    expect(LINEA_TIEMPO_INTERNA).toHaveLength(8);
  });

  it('toda etapa del pipeline cae en algún paso de cada línea', () => {
    PIPELINE_STAGES.forEach(s => {
      expect(indiceEnLinea(LINEA_TIEMPO_INTERNA, s.id)).toBeGreaterThanOrEqual(0);
      expect(indiceEnLinea(LINEA_TIEMPO_VENTAS, s.id)).toBeGreaterThanOrEqual(0);
    });
  });

  it('la línea interna va en el orden del pipeline', () => {
    const orden = PIPELINE_STAGES.filter(s => s.id !== 'perdida').map(s => indiceEnLinea(LINEA_TIEMPO_INTERNA, s.id));
    expect(orden).toEqual([...orden].sort((a, b) => a - b));
  });

  it('las tres etapas internas de Pricing caen en el mismo paso para Ventas', () => {
    const i = indiceEnLinea(LINEA_TIEMPO_VENTAS, 'pricing_solicitando');
    expect(indiceEnLinea(LINEA_TIEMPO_VENTAS, 'cotizaciones_recibidas')).toBe(i);
    expect(indiceEnLinea(LINEA_TIEMPO_VENTAS, 'consolidada')).toBe(i);
  });
});

describe('la tabla de avance', () => {
  it('cada destino hacia adelante tiene botón y frase', () => {
    Object.values(HACIA_ADELANTE).flat().forEach(hacia => {
      expect(ACCION_DE_AVANCE[hacia], hacia).toBeDefined();
    });
  });

  it('cada destino es una transición real de la máquina de estados', () => {
    (Object.keys(HACIA_ADELANTE) as PipelineStageId[]).forEach(desde => {
      HACIA_ADELANTE[desde]!.forEach(hacia =>
        expect(rolesQuePueden(desde, hacia), `${desde} → ${hacia}`).not.toHaveLength(0));
    });
  });
});

describe('proximoPaso', () => {
  const con = (etapa: PipelineStageId, rol: Rol) =>
    proximoPaso(etapa, rol, transicionesDisponibles(etapa, rol, cotizacion(etapa)));

  it('Ventas en solicitud: el botón es «Enviar a Pricing»', () => {
    const p = con('solicitud_cliente', 'ventas');
    expect(p.hacia).toBe('solicitado_pricing');
    expect(p.boton).toBe('Enviar a Pricing');
    expect(p.esDeEsteRol).toBe(true);
    expect(p.disponible).toBe(true);
    expect(p.leTocaA).toBeNull();
  });

  it('Pricing en consolidada NO envía al cliente: le toca a Ventas (§4.1)', () => {
    const p = con('consolidada', 'pricing');
    expect(p.hacia).toBe('enviada_cliente');
    expect(p.esDeEsteRol).toBe(false);
    expect(p.boton).toBeNull();
    expect(p.leTocaA).toBe('Ventas');
    expect(p.siguiente).toBe('enviar la cotización al cliente');
  });

  it('Ventas mientras Pricing cotiza: sin botón, y dice que le toca a Pricing', () => {
    const p = con('cotizaciones_recibidas', 'ventas');
    expect(p.esDeEsteRol).toBe(false);
    expect(p.leTocaA).toBe('Pricing');
  });

  it('Ventas en consolidada: el botón es «Enviar al cliente»', () => {
    const p = con('consolidada', 'ventas');
    expect(p.boton).toBe('Enviar al cliente');
  });

  it('ganada y perdida son terminales, sin botón', () => {
    expect(con('ganada', 'admin')).toMatchObject({ terminal: true, boton: null, hacia: null });
    expect(con('perdida', 'admin')).toMatchObject({ terminal: true, boton: null, hacia: null });
  });

  it('veto de NEGOCIO para el rol que sí puede: no dice «le toca a otro», explica', () => {
    // Pricing en recibidas sin transiciones disponibles (validación fallida):
    // la franja debe enseñar qué falta, no mandar a Pricing con Pricing.
    const p = proximoPaso('cotizaciones_recibidas', 'pricing', []);
    expect(p.hacia).toBe('consolidada');
    expect(p.esDeEsteRol).toBe(true);
    expect(p.disponible).toBe(false);
    expect(p.leTocaA).toBeNull();
  });
});

describe('aQuienLeToca', () => {
  it('no nombra a admin', () => {
    expect(aQuienLeToca('consolidada', 'enviada_cliente')).toBe('Ventas');
  });
  it('junta varias áreas con «o»', () => {
    expect(aQuienLeToca('negociacion', 'ganada')).toBe('Ventas o Pricing');
  });
  it('null para una transición que no existe', () => {
    expect(aQuienLeToca('ganada', 'solicitud_cliente')).toBeNull();
  });
});

// ─── Bloque 6 · regresar una etapa ───────────────────────────────────────────
// Era lo único que solo se podía hacer desde el selector de «Etapa del
// Pipeline»; sube a la franja antes de quitarlo.
describe('pasoAtras', () => {
  const casos: [PipelineStageId, Rol, PipelineStageId][] = [
    ['solicitado_pricing', 'ventas', 'solicitud_cliente'],
    ['pricing_solicitando', 'pricing', 'solicitado_pricing'],
    ['cotizaciones_recibidas', 'pricing', 'pricing_solicitando'],
    ['consolidada', 'pricing', 'cotizaciones_recibidas'],
    ['enviada_cliente', 'ventas', 'consolidada'],
    ['negociacion', 'ventas', 'enviada_cliente'],
  ];
  it.each(casos)('desde %s, %s puede regresar a %s', (desde, rol, esperada) => {
    expect(pasoAtras(desde, rol as never, cotizacion(desde))?.hacia).toBe(esperada);
  });

  it('admin puede regresar desde todas ellas', () => {
    casos.forEach(([desde, , esperada]) => {
      expect(pasoAtras(desde, 'admin' as never, cotizacion(desde))?.hacia).toBe(esperada);
    });
  });

  it('el rol que no es dueño de esa vuelta no la ve', () => {
    // Regresar de «enviada al cliente» a «consolidada» es de Ventas/Admin.
    expect(pasoAtras('enviada_cliente', 'pricing' as never, cotizacion('enviada_cliente'))).toBeNull();
  });

  it('no hay vuelta desde la primera etapa ni desde las terminales', () => {
    expect(pasoAtras('solicitud_cliente', 'ventas' as never, cotizacion('solicitud_cliente'))).toBeNull();
    expect(pasoAtras('ganada', 'admin' as never, cotizacion('ganada'))).toBeNull();
    expect(pasoAtras('perdida', 'admin' as never, cotizacion('perdida'))).toBeNull();
  });

  it('trae una etiqueta legible, no el id', () => {
    expect(pasoAtras('negociacion', 'ventas' as never, cotizacion('negociacion'))?.etiqueta).toBe('Enviada al cliente');
  });

  it('nunca ofrece ganada ni perdida como «regresar»', () => {
    casos.forEach(([desde, rol]) => {
      const atras = pasoAtras(desde, rol as never, cotizacion(desde))?.hacia;
      expect(atras).not.toBe('ganada');
      expect(atras).not.toBe('perdida');
    });
  });
});
