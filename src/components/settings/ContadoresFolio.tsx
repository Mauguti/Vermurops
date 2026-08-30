import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Hash } from 'lucide-react';
import { useContadoresSerie } from '../../hooks/useContadoresSerie';
import { formatFolioSerie } from '../../lib/folioService';
import Toast, { TipoToast } from '../ui/Toast';

/**
 * Consecutivos de folio por serie de embarque.
 *
 * Vermur trae folios históricos de Magaya —VLIT iba en 107, VLIA en 020— y el
 * sistema tiene que continuar esas series, no reiniciarlas. Aquí se fija el
 * último consecutivo usado; a partir de ahí el sistema sigue.
 *
 * Mientras una serie esté sin sembrar, los embarques se generan igual pero
 * nacen con advertencia: no se bloquea la operación por un contador vacío.
 */

const NOMBRE_SERIE: Record<string, string> = {
  VLIM: 'Importación marítima',
  VLEM: 'Exportación marítima',
  VLIT: 'Importación terrestre',
  VLET: 'Exportación terrestre',
  VLIA: 'Importación aérea',
  VLEA: 'Exportación aérea',
};

export default function ContadoresFolio() {
  const { contadores, loading, sembrarContador } = useContadoresSerie();
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [toast, setToast] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);

  const anio = new Date().getFullYear();

  const guardar = async (serie: string) => {
    const valor = Number(borradores[serie]);
    if (!Number.isInteger(valor) || valor < 0) {
      setToast({ mensaje: 'El consecutivo debe ser un número entero.', tipo: 'error' });
      return;
    }
    setGuardando(serie);
    try {
      await sembrarContador(serie, valor);
      setBorradores(b => ({ ...b, [serie]: '' }));
      setToast({
        mensaje: `Serie ${serie} fijada en ${valor}. El siguiente folio será ${formatFolioSerie(serie, valor + 1, anio)}.`,
        tipo: 'exito',
      });
    } catch (err) {
      setToast({ mensaje: err instanceof Error ? err.message : String(err), tipo: 'error' });
    } finally {
      setGuardando(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[40px]">
        <div className="w-6 h-6 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  const sinSembrar = contadores.filter(c => !c.sembrado);

  return (
    <div>
      <h3 className="text-[18px] font-semibold text-text-primary mb-[8px]">
        Consecutivos de folio
      </h3>
      <p className="text-[13px] text-text-secondary mb-[24px] max-w-[640px]">
        Cada serie de embarque lleva su propio consecutivo. Fija aquí el último folio usado en
        Magaya para que el sistema continúe la serie en vez de reiniciarla.
      </p>

      {sinSembrar.length > 0 && (
        <div
          className="flex items-start gap-[10px] mb-[24px] px-[16px] py-[12px] rounded-[8px] border"
          style={{ background: '#FFFBEB', borderColor: '#FDE68A', color: '#B45309' }}
        >
          <AlertTriangle className="w-[18px] h-[18px] shrink-0 mt-[1px]" />
          <p className="text-[13px] leading-snug">
            <strong>{sinSembrar.length} serie{sinSembrar.length !== 1 ? 's' : ''} sin sembrar.</strong>{' '}
            Los embarques se generan igual, pero su folio arranca en 001 y puede duplicar uno
            histórico. Los embarques afectados nacen con una advertencia.
          </p>
        </div>
      )}

      <div className="border border-card-border rounded-[10px] overflow-x-auto bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-canvas text-left">
              <th className="px-[16px] py-[10px] text-[11px] uppercase tracking-[0.05em] font-medium text-text-muted border-b border-divider">Serie</th>
              <th className="px-[16px] py-[10px] text-[11px] uppercase tracking-[0.05em] font-medium text-text-muted border-b border-divider">Último usado</th>
              <th className="px-[16px] py-[10px] text-[11px] uppercase tracking-[0.05em] font-medium text-text-muted border-b border-divider">Siguiente folio</th>
              <th className="px-[16px] py-[10px] text-[11px] uppercase tracking-[0.05em] font-medium text-text-muted border-b border-divider">Fijar consecutivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {contadores.map(c => (
              <tr key={c.serie} className={c.sembrado ? '' : 'bg-warning-bg/20'}>
                <td className="px-[16px] py-[12px] whitespace-nowrap">
                  <div className="flex items-center gap-[8px]">
                    {c.sembrado
                      ? <CheckCircle2 className="w-[14px] h-[14px] text-success-text shrink-0" />
                      : <AlertTriangle className="w-[14px] h-[14px] text-warning-text shrink-0" />}
                    <span className="font-mono font-semibold text-text-primary">{c.serie}</span>
                  </div>
                  <span className="text-[11px] text-text-muted ml-[22px]">{NOMBRE_SERIE[c.serie] ?? ''}</span>
                </td>
                <td className="px-[16px] py-[12px] tabular-nums text-text-primary whitespace-nowrap">
                  {c.ultimo}
                  {!c.sembrado && <span className="text-[11px] text-warning-text ml-[6px]">sin sembrar</span>}
                </td>
                <td className="px-[16px] py-[12px] font-mono text-text-secondary whitespace-nowrap">
                  {formatFolioSerie(c.serie, c.ultimo + 1, anio)}
                </td>
                <td className="px-[16px] py-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <div className="relative">
                      <Hash className="w-[13px] h-[13px] absolute left-[8px] top-1/2 -translate-y-1/2 text-text-muted" />
                      <input
                        type="number"
                        min={0}
                        value={borradores[c.serie] ?? ''}
                        onChange={e => setBorradores(b => ({ ...b, [c.serie]: e.target.value }))}
                        placeholder={String(c.ultimo)}
                        className="w-[110px] pl-[26px] pr-[8px] py-[6px] text-[13px] tabular-nums border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                      />
                    </div>
                    <button
                      onClick={() => guardar(c.serie)}
                      disabled={guardando === c.serie || (borradores[c.serie] ?? '') === ''}
                      className="px-[12px] py-[6px] text-[12px] font-medium rounded-[6px] bg-brand text-white hover:bg-brand-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {guardando === c.serie ? 'Fijando…' : 'Fijar'}
                    </button>
                  </div>
                  {c.sembrado && c.sembradoPor && (
                    <p className="text-[11px] text-text-muted mt-[4px]">
                      Sembrado por {c.sembradoPor}
                      {c.fechaSiembra ? ` el ${c.fechaSiembra.slice(0, 10)}` : ''}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-text-muted mt-[16px] max-w-[640px]">
        El número que se fija es el <strong>último folio ya usado</strong>, no el siguiente.
        Si Magaya va en VLIT-24-107, fija 107 y el próximo embarque terrestre será{' '}
        <span className="font-mono">{formatFolioSerie('VLIT', 108, anio)}</span>.
      </p>

      <Toast mensaje={toast?.mensaje ?? null} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}
