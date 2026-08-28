/**
 * seedGuard.ts
 *
 * Decide si una colección de Firestore puede sembrarse.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * Los hooks de catálogo siembran cuando la colección está vacía:
 *
 *     if (snapshot.empty && !seedAttempted) → escribir N documentos
 *
 * `onSnapshot` no entrega solo datos del servidor. También entrega snapshots
 * desde la caché local: en la primera carga antes de que responda el servidor,
 * al reconectar, o en una pestaña que estuvo offline. Un snapshot de caché de
 * una colección todavía no descargada llega con `empty: true`.
 *
 * Con la guarda vieja, ese snapshot bastaba para reescribir el catálogo
 * completo —544 proveedores, 817 clientes— sin que nadie apretara nada, encima
 * de datos vivos. Este módulo hace que eso sea imposible.
 *
 * ── La regla ────────────────────────────────────────────────────────────────
 * Solo se siembra con evidencia del SERVIDOR de que la colección está vacía.
 * Ante la duda, no se siembra: una colección sin sembrar se arregla recargando;
 * un catálogo sobrescrito se arregla restaurando un backup.
 *
 * Lógica pura: sin imports de Firestore ni de React, para poder probarla.
 */

// ─── Tipos mínimos ────────────────────────────────────────────────────────────
// Se declaran en vez de importar QuerySnapshot para que el módulo no dependa
// del SDK y los tests puedan pasar objetos planos.

export interface SnapshotMetadataLike {
  /** true si los datos salieron de la caché local, no del servidor. */
  fromCache: boolean;
  /** true si hay escrituras locales que el servidor todavía no confirma. */
  hasPendingWrites: boolean;
}

export interface SnapshotLike {
  empty: boolean;
  metadata: SnapshotMetadataLike;
}

export type RazonNoSembrar =
  | 'ya-intentado'
  | 'coleccion-con-datos'
  | 'snapshot-de-cache'
  | 'escrituras-pendientes';

export interface DecisionSeed {
  sembrar: boolean;
  razon?: RazonNoSembrar;
}

/** Mensajes para el log — el motivo importa al depurar un catálogo vacío. */
export const EXPLICACION: Record<RazonNoSembrar, string> = {
  'ya-intentado':          'ya se intentó sembrar en esta sesión',
  'coleccion-con-datos':   'la colección ya tiene documentos',
  'snapshot-de-cache':     'el snapshot viene de caché, no del servidor',
  'escrituras-pendientes': 'hay escrituras locales sin confirmar',
};

/**
 * ¿Este snapshot autoriza sembrar la colección?
 *
 * El orden de las comprobaciones va de lo más barato a lo más específico, y
 * cada una devuelve su motivo para poder explicarlo en consola.
 */
export function evaluarSeed(
  snapshot: SnapshotLike,
  yaIntentado: boolean,
): DecisionSeed {
  if (yaIntentado)                        return { sembrar: false, razon: 'ya-intentado' };
  if (!snapshot.empty)                    return { sembrar: false, razon: 'coleccion-con-datos' };

  // El corazón del fix: un snapshot vacío de caché NO prueba que la colección
  // esté vacía en el servidor. Solo prueba que este cliente aún no la bajó.
  if (snapshot.metadata.fromCache)        return { sembrar: false, razon: 'snapshot-de-cache' };

  // Escrituras locales en vuelo: el estado real todavía no está resuelto.
  if (snapshot.metadata.hasPendingWrites) return { sembrar: false, razon: 'escrituras-pendientes' };

  return { sembrar: true };
}
