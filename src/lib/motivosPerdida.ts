/**
 * motivosPerdida.ts
 *
 * Catálogo compartido de motivos de pérdida.
 *
 * Lo usan las cotizaciones perdidas y los prospectos descartados. Compartirlo
 * no es solo higiene: si cada uno tuviera su lista, no se podría responder
 * «¿por qué perdemos?» de un lado y del otro con el mismo criterio, que es
 * justo la pregunta que un catálogo de motivos existe para contestar.
 */

export interface MotivoPerdida {
  id: string;
  label: string;
  /** Pide detalle escrito además de elegir la opción. */
  requiereDetalle?: boolean;
}

export const MOTIVOS_PERDIDA: MotivoPerdida[] = [
  { id: 'precio',            label: 'Precio: cotizamos por encima' },
  { id: 'tiempo_respuesta',  label: 'Tardamos en responder' },
  { id: 'transito',          label: 'Tiempo de tránsito no le sirvió' },
  { id: 'competencia',       label: 'Se fue con otro proveedor' },
  { id: 'no_concreto',       label: 'El cliente no concretó la operación' },
  { id: 'sin_respuesta',     label: 'Dejó de responder' },
  { id: 'no_operamos',       label: 'No operamos esa ruta o servicio' },
  { id: 'credito',           label: 'No procedió por crédito o expediente' },
  { id: 'otro',              label: 'Otro', requiereDetalle: true },
];

export function labelMotivo(id: string | null | undefined): string {
  if (!id) return '';
  return MOTIVOS_PERDIDA.find(m => m.id === id)?.label ?? id;
}

/** ¿El motivo capturado está completo? */
export function motivoValido(id: string, detalle: string): boolean {
  const m = MOTIVOS_PERDIDA.find(x => x.id === id);
  if (!m) return false;
  return m.requiereDetalle ? detalle.trim().length > 0 : true;
}

/**
 * Texto que se guarda en `motivoPerdida`.
 * Se guarda el label y no el id para que el histórico siga siendo legible
 * aunque el catálogo cambie.
 */
export function componerMotivo(id: string, detalle: string): string {
  const label = labelMotivo(id);
  const d = detalle.trim();
  return d ? `${label} — ${d}` : label;
}
