/**
 * Estatus operativo de un cliente, leído sin esconder a nadie.
 *
 * La lista de Altas filtraba por `statusOperativo === 'ACTIVO'`, así que un
 * cliente sin el campo (o con un valor fuera de la lista) existía en
 * Firestore y no se veía en ninguna parte. Aquí se LEE el campo y lo que no
 * es ni ACTIVO ni INACTIVO es «sin estatus»: se muestra, con su etiqueta, para
 * que alguien decida. El campo no se escribe en ningún documento.
 */

export type EstatusCliente = 'activo' | 'inactivo' | 'sin_estatus';

export function estatusDeCliente(c: { statusOperativo?: unknown }): EstatusCliente {
  if (c.statusOperativo === 'ACTIVO') return 'activo';
  if (c.statusOperativo === 'INACTIVO') return 'inactivo';
  return 'sin_estatus';
}

export const ETIQUETA_ESTATUS: Record<EstatusCliente, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  sin_estatus: 'Sin estatus',
};

/** ¿Entra a la lista? Solo los inactivos se esconden, y solo si no se piden. */
export function visibleEnAltas(c: { statusOperativo?: unknown }, mostrarInactivos: boolean): boolean {
  return mostrarInactivos || estatusDeCliente(c) !== 'inactivo';
}

/** Cuántos clientes caen en el hueco, para avisarlo en la pantalla. */
export function contarSinEstatus(clientes: { statusOperativo?: unknown }[]): number {
  return clientes.filter(c => estatusDeCliente(c) === 'sin_estatus').length;
}
