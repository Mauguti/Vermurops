import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Hash, Pencil, Power, X } from 'lucide-react';
import { useContadoresSerie } from '../../hooks/useContadoresSerie';
import { formatFolioSerie } from '../../lib/folioService';
import {
  MAX_DIGITOS, SEPARADORES, ejemploFolio, formatoDeSerie, formatoPersonalizado,
  razonFormatoInvalido, type FormatoFolioSerie,
} from '../../lib/formatoFolioSerie';
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
 *
 * Tarea 66 · Aquí vive también el FORMATO del folio —prefijo, año,
 * separador, dígitos— y el interruptor de la creación automática de embarques,
 * apagado. Las dos cosas estaban en el código y las dos dependen de un dato
 * que Vermur todavía no confirmó: encender dejó de necesitar un deploy.
 *
 * La pestaña entera es solo de admin (`Settings.tsx`), y las dos escrituras
 * vuelven a exigir la capacidad en el hook.
 */

const NOMBRE_SERIE: Record<string, string> = {
  VLIM: 'Importación marítima',
  VLEM: 'Exportación marítima',
  VLIT: 'Importación terrestre',
  VLET: 'Exportación terrestre',
  VLIA: 'Importación aérea',
  VLEA: 'Exportación aérea',
  VL: 'Provisional · tráfico sin definir',
};

