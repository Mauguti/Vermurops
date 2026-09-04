/**
 * DetalleCargaSolicitud.tsx (sep-2026)
 *
 * El detalle COMPLETO de lo que se capturó en la solicitud, consultable desde
 * la ficha sin salir de ella. La franja «Lo que pidió el cliente» da el
 * resumen; esto es lo que se abre al expandirla: carga por modalidad, ruta,
 * y el detalle de mercancías — que es lo que Operaciones va a heredar.
 *
 * Solo lectura para todos: la solicitud se editó al capturarse; aquí se
 * consulta. Lo ven ambos roles — no hay costos ni proveedores aquí, es lo
 * que el propio cliente pidió.
 */

import React from 'react';
import type { ServicioSolicitado, CargaSolicitada } from './QuotesData';
import {
  cargaDesdeLegacy, ETIQUETA_CONTENEDOR, ETIQUETA_UNIDAD_TERRESTRE,
} from '../../lib/cargaSolicitud';

const kg = (n: number) => `${n.toLocaleString('en-US')} kg`;

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{etiqueta}</p>
      <p className="text-[12px] text-gray-700 mt-0.5">{children}</p>
    </div>
  );
}

function DatosPorTipo({ carga }: { carga: CargaSolicitada }) {
  switch (carga.tipo) {
    case 'fcl':
      return (
        <>
          <Dato etiqueta="Tipo de carga">FCL · Contenedor completo</Dato>
          <Dato etiqueta="Contenedores">
            {carga.contenedores.filter(c => c.cantidad > 0)
              .map(c => `${c.cantidad}×${ETIQUETA_CONTENEDOR[c.tipoContenedor]}`).join(' + ') || '—'}
          </Dato>
          <Dato etiqueta="Peso bruto total">{carga.pesoBrutoKg > 0 ? kg(carga.pesoBrutoKg) : '—'}</Dato>
          <Dato etiqueta="Refrigeración">
            {carga.refrigeracion.requiere
              ? `Sí${typeof carga.refrigeracion.temperaturaC === 'number' ? ` · ${carga.refrigeracion.temperaturaC}°C` : ''}`
              : 'No'}
          </Dato>
        </>
      );
    case 'lcl':
      return (
        <>
          <Dato etiqueta="Tipo de carga">LCL · Carga consolidada</Dato>
          <Dato etiqueta="Peso bruto">{carga.pesoBrutoKg > 0 ? kg(carga.pesoBrutoKg) : '—'}</Dato>
          <Dato etiqueta="Volumen">{carga.volumenM3 > 0 ? `${carga.volumenM3} m³` : '—'}</Dato>
          <Dato etiqueta="Piezas / bultos">{carga.piezas || '—'}</Dato>
          <Dato etiqueta="¿Estibable?">{carga.estibable ? 'Sí' : 'No'}</Dato>
          {carga.bultos.length > 0 && (
            <Dato etiqueta="Dimensiones (cm)">
              {carga.bultos.map(b => `${b.largoCm}×${b.anchoCm}×${b.altoCm}`).join(' · ')}
            </Dato>
          )}
        </>
      );
    case 'aereo':
      return (
        <>
          <Dato etiqueta="Peso bruto">{carga.pesoBrutoKg > 0 ? kg(carga.pesoBrutoKg) : '—'}</Dato>
          <Dato etiqueta="Peso volumétrico">{carga.pesoVolumetricoKg > 0 ? kg(carga.pesoVolumetricoKg) : '—'}</Dato>
          <Dato etiqueta="Piezas">{carga.piezas || '—'}</Dato>
          {carga.bultos.length > 0 && (
            <Dato etiqueta="Dimensiones (cm)">
              {carga.bultos.map(b => `${b.largoCm}×${b.anchoCm}×${b.altoCm}`).join(' · ')}
            </Dato>
          )}
        </>
      );
    case 'terrestre':
      return (
        <>
          <Dato etiqueta="Tipo de unidad">{ETIQUETA_UNIDAD_TERRESTRE[carga.tipoUnidad]}</Dato>
          <Dato etiqueta="Peso">{carga.pesoBrutoKg > 0 ? kg(carga.pesoBrutoKg) : '—'}</Dato>
          <Dato etiqueta="Piezas">{carga.piezas || '—'}</Dato>
          <Dato etiqueta="Maniobras de carga/descarga">{carga.requiereManiobras ? 'Sí' : 'No'}</Dato>
        </>
      );
    case 'despacho':
      return (
        <>
          <Dato etiqueta="Aduana">{carga.aduana || '—'}</Dato>
          <Dato etiqueta="Operación">{carga.operacion === 'importacion' ? 'Importación' : 'Exportación'}</Dato>
          <Dato etiqueta="Fracciones arancelarias">
            {carga.fraccionesArancelarias.filter(f => f.trim()).join(', ') || '—'}
          </Dato>
          <Dato etiqueta="Valor de la mercancía">
            {carga.valorMercancia.monto > 0
              ? `${carga.valorMercancia.moneda} ${carga.valorMercancia.monto.toLocaleString('en-US')}`
              : '—'}
          </Dato>
          <Dato etiqueta="Previo">{carga.requierePrevio ? 'Sí' : 'No'}</Dato>
          <Dato etiqueta="NOM / regulación">{carga.requiereNOM ? 'Sí' : 'No'}</Dato>
        </>
      );
  }
}

