/**
 * inventarioDatosPrueba.ts — SOLO LECTURA
 *
 * Inventario de datos de prueba para decidir qué limpiar.
 * NO borra, NO marca, NO escribe en Firestore. Solo get().
 *
 * Secciones:
 *   1. Proveedores con nombre que empieza con «Z»
 *   2. Posibles proveedores duplicados (mismo RFC o nombre normalizado)
 *   3. Cotizaciones y embarques: clasificación prueba / real / no sé
 *   4. Cruce de los 6 folios con costo manual sin moneda
 *
 * Imprime por consola y escribe un CSV por sección en la carpeta actual.
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json npx tsx scripts/inventarioDatosPrueba.ts
 *
 * Contra emuladores:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/inventarioDatosPrueba.ts
 *
 * Sin llave ni emulador: falla limpio con mensaje.
 */

import { readFileSync, writeFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// ─── Tipos mínimos (no importamos los del cliente para evitar dependencias Vite) ─

interface Proveedor {
  id: string;
  nombre: string;
  tipos: string[];
  activo: boolean;
  fechaAlta: string;
  numeroEntidadMagaya: string | null;
  origenDatos: string;
  updatedAt: string;
  // RFC puede estar en numeroEntidadMagaya o en un campo rfc
  rfc?: string;
}

interface CotizacionProveedor {
  id: string;
  proveedorId?: string | null;
  seleccionada?: boolean;
  monto?: number;
  moneda?: string;
}

interface ConceptoCotizacion {
  id: string;
  nombre: string;
  conceptoId?: string;
  costo?: number;
  venta?: number;
  proveedoresOficialIds?: string[];
  proveedorOficialId?: string;
  tarifas?: CotizacionProveedor[];
  subconceptos?: { monto?: number }[];
}

interface ServicioSolicitado {
  id: string;
  tipo: string;
  conceptos?: ConceptoCotizacion[];
  cotizacionesProveedor?: CotizacionProveedor[];
}

interface Cotizacion {
  id: string;
  etapa: string;
  prospecto?: {
    empresa?: string;
    contacto?: string;
    email?: string;
  };
  clienteId?: string | null;
  vendedorId?: string;
  pricingId?: string | null;
  servicios?: ServicioSolicitado[];
  valorTotalConsolidado?: number;
  moneda?: string;
  estadoFinal?: string | null;
  createdAt?: string;
  updatedAt?: string;
  embarqueIds?: string[];
  saltoExpediente?: { justificacion: string };
}

interface Embarque {
  id: string;
  cotizacionId?: string;
  etapa?: string;
  estado?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OrdenCompra {
  id: string;
  embarqueId?: string;
  proveedorId?: string;
  estado?: string;
  monto?: number;
  moneda?: string;
}

interface Cliente {
  id: string;
  nombre: string;
  origenDatos?: string;
  numeroEntidadMagaya?: string | null;
  activo?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FOLIOS_SEED = new Set([
  'COT-2026-0001', 'COT-2026-0002', 'COT-2026-0003', 'COT-2026-0004',
  'COT-2026-0005', 'COT-2026-0006', 'COT-2026-0007', 'COT-2026-0008',
]);

const FOLIOS_CRUCE = [
  'COT-2026-0016', 'COT-2026-0018', 'COT-2026-0019',
  'COT-2026-0034', 'COT-2026-0036', 'COT-2026-0037',
];

/** Normaliza nombre para comparación: sin acentos, sin mayúsculas, sin puntuación, sin sufijos legales. */
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quitar acentos
    .toLowerCase()
    .replace(/[.,;:'"()\-\/\\]/g, ' ')                // puntuación → espacio
    .replace(/\b(s\.?a\.?\s*de\s*c\.?v\.?|s\.?a\.?|s\.?\s*de\s*r\.?l\.?\s*de\s*c\.?v\.?|s\.?\s*de\s*r\.?l\.?|s\.?c\.?|inc\.?|ltd\.?|co\.?|corp\.?|llc\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** RFC efectivo: campo rfc, o numeroEntidadMagaya si parece RFC mexicano (10-13 chars alfanum). */
function rfcEfectivo(p: Proveedor): string | null {
  if (p.rfc && p.rfc.trim()) return p.rfc.trim().toUpperCase();
  const nem = p.numeroEntidadMagaya?.trim();
  if (nem && /^[A-ZÑ&a-zñ&]{3,4}\d{6}[A-Za-z0-9]{0,3}$/.test(nem)) return nem.toUpperCase();
  return null;
}

/** Escribe un CSV con cabecera y filas. */
function escribirCSV(nombre: string, cabecera: string[], filas: string[][]): void {
  const escapar = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lineas = [
    cabecera.map(escapar).join(','),
    ...filas.map(f => f.map(escapar).join(',')),
  ];
  writeFileSync(nombre, lineas.join('\n') + '\n', 'utf8');
  console.log(`  → ${nombre} (${filas.length} filas)`);
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Señales para clasificar cotizaciones ─────────────────────────────────────

const EMPRESAS_PRUEBA = [
  'prueba', 'test', 'ejemplo', 'demo', 'dummy', 'sample',
  'el amigo', 'amigo sa', 'asdf', 'xxx', 'aaa', 'bbb',
];

interface SeñalCotizacion {
  folio: string;
  empresa: string;
  etapa: string;
  vendedor: string;
  clienteId: string;
  clienteEsMagaya: boolean;
  tieneEmbarque: boolean;
  tieneOC: boolean;
  montoTotal: number;
  moneda: string;
  conceptosConNombre: number;
  conceptosSinConceptoId: number;
  fechaCreacion: string;
  clasificacion: 'prueba' | 'real' | 'no_se';
  razones: string[];
}

function clasificarCotizacion(
  q: Cotizacion,
  clientesPorId: Map<string, Cliente>,
  embarquesPorCotId: Map<string, Embarque[]>,
  ocPorEmbarqueId: Map<string, OrdenCompra[]>,
): SeñalCotizacion {
  const empresa = q.prospecto?.empresa ?? '(sin empresa)';
  const clienteId = q.clienteId ?? '';
  const cliente = clienteId ? clientesPorId.get(clienteId) : null;
  const clienteEsMagaya = !!(cliente?.origenDatos === 'magaya' || cliente?.numeroEntidadMagaya);
  const embarques = embarquesPorCotId.get(q.id) ?? [];
  const tieneEmbarque = embarques.length > 0 || (q.embarqueIds ?? []).length > 0;
  const tieneOC = embarques.some(e => (ocPorEmbarqueId.get(e.id) ?? []).length > 0);

  let conceptosConNombre = 0;
  let conceptosSinConceptoId = 0;
  (q.servicios ?? []).forEach(srv => {
    (srv.conceptos ?? []).forEach(c => {
      if (c.nombre?.trim()) conceptosConNombre++;
      if (c.nombre?.trim() && !c.conceptoId) conceptosSinConceptoId++;
    });
  });

  const razones: string[] = [];
  let puntajePrueba = 0;
  let puntajeReal = 0;

  // Señales de prueba
  const empresaLower = empresa.toLowerCase();
  if (EMPRESAS_PRUEBA.some(p => empresaLower.includes(p))) {
    razones.push(`empresa sospechosa: "${empresa}"`);
    puntajePrueba += 3;
  }
  if (!clienteId) {
    razones.push('sin clienteId');
    puntajePrueba += 1;
  }
  if (q.valorTotalConsolidado === 0) {
    razones.push('total $0');
    puntajePrueba += 1;
  }
  if (conceptosConNombre === 0) {
    razones.push('sin conceptos con nombre');
    puntajePrueba += 2;
  }
  // Montos redondos (exactamente 100, 1000, 5000, 10000)
  const total = q.valorTotalConsolidado ?? 0;
  if (total > 0 && total === Math.round(total) && [100, 500, 1000, 5000, 10000].includes(total)) {
    razones.push(`monto redondo: ${total}`);
    puntajePrueba += 1;
  }

  // Señales de real
  if (clienteEsMagaya) {
    razones.push('cliente de Magaya');
    puntajeReal += 3;
  }
  if (tieneEmbarque) {
    razones.push('tiene embarque');
    puntajeReal += 2;
  }
  if (tieneOC) {
    razones.push('tiene OC');
    puntajeReal += 2;
  }
  if (conceptosConNombre >= 3) {
    razones.push(`${conceptosConNombre} conceptos`);
    puntajeReal += 1;
  }
  if (q.etapa === 'ganada') {
    razones.push('etapa ganada');
    puntajeReal += 2;
  }

  let clasificacion: 'prueba' | 'real' | 'no_se';
  if (puntajePrueba >= 3 && puntajeReal <= 1) {
    clasificacion = 'prueba';
  } else if (puntajeReal >= 3) {
    clasificacion = 'real';
  } else {
    clasificacion = 'no_se';
  }

  return {
    folio: q.id,
    empresa,
    etapa: q.etapa,
    vendedor: q.vendedorId ?? '',
    clienteId,
    clienteEsMagaya,
    tieneEmbarque,
    tieneOC,
    montoTotal: total,
    moneda: q.moneda ?? '',
    conceptosConNombre,
    conceptosSinConceptoId,
    fechaCreacion: q.createdAt ?? '',
    clasificacion,
    razones,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Conexión ──────────────────────────────────────────────────────────────
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`\n⚠️  Leyendo del EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST}), no de producción.`);
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
  } else {
    const ruta = process.env.SERVICE_ACCOUNT ?? new URL('../serviceAccountKey.json', import.meta.url);
    let cred;
    try {
      cred = JSON.parse(readFileSync(ruta as string, 'utf8'));
    } catch {
      console.error(`\nNo se encontró la clave de servicio en: ${ruta}`);
      console.error('Uso: SERVICE_ACCOUNT=/ruta/serviceAccountKey.json npx tsx scripts/inventarioDatosPrueba.ts');
      console.error('Emulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/inventarioDatosPrueba.ts\n');
      process.exit(1);
    }
    initializeApp({ credential: cert(cred) });
  }
  const db = getFirestore();

  // ── Lectura de colecciones ────────────────────────────────────────────────
  console.log('\nLeyendo colecciones...');

  const [provSnap, cotSnap, embSnap, ocSnap, tarSnap, cliSnap] = await Promise.all([
    db.collection('proveedores').get(),
    db.collection('cotizaciones').get(),
    db.collection('embarques').get(),
    db.collection('ordenesCompra').get(),
    db.collection('tarifas').get(),
    db.collection('clientes').get(),
  ]);

  const proveedores: Proveedor[] = [];
  provSnap.forEach(d => proveedores.push({ id: d.id, ...d.data() } as Proveedor));

  const cotizaciones: Cotizacion[] = [];
  cotSnap.forEach(d => cotizaciones.push({ id: d.id, ...d.data() } as Cotizacion));

  const embarques: Embarque[] = [];
  embSnap.forEach(d => embarques.push({ id: d.id, ...d.data() } as Embarque));

  const ordenesCompra: OrdenCompra[] = [];
  ocSnap.forEach(d => ordenesCompra.push({ id: d.id, ...d.data() } as OrdenCompra));

  interface TarifaMin { id: string; proveedorId?: string; conceptoId?: string; activo?: boolean }
  const tarifas: TarifaMin[] = [];
  tarSnap.forEach(d => tarifas.push({ id: d.id, ...d.data() } as TarifaMin));

  const clientes: Cliente[] = [];
  cliSnap.forEach(d => clientes.push({ id: d.id, ...d.data() } as Cliente));

  console.log(`  Proveedores: ${proveedores.length}`);
  console.log(`  Cotizaciones: ${cotizaciones.length}`);
  console.log(`  Embarques: ${embarques.length}`);
  console.log(`  Órdenes de compra: ${ordenesCompra.length}`);
  console.log(`  Tarifas: ${tarifas.length}`);
  console.log(`  Clientes: ${clientes.length}\n`);

  // ── Índices ───────────────────────────────────────────────────────────────
  const clientesPorId = new Map(clientes.map(c => [c.id, c]));

  const embarquesPorCotId = new Map<string, Embarque[]>();
  embarques.forEach(e => {
    if (!e.cotizacionId) return;
    const lista = embarquesPorCotId.get(e.cotizacionId) ?? [];
    lista.push(e);
    embarquesPorCotId.set(e.cotizacionId, lista);
  });

  const ocPorEmbarqueId = new Map<string, OrdenCompra[]>();
  ordenesCompra.forEach(oc => {
    if (!oc.embarqueId) return;
    const lista = ocPorEmbarqueId.get(oc.embarqueId) ?? [];
    lista.push(oc);
    ocPorEmbarqueId.set(oc.embarqueId, lista);
  });

  const tarifasPorProveedor = new Map<string, number>();
  tarifas.forEach(t => {
    if (!t.proveedorId) return;
    tarifasPorProveedor.set(t.proveedorId, (tarifasPorProveedor.get(t.proveedorId) ?? 0) + 1);
  });

  // Cotizaciones que mencionan a un proveedor en sus conceptos
  const cotsPorProveedor = new Map<string, Set<string>>();
  cotizaciones.forEach(q => {
    (q.servicios ?? []).forEach(srv => {
      (srv.conceptos ?? []).forEach(c => {
        (c.tarifas ?? []).forEach(t => {
          if (t.proveedorId) {
            const set = cotsPorProveedor.get(t.proveedorId) ?? new Set();
            set.add(q.id);
            cotsPorProveedor.set(t.proveedorId, set);
          }
        });
        // También proveedoresOficialIds → no son IDs de proveedor, son IDs de tarifa
      });
      (srv.cotizacionesProveedor ?? []).forEach(cp => {
        if (cp.proveedorId) {
          const set = cotsPorProveedor.get(cp.proveedorId) ?? new Set();
          set.add(q.id);
          cotsPorProveedor.set(cp.proveedorId, set);
        }
      });
    });
  });

  const ocPorProveedor = new Map<string, number>();
  ordenesCompra.forEach(oc => {
    if (!oc.proveedorId) return;
    ocPorProveedor.set(oc.proveedorId, (ocPorProveedor.get(oc.proveedorId) ?? 0) + 1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 1: Proveedores con nombre que empieza con «Z»
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('═'.repeat(90));
  console.log('  1. PROVEEDORES CON NOMBRE QUE EMPIEZA CON «Z»');
  console.log('═'.repeat(90));

  const provZ = proveedores
    .filter(p => p.nombre.startsWith('Z') || p.nombre.startsWith('z'))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const provZPrefijo = provZ.filter(p => /^Z\s/.test(p.nombre));
  const provZNatural = provZ.filter(p => !/^Z\s/.test(p.nombre));
  const provZActivos = provZ.filter(p => p.activo);

  console.log(`\n  Total: ${provZ.length} (${provZActivos.length} activos)`);
  console.log(`  Con prefijo «Z » (marcados por Vermur): ${provZPrefijo.length}`);
  console.log(`  Nombre natural (ZIM, ZHEJIANG, etc.): ${provZNatural.length}\n`);

  console.log(
    'ID'.padEnd(12) +
    'NOMBRE'.padEnd(42) +
    'RFC'.padEnd(16) +
    'TIPOS'.padEnd(20) +
    'ACT'.padEnd(5) +
    'TARIF'.padEnd(7) +
    'OC'.padEnd(5) +
    'COTS',
  );
  console.log('─'.repeat(110));

  const filasZ: string[][] = [];
  provZ.forEach(p => {
    const rfc = rfcEfectivo(p) ?? p.numeroEntidadMagaya ?? '';
    const nTarifas = tarifasPorProveedor.get(p.id) ?? 0;
    const nOC = ocPorProveedor.get(p.id) ?? 0;
    const nCots = cotsPorProveedor.get(p.id)?.size ?? 0;

    console.log(
      `${p.id.padEnd(12)}${p.nombre.slice(0, 40).padEnd(42)}` +
      `${(rfc || '—').slice(0, 14).padEnd(16)}${p.tipos.join(',').padEnd(20)}` +
      `${(p.activo ? 'sí' : 'no').padEnd(5)}` +
      `${String(nTarifas).padEnd(7)}${String(nOC).padEnd(5)}${nCots}`,
    );

    filasZ.push([
      p.id, p.nombre, rfc, p.tipos.join(';'), p.activo ? 'sí' : 'no',
      p.fechaAlta, String(nTarifas), String(nOC), String(nCots),
    ]);
  });

  escribirCSV('inventario-1-proveedores-z.csv', [
    'id', 'nombre', 'rfc', 'tipos', 'activo', 'fechaAlta', 'tarifas', 'ordenesCompra', 'cotizaciones',
  ], filasZ);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 2: Posibles proveedores duplicados
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('═'.repeat(90));
  console.log('  2. POSIBLES PROVEEDORES DUPLICADOS');
  console.log('═'.repeat(90));

  // Agrupar por RFC
  const porRFC = new Map<string, Proveedor[]>();
  proveedores.forEach(p => {
    const rfc = rfcEfectivo(p);
    if (!rfc) return;
    const lista = porRFC.get(rfc) ?? [];
    lista.push(p);
    porRFC.set(rfc, lista);
  });

  const dupsRFC = [...porRFC.entries()]
    .filter(([, grupo]) => grupo.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  // Agrupar por nombre normalizado
  const porNombre = new Map<string, Proveedor[]>();
  proveedores.forEach(p => {
    const norm = normalizarNombre(p.nombre);
    if (!norm) return;
    const lista = porNombre.get(norm) ?? [];
    lista.push(p);
    porNombre.set(norm, lista);
  });

  const dupsNombre = [...porNombre.entries()]
    .filter(([, grupo]) => grupo.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\n  Duplicados por RFC: ${dupsRFC.length} grupos`);
  console.log(`  Duplicados por nombre normalizado: ${dupsNombre.length} grupos\n`);

  const filasDup: string[][] = [];

  if (dupsRFC.length > 0) {
    console.log('  ── Por RFC ──');
    dupsRFC.forEach(([rfc, grupo]) => {
      console.log(`\n  RFC: ${rfc} (${grupo.length} registros)`);
      grupo.forEach(p => {
        const uso = (tarifasPorProveedor.get(p.id) ?? 0) +
                    (ocPorProveedor.get(p.id) ?? 0) +
                    (cotsPorProveedor.get(p.id)?.size ?? 0);
        console.log(`    ${p.id.padEnd(12)} ${p.nombre.slice(0, 45).padEnd(47)} act=${p.activo ? 'sí' : 'no'}  uso=${uso}`);
        filasDup.push([
          'RFC', rfc, p.id, p.nombre, p.activo ? 'sí' : 'no', String(uso),
        ]);
      });
    });
  }

  if (dupsNombre.length > 0) {
    console.log('\n  ── Por nombre normalizado ──');
    // Filtrar los que ya están en dupsRFC para no repetir
    const yaReportadosRFC = new Set<string>();
    dupsRFC.forEach(([, grupo]) => grupo.forEach(p => yaReportadosRFC.add(p.id)));

    let nuevos = 0;
    dupsNombre.forEach(([norm, grupo]) => {
      // Si todos los del grupo ya están en dupsRFC, saltear
      const sinReportar = grupo.filter(p => !yaReportadosRFC.has(p.id));
      if (sinReportar.length < 2 && grupo.length <= grupo.filter(p => yaReportadosRFC.has(p.id)).length) return;

      nuevos++;
      console.log(`\n  «${norm}» (${grupo.length} registros)`);
      grupo.forEach(p => {
        const uso = (tarifasPorProveedor.get(p.id) ?? 0) +
                    (ocPorProveedor.get(p.id) ?? 0) +
                    (cotsPorProveedor.get(p.id)?.size ?? 0);
        console.log(`    ${p.id.padEnd(12)} ${p.nombre.slice(0, 45).padEnd(47)} act=${p.activo ? 'sí' : 'no'}  uso=${uso}`);
        filasDup.push([
          'nombre', norm, p.id, p.nombre, p.activo ? 'sí' : 'no', String(uso),
        ]);
      });
    });
    if (nuevos === 0) console.log('  (todos los duplicados por nombre ya están en los de RFC)');
  }

  escribirCSV('inventario-2-duplicados.csv', [
    'criterio', 'clave', 'id', 'nombre', 'activo', 'usoTotal',
  ], filasDup);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 3: Cotizaciones y embarques — clasificación
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('═'.repeat(90));
  console.log('  3. COTIZACIONES Y EMBARQUES — CLASIFICACIÓN');
  console.log('═'.repeat(90));

  // Separar las del seed
  const cotsSeed = cotizaciones.filter(q => FOLIOS_SEED.has(q.id));
  const cotsReales = cotizaciones.filter(q => !FOLIOS_SEED.has(q.id));

  console.log(`\n  Cotizaciones de demostración (seed): ${cotsSeed.length}`);
  if (cotsSeed.length > 0) {
    cotsSeed.forEach(q => {
      console.log(`    ${q.id}  ${q.etapa.padEnd(24)} ${(q.prospecto?.empresa ?? '').slice(0, 35)}`);
    });
  }

  // Clasificar las demás
  const señales: SeñalCotizacion[] = cotsReales.map(q =>
    clasificarCotizacion(q, clientesPorId, embarquesPorCotId, ocPorEmbarqueId),
  );

  const prueba = señales.filter(s => s.clasificacion === 'prueba');
  const real = señales.filter(s => s.clasificacion === 'real');
  const noSe = señales.filter(s => s.clasificacion === 'no_se');

  console.log(`\n  Cotizaciones reales (fuera del seed): ${cotsReales.length}`);
  console.log(`    Parece prueba: ${prueba.length}`);
  console.log(`    Parece real: ${real.length}`);
  console.log(`    No sé: ${noSe.length}\n`);

  const imprimirGrupo = (titulo: string, grupo: SeñalCotizacion[]) => {
    if (grupo.length === 0) return;
    console.log(`  ── ${titulo} ──`);
    console.log(
      '  ' + 'FOLIO'.padEnd(18) + 'ETAPA'.padEnd(22) + 'EMPRESA'.padEnd(30) +
      'TOTAL'.padStart(12) + '  RAZONES',
    );
    console.log('  ' + '─'.repeat(105));
    grupo.forEach(s => {
      console.log(
        '  ' + s.folio.padEnd(18) + s.etapa.padEnd(22) +
        s.empresa.slice(0, 28).padEnd(30) +
        fmt(s.montoTotal).padStart(12) + '  ' + s.razones.join(', '),
      );
    });
    console.log('');
  };

  imprimirGrupo('Parece prueba', prueba);
  imprimirGrupo('No sé', noSe);
  imprimirGrupo('Parece real', real);

  // Embarques huérfanos (sin cotización que exista)
  const cotIds = new Set(cotizaciones.map(q => q.id));
  const embHuerfanos = embarques.filter(e => e.cotizacionId && !cotIds.has(e.cotizacionId));
  if (embHuerfanos.length > 0) {
    console.log(`  ⚠️  Embarques huérfanos (cotizacionId no existe): ${embHuerfanos.length}`);
    embHuerfanos.forEach(e => {
      console.log(`    ${e.id}  → cotizacionId: ${e.cotizacionId}`);
    });
    console.log('');
  }

  // CSV
  const filasCot: string[][] = [];
  cotsSeed.forEach(q => {
    filasCot.push([
      q.id, 'seed', q.etapa, q.prospecto?.empresa ?? '', '', '', '', '', '', '', '', '',
    ]);
  });
  señales.forEach(s => {
    filasCot.push([
      s.folio, s.clasificacion, s.etapa, s.empresa, s.vendedor, s.clienteId,
      s.clienteEsMagaya ? 'sí' : 'no', s.tieneEmbarque ? 'sí' : 'no',
      s.tieneOC ? 'sí' : 'no', fmt(s.montoTotal), s.moneda,
      s.razones.join('; '),
    ]);
  });

  escribirCSV('inventario-3-cotizaciones.csv', [
    'folio', 'clasificacion', 'etapa', 'empresa', 'vendedor', 'clienteId',
    'clienteMagaya', 'tieneEmbarque', 'tieneOC', 'montoTotal', 'moneda', 'razones',
  ], filasCot);

  // Embarques
  const filasEmb: string[][] = [];
  embarques.forEach(e => {
    const cot = cotizaciones.find(q => q.id === e.cotizacionId);
    const señal = señales.find(s => s.folio === e.cotizacionId);
    const esSeed = FOLIOS_SEED.has(e.cotizacionId ?? '');
    filasEmb.push([
      e.id, e.cotizacionId ?? '', esSeed ? 'seed' : (señal?.clasificacion ?? 'sin_cot'),
      e.estado ?? '', e.etapa ?? '', cot?.prospecto?.empresa ?? '',
    ]);
  });

  escribirCSV('inventario-3-embarques.csv', [
    'id', 'cotizacionId', 'clasificacionCot', 'estado', 'etapa', 'empresa',
  ], filasEmb);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN 4: Cruce de folios con costo manual sin moneda
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('═'.repeat(90));
  console.log('  4. CRUCE: FOLIOS CON COSTO MANUAL SIN MONEDA');
  console.log('═'.repeat(90));
  console.log('  (COT-2026-0016 confirmada como prueba por Gaby — usarla como calibración)\n');

  const filasCruce: string[][] = [];

  FOLIOS_CRUCE.forEach(folio => {
    const q = cotizaciones.find(c => c.id === folio);
    if (!q) {
      console.log(`  ${folio}: NO ENCONTRADA en la base`);
      filasCruce.push([folio, 'no_encontrada', '', '', '', '', '', '']);
      return;
    }

    const señal = clasificarCotizacion(q, clientesPorId, embarquesPorCotId, ocPorEmbarqueId);

    // Detallar los costos sin moneda
    const lineasSinMoneda: string[] = [];
    (q.servicios ?? []).forEach(srv => {
      (srv.conceptos ?? []).forEach(c => {
        const oficiales = (c.tarifas ?? []).filter(t =>
          (c.proveedoresOficialIds ?? []).includes(t.id) ||
          c.proveedorOficialId === t.id ||
          t.seleccionada,
        );
        const subs = c.subconceptos ?? [];
        if (oficiales.length === 0 && subs.length === 0 && (c.costo ?? 0) > 0) {
          lineasSinMoneda.push(`${c.nombre ?? '(sin nombre)'}: $${fmt(c.costo ?? 0)}`);
        }
      });
    });

    const esRef = folio === 'COT-2026-0016';
    const marca = esRef ? ' ← REFERENCIA (Gaby: es prueba)' : '';

    console.log(`  ${folio}  ${señal.clasificacion.toUpperCase().padEnd(8)} ${señal.empresa.slice(0, 30)}${marca}`);
    console.log(`    Etapa: ${señal.etapa} | Vendedor: ${señal.vendedor} | Cliente: ${señal.clienteId || '(ninguno)'}`);
    console.log(`    ClienteMagaya: ${señal.clienteEsMagaya ? 'sí' : 'no'} | Embarque: ${señal.tieneEmbarque ? 'sí' : 'no'} | OC: ${señal.tieneOC ? 'sí' : 'no'}`);
    console.log(`    Total: $${fmt(señal.montoTotal)} ${señal.moneda} | Conceptos: ${señal.conceptosConNombre}`);
    if (lineasSinMoneda.length > 0) {
      console.log(`    Líneas sin moneda (${lineasSinMoneda.length}):`);
      lineasSinMoneda.forEach(l => console.log(`      ${l}`));
    }
    console.log(`    Razones: ${señal.razones.join(', ')}`);
    console.log('');

    filasCruce.push([
      folio, señal.clasificacion, señal.etapa, señal.empresa, señal.vendedor,
      señal.clienteEsMagaya ? 'sí' : 'no', señal.tieneEmbarque ? 'sí' : 'no',
      señal.razones.join('; '),
    ]);
  });

  escribirCSV('inventario-4-cruce-folios.csv', [
    'folio', 'clasificacion', 'etapa', 'empresa', 'vendedor',
    'clienteMagaya', 'tieneEmbarque', 'razones',
  ], filasCruce);

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('═'.repeat(90));
  console.log('  RESUMEN');
  console.log('═'.repeat(90));
  console.log(`  Proveedores con Z:          ${provZ.length} (${provZPrefijo.length} con prefijo «Z »)`);
  console.log(`  Duplicados por RFC:         ${dupsRFC.length} grupos`);
  console.log(`  Duplicados por nombre:      ${dupsNombre.length} grupos`);
  console.log(`  Cotizaciones seed:          ${cotsSeed.length}`);
  console.log(`  Cotizaciones → prueba:      ${prueba.length}`);
  console.log(`  Cotizaciones → real:        ${real.length}`);
  console.log(`  Cotizaciones → no sé:       ${noSe.length}`);
  console.log(`  Embarques:                  ${embarques.length}`);
  if (embHuerfanos.length > 0) {
    console.log(`  Embarques huérfanos:        ${embHuerfanos.length}`);
  }
  console.log('');
  console.log('  CSVs generados:');
  console.log('    inventario-1-proveedores-z.csv');
  console.log('    inventario-2-duplicados.csv');
  console.log('    inventario-3-cotizaciones.csv');
  console.log('    inventario-3-embarques.csv');
  console.log('    inventario-4-cruce-folios.csv');
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('\nFalló el inventario:', err.message ?? err);
  process.exit(1);
});
