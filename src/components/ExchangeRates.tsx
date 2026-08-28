import React from 'react';
import { Calculator } from 'lucide-react';
import ModuloEnDesarrollo from './ui/ModuloEnDesarrollo';

/**
 * Tipo de Cambio.
 *
 * ── Por qué está vacío ─────────────────────────────────────────────────────
 * El cliente reportó: «el tipo de cambio usa valores o criterios distintos a
 * los de la empresa». Al revisarlo, el módulo nunca se conectó a nada:
 *
 *   - Las tasas estaban fijas en el código (USD 17.85, EUR 19.40, CNY 2.45).
 *   - El historial mostraba cinco filas de octubre de 2023 —tres años viejas—
 *     etiquetadas «DOF / Banxico» y «Sistema (Auto)», como si fueran reales.
 *   - El interruptor de «actualización automática» no actualizaba nada.
 *   - El convertidor multiplicaba por esas tasas fijas, así que devolvía
 *     números equivocados con toda naturalidad.
 *
 * No tenía criterios distintos a los de la empresa: no tenía criterio alguno.
 * Se deja en estado honesto hasta definir la fuente con el cliente, porque de
 * esa decisión depende todo lo demás (§4.8, pendiente nº 4).
 */
export default function ExchangeRates() {
  return (
    <div className="space-y-[32px]">
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Tipo de Cambio</h2>
        <p className="text-[13px] text-text-secondary mt-[4px]">
          Gestión multi-moneda (USD, EUR, CNY a MXN) para cotizaciones y facturación CFDI.
        </p>
      </div>

      <ModuloEnDesarrollo
        icono={<Calculator className="w-[32px] h-[32px]" />}
        descripcion="Este módulo mostraba tasas fijas escritas en el código y un historial de octubre de 2023. Se retiró para no seguir mostrando cifras que parecen reales. Mientras tanto, el tipo de cambio se captura a mano en cada cotización."
        pendiente="qué fuente de tipo de cambio usa Vermur y con qué criterio se aplica. Propuesta: el FIX del DOF publicado el día hábil anterior a la operación, que es el que exige el SAT para CFDI, tomado de la API del SIE de Banxico. Falta confirmar si Pricing cotiza con esa misma tasa o le carga un diferencial."
      />
    </div>
  );
}
