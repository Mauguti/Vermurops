/**
 * auditarClaims.ts — SOLO LECTURA.
 *
 * Qué cuenta de Auth tiene el claim `rol` y cuál. Es el paso 0 del despliegue
 * de las reglas por rol: **sin los claims puestos, el deploy no protege
 * nada.** La convivencia (`!tieneRolAsignado()` en `firestore.rules`) deja
 * pasar a toda cuenta sin rol con los permisos de hoy, así que una cuenta sin
 * claim es una cuenta sin cerco.
 *
 * NO escribe nada: ni claims, ni Firestore, ni deshabilita cuentas. Para
 * asignar un rol se usa la pantalla (Configuración → Usuarios), que va por
 * `gestionarUsuarios` y además revoca los tokens.
 *
 * Uso:
 *   npx tsx scripts/auditarClaims.ts
 *   SERVICE_ACCOUNT=/otra/ruta.json npx tsx scripts/auditarClaims.ts
 *
 * La llave por omisión es `$HOME/llaves/vermur-adminsdk.json`, fuera del repo.
 *
 * Contra EMULADORES no pide llave: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

/** Los roles que `gestionarUsuarios` sabe poner (functions/src/comun/auth.ts). */
const ROLES_VALIDOS = ['ventas', 'pricing', 'operaciones', 'administracion', 'admin'];

/**
 * Las cuentas que las reglas reconocen como del equipo (`esDelEquipo()`).
 * Una cuenta de Auth que NO está aquí no entra a Firestore, tenga o no claim:
 * `rolEntre` exige `esDelEquipo()` antes de mirar el rol.
 */
const EQUIPO = [
  'itzel.laurean@vermur.com',
  'nohema.sosa@vermur.com',
  'julio.gutierrez@vermur.com',
  'angel.luna@vermur.com',
  'gabriela.huerta@vermur.com',
  'luis.renteria@vermur.com',
  'info@digsol.com.mx',
];

/** Las de prueba del emulador: en producción NO deberían existir (§6). */
const DE_PRUEBA = [
  'admin@vermur.com', 'ventas@vermur.com', 'pricing@vermur.com',
  'operaciones@vermur.com', 'administracion@vermur.com',
];

interface Fila {
  correo: string;
  uid: string;
  rol: string | null;
  rolInvalido: boolean;
  deshabilitada: boolean;
  esEquipo: boolean;
  esPrueba: boolean;
  ultimoAcceso: string;
}

function leer(u: UserRecord): Fila {
  const correo = (u.email ?? '(sin correo)').toLowerCase();
  const claim = (u.customClaims ?? {}).rol;
  const rol = typeof claim === 'string' ? claim : null;
  return {
    correo,
    uid: u.uid,
    rol,
    rolInvalido: rol != null && !ROLES_VALIDOS.includes(rol),
    deshabilitada: u.disabled,
    esEquipo: EQUIPO.includes(correo),
    esPrueba: DE_PRUEBA.includes(correo),
    ultimoAcceso: u.metadata.lastSignInTime
      ? new Date(u.metadata.lastSignInTime).toISOString().slice(0, 10)
      : '—',
  };
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

  filas.sort((a, b) => Number(b.esEquipo) - Number(a.esEquipo) || a.correo.localeCompare(b.correo));

  console.log('\n═════════ CLAIMS DE ROL EN AUTH (solo lectura) ═════════\n');
  console.log(`Cuentas en Auth: ${filas.length}\n`);

  const marca = (f: Fila) =>
    f.deshabilitada ? '🚫' : !f.rol ? '❌' : f.rolInvalido ? '⚠️ ' : '✓ ';

  console.log('    CORREO                            ROL              ÚLT. ACCESO');
  console.log('    ' + '─'.repeat(68));
  for (const f of filas) {
    const etiqueta = f.esEquipo ? '' : f.esPrueba ? '  ← DE PRUEBA' : '  ← fuera del equipo';
    console.log(`${marca(f)}  ${f.correo.padEnd(32)}  ${(f.rol ?? 'SIN ROL').padEnd(16)} ${f.ultimoAcceso}${etiqueta}`);
  }

  // ── Lo que decide si el deploy del martes protege algo ────────────────────
  const equipo = filas.filter(f => f.esEquipo && !f.deshabilitada);
  const sinRol = equipo.filter(f => !f.rol);
  const invalidos = equipo.filter(f => f.rolInvalido);
  const faltantes = EQUIPO.filter(c => !filas.some(f => f.correo === c && !f.deshabilitada));

  console.log('\n═════════ QUÉ FALTA PARA DESPLEGAR ═════════\n');
  console.log(`  del equipo, activas:      ${equipo.length} de ${EQUIPO.length}`);
  console.log(`  CON claim de rol:         ${equipo.length - sinRol.length}`);
  console.log(`  SIN claim de rol:         ${sinRol.length}`);

  if (sinRol.length) {
    console.log('\n  ❌ Estas conservan TODOS los permisos de hoy (vía de convivencia):');
    sinRol.forEach(f => console.log(`       ${f.correo}`));
    console.log('\n     Asignar el rol en Configuración → Usuarios, y que la persona');
    console.log('     CIERRE SESIÓN y vuelva a entrar: el claim viaja en el token, y');
    console.log('     el que ya tiene en el navegador no lo trae.');
  }

  if (invalidos.length) {
    console.log('\n  ⚠️  Rol que las reglas no reconocen (se trata como rol puesto,');
    console.log('      así que NO cae en la convivencia: esa cuenta queda sin permisos):');
    invalidos.forEach(f => console.log(`       ${f.correo} → «${f.rol}»`));
  }

  if (faltantes.length) {
    console.log('\n  ⚠️  En la lista de las reglas pero sin cuenta activa en Auth:');
    faltantes.forEach(c => console.log(`       ${c}`));
  }

  const prueba = filas.filter(f => f.esPrueba && !f.deshabilitada);
  if (prueba.length) {
    console.log(`\n  🔴 ${prueba.length} cuenta(s) de PRUEBA activas en este proyecto:`);
    prueba.forEach(f => console.log(`       ${f.correo}  (último acceso ${f.ultimoAcceso})`));
    console.log('     Las reglas las dejan fuera de Firestore, pero son credenciales');
    console.log('     válidas del proyecto mientras existan (§6).');
  }

  /*
   * El veredicto exige que las SIETE estén Y con rol. Con `sinRol.length === 0`
   * a secas, cero cuentas del equipo daba «listo» —verde porque no hay a quién
   * contar, no porque esté completo—. Lo destapó correrlo contra el emulador,
   * donde solo viven las de prueba.
   */
  const conRol = equipo.length - sinRol.length;
  const listo = faltantes.length === 0 && sinRol.length === 0 && invalidos.length === 0;
  console.log(`\n  ${conRol} de ${EQUIPO.length} con rol asignado.`);
  console.log(`  ${listo ? '✅ Los claims están listos: el deploy sí protege.'
                         : '⛔ NO desplegar todavía: mientras falte una cuenta del equipo sin rol,'
                           + '\n     esa cuenta conserva TODOS los permisos de hoy y el deploy no la protege.'}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
