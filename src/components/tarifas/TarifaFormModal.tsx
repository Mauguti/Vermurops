import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { TarifaVermur, TipoTarifa, UnidadTarifa, PreciosTarifa, hoyISO } from './TarifasData';
import { useProveedores } from '../../hooks/useProveedores';
import { useConceptos } from '../../hooks/useConceptos';
import { usePuertos } from '../../hooks/usePuertos';
import { useAuth } from '../../auth/AuthContext';

interface Props {
  mode: 'crear' | 'editar';
  tarifa?: TarifaVermur;
  onClose: () => void;
  onCreate?: (t: TarifaVermur) => Promise<void>;
  onUpdate?: (id: string, data: Partial<TarifaVermur>) => Promise<void>;
}

const INPUT = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';

const UNIDADES: { key: UnidadTarifa; label: string }[] = [
  { key: 'CONTENEDOR', label: 'Por contenedor (20\'/40\')' },
  { key: 'CBM', label: 'Por m³ (CBM)' },
  { key: 'TON', label: 'Por tonelada' },
  { key: 'WM', label: 'Weight/Measure' },
  { key: 'PEDIMENTO', label: 'Por pedimento' },
  { key: 'VIAJE', label: 'Por viaje' },
  { key: 'BL', label: 'Por B/L' },
  { key: 'FIJO', label: 'Monto fijo' },
  { key: 'DIA', label: 'Por día' },
];

