import React from 'react';
import { Trash2, Undo2, Lock, AlertTriangle } from 'lucide-react';
import type { CargoDetalle, MonedaCargo } from './EmbarquesData';
import {
  agruparCargos, desviacionDe, montoOriginal, GrupoCargos,
} from '../../lib/cargosEditables';

/**
 * A-3. Los cargos del embarque, agrupados por concepto y editables.
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 * Textual del cliente: «el costo lo puede modificar operaciones en algún
 * momento si es que la tarifa no fue la correcta o hubo cargos extras».
 *
 * Antes esta pestaña era una lista plana en solo lectura: se podía agregar y
 * borrar un cargo, pero no corregir uno. Corregir borrando y recapturando
 * pierde de dónde salió el importe y a quién se le paga.
 *
 * ── Por qué no reusa TarjetaModalidad ──────────────────────────────────────
 * El plan lo sugería, y la forma es la misma —tarjeta por grupo, tabla dentro,
 * totales abajo— pero el renglón no puede serlo: `LineaPlana` tiene UN costo
 * por línea, y aquí el costo de un concepto se reparte entre varios
 * proveedores. Editar «el costo de la línea» dejaría sin decir a cuál de ellos
 * se le paga distinto, que es justo lo que la orden de compra necesita saber.
 *
 * Así que el renglón es el CARGO, no la línea, y el grupo hace el papel de la
 * tarjeta.
 *
 * ── La regla ───────────────────────────────────────────────────────────────
 * Corregir aquí NO toca la cotización. Son documentos distintos: la cotización
 * es lo que se pactó y el embarque lo que costó. La columna «Cotizado» deja
 * esa diferencia a la vista.
 */

interface Props {
  detalles: CargoDetalle[];
  /** Solo Operaciones corrige costos. Los demás leen. */
  editable: boolean;
  /** Resuelve el nombre del proveedor. Devuelve '' si no lo conoce. */
  nombreProveedor: (id: string | undefined) => string;
  onEditarMonto: (cargoId: string, monto: number) => void;
  onRestaurar: (cargoId: string) => void;
  onQuitar: (cargoId: string) => void;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const signo = (n: number) => `${n > 0 ? '+' : ''}${money(n)}`;

export default function TablaCargosEmbarque({
  detalles, editable, nombreProveedor, onEditarMonto, onRestaurar, onQuitar,
}: Props) {
  const grupos = agruparCargos(detalles);

  if (grupos.length === 0) {
    return (
      <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center">
        <p className="text-[12px] text-gray-400">
          Este embarque no tiene cargos. Los hereda la cotización al ganarse, o
          se capturan abajo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grupos.map(g => (
        <GrupoCard
          key={g.clave}
          grupo={g}
          editable={editable}
          nombreProveedor={nombreProveedor}
          onEditarMonto={onEditarMonto}
          onRestaurar={onRestaurar}
          onQuitar={onQuitar}
        />
      ))}
    </div>
  );
}

// ─── Una tarjeta por concepto ─────────────────────────────────────────────────

function GrupoCard({
  grupo, editable, nombreProveedor, onEditarMonto, onRestaurar, onQuitar,
}: { grupo: GrupoCargos } & Omit<Props, 'detalles'>) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#18181B] truncate">{grupo.titulo}</span>
            {!grupo.heredado && (
              <span className="text-[8px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded shrink-0">
                Capturado aquí
              </span>
            )}
            {grupo.editado && (
              <span className="text-[8px] font-bold uppercase tracking-wider bg-[#E11D48]/10 text-[#E11D48] px-1.5 py-0.5 rounded shrink-0">
                Corregido
              </span>
            )}
          </div>
          {grupo.mezclaMonedas && (
            <p className="text-[10px] text-amber-700 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Se cobra en una moneda y se paga en otra: el margen se lee por moneda, no como un solo número.
            </p>
          )}
        </div>

