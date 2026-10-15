/**
 * gestionarUsuarios.ts — Cloud Function para la gestión de usuarios de VermurOps.
 *
 * Acciones: listar, invitar, cambiarRol, desactivar.
 *
 * Todas exigen `usuario.gestionar` (solo admin). El Admin SDK bypasses las
 * reglas de Firestore, así que no hace falta regla para `usuarios/{uid}`:
 * la colección vive protegida por la Function.
 *
 * Alta por invitación: la Function crea la cuenta, pone el rol en custom
 * claims, escribe `usuarios/{uid}` y dispara el correo de restablecimiento
 * de contraseña. El invitado recibe el enlace, pone su contraseña y entra.
 *
 * Baja: `activo: false` + `disableUser`. Nunca se borra.
 *
 * Cambio de rol: actualiza claims + `revokeRefreshTokens` + actualiza doc.
 * La sesión abierta del usuario cambia al refrescar el token.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  verificarUsuario,
  exigirCapacidad,
  ErrorAuth,
  ROLES_VALIDOS,
  type UserRole,
} from '../comun/auth.js';
import { enviarCorreoPorN8n, N8N_WEBHOOK_URL_CORREO } from '../correo/correoPorN8n.js';
import {
  asuntoInvitacion, htmlInvitacion, respuestaInvitacion, textoInvitacion,
  type RespuestaInvitacion,
} from './invitacion.js';

/** Ya existe en Secret Manager: lo usan los demás proxies de n8n. */
const VERMUR_N8N_TOKEN = defineSecret('VERMUR_N8N_TOKEN');

/*
 * A dónde regresa el enlace del correo, y la dirección que el cuerpo enseña.
 *
 * NO es un `defineString`: cada uno detiene el deploy preguntando (§3) y esta
 * tarea ya mete uno, el del webhook. Default en el código + override por
 * variable de entorno, como `configuracionSmtp` de la tarea 64.
 *
 * El dominio tiene que estar autorizado en Firebase Auth o
 * `generatePasswordResetLink` rechaza la URL.
 */
const URL_APP = process.env.VERMUR_URL_APP ?? 'https://vermur-logistics-app.web.app';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface AccionListar { accion: 'listar' }
interface AccionInvitar {
  accion: 'invitar';
  email: string;
  nombre: string;
  rol: UserRole;
}
interface AccionCambiarRol {
  accion: 'cambiarRol';
  uid: string;
  rol: UserRole;
}
interface AccionDesactivar {
  accion: 'desactivar';
  uid: string;
}
/** Vuelve a mandar el correo de «crea tu contraseña». No toca la cuenta. */
interface AccionReenviar {
  accion: 'reenviar';
  email: string;
}

type Payload =
  | AccionListar | AccionInvitar | AccionCambiarRol | AccionDesactivar | AccionReenviar;

