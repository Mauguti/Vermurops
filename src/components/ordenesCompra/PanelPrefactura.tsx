/**
 * PanelPrefactura.tsx (tarea 74 · P7)
 *
 * La casilla «Se paga antes de tener la factura» y su motivo, en la ficha de
 * la orden. Es lo ÚNICO que se guarda de la prefactura (`esPrefactura`,
 * `motivoPrefactura`); el estado —pendiente, días, recibida— se deriva.
 *
 * Quién la marca y cuándo deja de serlo son preguntas abiertas para Julio
 * (PLAN-PAGOS §5), así que no se decidieron: la marca es editable en
 * cualquier estado salvo rechazada, y llegar la factura NO la quita: solo
 * cambia lo que se deriva de ella.
 */
import { useEffect, useState } from 'react';
import type { OrdenCompra } from './OrdenesCompraData';
import { estadoPrefactura, motivoPrefacturaParaGuardar } from '../../lib/prefactura';

const AYUDA: Record<ReturnType<typeof estadoPrefactura>, string> = {
  no_aplica: 'Márcala cuando el proveedor cobra antes de facturar (por ejemplo, la naviera). Mientras no llegue la factura, aparecerá como pendiente en Cuentas por pagar.',
  por_pagar: 'Se puede pagar sin factura. Después del pago quedará como «Factura pendiente» hasta que se cargue la del proveedor.',
  factura_pendiente: 'Ya se pagó y falta la factura del proveedor. Cárgala en «Factura del proveedor» y dejará de estar pendiente.',
  factura_recibida: 'La factura ya está cargada. La marca se conserva como registro de que se pagó antes de facturar.',
};

export function PanelPrefactura({
  oc, puedeEditar, onActualizar,
}: {
  oc: OrdenCompra;
  puedeEditar: boolean;
  onActualizar: (cambios: Partial<OrdenCompra>) => void;
}) {
  const marcada = oc.esPrefactura === true;
  const [motivo, setMotivo] = useState(oc.motivoPrefactura ?? '');
  useEffect(() => { setMotivo(oc.motivoPrefactura ?? ''); }, [oc.id, oc.motivoPrefactura]);

  // Una orden sin marcar y sin permiso no tiene nada que decir.
  if (!marcada && !puedeEditar) return null;

  return (
    <div className="px-6 pt-4" data-testid="panel-prefactura">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <label className={`flex items-start gap-2.5 ${puedeEditar ? 'cursor-pointer' : 'cursor-default'}`}>
          <input
            type="checkbox"
            className="mt-0.5 accent-primario"
            checked={marcada}
            disabled={!puedeEditar}
            onChange={e => onActualizar(
              e.target.checked
                ? { esPrefactura: true }
                : { esPrefactura: false, motivoPrefactura: null },
            )}
          />
          <span>
            <span className="block text-[12px] font-bold text-gray-800">Prefactura · se paga antes de tener la factura</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">{AYUDA[estadoPrefactura(oc)]}</span>
          </span>
        </label>
        {marcada && (
          <div className="mt-2.5 pl-6">
            <input
              type="text"
              value={motivo}
              disabled={!puedeEditar}
              placeholder="Motivo (opcional): «la naviera cobra antes de facturar»"
              aria-label="Motivo de la prefactura"
              onChange={e => setMotivo(e.target.value)}
              onBlur={() => {
                const nuevo = motivoPrefacturaParaGuardar(motivo);
                if (nuevo !== (oc.motivoPrefactura ?? null)) onActualizar({ motivoPrefactura: nuevo });
              }}
              className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-[12px] outline-none focus:border-primario disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        )}
        {!puedeEditar && marcada && (
          <p className="mt-2 pl-6 text-[11px] text-gray-400">La marca la pone Operaciones.</p>
        )}
      </div>
    </div>
  );
}
