/**
 * formularioPagoProveedor.ts — tarea 81 (PLAN-PAGOS §7.2)
 *
 * Las reglas del formulario «Registrar pago» de Programación de pagos, fuera
 * del componente para probarlas sin pantalla. Antes el formulario era un
 * `window.prompt` de una línea: la fecha del pago era la de captura y no había
 * forma de dejar fuera una orden del grupo ni adjuntar el comprobante.
 *
 * Aquí NO se decide el dinero: el total y las validaciones de grupo siguen
 * siendo de `pagos.ts` (`problemasDelGrupo`, `construirPagoDeGrupo`).
 */

import type { OrdenCompra } from '../components/ordenesCompra/OrdenesCompraData';
import { montoATransferir } from './anticipos';

/** Tipos que acepta `ordenesCompra/{id}/documentos/` (storage.rules) y su tope. */
export const COMPROBANTE_EXTENSIONES = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif'] as const;
export const COMPROBANTE_MAX_BYTES = 20 * 1024 * 1024;

/** YYYY-MM-DD de un Date en hora LOCAL: el «hoy» de quien captura, no el de UTC. */
export function hoyLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Null si la fecha sirve; si no, qué le pasa. El día en que el dinero salió no es futuro. */
export function problemaFechaPago(fecha: string, hoy: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Falta la fecha del pago.';
  const [a, m, d] = fecha.split('-').map(Number);
  const real = new Date(Date.UTC(a, m - 1, d));
  if (real.getUTCFullYear() !== a || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) {
    return 'La fecha del pago no existe.';
  }
  if (fecha > hoy) return 'La fecha del pago no puede ser futura: el pago es dinero que ya salió.';
  return null;
}

/**
 * Día (YYYY-MM-DD, hora LOCAL) en que se autorizó la orden: `autorizadaPor` y,
 * si no, la última entrada «autorizada» del historial. Null si no consta.
 */
export function diaAutorizacion(o: OrdenCompra): string | null {
  const iso = o.autorizadaPor?.fecha
    ?? [...(o.historialEstados ?? [])].reverse().find(r => r.estado === 'autorizada')?.fecha;
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : hoyLocal(t);
}

/** Una línea por orden cuya autorización es posterior a la fecha del pago. Vacío = sirve. */
export function problemasFechaContraAutorizacion(fecha: string, ordenes: readonly OrdenCompra[]): string[] {
  const out: string[] = [];
  for (const o of ordenes) {
    const dia = diaAutorizacion(o);
    if (dia && fecha < dia) {
      out.push(`${o.folio} se autorizó el ${dia}: el pago no puede tener fecha anterior (${fecha}).`);
    }
  }
  return out;
}

/**
 * Pago de UNA orden (desde su ficha, tarea 92): la misma regla que el de grupo
 * —fecha válida, no futura, no anterior a la autorización—, en una sola
 * respuesta. Null = sirve.
 */
export function problemaFechaPagoIndividual(fecha: string, hoy: string, orden: OrdenCompra): string | null {
  return problemaFechaPago(fecha, hoy) ?? problemasFechaContraAutorizacion(fecha, [orden])[0] ?? null;
}

/** Null si el archivo cabe en la regla de Storage; si no, por qué no. */
export function problemaComprobante(nombre: string, tamano: number): string | null {
  const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
  if (!(COMPROBANTE_EXTENSIONES as readonly string[]).includes(ext)) {
    return 'El comprobante debe ser PDF o imagen (JPG, PNG, HEIC).';
  }
  if (tamano >= COMPROBANTE_MAX_BYTES) return 'El comprobante pesa 20 MB o más.';
  return null;
}

/** Lo que SALE del banco por las órdenes elegidas, en su moneda (las mezclas las detiene el grupo). */
export function totalElegido(ordenes: readonly OrdenCompra[], elegidas: ReadonlySet<string>): number {
  return ordenes
    .filter(o => elegidas.has(o.id))
    .reduce((acc, o) => acc + montoATransferir(o), 0);
}

/** La cuenta de salida con la que arranca el formulario: la de las órdenes si coinciden, si no ninguna. */
export function bancoInicial(ordenes: readonly OrdenCompra[]): string {
  const bancos = new Set(ordenes.map(o => o.bancoSalida ?? ''));
  return bancos.size === 1 ? [...bancos][0] : '';
}

export interface EntradaFormularioPago {
  elegidas: number;
  referencia: string;
  fecha: string;
  hoy: string;
  archivo?: { nombre: string; tamano: number } | null;
  /** Órdenes elegidas: la fecha no puede ser anterior a su autorización. */
  ordenes?: readonly OrdenCompra[];
}

/** Todo lo que impide guardar, en el orden en que se lee el formulario. Vacío = se puede. */
export function problemasDelFormulario(e: EntradaFormularioPago): string[] {
  const out: string[] = [];
  if (e.elegidas === 0) out.push('Marca al menos una orden.');
  const f = problemaFechaPago(e.fecha, e.hoy);
  if (f) out.push(f);
  else if (e.ordenes) out.push(...problemasFechaContraAutorizacion(e.fecha, e.ordenes));
  if (!e.referencia.trim()) out.push('Falta la referencia de la transferencia.');
  if (e.archivo) {
    const c = problemaComprobante(e.archivo.nombre, e.archivo.tamano);
    if (c) out.push(c);
  }
  return out;
}
