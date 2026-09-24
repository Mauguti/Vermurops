/**
 * frenoCliente.ts
 *
 * El freno «sin cliente vinculado» (Bloque 2a, 25-sep-2026).
 *
 * Regla del negocio: una cotización que sigue apuntando solo al prospecto
 * no se marca ganada ni abre embarque. Sin salto para nadie. La auditoría
 * de producción y `revisarCliente` ya lo avisaban; esto lo DETIENE.
 *
 * Una sola función, llamada desde:
 *   - la máquina de estados, como `validar` de toda transición a `ganada`
 *     (cubre la franja, el selector de etapa y el arrastre del Kanban);
 *   - `crearEmbarquesDeCotizacionGanada` (ruta automática);
 *   - la ruta manual de «Abrir embarque» en Embarques → Por capturar.
 * La regla y sus call sites juntos: ya nos pasó con `embarqueIds` que una
 * ruta se saltaba la lógica.
 */

export const RAZON_SIN_CLIENTE =
  'Esta cotización no tiene cliente vinculado. Vincúlalo en Información antes de marcarla ganada o de abrir su embarque.';

/** Etiqueta corta, para un selector o un tooltip. */
export const RAZON_SIN_CLIENTE_CORTA = 'sin cliente vinculado';

/** Null si tiene cliente; si no, la razón lista para mostrar. */
export function razonSinCliente(quote: { clienteId?: string | null }): string | null {
  return quote.clienteId ? null : RAZON_SIN_CLIENTE;
}

/** Para las rutas que escriben: detiene con la misma razón. */
export function exigirClienteVinculado(quote: { id?: string; clienteId?: string | null }): void {
  const razon = razonSinCliente(quote);
  if (razon) throw new Error(razon);
}

/** ¿Esta razón de la máquina de estados es la del cliente? (para ofrecer el camino) */
export function esRazonSinCliente(razon: string | null | undefined): boolean {
  return razon === RAZON_SIN_CLIENTE;
}
