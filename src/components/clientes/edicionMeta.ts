/**
 * edicionMeta.ts
 *
 * Tipo del contexto de edición en línea que viaja a las columnas de
 * SpreadsheetTable a través de `table.options.meta`.
 */

import type { UsuarioEquipo } from '../../auth/AuthContext';
import type { AreaEjecutivo } from '../../lib/edicionEnLista';

export interface EdicionEnListaContext {
  puedeEditar: boolean;
  onCambiarEstado: (id: string, nuevoActivo: boolean) => Promise<void>;
  onCambiarEjecutivo: (id: string, area: AreaEjecutivo, email: string | null) => Promise<void>;
  opcionesEjecutivo: (area: AreaEjecutivo) => UsuarioEquipo[];
}

export interface EdicionEnListaMeta {
  edicion?: EdicionEnListaContext;
}
