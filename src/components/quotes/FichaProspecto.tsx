import React, { useState } from 'react';
import { DollarSign, Mail, Phone, User, ArrowRight, CheckCircle2, MessageSquare } from 'lucide-react';
import { Prospecto, ProspectoActivity } from '../../data';
import { VENDEDORES } from './QuotesData';
import ModalMotivoPerdida from './ModalMotivoPerdida';
import {
  FichaLayout, FichaHeader, FichaTabs, FichaContenido, FichaFooter, BadgeEstado,
} from '../ui/ficha/FichaLayout';
import EstadoVacio from '../ui/EstadoVacio';

/**
 * ── De drawer a pantalla completa (U-2) ────────────────────────────────────
 * El cliente pidió explícitamente que el prospecto dejara de ser un cajón
 * lateral. Era la única ficha que se abría encima de la lista, en 520px, con
 * su propio encabezado y su propio footer: la misma información se leía
 * distinta según si venías del Kanban o de la tabla.
 *
 * Ahora usa la anatomía de `ui/ficha/FichaLayout`, igual que la cotización.
 * Los handlers, los campos y las acciones son los mismos: cambió dónde se
 * dibujan, no qué hacen.
 */

interface FichaProspectoProps {
  prospecto: Prospecto | null;
  /**
   * Se conserva para no tocar a quien la llama. En pantalla completa el
   * montaje ya es la condición, así que quien la renderice puede omitirla.
   */
  isOpen?: boolean;
  onClose: () => void;
  onUpdate: (updated: Prospecto) => void;
  onConvert: (p: Prospecto) => void;
}

const PESTANAS = [
  { id: 'info', label: 'Información' },
  { id: 'actividad', label: 'Actividad' },
] as const;
type PestanaProspecto = typeof PESTANAS[number]['id'];

const STAGES = [
  { id: 'nuevo_lead', label: 'Nuevo Lead' },
  { id: 'contactado', label: 'Contactado' },
  { id: 'calificado', label: 'Calificado' },
  { id: 'convertido', label: 'Convertido' }
] as const;

