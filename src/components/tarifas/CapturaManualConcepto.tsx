/**
 * CapturaManualConcepto.tsx (TA-5 — spot inverso)
 *
 * Mini formulario inline para agregar manualmente una cotización de
 * proveedor a un concepto. Opcionalmente guarda como tarifa spot
 * en el catálogo para futuras cotizaciones.
 */

import React, { useState, useMemo } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { TarifaVermur, hoyISO } from './TarifasData';
import { normalize } from './TarifaSuggestions';
import { CotizacionProveedor } from '../quotes/QuotesData';
import { useProveedores } from '../../hooks/useProveedores';
import { useConceptos } from '../../hooks/useConceptos';
import { contactoPrincipal } from '../proveedores/ProveedoresData';
import { useAuth } from '../../auth/AuthContext';
import SelectorProveedor from '../proveedores/SelectorProveedor';

interface Props {
  conceptoNombre: string;
  onGuardar: (cp: CotizacionProveedor) => void;
  onCrearSpot?: (t: TarifaVermur) => Promise<void>;
}

export default function CapturaManualConcepto({ conceptoNombre, onGuardar, onCrearSpot }: Props) {
  const { user } = useAuth();
  const { proveedores } = useProveedores();
  const { conceptos } = useConceptos();

  const [open, setOpen] = useState(false);
  const [proveedorId, setProveedorId] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('USD');
  const [guardarSpot, setGuardarSpot] = useState(false);
  const [saving, setSaving] = useState(false);

  const provActivos = useMemo(
    () => proveedores.filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [proveedores],
  );

  const matchedConceptId = useMemo(() => {
    const q = normalize(conceptoNombre);
    if (!q) return null;
    const exact = conceptos.find(c => normalize(c.nombre) === q);
    return exact?.id ?? null;
  }, [conceptoNombre, conceptos]);

  const handleSave = async () => {
    if (!proveedorId || !monto || Number(monto) <= 0) return;
    setSaving(true);

    const prov = proveedores.find(p => p.id === proveedorId);
    const contacto = prov ? contactoPrincipal(prov) : undefined;

    const cp: CotizacionProveedor = {
      id: `cp-${Date.now()}`,
      proveedor: prov?.nombre ?? '',
      contacto: contacto?.nombre ?? '',
      monto: Number(monto),
      moneda,
      seleccionada: false,
      estadoRespuesta: 'recibida',
      proveedorId,
      conceptoId: matchedConceptId,
    };
    onGuardar(cp);

    if (guardarSpot && onCrearSpot && matchedConceptId) {
      const now = new Date().toISOString();
      const spot: TarifaVermur = {
        id: `TAR-SPOT-${Date.now()}`,
        tipo: 'spot',
        conceptoId: matchedConceptId,
        proveedorId,
        puertoOrigenId: null,
        puertoDestinoId: null,
        terminalId: null,
        rutaTexto: null,
        precios: { monto: Number(monto), unidad: 'FIJO' },
        moneda,
        vigenciaTexto: 'Spot — captura de cotización',
        fechaInicio: hoyISO(),
        fechaFin: null,
        tiempoTransitoDias: null,
        freeTimeDias: null,
        condiciones: '',
        activo: true,
        origenDatos: 'cotizacion',
        creadoPor: user?.uid ?? '',
        fechaAlta: hoyISO(),
        updatedAt: now,
      };
      try { await onCrearSpot(spot); } catch { /* error silencioso — la CotProv ya se guardó */ }
    }

    // Reset
    setProveedorId('');
    setMonto('');
    setGuardarSpot(false);
    setSaving(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[9px] font-bold text-gray-400 hover:text-primario uppercase tracking-wide transition-colors"
      >
        <Plus className="w-3 h-3" />
        Agregar cotización manual
      </button>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50/50 p-2.5 space-y-2">
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
        Captura manual de cotización
      </p>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Proveedor</label>
          {/* Eran 544 en un <select> plano. Mismo criterio que el
              ConceptoSelector: con muchas opciones, la lista estorba. */}
          <SelectorProveedor
            compacto
            proveedores={provActivos}
            valorId={proveedorId || null}
            onSelect={p => setProveedorId(p.id)}
          />
        </div>
        <div className="w-[90px]">
          <label className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Monto</label>
          <input
            type="number"
            step="0.01"
            className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 bg-white focus:border-primario outline-none"
            value={monto}
            onChange={e => setMonto(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="w-[70px]">
          <label className="block text-[9px] text-gray-400 font-bold uppercase mb-0.5">Moneda</label>
          <select
            className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 bg-white focus:border-primario outline-none"
            value={moneda}
            onChange={e => setMoneda(e.target.value as 'USD' | 'MXN')}
          >
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </select>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !proveedorId || !monto}
          className="flex items-center gap-1 text-[10px] font-bold text-white bg-primario hover:bg-primario-hover disabled:opacity-40 px-3 py-1 rounded transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Agregar
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-[10px] font-medium text-gray-400 hover:text-gray-600 px-2 py-1 transition-colors"
        >
          Cancelar
        </button>
      </div>

      {/* Spot inverso checkbox */}
      {onCrearSpot && matchedConceptId && (
        <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={guardarSpot}
            onChange={e => setGuardarSpot(e.target.checked)}
            className="bg-primario"
          />
          Guardar como tarifa spot para futuras cotizaciones
        </label>
      )}
    </div>
  );
}
