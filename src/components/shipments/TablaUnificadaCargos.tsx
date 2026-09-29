/**
 * TablaUnificadaCargos.tsx
 *
 * Tabla plana de cargos del embarque: un renglón por concepto.
 *
 * Reemplaza la vista de tarjetas «Por concepto» que separaba ingreso y gasto
 * en renglones distintos (estilo Magaya). Luis confirmó que eso no tiene
 * sentido: aquí cada concepto es UNA fila con Concepto · Proveedor · Costo ·
 * Moneda · Profit · Impuesto · Venta · Margen · Estado · Cliente a facturar.
 *
 * Si un concepto tiene varios proveedores, el concepto es un renglón
 * encabezado con sub-renglones por proveedor; profit y margen a nivel
 * concepto, la venta no se prorratea.
 *
 * Reusa `margenDelConcepto` de `lib/margenRealConcepto.ts` sin duplicar
 * lógica, y conserva las acciones (Solicitar pago, Orden generada, corregir
 * importe, borrar).
 */

import React from 'react';
import { Trash2, Undo2, Lock, AlertTriangle, Receipt, ChevronDown, ChevronRight } from 'lucide-react';
import type { CargoDetalle, MonedaCargo } from './EmbarquesData';
import {
  agruparCargos, desviacionDe, montoOriginal, type GrupoCargos,
} from '../../lib/cargosEditables';
import {
  margenDelConcepto, estadoMenosFirme,
  type ContextoMargen, type DesfaseOC, type EstadoCosto, type MargenMoneda,
  type OCParaMargen,
} from '../../lib/margenRealConcepto';
import { puedeConvertirse } from '../../lib/ocDesdeCargo';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';

// ─── Títulos de columna en un solo lugar ─────────────────────────────────────

