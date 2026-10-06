/**
 * minarRFCMagaya.ts — fase 1 de RFC (PLAN-CARGA-FISCAL.md §… «la fase 1 no se
 * escribió como script aparte»).
 *
 * El export de Magaya guardó el Tax ID en `numeroEntidadMagaya`, no en `rfc`:
 * **318 de 817 clientes lo traen ahí y 0 en `rfc`**. La fase 2
 * (`cargarClientesOk.ts`) lo resuelve cuando llega la lista de Luis; esta
 * fase 1 no espera la lista: la base es su única fuente.
 *
 * EN SECO POR DEFECTO. Sin `--aplicar` no escribe ni un campo.
 *
 * ── La regla que no se rompe ───────────────────────────────────────────────
 * **Solo se escribe donde `rfc` está vacío.** Un `rfc` que ya existe nunca se
 * pisa, ni siquiera cuando el de Magaya parece mejor: eso es una decisión de
 * Administración, no de un script. Los desacuerdos salen listados para que
 * alguien los mire.
 *
 * Reusa `rfcEfectivo`/`normalizarRFC`/`validarRFC` —la misma lectura que hace
 * el empate de la fase 2, para que las dos vean el mismo RFC— y el MISMO
 * formato de respaldo, así que la reversa ya existe:
 *
 *   npx tsx scripts/revertirCargaClientes.ts scripts/respaldos/rfc-magaya-FECHA.json --aplicar
 *
 * Uso:
 *   # 1. Ver qué haría (no escribe nada)
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/minarRFCMagaya.ts
 *
 *   # 2. Aplicar (genera respaldo y el comando de reversa)
 *   SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/minarRFCMagaya.ts --aplicar
 *
 * La llave por omisión es `$HOME/llaves/vermur-adminsdk.json`, fuera del repo.
 *
 * Contra EMULADORES no pide llave: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
 * basta, y así el script se puede probar sin tocar producción.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, resolve, dirname } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { normalizarRFC, rfcEfectivo, type ClienteBase } from '../src/lib/cargaClientesOk';
import { validarRFC } from '../src/lib/validadores';
import { esRFCExtranjero } from '../src/lib/datosFiscales';

const APLICAR = process.argv.includes('--aplicar');

// ─── Respaldo: el mismo formato que cargarClientesOk, para reusar la reversa ─

interface CampoRespaldo { presente: boolean; valor: unknown }
interface DocRespaldo {
  coleccion: 'clientes';
  id: string;
  nombre: string;
  antes: Record<string, CampoRespaldo>;
}
interface ArchivoRespaldo {
  fecha: string;
  script: string;
  archivoFuente: string;
  comandoRevertir: string;
  documentos: DocRespaldo[];
}

/** Qué le pasa a cada cliente. Un cliente cae en exactamente una. */
type Veredicto =
  | 'ya_tiene'        // rfc propio válido: no se toca
  | 'minar'           // rfc vacío + Magaya válido: se escribe
  | 'desacuerdo'      // Magaya trae OTRO rfc válido: decide una persona
  | 'rfc_invalido'    // el rfc que ya está no pasa, y Magaya no ofrece nada mejor
  | 'magaya_invalido' // rfc vacío, Magaya trae algo que no es un RFC
  | 'generico'        // Magaya trae un RFC genérico del SAT: no identifica a nadie
  | 'sin_dato';       // ni rfc ni Magaya

interface Caso { veredicto: Veredicto; propio: string; magaya: string }

/**
 * `validarRFC` comprueba el **dígito verificador**, no solo la forma. Un RFC
 * con una letra de más pasa la estructura y falla aquí — que es lo correcto,
 * pero deja al cliente fuera del minado sin decir por qué. Por eso los que
 * tienen la forma buena y el dígito malo se reportan aparte: casi siempre son
 * un RFC real con un error de dedo, y se arreglan a mano en diez minutos.
 */
function estructuraDeRFC(v: string): boolean {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v);
}

/*
 * Los dos genéricos del SAT. `validarRFC` los acepta por whitelist —son
 * válidos para timbrar— pero NINGUNO identifica a un cliente, así que
 * ninguno se mina:
 *
 *   XAXX010101000  «público en general». Una empresa con nombre y razón
 *                  social NO es público en general. Escribirlo afirma algo
 *                  falso, y encima deja el campo con cara de validado.
 *   XEXX010101000  residente en el extranjero. Para un cliente extranjero
 *                  SÍ es el RFC correcto del CFDI, pero tampoco distingue a
 *                  uno de otro: si lo minamos, 40 extranjeros quedan con el
 *                  mismo «RFC» y el empate por RFC de la fase 2 los junta.
 *
 * Los dos salen listados para que Administración los ponga a mano donde
 * corresponda. Si Vermur decide que XEXX sí se escriba a los extranjeros,
 * es quitar una línea de este Set.
 */
const RFC_GENERICOS_SAT = new Set(['XAXX010101000', 'XEXX010101000']);

