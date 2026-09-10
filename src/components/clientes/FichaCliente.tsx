import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ClienteVermur, DocsAlta, ContratoCliente, PagareCliente } from './ClientesData';
import { validarRFC } from '../../lib/validadores';
import { ChevronRight, Loader2, Check, Upload, AlertTriangle } from 'lucide-react';
import {
  DOCUMENTOS_EXPEDIENTE, TIPO_A_DOCSALTA, estadoChecklist, validarClasificacion,
  camposAdoptablesExpediente, etiquetaDocExpediente, traducirAviso,
  type TipoDocExpediente, type DocExpediente, type ClasificacionValidada,
} from '../../lib/clasificacionDocumentos';
import { useExpedienteCliente, type ArchivoSubido } from '../../hooks/useExpedienteCliente';
import RevisionDocumentoClasificado, { EnlaceArchivo, type RevisionConfirmada } from '../documentos/RevisionDocumentoClasificado';
import { FichaHeader, BadgeEstado } from '../ui/ficha/FichaLayout';
import { BloqueEnlaces } from '../ui/ficha/EnlaceEntidad';
import { useCotizaciones } from '../../hooks/useCotizaciones';
import { useEmbarques } from '../../hooks/useEmbarques';
import { useFacturas } from '../../hooks/useFacturas';
import { resumenDeCliente } from '../../lib/cuentasPorCobrar';
import { formatearPorMoneda } from '../../lib/sumarPorMoneda';
import { usuariosPorRol, useAuth } from '../../auth/AuthContext';

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

