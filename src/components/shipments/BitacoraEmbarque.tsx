/**
 * BitacoraEmbarque.tsx
 *
 * La pestaña Bitácora: lo interno del equipo. Comentarios de Operaciones y
 * lo que el sistema registra solo, en orden cronológico inverso, con filtro.
 * Se distingue del Historial (los hitos para el cliente) a propósito: nada
 * de aquí sale al portal.
 */

import React, { useMemo, useState } from 'react';
import {
  MessageSquare, Bot, Pencil, Check, X, History as HistoryIcon, ArrowRightLeft, Lock, Receipt,
  FileText, Banknote, Building2, UserCheck, Paperclip, Info,
} from 'lucide-react';
import type { EntradaBitacora, EventoBitacora } from './EmbarquesData';
import { filtrarBitacora, ETIQUETA_EVENTO, type FiltroBitacora } from '../../lib/bitacoraEmbarque';

interface Props {
  bitacora: EntradaBitacora[];
  usuarioUid: string;
  puedeComentar: boolean;
  onComentar: (texto: string) => void;
  onEditar: (id: string, texto: string) => string | null;
}

const ICONO: Record<EventoBitacora, React.ReactNode> = {
  etapa: <ArrowRightLeft className="w-3.5 h-3.5" />,
  cierre: <Lock className="w-3.5 h-3.5" />,
  cargo: <Receipt className="w-3.5 h-3.5" />,
  orden_compra: <FileText className="w-3.5 h-3.5" />,
  factura: <FileText className="w-3.5 h-3.5" />,
  cobro: <Banknote className="w-3.5 h-3.5" />,
  entidad: <Building2 className="w-3.5 h-3.5" />,
  responsable: <UserCheck className="w-3.5 h-3.5" />,
  documento: <Paperclip className="w-3.5 h-3.5" />,
  otro: <Info className="w-3.5 h-3.5" />,
};

function fecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BitacoraEmbarque({ bitacora, usuarioUid, puedeComentar, onComentar, onEditar }: Props) {
  const [filtro, setFiltro] = useState<FiltroBitacora>('todo');
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibles = useMemo(() => filtrarBitacora(bitacora, filtro), [bitacora, filtro]);
  const nComentarios = bitacora.filter(e => e.tipo === 'comentario').length;
  const nSistema = bitacora.length - nComentarios;

  const enviar = () => {
    if (!texto.trim()) return;
    onComentar(texto);
    setTexto('');
  };

  const confirmarEdicion = () => {
    if (!editando) return;
    const razon = onEditar(editando.id, editando.texto);
    if (razon) { setError(razon); return; }
    setError(null);
    setEditando(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {/* Filtro */}
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex bg-gray-100 p-0.5 rounded-lg">
            {([['todo', `Todo ${bitacora.length}`], ['comentarios', `Comentarios ${nComentarios}`], ['sistema', `Sistema ${nSistema}`]] as [FiltroBitacora, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setFiltro(id)}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-colors ${filtro === id ? 'bg-white text-[#18181B] shadow-2xs' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">Interno. Nada de aquí sale al portal del cliente.</p>
        </div>

        {/* Lista, lo más reciente arriba */}
        <div className="bg-white rounded-xl border border-gray-150 shadow-2xs divide-y divide-gray-100">
          {visibles.length === 0 ? (
            <p className="p-8 text-center text-xs text-gray-400 italic">
              {bitacora.length === 0 ? 'Todavía no hay nada en la bitácora. Los cambios se registran solos; los comentarios los escribe Operaciones.' : 'Nada con ese filtro.'}
            </p>
          ) : visibles.map(e => (
            e.tipo === 'comentario'
              ? <Comentario key={e.id} e={e} mia={e.autor.uid === usuarioUid}
                  editando={editando?.id === e.id ? editando.texto : null}
                  onEmpezar={() => { setEditando({ id: e.id, texto: e.titulo }); setError(null); }}
                  onCambiar={t => setEditando({ id: e.id, texto: t })}
                  onConfirmar={confirmarEdicion}
                  onCancelar={() => { setEditando(null); setError(null); }}
                  error={editando?.id === e.id ? error : null} />
              : <Sistema key={e.id} e={e} />
          ))}
        </div>
      </div>

      {/* Comentar */}
      <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-2xs h-fit space-y-3">
        <h4 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-2.5 flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-[#E11D48]" /> Nota interna
        </h4>
        {puedeComentar ? (
          <>
            <textarea
              rows={4}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar(); }}
              placeholder="«La naviera confirmó que zarpa el jueves», «el cliente pidió esperar para liberar»…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-700 outline-none focus:border-[#E11D48] resize-none"
            />
            <button onClick={enviar} disabled={!texto.trim()}
              className="w-full bg-[#18181B] hover:bg-black text-white text-[11px] font-bold uppercase tracking-wider py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed">
              Anotar en la bitácora
            </button>
            <p className="text-[10px] text-gray-400">Solo tú puedes editar tus notas, y queda registro de lo que decían. Lo que registra el sistema no se edita.</p>
          </>
        ) : (
          <p className="text-[11px] text-gray-400">Solo Operaciones anota en la bitácora.</p>
        )}
      </div>
    </div>
  );
}

function Sistema({ e }: { e: EntradaBitacora }) {
  const ev = e.evento ?? 'otro';
  return (
    <div className="px-4 py-2.5 flex items-start gap-3 bg-gray-50/40">
      <span className="mt-0.5 w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center shrink-0" title="Registrado por el sistema">
        {ICONO[ev]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-gray-700">{e.titulo}</p>
        {e.detalle && <p className="text-[11px] text-gray-500 mt-0.5">{e.detalle}</p>}
        <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1.5">
          <Bot className="w-3 h-3" /> {ETIQUETA_EVENTO[ev]} · {fecha(e.fecha)}
        </p>
      </div>
    </div>
  );
}

function Comentario({ e, mia, editando, onEmpezar, onCambiar, onConfirmar, onCancelar, error }: {
  e: EntradaBitacora; mia: boolean; editando: string | null;
  onEmpezar: () => void; onCambiar: (t: string) => void; onConfirmar: () => void; onCancelar: () => void;
  error: string | null;
}) {
  const iniciales = (e.autor.nombre || '?').split(/[\s.@]+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  return (
    <div className="px-4 py-3 flex items-start gap-3 group">
      <span className="mt-0.5 w-7 h-7 rounded-full bg-[#E11D48]/10 text-[#E11D48] text-[10px] font-black flex items-center justify-center shrink-0" title={e.autor.nombre}>
        {iniciales}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-[#18181B]">{e.autor.nombre}</span>
          <span className="text-[10px] text-gray-400">{fecha(e.fecha)}</span>
          {e.editadoEn && (
            <span className="text-[10px] text-gray-400 italic cursor-help"
              title={(e.ediciones ?? []).map(x => `${fecha(x.fecha)}: «${x.textoAnterior}»`).join('\n')}>
              editado
            </span>
          )}
          {mia && editando === null && (
            <button onClick={onEmpezar} className="ml-auto opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700" title="Editar mi nota">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {editando === null ? (
          <p className="text-[12px] text-gray-800 mt-1 whitespace-pre-wrap">{e.titulo}</p>
        ) : (
          <div className="mt-1 space-y-1.5">
            <textarea rows={3} value={editando} onChange={ev => onCambiar(ev.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#E11D48] resize-none" />
            {error && <p className="text-[11px] text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={onConfirmar} className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#18181B] px-3 py-1 rounded-md"><Check className="w-3 h-3" /> Guardar</button>
              <button onClick={onCancelar} className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 px-3 py-1"><X className="w-3 h-3" /> Cancelar</button>
            </div>
          </div>
        )}
        {(e.ediciones?.length ?? 0) > 0 && editando === null && (
          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><HistoryIcon className="w-3 h-3" /> {e.ediciones!.length} edición{e.ediciones!.length !== 1 ? 'es' : ''}</p>
        )}
      </div>
    </div>
  );
}