export default function TarifaFormModal({ mode, tarifa, onClose, onCreate, onUpdate }: Props) {
  const isEdit = mode === 'editar' && tarifa;
  const { user } = useAuth();
  const { proveedores } = useProveedores();
  const { conceptos } = useConceptos();
  const { puertos } = usePuertos();

  const proveedoresActivos = proveedores.filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const conceptosActivos = conceptos.filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const puertosActivos = puertos.filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  // ── State ──────────────────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<TipoTarifa>(tarifa?.tipo ?? 'tarifario');
  const [conceptoId, setConceptoId] = useState(tarifa?.conceptoId ?? '');
  const [proveedorId, setProveedorId] = useState(tarifa?.proveedorId ?? '');
  const [puertoOrigenId, setPuertoOrigenId] = useState(tarifa?.puertoOrigenId ?? '');
  const [puertoDestinoId, setPuertoDestinoId] = useState(tarifa?.puertoDestinoId ?? '');
  const [terminalId, setTerminalId] = useState(tarifa?.terminalId ?? '');
  const [rutaTexto, setRutaTexto] = useState(tarifa?.rutaTexto ?? '');
  const [unidad, setUnidad] = useState<UnidadTarifa>(tarifa?.precios.unidad ?? 'FIJO');
  const [monto, setMonto] = useState(tarifa?.precios.monto?.toString() ?? '');
  const [montoPor40, setMontoPor40] = useState(tarifa?.precios.montoPor40?.toString() ?? '');
  const [montoPor40HC, setMontoPor40HC] = useState(tarifa?.precios.montoPor40HC?.toString() ?? '');
  const [montoMinimo, setMontoMinimo] = useState(tarifa?.precios.montoMinimo?.toString() ?? '');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>(tarifa?.moneda ?? 'USD');
  const [vigenciaTexto, setVigenciaTexto] = useState(tarifa?.vigenciaTexto ?? '');
  const [fechaInicio, setFechaInicio] = useState(tarifa?.fechaInicio ?? hoyISO());
  const [fechaFin, setFechaFin] = useState(tarifa?.fechaFin ?? '');
  const [tiempoTransitoDias, setTiempoTransitoDias] = useState(tarifa?.tiempoTransitoDias?.toString() ?? '');
  const [freeTimeDias, setFreeTimeDias] = useState(tarifa?.freeTimeDias?.toString() ?? '');
  const [condiciones, setCondiciones] = useState(tarifa?.condiciones ?? '');
  const [activo, setActivo] = useState(tarifa?.activo ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Terminales del puerto seleccionado (para maniobras)
  const puertoConTerminales = puertoOrigenId
    ? puertos.find(p => p.id === puertoOrigenId)
    : puertoDestinoId
    ? puertos.find(p => p.id === puertoDestinoId)
    : null;
  const terminalesDisponibles = puertoConTerminales?.terminales ?? [];

  const showContainerFields = unidad === 'CONTENEDOR';
  const showMinimoField = unidad === 'CBM' || unidad === 'TON' || unidad === 'WM';

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!conceptoId) { setError('Selecciona un concepto.'); return; }
    if (!proveedorId) { setError('Selecciona un proveedor.'); return; }
    if (!monto || Number(monto) <= 0) { setError('El precio es obligatorio.'); return; }
    if (!vigenciaTexto.trim()) { setError('La descripción de vigencia es obligatoria.'); return; }
    if (!fechaInicio) { setError('La fecha de inicio es obligatoria.'); return; }

    setError('');
    setSaving(true);

    try {
      const now = new Date().toISOString();
      const precios: PreciosTarifa = {
        monto: Number(monto),
        unidad,
        ...(showContainerFields && montoPor40 ? { montoPor40: Number(montoPor40) } : {}),
        ...(showContainerFields && montoPor40HC ? { montoPor40HC: Number(montoPor40HC) } : {}),
        ...(showMinimoField && montoMinimo ? { montoMinimo: Number(montoMinimo) } : {}),
      };

      if (isEdit && onUpdate) {
        await onUpdate(tarifa.id, {
          tipo,
          conceptoId,
          proveedorId,
          puertoOrigenId: puertoOrigenId || null,
          puertoDestinoId: puertoDestinoId || null,
          terminalId: terminalId || null,
          rutaTexto: rutaTexto.trim() || null,
          precios,
          moneda,
          vigenciaTexto: vigenciaTexto.trim(),
          fechaInicio,
          fechaFin: fechaFin || null,
          tiempoTransitoDias: tiempoTransitoDias ? Number(tiempoTransitoDias) : null,
          freeTimeDias: freeTimeDias ? Number(freeTimeDias) : null,
          condiciones: condiciones.trim(),
          activo,
          updatedAt: now,
        });
      } else if (onCreate) {
        const nuevo: TarifaVermur = {
          id: `TAR-${Date.now()}`,
          tipo,
          conceptoId,
          proveedorId,
          puertoOrigenId: puertoOrigenId || null,
          puertoDestinoId: puertoDestinoId || null,
          terminalId: terminalId || null,
          rutaTexto: rutaTexto.trim() || null,
          precios,
          moneda,
          vigenciaTexto: vigenciaTexto.trim(),
          fechaInicio,
          fechaFin: fechaFin || null,
          tiempoTransitoDias: tiempoTransitoDias ? Number(tiempoTransitoDias) : null,
          freeTimeDias: freeTimeDias ? Number(freeTimeDias) : null,
          condiciones: condiciones.trim(),
          activo: true,
          origenDatos: 'manual',
          creadoPor: user?.uid ?? '',
          fechaAlta: now.split('T')[0],
          updatedAt: now,
        };
        await onCreate(nuevo);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[16px] border border-card-border shadow-xl w-full max-w-[640px] mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider shrink-0">
          <h3 className="text-[15px] font-semibold text-text-primary">
            {isEdit ? 'Editar tarifa' : 'Nueva tarifa'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-neutral-bg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* ── Tipo ──────────────────────────────────────────────────── */}
          <div className="flex gap-3">
            {(['tarifario', 'spot'] as TipoTarifa[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`flex-1 px-3 py-2 rounded-[8px] text-[13px] font-medium border transition-colors ${
                  tipo === t
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-card-border bg-white text-text-secondary hover:border-brand/30'
                }`}
              >
                {t === 'tarifario' ? 'Tarifario' : 'Spot'}
              </button>
            ))}
          </div>

          {/* ── Concepto + Proveedor ──────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Concepto *</label>
              <select className={INPUT} value={conceptoId} onChange={e => setConceptoId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {conceptosActivos.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Proveedor *</label>
              <select className={INPUT} value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {proveedoresActivos.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Ruta (puertos) ────────────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">Ruta (opcional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Puerto origen</label>
                <select className={INPUT} value={puertoOrigenId} onChange={e => setPuertoOrigenId(e.target.value)}>
                  <option value="">Sin puerto origen</option>
                  {puertosActivos.map(p => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Puerto destino</label>
                <select className={INPUT} value={puertoDestinoId} onChange={e => setPuertoDestinoId(e.target.value)}>
                  <option value="">Sin puerto destino</option>
                  {puertosActivos.map(p => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            {terminalesDisponibles.length > 0 && (
              <div className="mt-3">
                <label className={LABEL}>Terminal (maniobras)</label>
                <select className={INPUT} value={terminalId} onChange={e => setTerminalId(e.target.value)}>
                  <option value="">Sin terminal específica</option>
                  {terminalesDisponibles.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="mt-3">
              <label className={LABEL}>Ruta texto libre (terrestre/aéreo)</label>
              <input className={INPUT} value={rutaTexto} onChange={e => setRutaTexto(e.target.value)} placeholder="Ej. CDMX → Monterrey" />
            </div>
          </div>

          {/* ── Precio ────────────────────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">Precio *</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Unidad</label>
                <select className={INPUT} value={unidad} onChange={e => setUnidad(e.target.value as UnidadTarifa)}>
                  {UNIDADES.map(u => (
                    <option key={u.key} value={u.key}>{u.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>{showContainerFields ? "Precio 20'" : 'Monto'} *</label>
                <input type="number" step="0.01" className={INPUT} value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className={LABEL}>Moneda</label>
                <select className={INPUT} value={moneda} onChange={e => setMoneda(e.target.value as 'USD' | 'MXN')}>
                  <option value="USD">USD</option>
                  <option value="MXN">MXN</option>
                </select>
              </div>
            </div>
            {showContainerFields && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className={LABEL}>Precio 40&apos;</label>
                  <input type="number" step="0.01" className={INPUT} value={montoPor40} onChange={e => setMontoPor40(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className={LABEL}>Precio 40&apos; HC</label>
                  <input type="number" step="0.01" className={INPUT} value={montoPor40HC} onChange={e => setMontoPor40HC(e.target.value)} placeholder="0.00" />
                </div>
              </div>
            )}
            {showMinimoField && (
              <div className="mt-3 max-w-[200px]">
                <label className={LABEL}>Cargo mínimo</label>
                <input type="number" step="0.01" className={INPUT} value={montoMinimo} onChange={e => setMontoMinimo(e.target.value)} placeholder="0.00" />
              </div>
            )}
          </div>

          {/* ── Vigencia ──────────────────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">Vigencia *</h4>
            <div className="mb-3">
              <label className={LABEL}>Descripción de vigencia *</label>
              <input className={INPUT} value={vigenciaTexto} onChange={e => setVigenciaTexto(e.target.value)} placeholder='Ej. "Semestre 2026-B", "Solo salida 15 mar"' />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Fecha inicio *</label>
                <input type="date" className={INPUT} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>Fecha fin (vacío = indefinida)</label>
                <input type="date" className={INPUT} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Operativo ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Tiempo tránsito (días)</label>
              <input type="number" className={INPUT} value={tiempoTransitoDias} onChange={e => setTiempoTransitoDias(e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className={LABEL}>Free time (días, solo FCL)</label>
              <input type="number" className={INPUT} value={freeTimeDias} onChange={e => setFreeTimeDias(e.target.value)} placeholder="—" />
            </div>
          </div>

          {/* ── Condiciones ────────────────────────────────────────────── */}
          <div>
            <label className={LABEL}>Condiciones / notas</label>
            <textarea className={`${INPUT} resize-none`} rows={2} value={condiciones} onChange={e => setCondiciones(e.target.value)} placeholder="Condiciones especiales..." />
          </div>

          {/* ── Estado (solo editar) ───────────────────────────────────── */}
          {isEdit && (
            <div className="flex items-center justify-between border border-card-border rounded-lg p-3 bg-canvas">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">Estado de la tarifa</p>
                <p className="text-[11px] text-text-muted">Las tarifas inactivas no aparecen en sugerencias.</p>
              </div>
              <button
                type="button"
                onClick={() => setActivo(!activo)}
                className={`relative w-11 h-6 rounded-full transition-colors ${activo ? 'bg-brand' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${activo ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          )}

          {error && (
            <p className="text-[12px] text-danger-text bg-danger-bg rounded-[6px] px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-divider flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors shadow-sm"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear tarifa'}
          </button>
        </div>
      </div>
    </div>
  );
}