function SaveBar({ onSave, saving, oculta }: { onSave: () => void; saving: boolean; oculta?: boolean }) {
  if (oculta) return null;
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
  /*
   * B2 · Ver y editar son cosas distintas (§4.1). El expediente del cliente
   * —días de crédito, RFC, validación fiscal— es del alta, y el alta es de
   * Administración. Los demás roles consultan: el fieldset deshabilita todos
   * los campos de una vez y las barras de guardar no se montan.
   */
  const { puede } = useAuth();
  const soloConsulta = !puede('cliente.alta');

  // U-4 · Lo que este cliente tiene abierto, enlazado desde su propia ficha.
  const { quotes } = useCotizaciones();
  const { embarques } = useEmbarques();
  const { facturas, cobros } = useFacturas();
  const carteraCliente = useMemo(
    () => resumenDeCliente(cliente.id, facturas, cobros, new Date().toISOString().slice(0, 10)),
    [cliente.id, facturas, cobros],
  );
  const susCotizaciones = quotes.filter(q => q.clienteId === cliente.id);
  // Por su cotización, o porque el embarque lo enlaza como cliente a cobrar:
  // los capturados a mano no tienen cotización y antes quedaban fuera.
  const susEmbarques = embarques.filter(e =>
    susCotizaciones.some(q => q.id === e.cotizacionId)
    || e.entidadesRef?.clienteCobrar?.id === cliente.id);
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

  /*
   * ── Expediente digital (D-2) ────────────────────────────────────────────
   * Subir → clasificar con IA → REVISIÓN → guardar. La revisión es la
   * frontera: nada de lo que propone n8n toca Firestore sin confirmarse ahí.
   */
  const { procesando, subirYClasificar, guardarDocumento } = useExpedienteCliente();
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [tipoSubiendo, setTipoSubiendo] = useState<TipoDocExpediente | null>(null);
  const [errorExpediente, setErrorExpediente] = useState('');
  const [guardandoDoc, setGuardandoDoc] = useState(false);
  const [revision, setRevision] = useState<{
    archivo: ArchivoSubido;
    clasificacion: ClasificacionValidada;
    tipoEsperado: TipoDocExpediente;
  } | null>(null);

  const pedirArchivo = (tipo: TipoDocExpediente) => {
    setTipoSubiendo(tipo);
    setErrorExpediente('');
    inputArchivo.current?.click();
  };

  const handleArchivoExpediente = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-elegir el mismo archivo
    if (!file || !tipoSubiendo) return;
    try {
      const archivo = await subirYClasificar(file, cliente, tipoSubiendo);
      const resultado = validarClasificacion(archivo.clasificacion);
      if (!resultado.valida || !resultado.datos) {
        setErrorExpediente(resultado.motivo ?? 'El clasificador devolvió una respuesta ilegible.');
        return;
      }
      setRevision({ archivo, clasificacion: resultado.datos, tipoEsperado: tipoSubiendo });
    } catch (err) {
      setErrorExpediente(err instanceof Error ? err.message : 'No se pudo procesar el documento.');
    }
  };

  const handleGuardarRevision = async (r: RevisionConfirmada) => {
    if (!revision) return;
    setGuardandoDoc(true);
    try {
      const documento: DocExpediente = {
        nombre: r.nombre,
        nombreOriginal: revision.archivo.nombreOriginal,
        storagePath: revision.archivo.storagePath,
        url: revision.archivo.url,
        confianza: revision.clasificacion.confianza,
        estado: r.estado,
        datos: revision.clasificacion.datos,
        avisos: revision.clasificacion.avisos,
        observaciones: revision.clasificacion.observaciones || undefined,
        subidoPor: '',
        fechaSubida: new Date().toISOString(),
      };
      await guardarDocumento(
        cliente,
        r.tipoConfirmado as TipoDocExpediente,
        documento,
        r.adoptados,
      );
      setRevision(null);
    } catch (err) {
      setErrorExpediente(err instanceof Error ? err.message : 'No se pudo guardar el documento.');
    } finally {
      setGuardandoDoc(false);
    }
  };

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
      {/* U-3 · Mismo encabezado que la ficha de cotización. Antes eran tres
          piezas separadas —un breadcrumb con un badge suelto a la derecha y una
          tarjeta aparte con el nombre— que no se leían como una sola cabecera. */}
      <FichaHeader
        modulo="Clientes"
        onBack={onBack}
        folio={cliente.id}
        titulo={cliente.nombre}
        badges={
          <>
            <BadgeEstado tono={cliente.statusOperativo === 'ACTIVO' ? 'exito' : 'neutro'}>
              {cliente.statusOperativo}
            </BadgeEstado>
            {cliente.validadoFiscalmente !== true && (
              <BadgeEstado
                tono="espera"
                title="Sin validación fiscal no se debe operar un embarque de este cliente."
              >
                Sin validar
              </BadgeEstado>
            )}
          </>
        }
        subtitulo={
          <div className="text-[12px] text-text-muted">
            {cliente.comercial && <span className="mr-3">{cliente.comercial}</span>}
            <span className="font-mono text-[11px]">RFC: {cliente.rfc || '—'}</span>
          </div>
        }
      />

      {/* U-4 · A dónde lleva este cliente. */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <BloqueEnlaces
          titulo="Cotizaciones"
          tipo="cotizacion"
          ids={susCotizaciones.map(q => q.id)}
          vacio="Todavía no se le ha cotizado nada."
        />
        <BloqueEnlaces
          titulo="Embarques"
          tipo="embarque"
          ids={susEmbarques.map(e => e.id)}
          vacio="Ninguna cotización suya ha llegado a embarque."
        />
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

        <fieldset disabled={soloConsulta} className="p-8 bg-white disabled:opacity-90">
          {soloConsulta && (
            <p className="mb-5 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Solo consulta. Las altas y la edición del expediente son de Administración.
            </p>
          )}

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
                {/* Quién lo atiende en cada área. El embarque hereda el
                    operativo al nacer, y la lista de Embarques filtra por él. */}
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-5 border border-gray-150 rounded-lg p-4 bg-gray-50/40">
                  {([
                    ['responsableVentas', 'Responsable de Ventas', 'ventas'],
                    ['responsablePricing', 'Responsable de Pricing', 'pricing'],
                    ['responsableOperativo', 'Responsable operativo', 'operaciones'],
                  ] as const).map(([campo, label, rol]) => (
                    <Field key={campo} label={label}>
                      <select className={INPUT} value={draft[campo] ?? ''}
                        onChange={e => set(campo, e.target.value || null)}>
                        <option value="">— Sin asignar —</option>
                        {usuariosPorRol(rol).map(u => <option key={u.email} value={u.email}>{u.nombre}</option>)}
                        {draft[campo] && !usuariosPorRol(rol).some(u => u.email === draft[campo])
                          && <option value={draft[campo]!}>{draft[campo]}</option>}
                      </select>
                    </Field>
                  ))}
                </div>
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
              <SaveBar oculta={soloConsulta} saving={saving} onSave={() => saveInformacion({
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
              {/* Su cartera, derivada de facturas y cobros: «tiene 45,000 por
                  cobrar, 12,000 vencidos». Por moneda, nunca revuelto. */}
              {carteraCliente && (
                <div className={`mb-5 rounded-lg border px-4 py-3 text-[12px] ${formatearPorMoneda(carteraCliente.vencido, { vacio: '' }) ? 'border-red-200 bg-red-50 text-red-900' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                  <p>
                    Tiene <strong>{formatearPorMoneda(carteraCliente.porCobrar)}</strong> por cobrar en {carteraCliente.facturas.length} factura{carteraCliente.facturas.length !== 1 ? 's' : ''}
                    {formatearPorMoneda(carteraCliente.vencido, { vacio: '' })
                      ? <>, <strong>{formatearPorMoneda(carteraCliente.vencido)}</strong> vencido{carteraCliente.maxDiasVencido > 0 ? ` (hasta ${carteraCliente.maxDiasVencido} días de atraso)` : ''}.</>
                      : ', nada vencido.'}
                  </p>
                  <p className="text-[10px] mt-1 opacity-70">El detalle y el registro de cobros están en Finanzas → Cuentas por cobrar.</p>
                </div>
              )}
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
              <SaveBar oculta={soloConsulta} saving={saving} onSave={() => save({
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
              {/* input oculto compartido por las 6 tarjetas */}
              <input
                ref={inputArchivo}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.csv,.eml,.msg"
                className="hidden"
                onChange={handleArchivoExpediente}
              />

              {errorExpediente && (
                <div className="mb-4 border border-red-200 bg-red-50 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
                  <p className="text-[12px] text-red-700">{errorExpediente}</p>
                </div>
              )}

              <p className={LABEL}>Documentos de alta (KYC)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                {DOCUMENTOS_EXPEDIENTE.map(({ tipo, etiqueta }) => {
                  const docGuardado = draft.expediente?.[tipo];
                  const estado = estadoChecklist(draft.expediente, tipo);
                  const claveManual = TIPO_A_DOCSALTA[tipo];
                  const marcadoAMano = !docGuardado && draft.docsAlta[claveManual];
                  const subiendoEste = procesando && tipoSubiendo === tipo;
                  return (
                    <div
                      key={tipo}
                      className={`border rounded-lg px-3.5 py-3 ${
                        estado === 'con_observaciones'
                          ? 'border-amber-300 bg-amber-50/40'
                          : estado === 'cargado' || marcadoAMano
                            ? 'border-emerald-200 bg-emerald-50/30'
                            : 'border-card-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-text-primary">{etiqueta}</p>
                          {docGuardado ? (
                            <div className="mt-1 space-y-0.5">
                              <EnlaceArchivo url={docGuardado.url} nombre={docGuardado.nombre} />
                              <p className="text-[10px] text-text-muted">
                                {docGuardado.fechaSubida.slice(0, 10)}
                                {docGuardado.subidoPor && ` · ${docGuardado.subidoPor}`}
                              </p>
                              {docGuardado.avisos.map(a => (
                                <p key={a} className="text-[10px] text-amber-700 flex items-start gap-1">
                                  <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
                                  {traducirAviso(a)}
                                </p>
                              ))}
                            </div>
                          ) : marcadoAMano ? (
                            <p className="text-[10px] text-text-muted mt-1">
                              Marcado como entregado (sin archivo digital).
                            </p>
                          ) : (
                            <p className="text-[10px] text-text-muted mt-1">Pendiente</p>
                          )}
                        </div>
                        <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          estado === 'con_observaciones'
                            ? 'bg-amber-100 text-amber-800'
                            : estado === 'cargado' || marcadoAMano
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}>
                          {estado === 'con_observaciones' ? 'Observaciones'
                            : estado === 'cargado' ? 'Cargado'
                            : marcadoAMano ? 'En físico' : 'Pendiente'}
                        </span>
                      </div>

                      {!soloConsulta && (
                        <div className="mt-2.5 flex items-center gap-3">
                          <button
                            type="button"
                            disabled={procesando}
                            onClick={() => pedirArchivo(tipo)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-brand hover:text-brand-hover disabled:opacity-50"
                          >
                            {subiendoEste
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Upload className="w-3 h-3" />}
                            {subiendoEste ? 'Clasificando…' : docGuardado ? 'Reemplazar' : 'Subir documento'}
                          </button>
                          {/* El documento físico en oficina sigue valiendo:
                              marcar a mano no exige digitalizar. */}
                          {!docGuardado && (
                            <button
                              type="button"
                              onClick={() => setDraft(prev => ({
                                ...prev,
                                docsAlta: { ...prev.docsAlta, [claveManual]: !prev.docsAlta[claveManual] },
                              }))}
                              className="text-[10px] text-text-muted hover:text-text-secondary"
                            >
                              {marcadoAMano ? 'Quitar marca manual' : 'Marcar en físico'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6">
                <p className={LABEL}>Expediente en Drive</p>
                <div className="mt-2">
                  <BoolCheck
                    checked={draft.expedienteDrive}
                    label="Carpeta creada en Google Drive"
                    onToggle={() => set('expedienteDrive', !draft.expedienteDrive)}
                  />
                </div>
              </div>

              {/* La subida guarda sola al confirmar la revisión; esta barra es
                  para las marcas manuales y el checkbox de Drive. */}
              <SaveBar oculta={soloConsulta} saving={saving} onSave={() => save({
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

              <SaveBar oculta={soloConsulta} saving={saving} onSave={() => save({
                contrato: draft.contrato,
                pagare: draft.pagare,
              })} />
            </div>
          )}

        </fieldset>
      </div>

      {revision && (
        <RevisionDocumentoClasificado
          clasificacion={revision.clasificacion}
          tipoEsperado={revision.tipoEsperado}
          tipos={DOCUMENTOS_EXPEDIENTE}
          etiqueta={etiquetaDocExpediente}
          camposAdoptables={camposAdoptablesExpediente(revision.clasificacion, cliente)}
          guardando={guardandoDoc}
          onGuardar={handleGuardarRevision}
          onCancelar={() => setRevision(null)}
        />
      )}
    </div>
  );
}
