/**
 * monedaComparativa.ts
 *
 * Monedas en la comparativa de agentes.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 * En la operación real conviven las dos: el flete internacional en dólares y
 * los gastos nacionales en pesos (§4.3). Si un agente cotiza el flete en USD y
 * las maniobras en MXN, ¿cuál es su total? No se pueden sumar. Y sin un total
 * comparable, la comparativa entre agentes pierde sentido.
 *
 * ── La salida, y por qué no viola §4.3 ─────────────────────────────────────
 * Se convierte a una moneda de referencia PARA COMPARAR, dejando visible el
 * desglose original.
 *
 * §4.3 dice que «un total revuelto se ve creíble y es basura». El pecado es un
 * total del que no puedes saber qué mezcla. Uno que dice «USD 1,944 (incluye
 * MXN 8,000 @ 18.50)» está declarado, no revuelto.
 *
 * Y la distinción que lo hace seguro: convertir para COMPARAR no es convertir
 * para COTIZAR. Los montos guardados conservan su moneda real y el PDF al
 * cliente sale separado por moneda. La conversión vive solo aquí.
 *
 * ── Sin tasa no se inventa una ─────────────────────────────────────────────
 * Si no hay tipo de cambio, se degrada a totales separados y NO se marca un
 * menor. Poner un 18.50 por defecto sería repetir el `tasaCambio = 18.0` que
 * ya quitamos de los embarques: un número inventado que se ve como un dato.
 *
 * Lógica pura: sin React ni Firestore.
 */

export type MonedaCotizacion = 'USD' | 'MXN';

export const MONEDAS: MonedaCotizacion[] = ['USD', 'MXN'];

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de cambio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De dónde salió la tasa.
 *
 * 'pricing_rate' no es una fuente de mercado: es la que Pricing usa para
 * cotizar, con su colchón. Gabi: «Pricing cotiza con un tipo de cambio
 * distinto, para tener un colchón de ganancia. Ahorita el dólar está en 20,
 * ellos cotizan en 20.50».
 */
export type FuenteTipoCambio =
  | 'sat'
  | 'banxico'
  | 'banamex_compra'
  | 'banamex_venta'
  | 'pricing_rate'
  | 'manual';

export const ETIQUETA_FUENTE: Record<FuenteTipoCambio, string> = {
  sat:             'SAT',
  banxico:         'Banxico',
  banamex_compra:  'Banamex compra',
  banamex_venta:   'Banamex venta',
  pricing_rate:    'Pricing rate',
  manual:          'Capturado a mano',
};

export interface TipoCambioCotizacion {
  /** Cuántos MXN vale un USD. */
  valor: number;
  base: 'USD';
  destino: 'MXN';
  fuente: FuenteTipoCambio;
  /** Cuándo se fijó. Se guarda con la cotización, no se relee. */
  fecha: string;
  /** Cómo se derivó, cuando viene de una regla: «Banamex venta + 4.00». */
  reglaAplicada?: string;
}

/**
 * Regla del pricing rate.
 *
 * No es un número suelto: es una operación sobre otra tasa. «El de Pricing se
 * puede poner que sea el de Banamex más cuatro pesos o más un porcentaje para
 * que sea en automático».
 */
export interface ReglaPricingRate {
  baseFuente: Exclude<FuenteTipoCambio, 'pricing_rate' | 'manual'>;
  tipo: 'monto' | 'porcentaje';
  valor: number;
}

const redondear = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/**
 * Aplica la regla del pricing rate sobre una tasa base.
 *
 * Devuelve también la regla en texto, para que quede escrito de dónde salió el
 * número: un 20.50 sin explicación es indistinguible de uno tecleado al azar.
 */
export function aplicarReglaPricingRate(
  tasaBase: number,
  regla: ReglaPricingRate,
  fecha: string,
): TipoCambioCotizacion {
  const valor = regla.tipo === 'monto'
    ? tasaBase + regla.valor
    : tasaBase * (1 + regla.valor / 100);

  const signo = regla.valor >= 0 ? '+' : '−';
  const magnitud = Math.abs(regla.valor);
  const sufijo = regla.tipo === 'monto'
    ? `${signo} ${magnitud.toFixed(2)}`
    : `${signo} ${magnitud}%`;

  return {
    valor: redondear(valor, 4),
    base: 'USD',
    destino: 'MXN',
    fuente: 'pricing_rate',
    fecha,
    reglaAplicada: `${ETIQUETA_FUENTE[regla.baseFuente]} ${sufijo}`,
  };
}

/** ¿La tasa sirve para convertir? Una en cero o negativa no. */
export function tasaUtilizable(tc: TipoCambioCotizacion | null | undefined): boolean {
  return Boolean(tc && Number.isFinite(tc.valor) && tc.valor > 0);
}

/** Convierte respetando el sentido de la tasa (MXN por USD). */
export function convertir(
  monto: number,
  desde: MonedaCotizacion,
  hacia: MonedaCotizacion,
  tc: TipoCambioCotizacion,
): number {
  if (desde === hacia) return redondear(monto);
  return desde === 'USD'
    ? redondear(monto * tc.valor)
    : redondear(monto / tc.valor);
}

// ─────────────────────────────────────────────────────────────────────────────
// Totales de una columna
// ─────────────────────────────────────────────────────────────────────────────

export interface MontoConMoneda {
  monto: number;
  moneda: MonedaCotizacion;
}

