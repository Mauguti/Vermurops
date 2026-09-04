/**
 * FormCargaServicio.tsx (S-2 — rediseño de la solicitud)
 *
 * UNA tarjeta de modalidad dentro del formulario de solicitud. Los campos
 * cambian según qué se mueve: los que no aplican NO se muestran — ni
 * deshabilitados ni en gris, simplemente no existen para esa modalidad.
 *
 * Ventas SEÑALA aquí (requerimientos, carga, mercancías); Pricing DECIDE
 * después en la ficha. Los puertos salen del catálogo SOLO en marítimo;
 * aéreo y terrestre son texto libre (bodegas, plantas, aeropuertos sin
 * catálogo). El tráfico se declara solo cuando ambos puertos son de catálogo.
 */

import React, { useState } from 'react';
import { X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  CargaSolicitada, CargaFCL, MercanciaDetalle, ConceptoRequerido, TipoContenedor,
} from './QuotesData';
import type { PuertoVermur } from '../puertos/PuertosData';
import type { ConceptoVermur } from '../conceptos/ConceptosData';
import PuertoSelector from '../puertos/PuertoSelector';
import ConceptoSelector from '../conceptos/ConceptoSelector';
import {
  ModalidadSolicitud, ETIQUETA_MODALIDAD, ETIQUETA_CONTENEDOR,
  ETIQUETA_UNIDAD_TERRESTRE, modalidadDeCarga,
} from '../../lib/cargaSolicitud';
import { idUnico } from '../../lib/idUnico';

// ─── El borrador de un servicio en el formulario ─────────────────────────────

export interface DraftServicio {
  id: string;
  carga: CargaSolicitada;
  /** Ruta: puertos de catálogo en marítimo, texto libre en aéreo/terrestre. */
  origen: string;
  destino: string;
  origenPuertoId: string | null;
  destinoPuertoId: string | null;
  incoterm: string;
  mercancia: string;
  conceptosRequeridos: ConceptoRequerido[];
}

/** Carga inicial por modalidad. FCL es el arranque de marítimo (paso 2 cambia). */
export function cargaInicial(modalidad: ModalidadSolicitud): CargaSolicitada {
  switch (modalidad) {
    case 'maritimo':
      return {
        tipo: 'fcl', contenedores: [{ tipoContenedor: '40', cantidad: 1 }],
        pesoBrutoKg: 0, peligrosa: { esPeligrosa: false }, refrigeracion: { requiere: false },
      };
    case 'aereo':
      return { tipo: 'aereo', pesoBrutoKg: 0, pesoVolumetricoKg: 0, piezas: 0, bultos: [], peligrosa: { esPeligrosa: false } };
    case 'terrestre':
      return { tipo: 'terrestre', tipoUnidad: 'caja_seca_53', pesoBrutoKg: 0, piezas: 0, requiereManiobras: false };
    case 'despacho_aduanal':
      return {
        tipo: 'despacho', aduana: '', operacion: 'importacion', fraccionesArancelarias: [''],
        valorMercancia: { monto: 0, moneda: 'USD' }, requierePrevio: false, requiereNOM: false,
      };
  }
}

export function nuevoDraft(modalidad: ModalidadSolicitud): DraftServicio {
  return {
    id: idUnico('draft'),
    carga: cargaInicial(modalidad),
    origen: '', destino: '', origenPuertoId: null, destinoPuertoId: null,
    incoterm: 'FOB', mercancia: '', conceptosRequeridos: [],
  };
}

// ─── Estilos compartidos ─────────────────────────────────────────────────────

const LBL = 'block text-[9px] font-bold text-gray-400 uppercase mb-1.5';
const INP = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-[#E11D48]';
const SEL = INP + ' bg-white cursor-pointer';

function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><label className={LBL}>{label}</label>{children}</div>;
}

function Num({ valor, onCambio, placeholder }: { valor: number; onCambio: (n: number) => void; placeholder?: string }) {
  return (
    <input
      type="number" min={0} placeholder={placeholder}
      value={valor || ''} onChange={e => onCambio(Number(e.target.value) || 0)}
      className={INP}
    />
  );
}

