/**
 * Tests de analitica.ts.
 *
 * Lo que se fija aquí NO es que los eventos lleguen —eso lo dice el panel de
 * Analytics— sino que NADA de la operación pueda viajar en ellos. La lista
 * blanca es la barrera, y una barrera sin test es una intención.
 */

import { describe, it, expect } from 'vitest';
import { _limpiarParametros as limpiar } from './analitica';

describe('la lista blanca de parámetros', () => {
  it('deja pasar las dimensiones de uso', () => {
    expect(limpiar({ seccion: 'quotes', rol: 'pricing', modalidad: 'maritimo' }))
      .toEqual({ seccion: 'quotes', rol: 'pricing', modalidad: 'maritimo' });
  });

  it('descarta cualquier clave que no esté declarada', () => {
    expect(limpiar({ seccion: 'quotes', cliente: 'Siemens', rfc: 'SIE840101AAA' } as never))
      .toEqual({ seccion: 'quotes' });
  });

  it('un descuido pierde el parámetro, no manda el dato', () => {
    // Aunque alguien intente colar el nombre bajo una clave con buena pinta.
    const salida = limpiar({ empresa: 'Importadora del Golfo', monto: 45000, folio: 'COT-2026-0009' } as never);
    expect(salida).toEqual({});
  });

  it('conteo es un número de cosas, y como tal pasa', () => {
    expect(limpiar({ conteo: 3 })).toEqual({ conteo: 3 });
  });

  it('los booleanos pasan tal cual', () => {
    expect(limpiar({ tiene_detalle: false })).toEqual({ tiene_detalle: false });
  });

  it('un texto largo se descarta: la prosa lleva nombres', () => {
    const descripcion = 'Rollos de tela sintética para Grupo Textil Monterrey, pedido 4471';
    expect(limpiar({ motivo: descripcion })).toEqual({});
  });

  it('un texto vacío o en blanco no viaja', () => {
    expect(limpiar({ seccion: '   ' })).toEqual({});
  });

  it('recorta los espacios de las etiquetas legítimas', () => {
    expect(limpiar({ etapa: '  datos_carga  ' })).toEqual({ etapa: 'datos_carga' });
  });

  it('sin parámetros no explota', () => {
    expect(limpiar()).toEqual({});
    expect(limpiar({})).toEqual({});
  });
});
