import React from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * La anatomía única de las fichas.
 *
 * ── De dónde sale ──────────────────────────────────────────────────────────
 * `FichaCotizacion` es la ficha modelo: pantalla completa, breadcrumb, título
 * con badges, pestañas y footer con la acción de la etapa. Las demás fichas
 * llegaron después y cada una resolvió el encabezado a su manera —una era
 * drawer, otra abría dentro de una tarjeta, otra no tenía footer— así que la
 * misma operación se veía distinta según por dónde entrabas.
 *
 * Aquí está extraída esa estructura, con el MISMO marcado que la cotización
 * ya usaba. No es un rediseño: es el diseño que ya existía, en un solo lugar.
 *
 *     Breadcrumb          ← Módulo / FOLIO
 *     Título              ← folio · nombre · badges de estado
 *     Pestañas            ← ver → hacer → registrar
 *     Contenido
 *     Footer              ← acción principal de la etapa
 */

// ─── Contenedor ───────────────────────────────────────────────────────────────

export function FichaLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col h-full">{children}</div>;
}

// ─── Encabezado ───────────────────────────────────────────────────────────────

export interface FichaHeaderProps {
  /** Nombre del módulo en el breadcrumb: «Cotizaciones», «Embarques». */
  modulo: string;
  /** Vuelve a la lista del módulo. */
  onBack: () => void;
  /** Folio o identificador. Segundo tramo del breadcrumb. */
  folio: string;
  /**
   * Nombre grande: la empresa, el cliente, el proveedor.
   *
   * Acepta un nodo para las fichas cuyo nombre se edita en el encabezado (el
   * prospecto). Un string se envuelve en el h2 con el estilo de siempre.
   */
  titulo: React.ReactNode;
  /** Badges de estado. Usa `<BadgeEstado>` para que el color sea el mismo. */
  badges?: React.ReactNode;
  /** Una línea bajo el título: el total, la ruta, lo que identifique la ficha. */
  subtitulo?: React.ReactNode;
  /** Acciones a la derecha del encabezado. */
  acciones?: React.ReactNode;
}

export function FichaHeader({
  modulo, onBack, folio, titulo, badges, subtitulo, acciones,
}: FichaHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0 gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-1">
          <button onClick={onBack} className="hover:text-[#18181B] transition-colors">
            {modulo}
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-[#18181B] font-medium">{folio}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {typeof titulo === 'string' ? (
            <h2 className="text-xl font-bold text-[#18181B] tracking-tight truncate">
              {titulo}
            </h2>
          ) : titulo}
          {badges}
        </div>
        {subtitulo && (
          <div className="text-sm mt-0.5">{subtitulo}</div>
        )}
      </div>
      {acciones && <div className="flex items-center gap-2 shrink-0">{acciones}</div>}
    </div>
  );
}

// ─── Badges de estado ─────────────────────────────────────────────────────────

/**
 * Criterio único de color, para que un badge signifique lo mismo en toda la app.
 *
 *   exito    → terminó bien: ganada, pagada, timbrada, cerrado
 *   peligro  → terminó mal o requiere atención: perdida, rechazada, vencida
 *   activo   → en curso, es lo que se está trabajando (color de marca)
 *   espera   → depende de alguien más: por autorizar, por timbrar
 *   neutro   → informativo, sin carga: la vista activa, una etiqueta
 */
export type TonoBadge = 'exito' | 'peligro' | 'activo' | 'espera' | 'neutro';

const TONO: Record<TonoBadge, string> = {
  exito:   'bg-green-100 text-green-800',
  peligro: 'bg-red-100 text-red-800',
  activo:  'bg-[#E11D48]/10 text-[#E11D48]',
  espera:  'bg-amber-50 text-amber-700 border border-amber-100',
  neutro:  'bg-gray-100 text-gray-600',
};

export function BadgeEstado({
  tono = 'neutro', children, title,
}: { tono?: TonoBadge; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${TONO[tono]}`}
    >
      {children}
    </span>
  );
}

// ─── Pestañas ─────────────────────────────────────────────────────────────────

export interface PestanaFicha<T extends string = string> {
  id: T;
  label: string;
  /** Contador opcional junto al nombre: «Cargos 4». */
  contador?: number;
}

export function FichaTabs<T extends string>({
  pestanas, activa, onCambiar,
}: {
  pestanas: PestanaFicha<T>[];
  activa: T;
  onCambiar: (id: T) => void;
}) {
  return (
    <div className="flex border-b border-gray-100 bg-white shrink-0 overflow-x-auto">
      {pestanas.map(tab => (
        <button
          key={tab.id}
          onClick={() => onCambiar(tab.id)}
          className={`px-6 py-3.5 text-center text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all duration-200 whitespace-nowrap
            ${activa === tab.id
              ? 'border-[#E11D48] text-[#E11D48] bg-[#E11D48]/[0.02]'
              : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50/50'}`}
        >
          {tab.label}
          {tab.contador !== undefined && tab.contador > 0 && (
            <span className="ml-1.5 text-[9px] text-gray-400">{tab.contador}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Cuerpo ───────────────────────────────────────────────────────────────────

/** El área con scroll. Las fichas que necesitan dos columnas no la usan. */
export function FichaContenido({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 overflow-y-auto p-6">{children}</div>;
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function FichaFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex flex-col gap-3 shrink-0">
      {children}
    </div>
  );
}
