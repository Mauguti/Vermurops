/**
 * contactos.ts
 *
 * Las reglas de los contactos de una entidad —cliente o proveedor— en un
 * solo lugar (tarea 60, 5-oct-2026).
 *
 * ── Qué pasaba ────────────────────────────────────────────────────────────
 * 169 de los 817 clientes traen contactos de Magaya (`contactos[]`, todos
 * con `tipo: 'general'`) y NINGUNA pantalla los enseñaba: el dato existía,
 * estaba importado, y era invisible. El proveedor sí tiene su editor, pero
 * vivía pegado dentro de `ProveedorFormModal` —estado, altas, bajas y el
 * radio de «principal»— así que la ficha del cliente no podía reusarlo.
 *
 * Aquí viven las reglas; el editor compartido las llama
 * (`components/comun/EditorContactos.tsx`).
 *
 * ── Legado primero ────────────────────────────────────────────────────────
 * Nada se migra. Un contacto sin `activo` está activo (`activo !== false`),
 * y un `tipo` que no sea de los cinco de Vermur —'general' de Magaya, o
 * cualquier otro— se LEE como «sin tipo» y se conserva tal cual hasta que
 * alguien lo cambie a mano. Reescribir 169 contactos para que digan lo
 * mismo con otra palabra no es un arreglo, es ruido en la bitácora.
 *
 * ── Por qué se desactiva en vez de borrar ─────────────────────────────────
 * Una persona que dejó la empresa del cliente sigue siendo quien firmó el
 * correo de hace seis meses. Borrarla deja ese correo sin autor; marcarla
 * inactiva la saca de los selectores y la conserva en el expediente.
 * Desactivar al principal TRASPASA el principal al primer activo que
 * quede: si no, el PDF de la cotización saldría dirigido a quien ya no
 * trabaja ahí, y se vería perfectamente bien.
 */

/** Los cinco tipos que pidió Vermur para los contactos del cliente. */
export type TipoContactoCliente = 'dueno' | 'pide_unidad' | 'factura' | 'monitorea' | 'otro';

export const TIPOS_CONTACTO_CLIENTE: { key: TipoContactoCliente; label: string }[] = [
  { key: 'dueno',       label: 'Dueño' },
  { key: 'pide_unidad', label: 'Quien pide la unidad' },
  { key: 'factura',     label: 'Quien manda la factura' },
  { key: 'monitorea',   label: 'Quien monitorea' },
  { key: 'otro',        label: 'Otro' },
];

/**
 * Forma mínima que el editor compartido sabe manejar. `ContactoCliente` y
 * `ContactoProveedor` la cumplen los dos; el editor no conoce ninguna de
 * las dos entidades.
 */
export interface ContactoEditable {
  id?: string;
  nombre: string;
  puesto?: string | null;
  email?: string | null;
  telefono?: string | null;
  /** Los cinco de Vermur, o el texto que haya traído Magaya. */
  tipo?: string | null;
  principal?: boolean;
  /** Ausente = activo. Solo se escribe al desactivar. */
  activo?: boolean;
}

// ── Lectura ───────────────────────────────────────────────────────────────

/** Un contacto sin el campo está activo: los 169 de Magaya no lo traen. */
export function contactoActivo(c: ContactoEditable): boolean {
  return c.activo !== false;
}

export function contactosActivos<T extends ContactoEditable>(cs: T[] | undefined): T[] {
  return (cs ?? []).filter(contactoActivo);
}

/**
 * El tipo solo si es uno de los cinco de Vermur. 'general' de Magaya y
 * cualquier otro texto devuelven null: se ven «sin tipo», sin perderse.
 */
export function tipoContactoConocido(tipo: string | null | undefined): TipoContactoCliente | null {
  const t = (tipo ?? '').trim();
  return TIPOS_CONTACTO_CLIENTE.some(x => x.key === t) ? (t as TipoContactoCliente) : null;
}

/** Etiqueta en español del tipo, o '' cuando no es uno de los cinco. */
export function etiquetaTipoContacto(tipo: string | null | undefined): string {
  const k = tipoContactoConocido(tipo);
  return k ? TIPOS_CONTACTO_CLIENTE.find(x => x.key === k)!.label : '';
}

/**
 * A quién se le escribe: el principal activo, o el primer activo. Nunca
 * uno inactivo — ese es el punto de desactivarlo. Si todos están
 * inactivos devuelve undefined en vez de caer al primero: mandar el PDF a
 * una persona dada de baja es peor que no sugerir a nadie.
 */
export function contactoParaAvisos<T extends ContactoEditable>(cs: T[] | undefined): T | undefined {
  const activos = contactosActivos(cs);
  return activos.find(c => c.principal) ?? activos[0];
}