export interface TotalComparable {
  /** Suma por moneda, sin mezclar. Siempre presente. */
  porMoneda: Record<MonedaCotizacion, number>;
  /** Las que realmente aparecen, para no pintar ceros vacíos. */
  monedasPresentes: MonedaCotizacion[];
  /**
   * Total en la moneda de referencia. null cuando hace falta convertir y no
   * hay tasa: el número no existe, y ponerlo en cero lo haría ganar.
   */
  equivalente: number | null;
  monedaReferencia: MonedaCotizacion;
  /** true si hay más de una moneda y falta la tasa. */
  requiereTipoCambio: boolean;
  /** Texto declarado: «USD 1,500 + MXN 8,000 @ 18.50». */
  detalle: string;
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Totaliza los montos de una columna.
 *
 * Con una sola moneda no hace falta tasa: el total ya es comparable. La tasa
 * solo entra cuando de verdad hay que mezclar.
 */
export function totalComparable(
  montos: MontoConMoneda[],
  monedaReferencia: MonedaCotizacion,
  tc: TipoCambioCotizacion | null | undefined,
): TotalComparable {
  const porMoneda: Record<MonedaCotizacion, number> = { USD: 0, MXN: 0 };
  montos.forEach(m => {
    if (MONEDAS.includes(m.moneda)) porMoneda[m.moneda] += m.monto;
  });
  MONEDAS.forEach(m => { porMoneda[m] = redondear(porMoneda[m]); });

  const monedasPresentes = MONEDAS.filter(m => porMoneda[m] !== 0);

  const partes = monedasPresentes.map(m => `${m} ${fmt(porMoneda[m])}`);

  // Una sola moneda (o ninguna): comparable sin convertir nada.
  if (monedasPresentes.length <= 1) {
    const unica = monedasPresentes[0];
    let equivalente = unica ? porMoneda[unica] : 0;
    let detalle = partes.join(' + ') || `${monedaReferencia} 0.00`;

    // Aun con una sola moneda, si NO es la de referencia hay que convertir
    // para poder compararla contra columnas que sí lo están.
    if (unica && unica !== monedaReferencia) {
      if (!tasaUtilizable(tc)) {
        return {
          porMoneda, monedasPresentes, equivalente: null, monedaReferencia,
          requiereTipoCambio: true,
          detalle: `${detalle} · falta tipo de cambio`,
        };
      }
      equivalente = convertir(porMoneda[unica], unica, monedaReferencia, tc!);
      detalle = `${detalle} @ ${tc!.valor}`;
    }

    return {
      porMoneda, monedasPresentes, equivalente, monedaReferencia,
      requiereTipoCambio: false, detalle,
    };
  }

  // Dos monedas: sin tasa el total no existe. No se inventa.
  if (!tasaUtilizable(tc)) {
    return {
      porMoneda, monedasPresentes, equivalente: null, monedaReferencia,
      requiereTipoCambio: true,
      detalle: `${partes.join(' + ')} · falta tipo de cambio`,
    };
  }

  const equivalente = redondear(
    MONEDAS.reduce((acc, m) =>
      acc + (porMoneda[m] === 0 ? 0 : convertir(porMoneda[m], m, monedaReferencia, tc!)), 0),
  );

  return {
    porMoneda, monedasPresentes, equivalente, monedaReferencia,
    requiereTipoCambio: false,
    detalle: `${partes.join(' + ')} @ ${tc!.valor}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparación entre columnas
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoComparacion {
  /** Clave del menor. null si no se puede determinar. */
  menorId: string | null;
  /** true si alguna columna necesita tasa y no la hay. */
  bloqueadaPorTipoCambio: boolean;
  /** Qué decirle al usuario cuando no se puede comparar. */
  motivo?: string;
}

/**
 * Determina el menor entre columnas.
 *
 * Si UNA sola columna requiere tasa, no se marca menor en ninguna. Rankear
 * parcialmente sería peor que no rankear: el ✓ aparecería sobre un subconjunto
 * y se leería como si fuera el ganador de todos.
 */
export function compararColumnas(
  totales: Record<string, TotalComparable>,
): ResultadoComparacion {
  const entradas = Object.entries(totales);
  if (entradas.length === 0) return { menorId: null, bloqueadaPorTipoCambio: false };

  const faltantes = entradas.filter(([, t]) => t.requiereTipoCambio);
  if (faltantes.length > 0) {
    return {
      menorId: null,
      bloqueadaPorTipoCambio: true,
      motivo: 'Hay montos en más de una moneda. Define el tipo de cambio para poder comparar los totales.',
    };
  }

  // Igual que en la matriz: una columna en cero no cotizó, no es la más barata.
  const conPrecio = entradas.filter(([, t]) => (t.equivalente ?? 0) > 0);
  if (conPrecio.length === 0) return { menorId: null, bloqueadaPorTipoCambio: false };

  const menor = conPrecio.reduce((mejor, actual) =>
    (actual[1].equivalente ?? 0) < (mejor[1].equivalente ?? 0) ? actual : mejor);

  return { menorId: menor[0], bloqueadaPorTipoCambio: false };
}

/** Rótulo del tipo de cambio, con su origen. */
export function etiquetaTipoCambio(tc: TipoCambioCotizacion | null | undefined): string {
  if (!tasaUtilizable(tc)) return 'Sin tipo de cambio';
  const base = `1 USD = ${tc!.valor} MXN · ${ETIQUETA_FUENTE[tc!.fuente]}`;
  return tc!.reglaAplicada ? `${base} (${tc!.reglaAplicada})` : base;
}
