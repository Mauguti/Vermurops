import React, { useMemo, useState } from 'react';
import {
  X, AlertTriangle, Sparkles, Trash2, Check, CheckCheck, Coins, Ruler,
  Plus,
} from 'lucide-react';
import {
  validarRespuestaN8N, construirLineasEnRevision, motivosNoGuardable,
  esGuardable, resumenRevision, ordenarParaRevision, textoDeAviso, TEXTO_MOTIVO,
  resolverProveedor, estadoGuardable,
  confirmarLinea, confirmarTodas, pendientesDeConfirmar, tieneQueConfirmar,
  crearLineaManual,
  type LineaEnRevision, type NivelConfianza, type NivelMatch,
} from '../../lib/importacionTarifas';
import type { ConceptoMatch } from './tarifaMatching';
import type { PuertoMatch } from '../../lib/importacionTarifas';
import type { UnidadTarifa } from './TarifasData';
import ConceptoSelector from '../conceptos/ConceptoSelector';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import SelectorProveedor from '../proveedores/SelectorProveedor';
import type { ProveedorVermur } from '../proveedores/ProveedoresData';

/**
 * Revisión de las tarifas que extrajo la IA (TA-4).
 *
 * n8n EXTRAE Y PROPONE; la app DECIDE Y ESCRIBE. Nada se guarda sin pasar por
 * aquí: la IA se equivoca y una tarifa mal cargada se propaga a cotizaciones
 * reales y de ahí a facturas.
 *
 * Dos cosas exigen confirmación explícita y no solo ser editables: la MONEDA y
 * la UNIDAD. Un 1,200 que era MXN cargado como USD se ve perfectamente bien en
 * esta pantalla, y nadie lo atrapa hasta que llega la factura.
 *
 * Y confirmar es una ACCIÓN con su propio botón, no un efecto de cambiar el
 * valor (1a): el extractor casi siempre trae USD y CONTENEDOR bien, y elegir
 * el mismo valor en el selector no disparaba nada, así que el dato correcto no
 * se podía aprobar. Ver `confirmarLinea` en lib/importacionTarifas.
 */

const COLOR_CONFIANZA: Record<NivelConfianza, string> = {
  alta:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  media: 'bg-amber-50 text-amber-700 border-amber-200',
  baja:  'bg-red-50 text-red-700 border-red-200',
};

const UNIDADES: UnidadTarifa[] = [
  'CONTENEDOR', 'CBM', 'TON', 'WM', 'PEDIMENTO', 'VIAJE', 'BL', 'FIJO', 'DIA',
];

interface Props {
  respuestaCruda: unknown;
  nombreArchivo: string;
  conceptos: ConceptoVermur[];
  puertos: PuertoMatch[];
  proveedores: ProveedorVermur[];
  /**
   * Proveedor ya elegido en la pantalla de subida (entrada desde Tarifas).
   *
   * Sin esto, la revisión volvía a resolverlo desde cero contra el nombre que
   * trae el documento, y si no empataba con el catálogo el pie decía «Falta
   * elegir el proveedor del tarifario» con el botón en «GUARDAR 0 TARIFAS» —
   * aunque el usuario acabara de elegirlo dos pantallas antes. Es el segundo
   * candado del wizard, junto al de confirmar.
   */
  proveedorElegidoId?: string | null;
  onCancelar: () => void;
  /** El proveedor va como parámetro: es de todo el tarifario, no de cada línea. */
  onGuardar: (lineas: LineaEnRevision[], proveedorId: string) => void | Promise<void>;
}

