/**
 * buscarClientes.ts
 *
 * El buscador de «Vincular cliente» de la ficha de cotización.
 *
 * ── El bug que lo trajo aquí (25-sep-2026, bloque 3) ───────────────────────
 * El filtro vivía inline en FichaCotizacion y hacía `c.rfc.toLowerCase()`.
 * `rfc` es OPCIONAL en ClienteVermur y la semilla real de Magaya trae 817 de
 * 817 clientes sin él: en cuanto la búsqueda no coincidía con el nombre, el
 * `||` evaluaba el RFC y tronaba con «Cannot read properties of undefined
 * (reading 'toLowerCase')». Un TypeError dentro del render tira la app
 * entera a pantalla en blanco. Lógica pura, con tests: sin React.
 */

export interface ClienteBuscable {
  id: string;
  nombre?: string | null;
  rfc?: string | null;
}

/** Minúsculas y sin acentos: «plasticos» encuentra «Plásticos». */
const normalizar = (t: string | null | undefined): string =>
  (t ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Clientes cuyo nombre o RFC contiene la consulta. Tolera campos ausentes o
 * nulos; con consulta vacía no devuelve nada (el desplegable no se abre).
 */
export function buscarClientes<T extends ClienteBuscable>(
  clientes: readonly T[],
  consulta: string,
  maximo = 6,
): T[] {
  const q = normalizar(consulta);
  if (!q) return [];
  const out: T[] = [];
  for (const c of clientes) {
    if (normalizar(c.nombre).includes(q) || normalizar(c.rfc).includes(q)) {
      out.push(c);
      if (out.length >= maximo) break;
    }
  }
  return out;
}
