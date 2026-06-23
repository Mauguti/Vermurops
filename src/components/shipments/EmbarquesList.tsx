import React, { useState } from 'react';
import { Search, Filter, Plus, Ship, Plane, Truck, ArrowRight, Calendar, User, FileText, Globe, Layers, Settings, Download, Upload, X } from 'lucide-react';
import { EmbarqueCompleto, ModalidadEmbarque } from './EmbarquesData';

interface EmbarquesListProps {
  embarques: EmbarqueCompleto[];
  onSelectEmbarque: (embarque: EmbarqueCompleto) => void;
  onCrearEmbarque: () => void;
}

export default function EmbarquesList({
  embarques,
  onSelectEmbarque,
  onCrearEmbarque
}: EmbarquesListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeModalidad, setActiveModalidad] = useState<ModalidadEmbarque | 'todos'>('todos');
  const [filterCierre, setFilterCierre] = useState<'todos' | 'operativo' | 'pago' | 'administrativo'>('todos');

  // Funciones de Administrador
  const [isAdmin, setIsAdmin] = useState(false);
  const ALL_COLUMNS = [
    { id: 'folio', label: 'Folio / Tipo' },
    { id: 'consignatario', label: 'Consignatario' },
    { id: 'ruta', label: 'Ruta' },
    { id: 'modalidad', label: 'Modalidad' },
    { id: 'bl', label: 'BL / AWB' },
    { id: 'arribo', label: 'Arribo (ETA)' },
    { id: 'cierres', label: 'Cierres (O/P/A)' }
  ];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(ALL_COLUMNS.map(c => c.id));
  const [showColConfig, setShowColConfig] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const toggleColumn = (id: string) => {
    setVisibleColumns(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleExportCSV = () => {
    const headers = ['Folio', 'Tipo', 'Consignatario', 'Expedidor', 'Modalidad', 'BL/AWB', 'Arribo'];
    const rows = filtered.map(e => [
      e.folio,
      e.tipo,
      e.entidades.consignatario,
      e.entidades.expedidor,
      e.modalidad,
      e.numeroGuia,
      e.fechas.arribo
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'embarques_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
    const headers = 'Folio,Tipo,Consignatario,Expedidor,Modalidad,BL/AWB,Arribo\nEX-001,master,Empresa S.A.,Shipper Inc,maritimo,AWB-1234,2023-12-01';
    const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla_embarques.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtrado
  const filtered = embarques.filter(e => {
    const term = searchTerm.toLowerCase();
    const matchSearch =
      e.folio.toLowerCase().includes(term) ||
      e.numeroGuia.toLowerCase().includes(term) ||
      e.referenciaCliente.toLowerCase().includes(term) ||
      e.entidades.consignatario.toLowerCase().includes(term) ||
      e.entidades.expedidor.toLowerCase().includes(term);

    const matchModalidad = activeModalidad === 'todos' || e.modalidad === activeModalidad;

    let matchCierre = true;
    if (filterCierre === 'operativo') matchCierre = !e.cierres.operativo;
    else if (filterCierre === 'pago') matchCierre = !e.cierres.pago;
    else if (filterCierre === 'administrativo') matchCierre = !e.cierres.administrativo;

    return matchSearch && matchModalidad && matchCierre;
  });

  const getModalidadBadge = (modalidad: ModalidadEmbarque) => {
    switch (modalidad) {
      case 'maritimo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-600 border border-sky-100">
            <Ship className="w-3.5 h-3.5" />
            Marítimo
          </span>
        );
      case 'aereo':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-[#6366F1]/5 text-[#6366F1] border border-[#6366F1]/10">
            <Plane className="w-3.5 h-3.5" />
            Aéreo
          </span>
        );
      case 'terrestre':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-600 border border-amber-100">
            <Truck className="w-3.5 h-3.5" />
            Terrestre
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Cabecera y Segmented Control */}
      <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-[20px] font-bold text-[#18181B] tracking-tight">Embarques</h2>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wide">
              Administración unificada de fletes, aduanas, pedimentos y HBLs
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-4 border-r border-gray-200 pr-4">
              <span className="text-[10px] font-bold text-gray-500 uppercase">Modo Admin</span>
              <button 
                onClick={() => setIsAdmin(!isAdmin)}
                className={`w-8 h-4 rounded-full transition-colors relative ${isAdmin ? 'bg-[#E11D48]' : 'bg-gray-300'}`}
              >
                <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${isAdmin ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 mr-2">
                <div className="relative">
                  <button 
                    onClick={() => setShowColConfig(!showColConfig)}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    title="Configurar columnas"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {showColConfig && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 shadow-lg rounded-xl p-3 z-10">
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase mb-2">Columnas Visibles</h4>
                      <div className="space-y-2">
                        {ALL_COLUMNS.map(col => (
                          <label key={col.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={visibleColumns.includes(col.id)}
                              onChange={() => toggleColumn(col.id)}
                              className="rounded text-[#E11D48] focus:ring-[#E11D48]"
                            />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setShowImportModal(true)}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                  title="Importar CSV"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleExportCSV}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                  title="Exportar CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={onCrearEmbarque}
              className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Nuevo Embarque
            </button>
          </div>
        </div>

        {/* Filtros de modalidad segmentados */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <div className="bg-gray-100 p-1 rounded-xl flex flex-wrap gap-1 shadow-2xs">
            <button
              onClick={() => setActiveModalidad('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5
                ${activeModalidad === 'todos'
                  ? 'bg-white text-[#18181B] shadow-2xs font-extrabold'
                  : 'text-gray-500 hover:text-gray-700'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setActiveModalidad('maritimo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5
                ${activeModalidad === 'maritimo'
                  ? 'bg-white text-sky-600 shadow-2xs font-extrabold border-b-2 border-sky-500'
                  : 'text-gray-500 hover:text-sky-600'}`}
            >
              <Ship className="w-3.5 h-3.5" />
              Marítimo
            </button>
            <button
              onClick={() => setActiveModalidad('aereo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5
                ${activeModalidad === 'aereo'
                  ? 'bg-white text-[#6366F1] shadow-2xs font-extrabold border-b-2 border-[#6366F1]'
                  : 'text-gray-500 hover:text-[#6366F1]'}`}
            >
              <Plane className="w-3.5 h-3.5" />
              Aéreo
            </button>
            <button
              onClick={() => setActiveModalidad('terrestre')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5
                ${activeModalidad === 'terrestre'
                  ? 'bg-white text-amber-600 shadow-2xs font-extrabold border-b-2 border-amber-500'
                  : 'text-gray-500 hover:text-amber-600'}`}
            >
              <Truck className="w-3.5 h-3.5" />
              Terrestre
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto text-xs">
            <span className="text-gray-400 font-bold uppercase text-[10px]">Cierres pendientes:</span>
            <select
              value={filterCierre}
              onChange={e => setFilterCierre(e.target.value as any)}
              className="bg-gray-50 border border-gray-200 rounded-lg p-1.5 font-semibold text-gray-600 outline-none cursor-pointer"
            >
              <option value="todos">Todos</option>
              <option value="operativo">Falta Cierre Operativo</option>
              <option value="pago">Falta Cierre de Pago</option>
              <option value="administrativo">Falta Cierre Administrativo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative w-full max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por folio, BL, PO, consignatario..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-150 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-50/70 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                {visibleColumns.includes('folio') && <th className="px-6 py-3.5 font-bold">Folio / Tipo</th>}
                {visibleColumns.includes('consignatario') && <th className="px-6 py-3.5 font-bold">Consignatario</th>}
                {visibleColumns.includes('ruta') && <th className="px-6 py-3.5 font-bold">Ruta (Origen → Destino)</th>}
                {visibleColumns.includes('modalidad') && <th className="px-6 py-3.5 font-bold">Modalidad</th>}
                {visibleColumns.includes('bl') && <th className="px-6 py-3.5 font-bold font-mono">BL / AWB</th>}
                {visibleColumns.includes('arribo') && <th className="px-6 py-3.5 font-bold">Arribo (ETA)</th>}
                {visibleColumns.includes('cierres') && <th className="px-6 py-3.5 font-bold text-center">Cierres (O/P/A)</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-xs text-gray-400 italic">
                    No se encontraron embarques.
                  </td>
                </tr>
              ) : (
                filtered.map(e => (
                  <tr
                    key={e.id}
                    onClick={() => onSelectEmbarque(e)}
                    className="hover:bg-[#E11D48]/[0.01] hover:border-l-2 hover:border-l-[#E11D48] cursor-pointer transition-colors border-l-2 border-l-transparent"
                  >
                    {visibleColumns.includes('folio') && (
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-800 hover:text-[#E11D48]">
                            {e.folio}
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1 mt-0.5">
                            {e.tipo === 'master' ? (
                              <span className="text-purple-600 bg-purple-50 px-1 py-0.2 rounded font-extrabold text-[8px]">MASTER</span>
                            ) : (
                              <span className="text-gray-500 bg-gray-100 px-1 py-0.2 rounded text-[8px]">HIJO</span>
                            )}
                            {e.masterId && `(HBL de ${e.masterId.replace('SHP-2026-', 'SHP-26-')})`}
                          </span>
                        </div>
                      </td>
                    )}

                    {visibleColumns.includes('consignatario') && (
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold text-gray-700 block truncate max-w-[180px]" title={e.entidades.consignatario}>
                          {e.entidades.consignatario}
                        </span>
                        <span className="text-[9px] text-gray-400 block truncate max-w-[180px]" title={`Shipper: ${e.entidades.expedidor}`}>
                          DE: {e.entidades.expedidor}
                        </span>
                      </td>
                    )}

                    {visibleColumns.includes('ruta') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <span className="truncate max-w-[110px]" title={e.ruta.origen.puertoCarga}>
                            {e.ruta.origen.puertoCarga.split(',')[0]}
                          </span>
                          <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate max-w-[110px]" title={e.ruta.destino.puertoDescarga}>
                            {e.ruta.destino.puertoDescarga.split(',')[0]}
                          </span>
                        </div>
                        {e.ruta.aduana.pedimento && (
                          <span className="text-[9px] text-purple-600 font-mono font-bold mt-0.5 block" title={`Pedimento: ${e.ruta.aduana.pedimento}`}>
                            PED: {e.ruta.aduana.pedimento.slice(-7)}
                          </span>
                        )}
                      </td>
                    )}

                    {visibleColumns.includes('modalidad') && (
                      <td className="px-6 py-4">
                        {getModalidadBadge(e.modalidad)}
                      </td>
                    )}

                    {visibleColumns.includes('bl') && (
                      <td className="px-6 py-4 text-xs font-mono font-bold text-gray-500">
                        {e.numeroGuia}
                      </td>
                    )}

                    {visibleColumns.includes('arribo') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span className="tabular-nums">{e.fechas.arribo}</span>
                        </div>
                      </td>
                    )}

                    {visibleColumns.includes('cierres') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <CierreDot label="Op" done={e.cierres.operativo} />
                          <CierreDot label="Pa" done={e.cierres.pago} />
                          <CierreDot label="Ad" done={e.cierres.administrativo} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Importación */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-[14px] font-bold text-gray-800">Importar Embarques (CSV)</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500">
                Sube un archivo CSV con tus embarques. Puedes descargar la plantilla de muestra para ver cómo debe estar estructurada la información.
              </p>
              
              <button 
                onClick={handleDownloadTemplate}
                className="w-full py-2 px-4 border border-[#E11D48] text-[#E11D48] bg-[#E11D48]/5 hover:bg-[#E11D48]/10 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Descargar plantilla de muestra
              </button>

              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center bg-gray-50">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-xs font-semibold text-gray-600 mb-1">Arrastra tu archivo CSV aquí</p>
                <p className="text-[10px] text-gray-400 mb-4">o haz clic para seleccionar</p>
                <button 
                  onClick={() => { alert('Esta es una demo. En el entorno real esto abriría el selector de archivos y procesaría la importación.'); setShowImportModal(false); }}
                  className="bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  Seleccionar archivo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function CierreDot({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wide border text-center min-w-[24px] inline-block
        ${done
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-red-50 text-red-600 border-red-200'}`}
      title={`${label}: ${done ? 'Cerrado' : 'Pendiente'}`}
    >
      {label}
    </span>
  );
}