/** Resumen de una línea para la lista: «Ana Marcial · Dueño · ana@x.mx». */
export function resumenContacto(c: ContactoEditable): string {
  return [c.nombre?.trim(), etiquetaTipoContacto(c.tipo), c.email?.trim(), c.telefono?.trim()]
    .filter(x => x).join(' · ');
}

// ── Escritura ─────────────────────────────────────────────────────────────

let secuencia = 0;

/** Id local del contacto. No es un id de Firestore: vive dentro del documento. */
export function idContacto(): string {
  secuencia += 1;
  return `cnt-${Date.now().toString(36)}-${secuencia}-${Math.random().toString(36).slice(2, 6)}`;
}

export function nuevoContacto(principal = false): ContactoEditable {
  return { id: idContacto(), nombre: '', puesto: '', email: '', telefono: '', tipo: null, principal, activo: true };
}

/** Agrega al final; el primero de la lista nace principal. */
export function agregarContacto<T extends ContactoEditable>(cs: T[]): T[] {
  return [...cs, { ...(nuevoContacto(cs.length === 0) as T) }];
}

export function actualizarContacto<T extends ContactoEditable>(
  cs: T[], idx: number, campo: keyof ContactoEditable, valor: string | boolean | null,
): T[] {
  return cs.map((c, i) => i === idx ? { ...c, [campo]: valor } : c);
}

/** Exactamente uno principal. Un inactivo no puede serlo. */
export function marcarPrincipal<T extends ContactoEditable>(cs: T[], idx: number): T[] {
  if (!cs[idx] || !contactoActivo(cs[idx])) return cs;
  return cs.map((c, i) => ({ ...c, principal: i === idx }));
}

/**
 * Desactivar (o reactivar). Al desactivar al principal, el principal pasa
 * al primer activo que quede; si no queda ninguno, nadie es principal.
 * Reactivar NO le quita el principal a quien lo tenga.
 */
export function alternarActivoContacto<T extends ContactoEditable>(cs: T[], idx: number): T[] {
  const actual = cs[idx];
  if (!actual) return cs;
  const next = cs.map((c, i) => i === idx ? { ...c, activo: !contactoActivo(c) } : c) as T[];
  if (contactoActivo(actual) && actual.principal) {
    const relevo = next.findIndex((c, i) => i !== idx && contactoActivo(c));
    return next.map((c, i) => ({ ...c, principal: i === relevo }));
  }
  return next;
}

/** Quitar de la lista (solo proveedores: el cliente desactiva, no borra). */
export function quitarContacto<T extends ContactoEditable>(cs: T[], idx: number): T[] {
  const next = cs.filter((_, i) => i !== idx);
  if (next.length > 0 && !next.some(c => c.principal && contactoActivo(c))) {
    const relevo = next.findIndex(contactoActivo);
    if (relevo >= 0) return next.map((c, i) => ({ ...c, principal: i === relevo }));
  }
  return next;
}

/**
 * Lo que se guarda. Recorta, convierte '' en null (un '' se ve como dato
 * capturado y no lo es) y DESCARTA los que no tienen nombre: una línea en
 * blanco que el guardado escribe es la misma trampa del Bloque 0 en la
 * tabla de la cotización. Si al descartarlas se fue el principal, lo toma
 * el primer activo que queda.
 *
 * No toca `tipo`: un 'general' de Magaya sale igual que entró.
 *
 * `vaciosComoNull: false` para el proveedor, cuyo modelo declara
 * `email: string` y no admite null. La regla es la misma; cambia el hueco.
 */
export function contactosParaGuardar<T extends ContactoEditable>(
  cs: T[], opciones: { vaciosComoNull?: boolean } = {},
): T[] {
  const vaciosComoNull = opciones.vaciosComoNull !== false;
  const limpio = (v: string | null | undefined) => {
    const t = (v ?? '').trim();
    return t === '' && vaciosComoNull ? null : t;
  };
  const limpios = cs
    .filter(c => (c.nombre ?? '').trim() !== '')
    .map(c => ({
      ...c,
      nombre: c.nombre.trim(),
      puesto: limpio(c.puesto),
      email: limpio(c.email),
      telefono: limpio(c.telefono),
      tipo: limpio(c.tipo),
      principal: c.principal === true,
      // `activo` solo si ya venía: no se le agrega el campo a un contacto
      // de Magaya que nadie tocó, ni a los del proveedor, que no lo usan.
      ...(c.activo === undefined ? {} : { activo: c.activo }),
    })) as T[];
  if (limpios.length > 0 && !limpios.some(c => c.principal && contactoActivo(c))) {
    const relevo = limpios.findIndex(contactoActivo);
    if (relevo >= 0) return limpios.map((c, i) => ({ ...c, principal: i === relevo }));
  }
  return limpios;
}