export default function ContadoresFolio() {
  const {
    contadores, loading, sembrarContador, guardarFormato,
    embarqueAutomatico, cambiarEmbarqueAutomatico,
  } = useContadoresSerie();
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [toast, setToast] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);
  /** Serie cuyo formato se está editando, y su borrador local. */
  const [editandoFormato, setEditandoFormato] = useState<string | null>(null);
  const [formato, setFormato] = useState<FormatoFolioSerie | null>(null);
  const [cambiandoSwitch, setCambiandoSwitch] = useState(false);

  const anio = new Date().getFullYear();

  const guardar = async (serie: string) => {
    const valor = Number(borradores[serie]);
    if (!Number.isInteger(valor) || valor < 0) {
      setToast({ mensaje: 'El consecutivo debe ser un número entero.', tipo: 'error' });
      return;
    }
    const c = contadores.find(x => x.serie === serie);
    setGuardando(serie);
    try {
      await sembrarContador(serie, valor);
      setBorradores(b => ({ ...b, [serie]: '' }));
      setToast({
        mensaje: `Serie ${serie} fijada en ${valor}. El siguiente folio será ${formatFolioSerie(serie, valor + 1, anio, c?.formato)}.`,
        tipo: 'exito',
      });
    } catch (err) {
      setToast({ mensaje: err instanceof Error ? err.message : String(err), tipo: 'error' });
    } finally {
      setGuardando(null);
    }
  };

  const abrirFormato = (serie: string) => {
    const c = contadores.find(x => x.serie === serie);
    setFormato(formatoDeSerie(serie, c?.formato));
    setEditandoFormato(serie);
  };

  const guardarElFormato = async () => {
    if (!editandoFormato || !formato) return;
    const razon = razonFormatoInvalido(formato);
    if (razon) { setToast({ mensaje: razon, tipo: 'error' }); return; }
    setGuardando(`formato-${editandoFormato}`);
    try {
      await guardarFormato(editandoFormato, formato);
      const c = contadores.find(x => x.serie === editandoFormato);
      setToast({
        mensaje: `Formato de ${editandoFormato} guardado. El siguiente folio será ${ejemploFolio(editandoFormato, c?.ultimo ?? 0, anio, formato)}.`,
        tipo: 'exito',
      });
      setEditandoFormato(null);
      setFormato(null);
    } catch (err) {
      setToast({ mensaje: err instanceof Error ? err.message : String(err), tipo: 'error' });
    } finally {
      setGuardando(null);
    }
  };

  const moverSwitch = async (activo: boolean) => {
    setCambiandoSwitch(true);
    try {
      await cambiarEmbarqueAutomatico(activo);
      setToast({
        mensaje: activo
          ? 'Creación automática ENCENDIDA. A partir de ahora, marcar una cotización como ganada abre su embarque y emite su folio.'
          : 'Creación automática apagada. El embarque se abre a mano desde Embarques.',
        tipo: activo ? 'error' : 'exito',
      });
    } catch (err) {
      setToast({ mensaje: err instanceof Error ? err.message : String(err), tipo: 'error' });
    } finally {
      setCambiandoSwitch(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-[40px]">
        <div className="w-6 h-6 border-4 border-primario/30 border-t-primario rounded-full animate-spin" />
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
        Cada serie de embarque lleva su propio consecutivo y su propio formato. Fija aquí el
        último folio usado en Magaya para que el sistema continúe la serie en vez de reiniciarla.
      </p>

      {/* ── El interruptor (tarea 66) ─────────────────────────────────────── */}
      <div
        className="mb-[24px] px-[16px] py-[14px] rounded-[10px] border bg-white border-card-border"
        data-testid="interruptor-embarque-automatico"
      >
        <div className="flex items-start justify-between gap-[16px] flex-wrap">
          <div className="max-w-[560px]">
            <div className="flex items-center gap-[8px] mb-[4px]">
              <Power className={`w-[16px] h-[16px] ${embarqueAutomatico.activo ? 'text-peligro' : 'text-text-muted'}`} />
              <h4 className="text-[14px] font-semibold text-text-primary">
                Creación automática de embarques
              </h4>
              <span
                className={`px-[8px] py-[2px] rounded-full text-[11px] font-medium ${
                  embarqueAutomatico.activo
                    ? 'bg-peligro/10 text-peligro'
                    : 'bg-canvas text-text-muted border border-divider'
                }`}
              >
                {embarqueAutomatico.activo ? 'Encendida' : 'Apagada'}
              </span>
            </div>
            <p className="text-[12px] text-text-secondary leading-snug">
              Encendida, marcar una cotización como <strong>ganada</strong> abre su embarque solo
              y <strong>emite su folio</strong>. Apagada —como está hoy— el embarque se abre a mano
              desde Embarques, eligiendo la serie.
            </p>
            <p className="text-[12px] text-text-muted leading-snug mt-[6px]">
              Antes de encenderla: el formato del folio confirmado con Vermur y el consecutivo de
              cada serie sembrado. Un folio emitido va impreso en el BL y en el pedimento, y no se
              puede recoger.
            </p>
            {embarqueAutomatico.fecha && (
              <p className="text-[11px] text-text-muted mt-[6px]">
                Último cambio: {embarqueAutomatico.fecha.slice(0, 10)}
                {embarqueAutomatico.por ? ` por ${embarqueAutomatico.por}` : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => moverSwitch(!embarqueAutomatico.activo)}
            disabled={cambiandoSwitch}
            className={`px-[14px] py-[8px] text-[12px] font-medium rounded-[6px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 ${
              embarqueAutomatico.activo
                ? 'border border-card-border text-text-primary hover:bg-canvas'
                : 'bg-primario text-white hover:bg-primario-hover'
            }`}
          >
            {cambiandoSwitch
              ? 'Guardando…'
              : embarqueAutomatico.activo ? 'Apagar' : 'Encender'}
          </button>
        </div>
      </div>

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
                <td className="px-[16px] py-[12px] whitespace-nowrap">
                  <div className="flex items-center gap-[8px]">
                    <span className="font-mono text-text-secondary">
                      {ejemploFolio(c.serie, c.ultimo, anio, c.formato)}
                    </span>
                    <button
                      onClick={() => abrirFormato(c.serie)}
                      title="Cambiar el formato del folio de esta serie"
                      className="flex items-center gap-[4px] px-[6px] py-[3px] text-[11px] rounded-[5px] border border-card-border text-text-secondary hover:bg-canvas transition-colors"
                    >
                      <Pencil className="w-[11px] h-[11px]" /> Formato
                    </button>
                  </div>
                  {formatoPersonalizado(c.serie, c.formato) && (
                    <span className="text-[11px] text-primario">formato propio</span>
                  )}
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
                        aria-label={`Último consecutivo de la serie ${c.serie}`}
                        className="w-[110px] pl-[26px] pr-[8px] py-[6px] text-[13px] tabular-nums border border-card-border rounded-[6px] focus:outline-none focus:border-primario focus:ring-1 focus:ring-primario"
                      />
                    </div>
                    <button
                      onClick={() => guardar(c.serie)}
                      disabled={guardando === c.serie || (borradores[c.serie] ?? '') === ''}
                      className="px-[12px] py-[6px] text-[12px] font-medium rounded-[6px] bg-primario text-white hover:bg-primario-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
        <span className="font-mono">{formatFolioSerie('VLIT', 108, anio, contadores.find(c => c.serie === 'VLIT')?.formato)}</span>.
        El consecutivo <strong>no se reinicia en enero</strong>: cambia el año del folio y el
        número sigue.
      </p>

      {/* ── Editor del formato ────────────────────────────────────────────── */}
      {editandoFormato && formato && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-[16px]">
          <div className="bg-white rounded-[12px] w-full max-w-[520px] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-[20px] py-[14px] border-b border-divider">
              <h4 className="text-[15px] font-semibold text-text-primary">
                Formato del folio · <span className="font-mono">{editandoFormato}</span>
              </h4>
              <button
                onClick={() => { setEditandoFormato(null); setFormato(null); }}
                aria-label="Cerrar"
                className="text-text-muted hover:text-text-primary"
              >
                <X className="w-[18px] h-[18px]" />
              </button>
            </div>

            <div className="px-[20px] py-[16px]">
              <div className="mb-[16px] px-[14px] py-[12px] rounded-[8px] bg-canvas border border-divider text-center">
                <p className="text-[11px] uppercase tracking-[0.05em] text-text-muted mb-[4px]">
                  Siguiente folio de esta serie
                </p>
                <p className="text-[22px] font-mono font-semibold text-text-primary">
                  {ejemploFolio(editandoFormato, contadores.find(c => c.serie === editandoFormato)?.ultimo ?? 0, anio, formato)}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
                <label className="block">
                  <span className="block text-[12px] font-medium text-text-secondary mb-[4px]">
                    Prefijo
                  </span>
                  <input
                    value={formato.prefijo}
                    onChange={e => setFormato(f => f && { ...f, prefijo: e.target.value.toUpperCase() })}
                    className="w-full px-[10px] py-[7px] text-[13px] font-mono border border-card-border rounded-[6px] focus:outline-none focus:border-primario focus:ring-1 focus:ring-primario"
                  />
                  <span className="block text-[11px] text-text-muted mt-[3px]">
                    Lo que se imprime. La serie sigue siendo {editandoFormato}.
                  </span>
                </label>

                <label className="block">
                  <span className="block text-[12px] font-medium text-text-secondary mb-[4px]">
                    Separador
                  </span>
                  <select
                    value={formato.separador}
                    onChange={e => setFormato(f => f && { ...f, separador: e.target.value })}
                    className="w-full px-[10px] py-[7px] text-[13px] border border-card-border rounded-[6px] focus:outline-none focus:border-primario focus:ring-1 focus:ring-primario"
                  >
                    {SEPARADORES.map(s => (
                      <option key={s.valor} value={s.valor}>{s.etiqueta}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[12px] font-medium text-text-secondary mb-[4px]">
                    Año
                  </span>
                  <select
                    value={formato.digitosAnio}
                    onChange={e => setFormato(f => f && { ...f, digitosAnio: Number(e.target.value) as 0 | 2 | 4 })}
                    className="w-full px-[10px] py-[7px] text-[13px] border border-card-border rounded-[6px] focus:outline-none focus:border-primario focus:ring-1 focus:ring-primario"
                  >
                    <option value={2}>2 dígitos ({String(anio).slice(-2)})</option>
                    <option value={4}>4 dígitos ({anio})</option>
                    <option value={0}>Sin año</option>
                  </select>
                </label>

                <label className="block">
                  <span className="block text-[12px] font-medium text-text-secondary mb-[4px]">
                    Dígitos del consecutivo
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_DIGITOS}
                    value={formato.digitos}
                    onChange={e => setFormato(f => f && { ...f, digitos: Number(e.target.value) })}
                    className="w-full px-[10px] py-[7px] text-[13px] tabular-nums border border-card-border rounded-[6px] focus:outline-none focus:border-primario focus:ring-1 focus:ring-primario"
                  />
                </label>
              </div>

              <p className="text-[12px] text-text-muted mt-[14px] leading-snug">
                Cambiar el formato <strong>no renumera</strong> los folios ya emitidos: los
                embarques que existen conservan el suyo. Afecta solo a los siguientes, así que un
                cambio a media serie deja dos formatos en el mismo año.
              </p>
            </div>

            <div className="flex items-center justify-end gap-[8px] px-[20px] py-[14px] border-t border-divider">
              <button
                onClick={() => { setEditandoFormato(null); setFormato(null); }}
                className="px-[14px] py-[8px] text-[13px] rounded-[6px] border border-card-border text-text-primary hover:bg-canvas"
              >
                Cancelar
              </button>
              <button
                onClick={guardarElFormato}
                disabled={guardando === `formato-${editandoFormato}`}
                className="px-[14px] py-[8px] text-[13px] font-medium rounded-[6px] bg-primario text-white hover:bg-primario-hover disabled:opacity-40"
              >
                {guardando === `formato-${editandoFormato}` ? 'Guardando…' : 'Guardar formato'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast mensaje={toast?.mensaje ?? null} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}