export default function RevisionTarifasExtraidas({
  respuestaCruda, nombreArchivo, conceptos, puertos, proveedores,
  proveedorElegidoId, onCancelar, onGuardar,
}: Props) {
  const validacion = useMemo(() => validarRespuestaN8N(respuestaCruda), [respuestaCruda]);

  /**
   * Proveedor del tarifario. Se resuelve UNA VEZ para todo el documento: un
   * tarifario es la lista de precios de un proveedor.
   *
   * Es tan bloqueante como el concepto — sin `proveedorId` la tarifa entra al
   * catálogo y no hace match completo en la comparativa: existe y no se puede
   * usar bien. Mismo agujero, mismo tratamiento.
   */
  const sugerenciaProveedor = useMemo(
    () => resolverProveedor(
      validacion.datos?.proveedor,
      proveedores.map(p => ({ id: p.id, nombre: p.nombre })),
    ),
    [validacion.datos?.proveedor, proveedores],
  );

  /*
   * Lo que el usuario YA eligió manda sobre lo que el documento diga: es una
   * decisión tomada, no una sugerencia. Si no eligió nada, se cae a lo que se
   * resolvió del documento, que es lo de siempre.
   */
  const [proveedorId, setProveedorId] = useState<string | null>(
    proveedorElegidoId ?? sugerenciaProveedor.match?.id ?? null,
  );
  const [nivelProveedor, setNivelProveedor] = useState<NivelMatch>(
    proveedorElegidoId ? 'exacto' : sugerenciaProveedor.nivel,
  );

  const [lineas, setLineas] = useState<LineaEnRevision[]>(() =>
    validacion.datos
      ? construirLineasEnRevision(validacion.datos, {
          conceptos: conceptos as unknown as ConceptoMatch[], puertos,
        })
      : [],
  );
  const [guardando, setGuardando] = useState(false);

  const resumen = resumenRevision(lineas);
  const estado = estadoGuardable(proveedorId, nivelProveedor === 'exacto', lineas);
  const porConfirmar = pendientesDeConfirmar(lineas);

  /*
   * El orden se calcula UNA VEZ, al abrir: primero lo que necesita atención.
   *
   * Recalcularlo en cada cambio hacía que la línea saltara al final en cuanto
   * quedaba lista — justo en el clic con el que la acababas de arreglar. Con
   * cuarenta líneas eso es una tabla que se reacomoda sola mientras trabajas.
   */
  const [orden, setOrden] = useState<string[]>(() => ordenarParaRevision(lineas).map(l => l.lineaId));
  const ordenadas = useMemo(
    () => orden.map(id => lineas.find(l => l.lineaId === id)).filter(Boolean) as LineaEnRevision[],
    [orden, lineas],
  );

  const actualizar = (id: string, cambios: Partial<LineaEnRevision>) =>
    setLineas(prev => prev.map(l => (l.lineaId === id ? { ...l, ...cambios } : l)));

  const agregarLinea = () => {
    const nueva = crearLineaManual();
    setLineas(prev => [...prev, nueva]);
    setOrden(prev => [...prev, nueva.lineaId]);
  };

  // ── El extractor falló o la respuesta no pasó la frontera ──────────────
  if (!validacion.valida) {
    return (
      <Marco titulo="No se pudieron extraer tarifas" onCerrar={onCancelar}>
        <div className="px-5 py-6 space-y-3">
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-[1px]" />
            <p className="text-[12px] text-red-800">{validacion.motivo}</p>
          </div>
          {validacion.reparos.length > 0 && (
            <ul className="space-y-1">
              {validacion.reparos.map((r, i) => (
                <li key={i} className="text-[11px] text-gray-500">· {r}</li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-gray-400">
            El documento quedó guardado como evidencia aunque no se hayan extraído tarifas.
          </p>
        </div>
      </Marco>
    );
  }

  const d = validacion.datos!;

  return (
    <Marco titulo="Revisar tarifas extraídas" onCerrar={onCancelar} ancho>
      {/* Encabezado: proveedor, vigencia, confianza y observaciones */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 space-y-2 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12px] text-gray-500">{nombreArchivo}</span>
          {d.vigenciaTexto && (
            <span className="text-[11px] text-gray-500">Vigencia: {d.vigenciaTexto}</span>
          )}
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
            COLOR_CONFIANZA[d.confianza ?? 'baja']}`}>
            <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />
            Confianza {d.confianza}
          </span>
        </div>

        {/* El proveedor del tarifario: bloquea el guardado hasta resolverse. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold text-gray-400 uppercase w-[70px] shrink-0">Proveedor</span>
          <div className="min-w-[220px]">
            <SelectorProveedor
              compacto
              proveedores={proveedores}
              valorId={proveedorId}
              onSelect={(p) => { setProveedorId(p.id); setNivelProveedor('exacto'); }}
              onNombreLibre={() => { /* alta rápida se resuelve en el catálogo */ }}
              placeholder="Buscar proveedor…"
            />
          </div>
          {proveedorId && nivelProveedor === 'sugerido' && (
            <button
              onClick={() => setNivelProveedor('exacto')}
              className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded"
            >
              Confirmar «{proveedores.find(p => p.id === proveedorId)?.nombre}»
            </button>
          )}
          {!proveedorId && validacion.datos?.proveedor && (
            <span className="text-[10px] text-amber-700">
              El documento dice «{validacion.datos.proveedor}» y no está en el catálogo
            </span>
          )}
          {proveedorId && nivelProveedor === 'exacto' && (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-[12px] font-semibold text-gray-700">
            {resumen.total} línea{resumen.total !== 1 ? 's' : ''}
            {resumen.requierenRevision > 0 && (
              <span className="text-amber-700"> · {resumen.requierenRevision} requiere{resumen.requierenRevision !== 1 ? 'n' : ''} revisión</span>
            )}
            {resumen.descartadas > 0 && (
              <span className="text-gray-400"> · {resumen.descartadas} descartada{resumen.descartadas !== 1 ? 's' : ''}</span>
            )}
          </p>

          {/* Revisar cuarenta líneas una por una es lo que nadie hace. Con un
              clic sigue siendo una decisión de alguien, que es lo que la
              confirmación certifica. */}
          {porConfirmar > 0 && (
            <button
              onClick={() => setLineas(confirmarTodas)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2 py-1 rounded transition-colors"
            >
              <CheckCheck className="w-3 h-3" />
              Confirmar moneda y unidad de las {porConfirmar}
            </button>
          )}

          <button
            onClick={agregarLinea}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-primario bg-primario/5 border border-primario/20 hover:bg-primario/10 px-2 py-1 rounded transition-colors"
          >
            <Plus className="w-3 h-3" />
            Agregar línea
          </button>
        </div>

        {d.observaciones && (
          <p className="text-[11px] text-gray-500 italic">«{d.observaciones}»</p>
        )}

        {validacion.reparos.length > 0 && (
          <ul className="space-y-0.5">
            {validacion.reparos.map((r, i) => (
              <li key={i} className="text-[11px] text-amber-700">⚠ {r}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Las líneas */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {ordenadas.map(l => {
          const faltantes = motivosNoGuardable(l);
          const lista = esGuardable(l);
          return (
            <div
              key={l.lineaId}
              className={`px-5 py-3 ${
                l.descartada ? 'opacity-40 bg-gray-50'
                : faltantes.length > 0 ? 'bg-amber-50/40' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Concepto: SIEMPRE del catálogo. Sin conceptoId la tarifa
                      existiría y sería invisible para el panel. */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-gray-400 uppercase w-[70px] shrink-0">Concepto</span>
                    <div className="flex-1 min-w-0">
                      <ConceptoSelector
                        compacto
                        selectedNombre={l.conceptoNombre || null}
                        conceptos={conceptos}
                        onSelect={(conceptoId, nombre) => actualizar(l.lineaId, {
                          conceptoId, conceptoNombre: nombre, nivelConcepto: 'exacto',
                        })}
                      />
                    </div>
                    {l.nivelConcepto === 'sugerido' && l.conceptoId && (
                      <button
                        onClick={() => actualizar(l.lineaId, { nivelConcepto: 'exacto' })}
                        className="text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded shrink-0"
                      >
                        Confirmar sugerencia
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-bold text-gray-400 uppercase w-[70px] shrink-0">Monto</span>
                    <input
                      type="number"
                      value={l.monto || ''}
                      onChange={e => actualizar(l.lineaId, { monto: Number(e.target.value) })}
                      className="w-[110px] px-2 py-1 text-[12px] text-right tabular-nums border border-gray-200 rounded outline-none focus:border-primario"
                    />

                    {/* Confirmación explícita: un 1,200 que era MXN cargado
                        como USD se ve bien y nadie lo atrapa. */}
                    <Confirmable
                      icono={<Coins className="w-3 h-3" />}
                      confirmado={l.monedaConfirmada}
                    >
                      <select
                        value={l.moneda ?? ''}
                        onChange={e => actualizar(l.lineaId, {
                          moneda: (e.target.value || null) as LineaEnRevision['moneda'],
                          monedaConfirmada: e.target.value !== '',
                        })}
                        className="text-[11px] bg-transparent outline-none cursor-pointer"
                      >
                        <option value="">Moneda…</option>
                        <option value="USD">USD</option>
                        <option value="MXN">MXN</option>
                      </select>
                    </Confirmable>

                    <Confirmable
                      icono={<Ruler className="w-3 h-3" />}
                      confirmado={l.unidadConfirmada}
                    >
                      <select
                        value={l.unidad ?? ''}
                        onChange={e => actualizar(l.lineaId, {
                          unidad: (e.target.value || null) as LineaEnRevision['unidad'],
                          unidadConfirmada: e.target.value !== '',
                        })}
                        className="text-[11px] bg-transparent outline-none cursor-pointer"
                      >
                        <option value="">Unidad…</option>
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Confirmable>
                  </div>

                  {l.agregadaManual && (
                    <span className="inline-block text-[9px] font-bold text-primario bg-primario/10 px-1.5 py-0.5 rounded">
                      Agregada a mano
                    </span>
                  )}

                  {(l.extraida.avisos?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-amber-700">
                      {l.extraida.avisos!.map(textoDeAviso).join(' · ')}
                    </p>
                  )}

                  {faltantes.length > 0 && !l.descartada && (
                    <p className="text-[10px] text-amber-800 font-semibold">
                      {faltantes.map(m => TEXTO_MOTIVO[m]).join(' · ')}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  {lista && <Check className="w-4 h-4 text-emerald-600" />}
                  {/* Confirmar es una ACCIÓN: marca la línea aunque el valor
                      que trajo el extractor sea el correcto y no cambie. */}
                  {tieneQueConfirmar(l) && (
                    <button
                      onClick={() => actualizar(l.lineaId, confirmarLinea(l))}
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
                      title="Marcar la moneda y la unidad como revisadas"
                    >
                      Confirmar
                    </button>
                  )}
                  <button
                    onClick={() => actualizar(l.lineaId, { descartada: !l.descartada })}
                    className={`p-1 rounded transition-colors ${
                      l.descartada ? 'text-gray-400 hover:text-gray-600' : 'text-gray-300 hover:text-red-500'
                    }`}
                    title={l.descartada ? 'Recuperar' : 'Descartar esta línea'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-5 py-3 border-t border-gray-150 bg-gray-50/50 flex items-center justify-between shrink-0">
        <p className="text-[11px] text-gray-500">
          {estado.puedeGuardar
            ? `${resumen.guardables} de ${resumen.total} listas para guardar`
            : estado.faltantes[0]}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancelar}
            className="text-[11px] font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-3 py-2"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              if (!estado.puedeGuardar || !proveedorId) return;
              setGuardando(true);
              try { await onGuardar(lineas.filter(esGuardable), proveedorId); }
              finally { setGuardando(false); }
            }}
            disabled={!estado.puedeGuardar || guardando}
            className="bg-primario hover:bg-primario-hover text-white text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? 'Guardando…' : `Guardar ${resumen.guardables} tarifa${resumen.guardables !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Marco>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

function Marco({ titulo, onCerrar, ancho, children }: {
  titulo: string; onCerrar: () => void; ancho?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full flex flex-col max-h-[88vh] overflow-hidden ${
        ancho ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="px-5 py-4 border-b border-gray-150 flex items-center justify-between bg-gray-50/50 shrink-0">
          <h3 className="text-[14px] font-bold text-[#18181B]">{titulo}</h3>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Campo que exige confirmación explícita, no solo ser editable.
 *
 * El chip DICE si está confirmado; no confirma. Antes tenía un `onClick` que
 * lo hacía, y ése era el fondo del bug 1a: un clic real sobre un `<select>`
 * abre el menú del sistema y el navegador no entrega el `click` al elemento,
 * así que el único trozo confirmable eran los pocos píxeles del borde. Con un
 * clic sintético sí funcionaba — por eso ninguna prueba lo atrapó.
 *
 * Confirmar vive ahora en un botón que se ve. Cambiar el valor sigue
 * confirmando: elegir otra moneda ES haberla revisado.
 */
function Confirmable({ icono, confirmado, children }: {
  icono: React.ReactNode; confirmado: boolean; children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded border ${
        confirmado
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-300 bg-amber-50 text-amber-800'
      }`}
      title={confirmado ? 'Confirmado' : 'Sin confirmar: revísalo y confírmalo'}
    >
      {confirmado ? <Check className="w-3 h-3" /> : icono}
      {children}
    </span>
  );
}
