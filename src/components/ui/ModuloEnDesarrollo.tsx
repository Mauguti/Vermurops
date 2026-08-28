import React from 'react';
import { Construction } from 'lucide-react';

/**
 * ModuloEnDesarrollo — estado honesto para lo que todavía no existe.
 *
 * El cliente reportó que «el dashboard de Finanzas no funciona». No estaba
 * roto: mostraba cifras inventadas y tablas estáticas que nunca se conectaron.
 * Un módulo que aparenta funcionar con datos falsos es peor que uno que dice
 * claramente que falta — sobre todo si las cifras son financieras.
 *
 * Mismo lenguaje visual que el placeholder que ya existía en Configuración.
 */

interface Props {
  titulo?: string;
  descripcion: string;
  /** Qué hace falta decidir con el cliente antes de construirlo. */
  pendiente?: string;
  icono?: React.ReactNode;
}

export default function ModuloEnDesarrollo({
  titulo = 'Módulo en desarrollo',
  descripcion,
  pendiente,
  icono,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center p-[60px] border border-dashed border-card-border rounded-[8px] bg-white">
      <div className="text-text-muted mb-[16px]">
        {icono ?? <Construction className="w-[32px] h-[32px]" />}
      </div>
      <p className="text-[14px] font-medium text-text-primary mb-[4px]">{titulo}</p>
      <p className="text-[13px] text-text-secondary text-center max-w-[420px]">{descripcion}</p>
      {pendiente && (
        <p className="text-[12px] text-text-muted text-center max-w-[420px] mt-[12px] pt-[12px] border-t border-divider">
          <span className="font-semibold">Pendiente por definir:</span> {pendiente}
        </p>
      )}
    </div>
  );
}
