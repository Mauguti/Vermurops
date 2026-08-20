/**
 * VistasData.ts (TV-4)
 *
 * Modelo de datos para vistas guardadas de usuario.
 * Colección Firestore: vistasUsuario/{id}
 *
 * Cada documento representa una configuración de columnas + orden guardada
 * para un módulo y usuario específicos.
 */

import type { ColumnaVista } from './SpreadsheetTable';

// ─── Módulos soportados ─────────────────────────────────────────────────────

export type ModuloVista = 'cotizaciones' | 'clientes' | 'proveedores' | 'embarques';

// ─── Modelo Firestore ───────────────────────────────────────────────────────

export interface VistaUsuario {
  id: string;

  /** Módulo al que aplica esta vista. */
  modulo: ModuloVista;

  /** UID del usuario que creó la vista. */
  usuarioId: string;

  /** Nombre para mostrar del creador (snapshot para UI, no se actualiza en cascada). */
  creadoPorNombre: string;

  /** Nombre de la vista (ej. "Mi vista compacta"). */
  nombre: string;

  /** Columnas visibles en orden, con ancho opcional. */
  columnas: ColumnaVista[];

  /** Ordenamiento guardado. null = sin ordenamiento fijo. */
  ordenamiento?: { columnaId: string; direccion: 'asc' | 'desc' } | null;

  /** ¿Es la vista predeterminada de este usuario para este módulo? */
  esDefault: boolean;

  /** ¿Es compartida (visible para todos los usuarios del módulo)? */
  compartida: boolean;

  /** Timestamps ISO. */
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Crea un doc nuevo con valores default. */
export function crearVistaVacia(
  modulo: ModuloVista,
  usuarioId: string,
  creadoPorNombre: string,
  nombre: string,
  columnas: ColumnaVista[],
): Omit<VistaUsuario, 'id'> {
  const ahora = new Date().toISOString();
  return {
    modulo,
    usuarioId,
    creadoPorNombre,
    nombre,
    columnas,
    ordenamiento: null,
    esDefault: false,
    compartida: false,
    createdAt: ahora,
    updatedAt: ahora,
  };
}
