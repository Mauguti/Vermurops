/**
 * cargarClientesLuis.ts — carga el Excel unificado de Luis (342 clientes).
 *
 * EN SECO POR DEFECTO. Sin `--aplicar` no escribe ni un campo.
 *
 * Uso:
 *   npx tsx scripts/cargarClientesLuis.ts                      # en seco
 *   SERVICE_ACCOUNT=ruta/llave.json npx tsx scripts/cargarClientesLuis.ts
 *   … --aplicar                 # escribe los que empatan
 *   … --aplicar --crear-nuevos  # además crea los que no están
 *   … --forzar-nombres          # pisa el nombre aunque el de la plataforma sea más completo
 *
 * Las reglas viven en `src/lib/cargaClientesLuis.ts`, con 53 tests. Aquí solo
 * están el empate contra la base, el respaldo y la escritura.
 *
 * ── Lo que NO hace ───────────────────────────────────────────────────────
 *   · No borra ni desactiva a nadie. Los ~480 clientes que están en la
 *     plataforma y no vienen en el Excel solo se cuentan.
 *   · No pisa lo capturado: un valor distinto es CONFLICTO y se reporta.
 *   · No escribe «Antigüedad»: solo se reporta (son cinco valores distintos,
 *     no tres).
 *   · No crea clientes sin `--crear-nuevos`.
 *
 * ⚠️ La reversa (`revertirCargaClientes.ts`) deshace las ACTUALIZACIONES. Un
 * cliente CREADO no se deshace solo: sus ids quedan en el respaldo y la
 * convención del proyecto es baja lógica, nunca delete.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { leerXlsx } from '../src/lib/leerXlsx';
import {
  leerRenglonesLuis, resolverComercial, leerDiasLuis, leerCreditoLuis, cpDeDireccion,
  leerRfcLuis, plataformaTieneNombreMasCompleto, normalizarNombre, normalizarRFC,
  type RenglonLuis,
} from '../src/lib/cargaClientesLuis';

const APLICAR = process.argv.includes('--aplicar');
const CREAR = process.argv.includes('--crear-nuevos');
const FORZAR_NOMBRES = process.argv.includes('--forzar-nombres');
const ARCHIVO = process.env.ARCHIVO_CLIENTES
  ?? resolve(process.cwd(), '../vermurops-sprint/sprint/datos/clientes-unificados-luis.xlsx');
const HOJA = 'Maestro de clientes';

/** Nombres que NO son clientes y no se crean. */
const NO_SON_CLIENTES = ['TO BE ASSIGNED', 'TBA', 'POR ASIGNAR'];

interface ClienteBD {
  id: string;
  nombre: string;
  rfc?: string | null;
  correo?: string | null;
  telefono?: string | null;
  domicilio?: string | null;
  codigoPostal?: string | null;
  responsableVentas?: string | null;
  limiteCreditoMXN?: number;
  dias?: number;
  diasCreditoPorTipo?: Record<string, number>;
}

type Accion = 'escribe' | 'igual' | 'conflicto' | 'invalido' | 'sin_dato' | 'protegido';
interface Cambio { campo: string; accion: Accion; antes?: unknown; despues?: unknown; razon?: string }

interface Plan {
  r: RenglonLuis;
  empate: 'rfc' | 'nombre' | 'nuevo' | 'ambiguo';
  cliente?: ClienteBD;
  razonAmbiguo?: string;
  cambios: Cambio[];
  revision: string[];
}

function inicializar() {
  const emulador = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulador) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
    console.log(`🔌 Emulador: ${emulador}`);
    return;
  }
  const ruta = process.env.SERVICE_ACCOUNT;
  if (!ruta) {
    console.error('\nFalta SERVICE_ACCOUNT=/ruta/a/llave.json (o FIRESTORE_EMULATOR_HOST).\n');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(ruta, 'utf-8'))) });
}

const vacio = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

/** Compara texto y decide. Lo capturado distinto NO se pisa. */
function texto(campo: string, actual: unknown, propuesto: string): Cambio {
  if (propuesto.trim() === '') return { campo, accion: 'sin_dato', antes: actual };
  if (vacio(actual)) return { campo, accion: 'escribe', antes: actual ?? null, despues: propuesto.trim() };
  const n = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ');
  if (n(String(actual)) === n(propuesto)) return { campo, accion: 'igual', antes: actual };
  return {
    campo, accion: 'conflicto', antes: actual,
    razon: `la plataforma tiene «${String(actual)}» y el Excel «${propuesto.trim()}». No se pisa.`,
  };
}

