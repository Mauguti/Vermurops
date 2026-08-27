import React, { useState, useEffect } from 'react';
import { ClienteVermur, DocsAlta, ContratoCliente, PagareCliente } from './ClientesData';
import { validarRFC } from '../../lib/validadores';
import { ChevronRight, Loader2, Check } from 'lucide-react';

interface Props {
  cliente: ClienteVermur;
  onBack: () => void;
  onUpdate: (id: string, data: Partial<ClienteVermur>) => Promise<void>;
}

const DOCS_ALTA_DEFAULT: DocsAlta = { acta: false, poder: false, identificacion: false, csf: false, comprobante: false, bancaria: false };
const CONTRATO_DEFAULT: ContratoCliente = { enviado: false, firmadoCorreo: false, fisicoArchivado: false, fechaEnvio: '' };
const PAGARE_DEFAULT: PagareCliente = { aplica: false, enviado: false, firmado: false, fisico: false, monto: 0, vencimiento: '' };

/** Fill in defaults for optional fields so the form never reads undefined. */
const withDefaults = (c: ClienteVermur): ClienteVermur => ({
  ...c,
  comercial: c.comercial ?? '',
  representante: c.representante ?? '',
  rfc: c.rfc ?? '',
  domicilio: c.domicilio ?? '',
  telefono: c.telefono ?? '',
  correo: c.correo ?? '',
  tipoCredito: c.tipoCredito ?? 'contado',
  monto: c.monto ?? 0,
  divisa: c.divisa ?? 'MXN',
  interesMoratorio: c.interesMoratorio ?? 0,
  atradius: c.atradius ?? '',
  montoAprobado: c.montoAprobado ?? '',
  expedienteDrive: c.expedienteDrive ?? false,
  comentarios: c.comentarios ?? '',
  docsAlta: c.docsAlta ?? DOCS_ALTA_DEFAULT,
  contrato: c.contrato ?? CONTRATO_DEFAULT,
  pagare: c.pagare ?? PAGARE_DEFAULT,
});

type TabId = 'informacion' | 'credito' | 'expediente' | 'contrato';

// ── Shared style helpers ──────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function BoolCheck({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        onClick={onToggle}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
          checked ? 'bg-brand border-brand' : 'border-card-border group-hover:border-brand/50'
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className={`text-[13px] ${checked ? 'text-text-primary' : 'text-text-secondary'}`}>{label}</span>
    </label>
  );
}

