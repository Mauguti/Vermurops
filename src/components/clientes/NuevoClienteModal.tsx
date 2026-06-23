import React, { useState } from 'react';
import { ClienteVermur } from './ClientesData';
import { X, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreate: (cliente: ClienteVermur) => Promise<void>;
}

const INPUT = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';

export default function NuevoClienteModal({ onClose, onCreate }: Props) {
  const [form, setForm] = useState({
    nombre:        '',
    rfc:           '',
    comercial:     '',
    representante: '',
    telefono:      '',
    correo:        '',
    tipoCredito:   'contado' as 'contado' | 'credito',
    divisa:        'MXN' as 'MXN' | 'USD',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const s = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.nombre.trim()) { setError('La razón social es obligatoria.'); return; }
    if (!form.rfc.trim())    { setError('El RFC es obligatorio.'); return; }
    setError('');
    setSaving(true);
    try {
      const cliente: ClienteVermur = {
        id:                `CLI-${Date.now()}`,
        nombre:            form.nombre.trim(),
        comercial:         form.comercial.trim(),
        representante:     form.representante.trim(),
        rfc:               form.rfc.trim().toUpperCase(),
        domicilio:         '',
        telefono:          form.telefono.trim(),
        correo:            form.correo.trim(),
        tipoCredito:       form.tipoCredito,
        monto:             0,
        divisa:            form.divisa,
        dias:              0,
        interesMoratorio:  0,
        statusOperativo:   'ACTIVO',
        atradius:          '',
        montoAprobado:     '',
        expedienteDrive:   false,
        comentarios:       '',
        fechaAlta:         new Date().toISOString().split('T')[0],
        docsAlta: {
          acta: false, poder: false, identificacion: false,
          csf: false, comprobante: false, bancaria: false,
        },
        contrato: { enviado: false, firmadoCorreo: false, fisicoArchivado: false, fechaEnvio: '' },
        pagare:   { aplica: false, enviado: false, firmado: false, fisico: false, monto: 0, vencimiento: '' },
      };
      await onCreate(cliente);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar el cliente.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[16px] border border-card-border shadow-xl w-full max-w-[520px] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
          <h3 className="text-[15px] font-semibold text-text-primary">Nuevo cliente</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-neutral-bg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={LABEL}>Razón social *</label>
              <input
                className={INPUT}
                value={form.nombre}
                onChange={e => s('nombre', e.target.value)}
                placeholder="Empresa S.A. de C.V."
                autoFocus
              />
            </div>
            <div>
              <label className={LABEL}>RFC *</label>
              <input
                className={INPUT}
                value={form.rfc}
                onChange={e => s('rfc', e.target.value.toUpperCase())}
                placeholder="XAXX010101000"
              />
            </div>
            <div>
              <label className={LABEL}>Nombre comercial</label>
              <input className={INPUT} value={form.comercial} onChange={e => s('comercial', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Representante legal</label>
              <input className={INPUT} value={form.representante} onChange={e => s('representante', e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>Teléfono</label>
              <input className={INPUT} value={form.telefono} onChange={e => s('telefono', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Correo electrónico</label>
              <input
                className={INPUT}
                type="email"
                value={form.correo}
                onChange={e => s('correo', e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Tipo de crédito</label>
              <select
                className={INPUT}
                value={form.tipoCredito}
                onChange={e => s('tipoCredito', e.target.value as 'contado' | 'credito')}
              >
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Divisa</label>
              <select
                className={INPUT}
                value={form.divisa}
                onChange={e => s('divisa', e.target.value as 'MXN' | 'USD')}
              >
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-[12px] text-danger-text bg-danger-bg rounded-[6px] px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-divider flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors shadow-sm"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saving ? 'Guardando…' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
