import React, { useState } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';
import { ProveedorVermur, ContactoProveedor, Modalidad, TipoProveedor } from './ProveedoresData';
import { validarRFC } from '../../lib/validadores';

interface Props {
  mode: 'crear' | 'editar';
  proveedor?: ProveedorVermur;
  onClose: () => void;
  onCreate?: (p: ProveedorVermur) => Promise<void>;
  onUpdate?: (id: string, data: Partial<ProveedorVermur>) => Promise<void>;
}

const INPUT = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';

const MODALIDADES: { key: Modalidad; label: string }[] = [
  { key: 'maritimo', label: 'Marítimo' },
  { key: 'aereo', label: 'Aéreo' },
  { key: 'terrestre', label: 'Terrestre' },
  { key: 'aduanal', label: 'Aduanal' },
];

function emptyContacto(): ContactoProveedor {
  return { id: `cnt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nombre: '', puesto: '', email: '', telefono: '', principal: false };
}

export default function ProveedorFormModal({ mode, proveedor, onClose, onCreate, onUpdate }: Props) {
  const isEdit = mode === 'editar' && proveedor;

  const [nombre, setNombre] = useState(proveedor?.nombre ?? '');
  const [rfc, setRfc] = useState(proveedor?.rfc ?? '');
  const [domicilio, setDomicilio] = useState(proveedor?.domicilio ?? '');
  const [website, setWebsite] = useState(proveedor?.website ?? '');
  const [modalidades, setModalidades] = useState<Modalidad[]>(proveedor?.modalidades ?? []);
  const [tipos, setTipos] = useState<TipoProveedor[]>(proveedor?.tipos ?? ['proveedor']);
  const [diasCredito, setDiasCredito] = useState(proveedor?.diasCredito ?? { maritimo: 45, terrestre: 15, aereo: 20, general: 0 });
  const [contactos, setContactos] = useState<ContactoProveedor[]>(
    proveedor?.contactos?.length ? proveedor.contactos : [{ ...emptyContacto(), principal: true }],
  );
  const [notas, setNotas] = useState(proveedor?.notas ?? '');
  const [activo, setActivo] = useState(proveedor?.activo ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rfcError, setRfcError] = useState('');

  // ── RFC validation on blur ────────────────────────────────────────────────
  const originalRfc = proveedor?.rfc ?? '';
  const handleRfcBlur = () => {
    const val = rfc.trim();
    if (val === '') { setRfcError(''); return; }
    // In edit mode, only validate if RFC changed
    if (isEdit && val.toUpperCase() === originalRfc.toUpperCase()) { setRfcError(''); return; }
    setRfcError(validarRFC(val).error);
  };

  // ── Modalidades toggle ────────────────────────────────────────────────────
  const toggleModalidad = (m: Modalidad) => {
    setModalidades(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  // ── Contactos management ──────────────────────────────────────────────────
  const updateContacto = (idx: number, field: keyof ContactoProveedor, value: string | boolean) => {
    setContactos(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  };

  const setPrincipal = (idx: number) => {
    setContactos(prev => prev.map((c, i) => ({ ...c, principal: i === idx })));
  };

  const addContacto = () => {
    setContactos(prev => [...prev, emptyContacto()]);
  };

  const removeContacto = (idx: number) => {
    setContactos(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // If removed the principal, first remaining becomes principal
      if (!next.some(c => c.principal) && next.length > 0) {
        next[0] = { ...next[0], principal: true };
      }
      return next;
    });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!nombre.trim()) { setError('La razón social es obligatoria.'); return; }
    if (modalidades.length === 0) { setError('Selecciona al menos una modalidad.'); return; }
    if (!contactos.some(c => c.nombre.trim())) { setError('Al menos un contacto debe tener nombre.'); return; }

    // RFC validation (optional but validated if filled)
    const rfcVal = rfc.trim();
    if (rfcVal) {
      const rfcCheck = validarRFC(rfcVal);
      // In edit mode skip if RFC unchanged
      const rfcChanged = !isEdit || rfcVal.toUpperCase() !== originalRfc.toUpperCase();
      if (rfcChanged && !rfcCheck.valido) {
        setRfcError(rfcCheck.error);
        setError(rfcCheck.error);
        return;
      }
    }

    setError('');
    setRfcError('');
    setSaving(true);

    try {
      const now = new Date().toISOString();
      // Ensure exactly one principal
      const finalContactos = contactos.map(c => ({ ...c, nombre: c.nombre.trim(), puesto: c.puesto.trim(), email: c.email.trim(), telefono: c.telefono.trim() }));
      if (!finalContactos.some(c => c.principal) && finalContactos.length > 0) {
        finalContactos[0].principal = true;
      }

      if (isEdit && onUpdate) {
        await onUpdate(proveedor.id, {
          nombre: nombre.trim(),
          rfc: rfcVal.toUpperCase(),
          domicilio: domicilio.trim(),
          website: website.trim(),
          modalidades,
          tipos,
          diasCredito,
          contactos: finalContactos,
          notas: notas.trim(),
          activo,
          updatedAt: now,
        });
      } else if (onCreate) {
        const nuevo: ProveedorVermur = {
          id: `PRV-${Date.now()}`,
          idSemantico: `PRV-${nombre.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 30)}`,
          nombre: nombre.trim(),
          tipos,
          esAgenteDeCarga: tipos.includes('agente_carga'),
          esTambienCliente: false,
          diasCredito,
          terminoPagoMagaya: null,
          contactos: finalContactos,
          cuentasBancarias: [],
          telefono: null,
          website: website.trim() || null,
          direccion: { calle: domicilio.trim() || null, ciudad: null, estado: null, pais: 'Mexico', codigoPostal: null },
          codigoIATA: null,
          referenciaMagaya: null,
          numeroEntidadMagaya: rfcVal.toUpperCase() || null,
          validadoFiscalmente: !!rfcVal,
          tuvoTransacciones: false,
          multiRegistroEnMagaya: false,
          activo: true,
          origenDatos: 'manual',
          fechaAlta: now.split('T')[0],
          updatedAt: now,
          // Legacy fields
          rfc: rfcVal.toUpperCase(),
          domicilio: domicilio.trim(),
          modalidades,
          notas: notas.trim(),
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
      <div className="bg-white rounded-[16px] border border-card-border shadow-xl w-full max-w-[620px] mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider shrink-0">
          <h3 className="text-[15px] font-semibold text-text-primary">
            {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-neutral-bg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* ── Identificación ─────────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">Identificación</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
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
                <label className={LABEL}>Website</label>
                <input className={INPUT} value={website} onChange={e => setWebsite(e.target.value)} placeholder="www.ejemplo.com" />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL}>Domicilio</label>
                <input className={INPUT} value={domicilio} onChange={e => setDomicilio(e.target.value)} placeholder="Dirección fiscal" />
              </div>
            </div>
          </div>

          {/* ── Modalidades ────────────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">Modalidades *</h4>
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

          {/* ── Días de crédito ────────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">Días de crédito</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Marítimo</label>
                <input type="number" className={INPUT} value={diasCredito.maritimo} onChange={e => setDiasCredito(prev => ({ ...prev, maritimo: Number(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className={LABEL}>Terrestre</label>
                <input type="number" className={INPUT} value={diasCredito.terrestre} onChange={e => setDiasCredito(prev => ({ ...prev, terrestre: Number(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className={LABEL}>Aéreo</label>
                <input type="number" className={INPUT} value={diasCredito.aereo} onChange={e => setDiasCredito(prev => ({ ...prev, aereo: Number(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>

          {/* ── Contactos ──────────────────────────────────────────── */}
          <div>
            <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-3">Contactos</h4>
            <div className="space-y-3">
              {contactos.map((c, idx) => (
                <div key={c.id} className="border border-card-border rounded-lg p-3 bg-canvas">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="contacto-principal"
                        checked={c.principal}
                        onChange={() => setPrincipal(idx)}
                        className="w-4 h-4 text-brand focus:ring-brand accent-brand"
                      />
                      <span className="text-[12px] font-medium text-text-secondary">
                        {c.principal ? 'Principal' : `Contacto ${idx + 1}`}
                      </span>
                    </label>
                    {contactos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContacto(idx)}
                        className="p-1 rounded text-text-muted hover:text-danger-text transition-colors"
                        title="Eliminar contacto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LABEL}>Nombre *</label>
                      <input className={INPUT} value={c.nombre} onChange={e => updateContacto(idx, 'nombre', e.target.value)} placeholder="Nombre del contacto" />
                    </div>
                    <div>
                      <label className={LABEL}>Puesto</label>
                      <input className={INPUT} value={c.puesto} onChange={e => updateContacto(idx, 'puesto', e.target.value)} placeholder="Cargo" />
                    </div>
                    <div>
                      <label className={LABEL}>Email</label>
                      <input className={INPUT} type="email" value={c.email} onChange={e => updateContacto(idx, 'email', e.target.value)} placeholder="correo@ejemplo.com" />
                    </div>
                    <div>
                      <label className={LABEL}>Teléfono</label>
                      <input className={INPUT} value={c.telefono} onChange={e => updateContacto(idx, 'telefono', e.target.value)} placeholder="55 1234 5678" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addContacto}
              className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar contacto
            </button>
          </div>

          {/* ── Notas ──────────────────────────────────────────────── */}
          <div>
            <label className={LABEL}>Notas</label>
            <textarea className={`${INPUT} resize-none`} rows={3} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas internas sobre este proveedor..." />
          </div>

          {/* ── Estado (solo en editar) ─────────────────────────────── */}
          {isEdit && (
            <div className="flex items-center justify-between border border-card-border rounded-lg p-3 bg-canvas">
              <div>
                <p className="text-[13px] font-semibold text-text-primary">Estado del proveedor</p>
                <p className="text-[11px] text-text-muted">Los proveedores inactivos no aparecen en los dropdowns de cotización.</p>
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
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
        </div>
      </div>
    </div>
  );
}