function SaveBar({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <div className="mt-8 pt-6 border-t border-divider flex justify-end">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 bg-brand text-white px-5 py-2 rounded-[8px] text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors shadow-sm"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FichaCliente({ cliente, onBack, onUpdate }: Props) {
  const [tab, setTab] = useState<TabId>('informacion');
  const [draft, setDraft] = useState<ClienteVermur>(() => withDefaults(cliente));
  const [saving, setSaving] = useState(false);
  // Feedback inline de formato del RFC (solo en pestaña Información).
  const [rfcError, setRfcError] = useState('');

  // Reset draft when Firestore confirms write (onSnapshot pushes fresh cliente)
  useEffect(() => {
    setDraft(withDefaults(cliente));
    setRfcError('');
  }, [cliente]);

  // ¿El usuario modificó el RFC respecto al valor guardado? Solo entonces se valida
  // (backward compat: RFCs heredados intactos nunca bloquean el guardado).
  const rfcModificado = () => (draft.rfc ?? '').trim().toUpperCase() !== (cliente.rfc ?? '').trim().toUpperCase();

  // Valida el RFC al salir del campo, solo si fue modificado y tiene contenido.
  const handleRfcBlur = () => {
    const rfc = (draft.rfc ?? '').trim();
    setRfcError(rfc !== '' && rfcModificado() ? validarRFC(rfc).error : '');
  };

  // Guarda la pestaña Información con guard de RFC: si el RFC fue modificado y es
  // inválido, bloquea; si no se tocó, no valida (heredados pasan siempre).
  const saveInformacion = (fields: Partial<ClienteVermur>) => {
    if (rfcModificado()) {
      const check = validarRFC(draft.rfc);
      if (!check.valido) { setRfcError(check.error); return; }
    }
    setRfcError('');
    save(fields);
  };

  const set = <K extends keyof ClienteVermur>(key: K, val: ClienteVermur[K]) =>
    setDraft(prev => ({ ...prev, [key]: val }));

  const save = async (fields: Partial<ClienteVermur>) => {
    setSaving(true);
    try {
      await onUpdate(cliente.id, fields);
    } finally {
      setSaving(false);
    }
  };

  const TABS: { id: TabId; label: string }[] = [
    { id: 'informacion', label: 'Información' },
    { id: 'credito',     label: 'Crédito' },
    { id: 'expediente',  label: 'Expediente' },
    { id: 'contrato',    label: 'Contrato / Pagaré' },
  ];

  // ── Docs Alta fields ────────────────────────────────────────────────────────
  const docsFields: Array<[keyof DocsAlta, string]> = [
    ['acta',           'Acta constitutiva'],
    ['poder',          'Poder notarial del representante'],
    ['identificacion', 'Identificación oficial vigente'],
    ['csf',            'Constancia de Situación Fiscal'],
    ['comprobante',    'Comprobante de domicilio fiscal'],
    ['bancaria',       'Carátula de cuenta bancaria (CLABE)'],
  ];

  // ── Contrato / Pagaré bool fields ───────────────────────────────────────────
  const contraBools: Array<['enviado' | 'firmadoCorreo' | 'fisicoArchivado', string]> = [
    ['enviado',          'Contrato enviado al cliente'],
    ['firmadoCorreo',    'Firmado y devuelto por correo'],
    ['fisicoArchivado',  'Físico firmado archivado en oficina'],
  ];

  const pagareBools: Array<['enviado' | 'firmado' | 'fisico', string]> = [
    ['enviado', 'Pagaré enviado'],
    ['firmado', 'Pagaré firmado'],
    ['fisico',  'Físico archivado en oficina'],
  ];

  return (
    <div className="space-y-[24px]">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] text-text-secondary">
          <button onClick={onBack} className="hover:text-text-primary transition-colors">Cuentas</button>
          <ChevronRight className="w-4 h-4 text-text-muted" />
          <span className="text-text-primary font-medium">{cliente.nombre}</span>
        </div>
        <span className={`px-3 py-1 rounded-md text-[11px] font-semibold tracking-wide ${
          cliente.statusOperativo === 'ACTIVO'
            ? 'bg-success-bg text-success-text'
            : 'bg-neutral-bg text-text-secondary'
        }`}>
          {cliente.statusOperativo}
        </span>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-[12px] border border-card-border shadow-sm px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="w-[52px] h-[52px] bg-canvas border border-card-border rounded-[10px] flex items-center justify-center text-[20px] font-semibold text-text-primary shrink-0">
            {cliente.nombre.charAt(0)}
          </div>
          <div>
            <h2 className="text-[18px] font-semibold text-text-primary leading-tight">{cliente.nombre}</h2>
            {cliente.comercial && (
              <p className="text-[12px] text-text-muted mt-0.5">{cliente.comercial}</p>
            )}
            <p className="text-[11px] text-text-muted font-mono mt-1">RFC: {cliente.rfc || '—'}</p>
          </div>
        </div>
      </div>

      {/* Tab panel */}
      <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="border-b border-divider bg-canvas px-6">
          <nav className="flex">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`py-[14px] px-1 mr-6 text-[13px] font-medium transition-colors border-b-2 ${
                  tab === id
                    ? 'border-brand text-text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-8 bg-white">

          {/* ── Información ────────────────────────────────────────────────── */}
          {tab === 'informacion' && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="sm:col-span-2">
                  <Field label="Razón social">
                    <input className={INPUT} value={draft.nombre}
                      onChange={e => set('nombre', e.target.value)} />
                  </Field>
                </div>
                <Field label="Nombre comercial">
                  <input className={INPUT} value={draft.comercial}
                    onChange={e => set('comercial', e.target.value)} />
                </Field>
                <Field label="Representante legal">
                  <input className={INPUT} value={draft.representante}
                    onChange={e => set('representante', e.target.value)} />
                </Field>
                <Field label="RFC">
                  <input
                    className={`${INPUT} ${rfcError ? 'border-danger-text focus:border-danger-text focus:ring-danger-text' : ''}`}
                    value={draft.rfc}
                    onChange={e => { set('rfc', e.target.value.toUpperCase()); if (rfcError) setRfcError(''); }}
                    onBlur={handleRfcBlur} />
                  {rfcError && <p className="mt-1 text-[11px] text-danger-text">{rfcError}</p>}
                </Field>
                <Field label="Teléfono">
                  <input className={INPUT} value={draft.telefono}
                    onChange={e => set('telefono', e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Domicilio fiscal">
                    <input className={INPUT} value={draft.domicilio}
                      onChange={e => set('domicilio', e.target.value)} />
                  </Field>
                </div>
                <Field label="Correo electrónico">
                  <input className={INPUT} type="email" value={draft.correo}
                    onChange={e => set('correo', e.target.value)} />
                </Field>
                <Field label="Estatus operativo">
                  <select className={INPUT} value={draft.statusOperativo}
                    onChange={e => set('statusOperativo', e.target.value as 'ACTIVO' | 'INACTIVO')}>
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                  </select>
                </Field>
                <Field label="Fecha de alta">
                  <input className={INPUT} type="date" value={draft.fechaAlta}
                    onChange={e => set('fechaAlta', e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Comentarios">
                    <textarea
                      className={`${INPUT} resize-none`}
                      rows={3}
                      value={draft.comentarios}
                      onChange={e => set('comentarios', e.target.value)}
                    />
                  </Field>
                </div>
              </div>
              <SaveBar saving={saving} onSave={() => saveInformacion({
                nombre: draft.nombre, comercial: draft.comercial,
                representante: draft.representante, rfc: draft.rfc,
                domicilio: draft.domicilio, telefono: draft.telefono,
                correo: draft.correo, statusOperativo: draft.statusOperativo,
                fechaAlta: draft.fechaAlta, comentarios: draft.comentarios,
              })} />
            </div>
          )}

          {/* ── Crédito ────────────────────────────────────────────────────── */}
          {tab === 'credito' && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Tipo de crédito">
                  <select className={INPUT} value={draft.tipoCredito}
                    onChange={e => set('tipoCredito', e.target.value as 'credito' | 'contado')}>
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                  </select>
                </Field>
                <Field label="Divisa">
                  <select className={INPUT} value={draft.divisa}
                    onChange={e => set('divisa', e.target.value as 'MXN' | 'USD')}>
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </Field>

                {draft.tipoCredito === 'credito' && (
                  <>
                    <Field label="Línea de crédito">
                      <input className={INPUT} type="number" min={0} value={draft.monto}
                        onChange={e => set('monto', Number(e.target.value))} />
                    </Field>
                    <Field label="Plazo (días)">
                      <select className={INPUT} value={draft.dias}
                        onChange={e => set('dias', Number(e.target.value) as 0|15|20|30|45|60|90)}>
                        {[0, 15, 20, 30, 45, 60, 90].map(d => (
                          <option key={d} value={d}>{d === 0 ? 'Contado' : `${d} días`}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Interés moratorio (%)">
                      <input className={INPUT} type="number" min={0} step={0.5}
                        value={draft.interesMoratorio}
                        onChange={e => set('interesMoratorio', Number(e.target.value))} />
                    </Field>
                  </>
                )}

                <Field label="Atradius">
                  <select className={INPUT} value={draft.atradius}
                    onChange={e => set('atradius', e.target.value as ClienteVermur['atradius'])}>
                    <option value="">— Sin gestionar —</option>
                    <option value="SOLICITADO">Solicitado</option>
                    <option value="✔">✔ Aprobado</option>
                    <option value="RECHAZADO">Rechazado</option>
                    <option value="RETIRADO">Retirado</option>
                    <option value="NA">N/A</option>
                    <option value="X">X</option>
                  </select>
                </Field>
                <Field label="Monto aprobado Atradius">
                  <input className={INPUT} value={draft.montoAprobado}
                    placeholder="e.g. USD 100,000"
                    onChange={e => set('montoAprobado', e.target.value)} />
                </Field>
              </div>
              <SaveBar saving={saving} onSave={() => save({
                tipoCredito: draft.tipoCredito, monto: draft.monto,
                divisa: draft.divisa, dias: draft.dias,
                interesMoratorio: draft.interesMoratorio,
                atradius: draft.atradius, montoAprobado: draft.montoAprobado,
              })} />
            </div>
          )}

          {/* ── Expediente ─────────────────────────────────────────────────── */}
          {tab === 'expediente' && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <p className={LABEL}>Documentos de alta (KYC)</p>
                  <div className="space-y-3 mt-2">
                    {docsFields.map(([k, label]) => {
                      const checked = draft.docsAlta[k];
                      return (
                        <label key={k} className="flex items-center gap-3 cursor-pointer group">
                          <div
                            onClick={() => setDraft(prev => ({
                              ...prev,
                              docsAlta: { ...prev.docsAlta, [k]: !prev.docsAlta[k] },
                            }))}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              checked ? 'bg-brand border-brand' : 'border-card-border group-hover:border-brand/50'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`text-[13px] ${checked ? 'text-text-primary' : 'text-text-secondary'}`}>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className={LABEL}>Expediente en Drive</p>
                  <div className="mt-2">
                    <BoolCheck
                      checked={draft.expedienteDrive}
                      label="Carpeta creada en Google Drive"
                      onToggle={() => set('expedienteDrive', !draft.expedienteDrive)}
                    />
                  </div>
                </div>
              </div>
              <SaveBar saving={saving} onSave={() => save({
                docsAlta: draft.docsAlta,
                expedienteDrive: draft.expedienteDrive,
              })} />
            </div>
          )}

          {/* ── Contrato / Pagaré ──────────────────────────────────────────── */}
          {tab === 'contrato' && (
            <div className="space-y-8">
              {/* Contrato */}
              <div>
                <p className={`${LABEL} mb-4`}>Contrato de servicios</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {contraBools.map(([k, label]) => {
                      const checked = draft.contrato[k];
                      return (
                        <label key={k} className="flex items-center gap-3 cursor-pointer group">
                          <div
                            onClick={() => setDraft(prev => ({
                              ...prev,
                              contrato: { ...prev.contrato, [k]: !prev.contrato[k] },
                            }))}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              checked ? 'bg-brand border-brand' : 'border-card-border group-hover:border-brand/50'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`text-[13px] ${checked ? 'text-text-primary' : 'text-text-secondary'}`}>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <Field label="Fecha de envío del contrato">
                    <input
                      className={INPUT}
                      type="date"
                      value={draft.contrato.fechaEnvio}
                      onChange={e =>
                        setDraft(prev => ({
                          ...prev,
                          contrato: { ...prev.contrato, fechaEnvio: e.target.value },
                        }))
                      }
                    />
                  </Field>
                </div>
              </div>

              {/* Pagaré */}
              <div>
                <p className={`${LABEL} mb-4`}>Pagaré</p>
                <BoolCheck
                  checked={draft.pagare.aplica}
                  label="Aplica pagaré para este cliente"
                  onToggle={() =>
                    setDraft(prev => ({
                      ...prev,
                      pagare: { ...prev.pagare, aplica: !prev.pagare.aplica },
                    }))
                  }
                />

                {draft.pagare.aplica && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-5">
                    <div className="space-y-3">
                      {pagareBools.map(([k, label]) => {
                        const checked = draft.pagare[k];
                        return (
                          <label key={k} className="flex items-center gap-3 cursor-pointer group">
                            <div
                              onClick={() => setDraft(prev => ({
                                ...prev,
                                pagare: { ...prev.pagare, [k]: !prev.pagare[k] },
                              }))}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                checked ? 'bg-brand border-brand' : 'border-card-border group-hover:border-brand/50'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={`text-[13px] ${checked ? 'text-text-primary' : 'text-text-secondary'}`}>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="space-y-5">
                      <Field label="Monto del pagaré">
                        <input
                          className={INPUT}
                          type="number"
                          min={0}
                          value={draft.pagare.monto}
                          onChange={e =>
                            setDraft(prev => ({
                              ...prev,
                              pagare: { ...prev.pagare, monto: Number(e.target.value) },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Vencimiento">
                        <input
                          className={INPUT}
                          type="date"
                          value={draft.pagare.vencimiento}
                          onChange={e =>
                            setDraft(prev => ({
                              ...prev,
                              pagare: { ...prev.pagare, vencimiento: e.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              <SaveBar saving={saving} onSave={() => save({
                contrato: draft.contrato,
                pagare: draft.pagare,
              })} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
