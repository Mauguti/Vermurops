import React, { useState } from 'react';
import { Package, Plus, Trash2, Weight, Box, ChevronDown, ChevronRight, Edit2, ShieldCheck, X } from 'lucide-react';
import { EmbarqueProducto, Pallet, DatosContenedor, TIPOS_CONTENEDOR, palletPiezas, palletPeso, palletVolumen, palletDescripcion } from './EmbarquesData';
import { ClienteVermur } from '../clientes/ClientesData';

const TIPOS_EMBALAJE = ['Pallet', 'Caja', 'Tambor', 'Bulto', 'Bobina', 'Contenedor', 'Otro'] as const;

const PALLET_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-purple-50 text-purple-700 border-purple-200',
  'bg-pink-50 text-pink-700 border-pink-200',
  'bg-orange-50 text-orange-700 border-orange-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200'
];

interface ProductosEmbarqueProps {
  productos: EmbarqueProducto[];
  clientes: ClienteVermur[];
  onAddProducto: (prod: Omit<EmbarqueProducto, 'id'>) => void;
  onDeleteProducto: (id: string) => void;
}

export default function ProductosEmbarque({
  productos,
  clientes,
  onAddProducto,
  onDeleteProducto,
}: ProductosEmbarqueProps) {
  // Estado base del producto
  const [desc, setDesc] = useState('');
  const [embalaje, setEmbalaje] = useState<string>('Pallet');
  const [piezas, setPiezas] = useState<number | ''>('');
  const [peso, setPeso] = useState<number | ''>('');
  const [volumen, setVolumen] = useState<number | ''>('');

  // Estado condicional de Contenedor
  const [numeroContenedor, setNumeroContenedor] = useState('');
  const [tipoContenedor, setTipoContenedor] = useState(TIPOS_CONTENEDOR[0]);
  const [numeroSello, setNumeroSello] = useState('');
  const [folioSello, setFolioSello] = useState('');
  const [tipoConsolidacion, setTipoConsolidacion] = useState<'FCL' | 'LCL'>('FCL');
  const [pallets, setPallets] = useState<Pallet[]>([]);

  // Estado UI
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [showPalletModal, setShowPalletModal] = useState(false);
  const [editPalletId, setEditPalletId] = useState<string | null>(null);

  // Estado Modal Pallet
  const [palletForm, setPalletForm] = useState<Partial<Pallet>>({});

  const toggleRow = (id: string) => {
    setExpandedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  // Totales generales
  const totalPiezas = productos.reduce((s, p) => s + p.piezas, 0);
  const totalPeso   = productos.reduce((s, p) => s + p.peso, 0);
  const totalVol    = productos.reduce((s, p) => s + (p.volumen ?? 0), 0);

  // Helper para cálculos de pallets (FCL y LCL)
  const totalLclPiezas = pallets.reduce((s, p) => s + palletPiezas(p), 0);
  const totalLclPeso = pallets.reduce((s, p) => s + palletPeso(p), 0);
  const totalLclVol = pallets.reduce((s, p) => s + palletVolumen(p), 0);
  const clientesUnicos = new Set(pallets.map(p => p.clienteNombre)).size;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || piezas === '' || peso === '') return;

    let datosContenedor: DatosContenedor | undefined;
    let consolType: 'FCL' | 'LCL' | undefined;
    let palletList: Pallet[] | undefined;

    if (embalaje === 'Contenedor') {
      datosContenedor = { numeroContenedor, tipoContenedor, numeroSello, folioSello };
      consolType = tipoConsolidacion;
      palletList = [...pallets];
    }

    onAddProducto({
      descripcion: desc.trim(),
      tipoEmbalaje: embalaje,
      piezas: Number(piezas),
      peso: Number(peso),
      volumen: volumen !== '' ? Number(volumen) : undefined,
      datosContenedor,
      tipoConsolidacion: consolType,
      pallets: palletList
    });

    // Reset fields
    setDesc('');
    setPiezas('');
    setPeso('');
    setVolumen('');
    setNumeroContenedor('');
    setTipoContenedor(TIPOS_CONTENEDOR[0]);
    setNumeroSello('');
    setFolioSello('');
    setTipoConsolidacion('FCL');
    setPallets([]);
  };

  const handleSavePallet = () => {
    const hasClient = clientes.length > 0 ? !!palletForm.clienteId : !!palletForm.clienteNombre;
    if (!palletForm.numeroPallet || !hasClient || !palletForm.descripcionMercancia || !palletForm.piezas || !palletForm.pesoKg) return;

    if (editPalletId) {
      setPallets(prev => prev.map(p => p.id === editPalletId ? { ...p, ...palletForm } as Pallet : p));
    } else {
      setPallets(prev => [...prev, { ...palletForm, id: `plt-${Date.now()}` } as Pallet]);
    }
    setShowPalletModal(false);
    setEditPalletId(null);
    setPalletForm({});
  };

  const handleDeletePallet = (id: string) => {
    setPallets(prev => prev.filter(p => p.id !== id));
  };

  const getPalletColor = (clientName: string) => {
    // Generar un hash numérico simple a partir del string
    let hash = 0;
    for (let i = 0; i < clientName.length; i++) {
      hash = clientName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % PALLET_COLORS.length;
    return PALLET_COLORS[idx];
  };

  return (
    <div className="space-y-6">

      {/* Tabla de productos */}
      <div className="bg-white rounded-xl border border-gray-150 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-brand" />
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Mercancías / Productos del Embarque
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-bg text-[9px] font-bold text-text-muted uppercase tracking-wider border-b border-divider">
                <th className="px-5 py-3 w-8"></th>
                <th className="px-5 py-3">Descripción</th>
                <th className="px-5 py-3">Tipo Embalaje</th>
                <th className="px-5 py-3 text-right">Piezas</th>
                <th className="px-5 py-3 text-right">Peso (kg)</th>
                <th className="px-5 py-3 text-right">Volumen (m³)</th>
                <th className="px-5 py-3 text-center w-[54px]">Acc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider text-xs font-semibold text-text-secondary">
              {productos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-text-muted italic">
                    No se han ingresado productos para este embarque.
                  </td>
                </tr>
              ) : (
                productos.map(p => {
                  const isContainer = p.tipoEmbalaje === 'Contenedor';
                  const isExpanded = expandedRows.includes(p.id);
                  const hasPallets = isContainer && p.pallets && p.pallets.length > 0;

                  return (
                    <React.Fragment key={p.id}>
                      <tr className="hover:bg-brand/5 transition-colors group">
                        <td className="px-3 py-3.5 text-center cursor-pointer" onClick={() => isContainer && toggleRow(p.id)}>
                          {isContainer && (
                            <button className="p-1 rounded-md hover:bg-neutral-bg text-text-muted">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-text-primary">
                          <div className="flex flex-col">
                            <span>{p.descripcion}</span>
                            {isContainer && p.datosContenedor && (
                              <span className="text-[10px] text-text-muted font-medium uppercase mt-0.5">
                                {p.datosContenedor.numeroContenedor} • {p.datosContenedor.tipoContenedor}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/10 text-brand border border-brand/20 uppercase">
                              {p.tipoEmbalaje}
                            </span>
                            {isContainer && p.tipoConsolidacion && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-100 text-indigo-700 border border-indigo-200">
                                {p.tipoConsolidacion}{hasPallets ? ` • ${p.pallets!.length} PLT` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums text-text-primary">
                          {p.piezas.toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums text-text-primary">
                          {p.peso.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono tabular-nums text-text-muted">
                          {p.volumen != null ? p.volumen.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => onDeleteProducto(p.id)}
                            className="text-text-muted hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {/* Fila expandida para contenedores */}
                      {isContainer && isExpanded && (
                        <tr className="bg-canvas border-l-2 border-brand">
                          <td colSpan={7} className="px-8 py-4">
                            <div className="flex flex-col gap-4">
                              {/* Info Sello */}
                              {p.datosContenedor && (
                                <div className="flex items-center gap-6 text-[11px] text-text-secondary bg-white p-3 rounded-lg border border-card-border shadow-sm">
                                  <div className="flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-brand" />
                                    <span className="font-bold">SELLO:</span> 
                                    <span className="font-mono text-text-primary">{p.datosContenedor.numeroSello || 'N/A'}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">FOLIO:</span> 
                                    <span className="font-mono text-text-primary">{p.datosContenedor.folioSello || 'N/A'}</span>
                                  </div>
                                </div>
                              )}

                              {/* Tabla Pallets (FCL y LCL) */}
                              {hasPallets && (
                                <div className="bg-white rounded-lg border border-divider overflow-hidden">
                                  <table className="w-full text-left">
                                    <thead>
                                      <tr className="bg-neutral-bg text-[9px] text-text-muted uppercase tracking-wider">
                                        <th className="px-4 py-2 font-bold"># Pallet</th>
                                        <th className="px-4 py-2 font-bold">Cliente / Ref</th>
                                        <th className="px-4 py-2 font-bold">Mercancía</th>
                                        <th className="px-4 py-2 font-bold text-right">Pzas</th>
                                        <th className="px-4 py-2 font-bold text-right">Peso</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-divider text-[11px]">
                                      {p.pallets!.map(plt => (
                                        <tr key={plt.id} className="hover:bg-brand/5">
                                          <td className="px-4 py-2 font-mono font-bold text-text-primary">{plt.numeroPallet}</td>
                                          <td className="px-4 py-2">
                                            <div className="flex items-center gap-1.5">
                                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getPalletColor(plt.clienteNombre)}`}>
                                                {plt.clienteNombre}
                                              </span>
                                              {plt.cotizacionRef && (
                                                <span className="text-text-muted">{plt.cotizacionRef}</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-4 py-2 text-text-secondary truncate max-w-[200px]" title={palletDescripcion(plt)}>
                                            {palletDescripcion(plt)}
                                          </td>
                                          <td className="px-4 py-2 text-right font-mono text-text-primary">{palletPiezas(plt)}</td>
                                          <td className="px-4 py-2 text-right font-mono text-text-primary">{palletPeso(plt)} kg</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            {/* Totales al pie */}
            {productos.length > 0 && (
              <tfoot>
                <tr className="bg-brand/10 border-t-2 border-brand/20 text-xs font-extrabold text-text-primary">
                  <td colSpan={3} className="px-5 py-3 text-[10px] font-black text-brand uppercase tracking-wider">
                    <Weight className="w-3.5 h-3.5 inline mr-1" />
                    Totales del Embarque
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-brand">
                    {totalPiezas.toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-brand">
                    {totalPeso.toLocaleString()} kg
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-brand">
                    {totalVol > 0 ? `${totalVol.toLocaleString(undefined, { minimumFractionDigits: 2 })} m³` : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Formulario Agregar Producto */}
      <div className="bg-white p-6 rounded-xl border border-card-border shadow-2xs">
        <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider border-b border-divider pb-3 mb-4">
          Adicionar Producto / Mercancía
        </h4>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 items-end">
            {/* Descripción */}
            <div className="sm:col-span-2">
              <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">
                Descripción *
              </label>
              <input
                type="text"
                required
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Ej. BOLTS OR NUTS"
                className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold text-text-primary outline-none focus:border-brand shadow-sm transition-colors"
              />
            </div>

            {/* Tipo Embalaje */}
            <div>
              <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">
                Tipo Embalaje
              </label>
              <select
                value={embalaje}
                onChange={e => setEmbalaje(e.target.value)}
                className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-bold text-text-primary bg-white outline-none focus:border-brand shadow-sm transition-colors"
              >
                {TIPOS_EMBALAJE.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Piezas */}
            <div>
              <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">
                Piezas *
              </label>
              <input
                type="number"
                required
                min={1}
                value={piezas}
                onChange={e => setPiezas(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="17"
                className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold text-text-primary outline-none focus:border-brand shadow-sm transition-colors"
              />
            </div>

            {/* Peso */}
            <div>
              <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">
                Peso (kg) *
              </label>
              <input
                type="number"
                required
                min={0}
                value={peso}
                onChange={e => setPeso(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="14690"
                className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold text-text-primary outline-none focus:border-brand shadow-sm transition-colors"
              />
            </div>

            {/* Volumen */}
            <div>
              <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">
                Volumen (m³) — opc.
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={volumen}
                onChange={e => setVolumen(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold text-text-primary outline-none focus:border-brand shadow-sm transition-colors"
              />
            </div>
          </div>

          {/* Bloque Condicional Contenedor */}
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${embalaje === 'Contenedor' ? 'max-h-[2000px] opacity-100 mt-6' : 'max-h-0 opacity-0 mt-0'}`}>
            <div className="bg-canvas border-l-4 border-l-brand border-y border-r border-card-border rounded-r-xl p-5 shadow-sm space-y-6">
              
              <div className="flex items-center gap-2 mb-2">
                <Box className="w-5 h-5 text-brand" />
                <h4 className="text-sm font-black text-text-primary uppercase tracking-wide">Datos del Contenedor</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Número Contenedor *</label>
                  <input type="text" required={embalaje === 'Contenedor'} value={numeroContenedor} onChange={e => setNumeroContenedor(e.target.value.toUpperCase())} placeholder="MSCU1234567" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-mono font-bold text-text-primary outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Tipo *</label>
                  <select value={tipoContenedor} onChange={e => setTipoContenedor(e.target.value)} className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-bold text-text-primary outline-none focus:border-brand">
                    {TIPOS_CONTENEDOR.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Número Sello</label>
                  <input type="text" value={numeroSello} onChange={e => setNumeroSello(e.target.value.toUpperCase())} placeholder="SL-889923" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-mono text-text-primary outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Folio Sello</label>
                  <input type="text" value={folioSello} onChange={e => setFolioSello(e.target.value.toUpperCase())} placeholder="FOL-001" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-mono text-text-primary outline-none focus:border-brand" />
                </div>
              </div>

              {/* Consolidación LCL */}
              <div className="border-t border-divider pt-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-wider">Tipo de Consolidación</h4>
                  <div className="flex bg-neutral-bg p-1 rounded-lg border border-card-border">
                    <button type="button" onClick={() => setTipoConsolidacion('FCL')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${tipoConsolidacion === 'FCL' ? 'bg-white text-brand shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>FCL (Completo)</button>
                    <button type="button" onClick={() => setTipoConsolidacion('LCL')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase transition-all ${tipoConsolidacion === 'LCL' ? 'bg-white text-brand shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>LCL (Consolidado)</button>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-card-border overflow-hidden">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-divider">
                      <span className="text-[10px] font-black text-text-primary uppercase tracking-widest">Pallets del contenedor</span>
                      <button type="button" onClick={() => { setEditPalletId(null); setPalletForm({}); setShowPalletModal(true); }} className="flex items-center gap-1 text-[10px] font-bold text-brand hover:text-brand-hover transition-colors uppercase tracking-wide">
                        <Plus className="w-3.5 h-3.5" /> Agregar Pallet
                      </button>
                    </div>

                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-neutral-bg text-[9px] font-bold text-text-muted uppercase tracking-wider border-b border-divider">
                          <th className="px-4 py-2"># Pallet</th>
                          <th className="px-4 py-2">Cliente</th>
                          <th className="px-4 py-2">Cotización</th>
                          <th className="px-4 py-2">Mercancía</th>
                          <th className="px-4 py-2 text-right">Pzas</th>
                          <th className="px-4 py-2 text-right">Peso (kg)</th>
                          <th className="px-4 py-2 text-right">Vol (m³)</th>
                          <th className="px-4 py-2 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-divider text-xs">
                        {pallets.length === 0 ? (
                          <tr><td colSpan={8} className="px-4 py-6 text-center text-text-muted italic">Aún no hay pallets agregados a este contenedor.</td></tr>
                        ) : (
                          pallets.map(p => (
                            <tr key={p.id} className="hover:bg-neutral-bg">
                              <td className="px-4 py-2.5 font-mono font-bold">{p.numeroPallet}</td>
                              <td className="px-4 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getPalletColor(p.clienteNombre)}`}>
                                  {p.clienteNombre}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-text-muted font-mono">{p.cotizacionRef || '—'}</td>
                              <td className="px-4 py-2.5 text-text-secondary truncate max-w-[150px]" title={palletDescripcion(p)}>{palletDescripcion(p)}</td>
                              <td className="px-4 py-2.5 text-right font-mono">{palletPiezas(p)}</td>
                              <td className="px-4 py-2.5 text-right font-mono">{palletPeso(p)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-text-muted">{palletVolumen(p) || '—'}</td>
                              <td className="px-4 py-2.5 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button type="button" onClick={() => { setEditPalletId(p.id); setPalletForm(p); setShowPalletModal(true); }} className="p-1 text-text-muted hover:text-brand hover:bg-brand/10 rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                                  <button type="button" onClick={() => handleDeletePallet(p.id)} className="p-1 text-text-muted hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {pallets.length > 0 && (
                        <tfoot>
                          <tr className="bg-canvas border-t-2 border-divider text-[10px] font-bold uppercase tracking-wide">
                            <td colSpan={4} className="px-4 py-2 text-text-primary">
                              Totales pallets <span className="lowercase font-medium text-text-muted ml-2">({clientesUnicos} {clientesUnicos === 1 ? 'cliente' : 'clientes'})</span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-brand">{totalLclPiezas}</td>
                            <td className="px-4 py-2 text-right font-mono text-brand">{totalLclPeso} kg</td>
                            <td className="px-4 py-2 text-right font-mono text-brand">{totalLclVol > 0 ? `${totalLclVol} m³` : '—'}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
              </div>
            </div>
          </div>

          {/* Botón Guardar Producto */}
          <div className="flex justify-end pt-2 border-t border-divider mt-6">
            <button
              type="submit"
              className="bg-brand hover:bg-brand-hover text-white text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Adicionar {embalaje === 'Contenedor' ? 'Contenedor al Embarque' : 'Producto al Embarque'}
            </button>
          </div>
        </form>
      </div>

      {/* MODAL PALLET INLINE (OVERLAY) */}
      {showPalletModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-divider bg-canvas">
              <h3 className="text-sm font-black text-text-primary uppercase tracking-wide flex items-center gap-2">
                <Box className="w-4 h-4 text-brand" /> {editPalletId ? 'Editar Pallet' : 'Nuevo Pallet'}
              </h3>
              <button onClick={() => setShowPalletModal(false)} className="text-text-muted hover:text-text-primary transition-colors p-1"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Número de Pallet *</label>
                  <input type="text" value={palletForm.numeroPallet || ''} onChange={e => setPalletForm({...palletForm, numeroPallet: e.target.value.toUpperCase()})} placeholder="PLT-001" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-mono font-bold outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Cliente Dueño *</label>
                  {clientes.length > 0 ? (
                    <select
                      value={palletForm.clienteId || ''}
                      onChange={e => {
                        const sel = clientes.find(c => c.id === e.target.value);
                        setPalletForm({
                          ...palletForm,
                          clienteId: sel?.id || '',
                          clienteNombre: sel?.nombre || '',
                        });
                      }}
                      className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold outline-none focus:border-brand bg-white"
                    >
                      <option value="">— Seleccionar cliente —</option>
                      {clientes.filter(c => c.statusOperativo === 'ACTIVO').map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={palletForm.clienteNombre || ''}
                      onChange={e => setPalletForm({...palletForm, clienteNombre: e.target.value})}
                      placeholder="Sin clientes en catálogo — escribir nombre"
                      className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold outline-none focus:border-brand"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Ref. Cotización</label>
                  <input type="text" value={palletForm.cotizacionRef || ''} onChange={e => setPalletForm({...palletForm, cotizacionRef: e.target.value.toUpperCase()})} placeholder="Ej. COT-2026-0045" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-mono outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Piezas *</label>
                  <input type="number" min={1} value={palletForm.piezas || ''} onChange={e => setPalletForm({...palletForm, piezas: Number(e.target.value)})} placeholder="10" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold outline-none focus:border-brand" />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Descripción de Mercancía *</label>
                <textarea rows={2} value={palletForm.descripcionMercancia || ''} onChange={e => setPalletForm({...palletForm, descripcionMercancia: e.target.value})} placeholder="Rollos de tela de poliéster..." className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold outline-none focus:border-brand resize-none"></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Peso (kg) *</label>
                  <input type="number" min={1} value={palletForm.pesoKg || ''} onChange={e => setPalletForm({...palletForm, pesoKg: Number(e.target.value)})} placeholder="500" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Volumen (m³) opcional</label>
                  <input type="number" min={0} step={0.01} value={palletForm.volumenM3 || ''} onChange={e => setPalletForm({...palletForm, volumenM3: Number(e.target.value)})} placeholder="1.20" className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold outline-none focus:border-brand" />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-text-muted uppercase mb-1">Observaciones</label>
                <textarea rows={2} value={palletForm.observaciones || ''} onChange={e => setPalletForm({...palletForm, observaciones: e.target.value})} placeholder="Notas adicionales del pallet..." className="w-full px-3 py-2 border border-card-border rounded-lg text-xs font-semibold outline-none focus:border-brand resize-none"></textarea>
              </div>

            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-divider bg-canvas">
              <button type="button" onClick={() => setShowPalletModal(false)} className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors">Cancelar</button>
              <button type="button" onClick={handleSavePallet} className="px-4 py-2 bg-brand text-white text-xs font-bold rounded-lg hover:bg-brand-hover shadow-sm transition-colors uppercase tracking-wide">
                Guardar Pallet
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
