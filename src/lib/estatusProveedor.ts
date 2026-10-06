/**
 * Estatus de un proveedor, con el MISMO criterio que el del cliente
 * (`estatusCliente.ts`): solo el inactivo EXPLÍCITO (`activo === false`) queda
 * fuera. Un proveedor sin el campo es operable.
 *
 * Antes los selectores filtraban `p.activo` (sin campo = fuera) y la cabecera
 * de la ficha decía «Activo» para ese mismo proveedor: la lista y la ficha se
 * contradecían. Ahora todos llaman aquí. El campo no se escribe en ningún
 * documento.
 */

export function proveedorOperable(p: { activo?: unknown }): boolean {
  return p.activo !== false;
}

