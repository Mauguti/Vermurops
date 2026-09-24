import React, { useMemo, useState } from 'react';
import { Search, AlertTriangle, X, Check } from 'lucide-react';
import type { ConceptoVermur, ReglaIVA, CategoriaConcepto } from './ConceptosData';
import {
  derivarTablaIVA, resumenCatalogo, pendientesDeConcepto, impactoConcepto, NOTA_REGLA,
} from '../../lib/vistaConceptos';
import { useConceptos } from '../../hooks/useConceptos';
import { useTarifas } from '../../hooks/useTarifas';
import { useCotizaciones } from '../../hooks/useCotizaciones';
import { useAuth } from '../../auth/AuthContext';
import { BadgeEstado } from '../ui/ficha/FichaLayout';
import EstadoVacio from '../ui/EstadoVacio';
import Toast, { TipoToast } from '../ui/Toast';

/**
 * B3 · El catálogo de conceptos, por fin con pantalla.
 *
 * Los 105 conceptos viven en Firestore desde el arranque y no había dónde
 * verlos ni editarlos. Aquí se consultan (todos los roles) y se editan (solo
 * Administración, capacidad concepto.editar).
 *
 * ── Lo más importante ──────────────────────────────────────────────────────
 * La tabla de IVA de cada concepto se GENERA con calcularIVA — la misma
 * función que usará la facturación— en las cuatro combinaciones de §4.2.
 * Lo que se ve aquí es exactamente lo que se va a aplicar.
 *
 * Los conceptos con regla en 'revisar' salen destacados: son los que
 * Administración tiene que resolver, incluidos los que nacen del alta rápida
 * en una cotización. Hasta entonces su IVA no se puede derivar.
 */

const CATEGORIAS: { id: CategoriaConcepto; label: string }[] = [
  { id: 'flete', label: 'Flete' },
  { id: 'maniobras', label: 'Maniobras' },
  { id: 'despacho', label: 'Despacho' },
  { id: 'almacenaje', label: 'Almacenaje' },
  { id: 'seguro', label: 'Seguro' },
  { id: 'demoras', label: 'Demoras' },
  { id: 'documentacion', label: 'Documentación' },
  { id: 'financiero', label: 'Financiero' },
  { id: 'transporte', label: 'Transporte' },
  { id: 'otros', label: 'Otros' },
];

const REGLAS: { id: ReglaIVA; label: string }[] = [
  { id: 'espejo', label: 'Espejo (tráfico × ubicación)' },
  { id: 'aereo_split', label: 'Aéreo dividido 25/75' },
  { id: 'terrestre_retencion', label: 'Terrestre con retención 4%' },
  { id: 'exento', label: 'Exento (siempre 0%)' },
  { id: 'fijo16', label: 'Fijo 16%' },
  { id: 'fijo0', label: 'Fijo 0%' },
  { id: 'revisar', label: '⚠ En revisión' },
];

const LABEL_REGLA: Record<ReglaIVA, string> =
  Object.fromEntries(REGLAS.map(r => [r.id, r.label])) as Record<ReglaIVA, string>;

