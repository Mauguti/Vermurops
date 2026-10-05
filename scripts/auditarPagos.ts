/**
 * auditarPagos.ts — SOLO LECTURA.
 *
 * Mide, sobre los datos reales, los siete huecos que el PLAN-PAGOS §2.3
 * describe en prosa. Es el insumo de la cola de pagos: decide si el modelo
 * nuevo se puede leer encima de lo que ya hay, o si primero hay que arreglar
 * algo.
 *
 * El criterio de §2.3 es explícito: **ninguna migración**. Si aquí sale algo
 * que el modelo nuevo no lee bien, se arregla el LECTOR, no el dato. Por eso
 * este script no propone correcciones: cuenta.
 *
 * NO hace set, update, delete, add ni batch. Solo get().
 *
 * Uso:
 *   npx vite-node scripts/auditarPagos.ts
 *   SERVICE_ACCOUNT=/otra/ruta.json npx vite-node scripts/auditarPagos.ts
 *
 * La llave por omisión es `$HOME/llaves/vermur-adminsdk.json`, fuera del
 * repo a propósito.
 *
 * Contra EMULADORES no pide llave: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`
 * basta, y así el script se puede probar sin tocar producción.
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type Fila = Record<string, any>;

const n2 = (x: number) => Math.round(x * 100) / 100;
const money = (x: number, m: string) =>
  `${m} ${x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** El rango de fechas de una colección, por el campo que la fecha ocupe ahí. */
