import React, { useState } from 'react';
import { X, Building2 } from 'lucide-react';
import type { OrdenCompra } from './OrdenesCompraData';
import type { ProveedorVermur } from '../proveedores/ProveedoresData';
import type { ConceptoVermur } from '../conceptos/ConceptosData';

/**
 * C-3. El segundo origen: la orden SUELTA.
 *
 * Textual del cliente: «habíamos mencionado cargar todo lo que es gastos de
 * oficina aquí en el sistema... eso también lo cargaría el área de
 * administración». Luz, nómina, servicios, insumos: gasto real de Vermur que
 * no cuelga de ningún embarque y que hoy vive fuera del sistema.
 *
 * Es el mismo documento y el mismo flujo que la orden de un embarque —se
 * solicita, se gestiona, se autoriza, se paga— y por eso NO es un modelo
 * aparte: solo cambia `origen`, y con él lo que se hereda. Una orden de
 * oficina no tiene embarque ni cliente, así que esos campos nacen en null en
 * vez de rellenarse con algo.
 */

interface Props {
  proveedores: ProveedorVermur[];
  conceptos: ConceptoVermur[];
  onCancelar: () => void;
  onCrear: (datos: Omit<OrdenCompra, 'id' | 'folio' | 'createdAt' | 'updatedAt'>) => void;
  solicitante: { uid: string; nombre: string };
}

export default function NuevaOCOficina({
  proveedores, conceptos, onCancelar, onCrear, solicitante,
}: Props) {
  const [proveedorId, setProveedorId] = useState('');
  const [conceptoId, setConceptoId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('MXN');
  const [fechaRequerida, setFechaRequerida] = useState(new Date().toISOString().slice(0, 10));
  const [urgente, setUrgente] = useState(false);

  const proveedor = proveedores.find(p => p.id === proveedorId);
  const concepto = conceptos.find(c => c.id === conceptoId);
  const importe = Number(monto);

  /**
   * Qué falta para poder solicitar. Se enseña en vez de deshabilitar el botón
   * a secas: un botón gris no dice cuál de los cuatro campos es el que falla.
   */
  const faltantes: string[] = [];
  if (!proveedor) faltantes.push('a quién se le paga');
  if (!concepto) faltantes.push('el concepto del gasto');
  if (!importe || importe <= 0) faltantes.push('el importe');
  if (!fechaRequerida) faltantes.push('para cuándo se necesita');

  const enviar = () => {
    if (faltantes.length > 0 || !proveedor || !concepto) return;
    const ahora = new Date().toISOString();

    onCrear({
      origen: 'oficina',
      // Una orden de oficina no cuelga de nada. Se deja en null en vez de
      // inventar un embarque o un cliente que no existen.
      embarqueId: null,
      embarqueFolio: null,
      clienteId: null,
      clienteNombre: null,

      proveedorId: proveedor.id,
      proveedorNombre: proveedor.nombre,
      conceptoId: concepto.id,
      conceptoNombre: concepto.nombre,

      descripcion: descripcion.trim() || `Gasto de oficina: ${concepto.nombre}.`,
      monto: importe,
      moneda,

      fechaRequerida,
      fechaSugeridaPago: null,

      urgencia: urgente ? 'urgente' : 'normal',
      estado: 'solicitada',
      motivoRechazo: null,
      historialEstados: [{
        estado: 'solicitada',
        fecha: ahora,
        usuarioId: solicitante.uid,
        usuarioNombre: solicitante.nombre,
      }],

      solicitadaPor: { uid: solicitante.uid, nombre: solicitante.nombre, fecha: ahora },
      gestionadaPor: null,
      autorizadaPor: null,
      pagadaPor: null,

      cuentaBancariaId: null,
      bancoSalida: null,
      cuentaSalida: null,
      facturaAsociada: null,
      comprobantePago: null,

      esAnticipo: false,
      anticiposCruzados: [],
      saldoPendiente: null,
      montoDisponible: null,

      activo: true,
    });
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onCancelar} />

      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-gray-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#18181B] uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primario" /> Gasto de oficina
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Luz, nómina, servicios, insumos: lo que no cuelga de un embarque.
            </p>
          </div>
          <button onClick={onCancelar} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <Campo rotulo="A quién se le paga">
            <select
              value={proveedorId}
              onChange={e => setProveedorId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario"
            >
              <option value="">Elige un proveedor…</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Concepto del gasto">
            {/* Se elige del catálogo, nunca se teclea: sin conceptoId el gasto
                no se puede clasificar ni exportar a la póliza contable. */}
            <select
              value={conceptoId}
              onChange={e => setConceptoId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario"
            >
              <option value="">Elige un concepto…</option>
              {conceptos.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Campo>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Campo rotulo="Importe">
                <input
                  type="number"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] tabular-nums outline-none focus:border-primario"
                />
              </Campo>
            </div>
            <Campo rotulo="Moneda">
              <select
                value={moneda}
                onChange={e => setMoneda(e.target.value as 'MXN' | 'USD')}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario"
              >
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </Campo>
          </div>

          <Campo rotulo="Se necesita el">
            <input
              type="date"
              value={fechaRequerida}
              onChange={e => setFechaRequerida(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario"
            />
          </Campo>

          <Campo rotulo="Detalle (opcional)">
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Recibo CFE agosto, nómina segunda quincena…"
              className="w-full h-16 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario resize-none"
            />
          </Campo>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={urgente}
              onChange={e => setUrgente(e.target.checked)}
              className="accent-primario"
            />
            <span className="text-[12px] text-gray-600">Marcar como urgente</span>
          </label>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
          {faltantes.length > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Falta {faltantes.join(', ')}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancelar}
              className="px-4 py-2 text-[12px] font-semibold text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={faltantes.length > 0}
              className="px-4 py-2 bg-primario hover:bg-primario-hover disabled:opacity-40 disabled:hover:bg-primario text-white text-[12px] font-bold uppercase tracking-wider rounded-lg transition-colors"
            >
              Solicitar pago
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
        {rotulo}
      </label>
      {children}
    </div>
  );
}
