/**
 * auditarClienteEnGanadasYEmbarques.ts — SOLO LECTURA (Bloque 2, 25-sep-2026).
 *
 * Tres conteos sobre producción, sin escribir nada:
 *   1. cotizaciones ganadas sin clienteId (siguen apuntando al prospecto)
 *   2. embarques sin cliente (entidadesRef.clienteCobrar vacío: el embarque
 *      no tiene clienteId, refiere al cliente por entidadesRef, §4.12)
 *   3. embarques cuyo cliente apunta a un cliente que hoy NO pasaría la
 *      revisión de expediente: sin RFC, sin validadoFiscalmente, o con
 *      expediente digital incompleto. No existe un campo «expediente
 *      validado» (ver reporte del Bloque 2): se usan los tres indicadores
 *      que sí existen y se reporta cada uno por separado.
 *
 * Solo `collection().get()` y lecturas por id. Ningún set, update ni delete.
 *
 * Uso:
 *   SERVICE_ACCOUNT=/ruta/serviceAccountKey.json \
 *     npx vite-node scripts/auditarClienteEnGanadasYEmbarques.ts
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { KanbanQuote } from '../src/components/quotes/QuotesData';
import type { ClienteVermur } from '../src/components/clientes/ClientesData';
import type { EmbarqueCompleto as Embarque } from '../src/components/shipments/EmbarquesData';

/** El embarque NO tiene clienteId: refiere al cliente por entidadesRef.clienteCobrar (§4.12). */
const clienteDe = (e: Embarque): string | null => e.entidadesRef?.clienteCobrar?.id ?? null;
import { estadoChecklist, type TipoDocExpediente } from '../src/lib/clasificacionDocumentos';

const TIPOS_EXPEDIENTE: TipoDocExpediente[] = [
  'acta_constitutiva', 'poder_notarial', 'identificacion_oficial',
  'constancia_situacion_fiscal', 'comprobante_domicilio', 'caratula_bancaria',
];
/** Documentos del expediente digital que faltan (estado «pendiente»). */
function faltantesExpediente(c: ClienteVermur): TipoDocExpediente[] {
  return TIPOS_EXPEDIENTE.filter(t => estadoChecklist(c.expediente, t) === 'pendiente');
}

async function main() {
  const ruta = process.env.SERVICE_ACCOUNT ?? new URL('../serviceAccountKey.json', import.meta.url);
  let cred;
  try {
    cred = JSON.parse(readFileSync(ruta as string, 'utf8'));
  } catch {
    console.error(`\nNo se encontró la clave de servicio en: ${ruta}\n`);
    process.exit(1);
  }
  initializeApp({ credential: cert(cred) });
  const db = getFirestore();

  const leer = async <T,>(col: string): Promise<(T & { __id: string })[]> => {
    const snap = await db.collection(col).get();
    const out: (T & { __id: string })[] = [];
    snap.forEach(d => out.push({ __id: d.id, ...(d.data() as T) }));
    return out;
  };

  const [cotizaciones, embarques, clientes] = await Promise.all([
    leer<KanbanQuote>('cotizaciones'), leer<Embarque>('embarques'), leer<ClienteVermur>('clientes'),
  ]);
  const clientePorId = new Map(clientes.map(c => [c.__id, c]));

  console.log(`\nProducción: ${cotizaciones.length} cotizaciones · ${embarques.length} embarques · ${clientes.length} clientes\n`);

  // 1 · ganadas sin clienteId
  const ganadas = cotizaciones.filter(q => q.etapa === 'ganada');
  const ganadasSinCliente = ganadas.filter(q => !q.clienteId);
  console.log(`1 · Cotizaciones ganadas: ${ganadas.length} · sin clienteId: ${ganadasSinCliente.length}`);
  ganadasSinCliente.forEach(q => console.log(`   · ${q.__id} — ${q.prospecto?.empresa ?? '(sin empresa)'} — embarques: ${(q.embarqueIds ?? []).join(', ') || 'ninguno'}`));

  // 2 · embarques sin clienteId
  const sinCliente = embarques.filter(e => !clienteDe(e));
  console.log(`\n2 · Embarques sin cliente (entidadesRef.clienteCobrar): ${sinCliente.length} de ${embarques.length}`);
  sinCliente.forEach(e => console.log(`   · ${e.__id} (${e.folio ?? '?'}) — ${e.entidades?.clienteCobrar || '(sin nombre)'} — cotización ${e.cotizacionId ?? '—'}`));

  // 3 · embarques con cliente que no pasa la revisión
  const conCliente = embarques.filter(e => clienteDe(e));
  const huerfanos: string[] = [];
  const sinRfc: string[] = [];
  const sinValidacionFiscal: string[] = [];
  const expedienteIncompleto: string[] = [];
  for (const e of conCliente) {
    const idCliente = clienteDe(e)!;
    const c = clientePorId.get(idCliente);
    const etiqueta = `${e.__id} (${e.folio ?? '?'}) → ${idCliente}`;
    if (!c) { huerfanos.push(etiqueta); continue; }
    if (!c.rfc?.trim()) sinRfc.push(`${etiqueta} — ${c.nombre}`);
    if (c.validadoFiscalmente !== true) sinValidacionFiscal.push(`${etiqueta} — ${c.nombre}`);
    const faltan = faltantesExpediente(c);
    if (faltan.length > 0) expedienteIncompleto.push(`${etiqueta} — ${c.nombre} — faltan: ${faltan.join(', ')}`);
  }
  console.log(`\n3 · Embarques con cliente: ${conCliente.length}`);
  console.log(`   3a · clienteId que no existe en clientes/: ${huerfanos.length}`);
  huerfanos.forEach(x => console.log(`      · ${x}`));
  console.log(`   3b · cliente sin RFC: ${sinRfc.length}`);
  sinRfc.forEach(x => console.log(`      · ${x}`));
  console.log(`   3c · cliente sin validadoFiscalmente: ${sinValidacionFiscal.length}`);
  sinValidacionFiscal.forEach(x => console.log(`      · ${x}`));
  console.log(`   3d · cliente con expediente digital incompleto: ${expedienteIncompleto.length}`);
  expedienteIncompleto.forEach(x => console.log(`      · ${x}`));

  // Contexto: cuántos clientes en total pasarían/no pasarían
  const clientesSinRfc = clientes.filter(c => !c.rfc?.trim()).length;
  const clientesSinValidacion = clientes.filter(c => c.validadoFiscalmente !== true).length;
  console.log(`\nContexto clientes/: sin RFC ${clientesSinRfc} · sin validadoFiscalmente ${clientesSinValidacion} · de ${clientes.length}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
