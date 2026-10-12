import { describe, it, expect } from 'vitest';
import {
  TOPE_NIVELES_ESTIBA, topeNivelesEstiba, problemaNivelesEstiba, leerEstiba, etiquetaEstiba,
  textoCortoEstiba, conEstiba, leerNivelesEstiba, modalidadEstibaDeTexto, estibaLegacy,
} from './estiba';
import { validarCarga, resumenCarga, cargaDesdeLegacy, productosDesdeCarga, borradorTieneDatos } from './cargaSolicitud';
import { cargaParaPdf } from './pdfCotizacion';
import type { CargaSolicitada, ServicioSolicitado } from '../components/quotes/QuotesData';

const terrestre = (extra = {}): CargaSolicitada =>
  ({ tipo: 'terrestre', tipoUnidad: 'caja_seca_53', pesoBrutoKg: 1000, piezas: 4, requiereManiobras: false, ...extra });
const aereo = (extra = {}): CargaSolicitada =>
  ({ tipo: 'aereo', pesoBrutoKg: 100, pesoVolumetricoKg: 0, piezas: 2, bultos: [], peligrosa: { esPeligrosa: false }, ...extra });
const lcl = (extra = {}): CargaSolicitada =>
  ({ tipo: 'lcl', pesoBrutoKg: 900, volumenM3: 4, piezas: 3, bultos: [], estibable: true, peligrosa: { esPeligrosa: false }, ...extra });
const fcl = (extra = {}): CargaSolicitada =>
  ({ tipo: 'fcl', contenedores: [{ tipoContenedor: '40', cantidad: 1 }], pesoBrutoKg: 9000, peligrosa: { esPeligrosa: false }, refrigeracion: { requiere: false }, ...extra });

describe('topes por modalidad (una sola constante)', () => {
  it('terrestre 5, aéreo 3, marítimo sin tope', () => {
    expect(TOPE_NIVELES_ESTIBA.terrestre).toBe(5);
    expect(TOPE_NIVELES_ESTIBA.aereo).toBe(3);
    expect(topeNivelesEstiba('maritimo')).toBeNull();
  });
  it('terrestre: 5 pasa, 6 no', () => {
    expect(problemaNivelesEstiba('terrestre', 5)).toBeNull();
    expect(problemaNivelesEstiba('terrestre', 6)).toMatch(/máximo en terrestre es 5/);
  });
  it('aéreo: 3 pasa, 4 no', () => {
    expect(problemaNivelesEstiba('aereo', 3)).toBeNull();
    expect(problemaNivelesEstiba('aereo', 4)).toMatch(/máximo en aéreo es 3/);
  });
  it('marítimo: sin tope, pero mínimo 1 y entero', () => {
    expect(problemaNivelesEstiba('maritimo', 40)).toBeNull();
    expect(problemaNivelesEstiba('maritimo', 0)).not.toBeNull();
    expect(problemaNivelesEstiba('maritimo', 1.5)).not.toBeNull();
  });
  it('vacío pasa: los niveles son opcionales', () => {
    expect(problemaNivelesEstiba('terrestre', null)).toBeNull();
    expect(problemaNivelesEstiba('terrestre', undefined)).toBeNull();
  });
});

describe('validarCarga con estiba', () => {
  it('terrestre con 6 niveles no valida; con 5 sí', () => {
    expect(validarCarga(terrestre({ estibable: true, nivelesEstiba: 6 })).join()).toMatch(/Estiba/);
    expect(validarCarga(terrestre({ estibable: true, nivelesEstiba: 5 }))).toEqual([]);
  });
  it('aéreo con 4 no valida', () => {
    expect(validarCarga(aereo({ estibable: true, nivelesEstiba: 4 })).join()).toMatch(/Estiba/);
  });
  it('marítimo LCL y FCL con 12 sí validan', () => {
    expect(validarCarga(lcl({ nivelesEstiba: 12 }))).toEqual([]);
    expect(validarCarga(fcl({ estibable: true, nivelesEstiba: 12 }))).toEqual([]);
  });
  it('no estibable no valida niveles viejos sueltos', () => {
    expect(validarCarga(terrestre({ estibable: false, nivelesEstiba: 9 }))).toEqual([]);
  });
});

