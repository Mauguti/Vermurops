/**
 * Criterio único de «activo» para los catálogos con baja lógica (puertos,
 * conceptos…), el mismo que usan clientes (`estatusCliente.ts`) y proveedores
 * (`estatusProveedor.ts`): solo el inactivo EXPLÍCITO (`activo === false`)
 * queda fuera. Un registro sin el campo es operable. No se escribe nada.
 */
export function catalogoOperable(x: { activo?: unknown }): boolean {
  return x.activo !== false;
}
