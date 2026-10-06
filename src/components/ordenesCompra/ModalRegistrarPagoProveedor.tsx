/**
 * ModalRegistrarPagoProveedor.tsx — tarea 81 (PLAN-PAGOS §7.2)
 *
 * Reemplaza el cuadro de texto de «Registrar pago»: las órdenes del grupo con
 * casilla (todas marcadas de entrada), la fecha en que el dinero salió, la
 * cuenta de salida, la referencia y un comprobante opcional que se sube UNA
 * vez y queda ligado a todas las órdenes que cubre el pago.
 *
 * Las reglas viven en `lib/formularioPagoProveedor.ts`; el dinero, en
 * `pagos.ts`. Aquí solo se captura.
 */

import React, { useMemo, useState } from 'react';
import type { OrdenCompra } from './OrdenesCompraData';
import type { GrupoDePago } from '../../lib/calendarioPagos';
import { opcionesBanco } from '../../lib/cuentasPago';
import {
  hoyLocal, bancoInicial, totalElegido, problemasDelFormulario,
} from '../../lib/formularioPagoProveedor';

export interface DatosFormularioPago {
  ocIds: string[];
  referencia: string;
  /** YYYY-MM-DD */
  fecha: string;
  banco: string | null;
  comprobante: File | null;
}

interface Props {
  grupo: GrupoDePago<OrdenCompra>;
  hoy?: string;
  onConfirmar: (datos: DatosFormularioPago) => Promise<void>;
  onCancelar: () => void;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ModalRegistrarPagoProveedor({ grupo, hoy, onConfirmar, onCancelar }: Props) {
  const fechaHoy = hoy ?? hoyLocal();
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(grupo.items.map(o => o.id)));
  const [fecha, setFecha] = useState(fechaHoy);
  const [banco, setBanco] = useState(() => bancoInicial(grupo.items));
  const [referencia, setReferencia] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = useMemo(() => opcionesBanco(banco), [banco]);
  const total = totalElegido(grupo.items, elegidas);
  const problemas = problemasDelFormulario({
    elegidas: elegidas.size, referencia, fecha, hoy: fechaHoy,
    archivo: archivo ? { nombre: archivo.name, tamano: archivo.size } : null,
  });

  const alternar = (id: string) => setElegidas(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const aceptar = async () => {
    if (problemas.length > 0 || guardando) return;
    setGuardando(true); setError(null);
    try {
      await onConfirmar({
        ocIds: grupo.items.filter(o => elegidas.has(o.id)).map(o => o.id),
        referencia: referencia.trim(),
        fecha,
        banco: banco || null,
        comprobante: archivo,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  };

  const campo = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario';
  const rotulo = 'block text-[9px] font-bold text-gray-400 uppercase mb-1';

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" data-testid="modal-pago-proveedor">
      <div role="dialog" aria-label="Registrar pago a proveedor" className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h3 className="text-[14px] font-bold text-text-primary">Registrar pago a {grupo.proveedorNombre}</h3>
          <p className="text-[11px] text-text-muted mt-0.5">
            Una transferencia, un solo pago. Desmarca las órdenes que no entraron en ella.
          </p>
        </div>

        <fieldset className="border border-card-border rounded-lg divide-y divide-gray-50">
          <legend className="sr-only">Órdenes que cubre el pago</legend>
          {grupo.items.map(o => (
            <label key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer">
              <span className="min-w-0 flex items-center gap-2">
                <input
                  type="checkbox" checked={elegidas.has(o.id)} onChange={() => alternar(o.id)}
                  aria-label={`Incluir ${o.folio}`}
                />
                <span className="font-mono text-[11px] text-gray-400">{o.folio}</span>
                <span className="text-[12px] text-gray-700 truncate">{o.conceptoNombre}</span>
              </span>
              <span className="text-[12px] font-semibold text-gray-800 tabular-nums shrink-0">
                {o.moneda} {money(o.monto)}
              </span>
            </label>
          ))}
        </fieldset>

        <p className="text-[13px] font-bold text-text-primary tabular-nums" data-testid="total-pago">
          Total a transferir: {grupo.moneda} {money(total)}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label>
            <span className={rotulo}>Fecha del pago</span>
            <input type="date" value={fecha} max={fechaHoy} onChange={e => setFecha(e.target.value)}
              aria-label="Fecha del pago" className={campo} />
          </label>
          <label>
            <span className={rotulo}>Cuenta de salida</span>
            <select value={banco} onChange={e => setBanco(e.target.value)} aria-label="Cuenta de salida" className={campo}>
              <option value="">Sin indicar</option>
              {opciones.map(o => <option key={o.valor} value={o.valor}>{o.nombre}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={rotulo}>Referencia de la transferencia</span>
          <input value={referencia} onChange={e => setReferencia(e.target.value)}
            aria-label="Referencia de la transferencia" className={campo} />
        </label>

        <label className="block">
          <span className={rotulo}>Comprobante (opcional)</span>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
            aria-label="Comprobante del pago"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-[11px] text-gray-600" />
          <span className="block text-[10px] text-text-muted mt-1">
            Se sube una sola vez y queda ligado a todas las órdenes de este pago.
          </span>
        </label>

        {(error || (problemas.length > 0 && (referencia !== '' || archivo || elegidas.size === 0 || fecha > fechaHoy))) && (
          <p className="text-[11px] text-peligro font-semibold" role="alert">{error ?? problemas.join(' · ')}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} disabled={guardando}
            className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-3 py-1.5">
            Cancelar
          </button>
          <button type="button" onClick={aceptar} disabled={problemas.length > 0 || guardando}
            className="bg-primario text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
            {guardando ? 'Guardando…' : 'Confirmar pago'}
          </button>
        </div>
      </div>
    </div>
  );
}
