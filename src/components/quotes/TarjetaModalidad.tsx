import React, { useState } from 'react';
import { Ship, Plane, Truck, FileCheck, Package, Plus, Trash2, ChevronUp, ChevronDown, Lock } from 'lucide-react';
import type { TarjetaModalidad as TarjetaData } from '../../lib/agrupacionModalidad';
import type { LineaPlana } from '../../lib/lineasCotizacion';
import { compararConTarget } from '../../lib/lineasCotizacion';
import ConceptoSelector from '../conceptos/ConceptoSelector';
import type { ConceptoVermur } from '../conceptos/ConceptosData';

/**
 * Una tarjeta por modalidad, con la tabla de conceptos dentro.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * Sesión 30-ago-2026. Luis: «una columna que sea conceptos, una que sea
 * costos, una que sea profit y una que sea la sumatoria, y el margen de cada
 * uno. En una sola tarjeta. Y después abajo tener una tabla... pero como
 * tabla, no como una vista de ficha».
 *
 * Reemplaza el árbol de servicios → conceptos → cotizaciones de proveedor, que
 * el cliente dijo no entender.
 */

const ICONO: Record<string, React.ReactNode> = {
  maritimo:  <Ship className="w-4 h-4" />,
  aereo:     <Plane className="w-4 h-4" />,
  terrestre: <Truck className="w-4 h-4" />,
  aduanal:   <FileCheck className="w-4 h-4" />,
  locales:   <Package className="w-4 h-4" />,
};

const COLOR: Record<string, string> = {
  maritimo:  'text-blue-600 bg-blue-50 border-blue-100',
  aereo:     'text-sky-600 bg-sky-50 border-sky-100',
  terrestre: 'text-amber-700 bg-amber-50 border-amber-100',
  aduanal:   'text-violet-600 bg-violet-50 border-violet-100',
  locales:   'text-gray-600 bg-gray-50 border-gray-200',
};

