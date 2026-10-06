/**
 * Dialogos.tsx — tarea 87
 *
 * Reemplazo de `window.alert`, `window.confirm` y `window.prompt`. Misma
 * forma que los nativos —se pide y se espera la respuesta— pero con modal de
 * la plataforma:
 *
 *   if (await confirmar({ mensaje: '…' })) …
 *   await avisar('…')
 *   const motivo = await pedirTexto({ titulo: '…', obligatorio: true })
 *
 * Es un módulo con un `<DialogosHost />` montado una vez en App: así también
 * lo pueden llamar funciones que no son componentes, como hacía el nativo.
 * Si el host no está montado (un test unitario), se cae al nativo en vez de
 * quedarse esperando una respuesta que nunca llega.
 */

import { useEffect, useState } from 'react';

type Peticion =
  | { id: number; tipo: 'aviso'; titulo?: string; mensaje: string; resolver: () => void }
  | { id: number; tipo: 'confirmar'; titulo?: string; mensaje: string; confirmar: string; peligro: boolean; resolver: (ok: boolean) => void }
  | { id: number; tipo: 'texto'; titulo: string; mensaje?: string; confirmar: string; obligatorio: boolean; valorInicial: string; multilinea: boolean; resolver: (v: string | null) => void };

type SinId<T> = T extends unknown ? Omit<T, 'id'> : never;

let contador = 0;
let cola: Peticion[] = [];
let escuchas: Array<() => void> = [];

const notificar = () => escuchas.forEach(f => f());
const hayHost = () => escuchas.length > 0;

function encolar(p: SinId<Peticion>) {
  cola = [...cola, { ...p, id: ++contador } as Peticion];
  notificar();
}

export function avisar(mensaje: string, titulo?: string): Promise<void> {
  if (!hayHost()) { window.alert(mensaje); return Promise.resolve(); }
  return new Promise<void>(resolver => encolar({ tipo: 'aviso', titulo, mensaje, resolver }));
}

export function confirmar(o: { mensaje: string; titulo?: string; confirmar?: string; peligro?: boolean }): Promise<boolean> {
  if (!hayHost()) return Promise.resolve(window.confirm(o.mensaje));
  return new Promise<boolean>(resolver => encolar({
    tipo: 'confirmar', titulo: o.titulo, mensaje: o.mensaje,
    confirmar: o.confirmar ?? 'Aceptar', peligro: o.peligro ?? false, resolver,
  }));
}

/** Devuelve el texto recortado, o `null` si se canceló. */
export function pedirTexto(o: {
  titulo: string; mensaje?: string; confirmar?: string; obligatorio?: boolean; valorInicial?: string; multilinea?: boolean;
}): Promise<string | null> {
  if (!hayHost()) return Promise.resolve(window.prompt(o.titulo, o.valorInicial ?? '')?.trim() ?? null);
  return new Promise<string | null>(resolver => encolar({
    tipo: 'texto', titulo: o.titulo, mensaje: o.mensaje, confirmar: o.confirmar ?? 'Aceptar',
    obligatorio: o.obligatorio ?? false, valorInicial: o.valorInicial ?? '', multilinea: o.multilinea ?? false, resolver,
  }));
}

export function DialogosHost() {
  const [, forzar] = useState(0);
  useEffect(() => {
    const f = () => forzar(n => n + 1);
    escuchas.push(f);
    return () => { escuchas = escuchas.filter(x => x !== f); };
  }, []);

  const actual = cola[0];
  if (!actual) return null;
  const cerrar = () => { cola = cola.slice(1); notificar(); };
  return <Modal key={actual.id} p={actual} cerrar={cerrar} />;
}

function Modal({ p, cerrar }: { p: Peticion; cerrar: () => void }) {
  const [texto, setTexto] = useState(p.tipo === 'texto' ? p.valorInicial : '');
  const vacio = p.tipo === 'texto' && p.obligatorio && texto.trim() === '';

  const cancelar = () => {
    if (p.tipo === 'confirmar') p.resolver(false);
    else if (p.tipo === 'texto') p.resolver(null);
    else p.resolver();
    cerrar();
  };
  const aceptar = () => {
    if (vacio) return;
    if (p.tipo === 'confirmar') p.resolver(true);
    else if (p.tipo === 'texto') p.resolver(texto.trim());
    else p.resolver();
    cerrar();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const titulo = p.titulo ?? (p.tipo === 'aviso' ? 'Aviso' : 'Confirmar');
  const peligro = p.tipo === 'confirmar' && p.peligro;
  const etiquetaOk = p.tipo === 'aviso' ? 'Entendido' : p.confirmar;

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" data-testid="dialogo" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">{titulo}</h2>
        {p.mensaje && <p className="text-[13px] text-gray-700 whitespace-pre-line">{p.mensaje}</p>}
        {p.tipo === 'texto' && (
          p.multilinea ? (
            <textarea autoFocus rows={3} value={texto} onChange={e => setTexto(e.target.value)} aria-label={titulo}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario" />
          ) : (
            <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} aria-label={titulo}
              onKeyDown={e => { if (e.key === 'Enter') aceptar(); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-primario" />
          )
        )}
        <div className="flex justify-end gap-2 pt-1">
          {p.tipo !== 'aviso' && (
            <button onClick={cancelar} className="text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wider px-3 py-1.5">Cancelar</button>
          )}
          <button
            onClick={aceptar} disabled={vacio} autoFocus={p.tipo !== 'texto'}
            className={`${peligro ? 'bg-peligro' : 'bg-primario'} text-white text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {etiquetaOk}
          </button>
        </div>
      </div>
    </div>
  );
}
