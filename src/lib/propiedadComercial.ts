/**
 * propiedadComercial.ts
 *
 * ¿De quién es este prospecto o esta cotización? La pregunta que decide qué ve
 * Ventas — y la que estaba produciendo «desapariciones».
 *
 * ── El bug que motivó esto (2-sep-2026) ────────────────────────────────────
 * Ventas reportó que un prospecto movido a calificado y una cotización recién
 * solicitada «desaparecieron». No se perdió nada: los formularios de creación
 * asignaban el vendedor desde VENDEDORES —un catálogo MOCK con nombres
 * inventados ('ventas', 'María López', 'Carlos Gómez')— y el filtro de Ventas
 * compara contra el usuario REAL con igualdad estricta. Una solicitud creada
 * sin tocar el dropdown nacía asignada a 'ventas' y se volvía invisible para
 * quien la creó en el mismo instante de crearla. Con rol admin se ve todo, así
 * que en pruebas nunca se notó.
 *
 * La ficha del prospecto tenía la variante: su select de responsable solo
 * ofrecía los nombres mock, así que reasignar (o simplemente tocar el campo,
 * que se veía vacío porque el valor real no estaba entre las opciones)
 * también lo hacía desaparecer.
 *
 * ── Las dos reglas ─────────────────────────────────────────────────────────
 * 1. La pertenencia se compara TOLERANTE: uid, nombre, correo o prefijo del
 *    correo, sin distinguir mayúsculas. El dato viejo trae de todo —uids,
 *    displayName, prefijos— porque `user.nombre` es displayName con fallback
 *    al prefijo, y cambia si el displayName se configura después.
 * 2. Un registro asignado a un dueño MOCK es un huérfano: se le muestra a
 *    TODO el equipo de Ventas en vez de a nadie. Es como se «recuperan» los
 *    que ya desaparecieron, sin migrar datos: visibles y reasignables.
 *
 * Lógica pura: sin React ni Firestore.
 */

/** Lo que el matcher necesita saber del usuario. Subconjunto de AuthUser. */
export interface UsuarioComercial {
  uid?: string | null;
  nombre?: string | null;
  email?: string | null;
}

/**
 * Los dueños que no son personas: el catálogo mock que los formularios
 * ofrecían. Un registro asignado a uno de estos no pertenece a nadie real.
 */
const DUENOS_MOCK = new Set(['ventas', 'maría lópez', 'maria lopez', 'carlos gómez', 'carlos gomez', 'vendedor']);

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** ¿El valor de vendedorId/responsable apunta a un dueño inventado? */
export function esDuenoMock(valor: string | null | undefined): boolean {
  return DUENOS_MOCK.has(norm(valor));
}

/** ¿El registro con este dueño le pertenece a este usuario? */
export function perteneceAlUsuario(
  valor: string | null | undefined,
  usuario: UsuarioComercial | null | undefined,
): boolean {
  const v = norm(valor);
  if (!v || !usuario) return false;

  const candidatos = [
    usuario.uid,
    usuario.nombre,
    usuario.email,
    usuario.email?.split('@')[0],
  ].map(norm).filter(Boolean);

  return candidatos.includes(v);
}

/**
 * El filtro de visibilidad de Ventas: lo suyo, más los huérfanos.
 *
 * Los huérfanos se muestran a propósito. Esconderlos es el bug original con
 * otra cara: un registro que nadie ve es un prospecto que nadie trabaja y una
 * solicitud que nadie cobra.
 */
export function visibleParaVentas(
  duenoDelRegistro: string | null | undefined,
  usuario: UsuarioComercial | null | undefined,
): boolean {
  return perteneceAlUsuario(duenoDelRegistro, usuario) || esDuenoMock(duenoDelRegistro);
}