export default function CatalogoConceptos() {
  const { conceptos, updateConcepto } = useConceptos();
  const { tarifas } = useTarifas();
  const { quotes } = useCotizaciones();
  const { puede } = useAuth();
  const puedeEditar = puede('concepto.editar');

  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<CategoriaConcepto | ''>('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [abierto, setAbierto] = useState<ConceptoVermur | null>(null);
  const [toast, setToast] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);

  const resumen = useMemo(() => resumenCatalogo(conceptos), [conceptos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return conceptos
      .filter(c => !categoria || c.categoria === categoria)
      .filter(c => !soloPendientes || pendientesDeConcepto(c).length > 0)
      .filter(c => !q
        || c.nombre.toLowerCase().includes(q)
        || c.nombreOriginal.toLowerCase().includes(q)
        || c.id.toLowerCase().includes(q)
        || (c.cuentaContable ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [conceptos, busqueda, categoria, soloPendientes]);

  return (
    <div className="space-y-4">
      {/* ── Contadores ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <Contador titulo="Conceptos" valor={resumen.total} detalle={`${resumen.activos} activos`} />
        <button onClick={() => setSoloPendientes(v => !v)} className="text-left">
          <Contador
            titulo="En revisión"
            valor={resumen.enRevisar}
            detalle="sin regla de IVA — clic para filtrar"
            alerta={resumen.enRevisar > 0}
            activo={soloPendientes}
          />
        </button>
        <Contador
          titulo="Sin claves SAT"
          valor={resumen.sinClavesSAT}
          detalle="bloquearán el timbrado"
          alerta={resumen.sinClavesSAT > 0}
        />
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-[380px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, id o cuenta contable…"
            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario"
          />
        </div>
        <select
          value={categoria}
          onChange={e => setCategoria(e.target.value as CategoriaConcepto | '')}
          className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => {
            const n = resumen.porCategoria.find(x => x.categoria === c.id)?.cuantos ?? 0;
            return <option key={c.id} value={c.id}>{c.label} ({n})</option>;
          })}
        </select>
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50/70 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="px-4 py-2.5">Concepto</th>
                <th className="px-4 py-2.5">Categoría</th>
                <th className="px-4 py-2.5">Regla de IVA</th>
                <th className="px-4 py-2.5">Claves SAT</th>
                <th className="px-4 py-2.5">Cuenta</th>
                <th className="px-4 py-2.5">Moneda</th>
                <th className="px-4 py-2.5">Aplica</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibles.map(c => {
                const pendientes = pendientesDeConcepto(c);
                return (
                  <tr
                    key={c.id}
                    onClick={() => setAbierto(c)}
                    className={`cursor-pointer transition-colors ${
                      pendientes.includes('regla_iva')
                        ? 'bg-amber-50/60 hover:bg-amber-50'
                        : 'hover:bg-gray-50/60'}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-gray-800">{c.nombre}</span>
                      <span className="block text-[10px] text-gray-400 font-mono">{c.id}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 capitalize">{c.categoria}</td>
                    <td className="px-4 py-2.5">
                      {c.reglaIVA === 'revisar' ? (
                        <BadgeEstado tono="espera" title={NOTA_REGLA.revisar}>Por resolver</BadgeEstado>
                      ) : (
                        <span className="text-gray-600">{LABEL_REGLA[c.reglaIVA]}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {pendientes.includes('claves_sat') ? (
                        <BadgeEstado tono="peligro" title="Sin claveProductoSAT o claveUnidadSAT: no se podrá timbrar una factura con este concepto.">
                          Faltan
                        </BadgeEstado>
                      ) : (
                        <span className="font-mono text-[11px] text-gray-500">
                          {c.claveProductoSAT} · {c.claveUnidadSAT}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{c.cuentaContable || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-500">{c.monedaDefault}</td>
                    <td className="px-4 py-2.5 text-[10px] text-gray-500">
                      {[c.aplicaImpo && 'Impo', c.aplicaExpo && 'Expo'].filter(Boolean).join(' · ')}
                      <span className="block">
                        {[c.aplicaOrigen && 'Origen', c.aplicaDestino && 'Destino'].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <BadgeEstado tono={c.activo !== false ? 'exito' : 'neutro'}>
                        {c.activo !== false ? 'Activo' : 'Inactivo'}
                      </BadgeEstado>
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EstadoVacio
                      variante="plano"
                      titulo={conceptos.length === 0
                        ? 'El catálogo todavía no carga'
                        : 'Ningún concepto coincide con el filtro'}
                      detalle={conceptos.length === 0
                        ? 'Los conceptos se siembran solos la primera vez.'
                        : 'Prueba con otro nombre u otra categoría.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <DetalleConcepto
          concepto={abierto}
          puedeEditar={puedeEditar}
          tarifas={tarifas}
          quotes={quotes}
          onCerrar={() => setAbierto(null)}
          onGuardar={(cambios) => {
            updateConcepto(abierto.id, { ...cambios, updatedAt: new Date().toISOString() })
              .then(() => {
                setAbierto(null);
                setToast({ mensaje: `${abierto.nombre} actualizado.`, tipo: 'exito' });
              })
              .catch(err => setToast({
                mensaje: `No se pudo guardar: ${err instanceof Error ? err.message : err}`,
                tipo: 'error',
              }));
          }}
        />
      )}

      <Toast mensaje={toast?.mensaje ?? null} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}

// ─── Contador ─────────────────────────────────────────────────────────────────

function Contador({ titulo, valor, detalle, alerta = false, activo = false }: {
  titulo: string; valor: number; detalle: string; alerta?: boolean; activo?: boolean;
}) {
  return (
    <div className={`px-4 py-2.5 rounded-xl border shadow-sm min-w-[150px] ${
      activo ? 'bg-amber-100 border-amber-300'
      : alerta ? 'bg-amber-50 border-amber-200'
      : 'bg-white border-gray-200'}`}>
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{titulo}</p>
      <p className={`text-lg font-black tabular-nums ${alerta ? 'text-amber-700' : 'text-[#18181B]'}`}>
        {valor}
      </p>
      <p className="text-[9px] text-gray-400">{detalle}</p>
    </div>
  );
}

// ─── Detalle / edición ────────────────────────────────────────────────────────

function DetalleConcepto({
  concepto, puedeEditar, tarifas, quotes, onCerrar, onGuardar,
}: {
  concepto: ConceptoVermur;
  puedeEditar: boolean;
  tarifas: { conceptoId: string }[];
  quotes: Parameters<typeof impactoConcepto>[2];
  onCerrar: () => void;
  onGuardar: (cambios: Partial<ConceptoVermur>) => void;
}) {
  const [regla, setRegla] = useState<ReglaIVA>(concepto.reglaIVA);
  const [claveProducto, setClaveProducto] = useState(concepto.claveProductoSAT ?? '');
  const [claveUnidad, setClaveUnidad] = useState(concepto.claveUnidadSAT ?? '');
  const [cuenta, setCuenta] = useState(concepto.cuentaContable ?? '');
  const [activo, setActivo] = useState(concepto.activo !== false);

  const reglaCambio = regla !== concepto.reglaIVA;
  const tabla = useMemo(() => derivarTablaIVA(regla), [regla]);

  /*
   * El impacto se calcula SOLO cuando la regla cambió, y se enseña antes de
   * guardar: el IVA de un concepto no es un dato del concepto, es un dato de
   * cada factura que se emita con él.
   */
  const impacto = useMemo(
    () => (reglaCambio ? impactoConcepto(concepto.id, tarifas, quotes) : null),
    [reglaCambio, concepto.id, tarifas, quotes],
  );

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onCerrar} />

      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-2xl p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-gray-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#18181B]">{concepto.nombre}</h3>
            <p className="text-[10px] text-gray-400 font-mono">
              {concepto.id} · {concepto.idSemantico}
              {concepto.nombreOriginal !== concepto.nombre && ` · Magaya: «${concepto.nombreOriginal}»`}
            </p>
          </div>
          <button onClick={onCerrar} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* ── La regla y su tabla derivada ─────────────────────────────── */}
          <div>
            <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Regla de IVA
            </label>
            <select
              value={regla}
              onChange={e => setRegla(e.target.value as ReglaIVA)}
              disabled={!puedeEditar}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario disabled:text-gray-500"
            >
              {REGLAS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">{NOTA_REGLA[regla]}</p>
          </div>

          {/* Generada con calcularIVA: lo que se ve es lo que se factura. */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50/70 text-left text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                  <th className="px-3 py-2">Combinación</th>
                  <th className="px-3 py-2">IVA que produce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tabla.map(r => (
                  <tr key={r.combinacion}>
                    <td className="px-3 py-1.5 text-gray-600">{r.combinacion}</td>
                    <td className={`px-3 py-1.5 font-semibold tabular-nums ${
                      r.tasa === null ? 'text-amber-600' : 'text-gray-800'}`}>
                      {r.tasaTexto}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── El impacto, ANTES de guardar ─────────────────────────────── */}
          {impacto && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[12px] text-amber-900">
                <p className="font-bold">Cambiar la regla afecta lo que ya existe:</p>
                <p className="mt-0.5">
                  {impacto.tarifas} tarifa{impacto.tarifas !== 1 ? 's' : ''} vigente{impacto.tarifas !== 1 ? 's' : ''} y{' '}
                  {impacto.cotizaciones} cotización{impacto.cotizaciones !== 1 ? 'es' : ''} usan este concepto
                  {impacto.cotizacionesVivas > 0 && (
                    <> — <strong>{impacto.cotizacionesVivas} en etapa viva del pipeline</strong></>
                  )}.
                  Las facturas nuevas usarán la regla nueva; lo ya facturado no cambia.
                </p>
              </div>
            </div>
          )}

          {/* ── Claves SAT y cuenta ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Clave producto SAT" ayuda="Obligatoria para timbrar (CFDI 4.0).">
              <input value={claveProducto} onChange={e => setClaveProducto(e.target.value)}
                readOnly={!puedeEditar} placeholder="78101800"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] font-mono outline-none focus:border-primario read-only:text-gray-500" />
            </Campo>
            <Campo rotulo="Clave unidad SAT" ayuda="E48 = unidad de servicio, la más común.">
              <input value={claveUnidad} onChange={e => setClaveUnidad(e.target.value)}
                readOnly={!puedeEditar} placeholder="E48"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] font-mono outline-none focus:border-primario read-only:text-gray-500" />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Cuenta contable" ayuda="Para la póliza del contador.">
              <input value={cuenta} onChange={e => setCuenta(e.target.value)}
                readOnly={!puedeEditar}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] font-mono outline-none focus:border-primario read-only:text-gray-500" />
            </Campo>
            <Campo rotulo="Estado" ayuda="Baja lógica: nunca se borra.">
              <label className={`flex items-center gap-2 py-2 ${puedeEditar ? 'cursor-pointer' : ''}`}>
                <input type="checkbox" checked={activo} disabled={!puedeEditar}
                  onChange={e => setActivo(e.target.checked)} className="accent-primario" />
                <span className="text-[12px] text-gray-600">{activo ? 'Activo' : 'Inactivo'}</span>
              </label>
            </Campo>
          </div>

          {/* ── Dimensiones (solo lectura: cambiarlas es rediseñar el concepto) ─ */}
          <div className="text-[11px] text-gray-500 border-t border-gray-100 pt-3">
            Aplica: {[
              concepto.aplicaImpo && 'importación', concepto.aplicaExpo && 'exportación',
              concepto.aplicaOrigen && 'origen', concepto.aplicaDestino && 'destino',
            ].filter(Boolean).join(' · ') || '—'}
            {' · '}
            {concepto.tieneVenta && 'venta'}{concepto.tieneVenta && concepto.tieneCosto && ' y '}
            {concepto.tieneCosto && 'costo'}
            {concepto.codigosMagaya.length > 0 && (
              <span className="block mt-0.5 font-mono text-[10px]">
                Magaya: {concepto.codigosMagaya.join(', ')}
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCerrar} className="px-4 py-2 text-[12px] font-semibold text-gray-500 hover:text-gray-700">
            {puedeEditar ? 'Cancelar' : 'Cerrar'}
          </button>
          {puedeEditar && (
            <button
              onClick={() => onGuardar({
                reglaIVA: regla,
                claveProductoSAT: claveProducto.trim() || null,
                claveUnidadSAT: claveUnidad.trim() || null,
                cuentaContable: cuenta.trim(),
                activo,
              })}
              className="px-4 py-2 bg-primario hover:bg-primario-hover text-white text-[12px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Guardar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, ayuda, children }: { rotulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{rotulo}</label>
      {children}
      <p className="text-[9px] text-gray-400 mt-0.5">{ayuda}</p>
    </div>
  );
}
