/**
 * CampoEstiba.tsx (tarea 99)
 *
 * Casilla «Estibable» y, si está marcada, «¿Cuántos se pueden estibar?».
 * Lo usan la solicitud/ficha de cotización y los productos del embarque: el
 * tope por modalidad sale de `lib/estiba.ts`, no de aquí.
 *
 * Un número fuera del tope NO se manda hacia arriba: se queda en el campo con
 * su aviso y la carga conserva el último valor válido. Así el autoguardado de
 * la ficha nunca escribe un 6 en terrestre.
 */

import React, { useEffect, useState } from 'react';
import {
  problemaNivelesEstiba, textoTopeEstiba, topeNivelesEstiba, type ModalidadEstiba,
} from '../../lib/estiba';

interface Props {
  modalidad: ModalidadEstiba;
  /** undefined = sin indicar. */
  estibable: boolean | undefined;
  niveles: number | null;
  disabled?: boolean;
  onCambio: (estibable: boolean, niveles: number | null) => void;
}

export default function CampoEstiba({ modalidad, estibable, niveles, disabled, onCambio }: Props) {
  const [texto, setTexto] = useState(niveles ? String(niveles) : '');
  const [error, setError] = useState<string | null>(null);

  // Lo que viene de arriba manda: si cambia la carga (otro servicio, deshacer),
  // el campo se vuelve a poner en lo guardado.
  useEffect(() => {
    setTexto(niveles ? String(niveles) : '');
    setError(null);
  }, [niveles, estibable]);

  const cambiarTexto = (v: string) => {
    setTexto(v);
    if (v.trim() === '') { setError(null); onCambio(true, null); return; }
    const n = Number(v);
    const problema = problemaNivelesEstiba(modalidad, n);
    if (problema) { setError(problema); return; }
    setError(null);
    onCambio(true, n);
  };

  const tope = topeNivelesEstiba(modalidad);

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2" data-testid="campo-estiba">
      <label className="flex items-center gap-2 cursor-pointer select-none pb-1.5">
        <input type="checkbox" checked={estibable === true} disabled={disabled}
          data-testid="estibable-check"
          onChange={e => onCambio(e.target.checked, null)}
          className="accent-primario" />
        <span className="text-[11px] font-semibold text-gray-600">Estibable</span>
        {estibable === undefined && <span className="text-[10px] text-gray-400 italic">Sin indicar</span>}
      </label>
      {estibable === true && (
        <div>
          <label className="block text-[9px] text-gray-400 font-bold uppercase mb-1">
            ¿Cuántos se pueden estibar? <span className="normal-case font-medium">({textoTopeEstiba(modalidad)})</span>
          </label>
          <input type="number" min={1} max={tope ?? undefined} step={1} value={texto} disabled={disabled}
            data-testid="niveles-estiba" placeholder="Niveles"
            onChange={e => cambiarTexto(e.target.value)}
            aria-invalid={!!error}
            className={`w-28 text-xs border rounded-lg px-2 py-1.5 outline-none focus:border-primario ${error ? 'border-peligro' : 'border-gray-200'}`} />
          {error && <p className="text-[10px] text-peligro mt-1" role="alert" data-testid="error-estiba">{error} No se guarda.</p>}
        </div>
      )}
    </div>
  );
}
