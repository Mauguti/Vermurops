/**
 * BadgePrefactura.tsx (tarea 74 · P7)
 *
 * Una sola pieza para los tres lugares donde se ve la prefactura (columna de
 * la bandeja, renglón por factura y ficha de la orden), para que digan lo
 * mismo. Todo sale de `lib/prefactura.ts`; nada se guarda aquí.
 *
 * Color: «pendiente» es ámbar —aviso, no peligro— y «recibida» verde. El rojo
 * se reserva para errores y frenos (CLAUDE.md §4.20).
 */
import { Clock, FileCheck2, FileText } from 'lucide-react';
import type { OrdenCompra } from './OrdenesCompraData';
import { estadoPrefactura, textoFacturaPendiente } from '../../lib/prefactura';

export default function BadgePrefactura({ oc, vacio = true }: { oc: OrdenCompra; vacio?: boolean }) {
  const e = estadoPrefactura(oc);
  if (e === 'no_aplica') return vacio ? <span className="text-gray-300">—</span> : null;
  const base = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap';
  const motivo = oc.motivoPrefactura?.trim() || 'Se paga antes de tener la factura';
  if (e === 'factura_pendiente') {
    return (
      <span className={`${base} bg-amber-100 text-amber-800 border-amber-300`} title={motivo}>
        <Clock className="w-3 h-3" /> {textoFacturaPendiente(oc)}
      </span>
    );
  }
  if (e === 'factura_recibida') {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`} title={motivo}>
        <FileCheck2 className="w-3 h-3" /> Factura recibida
      </span>
    );
  }
  return (
    <span className={`${base} bg-primario/10 text-primario border-primario/30`} title={motivo}>
      <FileText className="w-3 h-3" /> Prefactura
    </span>
  );
}
