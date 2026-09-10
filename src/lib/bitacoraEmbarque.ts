/**
 * bitacoraEmbarque.ts
 *
 * La bitácora interna del embarque: el rastro de auditoría más los
 * comentarios de Operaciones.
 *
 * ── Dos registros, dos públicos (reunión con el cliente, 10-sep-2026) ──────
 *   HISTORIAL (`eventos`)  → hitos redactados para el cliente; salen al portal
 *   BITÁCORA (`bitacora`)  → lo interno: lo que el sistema registra solo, y
 *                            lo que Operaciones anota
 * No se mezclan. Un comentario interno no puede aparecer en el portal, y un
 * hito del cliente no tiene por qué ensuciar la bitácora.
 *
 * ── Cómo se registra solo ──────────────────────────────────────────────────
 * Los cambios que pasan por la ficha se detectan COMPARANDO el embarque antes
 * y después de cada guardado (`conBitacora`), en vez de instrumentar cada
 * botón: así un cambio que llegue por un camino nuevo también queda. Lo que
 * pasa en otras colecciones —OC, facturas, cobros— lo anotan sus hooks, que
 * son el único lugar por donde eso se escribe.
 *
 * Reglas:
 *   · Las entradas del sistema no se editan ni se borran: es auditoría.
 *   · Un comentario lo edita solo quien lo escribió, y queda lo que decía.
 *   · Orden cronológico inverso al mostrar; se guarda en orden de llegada.
 *
 * Sin React, sin Firestore.
 */

import type {
  EmbarqueCompleto, EntradaBitacora, EventoBitacora, CargoDetalle, EmbarqueEntidades,
} from '../components/shipments/EmbarquesData';
import { estadoDe, ETAPA_MAP } from './estadoEmbarque';

export interface Autor { uid: string; nombre: string }

