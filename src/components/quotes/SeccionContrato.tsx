/**
 * SeccionContrato.tsx (tarea 102)
 *
 * El contrato de la cotización ganada: archivo + casilla «Firmado por el
 * cliente». «Generar contrato» queda deshabilitado: Vermur no ha dado su
 * plantilla y no se inventa texto legal. No bloquea nada; solo avisa.
 */
import { useEffect, useRef, useState } from 'react';
import { ref, getDownloadURL } from 'firebase/storage';
import { FileSignature, Upload, AlertTriangle } from 'lucide-react';
import { storage } from '../../firebase';
import { useAuth } from '../../auth/AuthContext';
import { UserRole } from '../../auth/users';
import type { KanbanQuote } from './QuotesData';
import { useContratoCotizacion, puedeManejarContrato } from '../../hooks/useContratoCotizacion';
import { avisoContrato, LEYENDA_SIN_PLANTILLA } from '../../lib/contratoCotizacion';

/** Aviso ámbar compartido por la ficha de la cotización y la del embarque. */
export function AvisoSinContrato({ quote }: { quote: Pick<KanbanQuote, 'etapa' | 'contrato'> }) {
  const texto = avisoContrato(quote);
  if (!texto) return null;
  return (
    <div data-testid="aviso-sin-contrato"
      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0" /> {texto}
    </div>
  );
}

export default function SeccionContrato({ quote, onUpdateQuote }: { quote: KanbanQuote; onUpdateQuote: (q: KanbanQuote) => void }) {
  const { user } = useAuth();
  const { trabajando, subir, marcarFirmado } = useContratoCotizacion(onUpdateQuote);
  const [firmadoAlSubir, setFirmadoAlSubir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const puede = puedeManejarContrato(user?.rol as UserRole | undefined);
  const contrato = quote.contrato ?? null;

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    if (contrato?.storagePath) {
      getDownloadURL(ref(storage, contrato.storagePath)).then(u => { if (vivo) setUrl(u); }).catch(() => {});
    }
    return () => { vivo = false; };
  }, [contrato?.storagePath]);

  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setError(null);
    try { await subir(quote, archivo, contrato ? contrato.firmado : firmadoAlSubir); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <section data-testid="seccion-contrato" className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-3">
      <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-3 flex items-center gap-2">
        <FileSignature className="w-4 h-4" /> Contrato
      </h3>
      <AvisoSinContrato quote={quote} />

      {contrato ? (
        <div className="text-[12px] text-gray-600">
          {url
            ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono font-semibold text-primario hover:underline">{contrato.nombreArchivo}</a>
            : <span className="font-mono font-semibold">{contrato.nombreArchivo}</span>}
          <span className="text-gray-400"> · {contrato.subidoPor} · {contrato.subidoEn.slice(0, 16).replace('T', ' ')}</span>
        </div>
      ) : (
        <p className="text-[12px] text-gray-500">Todavía no se ha subido el contrato.</p>
      )}

      {puede ? (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-700">
            <input type="checkbox" data-testid="contrato-firmado" disabled={trabajando}
              checked={contrato ? contrato.firmado : firmadoAlSubir}
              onChange={e => {
                setError(null);
                if (contrato) marcarFirmado(quote, e.target.checked).catch(err => setError(err instanceof Error ? err.message : String(err)));
                else setFirmadoAlSubir(e.target.checked);
              }} />
            Firmado por el cliente
          </label>
          <input ref={input} type="file" data-testid="contrato-archivo" className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/*" onChange={alElegir} />
          <button type="button" disabled={trabajando} onClick={() => input.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Upload className="w-4 h-4" /> {trabajando ? 'Subiendo…' : contrato ? 'Reemplazar contrato' : 'Subir contrato'}
          </button>
          <button type="button" disabled title={LEYENDA_SIN_PLANTILLA}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold text-gray-400 cursor-not-allowed">
            Generar contrato
          </button>
          <span className="text-[11px] text-gray-400">{LEYENDA_SIN_PLANTILLA}</span>
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">Tu rol solo consulta el contrato.</p>
      )}
      {contrato && <p className="text-[11px] text-gray-400">Al reemplazar, la versión anterior queda en Historial / Notas y su archivo se conserva.</p>}
      {error && <p role="alert" className="text-[11px] font-semibold text-red-600">{error}</p>}
    </section>
  );
}