function numero(campo: string, actual: unknown, propuesto: number | null, crudo: string): Cambio {
  if (propuesto === null) {
    return { campo, accion: 'sin_dato', antes: actual, razon: crudo.trim() === '' ? undefined : `«${crudo}» se lee como no capturado` };
  }
  if (vacio(actual) || Number(actual) === 0) {
    return { campo, accion: 'escribe', antes: actual ?? null, despues: propuesto };
  }
  if (Number(actual) === propuesto) return { campo, accion: 'igual', antes: actual };
  return {
    campo, accion: 'conflicto', antes: actual,
    razon: `la plataforma tiene ${String(actual)} y el Excel ${propuesto}. No se pisa.`,
  };
}

function planear(r: RenglonLuis, cliente: ClienteBD | undefined, empate: Plan['empate'], razonAmbiguo?: string): Plan {
  const cambios: Cambio[] = [];
  const revision: string[] = [];

  if (r.antiguedad) revision.push(`antigüedad: «${r.antiguedad}» (no se escribe, solo se reporta)`);

  if (!cliente) return { r, empate, cambios, revision, razonAmbiguo };

  // ── nombre ───────────────────────────────────────────────────────────────
  if (!FORZAR_NOMBRES && plataformaTieneNombreMasCompleto(cliente.nombre, r.nombre)) {
    cambios.push({
      campo: 'nombre', accion: 'protegido', antes: cliente.nombre,
      razon: `la plataforma tiene «${cliente.nombre}», más completo que «${r.nombre}». No se recorta.`,
    });
  } else {
    cambios.push(texto('nombre', cliente.nombre, r.nombre));
  }

  // ── RFC ──────────────────────────────────────────────────────────────────
  const rfc = leerRfcLuis(r.rfc);
  if (rfc.rfc === null) {
    cambios.push({ campo: 'rfc', accion: r.rfc.trim() === '' ? 'sin_dato' : 'invalido', antes: cliente.rfc, razon: (rfc as { razon: string }).razon });
    if (r.rfc.trim() !== '') revision.push(`rfc: ${(rfc as { razon: string }).razon} («${r.rfc}»)`);
  } else if (vacio(cliente.rfc)) {
    cambios.push({ campo: 'rfc', accion: 'escribe', antes: cliente.rfc ?? null, despues: rfc.rfc });
  } else if (normalizarRFC(String(cliente.rfc)) === rfc.rfc) {
    cambios.push({ campo: 'rfc', accion: 'igual', antes: cliente.rfc });
  } else {
    cambios.push({ campo: 'rfc', accion: 'conflicto', antes: cliente.rfc, razon: `la plataforma tiene «${cliente.rfc}» y el Excel «${rfc.rfc}». No se pisa.` });
    revision.push(`rfc en conflicto: plataforma «${cliente.rfc}» vs Excel «${rfc.rfc}»`);
  }

  cambios.push(texto('correo', cliente.correo, r.correo));
  cambios.push(texto('telefono', cliente.telefono, r.telefono));
  cambios.push(texto('domicilio', cliente.domicilio, r.direccion));

  // ── código postal ────────────────────────────────────────────────────────
  const cp = cpDeDireccion(r.direccion);
  if (cp.cp === null) {
    cambios.push({ campo: 'codigoPostal', accion: 'sin_dato', antes: cliente.codigoPostal, razon: (cp as { razon: string }).razon });
    if ((cp as { razon: string }).razon.includes('extranjero')) {
      revision.push(`codigoPostal: ${(cp as { razon: string }).razon}`);
    }
  } else {
    cambios.push(texto('codigoPostal', cliente.codigoPostal, cp.cp));
  }

  cambios.push(numero('dias', cliente.dias, leerDiasLuis(r.dias), r.dias));
  cambios.push(numero('limiteCreditoMXN', cliente.limiteCreditoMXN, leerCreditoLuis(r.credito), r.credito));

  // ── ejecutivo de ventas ──────────────────────────────────────────────────
  const com = resolverComercial(r.comercial);
  if (com.tipo === 'usuario') {
    cambios.push(texto('responsableVentas', cliente.responsableVentas, com.correo));
  } else if (com.tipo === 'sin_ejecutivo') {
    /*
     * «Cuenta de la casa» es una afirmación, pero borrar un ejecutivo que ya
     * está capturado sería destruir un dato. Si está vacío, queda vacío (no
     * se escribe nada); si tiene valor, se reporta.
     */
    if (!vacio(cliente.responsableVentas)) {
      cambios.push({ campo: 'responsableVentas', accion: 'conflicto', antes: cliente.responsableVentas, razon: `el Excel dice CLIENTES OFICINA (sin ejecutivo) y la plataforma tiene «${cliente.responsableVentas}». No se borra.` });
      revision.push(`responsableVentas: CLIENTES OFICINA vs «${cliente.responsableVentas}»`);
    } else {
      cambios.push({ campo: 'responsableVentas', accion: 'igual', antes: cliente.responsableVentas, razon: 'cuenta de la casa, y ya estaba sin ejecutivo' });
    }
  } else if (com.tipo === 'revision') {
    cambios.push({ campo: 'responsableVentas', accion: 'invalido', antes: cliente.responsableVentas, razon: com.razon });
    revision.push(`responsableVentas: ${com.razon}`);
  } else {
    cambios.push({ campo: 'responsableVentas', accion: 'sin_dato', antes: cliente.responsableVentas });
  }

  return { r, empate, cliente, cambios, revision };
}

