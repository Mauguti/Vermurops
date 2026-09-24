import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus, Trash2, ChevronUp, ChevronDown, Lock, Settings2, X } from 'lucide-react';
import type { LineaPlana } from '../../lib/lineasCotizacion';
import { compararConTarget } from '../../lib/lineasCotizacion';
import {
  sumarPorMoneda, monedasConMonto, Moneda, TotalPorMoneda,
} from '../../lib/sumarPorMoneda';
import ConceptoSelector from '../conceptos/ConceptoSelector';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import EstadoVacio from '../ui/EstadoVacio';

/**
 * C.4 · La tabla única de conceptos. Reemplaza a las cinco tarjetas por
 * modalidad.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * Luis: «falta quitar los cuadros que teníamos, para que solo quedara 1».
 * Ventas: «sugiero que los servicios a cotizar coincidan con el catálogo de
 * servicios que Pricing tendrá que cargar».
 *
 * La modalidad NO desaparece: deja de ser el criterio de agrupación visual y
 * pasa a ser la columna «Servicio». Los datos no se mueven — cada línea sigue
 * colgando de su servicio, que es de donde la matriz comparativa y la
 * generación de embarques (servicio.tipo → modalidad → folio) leen. El cambio
 * es de presentación; esa cadena ni se entera.
 *
 * ── La columna «Servicio» (decisión de Mau, opción a) ──────────────────────
 * Es un SELECTOR mientras la línea está fresca —sin concepto del catálogo—
 * y queda FIJA después: de la pertenencia dependen la matriz y el folio del
 * embarque, así que mover una línea trabajada reagruparía dinero por debajo.
 * Con un solo servicio en la cotización se preselecciona sola: elegir entre
 * una opción es fricción sin propósito.
 */

export interface ServicioDeLaTabla {
  id: string;
  /** Nombre legible: del catálogo, o el tipo tal cual si no está en él. */
  etiqueta: string;
}

