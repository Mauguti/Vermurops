/**
 * DesgloseCobrable (tarea 100): lo que se cobra de una tarifa por kg cobrable,
 * con la cuenta a la vista. Sin carga que alcance, lo dice y no pone total.
 */
import type { TarifaVermur } from './TarifasData';
import type { CargaSolicitada } from '../quotes/QuotesData';
import { calcularTarifaCobrable } from './tarifaMatching';

const kg = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg`;

export default function DesgloseCobrable({ tarifa, carga }: { tarifa: TarifaVermur; carga?: CargaSolicitada | null }) {
  const c = calcularTarifaCobrable(tarifa, carga);
  if (!c) return null;

  if ('motivo' in c) {
    return (
      <p data-testid="cobrable-sin-calculo" className="mt-1.5 text-[9px] leading-snug px-1.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">
        Sin cálculo: {c.motivo}
      </p>
    );
  }

  const ganador = c.gana === 'volumetrico' ? 'volumétrico' : c.gana === 'bruto' ? 'bruto' : 'bruto = volumétrico';
  return (
    <div data-testid="cobrable-desglose" className="mt-1.5 text-[9px] leading-snug px-1.5 py-1 rounded bg-primario/5 border border-primario/20 text-gray-700 space-y-0.5">
      <p>
        Bruto <b>{kg(c.brutoKg)}</b> · Volumétrico <b>{kg(c.volumetricoKg)}</b>
        {c.origenVolumetrico === 'calculado' && c.factor ? ` (×${c.factor} kg/m³)` : ' (capturado)'}
      </p>
      <p>Se cobra el {ganador}: <b>{kg(c.cobrableKg)}</b>{c.redondeado ? ' (al medio kilo)' : ''}</p>
      <p className="tabular-nums" data-testid="cobrable-formula">{c.formula}</p>
      <p className="font-bold text-primario-fuerte tabular-nums">Total {c.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} {tarifa.moneda}</p>
    </div>
  );
}
