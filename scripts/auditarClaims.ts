/**
 * auditarClaims.ts — SOLO LECTURA. ¿Quién entra a Firestore y quién no?
 *
 * ── Qué cambió el 15-oct-2026 ─────────────────────────────────────────────
 * Antes este script contaba «N de 7 con rol», con la lista del equipo
 * ESCRITA AQUÍ. Eso dejó de servir el día que Luis invitó siete cuentas
 * nuevas: no estaban en la lista, así que el script ni las miraba — y eran
 * justo las que no entraban a nada.
 *
 * Ahora no cuenta contra una lista: evalúa **la misma condición que las
 * reglas** sobre TODAS las cuentas de Auth y dice quién pasa.
 *
 *   esDelEquipo = NO es cuenta de prueba
 *                 Y (su correo está en la lista de respaldo  O  tiene un
 *                    claim `rol` de los cinco válidos)
 *
 * Las dos listas de abajo son COPIA de `firestore.rules`. Si divergen, este
 * script miente: por eso lo primero que hace es leer el archivo de reglas y
 * avisar cuando ya no coinciden.
 *
 * NO escribe nada: ni claims, ni Firestore, ni deshabilita cuentas. Para
 * asignar un rol está la pantalla (Configuración → Usuarios), que va por
 * `gestionarUsuarios` y además revoca los tokens.
 *
 * Uso:
 *   npx tsx scripts/auditarClaims.ts
 *   SERVICE_ACCOUNT=/otra/ruta.json npx tsx scripts/auditarClaims.ts
 *
 * La llave por omisión es `$HOME/llaves/vermur-adminsdk.json`, fuera del repo.
 * Contra EMULADORES no pide llave: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

/** Los roles que las reglas reconocen (`tieneRolValido` en firestore.rules). */
const ROLES_VALIDOS = ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];

/**
 * La lista de respaldo de las reglas (`correoDelEquipo`). Ya NO es «el
 * equipo»: es quien entra aunque se quede sin claim.
 */
const RESPALDO_CORREOS = [
  'itzel.laurean@vermur.com',
  'nohema.sosa@vermur.com',
  'julio.gutierrez@vermur.com',
  'angel.luna@vermur.com',
  'gabriela.huerta@vermur.com',
  'luis.renteria@vermur.com',
  'info@digsol.com.mx',
];

/** Las de prueba. Las reglas las niegan por NOMBRE, antes que nada. */
const DE_PRUEBA = [
  'admin@vermur.com', 'ventas@vermur.com', 'pricing@vermur.com',
  'operaciones@vermur.com', 'administracion@vermur.com',
];

/**
 * Comprueba que las dos listas de arriba siguen siendo las de las reglas.
 *
 * Un script de auditoría que se quedó viejo es peor que no tenerlo: afirma
 * que alguien entra cuando no, y nadie vuelve a revisar.
 */
function avisarSiDivergen(): string[] {
  const avisos: string[] = [];
  let reglas: string;
  try {
    reglas = readFileSync('firestore.rules', 'utf8');
  } catch {
    return ['No se pudo leer firestore.rules: no se verificó que las listas de este script sigan al día.'];
  }
  const entre = (ini: string, fin: string) => {
    const a = reglas.indexOf(ini), b = reglas.indexOf(fin);
    if (a < 0 || b < 0) return null;
    return [...reglas.slice(a, b).matchAll(/'([^']+@[^']+)'/g)].map(m => m[1].toLowerCase());
  };
  const enReglas = entre('EQUIPO:INICIO', 'EQUIPO:FIN');
  const pruebaEnReglas = entre('PRUEBA:INICIO', 'PRUEBA:FIN');
  const igual = (a: string[] | null, b: string[]) =>
    a != null && a.length === b.length && a.every(x => b.includes(x));

  if (!igual(enReglas, RESPALDO_CORREOS)) {
    avisos.push(`La lista de respaldo de este script NO coincide con firestore.rules (reglas: ${enReglas?.join(', ') ?? 'no se encontró'}).`);
  }
  if (!igual(pruebaEnReglas, DE_PRUEBA)) {
    avisos.push(`La lista de cuentas de prueba NO coincide con firestore.rules (reglas: ${pruebaEnReglas?.join(', ') ?? 'no se encontró'}).`);
  }
  for (const r of ROLES_VALIDOS) {
    if (!reglas.includes(`'${r}'`)) avisos.push(`El rol «${r}» no aparece en firestore.rules.`);
  }
  return avisos;
}