export interface UsuarioRegistrado {
  uid: string;
  email: string;
  nombre: string;
  rol: UserRole;
  activo: boolean;
  invitadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
  /**
   * Último inicio de sesión (ISO) o `null` si NUNCA ha entrado. No se guarda:
   * sale de los metadatos de Auth en cada `listar()`. Es lo que distingue una
   * invitación que no se usó de una cuenta que ya opera.
   */
  ultimoAcceso?: string | null;
  /**
   * Cuándo salió la última invitación (ISO). Se GUARDA, no se deriva: así
   * «Enviada hace X min» sobrevive a una recarga y dos personas en la
   * pantalla no mandan el correo dos veces. Solo se escribe cuando el envío
   * SALIÓ — un intento fallido no debe bloquear el botón.
   */
  ultimaInvitacion?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const db = () => getFirestore();
const authAdmin = () => getAuth();

function validarEmail(email: string): string {
  const limpio = email.toLowerCase().trim();
  if (!limpio || !limpio.includes('@')) {
    throw new ErrorAuth(400, 'El correo no es válido.');
  }
  return limpio;
}

function validarRol(rol: unknown): UserRole {
  if (!rol || !ROLES_VALIDOS.includes(rol as UserRole)) {
    throw new ErrorAuth(400, `Rol no válido: «${rol}». Opciones: ${ROLES_VALIDOS.join(', ')}.`);
  }
  return rol as UserRole;
}

/**
 * Genera el enlace y manda el correo. El ÚNICO camino de salida.
 *
 * ── Por qué aquí y no en la app ───────────────────────────────────────────
 * Hasta hoy lo mandaba el navegador con `sendPasswordResetEmail` del SDK de
 * cliente, o sea el correo de Firebase. **Ese correo no llega a vermur.com**:
 * el dominio está en Microsoft 365 con SPF `-all` y sin DKIM ni DMARC
 * propios. Las siete invitaciones del 13-oct se crearon bien y no llegó
 * ninguna; nadie se enteró porque la pantalla decía «enviado» — el SDK
 * resuelve sin error aunque el mensaje muera después.
 *
 * Ahora el enlace lo genera el Admin SDK y el mensaje sale por n8n, que lo
 * manda con una cuenta de Gmail real.
 *
 * **No hay respaldo por el correo de Firebase.** Mandar los dos en paralelo
 * daría dos ligas de un solo uso para la misma cuenta —la segunda invalida la
 * primera— y la persona apretaría la que no sirve. Si n8n falla, se dice.
 *
 * El enlace NO se registra en los logs: es una credencial de un solo uso para
 * entrar a la cuenta de alguien más.
 */
async function mandarInvitacion(
  uid: string,
  email: string,
  nombre: string,
  rol: string,
  invitadoPor: string,
  esReenvio: boolean,
): Promise<{ correoEnviado: boolean; motivoCorreo?: string; ultimaInvitacion?: string }> {
  let enlace: string;
  try {
    enlace = await authAdmin().generatePasswordResetLink(email, { url: URL_APP });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? '';
    /*
     * El caso que de verdad pasa: `auth/invalid-continue-uri` o
     * `unauthorized-continue-uri` cuando el dominio de `URL_APP` no está
     * autorizado en Firebase Auth. Se dice QUÉ hay que hacer, porque el
     * mensaje de Firebase manda a revisar la contraseña del usuario.
     */
    if (code.includes('continue-uri')) {
      return {
        correoEnviado: false,
        motivoCorreo: `Firebase rechazó la dirección de regreso (${URL_APP}). Hay que autorizar ese dominio en Authentication → Settings → Authorized domains.`,
      };
    }
    return { correoEnviado: false, motivoCorreo: `No se pudo generar el enlace (${code || 'error desconocido'}).` };
  }

  const datos = { nombre, rol, invitadoPor, enlace, urlApp: URL_APP, esReenvio };
  const r = await enviarCorreoPorN8n({
    para: email,
    asunto: asuntoInvitacion(esReenvio),
    html: htmlInvitacion(datos),
    texto: textoInvitacion(datos),
    nombreRemitente: 'VermurOps',
  }, { url: N8N_WEBHOOK_URL_CORREO.value(), token: VERMUR_N8N_TOKEN.value() });

  if (!r.ok) return { correoEnviado: false, motivoCorreo: r.error };

  /*
   * Solo se marca cuando el correo SALIÓ. Si se marcara al intentar, un fallo
   * de n8n bloquearía el botón diez minutos justo cuando hay que reintentar.
   *
   * `set` con merge y no `update`: una cuenta anterior al módulo de Usuarios
   * no tiene documento, y un `update` sobre lo que no existe LANZA — después
   * de que el correo ya salió (§3, «guardó a medias»).
   */
  const ultimaInvitacion = new Date().toISOString();
  try {
    await db().collection('usuarios').doc(uid).set({ ultimaInvitacion }, { merge: true });
  } catch (err) {
    // El correo ya salió: no se deshace nada ni se reporta como fallo. Lo
    // único que se pierde es el «Enviada hace X min» tras recargar.
    logger.error('[invitacion] no se pudo registrar ultimaInvitacion', { uid, err: String(err) });
  }
  return { correoEnviado: true, ultimaInvitacion };
}

// ── Acciones ─────────────────────────────────────────────────────────────────

/*
 * La lista sale de Firestore MÁS Auth.
 *
 * Solo con la colección, una cuenta que existe en Auth y no tiene documento
 * es invisible aquí — y eso es exactamente lo que pasaba con las seis del
 * equipo, anteriores a este módulo: la pantalla no las enseñaba, así que no
 * había a quién asignarle rol. El síntoma era «asigné el rol y no se puso»,
 * y la causa era que nunca apareció la fila.
 *
 * Las de Auth sin documento se marcan con `sinDocumento` y traen el rol que
 * diga su claim —o ninguno—; cambiarles el rol crea el documento (`set` con
 * merge en `cambiarRol`).
 */
async function listar(): Promise<UsuarioRegistrado[]> {
  const snap = await db().collection('usuarios').get();
  const porUid = new Map<string, UsuarioRegistrado>();
  snap.docs.forEach(d => porUid.set(d.id, { uid: d.id, ...d.data() } as UsuarioRegistrado));

  /*
   * Auth se recorre SIEMPRE y completo, no solo para las cuentas sin
   * documento: `lastSignInTime` solo vive aquí, y es lo que distingue una
   * invitación que nunca se usó —las siete del 13-oct— de una cuenta que ya
   * opera. Antes esta vuelta se saltaba las filas que ya venían de Firestore
   * (`continue`), así que el dato no llegaba justo a quien sí tiene
   * documento.
   */
  let token: string | undefined;
  do {
    const pagina = await authAdmin().listUsers(1000, token);
    for (const u of pagina.users) {
      const ultimoAcceso = u.metadata.lastSignInTime
        ? new Date(u.metadata.lastSignInTime).toISOString()
        : null;

      const yaEsta = porUid.get(u.uid);
      if (yaEsta) {
        // Auth manda sobre el documento en lo que Auth sabe mejor.
        porUid.set(u.uid, { ...yaEsta, ultimoAcceso, activo: !u.disabled });
        continue;
      }

      const claims = (u.customClaims ?? {}) as { rol?: string };
      porUid.set(u.uid, {
        uid: u.uid,
        email: u.email ?? '',
        nombre: u.displayName ?? u.email ?? '(sin nombre)',
        rol: (claims.rol ?? '') as UsuarioRegistrado['rol'],
        activo: !u.disabled,
        invitadoPor: '(anterior a Gestión de Usuarios)',
        creadoEn: u.metadata.creationTime
          ? new Date(u.metadata.creationTime).toISOString()
          : '',
        actualizadoEn: '',
        ultimoAcceso,
        sinDocumento: true,
      } as UsuarioRegistrado);
    }
    token = pagina.pageToken;
  } while (token);

  /*
   * Una fila que quedó SIN `ultimoAcceso` es una cuenta con documento en
   * `usuarios/` y sin cuenta en Auth. Se deja ausente a propósito: la
   * pantalla lo lee como «no se sabe» y NO ofrece reenviar. Ponerle `null`
   * diría «nunca entró» de una cuenta que ya no existe.
   */
  return [...porUid.values()].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
}

async function invitar(
  payload: AccionInvitar,
  invitadoPorEmail: string,
): Promise<RespuestaInvitacion> {
  const email = validarEmail(payload.email);
  const rol = validarRol(payload.rol);
  const nombre = (payload.nombre ?? '').trim();
  if (!nombre) throw new ErrorAuth(400, 'El nombre es obligatorio.');

  // Crear cuenta en Firebase Auth
  let uid: string;
  try {
    const userRecord = await authAdmin().createUser({
      email,
      displayName: nombre,
      disabled: false,
    });
    uid = userRecord.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/email-already-exists') {
      throw new ErrorAuth(409, `Ya existe una cuenta con el correo «${email}».`);
    }
    throw new ErrorAuth(500, `Error al crear la cuenta: ${code}`);
  }