export const COLUMNAS_CARGOS = {
  concepto: 'Concepto',
  proveedor: 'Proveedor',
  costo: 'Costo',
  moneda: 'Moneda',
  profit: 'Profit',
  impuesto: 'Impuesto',
  venta: 'Venta',
  margen: 'Margen',
  estado: 'Estado',
  clienteFacturar: 'Cliente a facturar',
} as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  detalles: CargoDetalle[];
  ordenes?: OCParaMargen[];
  tipoCambio?: number | null;
  editable: boolean;
  nombreProveedor: (id: string | undefined) => string;
  /** Nombre del cliente a cobrar del embarque. */
  clienteCobrar: string;
  onEditarMonto: (cargoId: string, monto: number) => void;
  onRestaurar: (cargoId: string) => void;
  onQuitar: (cargoId: string) => void;
  onGenerarOC?: (cargoId: string) => void;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TablaUnificadaCargos({
  detalles, ordenes = [], tipoCambio, editable, nombreProveedor, clienteCobrar,
  onEditarMonto, onRestaurar, onQuitar, onGenerarOC,
}: Props) {
  const grupos = agruparCargos(detalles);
  const ctx: ContextoMargen = {
    ordenes: new Map(ordenes.map(o => [o.id, o])),
    cargos: detalles,
    tipoCambio,
  };

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

  const colCount = 10 + (editable ? 1 : 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left border-b border-gray-100 bg-gray-50/60">
              <Th>{COLUMNAS_CARGOS.concepto}</Th>
              <Th>{COLUMNAS_CARGOS.proveedor}</Th>
              <Th right>{COLUMNAS_CARGOS.costo}</Th>
              <Th>{COLUMNAS_CARGOS.moneda}</Th>
              <Th right>{COLUMNAS_CARGOS.profit}</Th>
              <Th>{COLUMNAS_CARGOS.impuesto}</Th>
              <Th right>{COLUMNAS_CARGOS.venta}</Th>
              <Th right>{COLUMNAS_CARGOS.margen}</Th>
              <Th>{COLUMNAS_CARGOS.estado}</Th>
              <Th>{COLUMNAS_CARGOS.clienteFacturar}</Th>
              {editable && <th className="px-2 py-2 w-[60px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {grupos.map(g => (
              <FilaConcepto
                key={g.clave}
                grupo={g}
                ctx={ctx}
                editable={editable}
                nombreProveedor={nombreProveedor}
                clienteCobrar={clienteCobrar}
                onEditarMonto={onEditarMonto}
                onRestaurar={onRestaurar}
                onQuitar={onQuitar}
                onGenerarOC={onGenerarOC}
                colCount={colCount}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Encabezado de columna ───────────────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider ${right ? 'text-right' : ''}`}>
      {children}
    </th>
  );
}

// ─── Un concepto (una o más filas) ───────────────────────────────────────────

function FilaConcepto({
  grupo, ctx, editable, nombreProveedor, clienteCobrar,
  onEditarMonto, onRestaurar, onQuitar, onGenerarOC, colCount,
}: {
  grupo: GrupoCargos;
  ctx: ContextoMargen;
  editable: boolean;
  nombreProveedor: (id: string | undefined) => string;
  clienteCobrar: string;
  onEditarMonto: (cargoId: string, monto: number) => void;
  onRestaurar: (cargoId: string) => void;
  onQuitar: (cargoId: string) => void;
  onGenerarOC?: (cargoId: string) => void;
  colCount: number;
}) {
  const [abierto, setAbierto] = React.useState(true);

  const filasMar = margenDelConcepto(grupo, ctx);
  const estado = estadoMenosFirme(filasMar.map(f => f.estado));

  // Separar gastos e ingresos
  const gastos = grupo.cargos.filter(c => c.tipo === 'gasto');
  const ingresos = grupo.cargos.filter(c => c.tipo === 'ingreso');

  // Proveedores distintos en los gastos
  const proveedorIds = [...new Set(gastos.map(c => c.proveedorId ?? '__sin__'))];
  const tieneVariosProveedores = proveedorIds.length > 1;

  // Totales para la fila del concepto
  const costoTotal = filasMar.reduce((a, f) => a + f.costo, 0);
  const profitTotal = filasMar.reduce((a, f) => a + f.profit, 0);
  const ventaTotal = filasMar.reduce((a, f) => a + f.venta, 0);

  // Moneda principal (la más representativa)
  const monedaPrincipal = filasMar.length > 0 ? filasMar[0].moneda : (gastos[0]?.moneda ?? ingresos[0]?.moneda ?? 'USD');
  const variasMonedas = filasMar.length > 1;

  // Impuesto del concepto (del ingreso, que es el que se le cobra al cliente)
  const impuestoIngreso = ingresos[0]?.impuesto;

  // Margen a nivel concepto
  const margenConcepto = ventaTotal === 0 ? null : profitTotal / ventaTotal;

  // Un proveedor nombrable
  const proveedorUnico = gastos.length === 1
    ? (nombreProveedor(gastos[0].proveedorId) || 'Sin proveedor')
    : gastos.length === 0
      ? '—'
      : null; // múltiples → se muestran abajo

  // Excedente total
  const excedenteTotal = filasMar.reduce((a, f) => a + f.excedente, 0);

  if (!tieneVariosProveedores) {
    // ── Concepto con un solo proveedor: una sola fila ──────────────────────
    const gasto = gastos[0] as CargoDetalle | undefined;
    const ingreso = ingresos[0] as CargoDetalle | undefined;

    return (
      <tr className="hover:bg-gray-50/60 group">
        {/* Concepto */}
        <td className="px-3 py-2 text-gray-700 font-medium">
          <div className="flex items-center gap-2">
            <span className="truncate">{grupo.titulo}</span>
            {!grupo.heredado && <BadgeCapturaManual />}
            {grupo.editado && <BadgeCorregido />}
          </div>
        </td>

        {/* Proveedor */}
        <td className="px-3 py-2 text-gray-600">
          {proveedorUnico ?? '—'}
        </td>

        {/* Costo */}
        <td className="px-3 py-2 text-right tabular-nums">
          {gasto ? (
            <CeldaCosto
              cargo={gasto}
              editable={editable}
              onEditarMonto={onEditarMonto}
            />
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>

        {/* Moneda */}
        <td className="px-3 py-2 font-mono text-gray-500 text-[11px]">
          {variasMonedas
            ? filasMar.map(f => f.moneda).join(' / ')
            : monedaPrincipal}
        </td>

        {/* Profit */}
        <td className="px-3 py-2 text-right tabular-nums">
          <CifraProfit filas={filasMar} />
        </td>

        {/* Impuesto */}
        <td className="px-3 py-2">
          <BadgeImpuesto impuesto={impuestoIngreso} />
        </td>

        {/* Venta */}
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#18181B]">
          {ingreso ? `$${money(ingreso.monto)}` : <span className="text-gray-300">—</span>}
        </td>

        {/* Margen */}
        <td className={`px-3 py-2 text-right tabular-nums ${margenConcepto !== null && margenConcepto < 0 ? 'text-peligro' : 'text-emerald-600'}`}>
          {margenConcepto === null ? '—' : `${(margenConcepto * 100).toFixed(1)}%`}
        </td>

        {/* Estado */}
        <td className="px-3 py-2">
          <BadgeEstado estado={estado} />
          {excedenteTotal > 0 && (
            <span className="ml-1 text-[10px] font-bold text-peligro" title={`Excedente: +$${money(excedenteTotal)}`}>
              +${money(excedenteTotal)}
            </span>
          )}
        </td>

        {/* Cliente a facturar */}
        <td className="px-3 py-2 text-gray-500 text-[11px] max-w-[160px] truncate" title={clienteCobrar}>
          {clienteCobrar || '—'}
        </td>

        {/* Acciones */}
        {editable && (
          <td className="px-2 py-2">
            <AccionesCargo
              cargo={gasto}
              editable={editable}
              onRestaurar={onRestaurar}
              onQuitar={onQuitar}
              onGenerarOC={onGenerarOC}
            />
          </td>
        )}
      </tr>
    );
  }

  // ── Concepto con varios proveedores: renglón encabezado + sub-renglones ──

  return (
    <>
      {/* Renglón encabezado del concepto */}
      <tr className="bg-gray-50/40 hover:bg-gray-50/80">
        {/* Concepto */}
        <td className="px-3 py-2 text-gray-700 font-medium">
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            className="inline-flex items-center gap-1.5"
          >
            {abierto
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
            <span className="truncate">{grupo.titulo}</span>
          </button>
          {!grupo.heredado && <BadgeCapturaManual />}
          {grupo.editado && <BadgeCorregido />}
          <span className="ml-2 text-[10px] text-gray-400">
            {gastos.length} proveedor{gastos.length !== 1 ? 'es' : ''}
          </span>
        </td>

        {/* Proveedor — vacío, se ve en sub-renglones */}
        <td className="px-3 py-2 text-gray-400 text-[11px]">varios</td>

        {/* Costo total del concepto */}
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700">
          ${money(costoTotal)}
        </td>

        {/* Moneda */}
        <td className="px-3 py-2 font-mono text-gray-500 text-[11px]">
          {variasMonedas
            ? filasMar.map(f => f.moneda).join(' / ')
            : monedaPrincipal}
        </td>

        {/* Profit a nivel concepto */}
        <td className="px-3 py-2 text-right tabular-nums">
          <CifraProfit filas={filasMar} />
        </td>

        {/* Impuesto */}
        <td className="px-3 py-2">
          <BadgeImpuesto impuesto={impuestoIngreso} />
        </td>

        {/* Venta a nivel concepto (no se prorratea) */}
        <td className="px-3 py-2 text-right tabular-nums font-semibold text-[#18181B]">
          {ingresos.length > 0
            ? `$${money(ingresos.reduce((a, c) => a + c.monto, 0))}`
            : <span className="text-gray-300">—</span>}
        </td>

        {/* Margen a nivel concepto */}
        <td className={`px-3 py-2 text-right tabular-nums ${margenConcepto !== null && margenConcepto < 0 ? 'text-peligro' : 'text-emerald-600'}`}>
          {margenConcepto === null ? '—' : `${(margenConcepto * 100).toFixed(1)}%`}
        </td>

        {/* Estado */}
        <td className="px-3 py-2">
          <BadgeEstado estado={estado} />
          {excedenteTotal > 0 && (
            <span className="ml-1 text-[10px] font-bold text-peligro" title={`Excedente: +$${money(excedenteTotal)}`}>
              +${money(excedenteTotal)}
            </span>
          )}
        </td>

        {/* Cliente a facturar */}
        <td className="px-3 py-2 text-gray-500 text-[11px] max-w-[160px] truncate" title={clienteCobrar}>
          {clienteCobrar || '—'}
        </td>

        {editable && <td className="px-2 py-2" />}
      </tr>

      {/* Sub-renglones por proveedor */}
      {abierto && gastos.map(gasto => (
        <tr key={gasto.id} className="hover:bg-gray-50/60 group bg-white">
          {/* Concepto — sangrado */}
          <td className="pl-9 pr-3 py-1.5 text-gray-500 text-[11px]">
            {gasto.concepto}
          </td>

          {/* Proveedor */}
          <td className="px-3 py-1.5 text-gray-600 text-[11px]">
            {nombreProveedor(gasto.proveedorId) || (
              <span className="text-amber-600 font-semibold" title="Sin proveedor no se sabe a quién pagarle.">
                Sin proveedor
              </span>
            )}
          </td>

          {/* Costo */}
          <td className="px-3 py-1.5 text-right tabular-nums">
            <CeldaCosto
              cargo={gasto}
              editable={editable}
              onEditarMonto={onEditarMonto}
            />
          </td>

          {/* Moneda */}
          <td className="px-3 py-1.5 font-mono text-gray-500 text-[11px]">
            {gasto.moneda}
          </td>

          {/* Profit — vacío en sub-renglones (se ve arriba) */}
          <td className="px-3 py-1.5" />
          {/* Impuesto — vacío en sub-renglones */}
          <td className="px-3 py-1.5" />
          {/* Venta — no se prorratea */}
          <td className="px-3 py-1.5" />
          {/* Margen — vacío en sub-renglones */}
          <td className="px-3 py-1.5" />
          {/* Estado */}
          <td className="px-3 py-1.5" />
          {/* Cliente a facturar */}
          <td className="px-3 py-1.5" />

          {/* Acciones */}
          {editable && (
            <td className="px-2 py-1.5">
              <AccionesCargo
                cargo={gasto}
                editable={editable}
                onRestaurar={onRestaurar}
                onQuitar={onQuitar}
                onGenerarOC={onGenerarOC}
              />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}

// ─── Celda de costo editable ─────────────────────────────────────────────────

const inputNum = 'w-[100px] px-2 py-1 text-right tabular-nums border border-transparent hover:border-gray-200 focus:border-primario focus:bg-white bg-transparent rounded outline-none text-[12px] font-semibold';

function CeldaCosto({ cargo, editable, onEditarMonto }: {
  cargo: CargoDetalle;
  editable: boolean;
  onEditarMonto: (id: string, monto: number) => void;
}) {
  const facturado = !!cargo.facturaId;
  const puedeEditar = editable && !facturado;
  const fueEditado = cargo.montoHeredado !== undefined;
  const original = montoOriginal(cargo);
  const desviacion = desviacionDe(cargo);

  if (puedeEditar) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <input
          type="number"
          value={cargo.monto}
          onChange={e => onEditarMonto(cargo.id, Number(e.target.value))}
          className={inputNum}
        />
        {fueEditado && desviacion !== 0 && (
          <span
            className={`text-[9px] font-bold ${desviacion > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
            title={`Cotizado: $${money(original)}`}
          >
            {desviacion > 0 ? '+' : ''}{money(desviacion)}
          </span>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 justify-end">
      {facturado && <Lock className="w-3 h-3 text-gray-300" />}
      <span className="tabular-nums font-semibold text-gray-700">${money(cargo.monto)}</span>
      {fueEditado && desviacion !== 0 && (
        <span
          className={`text-[9px] font-bold ${desviacion > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
          title={`Cotizado: $${money(original)}`}
        >
          {desviacion > 0 ? '+' : ''}{money(desviacion)}
        </span>
      )}
    </span>
  );
}

// ─── Acciones ────────────────────────────────────────────────────────────────

function AccionesCargo({ cargo, editable, onRestaurar, onQuitar, onGenerarOC }: {
  cargo: CargoDetalle | undefined;
  editable: boolean;
  onRestaurar: (id: string) => void;
  onQuitar: (id: string) => void;
  onGenerarOC?: (id: string) => void;
}) {
  if (!cargo) return null;

  const facturado = !!cargo.facturaId;
  const fueEditado = cargo.montoHeredado !== undefined;
  const conversion = puedeConvertirse(cargo);

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Orden de compra / solicitar pago */}
      {cargo.ordenCompraId ? (
        <EnlaceEntidad tipo="ordenCompra" id={cargo.ordenCompraId} title="Ya generó una orden de compra">
          <span className="text-[9px] font-bold">OC</span>
        </EnlaceEntidad>
      ) : onGenerarOC && conversion.puede ? (
        <button
          onClick={() => onGenerarOC(cargo.id)}
          className="p-1 text-primario hover:text-primario/80"
          title="Solicitar pago"
        >
          <Receipt className="w-3.5 h-3.5" />
        </button>
      ) : null}

      {/* Restaurar */}
      {fueEditado && (
        <button
          onClick={() => onRestaurar(cargo.id)}
          className="p-1 text-gray-300 hover:text-gray-600"
          title="Volver al importe cotizado"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Quitar */}
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
  );
}

// ─── Cifra de Profit ──────────────────────────────────────────────────────────

function CifraProfit({ filas }: { filas: MargenMoneda[] }) {
  if (filas.length === 0) return <span className="text-gray-300">—</span>;

  // Una sola moneda: número directo
  if (filas.length === 1) {
    const f = filas[0];
    return (
      <span className={`font-semibold tabular-nums ${f.profit < 0 ? 'text-peligro' : 'text-emerald-600'}`}>
        ${money(f.profit)}
      </span>
    );
  }

  // Varias monedas: una por línea
  return (
    <div className="space-y-0.5">
      {filas.map(f => (
        <div key={f.moneda} className={`font-semibold tabular-nums text-[11px] ${f.profit < 0 ? 'text-peligro' : 'text-emerald-600'}`}>
          ${money(f.profit)} <span className="text-gray-400 font-mono text-[9px]">{f.moneda}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Badges ──────────────────────────────────────────────────────────────────

const ETIQUETA_ESTADO: Record<EstadoCosto, string> = {
  estimado: 'estimado',
  facturado: 'facturado',
  pagado: 'pagado',
};

const EXPLICA_ESTADO: Record<EstadoCosto, string> = {
  estimado: 'Todavía no hay factura ni pago: el costo es el que se cotizó.',
  facturado: 'El proveedor ya facturó o el costo se corrigió; falta pagarlo.',
  pagado: 'Ya salió el dinero: es el monto de la orden de compra.',
};

const TONO_ESTADO: Record<EstadoCosto, string> = {
  estimado: 'bg-gray-100 text-gray-500',
  facturado: 'bg-amber-50 text-amber-700 border border-amber-100',
  pagado: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
};

function BadgeEstado({ estado }: { estado: EstadoCosto }) {
  return (
    <span
      className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${TONO_ESTADO[estado]}`}
      title={EXPLICA_ESTADO[estado]}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

const ETIQUETA_IMPUESTO: Record<string, string> = {
  iva16: 'IVA 16%',
  iva0: 'IVA 0%',
  exento: 'Exento',
};

function BadgeImpuesto({ impuesto }: { impuesto?: 'iva16' | 'iva0' | 'exento' }) {
  if (!impuesto) {
    return <span className="text-[10px] text-gray-400">—</span>;
  }
  return (
    <span className="text-[10px] text-gray-600 font-medium">
      {ETIQUETA_IMPUESTO[impuesto] ?? impuesto}
    </span>
  );
}

function BadgeCapturaManual() {
  return (
    <span className="text-[8px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded shrink-0 ml-1.5">
      Capturado aquí
    </span>
  );
}

function BadgeCorregido() {
  return (
    <span className="text-[8px] font-bold uppercase tracking-wider bg-primario/10 text-primario px-1.5 py-0.5 rounded shrink-0 ml-1">
      Corregido
    </span>
  );
}

export type { MonedaCargo };
