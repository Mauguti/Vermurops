/**
 * sembrarFolios.ts — deja cada contador de serie en el ÚLTIMO folio usado.
 *
 * EN SECO POR DEFECTO. Sin `--aplicar` no escribe nada.
 *
 * Uso:
 *   npx tsx scripts/sembrarFolios.ts
 *   SERVICE_ACCOUNT=ruta/llave.json npx tsx scripts/sembrarFolios.ts --aplicar
 *   (contra emuladores: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080)
 *
 * Los números son la captura de Luis del 13-oct. Cada contador guarda `ultimo`,
 * así que el SIGUIENTE folio que emita la plataforma es `ultimo + 1`.
 *
 * ── Lo que NO hace, a propósito ──────────────────────────────────────────
 *   · **No crea la serie VLWHP.** Apareció en la captura de Luis y no está en
 *     `SERIES_EMBARQUE`; inventarla aquí dejaría una serie que el editor de
 *     folios no conoce y cuyo tráfico `traficoDeFolio` no sabe leer (§4.31).
 *     Espera a que Luis confirme qué es.
 *   · **No toca VLET**, que no vino en la captura. Un contador sin sembrar
 *     avisa en el embarque pero no bloquea (§4.15): es mejor el aviso que un
 *     número inventado.
 *   · **No enciende la creación automática de embarques.** Ese interruptor
 *     vive en `contadores/configuracionEmbarques` y se queda apagado.
 *   · **No escribe formato.** `VLIM-26-320` ES el formato predeterminado
 *     (separador «-», año a dos dígitos, tres dígitos), así que escribirlo
 *     solo agregaría un campo que el código ya asume.
 *   · **No BAJA un contador.** Si el de producción ya va más alto que la
 *     captura, bajarlo volvería a emitir folios que ya están impresos en un
 *     BL y en un pedimento. Se reporta y no se toca.
 *
 * ⚠️ **El consecutivo NO reinicia en enero, y hoy no hay nada que lo haga.**
 * Mau pidió que reinicie en 001 cada enero; eso no está construido (§4.31):
 * `ultimo` es un entero por serie que no mira el año, así que en enero de 2027
 * el siguiente folio sería `VLIM-27-321`, no `VLIM-27-001`. Hacerlo solo
 * exige un contador por año y serie, y es otra tarea. Mientras no exista, en
 * enero hay que volver a correr esto con `--reiniciar`.
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { armarFolioSerie, type FormatoFolioSerie } from '../src/lib/formatoFolioSerie';

const APLICAR = process.argv.includes('--aplicar');
/** Para enero: deja los contadores en 0 en vez del último usado. */
const REINICIAR = process.argv.includes('--reiniciar');

/**
 * Captura de Luis, 13-oct-2026. Solo las cinco que conocemos.
 * VLWHP (032) y VLET quedan fuera: ver el encabezado.
 */
const ULTIMOS: Record<string, number> = {
  VLIM: 320,
  VLIT: 201,
  VLIA: 28,
  VLEM: 3,
  VLEA: 39,
};

/** Las que el sistema conoce (`SERIES_EMBARQUE` en lib/folioService.ts). */
const SERIES_CONOCIDAS = ['VLIM', 'VLEM', 'VLIT', 'VLET', 'VLIA', 'VLEA', 'VL'];

/**
 * Cómo quedaría el siguiente folio.
 *
 * Usa `armarFolioSerie`, el de la plataforma, y no una copia: una segunda
 * fuente de verdad para el formato haría que este script enseñara
 * `VLIM-26-321` mientras la app emite otra cosa, y el folio va impreso.
 *
 * Se le pasa el `formato` GUARDADO de cada serie (tarea 66): si alguien lo
 * personalizó por pantalla, la vista previa tiene que decir lo que la app va
 * a emitir, no lo que dice el predeterminado.
 *
 * Es `armarFolioSerie` y no `formatFolioSerie` porque esa envoltura vive en
 * `folioService.ts`, que importa el SDK de cliente y la configuración de
 * Firebase: traerla a un script de Node conectaría a producción de lado.
 */
function folio(prefijo: string, n: number, formato?: Partial<FormatoFolioSerie> | null): string {
  return armarFolioSerie(prefijo, n, new Date().getFullYear(), formato);
}

function inicializar() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'vermur-logistics-app' });
    console.log(`🔌 Emulador: ${process.env.FIRESTORE_EMULATOR_HOST}`);
    return;
  }
  const ruta = process.env.SERVICE_ACCOUNT;
  if (!ruta) {
    console.error('\nFalta SERVICE_ACCOUNT=/ruta/a/llave.json (o FIRESTORE_EMULATOR_HOST).\n');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(ruta, 'utf-8'))) });
}