  // Custom claims con el rol
  await authAdmin().setCustomUserClaims(uid, { rol });

  // Documento en usuarios/{uid}
  const ahora = new Date().toISOString();
  const doc: Omit<UsuarioRegistrado, 'uid'> = {
    email,
    nombre,
    rol,
    activo: true,
    invitadoPor: invitadoPorEmail,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
  await db().collection('usuarios').doc(uid).set(doc);

  /*
   * El correo sale de AQUÍ, no de la app.
   *
   * Aquí hubo un `generatePasswordResetLink` con un comentario que decía que
   * «en producción Firebase envía el correo automáticamente». Es falso: ese
   * método GENERA el enlace y no manda nada. Se quitó y el envío se pasó al
   * navegador, con `sendPasswordResetEmail`... y resultó que el correo de
   * Firebase **no llega a vermur.com**. Las siete invitaciones del 13-oct se
   * perdieron ahí.
   *
   * La cuenta YA está creada en este punto. Si el correo no sale no se
   * deshace nada —borrar una cuenta por un fallo de envío es peor— y se
   * devuelve el motivo para que la pantalla lo diga y ofrezca reenviar.
   */
  const { correoEnviado, motivoCorreo, ultimaInvitacion } = await mandarInvitacion(
    uid, email, nombre, rol, invitadoPorEmail, false,
  );

    /*
   * `ultimoAcceso: null` explícito. Una cuenta que se acaba de crear NUNCA ha
   * entrado: es un hecho, no una suposición. Sin esto, el renglón que la
   * pantalla agrega al vuelo venía sin el campo, se leía como «no se sabe» y
   * salía «Activa» en verde — justo el renglón que tiene que decir
   * «Pendiente» y ofrecer «Reenviar invitación».
   *
   * El campo NO se guarda en el documento: se deriva de Auth en `listar()`.
   */
  return respuestaInvitacion(
    { uid, ...doc, ultimoAcceso: null, ultimaInvitacion: ultimaInvitacion ?? null },
    correoEnviado, motivoCorreo,
  );
}

/**
 * Reenviar: NO toca la cuenta, solo vuelve a mandar el correo.
 *
 * El rol y el nombre se leen de Auth y de `usuarios/{uid}`, no del cliente:
 * el correo tiene que decir el rol que la cuenta TIENE, no el que la pantalla
 * creía que tenía.
 */
async function reenviar(
  payload: AccionReenviar,
  reenviadoPorEmail: string,
): Promise<RespuestaInvitacion> {
  const email = validarEmail(payload.email);

  let userRecord;
  try {
    userRecord = await authAdmin().getUserByEmail(email);
  } catch {
    throw new ErrorAuth(404, `No hay ninguna cuenta con el correo «${email}».`);
  }
  if (userRecord.disabled) {
    throw new ErrorAuth(409, `La cuenta de «${email}» está desactivada: reactívala antes de reenviar la invitación.`);
  }

  const snap = await db().collection('usuarios').doc(userRecord.uid).get();
  const doc = snap.data() as Partial<UsuarioRegistrado> | undefined;
  const claims = (userRecord.customClaims ?? {}) as { rol?: string };
  const rol = claims.rol ?? doc?.rol ?? '';
  const nombre = doc?.nombre ?? userRecord.displayName ?? email;
  // Quien la invitó originalmente; si no hay registro, quien reenvía.
  const invitadoPor = doc?.invitadoPor && doc.invitadoPor.includes('@')
    ? doc.invitadoPor
    : reenviadoPorEmail;

  /*
   * Una cuenta SIN rol se reenvía igual, y el correo dice el rol en blanco en
   * vez de inventarle uno. Pero conviene saberlo: desde el 15-oct el rol es
   * lo que la deja entrar a Firestore (`tieneRolValido` en firestore.rules),
   * así que sin él la persona pone su contraseña y no ve nada.
   */
  const { correoEnviado, motivoCorreo, ultimaInvitacion } = await mandarInvitacion(
    userRecord.uid, email, nombre, rol, invitadoPor, true,
  );

  const aviso = rol ? motivoCorreo
    : [motivoCorreo, `Ojo: «${email}» no tiene rol asignado, así que al entrar no verá datos. Asígnale uno.`]
        .filter(Boolean).join(' ');

  // El último acceso ya lo tenemos en la mano: se devuelve en vez de dejar
  // que la pantalla lo lea como «no se sabe».
  const ultimoAcceso = userRecord.metadata.lastSignInTime
    ? new Date(userRecord.metadata.lastSignInTime).toISOString()
    : null;

  return respuestaInvitacion(
    snap.exists
      ? ({
          uid: userRecord.uid, ...doc, ultimoAcceso,
          ...(ultimaInvitacion ? { ultimaInvitacion } : {}),
        } as UsuarioRegistrado)
      : null,
    correoEnviado,
    aviso || undefined,
  );
}

async function cambiarRol(
  payload: AccionCambiarRol,
  modificadoPorEmail: string,
): Promise<UsuarioRegistrado> {
  const { uid } = payload;
  const rol = validarRol(payload.rol);
  if (!uid) throw new ErrorAuth(400, 'Falta el uid del usuario.');

  // Verificar que el usuario existe
  let userRecord;
  try {
    userRecord = await authAdmin().getUser(uid);
  } catch {
    throw new ErrorAuth(404, `No se encontró el usuario con uid «${uid}».`);
  }

  /*
   * Los claims que ya existan se conservan: `setCustomUserClaims` REEMPLAZA
   * el objeto completo, así que mandar `{ rol }` a secas borraría cualquier
   * otro. Hoy no hay más claims, pero el día que haya este código los tiraría
   * sin avisar.
   */
  const claimsPrevios = (userRecord.customClaims ?? {}) as Record<string, unknown>;
  await authAdmin().setCustomUserClaims(uid, { ...claimsPrevios, rol });

  // Revocar refresh tokens para forzar re-autenticación con los nuevos claims
  await authAdmin().revokeRefreshTokens(uid);

  /*
   * `set` con merge y no `update`: un `update` a un documento que NO existe
   * LANZA, y las seis cuentas del equipo son anteriores a este módulo, así
   * que no tienen documento en `usuarios/`. Con `update`, cambiarle el rol a
   * una de ellas ponía el claim (arriba), revocaba sus tokens y DESPUÉS
   * fallaba: la pantalla decía que no se pudo y el claim ya estaba puesto.
   * Un guardado a medias (§3).
   */
  const ahora = new Date().toISOString();
  await db().collection('usuarios').doc(uid).set({
    email: userRecord.email ?? '',
    nombre: userRecord.displayName ?? userRecord.email ?? '',
    activo: !userRecord.disabled,
    creadoEn: userRecord.metadata.creationTime
      ? new Date(userRecord.metadata.creationTime).toISOString()
      : ahora,
    invitadoPor: modificadoPorEmail,
    rol,
    actualizadoEn: ahora,
    historial: FieldValue.arrayUnion({
      tipo: 'cambioRol',
      rolAnterior: (userRecord.customClaims as { rol?: string })?.rol ?? 'sin claims',
      rolNuevo: rol,
      por: modificadoPorEmail,
      fecha: ahora,
    }),
  }, { merge: true });

  const snap = await db().collection('usuarios').doc(uid).get();
  return { uid, ...snap.data() } as UsuarioRegistrado;
}

async function desactivar(
  payload: AccionDesactivar,
  desactivadoPorEmail: string,
): Promise<UsuarioRegistrado> {
  const { uid } = payload;
  if (!uid) throw new ErrorAuth(400, 'Falta el uid del usuario.');

  // Verificar que existe
  try {
    await authAdmin().getUser(uid);
  } catch {
    throw new ErrorAuth(404, `No se encontró el usuario con uid «${uid}».`);
  }

  // Deshabilitar en Auth
  await authAdmin().updateUser(uid, { disabled: true });

  // Revocar tokens
  await authAdmin().revokeRefreshTokens(uid);

  // Actualizar documento
  const ahora = new Date().toISOString();
  await db().collection('usuarios').doc(uid).update({
    activo: false,
    actualizadoEn: ahora,
    historial: FieldValue.arrayUnion({
      tipo: 'desactivacion',
      por: desactivadoPorEmail,
      fecha: ahora,
    }),
  });

  const snap = await db().collection('usuarios').doc(uid).get();
  return { uid, ...snap.data() } as UsuarioRegistrado;
}

// ── Handler principal ────────────────────────────────────────────────────────

export const gestionarUsuarios = onRequest(
  { cors: true, invoker: 'public', secrets: [VERMUR_N8N_TOKEN] },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Solo POST.' });
      return;
    }

    try {
      const usuario = await verificarUsuario(req);
      exigirCapacidad(usuario, 'usuario.gestionar');

      const payload = req.body as Payload;
      if (!payload?.accion) {
        throw new ErrorAuth(400, 'Falta el campo «accion».');
      }

      let resultado: unknown;
      switch (payload.accion) {
        case 'listar':
          resultado = await listar();
          break;
        case 'invitar':
          resultado = await invitar(payload, usuario.email);
          break;
        case 'cambiarRol':
          resultado = await cambiarRol(payload, usuario.email);
          break;
        case 'desactivar':
          resultado = await desactivar(payload, usuario.email);
          break;
        case 'reenviar':
          resultado = await reenviar(payload, usuario.email);
          break;
        default:
          throw new ErrorAuth(400, `Acción desconocida: «${(payload as { accion: string }).accion}».`);
      }

      res.status(200).json({ ok: true, datos: resultado });
    } catch (err) {
      if (err instanceof ErrorAuth) {
        res.status(err.status).json({ ok: false, error: err.message });
        return;
      }
      console.error('[gestionarUsuarios] Error inesperado:', err);
      res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
    }
  },
);
