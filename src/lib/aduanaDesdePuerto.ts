/**
 * aduanaDesdePuerto.ts
 *
 * Precarga de aduanas a partir del puerto seleccionado (tarea 30, 30-sep-2026).
 *
 * ── Regla de negocio ────────────────────────────────────────────────────────
 * En el 90 % de los casos la aduana coincide con el puerto. Se precarga,
 * editable para el 10 % restante:
 *
 *   - Puerto de ORIGEN mexicano → precarga `aduanaSalida`
 *   - Puerto de DESTINO mexicano → precarga `aduanaRecepcion`
 *
 * Corrección de Gaby: la aduana es la del puerto de ARRIBO, no la del destino
 * final en tierra. Aunque la carga vaya en tren a Pantaco, el despacho sigue
 * siendo en Lázaro Cárdenas.
 *
 * Solo precarga cuando el campo está vacío: nunca pisa lo que alguien ya
 * escribió. Se marca «precargada del puerto» y al editarla deja de serlo.
 *
 * Lógica pura: sin React ni Firestore.
 */

/** Lo mínimo que necesitamos de un puerto para resolver la aduana. */
export interface PuertoParaAduana {
  id: string;
  nombre: string;
  codigoPais: string;
}

const esMexicano = (p: PuertoParaAduana | null | undefined): p is PuertoParaAduana =>
  !!p && (p.codigoPais ?? '').trim().toUpperCase() === 'MEX';

/** Busca un puerto por ID en la lista. */
function buscar<P extends PuertoParaAduana>(puertos: P[], id: string | null | undefined): P | null {
  if (!id) return null;
  return puertos.find(p => p.id === id) ?? null;
}

// ─── Sugerencia ──────────────────────────────────────────────────────────────

export interface AduanaSugerida {
  /** Nombre del puerto mexicano de origen, si lo hay. */
  aduanaSalida: string | null;
  /** Nombre del puerto mexicano de destino, si lo hay. */
  aduanaRecepcion: string | null;
}

/**
 * Devuelve la aduana que corresponde precargar a partir de los puertos
 * seleccionados. Null en cada campo si el puerto no es mexicano o no existe.
 */
export function aduanaSugerida(
  puertos: PuertoParaAduana[],
  origenPuertoId: string | null | undefined,
  destinoPuertoId: string | null | undefined,
): AduanaSugerida {
  const origen = buscar(puertos, origenPuertoId);
  const destino = buscar(puertos, destinoPuertoId);
  return {
    aduanaSalida: esMexicano(origen) ? origen.nombre : null,
    aduanaRecepcion: esMexicano(destino) ? destino.nombre : null,
  };
}

// ─── Precarga ────────────────────────────────────────────────────────────────

export interface PrecargaAduana {
  aduanaSalida?: string;
  aduanaRecepcion?: string;
}

/**
 * Devuelve un patch con los campos de aduana que deben precargarse: solo los
 * que están vacíos y tienen puerto mexicano. Si no hay nada que precargar,
 * devuelve un objeto vacío.
 */
export function precargarAduanas(
  puertos: PuertoParaAduana[],
  origenPuertoId: string | null | undefined,
  destinoPuertoId: string | null | undefined,
  aduanaSalidaActual: string | null | undefined,
  aduanaRecepcionActual: string | null | undefined,
): PrecargaAduana {
  const sug = aduanaSugerida(puertos, origenPuertoId, destinoPuertoId);
  const patch: PrecargaAduana = {};
  if (sug.aduanaSalida && !aduanaSalidaActual?.trim()) {
    patch.aduanaSalida = sug.aduanaSalida;
  }
  if (sug.aduanaRecepcion && !aduanaRecepcionActual?.trim()) {
    patch.aduanaRecepcion = sug.aduanaRecepcion;
  }
  return patch;
}

// ─── Indicador ───────────────────────────────────────────────────────────────

/**
 * ¿El valor actual de la aduana coincide con lo que sugeriría el puerto?
 * Sirve para mostrar «precargada del puerto» en la interfaz: si el usuario
 * edita el campo, el valor ya no coincide y el indicador desaparece solo.
 */
export function esAduanaPrecargada(
  puertos: PuertoParaAduana[],
  puertoId: string | null | undefined,
  valorActual: string | null | undefined,
): boolean {
  if (!valorActual?.trim()) return false;
  const p = buscar(puertos, puertoId);
  if (!esMexicano(p)) return false;
  return valorActual.trim() === p.nombre;
}