function updateDe(p: Plan): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  for (const c of p.cambios) {
    if (c.accion !== 'escribe') continue;
    u[c.campo] = c.despues;
  }
  // El escalar legacy `dias` y el desglose no deben divergir (§4.30).
  if ('dias' in u) {
    const actual = p.cliente?.diasCreditoPorTipo ?? {};
    u.diasCreditoPorTipo = { ...actual, general: u.dias as number };
  }
  if (Object.keys(u).length > 0) u.updatedAt = new Date().toISOString();
  return u;
}

function csvEscapar(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  console.log(`\n═════════ CARGA DE CLIENTES (Excel de Luis) ${APLICAR ? '· APLICAR' : '· EN SECO'} ═════════\n`);

  let buf: Buffer;
  try {
    buf = readFileSync(ARCHIVO);
  } catch {
    console.error(`No se encontró el archivo: ${ARCHIVO}`);
    console.error('Pásalo con ARCHIVO_CLIENTES=/ruta/al.xlsx\n');
    process.exit(1);
  }
  const { renglones, faltan } = leerRenglonesLuis(leerXlsx(buf, HOJA));
  if (faltan.length) { console.error(`Faltan columnas: ${faltan.join(', ')}`); process.exit(1); }
  console.log(`📄 ${ARCHIVO}`);
  console.log(`   hoja «${HOJA}» · ${renglones.length} renglones con nombre\n`);

  inicializar();
  const db = getFirestore();
  const snap = await db.collection('clientes').get();
  const base: ClienteBD[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as ClienteBD));
  console.log(`🗂️  clientes en la plataforma: ${base.length}\n`);

  // ── índices ──────────────────────────────────────────────────────────────
  const porRfc = new Map<string, ClienteBD[]>();
  const porNombre = new Map<string, ClienteBD[]>();
  for (const c of base) {
    const r = normalizarRFC(String(c.rfc ?? ''));
    if (r && !['XAXX010101000', 'XEXX010101000'].includes(r)) {
      porRfc.set(r, [...(porRfc.get(r) ?? []), c]);
    }
    const n = normalizarNombre(c.nombre ?? '');
    if (n) porNombre.set(n, [...(porNombre.get(n) ?? []), c]);
  }

  // RFC repetidos DENTRO del Excel: no se usan para empatar.
  const vecesEnExcel = new Map<string, number>();
  for (const r of renglones) {
    const x = leerRfcLuis(r.rfc);
    if (x.rfc) vecesEnExcel.set(x.rfc, (vecesEnExcel.get(x.rfc) ?? 0) + 1);
  }

  const planes: Plan[] = [];
  for (const r of renglones) {
    const rfc = leerRfcLuis(r.rfc);
    let plan: Plan | null = null;

    if (rfc.rfc) {
      if ((vecesEnExcel.get(rfc.rfc) ?? 0) > 1) {
        plan = planear(r, undefined, 'ambiguo', `el RFC ${rfc.rfc} aparece ${vecesEnExcel.get(rfc.rfc)} veces en el Excel`);
      } else {
        const cand = porRfc.get(rfc.rfc) ?? [];
        if (cand.length === 1) plan = planear(r, cand[0], 'rfc');
        else if (cand.length > 1) plan = planear(r, undefined, 'ambiguo', `${cand.length} clientes de la plataforma tienen el RFC ${rfc.rfc}`);
      }
    }

    if (!plan) {
      const n = normalizarNombre(r.nombre);
      const cand = porNombre.get(n) ?? [];
      if (cand.length === 1) plan = planear(r, cand[0], 'nombre');
      else if (cand.length > 1) plan = planear(r, undefined, 'ambiguo', `${cand.length} clientes de la plataforma se llaman igual («${n}»)`);
      else plan = planear(r, undefined, 'nuevo');
    }
    planes.push(plan);
  }

  // ── resumen ──────────────────────────────────────────────────────────────
  const conCambios = planes.filter(p => p.cliente && Object.keys(updateDe(p)).length > 0);
  const sinCambio = planes.filter(p => p.cliente && Object.keys(updateDe(p)).length === 0);
  const nuevos = planes.filter(p => p.empate === 'nuevo');
  const ambiguos = planes.filter(p => p.empate === 'ambiguo');
  const conConflicto = planes.filter(p => p.cambios.some(c => c.accion === 'conflicto'));
  const protegidos = planes.filter(p => p.cambios.some(c => c.accion === 'protegido'));
  const creables = nuevos.filter(p => !NO_SON_CLIENTES.includes(p.r.nombre.trim().toUpperCase()));
  const noCreables = nuevos.filter(p => NO_SON_CLIENTES.includes(p.r.nombre.trim().toUpperCase()));

  const nombresExcel = new Set(renglones.map(r => normalizarNombre(r.nombre)));
  const fueraDelExcel = base.filter(c => !nombresExcel.has(normalizarNombre(c.nombre ?? ''))).length;

  console.log('── RESUMEN ──');
  console.log(`  empatan por RFC:                ${planes.filter(p => p.empate === 'rfc').length}`);
  console.log(`  empatan por nombre:             ${planes.filter(p => p.empate === 'nombre').length}`);
  console.log(`  se ACTUALIZAN (algo cambia):    ${conCambios.length}`);
  console.log(`  empatan y no cambia nada:       ${sinCambio.length}`);
  console.log(`  con al menos un CONFLICTO:      ${conConflicto.length}`);
  console.log(`  nombre protegido (más completo):${protegidos.length}`);
  console.log(`  AMBIGUOS (no se tocan):         ${ambiguos.length}`);
  console.log(`  no están en la plataforma:      ${nuevos.length}  (creables: ${creables.length})`);
  console.log(`  en la plataforma y NO en Excel:  ${fueraDelExcel}  (no se tocan)`);

  const porCampo = new Map<string, Map<Accion, number>>();
  for (const p of planes) for (const c of p.cambios) {
    const m = porCampo.get(c.campo) ?? new Map<Accion, number>();
    m.set(c.accion, (m.get(c.accion) ?? 0) + 1);
    porCampo.set(c.campo, m);
  }
  console.log('\n── POR CAMPO ──');
  for (const [campo, m] of porCampo) {
    const partes = [...m.entries()].sort().map(([a, n]) => `${a} ${n}`).join(' · ');
    console.log(`  ${campo.padEnd(18)} ${partes}`);
  }

  if (noCreables.length) {
    console.log('\n  ⚠️  No se crean, no son clientes:');
    noCreables.forEach(p => console.log(`       fila ${p.r.fila}: «${p.r.nombre}»`));
  }
  if (ambiguos.length) {
    console.log('\n  ⚠️  AMBIGUOS — no se escribe nada:');
    ambiguos.forEach(p => console.log(`       fila ${p.r.fila}: ${p.r.nombre} · ${p.razonAmbiguo}`));
  }
  if (creables.length) {
    console.log(`\n  ${CREAR ? '➕ SE CREAN' : 'ℹ️  Se crearían con --crear-nuevos'}:`);
    creables.forEach(p => console.log(`       fila ${p.r.fila}: ${p.r.nombre}`));
  }

  // ── CSV de revisión ──────────────────────────────────────────────────────
  const fecha = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rutaCsv = resolve(dirname(ARCHIVO), `revision-clientes-luis-${fecha}.csv`);
  const lineas = [['fila', 'numero', 'cliente', 'empate', 'idPlataforma', 'asunto'].join(',')];
  for (const p of planes) {
    const asuntos = [
      ...(p.razonAmbiguo ? [`AMBIGUO: ${p.razonAmbiguo}`] : []),
      ...p.cambios.filter(c => c.accion === 'conflicto' || c.accion === 'protegido' || c.accion === 'invalido')
        .map(c => `${c.accion.toUpperCase()} ${c.campo}: ${c.razon ?? ''}`),
      ...p.revision,
      ...(p.empate === 'nuevo' ? ['NUEVO: no está en la plataforma'] : []),
    ];
    for (const a of asuntos) {
      lineas.push([p.r.fila, p.r.numero, p.r.nombre, p.empate, p.cliente?.id ?? '', a].map(csvEscapar).join(','));
    }
  }
  mkdirSync(dirname(rutaCsv), { recursive: true });
  writeFileSync(rutaCsv, lineas.join('\n'), 'utf-8');
  console.log(`\n📋 Revisión (${lineas.length - 1} renglones): ${rutaCsv}`);

  if (!APLICAR) {
    console.log(`\n  ℹ️  EN SECO: no se escribió nada. Para aplicar, agrega --aplicar.`);
    console.log(`     Para crear además los ${creables.length} que no están, suma --crear-nuevos.\n`);
    return;
  }

  // ── escritura ────────────────────────────────────────────────────────────
  const rutaRespaldo = resolve(`scripts/respaldos/clientes-luis-${fecha}.json`);
  const respaldo = {
    fecha: new Date().toISOString(),
    script: 'scripts/cargarClientesLuis.ts',
    archivoFuente: ARCHIVO,
    comandoRevertir: `SERVICE_ACCOUNT=ruta/a/llave.json npx tsx scripts/revertirCargaClientes.ts ${rutaRespaldo}`,
    documentos: [] as Array<{ coleccion: string; id: string; nombre: string; antes: Record<string, { presente: boolean; valor: unknown }> }>,
    creados: [] as Array<{ id: string; nombre: string }>,
  };

  for (const p of conCambios) {
    const ref = db.collection('clientes').doc(p.cliente!.id);
    const ahora = await ref.get();
    if (!ahora.exists) { console.log(`  ⚠️  ${p.cliente!.id} ya no existe. Se omite.`); continue; }
    const doc = ahora.data() as Record<string, unknown>;
    const update = updateDe(p);
    const antes: Record<string, { presente: boolean; valor: unknown }> = {};
    for (const campo of [...Object.keys(update), 'updatedAt']) {
      antes[campo] = campo in doc ? { presente: true, valor: doc[campo] ?? null } : { presente: false, valor: null };
    }
    respaldo.documentos.push({ coleccion: 'clientes', id: p.cliente!.id, nombre: p.cliente!.nombre, antes });
    await ref.update(update);
  }
  console.log(`\n  ✅ ${respaldo.documentos.length} clientes actualizados.`);

  if (CREAR) {
    // Folio consecutivo CLI-NNNN, mirando lo que ya existe.
    let max = 0;
    for (const c of base) {
      const m = /^CLI-(\d+)$/.exec(c.id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    for (const p of creables) {
      max += 1;
      const id = `CLI-${String(max).padStart(4, '0')}`;
      const rfc = leerRfcLuis(p.r.rfc);
      const cp = cpDeDireccion(p.r.direccion);
      const com = resolverComercial(p.r.comercial);
      const dias = leerDiasLuis(p.r.dias);
      const credito = leerCreditoLuis(p.r.credito);
      const hoy = new Date().toISOString().slice(0, 10);
      const doc: Record<string, unknown> = {
        nombre: p.r.nombre,
        statusOperativo: 'ACTIVO',
        origenDatos: 'manual',
        fechaAlta: hoy,
        dias: dias ?? 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(rfc.rfc ? { rfc: rfc.rfc } : {}),
        ...(p.r.correo ? { correo: p.r.correo } : {}),
        ...(p.r.telefono ? { telefono: p.r.telefono } : {}),
        ...(p.r.direccion ? { domicilio: p.r.direccion } : {}),
        ...(cp.cp ? { codigoPostal: cp.cp } : {}),
        ...(dias !== null ? { diasCreditoPorTipo: { general: dias } } : {}),
        ...(credito !== null ? { limiteCreditoMXN: credito } : {}),
        ...(com.tipo === 'usuario' ? { responsableVentas: com.correo } : {}),
      };
      await db.collection('clientes').doc(id).set(doc);
      respaldo.creados.push({ id, nombre: p.r.nombre });
      console.log(`  ➕ ${id}  ${p.r.nombre}`);
    }
  }

  mkdirSync(dirname(rutaRespaldo), { recursive: true });
  writeFileSync(rutaRespaldo, JSON.stringify(respaldo, null, 2), 'utf-8');
  console.log(`\n💾 Respaldo: ${rutaRespaldo}`);
  console.log(`   Revertir las ACTUALIZACIONES: ${respaldo.comandoRevertir}`);
  if (respaldo.creados.length) {
    console.log(`   ⚠️  Los ${respaldo.creados.length} clientes CREADOS no los deshace la reversa.`);
    console.log('      Sus ids están en el respaldo; la convención es baja lógica, nunca delete.');
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
