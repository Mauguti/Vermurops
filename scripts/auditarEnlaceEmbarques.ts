/**
 * auditarEnlaceEmbarques.ts — SOLO LECTURA
 *
 * ¿Cuántas cotizaciones tienen embarque abierto pero NO lo saben?
 *
 * ── El bug que audita (9-sep-2026) ─────────────────────────────────────────
 * La ruta manual de apertura de embarques —la única que se usa hoy, con
 * EMBARQUE_AUTOMATICO_DISPONIBLE en false— no escribía `embarqueIds` de vuelta
 * en la cotización. Como `estaCongelada` evalúa exactamente ese campo, esas
 * cotizaciones siguen EDITABLES: alguien puede cambiar un concepto y hacer que
 * cotización y embarque digan cosas distintas, que es lo que §4.8 prohíbe.
 *
 * El código ya está arreglado para los embarques nuevos. Esto mide el pasado.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No escribe nada. Imprime qué repararía y con qué valor, para decidir si se
 * repara en bloque o caso por caso. La reparación va aparte y con aviso.
 *
 * Uso (producción, SOLO LECTURA):
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx tsx scripts/auditarEnlaceEmbarques.ts
 *
 * Contra emuladores, sin credenciales:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/auditarEnlaceEmbarques.ts
 *
 * ⚠️ Los otros scripts de auditoría documentan `npx vite-node`, que NO está
 * instalado en el proyecto (solo `tsx`). Corregir esa documentación es
 * trabajo aparte, anotado.
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface CotizacionMin {
  id: string;
  etapa?: string;
  estadoFinal?: string | null;
  embarqueIds?: string[] | null;
  prospecto?: { empresa?: string };
  updatedAt?: string;
}

interface EmbarqueMin {
  id: string;
  folio?: string;
  cotizacionId?: string | null;
  createdAt?: string;
}

type Caso =
  /** Tiene embarques y el enlace está completo. Nada que hacer. */
  | 'enlazada'
  /** Tiene embarques abiertos y NINGÚN enlace: editable cuando no debería. */
  | 'sin_enlace'
  /** Tiene enlace pero le faltan embarques: el caso multimodal a medias. */
  | 'enlace_parcial'
  /** El enlace apunta a embarques que ya no existen. */
  | 'enlace_huerfano'
  /** Sin embarques. Normal. */
  | 'sin_embarques';

