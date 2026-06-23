import React, { useState } from 'react';
import { initialProspectos, Prospecto } from '../../data';
import { Plus, Calendar, DollarSign } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { renderIcon, useServicios } from '../../config/serviciosStore';
import FichaProspecto from './FichaProspecto';

const PROSPECT_STAGES = [
  { id: 'nuevo_lead', label: 'Nuevo Lead', color: 'border-t-gray-200 bg-gray-50' },
  { id: 'contactado', label: 'Contactado', color: 'border-t-blue-500 bg-blue-50/50' },
  { id: 'calificado', label: 'Calificado', color: 'border-t-amber-500 bg-amber-50/50' },
  { id: 'convertido', label: 'Convertido', color: 'border-t-green-500 bg-green-50/50' }
] as const;

const ORIGEN_BADGES: Record<string, string> = {
  referido: 'bg-purple-100 text-purple-700 border-purple-200',
  web: 'bg-blue-100 text-blue-700 border-blue-200',
  llamada: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  visita: 'bg-orange-100 text-orange-700 border-orange-200',
  linkedin: 'bg-sky-100 text-sky-700 border-sky-200',
  otro: 'bg-gray-100 text-gray-700 border-gray-200'
};

export default function KanbanProspeccion({ 
  onConvert, 
  prospectos, 
  setProspectos 
}: { 
  onConvert: (p: Prospecto) => void;
  prospectos: Prospecto[];
  setProspectos: React.Dispatch<React.SetStateAction<Prospecto[]>>;
}) {
  const { user } = useAuth();
  
  const [selectedProspecto, setSelectedProspecto] = useState<Prospecto | null>(null);
  const [draggedOver, setDraggedOver] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDraggedOver(stageId);
  };

  const handleDragLeave = () => setDraggedOver(null);

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDraggedOver(null);
    const id = e.dataTransfer.getData('text/plain');
    setProspectos(prev => prev.map(p => p.id === id ? { ...p, etapa: stageId as any } : p));
  };

  const handleConvert = (p: Prospecto) => {
    // Si no está convertido, lo marcamos
    if (p.etapa !== 'convertido') {
      setProspectos(prev => prev.map(item => item.id === p.id ? { ...item, etapa: 'convertido' } : item));
    }
    onConvert(p);
  };

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-[1000px] items-stretch">
          {PROSPECT_STAGES.map(stage => {
            const cols = prospectos.filter(p => p.etapa === stage.id);
            const isDraggedOver = draggedOver === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={e => handleDrop(e, stage.id)}
                className={`w-[280px] rounded-xl border flex flex-col min-h-[520px] transition-all
                  ${isDraggedOver ? 'border-[#E11D48] bg-[#E11D48]/5 ring-2 ring-[#E11D48]/10' : 'border-gray-200 bg-gray-50/50'}
                `}
              >
                <div className={`p-3 border-t-4 ${stage.color} rounded-t-xl border-b border-gray-200 flex items-center justify-between`}>
                  <h3 className="text-[10px] font-bold uppercase tracking-wider">{stage.label}</h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">{cols.length}</span>
                </div>

                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {cols.map(p => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={e => handleDragStart(e, p.id)}
                      onClick={() => setSelectedProspecto(p)}
                      className="bg-white p-3 rounded-xl border border-gray-200 hover:border-[#E11D48]/30 shadow-sm cursor-pointer active:cursor-grabbing group space-y-2 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:-translate-y-[1px] transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono font-bold text-gray-400 group-hover:text-[#E11D48] transition-colors">{p.folio}</span>
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${ORIGEN_BADGES[p.origenLead] || ORIGEN_BADGES.otro}`}>
                          {p.origenLead}
                        </span>
                      </div>
                      
                      <div>
                        <h4 className="text-xs font-bold text-[#18181B] truncate">{p.empresa}</h4>
                        <p className="text-[10px] text-gray-500 truncate">{p.contactoNombre}</p>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {p.servicioPotencial.slice(0, 2).map((srv, i) => (
                          <span key={i} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-gray-200 truncate max-w-full">
                            {srv}
                          </span>
                        ))}
                        {p.servicioPotencial.length > 2 && (
                          <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[8px] font-bold border border-gray-200">
                            +{p.servicioPotencial.length - 2}
                          </span>
                        )}
                      </div>

                      {p.proximaActividad && (
                        <div className="text-[9px] text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center gap-1 border border-amber-100">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span className="truncate">{p.proximaActividad}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-gray-100 pt-2 mt-2">
                        {p.valorEstimado ? (
                          <span className="text-[10px] font-bold text-gray-500 flex items-center gap-0.5">
                            <DollarSign className="w-3 h-3" /> {p.valorEstimado.toLocaleString()} USD
                          </span>
                        ) : (
                          <span className="text-[9px] text-gray-300 italic">Sin valor estimado</span>
                        )}
                        <div className="w-5 h-5 rounded-full bg-brand/10 text-brand font-bold text-[8px] flex items-center justify-center ring-1 ring-white" title={p.responsable}>
                          {p.responsable.split(' ').map(n => n[0]).join('')}
                        </div>
                      </div>

                      {stage.id === 'convertido' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConvert(p); }}
                          className="w-full mt-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                        >
                          Convertir a cotización →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <FichaProspecto
        prospecto={selectedProspecto}
        isOpen={selectedProspecto !== null}
        onClose={() => setSelectedProspecto(null)}
        onUpdate={(updated) => {
          setProspectos(prev => prev.map(p => p.id === updated.id ? updated : p));
          setSelectedProspecto(updated);
        }}
        onConvert={p => {
          handleConvert(p);
          setSelectedProspecto(null);
        }}
      />
    </div>
  );
}
