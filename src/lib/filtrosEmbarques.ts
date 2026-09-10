/**
 * filtrosEmbarques.ts
 *
 * Los filtros de la vista general de Embarques. Todos los de Operaciones ven
 * todos los embarques —es carga compartida— pero cada quien trabaja los
 * suyos: «Solo los míos» es lo que se usa todos los días.
 *
 * Los filtros viven como texto plano (`Record<string, string | null>`) para
 * poder guardarse en una vista de usuario tal cual, sin serializar nada.
 *
 * Sin React, sin Firestore.
 */

import type { EmbarqueCompleto, ModalidadEmbarque } from '../components/shipments/EmbarquesData';
import { estadoDe, type EstadoEmbarque } from './estadoEmbarque';
import { clienteDelEmbarque } from './entidadesEmbarque';

export interface FiltrosEmbarques {
  /** Correo del responsable operativo. '' = todos. */
  responsable: string;
  estado: EstadoEmbarque | '';
  modalidad: ModalidadEmbarque | '';
  /** Id del cliente (clientes/). '' = todos. */
  clienteId: string;
  /** Qué fecha acota el rango. */
  fechaCampo: 'arribo' | 'salida';
  /** YYYY-MM-DD, inclusivos. '' = sin límite. */
  desde: string;
  hasta: string;
  /** Búsqueda libre: folio, guía, PO, consignatario, shipper. */
  busqueda: string;
  /** Cierre pendiente. '' = sin filtro. */
  cierrePendiente: 'operativo' | 'pago' | 'administrativo' | '';
}

export const FILTROS_VACIOS: FiltrosEmbarques = {
  responsable: '', estado: '', modalidad: '', clienteId: '',
  fechaCampo: 'arribo', desde: '', hasta: '', busqueda: '', cierrePendiente: '',
};

/** Cuántos filtros están activos (la búsqueda cuenta). */
export function filtrosActivos(f: FiltrosEmbarques): number {
  return [f.responsable, f.estado, f.modalidad, f.clienteId, f.desde, f.hasta, f.busqueda.trim(), f.cierrePendiente]
    .filter(Boolean).length;
}

/** De un mapa plano guardado en una vista a filtros válidos. Ignora lo desconocido. */
export function filtrosDesdeVista(guardados: Record<string, string | null> | undefined): FiltrosEmbarques {
  const f: FiltrosEmbarques = { ...FILTROS_VACIOS };
  if (!guardados) return f;
  for (const k of Object.keys(FILTROS_VACIOS) as (keyof FiltrosEmbarques)[]) {
    const v = guardados[k];
    if (typeof v === 'string') (f as unknown as Record<string, string>)[k] = v;
  }
  if (f.fechaCampo !== 'arribo' && f.fechaCampo !== 'salida') f.fechaCampo = 'arribo';
  return f;
}

/** Lo que se guarda en la vista: solo lo que no está vacío. */
export function filtrosParaVista(f: FiltrosEmbarques): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(FILTROS_VACIOS) as (keyof FiltrosEmbarques)[]) {
    if (f[k] && f[k] !== FILTROS_VACIOS[k]) out[k] = f[k];
  }
  return out;
}

export interface ContextoFiltro {
  /** Para resolver el cliente por enlace o por nombre (embarques viejos). */
  clientes: readonly { id: string; nombre: string }[];
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Aplica los filtros. Un embarque sin responsable NO aparece en «los de
 * Juan»: no se adivina a quién le toca. Sí aparece en «sin asignar», que es
 * cómo Operaciones ve lo que nadie ha tomado.
 */
export function aplicarFiltros(
  embarques: readonly EmbarqueCompleto[],
  f: FiltrosEmbarques,
  ctx: ContextoFiltro,
): EmbarqueCompleto[] {
  const q = norm(f.busqueda);
  const responsable = f.responsable.toLowerCase().trim();

  return embarques.filter(e => {
    if (responsable) {
      const suyo = (e.responsableOperativo ?? '').toLowerCase().trim();
      if (responsable === SIN_ASIGNAR ? suyo !== '' : suyo !== responsable) return false;
    }
    if (f.estado && estadoDe(e) !== f.estado) return false;
    if (f.modalidad && e.modalidad !== f.modalidad) return false;
    if (f.clienteId) {
      const c = clienteDelEmbarque(e, ctx.clientes);
      if (c?.id !== f.clienteId) return false;
    }
    if (f.desde || f.hasta) {
      const fecha = (e.fechas?.[f.fechaCampo] ?? '').slice(0, 10);
      // Sin fecha no cabe en ningún rango: filtrar por ETA es buscar lo que
      // ya tiene ETA.
      if (!fecha) return false;
      if (f.desde && fecha < f.desde) return false;
      if (f.hasta && fecha > f.hasta) return false;
    }
    if (f.cierrePendiente && e.cierres?.[f.cierrePendiente]) return false;
    if (q) {
      const texto = norm([
        e.folio, e.numeroGuia, e.referenciaCliente,
        e.entidades?.consignatario, e.entidades?.expedidor, e.entidades?.clienteCobrar,
      ].filter(Boolean).join(' '));
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

/** Valor especial del filtro de responsable: los que nadie ha tomado. */
export const SIN_ASIGNAR = '__sin_asignar__';

/**
 * Los responsables que aparecen en los embarques, para el selector: solo
 * quienes tienen algo asignado, más los del equipo de Operaciones.
 */
export function responsablesPresentes(
  embarques: readonly EmbarqueCompleto[],
  equipo: readonly { email: string; nombre: string }[],
): { email: string; nombre: string }[] {
  const vistos = new Map<string, string>();
  equipo.forEach(u => vistos.set(u.email.toLowerCase(), u.nombre));
  embarques.forEach(e => {
    const r = e.responsableOperativo?.toLowerCase().trim();
    if (r && !vistos.has(r)) vistos.set(r, r);
  });
  return [...vistos.entries()]
    .map(([email, nombre]) => ({ email, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
