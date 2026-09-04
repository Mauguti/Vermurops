/**
 * seleccionMatriz.ts
 *
 * La selección de proveedor por CELDA en la comparativa (4-sep-2026).
 *
 * ── Los dos casos del negocio ──────────────────────────────────────────────
 * CASO A — un agente cotiza el paquete completo y se compara el total
 * (Gabi: «el más barato es el de Sunway con Hapag-Lloyd por 2200 en total»).
 * CASO B — cada concepto lo maneja un proveedor de giro distinto: flete con
 * la naviera, maniobras con la terminal, despacho con el agente aduanal.
 * Ni siquiera compiten entre sí.
 *
 * La matriz solo soportaba el A. Este módulo agrega el B sin quitarle el A, y
 * la clave es dónde vive la elección: NO hay estado de selección propio de la
 * matriz. Elegir una celda marca la tarifa de ese agente como seleccionada en
 * `concepto.tarifas` —el mismo mecanismo que `elegirAgente` usa columna por
 * columna, y el mismo modelo por-concepto de la comparativa original CP-1..4—
 * y las marcas visuales SE DERIVAN de ahí. Sin estado paralelo no hay
 * desincronización posible (la lección de §6), y la selección persiste al
 * recargar porque es dato.
 *
 * Ruta B (costos a nivel servicio) queda fuera hasta la unificación de §6b:
 * no tiene conceptos donde anclar una elección por fila.
 *
 * Lógica pura: sin React ni Firestore.
 */

import { KanbanQuote, getTarifasOficiales } from '../components/quotes/QuotesData';
import { claveAgente, MatrizComparativa, FilaMatriz } from './matrizComparativa';
import {
  totalComparable, TotalComparable, MontoConMoneda,
  MonedaCotizacion, TipoCambioCotizacion,
} from './monedaComparativa';

// ─── Elegir y des-elegir una celda ────────────────────────────────────────────

/**
 * Marca la tarifa de `agenteId` como la elegida del concepto de esa fila.
 *
 * Mismo cuerpo que `elegirAgente`, acotado a UN concepto. Si la celda ya
 * estaba elegida, la DES-elige: volver a "sin proveedor" es una decisión
 * válida y el clic repetido es su gesto natural.
 *
 * Se niega sin ruido cuando no hay qué elegir: fila inexistente, agente que
 * no cotizó ese concepto, o monto en cero — no cotizar no es ser barato.
 */
export function elegirCelda(
  quote: KanbanQuote,
  servicioId: string,
  /** El id de la FILA de la matriz (`srv::concepto`) o el del concepto pelón. */
  filaId: string,
  agenteId: string,
): KanbanQuote {
  return {
    ...quote,
    servicios: (quote.servicios ?? []).map(srv => {
      if (srv.id !== servicioId) return srv;
      return {
        ...srv,
        conceptos: (srv.conceptos ?? []).map(c => {
          // La fila de la matriz usa el id compuesto de la línea plana.
          if (c.id !== filaId && `${srv.id}::${c.id}` !== filaId) return c;

          const suya = (c.tarifas ?? []).find(
            t => claveAgente(t) === agenteId && t.monto > 0,
          );
          if (!suya) return c;

          const yaElegida = (c.proveedoresOficialIds ?? []).length === 1
            && c.proveedoresOficialIds![0] === suya.id;

          if (yaElegida) {
            // Des-elegir: el concepto queda sin proveedor elegido.
            return {
              ...c,
              proveedoresOficialIds: [],
              tarifas: (c.tarifas ?? []).map(t => ({ ...t, seleccionada: false })),
            };
          }

          return {
            ...c,
            proveedoresOficialIds: [suya.id],
            tarifas: (c.tarifas ?? []).map(t => ({
              ...t,
              seleccionada: t.id === suya.id,
            })),
          };
        }),
      };
    }),
  };
}

// ─── Derivar qué está elegido ─────────────────────────────────────────────────

export interface SeleccionMatriz {
  /** filaId → agenteId elegido. Ausente/null = fila sin elegir. */
  porFila: Record<string, string | null>;
  /**
   * Filas cuya selección reparte entre VARIOS agentes (multi-selección del
   * simulador). Ninguna celda sola la representa: no se marca ninguna.
   */
  combinadas: string[];
}

/**
 * Lee la selección desde los datos. La matriz nunca guarda la suya.
 */
