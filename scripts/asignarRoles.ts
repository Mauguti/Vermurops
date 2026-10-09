/**
 * asignarRoles.ts — pone el claim `rol` a las seis cuentas del equipo.
 *
 * EN SECO POR DEFECTO. Sin `--aplicar` no toca ni un claim.
 *
 * ── Por qué hace falta un script ──────────────────────────────────────────
 * La pantalla (Configuración → Usuarios) solo puede cambiarle el rol a quien
 * aparece en su lista, y esa lista sale de la colección `usuarios/` de
 * Firestore — no de Auth. Las seis cuentas de `@vermur.com` existen desde
 * antes de que existiera ese módulo, así que no tienen documento ahí y la
 * pantalla no las enseña: no había a quién asignarle nada.
 *
 * Este script va directo a Auth con el Admin SDK, que es donde viven los
 * claims. `gestionarUsuarios` queda arreglado aparte, para que la pantalla
 * también sirva de aquí en adelante.
 *
 * ── Lo que NO hace ───────────────────────────────────────────────────────
 *   · No toca `info@digsol.com.mx` (ya tiene su rol).
 *   · No toca las cuentas de PRUEBA que siguen en producción (§6): esas se
 *     borran, no se les asigna rol.
 *   · No crea cuentas ni documentos en `usuarios/`.
 *   · **No pisa otros claims.** `setCustomUserClaims` REEMPLAZA el objeto
 *     completo, así que se leen los que ya hay y se escriben de vuelta con
 *     `rol` encima. La Function tiene este mismo defecto —escribe `{ rol }`
 *     a secas— y queda anotado.
 *
 * ── Después de aplicar ───────────────────────────────────────────────────
 * El claim viaja EN EL TOKEN. Cada persona tiene que **cerrar sesión y
 * volver a entrar**; el script revoca los refresh tokens para forzarlo, pero
 * la pestaña que ya está abierta puede seguir con el token viejo hasta una
 * hora. Verificar con `scripts/auditarClaims.ts`.
 *
 * Uso:
 *   npx tsx scripts/asignarRoles.ts              # en seco, muestra qué haría
 *   npx tsx scripts/asignarRoles.ts --aplicar    # escribe
 *
 * La llave por omisión es `$HOME/llaves/vermur-adminsdk.json`, fuera del repo.
 * Contra emuladores: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

const APLICAR = process.argv.includes('--aplicar');

/** El mapa que confirmó Mau. Nada fuera de aquí se toca. */
const MAPA: Record<string, string> = {
  'gabriela.huerta@vermur.com': 'admin',
  'luis.renteria@vermur.com': 'admin',
  'julio.gutierrez@vermur.com': 'administracion',
  'angel.luna@vermur.com': 'operaciones',
  'nohema.sosa@vermur.com': 'pricing',
  'itzel.laurean@vermur.com': 'ventas',
};

/** Fuera del mapa a propósito, por si alguien amplía el script sin leer. */
const NO_TOCAR = [
  'info@digsol.com.mx',
  'admin@vermur.com', 'ventas@vermur.com', 'pricing@vermur.com',
  'operaciones@vermur.com', 'administracion@vermur.com',
];

type Accion = 'pone' | 'cambia' | 'ya_esta' | 'sin_cuenta' | 'deshabilitada';

interface Plan {
  correo: string;
  rolDestino: string;
  uid: string | null;
  rolActual: string | null;
  otrosClaims: string[];
  accion: Accion;
}

function planear(correo: string, rolDestino: string, u: UserRecord | undefined): Plan {
  if (!u) {
    return { correo, rolDestino, uid: null, rolActual: null, otrosClaims: [], accion: 'sin_cuenta' };
  }
  const claims = (u.customClaims ?? {}) as Record<string, unknown>;
  const rolActual = typeof claims.rol === 'string' ? claims.rol : null;
  const otrosClaims = Object.keys(claims).filter(k => k !== 'rol');
  const accion: Accion =
    u.disabled ? 'deshabilitada'
    : rolActual === rolDestino ? 'ya_esta'
    : rolActual ? 'cambia'
    : 'pone';
  return { correo, rolDestino, uid: u.uid, rolActual, otrosClaims, accion };
}

async function main() {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
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

  // Se busca por correo, uno por uno: `getUserByEmail` falla con 404 y así se
  // distingue «no existe la cuenta» de «existe y no tiene rol».
  const planes: Plan[] = [];
  for (const [correo, rol] of Object.entries(MAPA)) {
    let u: UserRecord | undefined;
    try {
      u = await getAuth().getUserByEmail(correo);
    } catch {
      u = undefined;
    }
    planes.push(planear(correo, rol, u));
  }

  console.log(`\n═════════ ASIGNAR ROLES ${APLICAR ? '· APLICAR' : '· EN SECO'} ═════════\n`);
  const ICONO: Record<Accion, string> = {
    pone: '➕', cambia: '🔁', ya_esta: '✓ ', sin_cuenta: '❌', deshabilitada: '🚫',
  };
  const TEXTO: Record<Accion, string> = {
    pone: 'se le pone',
    cambia: 'se le CAMBIA',
    ya_esta: 'ya lo tiene',
    sin_cuenta: 'no existe en Auth',
    deshabilitada: 'cuenta deshabilitada: NO se toca',
  };

  for (const p of planes) {
    const actual = p.rolActual ?? 'sin rol';
    console.log(`${ICONO[p.accion]} ${p.correo.padEnd(30)} ${actual.padEnd(16)} → ${p.rolDestino.padEnd(16)} ${TEXTO[p.accion]}`);
    if (p.otrosClaims.length) {
      console.log(`     (conserva otros claims: ${p.otrosClaims.join(', ')})`);
    }
  }

  console.log(`\n  No se tocan, por diseño: ${NO_TOCAR.join(', ')}\n`);

  const aEscribir = planes.filter(p => p.accion === 'pone' || p.accion === 'cambia');
  const problemas = planes.filter(p => p.accion === 'sin_cuenta' || p.accion === 'deshabilitada');

  if (problemas.length) {
    console.log('  ⚠️  Estas no se van a poder asignar:');
    problemas.forEach(p => console.log(`       ${p.correo} · ${TEXTO[p.accion]}`));
    console.log();
  }

  if (!aEscribir.length) {
    console.log('  Nada que escribir.\n');
    return;
  }

  if (!APLICAR) {
    console.log(`  ℹ️  Modo seco: ${aEscribir.length} cuenta(s) quedarían con rol. Para aplicar, agrega --aplicar.\n`);
    return;
  }

  for (const p of aEscribir) {
    const u = await getAuth().getUser(p.uid!);
    const claims = (u.customClaims ?? {}) as Record<string, unknown>;
    // Los que ya estaban, intactos; `rol` encima. `setCustomUserClaims`
    // reemplaza el objeto completo: mandar solo `{ rol }` borraría el resto.
    await getAuth().setCustomUserClaims(p.uid!, { ...claims, rol: p.rolDestino });
    // Fuerza a renovar sesión: el token viejo no trae el claim nuevo.
    await getAuth().revokeRefreshTokens(p.uid!);
    console.log(`  ✅ ${p.correo} → ${p.rolDestino}`);
  }

  console.log(`\n  ${aEscribir.length} cuenta(s) con rol asignado y tokens revocados.`);
  console.log('  Pídeles que CIERREN SESIÓN y vuelvan a entrar; una pestaña abierta');
  console.log('  puede seguir con el token viejo hasta una hora.');
  console.log('  Comprobar con: npx tsx scripts/auditarClaims.ts\n');
}

main().catch(e => { console.error(e); process.exit(1); });
