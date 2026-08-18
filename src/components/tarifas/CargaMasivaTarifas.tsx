/**
 * CargaMasivaTarifas.tsx (TA-3)
 *
 * Formulario optimizado para cargar un tarifario completo de un jalón.
 *
 * UX:
 *  - Header fija proveedor + vigencia + moneda UNA VEZ.
 *  - Tabla editable: N líneas (concepto + unidad + precio + ruta).
 *  - Enter en última fila agrega línea. Tab navega entre celdas.
 *  - "Guardar N tarifas" escribe todos los docs.
 *  - Validación por línea sin perder lo capturado en las demás.
 *  - Si algo falla a media escritura, muestra qué se guardó y qué no.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  ArrowLeft, Plus, Trash2, Loader2, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react';
import { TarifaVermur, UnidadTarifa, PreciosTarifa, hoyISO } from './TarifasData';
import { useProveedores } from '../../hooks/useProveedores';
import { useConceptos } from '../../hooks/useConceptos';
import { usePuertos } from '../../hooks/usePuertos';
import { useAuth } from '../../auth/AuthContext';

// ─── Styles ────────────────────────────────────────────────────────────────
const CELL = 'w-full px-2 py-1.5 text-[12px] bg-white border border-card-border rounded-[4px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const CELL_ERR = 'w-full px-2 py-1.5 text-[12px] bg-danger-bg border border-danger-text/40 rounded-[4px] focus:outline-none focus:border-danger-text focus:ring-1 focus:ring-danger-text text-text-primary';
const HDR = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';
const TH = 'px-2 py-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap';

// ─── Line state ────────────────────────────────────────────────────────────

interface Linea {
  key: number;
  conceptoId: string;
  unidad: UnidadTarifa;
  monto: string;
  montoPor40: string;
  montoPor40HC: string;
  puertoOrigenId: string;
  puertoDestinoId: string;
  error?: string;
  status: 'idle' | 'saving' | 'saved' | 'failed';
  failMsg?: string;
}

let _k = 1;
const mkLine = (): Linea => ({
  key: _k++,
  conceptoId: '',
  unidad: 'FIJO',
  monto: '',
  montoPor40: '',
  montoPor40HC: '',
  puertoOrigenId: '',
  puertoDestinoId: '',
  status: 'idle',
});

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onCreate: (t: TarifaVermur) => Promise<void>;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function CargaMasivaTarifas({ onClose, onCreate }: Props) {
  const { user } = useAuth();
  const { proveedores } = useProveedores();
  const { conceptos } = useConceptos();
  const { puertos } = usePuertos();

  const provActivos = useMemo(
    () => proveedores.filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [proveedores],
  );
  const concActivos = useMemo(
    () => conceptos.filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [conceptos],
  );
  const ptosActivos = useMemo(
    () => puertos.filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [puertos],
  );

  // ── Header (datos comunes) ──────────────────────────────────────────────
  const [proveedorId, setProveedorId] = useState('');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('USD');
  const [vigenciaTexto, setVigenciaTexto] = useState('');
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState('');
  const [condiciones, setCondiciones] = useState('');

  // ── Lines ───────────────────────────────────────────────────────────────
  const [lineas, setLineas] = useState<Linea[]>(() => [mkLine(), mkLine(), mkLine()]);
  const [hdrError, setHdrError] = useState('');
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<{ total: number; ok: number; fail: number } | null>(null);

  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const focusKey = useRef<number | null>(null);

  // ── Line mutations ──────────────────────────────────────────────────────

  const patch = useCallback((key: number, p: Partial<Linea>) => {
    setLineas(prev => prev.map(l => l.key === key ? { ...l, ...p, error: undefined } : l));
  }, []);

  const remove = useCallback((key: number) => {
    setLineas(prev => {
      const next = prev.filter(l => l.key !== key);
      return next.length === 0 ? [mkLine()] : next;
    });
  }, []);

  const addLine = useCallback(() => {
    const nl = mkLine();
    focusKey.current = nl.key;
    setLineas(prev => [...prev, nl]);
  }, []);

  // Focus newly added row
  useEffect(() => {
    if (focusKey.current !== null && tbodyRef.current) {
      const k = focusKey.current;
      focusKey.current = null;
      requestAnimationFrame(() => {
        const el = tbodyRef.current?.querySelector(`[data-rk="${k}"] select`) as HTMLElement;
        el?.focus();
      });
    }
  });

  // Pending count (touched but not yet saved)
  const pendingCount = useMemo(
    () => lineas.filter(l => (l.conceptoId || l.monto) && l.status !== 'saved').length,
    [lineas],
  );

  // ── Keyboard: Enter on last row adds line ───────────────────────────────

  const onKey = useCallback((e: React.KeyboardEvent, key: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (key === lineas[lineas.length - 1]?.key) addLine();
    }
  }, [lineas, addLine]);

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    // 1) Header validation
    if (!proveedorId) { setHdrError('Selecciona un proveedor.'); return; }
    if (!vigenciaTexto.trim()) { setHdrError('Escribe la vigencia.'); return; }
    if (!fechaInicio) { setHdrError('La fecha de inicio es obligatoria.'); return; }
    setHdrError('');

    // 2) Line validation — skip saved and untouched
    let hasErr = false;
    const checked = lineas.map(l => {
      if (l.status === 'saved') return l;
      if (!l.conceptoId && !l.monto) return l;
      const miss: string[] = [];
      if (!l.conceptoId) miss.push('concepto');
      if (!l.monto || Number(l.monto) <= 0) miss.push('precio');
      if (miss.length) { hasErr = true; return { ...l, error: `Falta: ${miss.join(', ')}` }; }
      return { ...l, error: undefined };
    });
    if (hasErr) { setLineas(checked); return; }

    const toSave = checked.filter(l => l.conceptoId && l.monto && l.status !== 'saved');
    if (toSave.length === 0) {
      setHdrError('Agrega al menos una línea con concepto y precio.');
      return;
    }

    // 3) Write
    setSaving(true);
    setSummary(null);

    setLineas(prev => prev.map(l =>
      toSave.find(s => s.key === l.key) ? { ...l, status: 'saving' as const } : l,
    ));

    const now = new Date().toISOString();
    const batch = Date.now();

    const results = await Promise.allSettled(
      toSave.map(async (l, i) => {
        const precios: PreciosTarifa = {
          monto: Number(l.monto),
          unidad: l.unidad,
          ...(l.unidad === 'CONTENEDOR' && l.montoPor40 ? { montoPor40: Number(l.montoPor40) } : {}),
          ...(l.unidad === 'CONTENEDOR' && l.montoPor40HC ? { montoPor40HC: Number(l.montoPor40HC) } : {}),
        };

        const tarifa: TarifaVermur = {
          id: `TAR-${batch}-${i}`,
          tipo: 'tarifario',
          conceptoId: l.conceptoId,
          proveedorId,
          puertoOrigenId: l.puertoOrigenId || null,
          puertoDestinoId: l.puertoDestinoId || null,
          terminalId: null,
          rutaTexto: null,
          precios,
          moneda,
          vigenciaTexto: vigenciaTexto.trim(),
          fechaInicio,
          fechaFin: fechaFin || null,
          tiempoTransitoDias: null,
          freeTimeDias: null,
          condiciones: condiciones.trim(),
          activo: true,
          origenDatos: 'manual',
          creadoPor: user?.uid ?? '',
          fechaAlta: now.split('T')[0],
          updatedAt: now,
        };

        await onCreate(tarifa);
        return l.key;
      }),
    );

    // 4) Track results
    let ok = 0, fail = 0;
    const statusMap = new Map<number, { s: 'saved' | 'failed'; msg?: string }>();

    results.forEach((r, i) => {
      const key = toSave[i].key;
      if (r.status === 'fulfilled') {
        ok++;
        statusMap.set(key, { s: 'saved' });
      } else {
        fail++;
        statusMap.set(key, {
          s: 'failed',
          msg: r.reason instanceof Error ? r.reason.message : 'Error al guardar',
        });
      }
    });

    setLineas(prev => prev.map(l => {
      const st = statusMap.get(l.key);
      if (!st) return l;
      return { ...l, status: st.s, failMsg: st.msg };
    }));

    setSummary({ total: toSave.length, ok, fail });
    setSaving(false);
  };

  // ── Derived state ───────────────────────────────────────────────────────
  const hasFailedLines = lineas.some(l => l.status === 'failed');
  const hasErrorLines = lineas.some(l => l.error);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ── Title bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-neutral-bg transition-colors"
          title="Volver al catálogo"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-[18px] font-bold text-text-primary">Carga masiva de tarifas</h2>
          <p className="text-[12px] text-text-muted">
            Fija proveedor y vigencia arriba, agrega líneas abajo. Tab navega entre celdas.
          </p>
        </div>
      </div>

      {/* ── Header: datos comunes ──────────────────────────────────────── */}
      <div className="bg-white border border-card-border rounded-[12px] p-5 shadow-sm space-y-4">
        <h3 className="text-[13px] font-semibold text-text-primary">
          Datos comunes a todas las líneas
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={LABEL}>Proveedor *</label>
            <select
              className={HDR}
              value={proveedorId}
              onChange={e => { setProveedorId(e.target.value); setHdrError(''); }}
            >
              <option value="">Seleccionar...</option>
              {provActivos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Moneda</label>
            <select className={HDR} value={moneda} onChange={e => setMoneda(e.target.value as 'USD' | 'MXN')}>
              <option value="USD">USD</option>
              <option value="MXN">MXN</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Vigencia *</label>
            <input
              className={HDR}
              value={vigenciaTexto}
              onChange={e => { setVigenciaTexto(e.target.value); setHdrError(''); }}
              placeholder='Ej. "Semestre 2026-B"'
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={LABEL}>Fecha inicio *</label>
            <input type="date" className={HDR} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Fecha fin (vacío = indefinida)</label>
            <input type="date" className={HDR} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Condiciones (opcional)</label>
            <input
              className={HDR}
              value={condiciones}
              onChange={e => setCondiciones(e.target.value)}
              placeholder="Aplican a todas las líneas"
            />
          </div>
        </div>

        {hdrError && (
          <p className="text-[12px] text-danger-text bg-danger-bg rounded-[6px] px-3 py-2 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {hdrError}
          </p>
        )}
      </div>

      {/* ── Tabla editable ─────────────────────────────────────────────── */}
      <div className="bg-white border border-card-border rounded-[12px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[880px]">
            <thead>
              <tr className="border-b border-divider bg-neutral-bg">
                <th className={`${TH} pl-4 w-[40px]`}>#</th>
                <th className={`${TH} min-w-[180px]`}>Concepto *</th>
                <th className={`${TH} min-w-[95px]`}>Unidad</th>
                <th className={`${TH} min-w-[85px]`}>Monto *</th>
                <th className={`${TH} min-w-[75px]`}>40&apos;</th>
                <th className={`${TH} min-w-[75px]`}>40&apos; HC</th>
                <th className={`${TH} min-w-[130px]`}>Pto origen</th>
                <th className={`${TH} min-w-[130px]`}>Pto destino</th>
                <th className={`${TH} w-[50px]`}></th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {lineas.map((l, idx) => {
                const isCntr = l.unidad === 'CONTENEDOR';
                const locked = l.status === 'saved' || l.status === 'saving';

                const rowBorder =
                  l.error       ? 'border-l-2 border-l-danger-text bg-danger-bg/20' :
                  l.status === 'saved'  ? 'border-l-2 border-l-success-text bg-success-bg/20' :
                  l.status === 'failed' ? 'border-l-2 border-l-danger-text bg-danger-bg/10' :
                  '';

                return (
                  <tr
                    key={l.key}
                    data-rk={l.key}
                    className={`border-b border-divider last:border-b-0 ${rowBorder}`}
                  >
                    {/* # / status */}
                    <td className="pl-4 pr-1 py-2 text-[11px] text-text-muted tabular-nums">
                      {l.status === 'saving' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                      ) : l.status === 'saved' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success-text" />
                      ) : l.status === 'failed' ? (
                        <span title={l.failMsg}>
                          <XCircle className="w-3.5 h-3.5 text-danger-text" />
                        </span>
                      ) : (
                        idx + 1
                      )}
                    </td>

                    {/* Concepto */}
                    <td className="px-1 py-1.5">
                      <select
                        className={l.error?.includes('concepto') ? CELL_ERR : CELL}
                        value={l.conceptoId}
                        disabled={locked}
                        onChange={e => patch(l.key, { conceptoId: e.target.value })}
                        onKeyDown={e => onKey(e, l.key)}
                      >
                        <option value="">Seleccionar...</option>
                        {concActivos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </td>

                    {/* Unidad */}
                    <td className="px-1 py-1.5">
                      <select
                        className={CELL}
                        value={l.unidad}
                        disabled={locked}
                        onChange={e => patch(l.key, { unidad: e.target.value as UnidadTarifa })}
                        onKeyDown={e => onKey(e, l.key)}
                      >
                        <option value="FIJO">Fijo</option>
                        <option value="CONTENEDOR">Cntr</option>
                        <option value="CBM">m³</option>
                        <option value="TON">ton</option>
                        <option value="WM">W/M</option>
                        <option value="PEDIMENTO">Ped.</option>
                        <option value="VIAJE">Viaje</option>
                        <option value="BL">B/L</option>
                        <option value="DIA">Día</option>
                      </select>
                    </td>

                    {/* Monto */}
                    <td className="px-1 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        className={l.error?.includes('precio') ? CELL_ERR : CELL}
                        value={l.monto}
                        disabled={locked}
                        placeholder={isCntr ? "20'" : '0.00'}
                        onChange={e => patch(l.key, { monto: e.target.value })}
                        onKeyDown={e => onKey(e, l.key)}
                      />
                    </td>

                    {/* 40' */}
                    <td className="px-1 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        className={`${CELL} ${!isCntr ? 'opacity-30' : ''}`}
                        value={isCntr ? l.montoPor40 : ''}
                        disabled={!isCntr || locked}
                        placeholder={isCntr ? '0.00' : '—'}
                        onChange={e => patch(l.key, { montoPor40: e.target.value })}
                        onKeyDown={e => onKey(e, l.key)}
                      />
                    </td>

                    {/* 40' HC */}
                    <td className="px-1 py-1.5">
                      <input
                        type="number"
                        step="0.01"
                        className={`${CELL} ${!isCntr ? 'opacity-30' : ''}`}
                        value={isCntr ? l.montoPor40HC : ''}
                        disabled={!isCntr || locked}
                        placeholder={isCntr ? '0.00' : '—'}
                        onChange={e => patch(l.key, { montoPor40HC: e.target.value })}
                        onKeyDown={e => onKey(e, l.key)}
                      />
                    </td>

                    {/* Pto origen */}
                    <td className="px-1 py-1.5">
                      <select
                        className={CELL}
                        value={l.puertoOrigenId}
                        disabled={locked}
                        onChange={e => patch(l.key, { puertoOrigenId: e.target.value })}
                        onKeyDown={e => onKey(e, l.key)}
                      >
                        <option value="">—</option>
                        {ptosActivos.map(p => <option key={p.id} value={p.id}>{p.codigo}</option>)}
                      </select>
                    </td>

                    {/* Pto destino */}
                    <td className="px-1 py-1.5">
                      <select
                        className={CELL}
                        value={l.puertoDestinoId}
                        disabled={locked}
                        onChange={e => patch(l.key, { puertoDestinoId: e.target.value })}
                        onKeyDown={e => onKey(e, l.key)}
                      >
                        <option value="">—</option>
                        {ptosActivos.map(p => <option key={p.id} value={p.id}>{p.codigo}</option>)}
                      </select>
                    </td>

                    {/* Delete */}
                    <td className="px-1 py-1.5 text-center">
                      {!locked ? (
                        <button
                          onClick={() => remove(l.key)}
                          className="p-1 rounded text-text-muted hover:text-danger-text hover:bg-danger-bg transition-colors"
                          title="Eliminar línea"
                          tabIndex={-1}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : l.status === 'failed' ? (
                        <span className="text-[10px] text-danger-text" title={l.failMsg}>Error</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Table footer ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-divider bg-neutral-bg/50">
          <div className="flex items-center gap-3">
            <button
              onClick={addLine}
              disabled={saving}
              className="flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand-hover transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar línea
            </button>
            <span className="text-[11px] text-text-muted hidden sm:inline">
              Enter en la última fila agrega línea
            </span>
          </div>

          <div className="flex items-center gap-4">
            {pendingCount > 0 && (
              <span className="text-[12px] text-text-secondary font-medium tabular-nums">
                {pendingCount} línea{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || pendingCount === 0}
              className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Guardando...
                </>
              ) : (
                `Guardar ${pendingCount} tarifa${pendingCount !== 1 ? 's' : ''}`
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Validation errors banner ───────────────────────────────────── */}
      {hasErrorLines && (
        <div className="bg-danger-bg/50 rounded-[8px] px-4 py-3 border border-danger-text/10">
          <p className="text-[12px] text-danger-text font-medium flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Corrige las líneas marcadas en rojo antes de guardar.
          </p>
        </div>
      )}

      {/* ── Results summary ────────────────────────────────────────────── */}
      {summary && (
        <div
          className={`rounded-[10px] px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            summary.fail === 0
              ? 'bg-success-bg border border-success-text/20'
              : 'bg-warning-bg border border-warning-text/20'
          }`}
        >
          <div className="flex items-center gap-3">
            {summary.fail === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-success-text shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-warning-text shrink-0" />
            )}
            <div>
              <p className={`text-[14px] font-semibold ${
                summary.fail === 0 ? 'text-success-text' : 'text-warning-text'
              }`}>
                {summary.fail === 0
                  ? `${summary.ok} tarifa${summary.ok !== 1 ? 's' : ''} guardada${summary.ok !== 1 ? 's' : ''} correctamente`
                  : `${summary.ok} de ${summary.total} guardadas \u2014 ${summary.fail} con error`}
              </p>
              {summary.fail > 0 && (
                <p className="text-[12px] text-warning-text/80 mt-0.5">
                  Las líneas con error se pueden corregir y reintentar.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasFailedLines && (
              <button
                onClick={handleSave}
                className="text-[12px] font-semibold text-warning-text hover:underline"
              >
                Reintentar fallidas
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[12px] font-semibold text-text-secondary hover:text-text-primary transition-colors"
            >
              Volver al catálogo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