export default function DetalleCargaSolicitud({ servicio }: { servicio: ServicioSolicitado }) {
  const carga = cargaDesdeLegacy(servicio);
  if (!carga) return null;

  const peligrosa = 'peligrosa' in carga ? carga.peligrosa : null;
  const mercancias = carga.mercancias ?? [];

  return (
    <div className="mt-2 mb-1 border border-gray-100 bg-white rounded-lg px-4 py-3 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
        <DatosPorTipo carga={carga} />
        {servicio.ruta?.origen && servicio.ruta.origen !== 'Por definir' && (
          <Dato etiqueta={carga.tipo === 'despacho' ? 'Referencia' : 'Ruta'}>
            {servicio.ruta.origen} → {servicio.ruta.destino}
          </Dato>
        )}
        {servicio.incoterm && carga.tipo !== 'terrestre' && carga.tipo !== 'despacho' && (
          <Dato etiqueta="Incoterm">{servicio.incoterm}</Dato>
        )}
        {peligrosa?.esPeligrosa && (
          <Dato etiqueta="Mercancía peligrosa">
            <span className="text-amber-700 font-semibold">
              Clase IMO {peligrosa.claseIMO ?? '?'} · {peligrosa.numeroUN ?? 'UN ?'}
            </span>
          </Dato>
        )}
        {servicio.mercancia && servicio.mercancia !== 'Por definir' && (
          <Dato etiqueta="Descripción general">{servicio.mercancia}</Dato>
        )}
      </div>

      {/* El detalle de mercancías: lo que Operaciones hereda al embarque. */}
      {mercancias.length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Detalle de mercancía — se hereda al embarque
          </p>
          <table className="w-full text-left border border-gray-100 rounded overflow-hidden">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase">Producto</th>
                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase">Fracción</th>
                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase text-right">Piezas</th>
                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase text-right">Peso</th>
                <th className="px-3 py-1.5 text-[9px] font-bold text-gray-400 uppercase text-right">Valor unit.</th>
              </tr>
            </thead>
            <tbody>
              {mercancias.map(m => (
                <tr key={m.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-3 py-1.5 text-[11px] text-gray-700">{m.descripcion}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-500 font-mono">{m.fraccionArancelaria || '—'}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-700 text-right tabular-nums">{m.piezas ?? '—'}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-700 text-right tabular-nums">{m.pesoKg ? kg(m.pesoKg) : '—'}</td>
                  <td className="px-3 py-1.5 text-[11px] text-gray-700 text-right tabular-nums">
                    {m.valorUnitario ? `${m.moneda ?? ''} ${m.valorUnitario.toLocaleString('en-US')}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