interface Props {
  lineas: LineaPlana[];
  servicios: ServicioDeLaTabla[];
  /** Solo lectura: Ventas no edita, y una cotización congelada tampoco. */
  editable: boolean;
  soloLectura: boolean;
  lineaActivaId?: string | null;
  conceptosActivos: ConceptoVermur[];
  onCrearConcepto?: () => void;
  onEditarLinea: (lineaId: string, campo: 'costo' | 'profit' | 'target', valor: number) => void;
  onElegirConcepto: (lineaId: string, conceptoId: string, nombre: string) => void;
  onQuitarLinea: (lineaId: string) => void;
  onMoverLinea: (lineaId: string, direccion: 'arriba' | 'abajo') => void;
  /**
   * Agrega una línea al servicio indicado, YA con su concepto del catálogo.
   *
   * Bloque 0 (24-sep-2026): antes la línea nacía vacía al pulsar «Agregar
   * concepto» y el autoguardado la escribía en Firestore en ese instante.
   * Quien abandonaba el renglón dejaba un concepto sin nombre que bloqueaba
   * «Marcar ganada». Ahora el renglón es un BORRADOR local de la tabla y la
   * línea existe solo cuando se eligió el concepto.
   */
  onAgregarLinea: (servicioId: string, conceptoId: string, nombre: string) => void;
  onCompararProveedor: (lineaId: string) => void;
  /** Mueve una línea FRESCA a otro servicio. La lib se niega si ya está fija. */
  onCambiarServicio: (lineaId: string, servicioId: string) => void;
  /** Abre los datos que el embarque necesita para ese servicio. */
  onDatosEmbarque: (servicioId: string) => void;
  /**
   * Agrega un servicio a la cotización YA creada. Vive aquí —junto a los
   * chips de servicios— y no como botón suelto al pie de la página: el caso
   * real existe (el cliente pide sumar el despacho a media negociación), pero
   * es excepción, no flujo.
   */
  onAgregarServicio?: () => void;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TablaConceptos({
  lineas, servicios, editable, soloLectura, lineaActivaId, conceptosActivos,
  onCrearConcepto, onEditarLinea, onElegirConcepto, onQuitarLinea, onMoverLinea,
  onAgregarLinea, onCompararProveedor, onCambiarServicio, onDatosEmbarque,
  onAgregarServicio,
}: Props) {
  /** Servicio del renglón borrador; null = no hay borrador. */
  const [borradorServicioId, setBorradorServicioId] = useState<string | null>(null);
  const abrirBorrador = () => { if (servicios[0]) setBorradorServicioId(servicios[0].id); };
  const confirmarBorrador = (conceptoId: string, nombre: string) => {
    if (!borradorServicioId) return;
    onAgregarLinea(borradorServicioId, conceptoId, nombre);
    setBorradorServicioId(null);
  };
  const ordenadas = [...lineas].sort((a, b) => a.orden - b.orden);

  /*
   * Totales POR MONEDA (§4.3). Las tarjetas viejas sumaban con un solo número
   * por modalidad — la deuda de getCostoOficial. El pie de la tabla única no
   * hereda ese vicio: un renglón de totales por cada moneda con movimiento.
   */
  const costoTotal = sumarPorMoneda(ordenadas, l => l.costo, l => l.moneda);
  const profitTotal = sumarPorMoneda(ordenadas, l => l.profit, l => l.moneda);
  const ventaTotal = sumarPorMoneda(ordenadas, l => l.venta, l => l.moneda);
  const monedas = [...new Set([
    ...monedasConMonto(costoTotal), ...monedasConMonto(ventaTotal),
  ])] as Moneda[];

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Encabezado: los servicios de la cotización y sus datos de embarque. */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60 gap-4">
        <div className="min-w-0">
          <span className="text-[13px] font-bold text-[#18181B]">Servicios</span>
          <span className="ml-2 text-[11px] text-gray-400">
            {ordenadas.length} concepto{ordenadas.length !== 1 ? 's' : ''}
          </span>
        </div>
        {/* «Datos del embarque» era un botón por tarjeta; ahora uno por
            servicio, aquí, porque tráfico y ruta viven en el SERVICIO. */}
        {editable && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {servicios.map(s => (
              <button
                key={s.id}
                onClick={() => onDatosEmbarque(s.id)}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-[#E11D48] px-2 py-1 rounded border border-gray-150 transition-colors"
                title={`Ruta, tráfico e información que el embarque de ${s.etiqueta} necesita`}
              >
                <Settings2 className="w-3 h-3" /> {s.etiqueta}
              </button>
            ))}
            {onAgregarServicio && (
              <button
                onClick={onAgregarServicio}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 hover:text-[#E11D48] px-2 py-1 rounded border border-dashed border-gray-200 transition-colors"
                title="Agregar un servicio a esta cotización"
              >
                <Plus className="w-3 h-3" /> Servicio
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left border-b border-gray-100">
              <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Servicio</th>
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
            {ordenadas.map(l => (
              <Renglon
                key={l.id}
                linea={l}
                servicios={servicios}
                editable={editable}
                soloLectura={soloLectura}
                activa={l.id === lineaActivaId}
                conceptosActivos={conceptosActivos}
                onCrearConcepto={onCrearConcepto}
                onEditar={onEditarLinea}
                onElegirConcepto={onElegirConcepto}
                onQuitar={onQuitarLinea}
                onMover={onMoverLinea}
                onComparar={onCompararProveedor}
                onCambiarServicio={onCambiarServicio}
              />
            ))}

            {borradorServicioId && editable && (
              <tr className="bg-amber-50/40">
                <td className="px-3 py-1.5">
                  {servicios.length > 1 ? (
                    <select
                      value={borradorServicioId}
                      onChange={e => setBorradorServicioId(e.target.value)}
                      className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] font-semibold text-gray-700 outline-none focus:border-[#E11D48] cursor-pointer"
                    >
                      {servicios.map(s => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
                    </select>
                  ) : (
                    <span className="text-[11px] text-gray-500 font-medium">{servicios[0]?.etiqueta}</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <ConceptoSelector
                    compacto
                    autoAbrir
                    selectedNombre={null}
                    conceptos={conceptosActivos}
                    onSelect={confirmarBorrador}
                    onCrearNuevo={onCrearConcepto}
                  />
                </td>
                <td colSpan={5} className="px-3 py-1.5 text-[10px] text-amber-700">
                  Elige el concepto del catálogo: la línea se crea al elegirlo.
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button onClick={() => setBorradorServicioId(null)} className="p-1 text-gray-300 hover:text-red-500" title="Cancelar">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            )}

            {ordenadas.length === 0 && !borradorServicioId && (
              <tr>
                <td colSpan={editable ? 8 : 7}>
                  <EstadoVacio
                    variante="plano"
                    titulo="Sin conceptos todavía"
                    detalle="Cada renglón es un concepto del catálogo con su proveedor, costo y profit. El total de la operación se arma de aquí."
                    accion={editable && servicios[0] ? (
                      <button
                        onClick={abrirBorrador}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#E11D48] hover:bg-[#E11D48]/5 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Agregar el primero
                      </button>
                    ) : undefined}
                  />
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            {/* Un renglón de totales POR MONEDA. Nunca un solo número (§4.3). */}
            {monedas.map(m => (
              <FilaTotal
                key={m}
                moneda={m}
                variasMonedas={monedas.length > 1}
                costo={costoTotal} profit={profitTotal} venta={ventaTotal}
                conAcciones={editable}
              />
            ))}
          </tfoot>
        </table>
      </div>

      {editable && servicios.length > 0 && !borradorServicioId && (
        <div className="px-3 py-2 border-t border-gray-100">
          {/* Con un servicio, directo. Con varios, nace en el primero y la
              columna «Servicio» del renglón fresco es donde se elige. */}
          <button
            onClick={abrirBorrador}
            className="flex items-center gap-1.5 text-[11px] font-bold text-[#E11D48] hover:bg-[#E11D48]/5 px-2 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar concepto
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Pie por moneda ───────────────────────────────────────────────────────────

function FilaTotal({ moneda, variasMonedas, costo, profit, venta, conAcciones }: {
  moneda: Moneda;
  variasMonedas: boolean;
  costo: TotalPorMoneda; profit: TotalPorMoneda; venta: TotalPorMoneda;
  conAcciones: boolean;
}) {
  const margen = venta[moneda] === 0 ? 0 : profit[moneda] / venta[moneda];
  return (
    <tr className="border-t border-gray-200 bg-gray-50/60 font-bold">
      <td className="px-3 py-2 text-[11px] text-gray-500 uppercase tracking-wider" colSpan={3}>
        Total{variasMonedas ? ` ${moneda}` : ''}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">${money(costo[moneda])}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-700">${money(profit[moneda])}</td>
      <td className="px-3 py-2 text-right tabular-nums text-[#18181B]">
        ${money(venta[moneda])} <span className="text-[10px] text-gray-400 font-mono">{moneda}</span>
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${margen < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {(margen * 100).toFixed(1)}%
      </td>
      {conAcciones && <td />}
    </tr>
  );
}

// ─── Un renglón ───────────────────────────────────────────────────────────────

const inputNum = 'w-[90px] px-2 py-1 text-right tabular-nums border border-transparent hover:border-gray-200 focus:border-[#E11D48] focus:bg-white bg-transparent rounded outline-none text-[12px]';

interface RenglonProps {
  linea: LineaPlana;
  servicios: ServicioDeLaTabla[];
  editable: boolean;
  soloLectura: boolean;
  activa: boolean;
  conceptosActivos: ConceptoVermur[];
  onCrearConcepto?: () => void;
  onEditar: Props['onEditarLinea'];
  onElegirConcepto: Props['onElegirConcepto'];
  onQuitar: (id: string) => void;
  onMover: (id: string, d: 'arriba' | 'abajo') => void;
  onComparar: (id: string) => void;
  onCambiarServicio: Props['onCambiarServicio'];
}

function Renglon({
  linea, servicios, editable, soloLectura, activa, conceptosActivos, onCrearConcepto,
  onEditar, onElegirConcepto, onQuitar, onMover, onComparar, onCambiarServicio,
}: RenglonProps) {
  const target = compararConTarget(linea);

  /*
   * El renglón es la zona de soltado del panel de tarifas y el clic que lo
   * activa — la lección del 1-sep: cuando se quitó el árbol de conceptos, se
   * fueron con él las dos formas de apuntar el panel. Viven en el RENGLÓN, no
   * en la tarjeta, así que sobreviven al cambio de agrupación.
   */
  const aceptaTarifas = editable && !!linea.conceptoLocalId;
  const { setNodeRef, isOver } = useDroppable({
    id: `fila-${linea.servicioId}-${linea.conceptoLocalId ?? linea.id}`,
    disabled: !aceptaTarifas,
    data: aceptaTarifas
      ? { type: 'concepto', conceptoId: linea.conceptoLocalId, servicioId: linea.servicioId }
      : undefined,
  });

  /*
   * La columna «Servicio»: selector solo mientras la línea está FRESCA (sin
   * concepto del catálogo, sin costo, sin tarifas) Y hay más de un servicio.
   * Con uno solo, texto: se preseleccionó sola.
   */
  const servicioElegible = editable
    && linea.origen === 'concepto'
    && !linea.conceptoId
    && linea.tarifasCount === 0
    && !linea.costoCapturado
    && servicios.length > 1;

  const etiquetaServicio = servicios.find(s => s.id === linea.servicioId)?.etiqueta
    ?? linea.servicioTipo;

  return (
    <tr
      ref={setNodeRef}
      onClick={() => { if (aceptaTarifas) onComparar(linea.id); }}
      title={aceptaTarifas && !activa ? 'Clic para ver sus tarifas en el panel' : undefined}
      className={`group transition-colors ${
        isOver ? 'bg-[#E11D48]/5 ring-1 ring-inset ring-[#E11D48]/30'
        : activa ? 'bg-[#E11D48]/[0.04] ring-1 ring-inset ring-[#E11D48]/25'
        : 'hover:bg-gray-50/60'} ${aceptaTarifas ? 'cursor-pointer' : ''}`}>

      <td className="px-3 py-1.5" onClick={e => servicioElegible && e.stopPropagation()}>
        {servicioElegible ? (
          <select
            value={linea.servicioId}
            onChange={e => onCambiarServicio(linea.id, e.target.value)}
            className="px-2 py-1 bg-amber-50 border border-amber-200 rounded text-[11px] font-semibold text-gray-700 outline-none focus:border-[#E11D48] cursor-pointer"
            title="Elige el servicio antes de trabajar la línea: después queda fijo."
          >
            {servicios.map(s => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
          </select>
        ) : (
          <span className="text-[11px] text-gray-500 font-medium">{etiquetaServicio}</span>
        )}
      </td>

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
        {activa && (
          <span className="block px-2 text-[9px] font-bold text-[#E11D48] uppercase tracking-wider">
            Tarifas del panel →
          </span>
        )}
      </td>

      <td className="px-3 py-1.5">
        {linea.proveedorNombre ? (
          aceptaTarifas ? (
            <button
              onClick={() => onComparar(linea.id)}
              className="text-gray-600 hover:text-[#E11D48] hover:underline text-left"
              title="Ver o cambiar sus tarifas en el panel"
            >
              {linea.proveedorNombre}
            </button>
          ) : (
            <span className="text-gray-600">{linea.proveedorNombre}</span>
          )
        ) : aceptaTarifas ? (
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
              onClick={e => e.stopPropagation()}
              className={inputNum}
            />
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
            onClick={e => e.stopPropagation()}
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
            <button onClick={e => { e.stopPropagation(); onMover(linea.id, 'arriba'); }} className="p-1 text-gray-300 hover:text-gray-600" title="Subir">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button onClick={e => { e.stopPropagation(); onMover(linea.id, 'abajo'); }} className="p-1 text-gray-300 hover:text-gray-600" title="Bajar">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button onClick={e => { e.stopPropagation(); onQuitar(linea.id); }} className="p-1 text-gray-300 hover:text-red-500" title="Quitar">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}
