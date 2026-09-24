import React from 'react';
import { Trash2, Undo2, Lock, AlertTriangle, Receipt } from 'lucide-react';
import type { CargoDetalle, MonedaCargo } from './EmbarquesData';
import {
  agruparCargos, desviacionDe, montoOriginal, GrupoCargos,
} from '../../lib/cargosEditables';
import {
  margenDelConcepto, estadoMenosFirme, TEXTO_SIN_COMPARAR,
  type ContextoMargen, type DesfaseOC, type EstadoCosto, type MargenMoneda,
  type OCParaMargen,
} from '../../lib/margenRealConcepto';
import { puedeConvertirse } from '../../lib/ocDesdeCargo';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';

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
  /**
   * Las órdenes de compra del embarque. De ellas sale el costo REAL: lo que
   * el proveedor facturó y lo que se le pagó. Sin ellas, todo concepto se lee
   * como estimado, que es la verdad cuando no hay pagos.
   */
  ordenes?: OCParaMargen[];
  /** MXN por USD. Ausente = no se compara entre monedas (§4.3). */
  tipoCambio?: number | null;
  /** Solo Operaciones corrige costos. Los demás leen. */
  editable: boolean;
  /** Resuelve el nombre del proveedor. Devuelve '' si no lo conoce. */
  nombreProveedor: (id: string | undefined) => string;
  onEditarMonto: (cargoId: string, monto: number) => void;
  onRestaurar: (cargoId: string) => void;
  onQuitar: (cargoId: string) => void;
  /**
   * C-3 · Convierte el gasto en orden de compra. Ausente si el rol no puede
   * solicitar pagos: entonces la columna no aparece en vez de aparecer muerta.
   */
  onGenerarOC?: (cargoId: string) => void;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const signo = (n: number) => `${n > 0 ? '+' : ''}${money(n)}`;

