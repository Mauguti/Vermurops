/**
 * filtrarProveedores.ts
 *
 * El filtro de la lista de proveedores en Altas (Bloque 5, 25-sep-2026).
 *
 * ── El bug ────────────────────────────────────────────────────────────────
 * Las pestañas «Todos · Navieras · Aerolíneas · Transportistas · Aduanales»
 * se pintaban desde el checkpoint inicial (22-jun-2026) como botones SIN
 * onClick, sin estado y con el resaltado fijo en «Todos»: nunca filtraron
 * nada. Y sus etiquetas tampoco correspondían al dato: el modelo tiene
 * `tipos[] = proveedor | transportista | agente_carga`, y `modalidades[]`
 * está vacío en los 544 proveedores reales de Magaya. Conectarlas tal cual
 * habría dado tres pestañas siempre en cero, que es peor que no filtrar.
 *
 * Las pestañas pasan a ser los tipos que el dato SÍ tiene. «Navieras» y
 * «Aerolíneas» vuelven cuando `TipoProveedor` crezca (deuda de §4.12).
 */

import type { ProveedorVermur, TipoProveedor } from '../components/proveedores/ProveedoresData';
import { contactoPrincipal } from '../components/proveedores/ProveedoresData';
import { contiene } from './texto';

/** 'todos' es la pestaña por defecto; las demás son tipos reales del modelo. */
export type PestanaProveedor = 'todos' | TipoProveedor;

export const PESTANAS_PROVEEDOR: { id: PestanaProveedor; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'proveedor', label: 'Proveedores' },
  { id: 'transportista', label: 'Transportistas' },
  { id: 'agente_carga', label: 'Agentes de carga' },
];

/** ¿Este proveedor cae en la pestaña? Un proveedor puede estar en varias (§4.5). */
export function enPestana(p: Pick<ProveedorVermur, 'tipos'>, pestana: PestanaProveedor): boolean {
  if (pestana === 'todos') return true;
  return (p.tipos ?? []).includes(pestana);
}

export interface FiltroProveedores {
  pestana?: PestanaProveedor;
  busqueda?: string;
  /** Por defecto se ven todos, como hasta hoy. */
  soloActivos?: boolean;
}

/**
 * Pestaña + búsqueda por nombre, RFC (o número de entidad de Magaya, que es
 * lo que traen los 544) y contacto principal. Tolera campos ausentes.
 */
export function filtrarProveedores(
  proveedores: readonly ProveedorVermur[],
  { pestana = 'todos', busqueda = '', soloActivos = false }: FiltroProveedores = {},
): ProveedorVermur[] {
  return proveedores.filter(p => {
    if (soloActivos && !p.activo) return false;
    if (!enPestana(p, pestana)) return false;
    const q = busqueda.trim();
    if (!q) return true;
    return contiene(p.nombre, q)
      || contiene(p.rfc ?? p.numeroEntidadMagaya, q)
      || contiene(contactoPrincipal(p)?.nombre, q);
  });
}

/** Cuántos hay en cada pestaña, respetando la búsqueda activa. */
export function conteoPorPestana(
  proveedores: readonly ProveedorVermur[],
  filtro: Omit<FiltroProveedores, 'pestana'> = {},
): Record<PestanaProveedor, number> {
  const out = {} as Record<PestanaProveedor, number>;
  PESTANAS_PROVEEDOR.forEach(({ id }) => {
    out[id] = filtrarProveedores(proveedores, { ...filtro, pestana: id }).length;
  });
  return out;
}
