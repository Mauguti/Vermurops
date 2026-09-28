/**
 * enlaceDirecto.ts
 *
 * Abrir una ficha desde una URL, y por tanto en una pestaña nueva.
 *
 * ── Por qué con parámetros y no con un router ──────────────────────────────
 * La app no tiene rutas: `currentView` es un `useState` y `NavegacionContext`
 * hace saltos entre módulos sin tocar la URL. Meter un router aquí tocaría el
 * armazón entero para resolver un caso concreto —«quiero ver la ficha del
 * proveedor sin perder la cotización que estoy capturando»—.
 *
 * El parámetro reusa el patrón que ya existe para el enlace de restablecer
 * contraseña (`leerAccionDeUrl`): la URL se lee UNA vez al arrancar, se
 * convierte en un destino y se limpia. No hay historial ni rutas profundas, y
 * no se pretende que las haya.
 *
 * ── Lo que esto NO resuelve, a propósito ───────────────────────────────────
 * Atrás y adelante del navegador siguen sin funcionar dentro de la app, y
 * recargar una ficha abierta con un clic normal la pierde. Cuando eso importe,
 * será por un router de verdad, no por más parámetros.
 *
 * Lógica pura: sin React ni Firestore.
 */

import type { Destino, TipoEntidad } from '../navegacion/NavegacionContext';

/**
 * El nombre del parámetro por tipo.
 *
 * Uno por tipo en vez de `?tipo=cliente&id=…`: la URL se lee sola
 * —`?proveedor=PRV-0042`— y quien la pegue en un chat sabe qué va a abrir.
 */
const PARAMETRO: Record<TipoEntidad, string> = {
  cotizacion: 'cotizacion',
  prospecto: 'prospecto',
  embarque: 'embarque',
  cliente: 'cliente',
  proveedor: 'proveedor',
  ordenCompra: 'orden',
};

const POR_PARAMETRO = Object.fromEntries(
  Object.entries(PARAMETRO).map(([tipo, param]) => [param, tipo as TipoEntidad]),
) as Record<string, TipoEntidad>;

/**
 * La URL que abre esa ficha. Relativa, para que sirva igual en producción, en
 * un canal de preview y en localhost.
 */
export function urlDeEntidad(tipo: TipoEntidad, id: string, base = '/'): string {
  return `${base}?${PARAMETRO[tipo]}=${encodeURIComponent(id)}`;
}

/**
 * El destino que pide la URL, si pide alguno.
 *
 * Con varios parámetros gana el PRIMERO del orden declarado, no el primero de
 * la cadena: así la misma URL siempre abre lo mismo, sin depender de cómo la
 * escribió quien la armó.
 *
 * Un id vacío o de solo espacios se ignora: `?cliente=` no es una petición de
 * abrir un cliente, es una URL mal armada, y abrir una ficha vacía se ve como
 * si el dato se hubiera perdido.
 */
export function leerEntidadDeUrl(search: string): Destino | null {
  const p = new URLSearchParams(search);
  for (const [tipo, param] of Object.entries(PARAMETRO) as [TipoEntidad, string][]) {
    const id = (p.get(param) ?? '').trim();
    if (id) return { tipo, id };
  }
  return null;
}

/** ¿Este parámetro es uno de los nuestros? Para limpiar sin tocar los demás. */
export function esParametroDeEntidad(nombre: string): boolean {
  return nombre in POR_PARAMETRO;
}

/**
 * La misma URL sin los parámetros de entidad.
 *
 * Se limpia DESPUÉS de saltar para que recargar no vuelva a la ficha ni deje
 * un parámetro muerto colgando. Conserva cualquier otro parámetro: `mode` y
 * `oobCode` del correo de contraseña pasan por aquí y no son nuestros.
 */
export function urlSinEntidad(pathname: string, search: string): string {
  const p = new URLSearchParams(search);
  Object.values(PARAMETRO).forEach(param => p.delete(param));
  const resto = p.toString();
  return resto ? `${pathname}?${resto}` : pathname;
}
