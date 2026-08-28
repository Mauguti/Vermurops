import React from 'react';
import { BarChart2 } from 'lucide-react';
import ModuloEnDesarrollo from './ui/ModuloEnDesarrollo';

/**
 * Reportes y BI.
 *
 * ── Por qué está vacío ─────────────────────────────────────────────────────
 * El cliente fue directo: «los reportes sugeridos en el dashboard no se usan;
 * deben estar los que hoy se generan a mano» (§4.8).
 *
 * Lo que había eran cinco KPIs con cifras inventadas —$1.24M de ingresos,
 * +12.5% contra el periodo anterior— y un rango de fechas fijo en «Octubre
 * 2023 - Actual». Nada de eso salía de datos reales, y los botones de Filtros
 * y Exportar no hacían nada.
 *
 * Construir los reportes correctos requiere saber cuáles son. Se deja el
 * módulo en estado honesto hasta levantar con Vermur qué sacan hoy a mano.
 */
export default function Reports() {
  return (
    <div className="space-y-[32px]">
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Reportes y BI</h2>
        <p className="text-[13px] text-text-secondary mt-[4px]">
          Indicadores clave y análisis de rentabilidad operativa.
        </p>
      </div>

      <ModuloEnDesarrollo
        icono={<BarChart2 className="w-[32px] h-[32px]" />}
        descripcion="Los reportes que había aquí eran de ejemplo, con cifras fijas y un periodo fechado en 2023. Se retiraron para no confundirlos con datos reales."
        pendiente="qué reportes genera Vermur hoy a mano y con qué periodicidad: quién los pide, en qué formato salen y qué decisión se toma con cada uno. Sobre esa lista se construyen los de verdad."
      />
    </div>
  );
}
