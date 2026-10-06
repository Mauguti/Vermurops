import React, { useState, useMemo, useCallback } from 'react';
import { Phone, Mail, Check, BookOpen } from 'lucide-react';
import { ProveedorVermur, contactoPrincipal } from './ProveedoresData';
import type { DocsAlta } from '../clientes/ClientesData';
import { PIPELINE_STAGES } from '../quotes/QuotesData';
import type { KanbanQuote } from '../quotes/QuotesData';
import { extraerHistorialProveedor, calcularResumenProveedor, formatTotalesPorMoneda } from '../../lib/historialProveedor';
import { FichaHeader, BadgeEstado } from '../ui/ficha/FichaLayout';
import { BloqueEnlaces } from '../ui/ficha/EnlaceEntidad';
import { useTarifas } from '../../hooks/useTarifas';
import { useOrdenesCompra } from '../../hooks/useOrdenesCompra';
import { useAuth } from '../../auth/AuthContext';
import { estadoValidacion, etiquetaValidacion } from '../../lib/estadoValidacion';
import { docsParaProveedor, esProveedorExtranjero, DOCS_ALTA_PROVEEDOR_DEFAULT } from '../../lib/expedienteProveedor';
import ExpedientePanel, { type ArchivoExpediente } from '../expediente/ExpedientePanel';
import SubirDocumentosLote from '../documentos/SubirDocumentosLote';
import { useSubidaClasificada } from '../../hooks/useSubidaClasificada';
import { clasificacionDeLinea, type LineaLote, type TipoDocLote } from '../../lib/loteDocumentos';

interface Props {
  proveedor: ProveedorVermur;
  quotes: KanbanQuote[];
  onBack: () => void;
  onEdit: () => void;
  onUpdate: (id: string, data: Partial<ProveedorVermur>) => Promise<void>;
  /** Etiqueta del botón regresar cuando se llegó desde otra ficha. */
  regresarLabel?: string;
}

const getTransportLabel = (type: string) => {
  switch (type) {
    case 'aereo': return 'Aereo';
    case 'maritimo': return 'Maritimo';
    case 'terrestre': return 'Terrestre';
    case 'aduanal': return 'Aduanal';
    case 'proveedor': return 'Proveedor';
    case 'transportista': return 'Transportista';
    case 'agente_carga': return 'Agente';
    case 'agente_aduanal': return 'Agente aduanal';
    default: return type;
  }
};

