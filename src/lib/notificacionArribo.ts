/**
 * notificacionArribo.ts — lógica para la generación de la notificación de arribo.
 *
 * 1. Validación de datos obligatorios antes de generar.
 * 2. Filtro de cargos de venta para el documento.
 *
 * Los cargos que entran al documento son TODOS los de venta (tipo === 'ingreso')
 * del embarque. Vermur está por confirmar cuáles van (pregunta G18); este es
 * el único lugar que hay que cambiar.
 */

import type { EmbarqueCompleto, CargoDetalle } from '../components/shipments/EmbarquesData';

// ── Validación ──────────────────────────────────────────────────────────────

export interface FaltanteArribo {
  campo: string;
  etiqueta: string;
}

/**
 * Verifica que el embarque tenga los datos obligatorios para generar
 * la notificación de arribo. Devuelve un arreglo vacío si todo está completo.
 */
export function validarParaArribo(embarque: EmbarqueCompleto): FaltanteArribo[] {
  const faltantes: FaltanteArribo[] = [];

  if (!embarque.numeroGuia?.trim()) {
    faltantes.push({ campo: 'numeroGuia', etiqueta: 'Número de BL / Guía' });
  }

  if (!embarque.fechas?.arribo?.trim()) {
    faltantes.push({ campo: 'fechas.arribo', etiqueta: 'Fecha de arribo (ETA)' });
  }

  if (!embarque.ruta?.destino?.puertoDescarga?.trim()) {
    faltantes.push({ campo: 'ruta.destino.puertoDescarga', etiqueta: 'Puerto de arribo' });
  }

  if (!embarque.entidades?.consignatario?.trim()) {
    faltantes.push({ campo: 'entidades.consignatario', etiqueta: 'Consignatario' });
  }

  return faltantes;
}

// ── Cargos para el documento ────────────────────────────────────────────────

/**
 * Filtra los cargos de venta del embarque para la notificación de arribo.
 *
 * Por defecto: todos los de tipo 'ingreso' con monto > 0.
 * Pregunta G18: Vermur está por confirmar cuáles van. Si hay que cambiar
 * el criterio (por ejemplo, excluir ciertos conceptos), se cambia aquí.
 */
export function cargosParaArribo(detalles: CargoDetalle[]): CargoDetalle[] {
  return detalles.filter(c => c.tipo === 'ingreso' && (c.monto ?? 0) > 0);
}