export interface TarjetaModalidadProps {
  tarjeta: TarjetaData;
  moneda: string;
  /** Solo lectura: Ventas no edita, y una cotización congelada tampoco. */
  editable: boolean;
  onEditarLinea: (lineaId: string, campo: 'costo' | 'profit' | 'target', valor: number) => void;
  /**
   * Concepto elegido del catálogo. Llega el id Y el nombre: el nombre se lee,
   * el id es lo que hace match con las tarifas.
   */
  onElegirConcepto: (lineaId: string, conceptoId: string, nombre: string) => void;
  conceptosActivos: ConceptoVermur[];
  onCrearConcepto?: () => void;
  soloLectura: boolean;
  onQuitarLinea: (lineaId: string) => void;
  onMoverLinea: (lineaId: string, direccion: 'arriba' | 'abajo') => void;
  onAgregarLinea: () => void;
  onCompararProveedor: (lineaId: string) => void;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TarjetaModalidad({
  tarjeta, moneda, editable,
  onEditarLinea, onElegirConcepto, onQuitarLinea, onMoverLinea, onAgregarLinea,
  onCompararProveedor, conceptosActivos, onCrearConcepto, soloLectura,
}: TarjetaModalidadProps) {
  const [expandida, setExpandida] = useState(true);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Encabezado de la tarjeta */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <button
          onClick={() => setExpandida(v => !v)}
          className="flex items-center gap-2.5 min-w-0"
        >
          <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${COLOR[tarjeta.modalidad] ?? ''}`}>
            {ICONO[tarjeta.modalidad]}
          </span>
          <span className="text-[13px] font-bold text-[#18181B]">{tarjeta.label}</span>
          <span className="text-[11px] text-gray-400">
            {tarjeta.lineas.length} concepto{tarjeta.lineas.length !== 1 ? 's' : ''}
          </span>
          {expandida ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
        </button>

        <div className="flex items-center gap-5 text-right shrink-0">
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Venta</p>
            <p className="text-[13px] font-bold text-[#18181B] tabular-nums">
              ${money(tarjeta.ventaTotal)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Margen</p>
            <p className={`text-[13px] font-bold tabular-nums ${
              tarjeta.margen < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {(tarjeta.margen * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {expandida && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Concepto</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Proveedor</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Costo</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Profit</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Venta</th>
                  <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Margen</th>
                  {editable && <th className="px-2 py-2 w-[70px]" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tarjeta.lineas.map(l => (
                  <Renglon
                    key={l.id}
                    linea={l}
                    editable={editable}
                    onEditar={onEditarLinea}
                    onElegirConcepto={onElegirConcepto}
                    onQuitar={onQuitarLinea}
                    onMover={onMoverLinea}
                    onComparar={onCompararProveedor}
                    conceptosActivos={conceptosActivos}
                    onCrearConcepto={onCrearConcepto}
                    soloLectura={soloLectura}
                  />
                ))}

                {tarjeta.lineas.length === 0 && (
                  <tr>
                    <td colSpan={editable ? 7 : 6} className="px-3 py-6 text-center text-gray-400 text-[12px]">
                      Sin conceptos en esta modalidad.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/60 font-bold">
                  <td className="px-3 py-2 text-[11px] text-gray-500 uppercase tracking-wider" colSpan={2}>
                    Total {tarjeta.label.toLowerCase()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">${money(tarjeta.costoTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">${money(tarjeta.profitTotal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#18181B]">${money(tarjeta.ventaTotal)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tarjeta.margen < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {(tarjeta.margen * 100).toFixed(1)}%
                  </td>
                  {editable && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {editable && (
            <div className="px-3 py-2 border-t border-gray-100">
              <button
                onClick={onAgregarLinea}
                className="flex items-center gap-1.5 text-[11px] font-bold text-[#E11D48] hover:bg-[#E11D48]/5 px-2 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar concepto
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Un renglón ───────────────────────────────────────────────────────────────

const inputNum = 'w-[90px] px-2 py-1 text-right tabular-nums border border-transparent hover:border-gray-200 focus:border-[#E11D48] focus:bg-white bg-transparent rounded outline-none text-[12px]';

interface RenglonProps {
  linea: LineaPlana;
  editable: boolean;
  onEditar: TarjetaModalidadProps['onEditarLinea'];
  onElegirConcepto: TarjetaModalidadProps['onElegirConcepto'];
  onQuitar: (id: string) => void;
  onMover: (id: string, d: 'arriba' | 'abajo') => void;
  onComparar: (id: string) => void;
  conceptosActivos: ConceptoVermur[];
  onCrearConcepto?: () => void;
  soloLectura: boolean;
}

function Renglon({
  linea, editable, onEditar, onElegirConcepto, onQuitar, onMover, onComparar,
  conceptosActivos, onCrearConcepto, soloLectura,
}: RenglonProps) {
  const target = compararConTarget(linea);

  return (
    <tr className="hover:bg-gray-50/60 group">
      {/* El concepto se ELIGE del catálogo, nunca se teclea. Sin conceptoId el
          panel de tarifas no puede hacer match, y dos renglones escritos
          distinto («almacenaje» y «Almajenaje») serían conceptos diferentes. */}
      <td className="px-3 py-1.5">
        <ConceptoSelector
          compacto
          selectedNombre={linea.concepto || null}
          conceptos={conceptosActivos}
          onSelect={(conceptoId, nombre) => onElegirConcepto(linea.id, conceptoId, nombre)}
          onCrearNuevo={onCrearConcepto}
          readOnly={soloLectura || !editable}
        />
        {!linea.conceptoId && !soloLectura && (
          <span className="block px-2 text-[9px] text-amber-600 font-semibold">
            Sin concepto del catálogo: no habrá tarifas
          </span>
        )}
      </td>

      <td className="px-3 py-1.5">
        {linea.proveedorNombre ? (
          <span className="text-gray-600">{linea.proveedorNombre}</span>
        ) : editable ? (
          <button
            onClick={() => onComparar(linea.id)}
            className="text-[11px] font-semibold text-[#E11D48] hover:underline"
          >
            Elegir proveedor
          </button>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      <td className="px-3 py-1.5 text-right">
        {editable && !linea.costoDerivado ? (
          <div className="inline-flex items-center gap-1 justify-end">
            <input
              type="number"
              value={linea.costoCapturado ? linea.costo : ''}
              placeholder="—"
              onChange={e => onEditar(linea.id, 'costo', Number(e.target.value))}
              className={inputNum}
            />
            {/* Un cero declarado es una decisión —cortesía, cargo absorbido,
                concepto con pérdida a propósito—, no un olvido. Se marca para
                que se lea como tal. */}
            {linea.costoCapturado && linea.costo === 0 && (
              <span
                className="text-[8px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1 py-0.5 rounded shrink-0"
                title="Costo capturado en cero: cortesía, cargo absorbido o concepto con pérdida deliberada."
              >
                sin costo
              </span>
            )}
          </div>
        ) : (
          <span
            className="px-2 tabular-nums text-gray-700 inline-flex items-center gap-1"
            title={linea.costoDerivado
              ? `Viene de ${linea.tarifasCount} tarifa(s) elegida(s). Para cambiarlo, cambia las tarifas.`
              : undefined}
          >
            {linea.costoDerivado && <Lock className="w-3 h-3 text-gray-300" />}
            ${money(linea.costo)}
          </span>
        )}
      </td>

      <td className="px-3 py-1.5 text-right">
        {editable ? (
          <input
            type="number"
            value={linea.profit || ''}
            onChange={e => onEditar(linea.id, 'profit', Number(e.target.value))}
            className={inputNum}
          />
        ) : (
          <span className="px-2 tabular-nums text-gray-700">${money(linea.profit)}</span>
        )}
      </td>

      <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[#18181B]">
        ${money(linea.venta)}
        {target === 'sobre_target' && (
          <span className="ml-1 text-[9px] font-bold text-amber-600" title={`Target del cliente: $${money(linea.target ?? 0)}`}>
            ▲
          </span>
        )}
      </td>

      <td className={`px-3 py-1.5 text-right tabular-nums ${linea.margen < 0 ? 'text-red-600' : 'text-gray-600'}`}>
        {(linea.margen * 100).toFixed(1)}%
      </td>

      {editable && (
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onMover(linea.id, 'arriba')} className="p-1 text-gray-300 hover:text-gray-600" title="Subir">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onMover(linea.id, 'abajo')} className="p-1 text-gray-300 hover:text-gray-600" title="Bajar">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onQuitar(linea.id)} className="p-1 text-gray-300 hover:text-red-500" title="Quitar">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
