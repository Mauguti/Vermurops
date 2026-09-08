/**
 * auditarSumasDeDinero.ts
 *
 * Busca sumas de dinero que no miran la moneda. §4.3 del CLAUDE.md.
 *
 * ── Por qué es un script y no un test ──────────────────────────────────────
 * El bug no es un caso que falle: es una FORMA de escribir que compila, pasa
 * los tests y produce un número creíble. Solo se detecta leyendo el código, y
 * leer 60 `reduce` a mano es justo lo que nadie hace.
 *
 * Marca los `reduce` que acumulan un campo con pinta de dinero sin que la
 * moneda aparezca cerca. Es una heurística: acierta de más, no de menos. Cada
 * hallazgo se revisa; los legítimos se anotan en LEGITIMOS con su motivo.
 *
 *   npx tsx scripts/auditarSumasDeDinero.ts
 */

import * as fs from 'fs';
import * as path from 'path';

/** Campos que son dinero. Piezas, peso y volumen no lo son. */
const CAMPOS_DINERO = /\b(monto|costo|venta|profit|precio|importe|total|saldo|ingresos|gastos|montoAplicado|subtotal|iva)\b/i;

/** Señales de que la moneda sí se está mirando. */
const MIRA_MONEDA = /\b(moneda|currency|porMoneda|sumarPorMoneda|MXN|USD)\b/;

/**
 * Sumas revisadas y correctas, con el motivo por el que no necesitan moneda.
 * Formato: 'ruta:línea aproximada' → motivo.
 */
const LEGITIMOS: Record<string, string> = {
  'src/lib/matrizComparativa.ts': 'La matriz separa por moneda en monedaComparativa.ts, que es quien decide si hay total comparable.',
  'src/lib/ivaCotizacion.ts': 'Suma las partes de UN mismo importe (el split 25/75 del flete aéreo), todas en su moneda.',
  'src/components/ordenesCompra/OrdenesCompraData.ts': 'Anticipos: OC-0 decidió exigir la misma moneda y marcar para revisión manual. El guard va en C-6, donde se cruzan.',
  'src/lib/facturacionEmbarque.ts': 'Una factura cubre UNA moneda: proponerFactura rechaza la mezcla antes de sumar, y saldoDeFactura filtra los cobros a la moneda de la factura.',
};

/** Deuda técnica conocida: se sabe que está mal y por qué no se corrige. */
const DEUDA_CONOCIDA: Record<string, string> = {
  'src/components/quotes/QuotesData.ts': 'getCostoOficial / costoDeConcepto — §6. Corregirlo cambia el costo y el margen de cotizaciones VIVAS.',
  'src/lib/lineasCotizacion.ts': 'Hereda la mezcla de getCostoOficial. Misma deuda.',
  'src/lib/cotizacionCalculator.ts': 'Hereda la mezcla de getCostoOficial. Misma deuda.',
  'src/lib/agrupacionModalidad.ts': 'Totales de la tarjeta de modalidad. Heredan la misma mezcla.',
  'src/lib/generacionEmbarque.ts': 'Venta por grupo para elegir modalidad dominante. Comparación relativa, no un importe que se cobre.',
  'src/components/quotes/ComparativaPricing.tsx': 'Costo elegido de la ruta B. Misma deuda de §6.',
  'src/components/quotes/ConceptoSection.tsx': 'Subconceptos y tarifas del concepto. Misma deuda de §6.',
};

interface Hallazgo {
  archivo: string;
  linea: number;
  codigo: string;
  clasificacion: 'nuevo' | 'legitimo' | 'deuda';
  nota?: string;
}

function revisar(ruta: string, src: string): Hallazgo[] {
  const lineas = src.split('\n');
  const out: Hallazgo[] = [];

  lineas.forEach((linea, i) => {
    if (!linea.includes('.reduce(')) return;
    if (!CAMPOS_DINERO.test(linea)) return;

    // La moneda puede aparecer en el propio reduce o en las líneas de alrededor.
    const contexto = lineas.slice(Math.max(0, i - 4), i + 5).join('\n');
    if (MIRA_MONEDA.test(contexto)) return;

    out.push({
      archivo: ruta,
      linea: i + 1,
      codigo: linea.trim(),
      clasificacion: DEUDA_CONOCIDA[ruta] ? 'deuda' : LEGITIMOS[ruta] ? 'legitimo' : 'nuevo',
      nota: DEUDA_CONOCIDA[ruta] ?? LEGITIMOS[ruta],
    });
  });

  return out;
}

function recorrer(dir: string, acc: Hallazgo[] = []): Hallazgo[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) { recorrer(ruta, acc); continue; }
    if (!/\.tsx?$/.test(entrada.name) || entrada.name.includes('.test.')) continue;
    acc.push(...revisar(ruta, fs.readFileSync(ruta, 'utf8')));
  }
  return acc;
}

const hallazgos = recorrer('src');
const nuevos = hallazgos.filter(h => h.clasificacion === 'nuevo');

console.log(`\n§4.3 · Sumas de dinero sin mirar la moneda\n`);

if (nuevos.length === 0) {
  console.log('  Sin hallazgos nuevos.\n');
} else {
  console.log(`  ⚠️  ${nuevos.length} suma(s) SIN clasificar:\n`);
  nuevos.forEach(h => {
    console.log(`    ${h.archivo}:${h.linea}`);
    console.log(`      ${h.codigo}\n`);
  });
  console.log('  Revisa cada una. Si es dinero, usa sumarPorMoneda().');
  console.log('  Si es legítima, anótala en LEGITIMOS con su motivo.\n');
}

const deuda = hallazgos.filter(h => h.clasificacion === 'deuda');
if (deuda.length > 0) {
  const porArchivo = new Set(deuda.map(h => h.archivo));
  console.log(`  Deuda conocida (§6), ${deuda.length} suma(s) en ${porArchivo.size} archivo(s):`);
  porArchivo.forEach(a => console.log(`    · ${a} — ${DEUDA_CONOCIDA[a]}`));
  console.log();
}

process.exit(nuevos.length > 0 ? 1 : 0);
