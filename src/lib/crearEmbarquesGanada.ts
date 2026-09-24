/**
 * crearEmbarquesGanada.ts
 *
 * A-1. La transacción: al marcar una cotización como ganada, nacen sus
 * embarques. O caen las dos cosas, o no cae ninguna.
 *
 * ── Por qué transacción y no dos escrituras ────────────────────────────────
 * Si la cotización quedara en «ganada» y el embarque fallara, la venta estaría
 * cerrada sin nada que operar y nadie lo notaría: quien la marcó ya se fue de
 * la pantalla. Y al revés —embarque creado y cotización sin marcar— la
 * siguiente vez que alguien la marque se generaría un segundo embarque con
 * otro folio para la misma operación.
 *
 * Por eso todo va en un `runTransaction`: los contadores de serie, los
 * documentos de embarque y la cotización.
 *
 * ── Idempotencia ───────────────────────────────────────────────────────────
 * Se lee la cotización DENTRO de la transacción y, si ya trae `embarqueIds`,
 * no se genera nada. Dos clics seguidos, dos pestañas abiertas o un reintento
 * después de un error de red no producen embarques gemelos.
 *
 * ── Permisos ───────────────────────────────────────────────────────────────
 * La creación NO exige `embarque.generar`: la validó la transición a ganada,
 * que sí tiene su propia guarda. Ventas y Pricing cierran ventas y no operan
 * embarques; exigirles el permiso de Operaciones dejaría la venta a medias.
 */

import { db } from '../firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { KanbanQuote } from '../components/quotes/QuotesData';
import { ClienteVermur } from '../components/clientes/ClientesData';
import { EmbarqueCompleto } from '../components/shipments/EmbarquesData';
import { Servicio } from '../config/serviciosStore';
import { Advertencia } from './cotizacionAEmbarque';
import { construirEmbarqueDesdeCotizacion } from './generacionEmbarque';
import { planearEmbarquesDeGanada } from './planEmbarquesGanada';
import { reservarFoliosMultiSerie } from './folioService';
import { sanitizarParaFirestore } from './sanitizarFirestore';
import { exigirClienteVinculado } from './frenoCliente';

export interface ParametrosGeneracion {
  /** La cotización YA con los campos de «ganada» aplicados. */
  quote: KanbanQuote;
  /** Expediente del cliente, para poder revisarlo. null = no se pudo leer. */
  cliente: ClienteVermur | null;
  catalogoServicios: Servicio[];
  /** Quién cerró la venta. */
  generadoPor: string;
  /** Inyectable para pruebas. */
  ahora?: string;
}

export interface ResultadoGeneracion {
  embarques: EmbarqueCompleto[];
  /** true = la cotización ya tenía embarques; no se generó nada nuevo. */
  yaExistian: boolean;
  /** Ids de los embarques que quedaron ligados a la cotización. */
  embarqueIds: string[];
  /** Todas las advertencias, sin repetir las generales. */
  advertencias: Advertencia[];
  /** Series cuyo contador nunca se sembró con el consecutivo de Magaya. */
  seriesSinSembrar: string[];
}

/**
 * Genera los embarques de una cotización ganada y la deja congelada.
 *
 * Devuelve `yaExistian: true` sin escribir cuando la cotización ya tiene
 * embarques ligados.
 */
export async function crearEmbarquesDeCotizacionGanada(
  p: ParametrosGeneracion,
): Promise<ResultadoGeneracion> {
  const ahora = p.ahora ?? new Date().toISOString();
  const refCotizacion = doc(db, 'cotizaciones', p.quote.id);

  // Bloque 2a: sin cliente vinculado no nace embarque, venga por donde venga.
  exigirClienteVinculado(p.quote);
  const plan = planearEmbarquesDeGanada(p.quote, p.catalogoServicios, { cliente: p.cliente });

  return runTransaction(db, async (tx) => {
    // ── Lecturas ────────────────────────────────────────────────────────────
    // Firestore exige que todas ocurran antes de la primera escritura.
    const snapCotizacion = await tx.get(refCotizacion);
    const yaLigados = (snapCotizacion.data()?.embarqueIds as string[] | undefined) ?? [];

    if (yaLigados.length > 0) {
      return {
        embarques: [], yaExistian: true, embarqueIds: yaLigados,
        advertencias: [], seriesSinSembrar: [],
      };
    }

    const reservas = await reservarFoliosMultiSerie(tx, plan.pedidosDeFolio);

    // ── Armado ──────────────────────────────────────────────────────────────
    const usadosPorPrefijo = new Map<string, number>();
    const seriesSinSembrar = new Set<string>();
    const embarques: EmbarqueCompleto[] = [];

    plan.grupos.forEach(grupo => {
      const reserva = reservas.get(grupo.prefijo);
      const i = usadosPorPrefijo.get(grupo.prefijo) ?? 0;
      usadosPorPrefijo.set(grupo.prefijo, i + 1);

      const folio = reserva?.folios[i];
      if (!folio) {
        // No debería ocurrir: se pidió un folio por grupo. Si ocurre, es mejor
        // abortar la transacción entera que escribir un embarque sin folio.
        throw new Error(
          `No se reservó folio para la serie ${grupo.prefijo}. No se generó ningún embarque.`,
        );
      }
      if (reserva && !reserva.sembrado) seriesSinSembrar.add(grupo.prefijo);

      const advertencias: Advertencia[] = [
        ...grupo.advertencias,
        // Las generales se copian a CADA embarque: Operaciones tiene que verlas
        // abra el que abra.
        ...plan.advertenciasGenerales,
        ...(reserva && !reserva.sembrado ? [avisoContadorSinSembrar(grupo.prefijo, folio)] : []),
      ];

      embarques.push(construirEmbarqueDesdeCotizacion({
        quote: p.quote,
        folio,
        cargos: grupo.cargos,
        advertencias,
        origen: 'automatico',
        generadoPor: p.generadoPor,
        ahora,
        responsableOperativo: p.cliente?.responsableOperativo ?? null,
        modalidad: grupo.modalidad,
        servicioRuta: (p.quote.servicios ?? []).find(s => grupo.servicioIds.includes(s.id)),
        // Cada embarque hereda SOLO los productos de sus servicios: heredar
        // todos duplicaría la carga en la multimodal, igual que los cargos.
        serviciosGrupo: (p.quote.servicios ?? []).filter(s => grupo.servicioIds.includes(s.id)),
      }));
    });

    // ── Escrituras ──────────────────────────────────────────────────────────
    embarques.forEach(e => {
      tx.set(doc(db, 'embarques', e.id), sanitizarParaFirestore(e));
    });

    const embarqueIds = embarques.map(e => e.id);
    tx.set(refCotizacion, sanitizarParaFirestore({
      ...p.quote,
      embarqueIds,
    }), { merge: true });

    return {
      embarques,
      yaExistian: false,
      embarqueIds,
      advertencias: [
        ...plan.grupos.flatMap(g => g.advertencias),
        ...plan.advertenciasGenerales,
      ],
      seriesSinSembrar: [...seriesSinSembrar],
    };
  });
}

function avisoContadorSinSembrar(prefijo: string, folio: string): Advertencia {
  return {
    tipo: 'contador_sin_sembrar',
    lineaId: '',
    concepto: '',
    detalle: `El contador de la serie ${prefijo} nunca se sembró con el último consecutivo de Magaya, así que este folio (${folio}) puede duplicar uno histórico. Se siembra en Configuración → Contadores de folio.`,
  };
}