function clasificar(c: ClienteBase): Caso {
  const propio = normalizarRFC(c.rfc ?? '');
  const magaya = normalizarRFC(c.numeroEntidadMagaya ?? '');
  const propioOk = !!propio && validarRFC(propio).valido;
  const magayaOk = !!magaya && validarRFC(magaya).valido;

  // Antes que nada: un genérico no se mina, venga de donde venga.
  if (!propio && magayaOk && RFC_GENERICOS_SAT.has(magaya)) {
    return { veredicto: 'generico', propio, magaya };
  }

  // Magaya aporta algo solo si es válido Y distinto de lo que ya hay.
  if (magayaOk && magaya !== propio) {
    // Con el campo vacío se mina; con algo escrito, lo decide una persona.
    return { veredicto: propio ? 'desacuerdo' : 'minar', propio, magaya };
  }
  if (propioOk) return { veredicto: 'ya_tiene', propio, magaya };
  // Lo que queda: el propio no sirve y Magaya no ofrece nada mejor.
  if (propio) return { veredicto: 'rfc_invalido', propio, magaya };
  if (magaya) return { veredicto: 'magaya_invalido', propio, magaya };
  return { veredicto: 'sin_dato', propio, magaya };
}

async function main() {
  const EN_EMULADOR = !!process.env.FIRESTORE_EMULATOR_HOST;
  if (EN_EMULADOR) {
    // Contra el emulador no hay credenciales que validar: solo el proyecto.
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
    console.log(`(emulador en ${process.env.FIRESTORE_EMULATOR_HOST})`);
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
  const db = getFirestore();

  const snap = await db.collection('clientes').get();
  const clientes: (ClienteBase & Record<string, any>)[] = snap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }));

  console.log(`\n══════ FASE 1 · minar numeroEntidadMagaya → rfc ══════`);
  console.log(`Clientes en la base: ${clientes.length}`);
  console.log(APLICAR ? 'Modo: APLICAR\n' : 'Modo: SECO (no se escribe nada)\n');

  const grupos: Record<Veredicto, typeof clientes> = {
    ya_tiene: [], minar: [], sin_dato: [], magaya_invalido: [], desacuerdo: [], rfc_invalido: [],
    generico: [],
  };
  const detalle = new Map<string, { propio: string; magaya: string }>();

  clientes.forEach(c => {
    const { veredicto, propio, magaya } = clasificar(c);
    grupos[veredicto].push(c);
    detalle.set(c.id, { propio, magaya });
  });

  const aMinar = grupos.minar;

  console.log('── Qué encontró ──');
  console.log(`  ya tienen rfc válido:        ${grupos.ya_tiene.length}`);
  console.log(`  SE MINAN (rfc vacío):        ${aMinar.length}`);
  console.log(`  Magaya trae algo no-RFC:     ${grupos.magaya_invalido.length}`);
  console.log(`  el rfc que ya está no pasa:  ${grupos.rfc_invalido.length}`);
  console.log(`  genérico del SAT (NO se mina):${String(grupos.generico.length).padStart(4)}`);
  console.log(`  sin dato en ninguno:         ${grupos.sin_dato.length}`);
  console.log(`  desacuerdo (NO se tocan):    ${grupos.desacuerdo.length}`);
  console.log();

  // Los «casi»: forma de RFC con dígito verificador malo. No se minan, pero
  // son los que más barato se arreglan, así que salen contados.
  const casi = [...grupos.magaya_invalido, ...grupos.rfc_invalido].filter(c => {
    const d = detalle.get(c.id)!;
    return [d.magaya, d.propio].some(v => v && estructuraDeRFC(v));
  });
  if (casi.length) {
    console.log(`  ⚠️  ${casi.length} tienen FORMA de RFC y el dígito verificador mal.`);
    console.log('      Casi siempre es un error de dedo sobre un RFC real:');
    casi.slice(0, 10).forEach(c => {
      const d = detalle.get(c.id)!;
      console.log(`      ${c.id} · ${String(c.nombre).slice(0, 34).padEnd(34)} «${d.propio || d.magaya}»`);
    });
    if (casi.length > 10) console.log(`      … y ${casi.length - 10} más`);
    console.log();
  }

  if (grupos.generico.length) {
    const xaxx = grupos.generico.filter(c => detalle.get(c.id)!.magaya === 'XAXX010101000');
    const xexx = grupos.generico.filter(c => esRFCExtranjero(detalle.get(c.id)!.magaya));
    console.log('── RFC genéricos del SAT: NO se minan ──');
    console.log(`  XAXX (público en general): ${xaxx.length}  ← una empresa con nombre no es «público en general»`);
    console.log(`  XEXX (extranjero):         ${xexx.length}  ← correcto para el CFDI, pero no distingue un cliente de otro`);
    console.log('  Los pone Administración a mano donde corresponda.');
    grupos.generico.slice(0, 10).forEach(c => {
      console.log(`      ${c.id} · ${String(c.nombre).slice(0, 40).padEnd(40)} «${detalle.get(c.id)!.magaya}»`);
    });
    if (grupos.generico.length > 10) console.log(`      … y ${grupos.generico.length - 10} más`);
    console.log();
  }

  if (grupos.desacuerdo.length) {
    console.log('── Desacuerdos: Magaya trae OTRO RFC válido. Los decide Administración ──');
    grupos.desacuerdo.slice(0, 20).forEach(c => {
      const d = detalle.get(c.id)!;
      console.log(`  ${c.id} · ${String(c.nombre).slice(0, 42)}`);
      console.log(`      rfc actual: «${d.propio || '(vacío)'}»   Magaya: «${d.magaya || '(vacío)'}»`);
    });
    if (grupos.desacuerdo.length > 20) console.log(`  … y ${grupos.desacuerdo.length - 20} más`);
    console.log();
  }

  if (grupos.magaya_invalido.length) {
    console.log('── Magaya trae algo que no pasa como RFC (muestra) ──');
    grupos.magaya_invalido.slice(0, 10).forEach(c => {
      console.log(`  ${c.id} · ${String(c.nombre).slice(0, 42)} → «${detalle.get(c.id)!.magaya}»`);
    });
    console.log();
  }

  console.log('── Lo que se escribiría ──');
  aMinar.slice(0, 25).forEach(c => {
    console.log(`  ${c.id} · ${String(c.nombre).slice(0, 48).padEnd(48)} rfc = ${detalle.get(c.id)!.magaya}`);
  });
  if (aMinar.length > 25) console.log(`  … y ${aMinar.length - 25} más`);
  console.log();

  // Comprobación cruzada: después de escribir, `rfcEfectivo` no debe cambiar
  // para nadie — solo deja de depender del fallback. Si cambiara, el script
  // estaría moviendo el RFC con el que la fase 2 va a empatar.
  const mueveElEmpate = aMinar.filter(c => rfcEfectivo(c) !== detalle.get(c.id)!.magaya);
  if (mueveElEmpate.length) {
    console.log(`  ⚠️  ${mueveElEmpate.length} cliente(s) cambiarían el RFC que usa el empate de la fase 2.`);
    console.log('      Eso no debería pasar: revisa antes de aplicar.\n');
  }

  if (!APLICAR) {
    console.log(`ℹ️  Modo seco: no se escribió nada. Para aplicar, agrega --aplicar.\n`);
    return;
  }
  if (!aMinar.length) {
    console.log('No hay nada que minar.\n');
    return;
  }

  // ─── Aplicar ──────────────────────────────────────────────────────────────
  const fecha = new Date().toISOString().replace(/[:.]/g, '-');
  const rutaRespaldo = resolve(`scripts/respaldos/rfc-magaya-${fecha}.json`);
  mkdirSync(dirname(rutaRespaldo), { recursive: true });

  const respaldo: ArchivoRespaldo = {
    fecha: new Date().toISOString(),
    script: 'minarRFCMagaya.ts',
    archivoFuente: 'numeroEntidadMagaya de la propia base',
    comandoRevertir: `SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/revertirCargaClientes.ts ${rutaRespaldo} --aplicar`,
    documentos: [],
  };

  // El respaldo se arma con el documento TAL COMO ESTÁ en el servidor.
  for (const c of aMinar) {
    const vivo = await db.collection('clientes').doc(c.id).get();
    const d = vivo.data() ?? {};
    respaldo.documentos.push({
      coleccion: 'clientes',
      id: c.id,
      nombre: String(c.nombre ?? ''),
      antes: {
        // `presente: false` hace que la reversa BORRE el campo en vez de
        // dejarlo en null: un `rfc: null` donde no había nada cambia lo que
        // `estadoFiscal` lee después.
        rfc: { presente: 'rfc' in d, valor: d.rfc ?? null },
        updatedAt: { presente: 'updatedAt' in d, valor: d.updatedAt ?? null },
      },
    });
  }
  writeFileSync(rutaRespaldo, JSON.stringify(respaldo, null, 2), 'utf-8');
  console.log(`💾 Respaldo de ${respaldo.documentos.length} documentos: ${rutaRespaldo}`);

  const ahora = new Date().toISOString();
  let escritos = 0;
  // En lotes de 400: el límite de un batch de Firestore es 500.
  for (let i = 0; i < aMinar.length; i += 400) {
    const lote = db.batch();
    aMinar.slice(i, i + 400).forEach(c => {
      lote.update(db.collection('clientes').doc(c.id), {
        rfc: detalle.get(c.id)!.magaya,
        updatedAt: ahora,
      });
      escritos++;
    });
    await lote.commit();
  }

  console.log(`✅ ${escritos} clientes con rfc minado de Magaya.`);
  console.log(`↩️  Para revertir:\n   ${respaldo.comandoRevertir}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
