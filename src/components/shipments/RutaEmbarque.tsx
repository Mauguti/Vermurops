import React from 'react';
import { MapPin, Navigation, Landmark } from 'lucide-react';
import { EmbarqueRuta, EntidadesRef } from './EmbarquesData';
import type { ClienteVermur } from '../clientes/ClientesData';
import type { ProveedorVermur } from '../proveedores/ProveedoresData';
import { CampoEntidad } from './EntidadesEmbarque';
import {
  pedimentosDe, renglonesPedimento, guardarPedimentos,
} from '../../lib/pedimentosEmbarque';

interface RutaEmbarqueProps {
  ruta: EmbarqueRuta;
  onChangeRuta: (ruta: EmbarqueRuta) => void;
  isReadOnly?: boolean;
  /**
   * El transportista principal (la naviera, la aerolínea) se queda en
   * `ruta.origen.transportista`, pero se elige del catálogo y enlaza a su
   * ficha como cualquier otra entidad. Sin estos props, es texto como antes.
   */
  refs?: EntidadesRef;
  onChangeRefs?: (refs: EntidadesRef) => void;
  proveedores?: ProveedorVermur[];
  clientes?: ClienteVermur[];
  modalidad?: string;
}

export default function RutaEmbarque({
  ruta,
  onChangeRuta,
  isReadOnly = false,
  refs, onChangeRefs, proveedores, clientes, modalidad,
}: RutaEmbarqueProps) {

  const handleOrigenChange = (key: keyof EmbarqueRuta['origen'], value: string) => {
    onChangeRuta({
      ...ruta,
      origen: {
        ...ruta.origen,
        [key]: value
      }
    });
  };

  const handleDestinoChange = (key: keyof EmbarqueRuta['destino'], value: string) => {
    onChangeRuta({
      ...ruta,
      destino: {
        ...ruta.destino,
        [key]: value
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Origen */}
        <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <MapPin className="w-4 h-4 text-sky-500" />
            <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
              Origen de la Ruta
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Puerto de Carga / Punto de Partida</label>
              {isReadOnly ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.puertoCarga || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={ruta.origen.puertoCarga || ''}
                  onChange={e => handleOrigenChange('puertoCarga', e.target.value)}
                  placeholder="Ej. Shanghai (CNSHA), CHN"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                />
              )}
            </div>

            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Transportista Principal (Carrier)</label>
              {onChangeRefs && proveedores ? (
                <CampoEntidad
                  rol="transportista"
                  nombre={ruta.origen.transportista || ''}
                  refs={refs}
                  clientes={clientes ?? []}
                  proveedores={proveedores}
                  modalidad={modalidad}
                  isReadOnly={isReadOnly}
                  onChange={(nombre, nuevosRefs) => {
                    handleOrigenChange('transportista', nombre);
                    onChangeRefs(nuevosRefs);
                  }}
                />
              ) : isReadOnly ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.transportista || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={ruta.origen.transportista || ''}
                  onChange={e => handleOrigenChange('transportista', e.target.value)}
                  placeholder="Ej. Maersk Line / Lufthansa Cargo"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Buque (Vessel)</label>
                {isReadOnly ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.buque || '—'}</div>
                ) : (
                  <input
                    type="text"
                    value={ruta.origen.buque || ''}
                    onChange={e => handleOrigenChange('buque', e.target.value)}
                    placeholder="Ej. Maersk Mc-Kinney"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                  />
                )}
              </div>

              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Bandera</label>
                {isReadOnly ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.bandera || '—'}</div>
                ) : (
                  <input
                    type="text"
                    value={ruta.origen.bandera || ''}
                    onChange={e => handleOrigenChange('bandera', e.target.value)}
                    placeholder="Ej. Dinamarca"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Viaje (Voyage ID / Trip)</label>
              {isReadOnly ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.viaje || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={ruta.origen.viaje || ''}
                  onChange={e => handleOrigenChange('viaje', e.target.value)}
                  placeholder="Ej. 2604E / Vuelo LH8221 / Weekly Truck"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs font-mono"
                />
              )}
            </div>
          </div>

          {/* ── Sección Terrestre / INLAND (Magaya) ────────────────── */}
          <div className="pt-3 mt-1 border-t border-amber-100 space-y-3">
            <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />
              Datos exclusivos de embarque terrestre / INLAND
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tipo de Servicio</label>
                {isReadOnly ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.tipoServicio || '—'}</div>
                ) : (
                  <input
                    type="text"
                    value={ruta.origen.tipoServicio || ''}
                    onChange={e => handleOrigenChange('tipoServicio', e.target.value)}
                    placeholder="Ej. Puerto a Puerto"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                  />
                )}
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Modo de Transportación</label>
                {isReadOnly ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.modoTransportacion || '—'}</div>
                ) : (
                  <input
                    type="text"
                    value={ruta.origen.modoTransportacion || ''}
                    onChange={e => handleOrigenChange('modoTransportacion', e.target.value)}
                    placeholder="Ej. Road, Other"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                  />
                )}
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">No. de Vehículo / Unidad</label>
                {isReadOnly ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.numeroVehiculo || '—'}</div>
                ) : (
                  <input
                    type="text"
                    value={ruta.origen.numeroVehiculo || ''}
                    onChange={e => handleOrigenChange('numeroVehiculo', e.target.value)}
                    placeholder="Ej. 283901"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs font-mono"
                  />
                )}
              </div>
              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Chofer / Operador</label>
                {isReadOnly ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.origen.nombreChofer || '—'}</div>
                ) : (
                  <input
                    type="text"
                    value={ruta.origen.nombreChofer || ''}
                    onChange={e => handleOrigenChange('nombreChofer', e.target.value)}
                    placeholder="Ej. JOSE"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                  />
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Destino */}
        <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
            <Navigation className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
              Destino de la Ruta
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Puerto de Descarga (Port of Discharge)</label>
              {isReadOnly ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.destino.puertoDescarga || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={ruta.destino.puertoDescarga || ''}
                  onChange={e => handleDestinoChange('puertoDescarga', e.target.value)}
                  placeholder="Ej. Manzanillo (MXZLO), MEX"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                />
              )}
            </div>

            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Transportista de Entrega (Última Milla)</label>
              {isReadOnly ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.destino.transportistaEntrega || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={ruta.destino.transportistaEntrega || ''}
                  onChange={e => handleDestinoChange('transportistaEntrega', e.target.value)}
                  placeholder="Ej. Transportes Transmex S.A."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                />
              )}
            </div>

            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Lugar de Entrega Final</label>
              {isReadOnly ? (
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">{ruta.destino.lugarEntrega || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={ruta.destino.lugarEntrega || ''}
                  onChange={e => handleDestinoChange('lugarEntrega', e.target.value)}
                  placeholder="Ej. Almacén Central Alfa Toluca"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
                />
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Aduana Integrada */}
      <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
          <Landmark className="w-4 h-4 text-primario" />
          <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
            Control de Aduana y Despacho
          </h3>
        </div>

        {/*
          Bloque 6 · Varios pedimentos, al menos dos renglones.

          Un embarque puede despacharse en partes —una rectificación, un
          complementario, dos contenedores del mismo BL— y cada parte tiene su
          número. Un solo campo no comunicaba que se podía capturar otro.

          Se quitó «Transacción Dirigida (AES)»: es de Estados Unidos, la
          arrastró Magaya y no aplica a la operación de Vermur. El dato de los
          embarques que ya lo traen no se borra; solo deja de pedirse.
        */}
        <div className="space-y-2">
          <label className="block text-[9px] font-bold text-gray-400 uppercase">
            Números de Pedimento
          </label>

          {isReadOnly ? (
            pedimentosDe(ruta.aduana).length === 0 ? (
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono text-gray-400">—</div>
            ) : (
              pedimentosDe(ruta.aduana).map((p, i) => (
                <div key={i} className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-semibold text-gray-700">
                  {p}
                </div>
              ))
            )
          ) : (
            renglonesPedimento(ruta.aduana).map((valor, i) => (
              <input
                key={i}
                type="text"
                value={valor}
                onChange={e => {
                  const todos = renglonesPedimento(ruta.aduana);
                  todos[i] = e.target.value;
                  onChangeRuta({ ...ruta, aduana: guardarPedimentos(ruta.aduana, todos) });
                }}
                placeholder={i === 0 ? 'Ej. 26-47-3849-6012489' : 'Otro pedimento (opcional)'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono font-semibold text-gray-700 outline-none focus:border-primario shadow-2xs"
              />
            ))
          )}

          <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wide">
            Formato SAT mexicano: AA-AD-PATENTE-AÑOXXXXXX
          </p>
        </div>
      </div>
    </div>
  );
}