export function derivarSeleccion(
  matriz: MatrizComparativa,
  quote: KanbanQuote,
): SeleccionMatriz {
  const porFila: Record<string, string | null> = {};
  const combinadas: string[] = [];

  matriz.filas.filter(f => f.tipo === 'importe').forEach(fila => {
    const srv = (quote.servicios ?? []).find(s => s.id === fila.servicioId);
    const concepto = (srv?.conceptos ?? []).find(
      c => c.id === fila.id || `${srv!.id}::${c.id}` === fila.id);
    if (!concepto) { porFila[fila.id] = null; return; }

    const oficiales = getTarifasOficiales(concepto);
    if (oficiales.length === 0) { porFila[fila.id] = null; return; }

    const agentes = [...new Set(oficiales.map(t => claveAgente(t)))];
    if (agentes.length === 1) {
      porFila[fila.id] = agentes[0];
    } else {
      porFila[fila.id] = null;
      combinadas.push(fila.id);
    }
  });

  return { porFila, combinadas };
}

/**
 * El agente "paquete": el que tiene la MAYORÍA ESTRICTA de las filas
 * elegidas. Con él, la UI distingue la excepción — la fila que se salió del
 * paquete — de la elección pareja donde no hay paquete que romper.
 *
 * Empate o nada elegido → null: sin dominante no hay excepciones, todas las
 * elecciones se pintan iguales.
 */
export function agenteDominante(seleccion: SeleccionMatriz): string | null {
  const conteo = new Map<string, number>();
  let elegidas = 0;
  Object.values(seleccion.porFila).forEach(a => {
    if (!a) return;
    elegidas++;
    conteo.set(a, (conteo.get(a) ?? 0) + 1);
  });
  if (elegidas === 0) return null;

  const [mejor, cuantas] = [...conteo.entries()].sort((x, y) => y[1] - x[1])[0];
  return cuantas * 2 > elegidas ? mejor : null;
}

// ─── El menor por fila ────────────────────────────────────────────────────────

/**
 * El agente más barato de CADA fila — lo que importa cuando se elige concepto
 * por concepto (caso B). Cero y ausente no juegan; con monedas distintas en
 * la misma fila no se compara sin tipo de cambio y se devuelve null, la misma
 * regla de las columnas.
 */
export function menorPorFila(matriz: MatrizComparativa): Record<string, string | null> {
  const r: Record<string, string | null> = {};
  matriz.filas.filter(f => f.tipo === 'importe').forEach(fila => {
    const conPrecio = Object.entries(fila.celdas)
      .filter(([, v]) => (v ?? 0) > 0);
    if (conPrecio.length < 2) { r[fila.id] = null; return; }  // sin rival no hay "menor"

    const monedas = new Set(conPrecio.map(([a]) => fila.monedas?.[a] ?? 'USD'));
    if (monedas.size > 1) { r[fila.id] = null; return; }

    r[fila.id] = conPrecio.sort((a, b) => (a[1] as number) - (b[1] as number))[0][0];
  });
  return r;
}

// ─── El resumen del encabezado ────────────────────────────────────────────────

export interface ResumenSeleccion {
  /** Filas de importe que existen y cuántas tienen elección. */
  filasImporte: number;
  elegidas: number;
  sinElegir: number;
  /** Ids de agentes distintos entre lo elegido. */
  agentes: string[];
  /**
   * «Sunway» con un solo agente; «3 proveedores» repartido; null sin nada
   * elegido. El nombre lo resuelve la UI con matriz.agentes.
   */
  etiqueta: { tipo: 'unico'; agenteId: string } | { tipo: 'mixto'; cuantos: number } | null;
  /** Total de las celdas elegidas. Por moneda, nunca mezclado (§4.3). */
  total: TotalComparable;
}

export function resumenSeleccion(
  matriz: MatrizComparativa,
  seleccion: SeleccionMatriz,
  monedaReferencia: MonedaCotizacion,
  tipoCambio: TipoCambioCotizacion | null | undefined,
): ResumenSeleccion {
  const filas = matriz.filas.filter(f => f.tipo === 'importe');
  const montos: MontoConMoneda[] = [];
  const agentes = new Set<string>();
  let elegidas = 0;

  filas.forEach(fila => {
    const agente = seleccion.porFila[fila.id];
    const combinada = seleccion.combinadas.includes(fila.id);
    if (!agente && !combinada) return;
    elegidas++;

    if (agente) {
      agentes.add(agente);
      const monto = fila.celdas[agente];
      if ((monto ?? 0) > 0) {
        montos.push({ monto: monto as number, moneda: fila.monedas?.[agente] ?? 'USD' });
      }
    }
    // Las combinadas suman su costo real río abajo (costoDeConcepto); aquí no
    // hay UNA celda que las represente y no se inventa.
  });

  const etiqueta: ResumenSeleccion['etiqueta'] =
    elegidas === 0 ? null
    : agentes.size === 1 ? { tipo: 'unico', agenteId: [...agentes][0] }
    : { tipo: 'mixto', cuantos: agentes.size };

  return {
    filasImporte: filas.length,
    elegidas,
    sinElegir: filas.length - elegidas,
    agentes: [...agentes],
    etiqueta,
    total: totalComparable(montos, monedaReferencia, tipoCambio),
  };
}