export default function FichaProveedor({ proveedor, quotes, onBack, onEdit, onUpdate, regresarLabel }: Props) {
  const [fichaTab, setFichaTab] = useState<'historial' | 'notas' | 'expediente'>('historial');

  const cp = contactoPrincipal(proveedor);
  const { puede, user } = useAuth();
  const puedeEditar = puede('proveedor.alta');

  /*
   * ── Tarea 63 · Un solo botón de documentos, también en el proveedor ─────
   * El catálogo del proveedor se indexa por CLAVE de DocsAlta ('csf'), no por
   * el nombre largo que devuelve el agente ('constancia_situacion_fiscal'):
   * `normalizarTipoClasificado` resuelve los dos con el mismo grupo.
   *
   * La capacidad que se exige es `cliente.alta` porque es la que el servidor
   * pide para el flujo `expediente` (una sola Function, enrutada por header).
   * Las dos las tiene Administración, así que en la práctica coinciden.
   */
  const { subirYClasificar } = useSubidaClasificada();
  const docsProveedor = docsParaProveedor(proveedor);
  const catalogoLote: TipoDocLote[] = docsProveedor.map(d => ({
    tipo: d.campo, etiqueta: d.etiqueta,
  }));
  const etiquetaLote = useCallback(
    (tipo: string) => docsProveedor.find(d => d.campo === tipo)?.etiqueta ?? tipo.replace(/_/g, ' '),
    [docsProveedor],
  );

  /*
   * ── Tarea 71 · El registro de la corrección, también aquí ───────────────
   * La 63 lo dejó escrito en el expediente del cliente y en la orden de
   * compra, y en el proveedor se perdía: `ArchivoExpediente` no tenía dónde.
   * Con `clasificacion` (campo aprobado, opcional) ya hay lugar, y el texto lo
   * redacta `clasificacionDeLinea` —el mismo de los otros dos— en vez de una
   * tercera copia. La clave se omite cuando no hay nada que registrar:
   * Firestore rechaza `undefined` y tumbaría el lote completo (§3).
   */
  const guardarLoteExpediente = async (lineas: LineaLote[]) => {
    const prevArchivos = proveedor.archivosExpediente ?? {};
    const archivos = { ...prevArchivos };
    const docsAlta = { ...(proveedor.docsAlta ?? DOCS_ALTA_PROVEEDOR_DEFAULT) };
    const autor = { por: user?.email ?? user?.nombre ?? '', fecha: new Date().toISOString(), etiqueta: etiquetaLote };
    for (const l of lineas) {
      const campo = l.tipoElegido as keyof DocsAlta;
      const clasificacion = clasificacionDeLinea(l, autor);
      archivos[campo] = {
        storagePath: l.storagePath,
        url: l.url,
        nombre: l.nombreArchivo,
        subidoPor: autor.por,
        fecha: autor.fecha,
        ...(clasificacion ? { clasificacion } : {}),
      };
      docsAlta[campo] = true;
    }
    await onUpdate(proveedor.id, { docsAlta, archivosExpediente: archivos });
  };

  // U-4 · Lo que cuelga de este proveedor.
  const { tarifas } = useTarifas();
  const { ordenes } = useOrdenesCompra();
  const susTarifas = tarifas.filter(t => t.proveedorId === proveedor.id);
  const susOrdenes = ordenes.filter(o => o.proveedorId === proveedor.id);

  const provHistorial = useMemo(
    () => extraerHistorialProveedor(quotes, proveedor.id, proveedor.nombre),
    [quotes, proveedor.id, proveedor.nombre],
  );

  const provResumen = useMemo(
    () => calcularResumenProveedor(provHistorial),
    [provHistorial],
  );

  const etapaLabel = (etapa: string) =>
    PIPELINE_STAGES.find(s => s.id === etapa)?.label ?? etapa;

  return (
    <div className="space-y-[24px]">
      {/* U-3 · Mismo encabezado que la ficha de cotización: breadcrumb, folio,
          nombre y badges. Antes era un breadcrumb suelto sin título ni estado,
          así que el nombre del proveedor solo se leía en la miga de pan. */}
      <FichaHeader
        modulo="Proveedores"
        onBack={onBack}
        folio={proveedor.id}
        titulo={proveedor.nombre}
        regresarLabel={regresarLabel}
        badges={
          <>
            <BadgeEstado tono={proveedor.activo === false ? 'peligro' : 'exito'}>
              {proveedor.activo === false ? 'Inactivo' : 'Activo'}
            </BadgeEstado>
            {(() => {
              const estado = estadoValidacion(proveedor);
              if (estado === 'sin_validar') return (
                <BadgeEstado tono="espera" title={etiquetaValidacion(proveedor)}>
                  En revisión
                </BadgeEstado>
              );
              if (estado === 'heredado_magaya') return (
                <BadgeEstado tono="neutro" title={etiquetaValidacion(proveedor)}>
                  Heredado Magaya
                </BadgeEstado>
              );
              if (estado === 'validado') return (
                <BadgeEstado tono="exito" title={etiquetaValidacion(proveedor)}>
                  Aprobado
                </BadgeEstado>
              );
              return null;
            })()}
            {(proveedor.tipos ?? []).map(t => (
              <BadgeEstado key={t} tono="neutro">{getTransportLabel(t)}</BadgeEstado>
            ))}
          </>
        }
        acciones={
          /* B2 · Editar el expediente es del alta: solo Administración. Los
             demás roles consultan — el botón no se muestra deshabilitado, no
             se muestra. */
          puedeEditar ? (
            <button
              onClick={onEdit}
              className="bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm"
            >
              Editar datos
            </button>
          ) : undefined
        }
      />

      {/* U-4 · A dónde lleva este proveedor. Las tarifas no tienen ficha
          propia: se cuentan, y el catálogo se abre desde su módulo. */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Tarifas</span>
          <span className="text-[11px] text-text-secondary">
            {susTarifas.length > 0
              ? `${susTarifas.length} vigente${susTarifas.length !== 1 ? 's' : ''} en el catálogo`
              : 'Sin tarifas cargadas todavía.'}
          </span>
        </div>
        <BloqueEnlaces
          titulo="Órdenes de compra"
          tipo="ordenCompra"
          ids={susOrdenes.map(o => o.id)}
          vacio="Nunca se le ha solicitado un pago."
        />
      </div>

      <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden flex flex-col md:flex-row">
        {/* Main Content (Left 2/3) */}
        <div className="flex-1 border-r border-divider flex flex-col">
          <div className="p-[32px] border-b border-divider bg-white">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-[16px] mb-[16px]">
                <div className="w-[64px] h-[64px] bg-brand/10 border border-brand/20 rounded-[12px] flex items-center justify-center text-[24px] font-bold text-brand">
                  {proveedor.nombre.charAt(0)}
                </div>
                <div>
                  <h2 className="text-[24px] font-semibold text-text-primary tracking-tight leading-none mb-[8px]">{proveedor.nombre}</h2>
                  <div className="flex items-center text-[13px] space-x-[12px]">
                    <span className="text-text-secondary font-mono">RFC: {proveedor.rfc ?? proveedor.numeroEntidadMagaya ?? '—'}</span>
                    <span className="text-divider">•</span>
                    <a href={`http://${proveedor.website}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {proveedor.website}
                    </a>
                  </div>
                </div>
              </div>

              <span className={`px-[10px] py-[4px] rounded-md text-[12px] font-semibold tracking-wide ${proveedor.activo ? 'bg-success-bg text-success-text' : 'bg-neutral-bg text-text-secondary'}`}>
                {proveedor.activo ? 'PROVEEDOR ACTIVO' : 'INACTIVO'}
              </span>
            </div>

            <div className="mt-[24px] pt-[24px] border-t border-divider">
              <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-[12px]">Modalidades Soportadas</h4>
              <div className="flex flex-wrap gap-4">
                {['maritimo', 'aereo', 'terrestre', 'aduanal'].map(mod => {
                  const isSupported = proveedor.modalidades?.includes(mod as any) ?? false;
                  return (
                    <div key={mod} className={`flex items-center border rounded-lg px-3 py-2 ${isSupported ? 'border-brand/30 bg-brand/5' : 'border-card-border bg-canvas opacity-50'}`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${isSupported ? 'bg-brand border-brand' : 'border-text-muted'}`}>
                        {isSupported && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className={`text-[12px] font-semibold uppercase tracking-wide ${isSupported ? 'text-brand' : 'text-text-muted'}`}>
                        {getTransportLabel(mod)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {(proveedor.tipos ?? []).includes('agente_aduanal') && (proveedor.patentes ?? []).length > 0 && (
              <div className="mt-[24px] pt-[24px] border-t border-divider">
                <h4 className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-[12px]">Patentes de Agente Aduanal</h4>
                <div className="flex flex-wrap gap-3">
                  {proveedor.patentes!.map((pat, idx) => (
                    <div key={idx} className="flex items-center border border-brand/30 bg-brand/5 rounded-lg px-3 py-2">
                      <span className="text-[12px] font-semibold text-brand mr-2">#{pat.numero}</span>
                      <span className="text-[12px] text-text-primary">{pat.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cp && (
            <div className="flex flex-wrap gap-[24px] mt-[24px] pt-[24px] border-t border-divider">
              <div className="flex-1 min-w-[200px]">
                <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Principal</p>
                <p className="text-[15px] font-semibold text-text-primary">{cp.nombre}</p>
                <p className="text-[13px] text-text-secondary">{cp.puesto ?? cp.tipo ?? ''}</p>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-[11px] font-medium text-text-muted mb-[4px]">Contacto Rapido</p>
                <div className="space-y-1">
                  <p className="text-[14px] font-medium text-text-primary flex items-center"><Mail className="w-4 h-4 mr-2 text-text-muted"/> {cp.email}</p>
                  <p className="text-[14px] font-medium text-text-primary flex items-center"><Phone className="w-4 h-4 mr-2 text-text-muted"/> {cp.telefono ?? '—'}</p>
                </div>
              </div>
            </div>
            )}
          </div>

          {/* Internal Tabs Provider */}
          <div className="px-[32px] border-b border-divider bg-canvas">
            <nav className="-mb-px flex space-x-[24px]">
              {([['historial', 'Historial de Cotizaciones'], ['expediente', 'Expediente'], ['notas', 'Notas Internas']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFichaTab(key)}
                  className={`py-[16px] px-[4px] text-[13px] font-medium transition-colors border-b-[2px] ${
                    fichaTab === key
                      ? 'border-brand text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-[32px] flex-1 bg-white">
            {/* Tab: Historial de Cotizaciones */}
            {fichaTab === 'historial' && (
              <>
                <h3 className="text-[15px] font-semibold text-text-primary mb-4">
                  Cotizaciones de {proveedor.nombre}
                </h3>

                {provHistorial.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 border border-dashed border-card-border rounded-lg bg-canvas text-text-muted">
                    <BookOpen className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-[13px] font-medium">Sin participacion en cotizaciones</p>
                    <p className="text-[11px] mt-1">Cuando este proveedor participe en una cotizacion, su historial aparecera aqui.</p>
                  </div>
                ) : (
                  <div className="border border-card-border rounded-lg overflow-hidden">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="bg-canvas border-b border-divider text-left">
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Folio</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Fecha</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Concepto</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider">Etapa</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Monto</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-text-muted uppercase tracking-wider text-center">Elegida</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider">
                        {provHistorial.map((r, i) => (
                          <tr key={`${r.folio}-${r.concepto}-${i}`} className="hover:bg-canvas/50 transition-colors">
                            <td className="px-3 py-2.5 font-mono font-medium text-brand">{r.folio}</td>
                            <td className="px-3 py-2.5 text-text-secondary">{r.fecha.slice(0, 10)}</td>
                            <td className="px-3 py-2.5 text-text-primary font-medium truncate max-w-[160px]">{r.concepto}</td>
                            <td className="px-3 py-2.5 text-text-secondary">{etapaLabel(r.etapa)}</td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                              ${r.monto.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {r.moneda}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {r.seleccionada ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-success-text bg-success-bg px-1.5 py-0.5 rounded">
                                  <Check className="w-3 h-3" /> Si
                                </span>
                              ) : (
                                <span className="text-text-muted">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Tab: Expediente */}
            {fichaTab === 'expediente' && (
              <ExpedientePanel
                entidad={proveedor}
                documentos={docsProveedor}
                botonLote={
                  <SubirDocumentosLote
                    catalogo={catalogoLote}
                    etiqueta={etiquetaLote}
                    procesar={file => subirYClasificar(file, {
                      flujo: 'expediente',
                      capacidad: 'cliente.alta',
                      storageBasePath: `expedientes/${proveedor.id}`,
                      campos: { clienteNombre: proveedor.nombre, clienteRfc: proveedor.rfc ?? '' },
                    })}
                    unoPorTipo
                    puedeSubir={puedeEditar}
                    onGuardar={guardarLoteExpediente}
                    ayuda="Varios a la vez. El agente lee cada uno, propone el tipo y marca su casilla; tú confirmas antes de guardar."
                  />
                }
                docsAlta={proveedor.docsAlta ?? DOCS_ALTA_PROVEEDOR_DEFAULT}
                archivos={proveedor.archivosExpediente}
                nombreUsuario={user?.email ?? ''}
                puedeValidar={puedeEditar}
                puedeEditar={puedeEditar}
                storageBasePath={`expedientes/${proveedor.id}`}
                esExtranjero={esProveedorExtranjero(proveedor)}
                tipoEntidad="proveedor"
                onToggleDoc={async (campo, valor) => {
                  const da = { ...(proveedor.docsAlta ?? DOCS_ALTA_PROVEEDOR_DEFAULT), [campo]: valor };
                  await onUpdate(proveedor.id, { docsAlta: da });
                }}
                onValidar={async (datos) => {
                  await onUpdate(proveedor.id, { expedienteValidado: datos });
                }}
                onArchivoSubido={async (campo, archivo) => {
                  const prev = proveedor.archivosExpediente ?? {};
                  await onUpdate(proveedor.id, {
                    docsAlta: { ...(proveedor.docsAlta ?? DOCS_ALTA_PROVEEDOR_DEFAULT), [campo]: true },
                    archivosExpediente: { ...prev, [campo]: archivo },
                  });
                }}
              />
            )}

            {/* Tab: Notas Internas */}
            {fichaTab === 'notas' && (
              <>
                <h3 className="text-[15px] font-semibold text-text-primary mb-3">Notas Internas (Pricing / Operaciones)</h3>
                <div className="bg-warning-bg border border-warning-border rounded-lg p-4">
                  <p className="text-[13px] text-warning-text leading-relaxed">{proveedor.notas || 'Sin notas.'}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sidebar Resumen */}
        <div className="w-full md:w-[280px] bg-canvas shrink-0 p-[24px]">
          <h3 className="text-[14px] font-semibold text-text-primary mb-[20px]">Resumen Operativo</h3>
          <div className="space-y-4">
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Total Cotizado</p>
              <p className={`font-bold text-text-primary ${provResumen.cotizacionesTotal > 0 ? 'text-[15px]' : 'text-[20px]'}`}>
                {formatTotalesPorMoneda(provResumen.totalCotizado)}
              </p>
            </div>
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Cotizaciones Atendidas</p>
              <p className="text-[20px] font-bold text-text-primary">
                {provResumen.cotizacionesTotal > 0
                  ? `${provResumen.cotizacionesAtendidas} / ${provResumen.cotizacionesTotal}`
                  : '—'}
              </p>
            </div>
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Veces Elegido</p>
              <p className="text-[20px] font-bold text-text-primary">
                {provResumen.cotizacionesTotal > 0
                  ? provResumen.vecesSeleccionado
                  : '—'}
              </p>
            </div>
            <div className="bg-white border border-card-border p-4 rounded-lg shadow-sm">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-1">Cotizaciones Participadas</p>
              <p className="text-[20px] font-bold text-text-primary">
                {provResumen.cotizacionesUnicas > 0
                  ? provResumen.cotizacionesUnicas
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