        {/* Un bloque por moneda. §4.3: los totales nunca se mezclan. */}
        <div className="flex items-center gap-4 shrink-0">
          {grupo.monedasActivas.map(m => (
            <div key={m} className="text-right">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                Margen {m}
              </p>
              <p className={`text-[13px] font-bold tabular-nums ${
                grupo.porMoneda[m].ganancia < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                ${money(grupo.porMoneda[m].ganancia)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Concepto</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">A quién</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Tipo</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Importe</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Moneda</th>
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Cotizado</th>
              {editable && <th className="px-2 py-2 w-[60px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {grupo.cargos.map(c => (
              <Renglon
                key={c.id}
                cargo={c}
                editable={editable}
                nombreProveedor={nombreProveedor}
                onEditarMonto={onEditarMonto}
                onRestaurar={onRestaurar}
                onQuitar={onQuitar}
              />
            ))}
          </tbody>
          <tfoot>
            {grupo.monedasActivas.map(m => (
              <tr key={m} className="border-t border-gray-200 bg-gray-50/60 font-bold">
                <td className="px-3 py-2 text-[11px] text-gray-500 uppercase tracking-wider" colSpan={3}>
                  Total {m}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                  <span className="text-emerald-600">${money(grupo.porMoneda[m].ingresos)}</span>
                  {' − '}
                  <span className="text-rose-600">${money(grupo.porMoneda[m].gastos)}</span>
                </td>
                <td className="px-3 py-2 font-mono text-gray-500">{m}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {grupo.desviacionGasto[m] !== 0 ? (
                    <span
                      className={grupo.desviacionGasto[m] > 0 ? 'text-rose-600' : 'text-emerald-600'}
                      title="Cuánto se desvió el costo respecto a lo cotizado."
                    >
                      {signo(grupo.desviacionGasto[m])}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                {editable && <td />}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Un renglón ───────────────────────────────────────────────────────────────

const inputNum = 'w-[110px] px-2 py-1 text-right tabular-nums border border-transparent hover:border-gray-200 focus:border-[#E11D48] focus:bg-white bg-transparent rounded outline-none text-[12px] font-semibold';

function Renglon({
  cargo, editable, nombreProveedor, onEditarMonto, onRestaurar, onQuitar,
}: { cargo: CargoDetalle } & Omit<Props, 'detalles'>) {
  const desviacion = desviacionDe(cargo);
  const original = montoOriginal(cargo);
  const fueEditado = cargo.montoHeredado !== undefined;

  /*
   * Una línea ya facturada no se corrige.
   *
   * El importe que se timbró es el que se timbró: cambiarlo después dejaría la
   * factura y el embarque diciendo cosas distintas del mismo cobro. Para eso
   * está la nota de crédito.
   */
  const facturado = !!cargo.facturaId;
  const puedeEditar = editable && !facturado;

  return (
    <tr className="hover:bg-gray-50/60 group">
      <td className="px-3 py-1.5 text-gray-700">{cargo.concepto}</td>

      <td className="px-3 py-1.5">
        {cargo.tipo === 'gasto' ? (
          nombreProveedor(cargo.proveedorId) ? (
            <span className="text-gray-600">{nombreProveedor(cargo.proveedorId)}</span>
          ) : (
            <span className="text-amber-600 text-[11px] font-semibold" title="Sin proveedor no se sabe a quién pagarle: no se puede generar la orden de compra.">
              Sin proveedor
            </span>
          )
        ) : (
          <span className="text-gray-400 text-[11px]">Cliente</span>
        )}
      </td>

      <td className="px-3 py-1.5">
        {cargo.tipo === 'ingreso' ? (
          <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded text-[9px] font-bold border border-emerald-100 uppercase">Ingreso</span>
        ) : (
          <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded text-[9px] font-bold border border-rose-100 uppercase">Gasto</span>
        )}
      </td>

      <td className="px-3 py-1.5 text-right">
        {puedeEditar ? (
          <input
            type="number"
            value={cargo.monto}
            onChange={e => onEditarMonto(cargo.id, Number(e.target.value))}
            className={inputNum}
          />
        ) : (
          <span className="px-2 tabular-nums font-semibold text-gray-700 inline-flex items-center gap-1">
            {facturado && (
              <Lock className="w-3 h-3 text-gray-300" />
            )}
            ${money(cargo.monto)}
          </span>
        )}
      </td>

      <td className="px-3 py-1.5 font-mono text-gray-500">{cargo.moneda}</td>

      {/* La columna que hace el trabajo: qué se cotizó y cuánto se movió. */}
      <td className="px-3 py-1.5 text-right tabular-nums">
        {fueEditado ? (
          <span
            className="inline-flex items-center gap-1.5"
            title={`Cotizado ${money(original)}. Corregido por ${cargo.editadoPor ?? '—'} el ${(cargo.editadoEn ?? '').slice(0, 10)}.`}
          >
            <span className="text-gray-400 line-through">${money(original)}</span>
            {desviacion !== 0 && (
              <span className={`text-[10px] font-bold ${desviacion > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {signo(desviacion)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {editable && (
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {fueEditado && (
              <button
                onClick={() => onRestaurar(cargo.id)}
                className="p-1 text-gray-300 hover:text-gray-600"
                title="Volver al importe cotizado"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
            )}
            {!facturado && (
              <button
                onClick={() => onQuitar(cargo.id)}
                className="p-1 text-gray-300 hover:text-red-500"
                title="Quitar el cargo"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

export type { MonedaCargo };
