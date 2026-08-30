import React from 'react';
import { TrendingUp } from 'lucide-react';
import { calcTotales, COSTO_OPE_DEFAULT } from '../../lib/cotizacionCalculator';
import type { LineaPlana } from '../../lib/lineasCotizacion';

/**
 * Resumen financiero DENTRO de la ficha, no en una sección aparte.
 *
 * Gabi: «mientras cotizan no lo pueden ver, se tendrían que salir de lo que
 * están haciendo».
 *
 * Muestra el margen de la OPERACIÓN COMPLETA porque Pricing juega con los
 * profits entre conceptos: «ese profit se lo pongo en otro concepto. El margen
 * de mi concepto no va a ser bueno, pero el margen de mi operación sí».
 */

interface Props {
  lineas: LineaPlana[];
  moneda: string;
  diasCredito: number;
  costoOperacion?: number;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Dato({ label, valor, destacado, negativo }: {
  label: string; valor: string; destacado?: boolean; negativo?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{label}</p>
      <p className={`tabular-nums mt-0.5 ${
        destacado ? 'text-[15px] font-black' : 'text-[13px] font-bold'
      } ${negativo ? 'text-red-600' : destacado ? 'text-[#18181B]' : 'text-gray-700'}`}>
        {valor}
      </p>
    </div>
  );
}

export default function ResumenFinancieroInline({
  lineas, moneda, diasCredito, costoOperacion = COSTO_OPE_DEFAULT,
}: Props) {
  const t = calcTotales(
    lineas.map(l => ({ costo: l.costo, profit: l.profit })),
    diasCredito,
    costoOperacion,
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden sticky bottom-0">
      <div className="px-4 py-2.5 bg-gray-50/60 border-b border-gray-100 flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-[#E11D48]" />
        <h4 className="text-[10px] font-bold text-[#18181B] uppercase tracking-widest">
          Resumen de la operación
        </h4>
        <span className="text-[10px] text-gray-400 ml-auto">
          {diasCredito} días de crédito · costo de operación ${money(costoOperacion)}
        </span>
      </div>

      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
        <Dato label="Costo total"  valor={`$${money(t.costo_total)}`} />
        <Dato label="Profit total" valor={`$${money(t.profit_total)}`} />
        <Dato label={`Venta total ${moneda}`} valor={`$${money(t.venta_total)}`} destacado />
        <Dato label="Margen real" valor={`${(t.margen_real * 100).toFixed(1)}%`}
              destacado negativo={t.margen_real < 0} />

        <Dato label="Comisión (10%)"  valor={`-$${money(t.comision_monto)}`} />
        <Dato label="Financiamiento"  valor={`-$${money(t.financiamiento_monto)}`} />
        <Dato label="Profit real"     valor={`$${money(t.profit_real_monto)}`}
              negativo={t.profit_real_monto < 0} />
        <Dato label="Ganancia real"   valor={`$${money(t.ganancia_real)}`}
              destacado negativo={t.ganancia_real < 0} />
      </div>
    </div>
  );
}