async function main() {
  console.log(`\n═════════ SEMBRAR CONTADORES DE FOLIO ${APLICAR ? '· APLICAR' : '· EN SECO'}${REINICIAR ? ' · REINICIAR A 0' : ''} ═════════\n`);

  for (const s of Object.keys(ULTIMOS)) {
    if (!SERIES_CONOCIDAS.includes(s)) {
      console.error(`La serie «${s}» no está en SERIES_EMBARQUE. Se aborta para no inventar una serie.`);
      process.exit(1);
    }
  }

  inicializar();
  const db = getFirestore();

  interface Fila {
    serie: string; antes: number | null; sembradoAntes: boolean; destino: number; accion: string;
    formato?: Partial<FormatoFolioSerie> | null;
  }
  const filas: Fila[] = [];

  for (const [serie, capturado] of Object.entries(ULTIMOS)) {
    const ref = db.collection('contadores').doc(`embarques_${serie}`);
    const snap = await ref.get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
    const antes = data && typeof data.ultimo === 'number' ? data.ultimo : null;
    const sembradoAntes = Boolean(data?.sembrado);
    const destino = REINICIAR ? 0 : capturado;

    let accion: string;
    if (antes === null) accion = 'se siembra';
    else if (antes === destino) accion = 'ya está ahí';
    else if (antes > destino && !REINICIAR) accion = '⛔ NO se toca: producción va MÁS ALTO';
    else accion = 'se sube';

    filas.push({
      serie, antes, sembradoAntes, destino, accion,
      formato: (data?.formato as Partial<FormatoFolioSerie> | undefined) ?? null,
    });
  }

  console.log('  SERIE   ANTES   QUEDA EN   SIGUIENTE FOLIO     QUÉ PASA');
  console.log('  ' + '─'.repeat(74));
  for (const f of filas) {
    const toca = f.accion === 'se siembra' || f.accion === 'se sube';
    const queda = toca ? f.destino : (f.antes ?? f.destino);
    console.log(
      `  ${f.serie.padEnd(7)} ${String(f.antes ?? '—').padStart(5)}   ${String(queda).padStart(8)}   ${folio(f.serie, queda + 1, f.formato).padEnd(19)} ${f.accion}`,
    );
  }

  const masAlto = filas.filter(f => f.accion.startsWith('⛔'));
  if (masAlto.length) {
    console.log('\n  ⛔ Estas series ya van MÁS ALTO que la captura del 13-oct.');
    console.log('     Bajarlas volvería a emitir folios que ya están impresos en un BL');
    console.log('     y en un pedimento, así que NO se tocan. Revisa la captura con Luis:');
    masAlto.forEach(f => console.log(`       ${f.serie}: producción ${f.antes} vs captura ${f.destino}`));
  }

  const faltantes = SERIES_CONOCIDAS.filter(s => !(s in ULTIMOS));
  console.log(`\n  Sin sembrar (no vinieron en la captura): ${faltantes.join(', ')}`);
  console.log('  Fuera a propósito: VLWHP (serie nueva, la confirma Luis).');
  console.log('  La creación automática de embarques NO se toca: sigue apagada.');

  if (!APLICAR) {
    console.log('\n  ℹ️  EN SECO: no se escribió nada. Para aplicar, agrega --aplicar.\n');
    return;
  }

  const porEscribir = filas.filter(f => f.accion === 'se siembra' || f.accion === 'se sube');
  if (porEscribir.length === 0) {
    console.log('\n  Nada que escribir.\n');
    return;
  }

  const quien = process.env.USER ?? 'script';
  for (const f of porEscribir) {
    /*
     * `merge: true` conserva el `formato` que alguien haya configurado por
     * pantalla: esto siembra el consecutivo, no reescribe la serie.
     */
    await db.collection('contadores').doc(`embarques_${f.serie}`).set({
      ultimo: f.destino,
      sembrado: true,
      sembradoPor: quien,
      sembradoEn: new Date().toISOString(),
      sembradoDesde: REINICIAR ? 'reinicio de año' : 'captura de Luis del 13-oct-2026',
    }, { merge: true });
    console.log(`  ✅ ${f.serie} → ultimo ${f.destino} · el siguiente será ${folio(f.serie, f.destino + 1, f.formato)}`);
  }

  console.log(`\n  ${porEscribir.length} contador(es) sembrado(s).`);
  console.log('  ⚠️  Recuerda: el consecutivo NO reinicia solo en enero (§4.31).');
  console.log('      En enero hay que correr esto otra vez con --reiniciar.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
