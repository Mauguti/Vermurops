import React, { useState } from 'react';
import { FileText, Plus, Search, Filter, Download, ArrowRight, FileSignature, FileKey, Copy, Box, Anchor, BookOpen, Layers, Edit, Trash2 } from 'lucide-react';

export default function Documents() {
  const [activeTab, setActiveTab] = useState('Documentos de operaciones');
  const [searchTerm, setSearchTerm] = useState('');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);

  const tabs = ['Documentos de operaciones', 'Plantillas'];

  const documents = [
    { id: 'DOC-23-010', name: 'Master BL MEDU1928374', type: 'Bill of Lading (BL)', shipment: 'SHP-2023-001', client: 'Grupo Textil Monterrey', date: '2023-10-24', status: 'Final' },
    { id: 'DOC-23-011', name: 'AWB 139-48271635', type: 'Air Waybill (AWB)', shipment: 'SHP-2023-002', client: 'Tech Solutions MX', date: '2023-10-25', status: 'Enviado' },
    { id: 'DOC-23-012', name: 'Packing List QT-1002', type: 'Packing List', shipment: 'SHP-2023-003', client: 'Comercial del Norte', date: '2023-10-26', status: 'Borrador' },
    { id: 'DOC-23-013', name: 'Carta Porte CP-2023-88', type: 'Carta Porte (CFDI)', shipment: 'SHP-2023-003', client: 'Comercial del Norte', date: '2023-10-26', status: 'Borrador' },
    { id: 'DOC-23-014', name: 'Pedimento 23-47-3849', type: 'Pedimento Aduanal', shipment: 'SHP-2023-003', client: 'Comercial del Norte', date: '2023-10-21', status: 'Final' },
  ];

  const templates = [
    { id: 'TPL-1', name: 'House Bill of Lading Estándar', type: 'BL', lastUpdated: '2023-09-15', usage: 142 },
    { id: 'TPL-2', name: 'Carta Instrucciones Aduanales', type: 'Aduanas', lastUpdated: '2023-10-10', usage: 45 },
    { id: 'TPL-3', name: 'Aviso de Arribo (Notice of Arrival)', type: 'Notificación', lastUpdated: '2023-08-22', usage: 89 },
    { id: 'TPL-4', name: 'Certificado de Origen T-MEC', type: 'Certificado', lastUpdated: '2023-01-10', usage: 21 },
  ];

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Borrador': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-neutral-bg text-text-secondary">Borrador</span>;
      case 'Final': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-info-bg text-info-text">Final</span>;
      case 'Enviado': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-success-bg text-success-text">Enviado</span>;
      default: return null;
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    doc.shipment.toLowerCase().includes(searchTerm.toLowerCase()) || 
    doc.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-[32px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px]">
        <div>
          <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Documentos</h2>
          <p className="text-[13px] text-text-secondary mt-[4px]">Centro documental, plantillas y generación de PDFs.</p>
        </div>
        <div className="flex space-x-[12px]">
          {activeTab === 'Plantillas' ? (
             <button 
               onClick={() => setShowTemplateForm(true)}
               className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors flex items-center shrink-0"
             >
               <Plus className="w-4 h-4 mr-2" />
               Nueva plantilla
             </button>
          ) : (
             <button 
               onClick={() => setShowGenerateForm(true)}
               className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors flex items-center shrink-0"
             >
               <FileSignature className="w-4 h-4 mr-2" />
               Generar documento
             </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-[12px] shadow-sm flex flex-col overflow-hidden">
         <div className="px-[24px] border-b border-divider bg-canvas">
            <nav className="-mb-px flex space-x-[24px] overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-[16px] px-[4px] text-[13px] font-medium transition-colors border-b-[2px] whitespace-nowrap ${
                    activeTab === tab
                      ? 'border-brand text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
         </div>

         <div className="p-[24px]">
            {activeTab === 'Documentos de operaciones' && (
               <div className="space-y-[20px]">
                  <div className="flex gap-[12px] items-center mb-[16px]">
                    <div className="relative max-w-[400px] flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <input 
                        type="text" 
                        placeholder="Buscar por documento, embarque o cliente..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary" 
                      />
                    </div>
                    <select className="border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] text-text-primary bg-white shadow-sm outline-none focus:border-brand">
                       <option>Todos los tipos</option>
                       <option>Bill of Lading (BL)</option>
                       <option>Air Waybill (AWB)</option>
                       <option>Carta Porte / CFDI</option>
                       <option>Pedimento Aduanal</option>
                    </select>
                    <button className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] hover:bg-neutral-bg transition-colors shadow-sm">
                      <Filter className="w-4 h-4 mr-2" /> Filtros
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-divider rounded-[8px]">
                     <table className="w-full border-collapse">
                        <thead>
                           <tr>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">ID Doc</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Documento / Tipo</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Embarque</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Cliente</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Fecha</th>
                              <th className="bg-canvas text-left px-[16px] py-[12px] text-[11px] font-medium text-text-muted border-b border-divider uppercase">Estatus</th>
                              <th className="bg-canvas border-b border-divider"></th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-divider bg-white">
                           {filteredDocs.map(doc => (
                              <tr key={doc.id} className="hover:bg-neutral-bg transition-colors cursor-pointer group">
                                 <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary whitespace-nowrap">{doc.id}</td>
                                 <td className="px-[16px] py-[12px]">
                                    <span className="block text-[13px] text-text-primary font-medium">{doc.name}</span>
                                    <span className="block text-[12px] text-text-secondary">{doc.type}</span>
                                 </td>
                                 <td className="px-[16px] py-[12px] text-[13px] font-medium text-text-primary hover:text-brand transition-colors whitespace-nowrap">{doc.shipment}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-primary truncate max-w-[200px]">{doc.client}</td>
                                 <td className="px-[16px] py-[12px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">{doc.date}</td>
                                 <td className="px-[16px] py-[12px]">{getStatusBadge(doc.status)}</td>
                                 <td className="px-[16px] py-[12px] text-right space-x-[8px] whitespace-nowrap">
                                    <button className="text-text-muted hover:text-text-primary transition-colors p-[4px] rounded hover:bg-canvas" title="Ver archivo">
                                       <FileText className="w-[14px] h-[14px]" />
                                    </button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}

            {activeTab === 'Plantillas' && (
               <div className="space-y-[20px]">
                  {templates.length === 0 ? (
                     <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-[12px] bg-white">
                        <Layers className="w-[32px] h-[32px] text-text-muted mb-[16px]" />
                        <h3 className="text-[14px] font-semibold text-text-primary mb-[4px]">No hay plantillas</h3>
                        <p className="text-[13px] text-text-secondary text-center max-w-[300px] mb-[20px]">Crea tu primera plantilla de documento para automatizar la generación usando merge fields.</p>
                        <button 
                          onClick={() => setShowTemplateForm(true)}
                          className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors flex items-center"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Primera plantilla
                        </button>
                     </div>
                  ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
                        {templates.map(tpl => (
                           <div key={tpl.id} className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm hover:shadow-md transition-shadow flex flex-col group">
                              <div className="flex justify-between items-start mb-[16px]">
                                 <div className="w-[40px] h-[40px] rounded-[8px] bg-canvas border border-card-border flex items-center justify-center text-text-secondary">
                                    <FileText className="w-[18px] h-[18px]" />
                                 </div>
                                 <div className="flex space-x-[4px] opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="text-text-muted hover:text-text-primary p-[4px] rounded hover:bg-canvas"><Edit className="w-[14px] h-[14px]" /></button>
                                    <button className="text-text-muted hover:text-error-text p-[4px] rounded hover:bg-error-bg"><Trash2 className="w-[14px] h-[14px]" /></button>
                                 </div>
                              </div>
                              <h3 className="text-[14px] font-semibold text-text-primary mb-[4px] leading-tight">{tpl.name}</h3>
                              <p className="text-[12px] text-text-secondary mb-[16px]">{tpl.type}</p>
                              
                              <div className="mt-auto pt-[16px] border-t border-divider flex justify-between items-center">
                                 <span className="text-[11px] text-text-muted tabular-nums">Usada {tpl.usage} veces</span>
                                 <span className="text-[11px] text-text-muted tabular-nums">Act. {tpl.lastUpdated}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            )}
         </div>
      </div>

      {showTemplateForm && (
         <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-[24px]">
            <div className="bg-white rounded-[12px] w-full max-w-[800px] max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
               <div className="px-[24px] py-[16px] border-b border-divider flex justify-between items-center bg-canvas">
                  <h3 className="text-[16px] font-semibold text-text-primary">Nueva Plantilla</h3>
                  <button onClick={() => setShowTemplateForm(false)} className="text-text-muted hover:text-text-primary">Cerrar</button>
               </div>
               <div className="flex-1 overflow-y-auto p-[24px] grid grid-cols-1 md:grid-cols-4 gap-[24px]">
                  <div className="md:col-span-3 space-y-[16px]">
                     <div>
                        <label className="block text-[11px] font-medium text-text-muted uppercase mb-[6px]">Nombre de la plantilla</label>
                        <input type="text" placeholder="Ej. HBL de Importación" className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] bg-white focus:outline-none focus:border-brand shadow-sm" />
                     </div>
                     <div className="bg-canvas border border-card-border rounded-[8px] p-[16px]">
                        <p className="text-[11px] font-medium text-text-muted uppercase mb-[8px]">Contenido del documento HTML/Texto</p>
                        <textarea className="w-full border border-card-border rounded-[6px] p-[10px] text-[13px] font-mono bg-white focus:outline-none focus:border-brand h-[300px]" placeholder="Escribe el contenido e inserta merge fields..."></textarea>
                     </div>
                  </div>
                  <div className="md:col-span-1 space-y-[16px]">
                     <h4 className="text-[12px] font-medium text-text-primary uppercase tracking-[0.05em] border-b border-divider pb-[8px]">Merge Fields</h4>
                     <div className="space-y-[8px]">
                        {['{cliente_nombre}', '{cliente_rfc}', '{embarque_id}', '{origen_puerto}', '{destino_puerto}', '{fecha_salida}', '{naviera}', '{vessel_voyage}'].map(field => (
                           <button key={field} className="w-full text-left bg-canvas border border-card-border rounded-[6px] px-[10px] py-[6px] text-[11px] font-mono text-text-secondary hover:text-brand hover:border-brand transition-colors flex justify-between items-center group">
                              {field}
                              <Copy className="w-[12px] h-[12px] opacity-0 group-hover:opacity-100" />
                           </button>
                        ))}
                     </div>
                     <p className="text-[10px] text-text-muted leading-relaxed mt-[16px]">Haz clic en un campo para copiarlo al portapapeles y pégalo en el contenido de la plantilla.</p>
                  </div>
               </div>
               <div className="px-[24px] py-[16px] border-t border-divider bg-canvas flex justify-end space-x-[12px]">
                  <button onClick={() => setShowTemplateForm(false)} className="px-[16px] py-[8px] text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors">Cancelar</button>
                  <button onClick={() => { alert('Plantilla guardada'); setShowTemplateForm(false); }} className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors">Guardar Plantilla</button>
               </div>
            </div>
         </div>
      )}

      {showGenerateForm && (
         <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-[24px]">
            <div className="bg-white rounded-[12px] w-full max-w-[500px] flex flex-col overflow-hidden shadow-xl">
               <div className="px-[24px] py-[16px] border-b border-divider flex justify-between items-center bg-canvas">
                  <h3 className="text-[16px] font-semibold text-text-primary">Generar Documento a partir de Embarque</h3>
                  <button onClick={() => setShowGenerateForm(false)} className="text-text-muted hover:text-text-primary">Cerrar</button>
               </div>
               <div className="p-[24px] space-y-[20px]">
                  <div>
                     <label className="block text-[11px] font-medium text-text-muted uppercase mb-[6px]">1. Seleccionar Embarque Origen</label>
                     <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] bg-white focus:outline-none focus:border-brand shadow-sm">
                        <option>SHP-2023-001 (Cliente: Grupo Textil Monterrey)</option>
                        <option>SHP-2023-002 (Cliente: Tech Solutions MX)</option>
                        <option>SHP-2023-003 (Cliente: Comercial del Norte)</option>
                     </select>
                  </div>
                  <div>
                     <label className="block text-[11px] font-medium text-text-muted uppercase mb-[6px]">2. Seleccionar Plantilla</label>
                     <select className="w-full border border-card-border rounded-[8px] p-[10px] text-[13px] bg-white focus:outline-none focus:border-brand shadow-sm">
                        {templates.map(tpl => <option key={tpl.id}>{tpl.name} ({tpl.type})</option>)}
                     </select>
                  </div>
                  <div className="bg-info-bg/30 border border-info-bg rounded-[8px] p-[12px] flex items-start mt-[16px]">
                     <FileKey className="w-[16px] h-[16px] text-info-text mr-[8px] mt-[2px] shrink-0" />
                     <p className="text-[12px] text-info-text leading-relaxed">Los datos del embarque seleccionado autollenarán los merge fields de la plantilla elegida.</p>
                  </div>
               </div>
               <div className="px-[24px] py-[16px] border-t border-divider bg-canvas flex justify-end space-x-[12px]">
                  <button onClick={() => setShowGenerateForm(false)} className="px-[16px] py-[8px] text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors">Cancelar</button>
                  <button onClick={() => { alert('Documento generado con éxito'); setShowGenerateForm(false); }} className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors">Generar PDF</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