export default function FichaProspecto({ prospecto, isOpen = true, onClose, onUpdate, onConvert }: FichaProspectoProps) {
  const [pestana, setPestana] = useState<PestanaProspecto>('info');
  // Antes «Eliminar prospecto» solo pedía confirmación y tenía un TODO: no
  // hacía nada. Ahora se marca como perdido con su motivo, igual que una
  // cotización perdida — no se borra, se registra por qué se perdió.
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [newActivityDesc, setNewActivityDesc] = useState('');
  const [newActivityType, setNewActivityType] = useState<ProspectoActivity['tipo']>('nota');
  const [newActivityDate, setNewActivityDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen || !prospecto) return null;

  const handleStageClick = (stageId: string) => {
    if (prospecto.etapa === stageId) return;
    
    const newActivity: ProspectoActivity = {
      id: `act-${Date.now()}`,
      tipo: 'cambio_etapa',
      descripcion: `Cambio de etapa a ${STAGES.find(s => s.id === stageId)?.label}`,
      fecha: new Date().toISOString().slice(0, 16),
      responsable: prospecto.responsable
    };

    onUpdate({
      ...prospecto,
      etapa: stageId as any,
      actividades: [newActivity, ...prospecto.actividades]
    });
  };

  const handleAddActivity = () => {
    if (!newActivityDesc.trim()) return;

    const newActivity: ProspectoActivity = {
      id: `act-${Date.now()}`,
      tipo: newActivityType,
      descripcion: newActivityDesc,
      fecha: newActivityDate + 'T12:00', // Mock time
      responsable: prospecto.responsable
    };

    onUpdate({
      ...prospecto,
      actividades: [newActivity, ...prospecto.actividades]
    });
    setNewActivityDesc('');
  };

  const currentStageIndex = STAGES.findIndex(s => s.id === prospecto.etapa);

  return (
    <FichaLayout>
      <FichaHeader
        modulo="Prospectos"
        onBack={onClose}
        folio={prospecto.folio}
        titulo={
          <input
            value={prospecto.empresa}
            onChange={e => onUpdate({ ...prospecto, empresa: e.target.value })}
            className="text-xl font-bold text-[#18181B] tracking-tight bg-transparent outline-none focus:bg-white rounded px-1 -ml-1 border border-transparent focus:border-gray-200"
          />
        }
        badges={
          <>
            <BadgeEstado tono={
              prospecto.etapa === 'convertido' ? 'exito'
              : prospecto.etapa === 'perdido' ? 'peligro'
              : 'activo'}
            >
              {prospecto.etapa === 'perdido'
                ? 'Perdido'
                : STAGES.find(s => s.id === prospecto.etapa)?.label}
            </BadgeEstado>
            <BadgeEstado tono="neutro">{prospecto.origenLead}</BadgeEstado>
          </>
        }
        subtitulo={prospecto.valorEstimado ? (
          <p className="font-black text-[#E11D48] tabular-nums">
            Valor estimado: ${prospecto.valorEstimado.toLocaleString()} USD
          </p>
        ) : undefined}
      />

      <FichaTabs<PestanaProspecto>
        pestanas={PESTANAS.map(t => ({
          id: t.id,
          label: t.label,
          contador: t.id === 'actividad' ? (prospecto.actividades?.length ?? 0) : undefined,
        }))}
        activa={pestana}
        onCambiar={setPestana}
      />

      <FichaContenido>
        {pestana === 'info' && (
        <div className="space-y-8 max-w-4xl">

          {/* Pipeline visual */}
          <div>
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Pipeline</h4>
            <div className="relative flex items-center justify-between">
              <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-gray-200 -z-10 -translate-y-1/2 mx-4" />
              <div 
                className="absolute left-0 top-1/2 h-[2px] bg-[#E11D48] -z-10 -translate-y-1/2 mx-4 transition-all duration-300" 
                style={{ width: `calc(${(currentStageIndex / (STAGES.length - 1)) * 100}% - 32px)` }} 
              />
              
              {STAGES.map((stage, idx) => {
                const isActive = idx <= currentStageIndex;
                return (
                  <button
                    key={stage.id}
                    onClick={() => handleStageClick(stage.id)}
                    className="flex flex-col items-center gap-2 group outline-none"
                  >
                    <div className={`w-4 h-4 rounded-full border-2 bg-white transition-colors duration-300
                      ${isActive ? 'border-[#E11D48]' : 'border-gray-300 group-hover:border-gray-400'}
                    `}>
                      {isActive && <div className="w-full h-full rounded-full bg-[#E11D48] scale-[0.4] transition-transform" />}
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider
                      ${isActive ? 'text-[#E11D48]' : 'text-gray-400 group-hover:text-gray-600'}
                    `}>
                      {stage.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Datos del Prospecto */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2">
              Datos del Prospecto
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Contacto Nombre</label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded p-1.5">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <input 
                    value={prospecto.contactoNombre} 
                    onChange={e => onUpdate({ ...prospecto, contactoNombre: e.target.value })}
                    className="bg-transparent text-xs text-gray-700 outline-none w-full font-medium"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Teléfono</label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded p-1.5">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <input 
                    value={prospecto.contactoTel || ''} 
                    onChange={e => onUpdate({ ...prospecto, contactoTel: e.target.value })}
                    className="bg-transparent text-xs text-gray-700 outline-none w-full font-medium"
                    placeholder="Ej. 55 1234 5678"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Email</label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded p-1.5">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <input 
                    value={prospecto.contactoEmail || ''} 
                    onChange={e => onUpdate({ ...prospecto, contactoEmail: e.target.value })}
                    className="bg-transparent text-xs text-gray-700 outline-none w-full font-medium"
                    placeholder="ejemplo@empresa.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Origen Lead</label>
                <select 
                  value={prospecto.origenLead}
                  onChange={e => onUpdate({ ...prospecto, origenLead: e.target.value as any })}
                  className="w-full bg-gray-50 border border-gray-200 rounded p-1.5 text-xs text-gray-700 font-medium outline-none cursor-pointer"
                >
                  <option value="web">Web</option>
                  <option value="llamada">Llamada</option>
                  <option value="referido">Referido</option>
                  <option value="visita">Visita</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Valor Estimado (USD)</label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded p-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <input 
                    type="number"
                    value={prospecto.valorEstimado || ''} 
                    onChange={e => onUpdate({ ...prospecto, valorEstimado: Number(e.target.value) })}
                    className="bg-transparent text-xs text-gray-700 outline-none w-full font-medium"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Responsable</label>
                <select 
                  value={prospecto.responsable}
                  onChange={e => onUpdate({ ...prospecto, responsable: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded p-1.5 text-xs text-gray-700 font-medium outline-none cursor-pointer"
                >
                  {VENDEDORES.map(v => (
                    <option key={v.id} value={v.nombre}>{v.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
            <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2">
              Notas
            </h4>
            <textarea
              value={prospecto.notas || ''}
              onChange={e => onUpdate({ ...prospecto, notas: e.target.value })}
              className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 outline-none focus:border-[#E11D48] resize-none"
              placeholder="Notas adicionales..."
            />
          </div>

        </div>
        )}

        {pestana === 'actividad' && (
        <div className="space-y-8 max-w-4xl">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-5">
            <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2">
              Actividades
            </h4>

            {/* Form Nueva Actividad */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-3">
              <div className="flex gap-2">
                <select 
                  value={newActivityType}
                  onChange={e => setNewActivityType(e.target.value as any)}
                  className="bg-white border border-gray-200 rounded p-1.5 text-xs font-medium outline-none cursor-pointer text-gray-700"
                >
                  <option value="llamada">📞 Llamada</option>
                  <option value="correo">📧 Correo</option>
                  <option value="reunion">📅 Reunión</option>
                  <option value="nota">📝 Nota</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                </select>
                <input 
                  type="date"
                  value={newActivityDate}
                  onChange={e => setNewActivityDate(e.target.value)}
                  className="bg-white border border-gray-200 rounded p-1.5 text-xs font-medium outline-none cursor-pointer text-gray-700 flex-1"
                />
              </div>
              <textarea 
                value={newActivityDesc}
                onChange={e => setNewActivityDesc(e.target.value)}
                placeholder="Descripción de la actividad..."
                className="w-full h-16 p-2 bg-white border border-gray-200 rounded text-xs outline-none focus:border-[#E11D48] resize-none text-gray-700"
              />
              <div className="flex justify-end">
                <button 
                  onClick={handleAddActivity}
                  disabled={!newActivityDesc.trim()}
                  className="bg-gray-800 text-white hover:bg-black px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50"
                >
                  Registrar actividad
                </button>
              </div>
            </div>

            {/* Timeline */}
            <div className="space-y-4 pl-2 border-l-2 border-gray-100 ml-2">
              {prospecto.actividades?.map(act => (
                <div key={act.id} className="relative pl-4">
                  <div className="absolute -left-[23px] top-0.5 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-[10px]">
                    {act.tipo === 'llamada' ? '📞' : act.tipo === 'correo' ? '📧' : act.tipo === 'reunion' ? '📅' : act.tipo === 'whatsapp' ? '💬' : '📝'}
                  </div>
                  <div className="bg-gray-50 border border-gray-100 p-2.5 rounded-lg">
                    <p className="text-xs text-gray-700 font-medium">{act.descripcion}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                      <span>{new Date(act.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span>•</span>
                      <span>{act.responsable}</span>
                    </div>
                  </div>
                </div>
              ))}
              {(!prospecto.actividades || prospecto.actividades.length === 0) && (
                <EstadoVacio
                  variante="plano"
                  icono={<MessageSquare className="w-5 h-5" />}
                  titulo="Sin actividades registradas"
                  detalle="Cada llamada, correo o reunión que registres queda aquí con su fecha y su responsable. Es lo que explica por qué el prospecto avanzó o se quedó parado."
                />
              )}
            </div>
          </div>
        </div>
        )}
      </FichaContenido>

      {/* Footer: la acción de la etapa arriba, la salida abajo — misma
          jerarquía que la ficha de cotización. Antes «Convertir a cotización»
          vivía escondido en el encabezado del cajón. */}
      <FichaFooter>
        {prospecto.etapa === 'convertido' && (
          <button
            onClick={() => onConvert(prospecto)}
            className="w-full max-w-3xl mx-auto px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            Convertir a cotización <ArrowRight className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center justify-between max-w-3xl mx-auto w-full gap-4">
          <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">
            Creado: {prospecto.fechaCreacion}
          </p>
          {prospecto.etapa === 'perdido' ? (
            <div className="text-right">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Perdido</p>
              <p className="text-[11px] text-gray-500 max-w-[280px]">{prospecto.motivoPerdida}</p>
            </div>
          ) : (
            <button
              onClick={() => setPidiendoMotivo(true)}
              className="text-xs font-bold text-red-500 border border-red-200 bg-white hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Marcar como perdido
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          <span className="text-[10px] text-gray-400">Guardado automáticamente</span>
        </div>
      </FichaFooter>

      {pidiendoMotivo && prospecto && (
        <ModalMotivoPerdida
          titulo="Marcar prospecto como perdido"
          descripcion={`«${prospecto.empresa}» dejará de aparecer en el pipeline activo. No se borra: queda en el histórico con su motivo, que es lo que permite saber por qué se pierden las oportunidades.`}
          onCancelar={() => setPidiendoMotivo(false)}
          onConfirmar={(motivo) => {
            onUpdate({
              ...prospecto,
              etapa: 'perdido',
              motivoPerdida: motivo,
              fechaPerdida: new Date().toISOString().slice(0, 10),
            });
            setPidiendoMotivo(false);
            onClose();
          }}
        />
      )}
    </FichaLayout>
  );
}