async function main() {
  /*
   * Contra el emulador no hace falta credencial: el SDK de admin la ignora
   * cuando FIRESTORE_EMULATOR_HOST está puesto. Eso permite probar el script
   * sin acercarse a producción.
   */
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(`\n⚠️  Leyendo del EMULADOR (${process.env.FIRESTORE_EMULATOR_HOST}), no de producción.`);
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
  } else {
    const ruta = process.env.SERVICE_ACCOUNT ?? new URL('../serviceAccountKey.json', import.meta.url);
    let cred;
    try {
      cred = JSON.parse(readFileSync(ruta as string, 'utf8'));
    } catch {
      console.error(`\nNo se encontró la clave de servicio en: ${ruta}\n`);
      console.error('Uso: SERVICE_ACCOUNT=/ruta/serviceAccountKey.json npx tsx scripts/auditarEnlaceEmbarques.ts\n');
      process.exit(1);
    }
    initializeApp({ credential: cert(cred) });
  }
  const db = getFirestore();

  const [snapCot, snapEmb] = await Promise.all([
    db.collection('cotizaciones').get(),
    db.collection('embarques').get(),
  ]);

  const cotizaciones: CotizacionMin[] = [];
  snapCot.forEach(d => cotizaciones.push({ id: d.id, ...d.data() } as CotizacionMin));

  const embarques: EmbarqueMin[] = [];
  snapEmb.forEach(d => embarques.push({ id: d.id, ...d.data() } as EmbarqueMin));

  /*
   * Se agrupa por cotización, no se busca el primero: una cotización
   * multimodal genera VARIOS embarques y el enlace tiene que traerlos todos.
   * Reconstruir solo el primero dejaría el resto invisible desde la ficha, que
   * es la mitad del problema que se está arreglando.
   */
  const porCotizacion = new Map<string, EmbarqueMin[]>();
  let sinCotizacion = 0;
  embarques.forEach(e => {
    if (!e.cotizacionId) { sinCotizacion++; return; }
    const lista = porCotizacion.get(e.cotizacionId) ?? [];
    lista.push(e);
    porCotizacion.set(e.cotizacionId, lista);
  });

  const idsExistentes = new Set(embarques.map(e => e.id));
  const conteo: Record<Caso, number> = {
    enlazada: 0, sin_enlace: 0, enlace_parcial: 0, enlace_huerfano: 0, sin_embarques: 0,
  };
  const aReparar: { cot: CotizacionMin; caso: Caso; actual: string[]; deberia: string[] }[] = [];

  cotizaciones.forEach(c => {
    const suyos = porCotizacion.get(c.id) ?? [];
    const enlace = c.embarqueIds ?? [];

    if (suyos.length === 0) {
      // Sin embarques: solo interesa si el enlace apunta a algo que no existe.
      const huerfanos = enlace.filter(id => !idsExistentes.has(id));
      if (huerfanos.length > 0) {
        conteo.enlace_huerfano++;
        aReparar.push({ cot: c, caso: 'enlace_huerfano', actual: enlace, deberia: [] });
      } else {
        conteo.sin_embarques++;
      }
      return;
    }

    const deberia = suyos.map(e => e.id).sort();
    const faltantes = deberia.filter(id => !enlace.includes(id));

    if (faltantes.length === 0) {
      conteo.enlazada++;
      return;
    }

    const caso: Caso = enlace.length === 0 ? 'sin_enlace' : 'enlace_parcial';
    conteo[caso]++;
    aReparar.push({ cot: c, caso, actual: [...enlace].sort(), deberia });
  });

  // ── Reporte ───────────────────────────────────────────────────────────────
  console.log('\n§4.8 · Cotizaciones con embarque abierto que no lo saben\n');
  console.log(`  Cotizaciones revisadas: ${cotizaciones.length}`);
  console.log(`  Embarques revisados:    ${embarques.length}`);
  if (sinCotizacion > 0) {
    console.log(`  Embarques sin cotizacionId (capturados a mano): ${sinCotizacion}`);
  }
  console.log('');
  console.log(`  ✅ Enlazadas correctamente:      ${conteo.enlazada}`);
  console.log(`  ⚠️  SIN enlace (editables):       ${conteo.sin_enlace}`);
  console.log(`  ⚠️  Enlace parcial (multimodal):  ${conteo.enlace_parcial}`);
  console.log(`  ⚠️  Enlace a embarque inexistente: ${conteo.enlace_huerfano}`);
  console.log(`     Sin embarques (normal):       ${conteo.sin_embarques}`);

  if (aReparar.length === 0) {
    console.log('\n  Nada que reparar.\n');
    return;
  }

  console.log(`\n  ── Detalle de las ${aReparar.length} a revisar ──\n`);
  aReparar
    .sort((a, b) => a.caso.localeCompare(b.caso) || a.cot.id.localeCompare(b.cot.id))
    .forEach(({ cot, caso, actual, deberia }) => {
      const empresa = cot.prospecto?.empresa ?? '(sin empresa)';
      console.log(`  ${cot.id}  ${caso.toUpperCase()}`);
      console.log(`     ${empresa} · etapa ${cot.etapa ?? '—'}${cot.estadoFinal ? ` · ${cot.estadoFinal}` : ''}`);
      console.log(`     embarqueIds actual:  [${actual.join(', ') || '—'}]`);
      console.log(`     embarqueIds debería: [${deberia.join(', ') || '—'}]`);
      if (deberia.length > 1) {
        console.log(`     ⚠️  MULTIMODAL: ${deberia.length} embarques. El enlace debe traerlos todos.`);
      }
      console.log('');
    });

  const multimodales = aReparar.filter(r => r.deberia.length > 1).length;
  console.log('  ── Para decidir ──');
  console.log(`  · ${conteo.sin_enlace + conteo.enlace_parcial} cotización(es) editables que no deberían serlo.`);
  if (multimodales > 0) {
    console.log(`  · ${multimodales} son multimodales: reparar solo el primer embarque las dejaría a medias.`);
  }
  if (conteo.enlace_huerfano > 0) {
    console.log(`  · ${conteo.enlace_huerfano} apuntan a embarques borrados: ESAS no se reparan a ciegas,`);
    console.log('    porque vaciar el enlace descongelaría una cotización a propósito. Caso por caso.');
  }
  console.log('');
}

main().catch(err => {
  console.error('\nFalló la auditoría:', err);
  process.exit(1);
});