interface Fila {
  correo: string;
  uid: string;
  rol: string | null;
  rolInvalido: boolean;
  deshabilitada: boolean;
  enRespaldo: boolean;
  esPrueba: boolean;
  ultimoAcceso: string;
  /** ¿Puso su contraseña? Sin esto, la invitación nunca se usó. */
  nuncaEntro: boolean;
}

function leer(u: UserRecord): Fila {
  const correo = (u.email ?? '(sin correo)').toLowerCase();
  const claim = (u.customClaims ?? {}).rol;
  const rol = typeof claim === 'string' && claim !== '' ? claim : null;
  return {
    correo,
    uid: u.uid,
    rol,
    rolInvalido: rol != null && !ROLES_VALIDOS.includes(rol),
    deshabilitada: u.disabled,
    enRespaldo: RESPALDO_CORREOS.includes(correo),
    esPrueba: DE_PRUEBA.includes(correo),
    ultimoAcceso: u.metadata.lastSignInTime
      ? new Date(u.metadata.lastSignInTime).toISOString().slice(0, 10)
      : '—',
    nuncaEntro: !u.metadata.lastSignInTime,
  };
}

/** La MISMA condición que `esDelEquipo()` en las reglas. */
function pasaLasReglas(f: Fila): boolean {
  if (f.esPrueba) return false;
  return f.enRespaldo || (f.rol != null && !f.rolInvalido);
}