const money = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let contador = 0;
/** Id único dentro del proceso; el timestamp lo hace único entre sesiones. */
function idEntrada(ahora: string): string {
  contador += 1;
  return `bit-${Date.parse(ahora) || 0}-${contador}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Constructores ────────────────────────────────────────────────────────────

export function entradaSistema(
  evento: EventoBitacora, titulo: string, autor: Autor, ahora: string, detalle?: string,
): EntradaBitacora {
  return {
    id: idEntrada(ahora), tipo: 'sistema', evento, titulo, autor, fecha: ahora,
    ...(detalle ? { detalle } : {}),
  };
}

export function comentario(texto: string, autor: Autor, ahora: string): EntradaBitacora | null {
  const t = texto.trim();
  if (!t) return null;
  return { id: idEntrada(ahora), tipo: 'comentario', titulo: t, autor, fecha: ahora };
}

// ─── Edición de comentarios ──────────────────────────────────────────────────

export type ResultadoEdicion = { ok: true; bitacora: EntradaBitacora[] } | { ok: false; razon: string };

/**
 * Solo el autor edita su comentario, y lo que decía antes se conserva. Las
 * entradas del sistema no se tocan: son auditoría.
 */
export function editarComentario(
  bitacora: readonly EntradaBitacora[],
  id: string,
  textoNuevo: string,
  autorUid: string,
  ahora: string,
): ResultadoEdicion {
  const entrada = bitacora.find(e => e.id === id);
  if (!entrada) return { ok: false, razon: 'El comentario ya no existe.' };
  if (entrada.tipo !== 'comentario') return { ok: false, razon: 'Las entradas del sistema no se editan: son el rastro de auditoría.' };
  if (entrada.autor.uid !== autorUid) return { ok: false, razon: 'Solo quien escribió el comentario puede editarlo.' };
  const t = textoNuevo.trim();
  if (!t) return { ok: false, razon: 'El comentario no puede quedar vacío.' };
  if (t === entrada.titulo) return { ok: true, bitacora: [...bitacora] };

  return {
    ok: true,
    bitacora: bitacora.map(e => e.id !== id ? e : {
      ...e,
      titulo: t,
      editadoEn: ahora,
      ediciones: [...(e.ediciones ?? []), { fecha: ahora, textoAnterior: e.titulo }],
    }),
  };
}

// ─── Lo que el sistema registra solo ─────────────────────────────────────────

const ROLES: Record<keyof EmbarqueEntidades, string> = {
  expedidor: 'Expedidor', consignatario: 'Consignatario', notificar: 'Notificar a',
  agenteAduanal: 'Agente aduanal', agenteCarga: 'Agente de carga', agenteDestino: 'Agente de destino',
  importador: 'Importador', clienteCobrar: 'Cliente a cobrar',
};

const CIERRES: Record<'operativo' | 'pago' | 'administrativo', string> = {
  operativo: 'operativo', pago: 'de pago', administrativo: 'administrativo',
};

/**
 * Las entradas que describen lo que cambió entre dos versiones del embarque.
 * `hoy` (YYYY-MM-DD) se inyecta para que la etapa derivada sea estable en pruebas.
 */
export function diffParaBitacora(
  antes: EmbarqueCompleto,
  despues: EmbarqueCompleto,
  autor: Autor,
  ahora: string,
  hoy: string = ahora.slice(0, 10),
): EntradaBitacora[] {
  const out: EntradaBitacora[] = [];
  const quien = autor.nombre || 'Alguien';

  // Etapa
  const e1 = estadoDe(antes, hoy), e2 = estadoDe(despues, hoy);
  if (e1 !== e2) {
    out.push(entradaSistema('etapa', `${quien} movió el embarque de ${ETAPA_MAP[e1].label} a ${ETAPA_MAP[e2].label}`, autor, ahora));
  }

  // Cierres
  (['operativo', 'pago', 'administrativo'] as const).forEach(c => {
    const a = !!antes.cierres?.[c], d = !!despues.cierres?.[c];
    if (a !== d) {
      out.push(entradaSistema('cierre', d ? `${quien} marcó el cierre ${CIERRES[c]}` : `${quien} reabrió el cierre ${CIERRES[c]}`, autor, ahora));
    }
  });

  // Cargos: montos editados, agregados, quitados
  const cargosAntes = new Map((antes.cargos?.detalles ?? []).map(c => [c.id, c]));
  const cargosDespues = new Map((despues.cargos?.detalles ?? []).map(c => [c.id, c]));
  cargosDespues.forEach((c, id) => {
    const previo = cargosAntes.get(id);
    if (!previo) {
      out.push(entradaSistema('cargo', `${quien} agregó el cargo «${c.concepto}»`, autor, ahora,
        `${c.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} de ${c.moneda} ${money(c.monto)}`));
    } else if (previo.monto !== c.monto) {
      out.push(entradaSistema('cargo', `${quien} cambió el ${c.tipo === 'ingreso' ? 'precio' : 'costo'} de «${c.concepto}»`, autor, ahora,
        `De ${c.moneda} ${money(previo.monto)} a ${c.moneda} ${money(c.monto)}`));
    } else if (!previo.ordenCompraId && c.ordenCompraId) {
      // La OC la anota su hook; aquí solo el enlace del cargo, sin duplicar.
    }
  });
  cargosAntes.forEach((c, id) => {
    if (!cargosDespues.has(id)) {
      out.push(entradaSistema('cargo', `${quien} quitó el cargo «${c.concepto}»`, autor, ahora, `${c.moneda} ${money(c.monto)}`));
    }
  });

  // Responsable
  if ((antes.responsableOperativo ?? '') !== (despues.responsableOperativo ?? '')) {
    out.push(entradaSistema('responsable',
      despues.responsableOperativo
        ? `${quien} asignó el embarque a ${despues.responsableOperativo}`
        : `${quien} quitó al responsable operativo`,
      autor, ahora, antes.responsableOperativo ? `Antes: ${antes.responsableOperativo}` : undefined));
  }

  // Entidades y transportista
  (Object.keys(ROLES) as (keyof EmbarqueEntidades)[]).forEach(rol => {
    const a = antes.entidades?.[rol] ?? '', d = despues.entidades?.[rol] ?? '';
    if (a !== d) {
      out.push(entradaSistema('entidad', `${quien} cambió ${ROLES[rol]}`, autor, ahora, `${a || '—'} → ${d || '—'}`));
    }
  });
  const t1 = antes.ruta?.origen?.transportista ?? '', t2 = despues.ruta?.origen?.transportista ?? '';
  if (t1 !== t2) out.push(entradaSistema('entidad', `${quien} cambió el transportista`, autor, ahora, `${t1 || '—'} → ${t2 || '—'}`));

  // Documentos
  const docsAntes = new Set((antes.documentos ?? []).map(d => d.id));
  (despues.documentos ?? []).forEach(d => {
    if (!docsAntes.has(d.id)) out.push(entradaSistema('documento', `${quien} subió el documento «${d.nombre}»`, autor, ahora, d.tipo));
  });
  const docsDespues = new Set((despues.documentos ?? []).map(d => d.id));
  (antes.documentos ?? []).forEach(d => {
    if (!docsDespues.has(d.id)) out.push(entradaSistema('documento', `${quien} quitó el documento «${d.nombre}»`, autor, ahora));
  });

  return out;
}

/**
 * El embarque a guardar, con lo que cambió ya anotado en su bitácora.
 *
 * Si el id no coincide (se está creando otro embarque, como un HBL hijo) no
 * hay nada que comparar y se devuelve tal cual.
 */
export function conBitacora(
  antes: EmbarqueCompleto,
  despues: EmbarqueCompleto,
  autor: Autor,
  ahora: string,
  hoy?: string,
): EmbarqueCompleto {
  if (antes.id !== despues.id) return despues;
  const nuevas = diffParaBitacora(antes, despues, autor, ahora, hoy);
  if (nuevas.length === 0) return despues;
  return { ...despues, bitacora: [...(despues.bitacora ?? antes.bitacora ?? []), ...nuevas] };
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

export type FiltroBitacora = 'todo' | 'comentarios' | 'sistema';

/** Lo más reciente arriba, filtrado. */
export function filtrarBitacora(bitacora: readonly EntradaBitacora[], filtro: FiltroBitacora): EntradaBitacora[] {
  return [...bitacora]
    .filter(e => filtro === 'todo' || (filtro === 'comentarios' ? e.tipo === 'comentario' : e.tipo === 'sistema'))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Etiqueta corta del evento, para el icono/badge. */
export const ETIQUETA_EVENTO: Record<EventoBitacora, string> = {
  etapa: 'Etapa', cierre: 'Cierre', cargo: 'Cargo', orden_compra: 'Orden de compra', factura: 'Factura',
  cobro: 'Cobro', entidad: 'Entidad', responsable: 'Responsable', documento: 'Documento', otro: 'Sistema',
};

/** Lo que registra un cargo con OC, para los hooks que no ven el embarque entero. */
export function tituloOC(accion: 'generada' | 'autorizada' | 'pagada' | 'rechazada', folio: string, proveedor: string, quien: string): string {
  const verbo = { generada: 'generó', autorizada: 'autorizó', pagada: 'pagó', rechazada: 'rechazó' }[accion];
  return `${quien} ${verbo} la orden de compra ${folio} a ${proveedor}`;
}

/** Para las pruebas: reinicia el contador de ids. */
export function _reiniciarIds(): void { contador = 0; }

export type { CargoDetalle };