export default function TablaCargosEmbarque({
  detalles, ordenes = [], tipoCambio, editable, nombreProveedor,
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

  return (
    <div className="space-y-4">
      {grupos.map(g => (
        <GrupoCard
          key={g.clave}
          grupo={g}
          ctx={ctx}
          editable={editable}
          nombreProveedor={nombreProveedor}
          onEditarMonto={onEditarMonto}
          onRestaurar={onRestaurar}
          onQuitar={onQuitar}
          onGenerarOC={onGenerarOC}
        />
      ))}
    </div>
  );
}

// ─── Una tarjeta por concepto ─────────────────────────────────────────────────

function GrupoCard({
  grupo, ctx, editable, nombreProveedor, onEditarMonto, onRestaurar, onQuitar, onGenerarOC,
}: { grupo: GrupoCargos; ctx: ContextoMargen } & Omit<Props, 'detalles' | 'ordenes' | 'tipoCambio'>) {
  const filas = margenDelConcepto(grupo, ctx);
  const porMoneda = new Map<string, MargenMoneda>(filas.map(f => [f.moneda, f]));
  const estado = estadoMenosFirme(filas.map(f => f.estado));
  const desfases = new Map(filas.flatMap(f => f.desfases.map(d => [d.cargoId, d] as const)));

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
              <span className="text-[8px] font-bold uppercase tracking-wider bg-primario/10 text-primario px-1.5 py-0.5 rounded shrink-0">
                Corregido
              </span>
            )}
            <BadgeEstado estado={estado} />
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
          {filas.map(f => (
            <div key={f.moneda} className="text-right">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                Profit {f.moneda}
              </p>
              {/* El MISMO número que el renglón de total: uno solo por concepto. */}
              <p className={`text-[13px] font-bold tabular-nums ${
                f.profit < 0 ? 'text-peligro' : 'text-emerald-600'}`}>
                ${money(f.profit)}
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
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Pago</th>
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
                onGenerarOC={onGenerarOC}
                desfase={desfases.get(c.id)}
              />
            ))}
          </tbody>
          <tfoot>
            {/*
              El renglón de total con las columnas de Pricing: Costo · Profit ·
              Venta · Margen, los mismos nombres y el mismo orden que en la
              ficha de cotización. La diferencia es que aquí el costo es el
              REAL —lo facturado o lo pagado— y por eso dice en qué estado
              está: un estimado y un pagado no se leen igual.

              Va a todo el ancho en vez de repartirse entre las columnas de
              arriba porque no coinciden: el renglón de la tabla es el CARGO, y
              la venta y el costo de un concepto viven en renglones distintos.
            */}
            {filas.map(f => (
              <tr key={f.moneda} className="border-t border-gray-200 bg-gray-50/60">
                <td className="px-3 py-2" colSpan={editable ? 8 : 7}>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mr-auto">
                      Total {f.moneda}
                    </span>

                    <Cifra
                      etiqueta="Costo"
                      valor={`$${money(f.costo)}`}
                      nota={ETIQUETA_ESTADO[f.estado]}
                      title={`Cotizado $${money(f.cotizado)}. ${EXPLICA_ESTADO[f.estado]}`}
                    />
                    {f.excedente > 0 && (
                      <span
                        className="text-[11px] font-bold text-peligro bg-peligro-suave border border-peligro/20 px-2 py-0.5 rounded"
                        title={`Se cotizó $${money(f.cotizado)} y el costo real es $${money(f.costo)}.`}
                      >
                        Excedente +${money(f.excedente)}
                      </span>
                    )}
                    <Cifra
                      etiqueta="Profit"
                      valor={`$${money(f.profit)}`}
                      tono={f.profit < 0 ? 'peligro' : 'bien'}
                    />
                    <Cifra etiqueta="Venta" valor={`$${money(f.venta)}`} />
                    <Cifra
                      etiqueta="Margen"
                      valor={f.margen === null ? '—' : `${(f.margen * 100).toFixed(1)}%`}
                      tono={f.margen !== null && f.margen < 0 ? 'peligro' : undefined}
                      title={f.margen === null ? 'Sin venta en esta moneda no hay porcentaje que calcular.' : undefined}
                    />
                  </div>

                  {/* Por qué el costo no se pudo comparar contra lo cotizado. */}
                  {f.avisos.map(a => (
                    <p key={a} className="text-[10px] text-amber-700 flex items-center gap-1 mt-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {TEXTO_SIN_COMPARAR[a]}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Un renglón ───────────────────────────────────────────────────────────────

const inputNum = 'w-[110px] px-2 py-1 text-right tabular-nums border border-transparent hover:border-gray-200 focus:border-primario focus:bg-white bg-transparent rounded outline-none text-[12px] font-semibold';

function Renglon({
  cargo, desfase, editable, nombreProveedor, onEditarMonto, onRestaurar, onQuitar, onGenerarOC,
}: { cargo: CargoDetalle; desfase?: DesfaseOC } & Omit<Props, 'detalles' | 'ordenes' | 'tipoCambio'>) {
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

  const conversion = puedeConvertirse(cargo);

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
          /*
           * Sin corrección, el costo cotizado ES el monto de la línea: nació
           * de la cotización y nadie lo ha movido. Pintarlo en gris en vez de
           * «—» es la diferencia entre una columna que informa y una que
           * parece rota. El tachado y la desviación se reservan para cuando sí
           * hubo corrección: sin ella no hay nada que tachar.
           */
          <span
            className="text-gray-400"
            title="Nadie ha corregido este importe: sigue siendo el que se cotizó."
          >
            ${money(original)}
          </span>
        )}
      </td>

      {/* C-3 · De aquí sale la orden de compra. El gasto ya sabe a quién se le
          paga, por qué concepto y cuánto: recapturarlo a mano es pedir que
          alguien copie datos que el sistema ya tiene. */}
      <td className="px-3 py-1.5">
        {cargo.ordenCompraId ? (
          <span className="inline-flex flex-col items-start gap-0.5">
            <EnlaceEntidad
              tipo="ordenCompra"
              id={cargo.ordenCompraId}
              title="Ya generó una orden de compra"
            >
              Orden generada
            </EnlaceEntidad>
            {/*
              La orden se emite copiando el cargo y después nadie la vuelve a
              tocar. Si los dos números difieren es porque alguien corrigió el
              cargo DESPUÉS de pedir el pago; decirlo evita que el importe de
              la orden parezca un error de captura.
            */}
            {desfase && (
              <span
                className="text-[9px] text-amber-700"
                title="El cargo se corrigió después de generar la orden. Lo que se pague es lo que dice la orden."
              >
                La OC se generó por ${money(desfase.oc)}, el cargo dice ${money(desfase.cargo)}
              </span>
            )}
          </span>
        ) : onGenerarOC && conversion.puede ? (
          <button
            onClick={() => onGenerarOC(cargo.id)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primario hover:underline"
          >
            <Receipt className="w-3 h-3" /> Solicitar pago
          </button>
        ) : onGenerarOC && cargo.tipo === 'gasto' ? (
          <span className="text-[10px] text-amber-600" title={conversion.detalle}>
            {conversion.motivo === 'sin_proveedor' ? 'Falta proveedor'
              : conversion.motivo === 'monto_cero' ? 'Sin importe'
              : '—'}
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

// ─── Piezas ───────────────────────────────────────────────────────────────────

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

/**
 * Qué tan firme es el costo del concepto.
 *
 * Es el MENOS firme de sus gastos: con un concepto estimado entre dos pagados,
 * el margen todavía se puede mover y el badge tiene que decirlo.
 */
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

function Cifra({ etiqueta, valor, nota, tono, title }: {
  etiqueta: string;
  valor: string;
  nota?: string;
  tono?: 'peligro' | 'bien';
  title?: string;
}) {
  return (
    <span className="text-right" title={title}>
      <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">
        {etiqueta}
      </span>
      <span className={`block text-[12px] font-bold tabular-nums ${
        tono === 'peligro' ? 'text-peligro' : tono === 'bien' ? 'text-emerald-600' : 'text-gray-700'}`}>
        {valor}
        {nota && <span className="ml-1 text-[9px] font-semibold text-gray-400 uppercase">{nota}</span>}
      </span>
    </span>
  );
}