function rango(filas: Fila[], campos: string[]): string {
  const fechas = filas
    .map(f => campos.map(c => f[c]).find(v => typeof v === 'string' && v.length >= 10))
    .filter(Boolean)
    .map(s => String(s).slice(0, 10))
    .sort();
  if (!fechas.length) return 'sin fechas legibles';
  return `${fechas[0]} → ${fechas[fechas.length - 1]}`;
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

  const traer = async (col: string): Promise<Fila[]> =>
    (await db.collection(col).get()).docs.map(d => ({ id: d.id, ...d.data() }));

  const [facturas, cobros, depositos, ordenes, embarques] = await Promise.all([
    traer('facturas'),
    traer('cobros'),
    traer('depositosCliente'),
    traer('ordenesCompra'),
    traer('embarques'),
  ]);

  console.log('\n══════════ AUDITORÍA DE PAGOS (solo lectura) ══════════\n');

  // ── 1 · Cuánto hay y de cuándo ───────────────────────────────────────────
  console.log('── 1 · Qué hay ──');
  console.log(`  facturas:          ${String(facturas.length).padStart(5)}   ${rango(facturas, ['fechaEmision', 'createdAt'])}`);
  console.log(`  cobros:            ${String(cobros.length).padStart(5)}   ${rango(cobros, ['fechaCobro', 'createdAt'])}`);
  console.log(`  depositosCliente:  ${String(depositos.length).padStart(5)}   ${rango(depositos, ['fechaDeposito', 'createdAt'])}`);
  console.log(`  ordenesCompra:     ${String(ordenes.length).padStart(5)}`);

  const vivas = facturas.filter(f => f.activo !== false);
  const vivos = cobros.filter(c => c.activo !== false);
  console.log(`  (vivas/vivos: ${vivas.length} facturas · ${vivos.length} cobros)\n`);

  // ── 2 · Cobros en moneda distinta a su factura ───────────────────────────
  /*
   * `saldoDeFactura` los descarta del saldo y los reporta como `avisoMoneda`
   * (§4.3). Aquí sale cuántos son DE VERDAD: si son cero, el aviso es teórico;
   * si no, el modelo nuevo tiene que resolverlos antes de tocar nada.
   */
  const porFactura = new Map<string, Fila[]>();
  vivos.forEach(c => {
    const k = String(c.facturaId ?? '');
    if (!porFactura.has(k)) porFactura.set(k, []);
    porFactura.get(k)!.push(c);
  });

  const mezcladas: string[] = [];
  const sobrecobradas: string[] = [];

  vivas.forEach(f => {
    const suyos = porFactura.get(f.id) ?? [];
    if (!suyos.length) return;

    const otra = suyos.filter(c => (c.moneda ?? f.moneda) !== f.moneda);
    if (otra.length) {
      mezcladas.push(
        `  ${f.numero ?? f.id} · factura ${money(Number(f.total ?? 0), String(f.moneda))}` +
        ` · ${otra.length} cobro(s) en ${[...new Set(otra.map(c => c.moneda))].join('/')}` +
        ` por ${otra.map(c => money(Number(c.monto ?? 0), String(c.moneda))).join(' + ')}`,
      );
    }

    // Mismo cálculo que saldoDeFactura: solo cuentan los de LA moneda.
    const deLaMoneda = suyos.filter(c => (c.moneda ?? f.moneda) === f.moneda);
    const cobrado = n2(deLaMoneda.reduce((a, c) => a + Number(c.monto ?? 0), 0));
    const saldo = n2(Number(f.total ?? 0) - cobrado);
    // La tolerancia de un peso es la misma del lector: los centavos del IVA
    // no son un sobrecobro.
    if (saldo < -1) {
      sobrecobradas.push(
        `  ${f.numero ?? f.id} · total ${money(Number(f.total ?? 0), String(f.moneda))}` +
        ` · cobrado ${money(cobrado, String(f.moneda))} · sobra ${money(-saldo, String(f.moneda))}` +
        ` (${deLaMoneda.length} cobros)`,
      );
    }
  });

  console.log('── 2 · Cobros en moneda distinta a la de su factura ──');
  console.log(`  facturas afectadas: ${mezcladas.length}`);
  mezcladas.slice(0, 15).forEach(l => console.log(l));
  if (mezcladas.length > 15) console.log(`  … y ${mezcladas.length - 15} más`);
  console.log();

  console.log('── 3 · Facturas SOBRECOBRADAS (saldo negativo) ──');
  console.log('  Con N cobros sueltos nadie las ha podido ver.');
  console.log(`  facturas: ${sobrecobradas.length}`);
  sobrecobradas.slice(0, 15).forEach(l => console.log(l));
  if (sobrecobradas.length > 15) console.log(`  … y ${sobrecobradas.length - 15} más`);
  console.log();

  // ── 4 · Huérfanos ────────────────────────────────────────────────────────
  const idsFactura = new Set(facturas.map(f => f.id));
  const idsEmbarque = new Set(embarques.map(e => e.id));

  const cobrosHuerfanos = vivos.filter(c => !c.facturaId || !idsFactura.has(String(c.facturaId)));
  const depositosHuerfanos = depositos
    .filter(d => d.activo !== false)
    .filter(d => !d.embarqueId || !idsEmbarque.has(String(d.embarqueId)));

  console.log('── 4 · Cobros cuyo facturaId no existe ──');
  console.log(`  cobros: ${cobrosHuerfanos.length}`);
  cobrosHuerfanos.slice(0, 15).forEach(c => console.log(
    `  ${c.id} · ${money(Number(c.monto ?? 0), String(c.moneda ?? '?'))}` +
    ` · facturaId «${c.facturaId ?? '(vacío)'}» · ${c.clienteNombre ?? '—'} · ${c.fechaCobro ?? '—'}`,
  ));
  console.log();

  console.log('── 5 · Depósitos cuyo embarqueId no existe ──');
  console.log(`  depósitos: ${depositosHuerfanos.length}`);
  depositosHuerfanos.slice(0, 15).forEach(d => console.log(
    `  ${d.id} · ${money(Number(d.monto ?? 0), String(d.moneda ?? '?'))}` +
    ` · embarqueId «${d.embarqueId ?? '(vacío)'}» · ${d.fechaDeposito ?? '—'}`,
  ));
  console.log();

  // ── 6 · Órdenes pagadas sin comprobante ──────────────────────────────────
  /*
   * La validación que lo exige es de hoy; las órdenes anteriores pudieron
   * pasar sin él. El conteo dice cuántas quedarían sin respaldo si el modelo
   * nuevo lo diera por hecho.
   */
  const pagadas = ordenes.filter(o => o.estado === 'pagada' && o.activo !== false);
  const sinComprobante = pagadas.filter(o => !o.comprobantePago);

  console.log('── 6 · Órdenes «pagada» SIN comprobantePago ──');
  console.log(`  pagadas: ${pagadas.length} · sin comprobante: ${sinComprobante.length}`);
  sinComprobante.slice(0, 15).forEach(o => console.log(
    `  ${o.folio ?? o.id} · ${money(Number(o.monto ?? 0), String(o.moneda ?? '?'))} · ${o.proveedorNombre ?? '—'}`,
  ));
  console.log();

  // ── 7 · El mismo comprobante en varias órdenes ───────────────────────────
  /*
   * ESTE es el número que justifica la entidad «pago» del §1.1: cada grupo de
   * aquí es un pago consolidado real que hoy vive como N strings copiados.
   */
  const porComprobante = new Map<string, Fila[]>();
  pagadas.filter(o => o.comprobantePago).forEach(o => {
    const k = String(o.comprobantePago).trim();
    if (!k) return;
    if (!porComprobante.has(k)) porComprobante.set(k, []);
    porComprobante.get(k)!.push(o);
  });
  const consolidados = [...porComprobante.entries()]
    .filter(([, os]) => os.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log('── 7 · El mismo comprobantePago en varias órdenes ──');
  console.log('  Cada grupo es un pago consolidado real que hoy no existe como entidad.');
  console.log(`  grupos: ${consolidados.length} · órdenes involucradas: ${consolidados.reduce((a, [, os]) => a + os.length, 0)}`);
  consolidados.slice(0, 15).forEach(([comp, os]) => {
    const monedas = [...new Set(os.map(o => String(o.moneda)))];
    const total = monedas.length === 1
      ? money(n2(os.reduce((a, o) => a + Number(o.monto ?? 0), 0)), monedas[0])
      : `${monedas.join(' + ')} — no se suma (§4.3)`;
    console.log(`  «${comp}» · ${os.length} órdenes · ${total}`);
    console.log(`      ${os.map(o => o.folio ?? o.id).join(', ')}`);
  });
  console.log();

  // ── Cierre ───────────────────────────────────────────────────────────────
  console.log('══════════ RESUMEN ══════════');
  console.log(`  cobros en otra moneda que su factura: ${mezcladas.length} facturas`);
  console.log(`  facturas sobrecobradas:               ${sobrecobradas.length}`);
  console.log(`  cobros huérfanos:                     ${cobrosHuerfanos.length}`);
  console.log(`  depósitos huérfanos:                  ${depositosHuerfanos.length}`);
  console.log(`  órdenes pagadas sin comprobante:      ${sinComprobante.length} de ${pagadas.length}`);
  console.log(`  pagos consolidados escondidos:        ${consolidados.length} grupos`);
  console.log('\n  Ninguna migración: lo que salga mal se arregla en el lector.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