function SiNo({ valor, onCambio, etiqueta }: { valor: boolean; onCambio: (v: boolean) => void; etiqueta: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button" onClick={() => onCambio(!valor)}
        className={`w-8 h-4.5 rounded-full transition-colors relative shrink-0 ${valor ? 'bg-[#E11D48]' : 'bg-gray-200'}`}
        style={{ height: 18 }}
      >
        <span className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${valor ? 'left-[18px]' : 'left-[2px]'}`} />
      </button>
      <span className="text-[11px] font-semibold text-gray-600">{etiqueta}</span>
    </label>
  );
}

// ─── Sub-bloques reutilizados entre modalidades ──────────────────────────────

function BloquePeligrosa({ carga, onCambio }: {
  carga: Extract<CargaSolicitada, { peligrosa: object }>;
  onCambio: (c: CargaSolicitada) => void;
}) {
  const p = carga.peligrosa;
  return (
    <div className="space-y-2">
      <SiNo
        valor={p.esPeligrosa} etiqueta="Mercancía peligrosa"
        onCambio={v => onCambio({ ...carga, peligrosa: v ? { ...p, esPeligrosa: true } : { esPeligrosa: false } })}
      />
      {p.esPeligrosa && (
        <div className="grid grid-cols-2 gap-3 pl-10">
          <Campo label="Clase IMO">
            <input type="text" placeholder="Ej. 3" value={p.claseIMO ?? ''} className={INP}
              onChange={e => onCambio({ ...carga, peligrosa: { ...p, claseIMO: e.target.value } })} />
          </Campo>
          <Campo label="UN Number">
            <input type="text" placeholder="Ej. UN1263" value={p.numeroUN ?? ''} className={INP}
              onChange={e => onCambio({ ...carga, peligrosa: { ...p, numeroUN: e.target.value } })} />
          </Campo>
        </div>
      )}
    </div>
  );
}

function BloqueBultos({ carga, onCambio }: {
  carga: Extract<CargaSolicitada, { bultos: object[] }>;
  onCambio: (c: CargaSolicitada) => void;
}) {
  const set = (i: number, k: 'largoCm' | 'anchoCm' | 'altoCm', v: number) =>
    onCambio({ ...carga, bultos: carga.bultos.map((b, j) => j === i ? { ...b, [k]: v } : b) });
  return (
    <div>
      <label className={LBL}>Dimensiones de los bultos (cm)</label>
      <div className="space-y-1.5">
        {carga.bultos.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input type="number" min={0} placeholder="Largo" value={b.largoCm || ''} className={INP + ' w-20'}
              onChange={e => set(i, 'largoCm', Number(e.target.value) || 0)} />
            <span className="text-gray-300 text-xs">×</span>
            <input type="number" min={0} placeholder="Ancho" value={b.anchoCm || ''} className={INP + ' w-20'}
              onChange={e => set(i, 'anchoCm', Number(e.target.value) || 0)} />
            <span className="text-gray-300 text-xs">×</span>
            <input type="number" min={0} placeholder="Alto" value={b.altoCm || ''} className={INP + ' w-20'}
              onChange={e => set(i, 'altoCm', Number(e.target.value) || 0)} />
            <button type="button" className="text-gray-300 hover:text-red-500 p-1"
              onClick={() => onCambio({ ...carga, bultos: carga.bultos.filter((_, j) => j !== i) })}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button type="button"
        className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#E11D48] hover:text-[#BE123C]"
        onClick={() => onCambio({ ...carga, bultos: [...carga.bultos, { largoCm: 0, anchoCm: 0, altoCm: 0 }] })}>
        <Plus className="w-3 h-3" /> Agregar bulto
      </button>
    </div>
  );
}

/**
 * Detalle de la mercancía (opcional, colapsado): el packing list de 5
 * productos se captura aquí UNA vez y se hereda al embarque.
 */
function BloqueMercancias({ mercancias, onCambio }: {
  mercancias: MercanciaDetalle[];
  onCambio: (m: MercanciaDetalle[]) => void;
}) {
  const [abierto, setAbierto] = useState(mercancias.length > 0);
  const set = (i: number, patch: Partial<MercanciaDetalle>) =>
    onCambio(mercancias.map((m, j) => j === i ? { ...m, ...patch } : m));
  return (
    <div className="border-t border-gray-100 pt-3">
      <button type="button" onClick={() => setAbierto(!abierto)}
        className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider hover:text-gray-700">
        {abierto ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Detalle de mercancía {mercancias.length > 0 && `(${mercancias.length})`}
        <span className="font-normal normal-case text-gray-400 ml-1">— opcional, se hereda al embarque</span>
      </button>
      {abierto && (
        <div className="mt-2 space-y-1.5">
          {mercancias.map((m, i) => (
            <div key={m.id} className="grid grid-cols-[1fr_90px_70px_80px_90px_70px_auto] gap-1.5 items-center">
              <input type="text" placeholder="Descripción del producto" value={m.descripcion} className={INP}
                onChange={e => set(i, { descripcion: e.target.value })} />
              <input type="text" placeholder="Fracción" value={m.fraccionArancelaria ?? ''} className={INP}
                onChange={e => set(i, { fraccionArancelaria: e.target.value })} />
              <input type="number" min={0} placeholder="Pzas" value={m.piezas || ''} className={INP}
                onChange={e => set(i, { piezas: Number(e.target.value) || undefined })} />
              <input type="number" min={0} placeholder="Peso kg" value={m.pesoKg || ''} className={INP}
                onChange={e => set(i, { pesoKg: Number(e.target.value) || undefined })} />
              <input type="number" min={0} placeholder="Valor unit." value={m.valorUnitario || ''} className={INP}
                onChange={e => set(i, { valorUnitario: Number(e.target.value) || undefined })} />
              <select value={m.moneda ?? 'USD'} className={SEL}
                onChange={e => set(i, { moneda: e.target.value as 'MXN' | 'USD' })}>
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
              </select>
              <button type="button" className="text-gray-300 hover:text-red-500 p-1"
                onClick={() => onCambio(mercancias.filter((_, j) => j !== i))}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button type="button"
            className="flex items-center gap-1 text-[10px] font-bold text-[#E11D48] hover:text-[#BE123C]"
            onClick={() => onCambio([...mercancias, { id: idUnico('mrc'), descripcion: '' }])}>
            <Plus className="w-3 h-3" /> Agregar producto
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Requerimientos: Ventas señala del catálogo REAL de conceptos qué necesita
 * el cliente. Sin precios ni proveedores — eso lo decide Pricing en la ficha,
 * donde estas líneas aparecen precargadas.
 */
function BloqueRequeridos({ requeridos, conceptos, onCambio }: {
  requeridos: ConceptoRequerido[];
  conceptos: ConceptoVermur[];
  onCambio: (r: ConceptoRequerido[]) => void;
}) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <label className={LBL}>Servicios requeridos — del catálogo</label>
      <div className="flex flex-wrap items-center gap-1.5">
        {requeridos.map(r => (
          <span key={r.conceptoId}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-700 bg-gray-100 border border-gray-200 rounded-full pl-2.5 pr-1 py-1">
            {r.nombre}
            <button type="button" className="text-gray-400 hover:text-red-500 p-0.5"
              onClick={() => onCambio(requeridos.filter(x => x.conceptoId !== r.conceptoId))}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <ConceptoSelector
          selectedNombre={null}
          conceptos={conceptos}
          onSelect={(conceptoId, nombre) => {
            if (!requeridos.some(r => r.conceptoId === conceptoId)) {
              onCambio([...requeridos, { conceptoId, nombre }]);
            }
          }}
        />
      </div>
      <p className="text-[9px] text-gray-400 mt-1.5">
        Señala qué se necesita; Pricing decide conceptos y precios en la ficha.
      </p>
    </div>
  );
}

// ─── La tarjeta ──────────────────────────────────────────────────────────────

interface Props {
  draft: DraftServicio;
  puertos: PuertoVermur[];
  conceptos: ConceptoVermur[];
  incoterms: string[];
  onCambio: (d: DraftServicio) => void;
  onQuitar: () => void;
  /** El tráfico derivado del catálogo se declara arriba (nivel solicitud). */
  onTraficoDerivado: (t: 'importacion' | 'exportacion') => void;
}

export default function FormCargaServicio({
  draft, puertos, conceptos, incoterms, onCambio, onQuitar, onTraficoDerivado,
}: Props) {
  const { carga } = draft;
  const modalidad = modalidadDeCarga(carga);
  const esMaritimo = modalidad === 'maritimo';
  const setCarga = (c: CargaSolicitada) => onCambio({ ...draft, carga: c });

  const handlePuerto = (extremo: 'origen' | 'destino') => (texto: string, puertoId: string | null) => {
    const next = extremo === 'origen'
      ? { ...draft, origen: texto, origenPuertoId: puertoId }
      : { ...draft, destino: texto, destinoPuertoId: puertoId };
    onCambio(next);
    const o = puertos.find(p => p.id === next.origenPuertoId);
    const d = puertos.find(p => p.id === next.destinoPuertoId);
    if (o && d) {
      const oMx = (o.codigoPais ?? '').toUpperCase() === 'MEX';
      const dMx = (d.codigoPais ?? '').toUpperCase() === 'MEX';
      if (dMx && !oMx) onTraficoDerivado('importacion');
      else if (oMx && !dMx) onTraficoDerivado('exportacion');
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-white">
      {/* Encabezado de la tarjeta */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold text-[#E11D48] uppercase tracking-widest">
            {ETIQUETA_MODALIDAD[modalidad]}
          </span>
          {/* PASO 2 — solo marítimo: FCL o LCL */}
          {esMaritimo && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['fcl', 'lcl'] as const).map(t => (
                <button key={t} type="button"
                  onClick={() => {
                    if (carga.tipo === t) return;
                    // Lo compartido sobrevive al cambio FCL↔LCL
                    const pesoPrevio = 'pesoBrutoKg' in carga ? carga.pesoBrutoKg : 0;
                    const base: CargaSolicitada = t === 'fcl'
                      ? { ...(cargaInicial('maritimo') as CargaFCL), pesoBrutoKg: pesoPrevio, mercancias: carga.mercancias }
                      : { tipo: 'lcl', pesoBrutoKg: pesoPrevio, volumenM3: 0, piezas: 0, bultos: [], estibable: true, peligrosa: { esPeligrosa: false }, mercancias: carga.mercancias };
                    setCarga(base);
                  }}
                  className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${
                    carga.tipo === t ? 'bg-[#E11D48] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}>
                  {t === 'fcl' ? 'FCL · Contenedor' : 'LCL · Consolidada'}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onQuitar} className="text-gray-300 hover:text-red-500 p-1" title="Quitar modalidad">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Ruta ── */}
      {esMaritimo && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Campo label="Puerto de origen (POL)">
            <PuertoSelector puertos={puertos} valor={draft.origen} puertoId={draft.origenPuertoId}
              onChange={handlePuerto('origen')} placeholder="Elegir del catálogo…" />
          </Campo>
          <Campo label="Puerto de destino (POD)">
            <PuertoSelector puertos={puertos} valor={draft.destino} puertoId={draft.destinoPuertoId}
              onChange={handlePuerto('destino')} placeholder="Elegir del catálogo…" />
          </Campo>
        </div>
      )}
      {modalidad === 'aereo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Campo label="Aeropuerto de origen">
            <input type="text" placeholder="Ej. PVG Shanghai" value={draft.origen} className={INP}
              onChange={e => onCambio({ ...draft, origen: e.target.value, origenPuertoId: null })} />
          </Campo>
          <Campo label="Aeropuerto de destino">
            <input type="text" placeholder="Ej. MEX CDMX" value={draft.destino} className={INP}
              onChange={e => onCambio({ ...draft, destino: e.target.value, destinoPuertoId: null })} />
          </Campo>
        </div>
      )}
      {modalidad === 'terrestre' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Campo label="Origen (bodega, planta, ciudad)">
            <input type="text" placeholder="Ej. Planta Toluca" value={draft.origen} className={INP}
              onChange={e => onCambio({ ...draft, origen: e.target.value, origenPuertoId: null })} />
          </Campo>
          <Campo label="Destino">
            <input type="text" placeholder="Ej. CEDIS Monterrey" value={draft.destino} className={INP}
              onChange={e => onCambio({ ...draft, destino: e.target.value, destinoPuertoId: null })} />
          </Campo>
        </div>
      )}

      {/* ── Campos por tipo de carga ── */}
      {carga.tipo === 'fcl' && (
        <>
          <div>
            <label className={LBL}>Contenedores — tipo y cantidad</label>
            <div className="space-y-1.5">
              {carga.contenedores.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={c.tipoContenedor} className={SEL + ' w-36'}
                    onChange={e => setCarga({
                      ...carga,
                      contenedores: carga.contenedores.map((x, j) =>
                        j === i ? { ...x, tipoContenedor: e.target.value as TipoContenedor } : x),
                    })}>
                    {(Object.keys(ETIQUETA_CONTENEDOR) as TipoContenedor[]).map(t => (
                      <option key={t} value={t}>{ETIQUETA_CONTENEDOR[t]}</option>
                    ))}
                  </select>
                  <input type="number" min={1} value={c.cantidad || ''} placeholder="Cant." className={INP + ' w-20'}
                    onChange={e => setCarga({
                      ...carga,
                      contenedores: carga.contenedores.map((x, j) =>
                        j === i ? { ...x, cantidad: Number(e.target.value) || 0 } : x),
                    })} />
                  {carga.contenedores.length > 1 && (
                    <button type="button" className="text-gray-300 hover:text-red-500 p-1"
                      onClick={() => setCarga({ ...carga, contenedores: carga.contenedores.filter((_, j) => j !== i) })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button"
              className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#E11D48] hover:text-[#BE123C]"
              onClick={() => setCarga({ ...carga, contenedores: [...carga.contenedores, { tipoContenedor: '20', cantidad: 1 }] })}>
              <Plus className="w-3 h-3" /> Otro tipo de contenedor
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Campo label="Peso bruto total (kg)">
              <Num valor={carga.pesoBrutoKg} onCambio={v => setCarga({ ...carga, pesoBrutoKg: v })} placeholder="18500" />
            </Campo>
            <Campo label="Incoterm">
              <select value={draft.incoterm} className={SEL} onChange={e => onCambio({ ...draft, incoterm: e.target.value })}>
                {incoterms.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Campo>
          </div>
          <div className="space-y-2">
            <SiNo valor={carga.refrigeracion.requiere} etiqueta="Requiere refrigeración"
              onCambio={v => setCarga({ ...carga, refrigeracion: v ? { ...carga.refrigeracion, requiere: true } : { requiere: false } })} />
            {carga.refrigeracion.requiere && (
              <div className="pl-10 w-40">
                <Campo label="Temperatura (°C)">
                  <input type="number" placeholder="-18" className={INP}
                    value={carga.refrigeracion.temperaturaC ?? ''}
                    onChange={e => setCarga({
                      ...carga,
                      refrigeracion: { requiere: true, temperaturaC: e.target.value === '' ? undefined : Number(e.target.value) },
                    })} />
                </Campo>
              </div>
            )}
          </div>
          <BloquePeligrosa carga={carga} onCambio={setCarga} />
        </>
      )}

      {carga.tipo === 'lcl' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Campo label="Peso bruto (kg)">
              <Num valor={carga.pesoBrutoKg} onCambio={v => setCarga({ ...carga, pesoBrutoKg: v })} placeholder="2400" />
            </Campo>
            <Campo label="Volumen (m³)">
              <Num valor={carga.volumenM3} onCambio={v => setCarga({ ...carga, volumenM3: v })} placeholder="8.5" />
            </Campo>
            <Campo label="Piezas o bultos">
              <Num valor={carga.piezas} onCambio={v => setCarga({ ...carga, piezas: v })} placeholder="12" />
            </Campo>
            <Campo label="Incoterm">
              <select value={draft.incoterm} className={SEL} onChange={e => onCambio({ ...draft, incoterm: e.target.value })}>
                {incoterms.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Campo>
          </div>
          <SiNo valor={carga.estibable} etiqueta="¿Es estibable?"
            onCambio={v => setCarga({ ...carga, estibable: v })} />
          <BloqueBultos carga={carga} onCambio={setCarga} />
          <BloquePeligrosa carga={carga} onCambio={setCarga} />
        </>
      )}

      {carga.tipo === 'aereo' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Campo label="Peso bruto (kg)">
              <Num valor={carga.pesoBrutoKg} onCambio={v => setCarga({ ...carga, pesoBrutoKg: v })} placeholder="350" />
            </Campo>
            <Campo label="Peso volumétrico (kg)">
              <Num valor={carga.pesoVolumetricoKg} onCambio={v => setCarga({ ...carga, pesoVolumetricoKg: v })} placeholder="480" />
            </Campo>
            <Campo label="Piezas">
              <Num valor={carga.piezas} onCambio={v => setCarga({ ...carga, piezas: v })} placeholder="4" />
            </Campo>
            <Campo label="Incoterm">
              <select value={draft.incoterm} className={SEL} onChange={e => onCambio({ ...draft, incoterm: e.target.value })}>
                {incoterms.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </Campo>
          </div>
          <BloqueBultos carga={carga} onCambio={setCarga} />
          <BloquePeligrosa carga={carga} onCambio={setCarga} />
        </>
      )}

      {carga.tipo === 'terrestre' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Campo label="Tipo de unidad">
              <select value={carga.tipoUnidad} className={SEL}
                onChange={e => setCarga({ ...carga, tipoUnidad: e.target.value as typeof carga.tipoUnidad })}>
                {(Object.entries(ETIQUETA_UNIDAD_TERRESTRE)).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Peso (kg)">
              <Num valor={carga.pesoBrutoKg} onCambio={v => setCarga({ ...carga, pesoBrutoKg: v })} placeholder="21000" />
            </Campo>
            <Campo label="Piezas">
              <Num valor={carga.piezas} onCambio={v => setCarga({ ...carga, piezas: v })} placeholder="26" />
            </Campo>
          </div>
          <SiNo valor={carga.requiereManiobras} etiqueta="¿Requiere maniobras de carga o descarga?"
            onCambio={v => setCarga({ ...carga, requiereManiobras: v })} />
        </>
      )}

      {carga.tipo === 'despacho' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Campo label="Aduana">
              <input type="text" placeholder="Ej. Manzanillo" value={carga.aduana} className={INP}
                onChange={e => setCarga({ ...carga, aduana: e.target.value })} />
            </Campo>
            <Campo label="Tipo de operación">
              <select value={carga.operacion} className={SEL}
                onChange={e => setCarga({ ...carga, operacion: e.target.value as 'importacion' | 'exportacion' })}>
                <option value="importacion">Importación</option>
                <option value="exportacion">Exportación</option>
              </select>
            </Campo>
            <Campo label="Valor de la mercancía">
              <Num valor={carga.valorMercancia.monto}
                onCambio={v => setCarga({ ...carga, valorMercancia: { ...carga.valorMercancia, monto: v } })}
                placeholder="45000" />
            </Campo>
            <Campo label="Moneda">
              <select value={carga.valorMercancia.moneda} className={SEL}
                onChange={e => setCarga({ ...carga, valorMercancia: { ...carga.valorMercancia, moneda: e.target.value as 'MXN' | 'USD' } })}>
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
              </select>
            </Campo>
          </div>
          <div>
            <label className={LBL}>Fracciones arancelarias — puede ser más de una</label>
            <div className="space-y-1.5">
              {carga.fraccionesArancelarias.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="text" placeholder="Ej. 8471.30.01" value={f} className={INP + ' w-44'}
                    onChange={e => setCarga({
                      ...carga,
                      fraccionesArancelarias: carga.fraccionesArancelarias.map((x, j) => j === i ? e.target.value : x),
                    })} />
                  {carga.fraccionesArancelarias.length > 1 && (
                    <button type="button" className="text-gray-300 hover:text-red-500 p-1"
                      onClick={() => setCarga({ ...carga, fraccionesArancelarias: carga.fraccionesArancelarias.filter((_, j) => j !== i) })}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button"
              className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#E11D48] hover:text-[#BE123C]"
              onClick={() => setCarga({ ...carga, fraccionesArancelarias: [...carga.fraccionesArancelarias, ''] })}>
              <Plus className="w-3 h-3" /> Otra fracción
            </button>
          </div>
          <div className="flex items-center gap-6">
            <SiNo valor={carga.requierePrevio} etiqueta="¿Requiere previo?"
              onCambio={v => setCarga({ ...carga, requierePrevio: v })} />
            <SiNo valor={carga.requiereNOM} etiqueta="¿Requiere NOM o regulación no arancelaria?"
              onCambio={v => setCarga({ ...carga, requiereNOM: v })} />
          </div>
        </>
      )}

      {/* ── Descripción general — todas las modalidades ── */}
      <Campo label="Descripción de la mercancía">
        <input type="text" placeholder="Ej. Rollos de tela sintética en pallets" value={draft.mercancia} className={INP}
          onChange={e => onCambio({ ...draft, mercancia: e.target.value })} />
      </Campo>

      <BloqueMercancias mercancias={carga.mercancias ?? []}
        onCambio={m => setCarga({ ...carga, mercancias: m })} />

      <BloqueRequeridos requeridos={draft.conceptosRequeridos} conceptos={conceptos}
        onCambio={r => onCambio({ ...draft, conceptosRequeridos: r })} />
    </div>
  );
}