async function main() {
  const enEmulador = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (enEmulador) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
    console.log(`(emulador en ${process.env.FIREBASE_AUTH_EMULATOR_HOST})`);
  } else {
    const ruta = process.env.SERVICE_ACCOUNT ?? join(homedir(), 'llaves', 'vermur-adminsdk.json');
    let cred;
    try {
      cred = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch {
      console.error(`\nNo se encontró la clave de servicio en: ${ruta}`);
      console.error('Pásala con SERVICE_ACCOUNT=/ruta/a/llave.json\n');
      process.exit(1);
    }
    initializeApp({ credential: cert(cred) });
  }

  // Paginado: `listUsers` entrega 1000 por página y hay que seguir el token.
  const filas: Fila[] = [];
  let token: string | undefined;
  do {
    const pagina = await getAuth().listUsers(1000, token);
    pagina.users.forEach(u => filas.push(leer(u)));
    token = pagina.pageToken;
  } while (token);

  filas.sort((a, b) =>
    Number(a.esPrueba) - Number(b.esPrueba)
    || Number(pasaLasReglas(b)) - Number(pasaLasReglas(a))
    || a.correo.localeCompare(b.correo));

  console.log('\n═════════ QUIÉN ENTRA A FIRESTORE (solo lectura) ═════════\n');
  console.log(`Cuentas en Auth: ${filas.length}\n`);
  console.log('    CORREO                            ROL              ÚLT. ACCESO  ENTRA');
  console.log('    ' + '─'.repeat(76));
  for (const f of filas) {
    const marca = f.deshabilitada ? '🚫' : f.esPrueba ? '🔴' : pasaLasReglas(f) ? '✓ ' : '❌';
    const entra = f.deshabilitada ? 'deshabilitada'
      : f.esPrueba ? 'NO · de prueba'
      : pasaLasReglas(f) ? (f.enRespaldo ? 'sí · por correo' : 'sí · por su rol')
      : 'NO';
    const nota = f.nuncaEntro && !f.esPrueba ? '  ← nunca ha entrado' : '';
    console.log(`${marca}  ${f.correo.padEnd(32)}  ${(f.rol ?? 'SIN ROL').padEnd(16)} ${f.ultimoAcceso.padEnd(12)} ${entra}${nota}`);
  }

  // ── Lo que hay que accionar ───────────────────────────────────────────────
  const vivas = filas.filter(f => !f.deshabilitada && !f.esPrueba);
  const fuera = vivas.filter(f => !pasaLasReglas(f));
  const porRolInvalido = fuera.filter(f => f.rolInvalido);
  const sinNada = fuera.filter(f => f.rol == null);
  const entranPorRol = vivas.filter(f => pasaLasReglas(f) && !f.enRespaldo);
  const sinUsarInvitacion = vivas.filter(f => f.nuncaEntro);
  const pruebaVivas = filas.filter(f => f.esPrueba && !f.deshabilitada);
  const pruebaConRol = pruebaVivas.filter(f => f.rol != null);
  const faltanDelRespaldo = RESPALDO_CORREOS.filter(
    c => !filas.some(f => f.correo === c && !f.deshabilitada));

  console.log('\n═════════ QUÉ HAY QUE ACCIONAR ═════════\n');
  console.log(`  cuentas vivas (sin contar las de prueba): ${vivas.length}`);
  console.log(`  entran:                                   ${vivas.length - fuera.length}`);
  console.log(`  NO entran:                                ${fuera.length}`);

  if (porRolInvalido.length) {
    console.log('\n  ⚠️  TIENEN ROL Y NO PASARÍAN LAS REGLAS — el rol no es de los cinco válidos.');
    console.log(`      Válidos: ${ROLES_VALIDOS.join(', ')}. Se corrige en Configuración → Usuarios.`);
    porRolInvalido.forEach(f => console.log(`       ${f.correo} → «${f.rol}»`));
  }

  if (sinNada.length) {
    console.log('\n  ❌ SIN ROL y fuera de la lista de respaldo: no tocan ni un documento.');
    console.log('      Asígnales rol en Configuración → Usuarios. El claim viaja EN EL TOKEN,');
    console.log('      así que después tienen que cerrar sesión y volver a entrar.');
    sinNada.forEach(f => console.log(`       ${f.correo}`));
  }

  if (entranPorRol.length) {
    console.log('\n  ℹ️  Entran SOLO por su claim de rol (no están en la lista de respaldo).');
    console.log('      Si a alguna se le cae el claim, se queda fuera sin aviso.');
    entranPorRol.forEach(f => console.log(`       ${f.correo} → ${f.rol}`));
  }

  if (sinUsarInvitacion.length) {
    console.log('\n  📧 Nunca han iniciado sesión: su invitación no se usó (o no llegó).');
    console.log('      Reenvíala desde Configuración → Usuarios → «Reenviar invitación».');
    sinUsarInvitacion.forEach(f => console.log(`       ${f.correo}`));
  }

  if (pruebaVivas.length) {
    console.log(`\n  🔴 ${pruebaVivas.length} cuenta(s) de PRUEBA activas en este proyecto.`);
    console.log('     Las reglas las niegan por nombre, pero son credenciales válidas del');
    console.log('     proyecto mientras existan, y su contraseña está escrita en el repo (§6).');
    console.log('     Hay que BORRARLAS o deshabilitarlas en la consola.');
    pruebaVivas.forEach(f => console.log(`       ${f.correo}  (último acceso ${f.ultimoAcceso})`));
    if (pruebaConRol.length) {
      console.log('\n     ⛔ Y estas traen claim de rol: sin la negación por nombre de las reglas');
      console.log('        del 15-oct ENTRARÍAN A TODO. Quítales el rol además de borrarlas.');
      pruebaConRol.forEach(f => console.log(`       ${f.correo} → ${f.rol}`));
    }
  }

  if (faltanDelRespaldo.length) {
    console.log('\n  ⚠️  En la lista de respaldo de las reglas pero sin cuenta activa en Auth:');
    faltanDelRespaldo.forEach(c => console.log(`       ${c}`));
  }

  const divergen = avisarSiDivergen();
  if (divergen.length) {
    console.log('\n  ⛔ ESTE SCRIPT PUEDE ESTAR MINTIENDO: sus listas no coinciden con las reglas.');
    divergen.forEach(a => console.log(`       ${a}`));
  }

  const listo = fuera.length === 0 && pruebaVivas.length === 0 && divergen.length === 0;
  console.log(`\n  ${listo
    ? '✅ Todas las cuentas vivas entran, y no quedan cuentas de prueba.'
    : '⛔ Hay cuentas que no entran, o cuentas de prueba vivas. Ver arriba.'}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
