import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ProveedorVermur, Modalidad } from './ProveedoresData';
import { validarRFC } from '../../lib/validadores';

interface Props {
  onClose: () => void;
  onCreate: (p: ProveedorVermur) => Promise<void>;
  modalidadContexto?: Modalidad;
  onCreated: (proveedorId: string, nombre: string) => void;
}

const INPUT = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';

const MODALIDADES: { key: Modalidad; label: string }[] = [
  { key: 'maritimo', label: 'Marítimo' },
  { key: 'aereo', label: 'Aéreo' },
  { key: 'terrestre', label: 'Terrestre' },
  { key: 'aduanal', label: 'Aduanal' },
];

export default function AltaRapidaProveedorModal({ onClose, onCreate, modalidadContexto, onCreated }: Props) {
  const [nombre, setNombre] = useState('');
  const [rfc, setRfc] = useState('');
  const [modalidades, setModalidades] = useState<Modalidad[]>(modalidadContexto ? [modalidadContexto] : []);
  const [contactoNombre, setContactoNombre] = useState('');
  const [contactoEmail, setContactoEmail] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rfcError, setRfcError] = useState('');

  const handleRfcBlur = () => {
    const val = rfc.trim();
    setRfcError(val === '' ? '' : validarRFC(val).error);
  };

  const toggleModalidad = (m: Modalidad) => {
    setModalidades(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const handleSubmit = async () => {
    if (!nombre.trim()) { setError('La razón social es obligatoria.'); return; }
    if (modalidades.length === 0) { setError('Selecciona al menos una modalidad.'); return; }

    const rfcVal = rfc.trim();
    if (rfcVal) {
      const rfcCheck = validarRFC(rfcVal);
      if (!rfcCheck.valido) { setRfcError(rfcCheck.error); setError(rfcCheck.error); return; }
    }

    setError('');
    setRfcError('');
    setSaving(true);

    try {
      const now = new Date().toISOString();
      const id = `PRV-${Date.now()}`;
      const nuevo: ProveedorVermur = {
        id,
        nombre: nombre.trim(),
        rfc: rfcVal.toUpperCase(),
        domicilio: '',
        website: '',
        contactos: contactoNombre.trim() || contactoEmail.trim()
          ? [{ id: `cnt-${Date.now()}`, nombre: contactoNombre.trim(), puesto: '', email: contactoEmail.trim(), telefono: '', principal: true }]
          : [{ id: `cnt-${Date.now()}`, nombre: '', puesto: '', email: '', telefono: '', principal: true }],
        modalidades,
        diasCredito: { maritimo: 45, terrestre: 15, aereo: 20 },
        activo: true,
        notas: '',
        fechaAlta: now.split('T')[0],
        updatedAt: now,
      };
      await onCreate(nuevo);
      onCreated(id, nombre.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[16px] border border-card-border shadow-xl w-full max-w-[420px] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
          <h3 className="text-[15px] font-semibold text-text-primary">Alta rápida de proveedor</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-neutral-bg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={LABEL}>Razón social *</label>
            <input className={INPUT} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del proveedor" autoFocus />
          </div>

          <div>
            <label className={LABEL}>RFC</label>
            <input
              className={`${INPUT} ${rfcError ? 'border-danger-text focus:border-danger-text focus:ring-danger-text' : ''}`}
              value={rfc}
              onChange={e => { setRfc(e.target.value.toUpperCase()); if (rfcError) setRfcError(''); }}
              onBlur={handleRfcBlur}
              placeholder="Opcional"
            />
            {rfcError && <p className="mt-1 text-[11px] text-danger-text">{rfcError}</p>}
          </div>

          <div>
            <label className={LABEL}>Modalidades *</label>
            <div className="flex flex-wrap gap-3">
              {MODALIDADES.map(m => (
                <label key={m.key} className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={modalidades.includes(m.key)}
                    onChange={() => toggleModalidad(m.key)}
                    className="w-4 h-4 rounded border-card-border text-brand focus:ring-brand accent-brand"
                  />
                  <span className="text-[13px] text-text-primary">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Contacto nombre</label>
              <input className={INPUT} value={contactoNombre} onChange={e => setContactoNombre(e.target.value)} placeholder="Nombre" />
            </div>
            <div>
              <label className={LABEL}>Contacto email</label>
              <input className={INPUT} type="email" value={contactoEmail} onChange={e => setContactoEmail(e.target.value)} placeholder="correo@ej.com" />
            </div>
          </div>

          <p className="text-[11px] text-text-muted">Los demás datos se pueden completar después desde Directorio &gt; Proveedores &gt; Editar Datos.</p>

          {error && (
            <p className="text-[12px] text-danger-text bg-danger-bg rounded-[6px] px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-divider flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors shadow-sm"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Guardando...' : 'Crear proveedor'}
          </button>
        </div>
      </div>
    </div>
  );
}