describe('lectura y textos', () => {
  it('no estibable ⇒ sin niveles aunque haya un número guardado', () => {
    expect(leerEstiba({ estibable: false, nivelesEstiba: 3 })).toEqual({ estibable: false, niveles: null });
  });
  it('etiquetas', () => {
    expect(etiquetaEstiba({ estibable: true, nivelesEstiba: 3 })).toBe('Estibable ×3');
    expect(etiquetaEstiba({ estibable: false })).toBe('No estibable');
    expect(etiquetaEstiba({ estibable: true })).toBe('Estibable (niveles sin indicar)');
    expect(etiquetaEstiba({})).toBe('Sin indicar');
  });
  it('texto corto: solo lo decidido', () => {
    expect(textoCortoEstiba({ estibable: true, nivelesEstiba: 2 })).toBe('estibable ×2');
    expect(textoCortoEstiba({ estibable: false })).toBe('no estibable');
    expect(textoCortoEstiba({ estibable: true })).toBeNull();
    expect(textoCortoEstiba({})).toBeNull();
  });
  it('un niveles basura se lee como null', () => {
    expect(leerNivelesEstiba(0)).toBeNull();
    expect(leerNivelesEstiba('3')).toBeNull();
    expect(leerNivelesEstiba(2.5)).toBeNull();
    expect(leerNivelesEstiba(3)).toBe(3);
  });
  it('conEstiba borra la clave de niveles y nunca deja undefined', () => {
    const c = conEstiba<{ estibable?: boolean; nivelesEstiba?: number | null; otro: number }>({ estibable: true, nivelesEstiba: 3, otro: 1 }, false, null);
    expect(c).toEqual({ estibable: false, otro: 1 });
    expect('nivelesEstiba' in c).toBe(false);
    const d = conEstiba<{ estibable?: boolean; otro: number }>({ otro: 1 }, true, null);
    expect(d).toEqual({ estibable: true, otro: 1 });
  });
  it('modalidad desde texto libre', () => {
    expect(modalidadEstibaDeTexto('Aéreo')).toBe('aereo');
    expect(modalidadEstibaDeTexto('terrestre')).toBe('terrestre');
    expect(modalidadEstibaDeTexto('maritimo')).toBe('maritimo');
    expect(modalidadEstibaDeTexto(undefined)).toBe('maritimo');
  });
});

describe('integración con la solicitud, el embarque y el PDF', () => {
  it('resumen: «estibable ×3» y «no estibable»; LCL viejo sin niveles no ensucia', () => {
    expect(resumenCarga(lcl({ nivelesEstiba: 3 }))).toContain('estibable ×3');
    expect(resumenCarga(lcl({ estibable: false }))).toContain('no estibable');
    expect(resumenCarga(lcl())).not.toContain('estibable');
    expect(resumenCarga(terrestre({ estibable: true, nivelesEstiba: 4 }))).toContain('estibable ×4');
  });
  it('legacy: ter_estibable se sigue leyendo', () => {
    const svc = { ter_unidad: 'Caja 53', ter_estibable: false } as unknown as ServicioSolicitado;
    const c = cargaDesdeLegacy(svc) as { estibable?: boolean };
    expect(c.estibable).toBe(false);
    expect(estibaLegacy({ ter_estibable: true }, 'terrestre')).toBe(true);
    expect(estibaLegacy({}, 'lcl')).toBeUndefined();
  });
  it('legacy LCL: lcl_estibable alimenta el estibable de siempre', () => {
    const svc = { tipo_embarque: 'LCL', lcl_estibable: false } as unknown as ServicioSolicitado;
    expect((cargaDesdeLegacy(svc) as { estibable: boolean }).estibable).toBe(false);
  });
  it('el producto del embarque hereda estibable y niveles; sin valor no escribe claves', () => {
    const con = productosDesdeCarga({ carga: terrestre({ estibable: true, nivelesEstiba: 3 }), mercancia: 'x' } as unknown as ServicioSolicitado, 'C', 'COT-1');
    expect(con[0]).toMatchObject({ estibable: true, nivelesEstiba: 3 });
    const sin = productosDesdeCarga({ carga: terrestre(), mercancia: 'x' } as unknown as ServicioSolicitado, 'C', 'COT-1');
    expect('estibable' in sin[0]).toBe(false);
    expect('nivelesEstiba' in sin[0]).toBe(false);
    const no = productosDesdeCarga({ carga: aereo({ estibable: false, nivelesEstiba: 2 }), mercancia: 'x' } as unknown as ServicioSolicitado, 'C', 'COT-1');
    expect(no[0]).toMatchObject({ estibable: false });
    expect('nivelesEstiba' in no[0]).toBe(false);
  });
  it('PDF: la estiba va en el tipo de carga', () => {
    expect(cargaParaPdf({ carga: lcl({ nivelesEstiba: 3 }) } as unknown as ServicioSolicitado).tipo).toBe('LCL · estibable ×3');
    expect(cargaParaPdf({ carga: terrestre({ estibable: false }) } as unknown as ServicioSolicitado).tipo).toBe("Caja seca 53' · no estibable");
    expect(cargaParaPdf({ carga: lcl() } as unknown as ServicioSolicitado).tipo).toBe('LCL');
  });
  it('borrador: marcar estibable en terrestre cuenta como dato capturado', () => {
    const b = { origen: '', destino: '', mercancia: '', conceptosRequeridos: [], carga: terrestre({ estibable: true }) };
    expect(borradorTieneDatos({ ...b, carga: { ...terrestre({ estibable: true }), pesoBrutoKg: 0 } as CargaSolicitada } as never)).toBe(true);
  });
});
