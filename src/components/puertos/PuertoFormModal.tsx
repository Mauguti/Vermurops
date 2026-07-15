import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { PuertoVermur } from './PuertosData';

interface Props {
  mode: 'crear' | 'editar';
  puerto?: PuertoVermur;
  onClose: () => void;
  onCreate?: (p: PuertoVermur) => Promise<void>;
  onUpdate?: (id: string, data: Partial<PuertoVermur>) => Promise<void>;
}

const INPUT = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';

export default function PuertoFormModal({ mode, puerto, onClose, onCreate, onUpdate }: Props) {
  const isEdit = mode === 'editar' && puerto;

  const [codigo, setCodigo] = useState(puerto?.codigo ?? '');
  const [nombre, setNombre] = useState(puerto?.nombre ?? '');
  const [pais, setPais] = useState(puerto?.pais ?? '');
  const [codigoPais, setCodigoPais] = useState(puerto?.codigoPais ?? '');
  const [activo, setActivo] = useState(puerto?.activo ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!codigo.trim()) { setError('El código del puerto es obligatorio.'); return; }
    if (!nombre.trim()) { setError('El nombre del puerto es obligatorio.'); return; }
    if (!pais.trim()) { setError('El país es obligatorio.'); return; }
    if (!codigoPais.trim()) { setError('El código de país es obligatorio.'); return; }

    setError('');
    setSaving(true);

    try {
      const now = new Date().toISOString();

      if (isEdit && onUpdate) {
        await onUpdate(puerto.id, {
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          pais: pais.trim(),
          codigoPais: codigoPais.trim().toUpperCase(),
          activo,
          updatedAt: now,
        });
      } else if (onCreate) {
        const nuevo: PuertoVermur = {
          id: `PTO-${Date.now()}`,
          codigo: codigo.trim().toUpperCase(),
          nombre: nombre.trim(),
          pais: pais.trim(),
          codigoPais: codigoPais.trim().toUpperCase(),
          activo: true,
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
      <div className="bg-white rounded-[16px] border border-card-border shadow-xl w-full max-w-[480px] mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider shrink-0">
          <h3 className="text-[15px] font-semibold text-text-primary">
            {isEdit ? 'Editar puerto' : 'Nuevo puerto'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-neutral-bg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Código *</label>
              <input
                className={INPUT}
                value={codigo}
                onChange={e => setCodigo(e.target.value.toUpperCase())}
                placeholder="MZO"
                maxLength={5}
                autoFocus
              />
              <p className="mt-1 text-[10px] text-text-muted">3-5 letras, único</p>
            </div>
            <div>
              <label className={LABEL}>Nombre *</label>
              <input className={INPUT} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Manzanillo" />
            </div>
            <div>
              <label className={LABEL}>País *</label>
              <input className={INPUT} value={pais} onChange={e => setPais(e.target.value)} placeholder="México" />
            </div>
            <div>
              <label className={LABEL}>Código país (ISO) *</label>
              <input
                className={INPUT}
                value={codigoPais}
                onChange={e => setCodigoPais(e.target.value.toUpperCase())}
                placeholder="MEX"
                maxLength={3}
              />
            </div>
          </div>

          {/* Estado (solo en editar) */}
          {isEdit && (
            <div className="flex items-center justify-between border border-card-border rounded-lg p-3 bg-canvas">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">Estado del puerto</p>
                <p className="text-[11px] text-text-muted">Los puertos inactivos no aparecen en los dropdowns de cotización.</p>
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
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear puerto'}
          </button>
        </div>
      </div>
    </div>
  );
}
