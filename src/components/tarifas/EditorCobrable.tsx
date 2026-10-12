/**
 * Factor volumétrico, mínimo y escalas de una tarifa «por kg cobrable»
 * (tarea 104). Lo comparten la revisión de la importación con IA y la carga
 * masiva: los dos capturan lo mismo que el formulario de una tarifa suelta
 * (tarea 100). Trabaja con texto —como los inputs— y quien lo usa convierte.
 */
import React from 'react';
import { Plus, X } from 'lucide-react';

export interface ValorCobrable {
  factor: string;
  minimo: string;
  escalas: Array<{ desdeKg: string; monto: string }>;
  /** Solo con `conModalidad`: la elige quien carga, no se infiere. */
  modalidad?: '' | 'aereo' | 'terrestre';
}

const INPUT = 'w-20 px-1.5 py-1 text-[11px] bg-white border border-card-border rounded-[4px] focus:outline-none focus:border-brand text-text-primary';

export default function EditorCobrable({ valor, onChange, disabled, avisos = [], conModalidad }: {
  conModalidad?: boolean;
  valor: ValorCobrable;
  onChange: (v: ValorCobrable) => void;
  disabled?: boolean;
  avisos?: string[];
}) {
  const set = (c: Partial<ValorCobrable>) => onChange({ ...valor, ...c });
  return (
    <div className="rounded border border-divider bg-neutral-bg/50 px-2 py-1.5 space-y-1.5" data-testid="editor-cobrable">
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-text-muted">
        {conModalidad && (
          <label className="flex items-center gap-1">Modalidad
            <select className={INPUT} value={valor.modalidad ?? ''} disabled={disabled}
              data-testid="cobrable-modalidad"
              onChange={e => set({ modalidad: e.target.value as ValorCobrable['modalidad'] })}>
              <option value="">Elegir…</option>
              <option value="aereo">Aéreo</option>
              <option value="terrestre">Terrestre</option>
            </select>
          </label>
        )}
        <label className="flex items-center gap-1">Factor (kg/m³)
          <input type="number" min="0" className={INPUT} value={valor.factor} disabled={disabled}
            data-testid="cobrable-factor" placeholder="aéreo: 167"
            onChange={e => set({ factor: e.target.value })} />
        </label>
        <label className="flex items-center gap-1">Mínimo
          <input type="number" min="0" className={INPUT} value={valor.minimo} disabled={disabled}
            data-testid="cobrable-minimo" placeholder="0.00"
            onChange={e => set({ minimo: e.target.value })} />
        </label>
        <button type="button" disabled={disabled} data-testid="cobrable-agregar-escala"
          className="inline-flex items-center gap-0.5 font-semibold text-primario hover:underline"
          onClick={() => set({ escalas: [...valor.escalas, { desdeKg: '', monto: '' }] })}>
          <Plus className="w-3 h-3" /> Escala
        </button>
      </div>
      {valor.escalas.map((e, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[10px] text-text-muted" data-testid="cobrable-escala">
          desde
          <input type="number" min="0" className={INPUT} value={e.desdeKg} disabled={disabled} placeholder="45"
            onChange={ev => set({ escalas: valor.escalas.map((x, j) => j === i ? { ...x, desdeKg: ev.target.value } : x) })} />
          kg a
          <input type="number" min="0" step="0.01" className={INPUT} value={e.monto} disabled={disabled} placeholder="por kg"
            onChange={ev => set({ escalas: valor.escalas.map((x, j) => j === i ? { ...x, monto: ev.target.value } : x) })} />
          <button type="button" disabled={disabled} title="Quitar escala"
            onClick={() => set({ escalas: valor.escalas.filter((_, j) => j !== i) })}>
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <p className="text-[10px] text-text-muted">
        El monto de la línea es el precio por kg y rige debajo de la primera escala.
      </p>
      {avisos.map(a => <p key={a} className="text-[10px] text-amber-800 font-semibold">{a}</p>)}
    </div>
  );
}

/** Texto de los inputs → números; descarta las escalas vacías. */
export function cobrableANumeros(v: ValorCobrable) {
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  const escalas = v.escalas
    .filter(e => e.desdeKg.trim() !== '' || e.monto.trim() !== '')
    .map(e => ({ desdeKg: Number(e.desdeKg), monto: Number(e.monto) }));
  return { factorVolumetricoKgM3: num(v.factor), minimo: num(v.minimo), escalas };
}
