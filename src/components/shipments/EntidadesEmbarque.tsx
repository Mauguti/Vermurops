import React from 'react';
import { Building2, UserCheck, Shield, Users, Landmark, Anchor } from 'lucide-react';
import { EmbarqueEntidades } from './EmbarquesData';

interface EntidadesEmbarqueProps {
  entidades: EmbarqueEntidades;
  onChangeEntidades: (entidades: EmbarqueEntidades) => void;
  isReadOnly?: boolean;
}

export default function EntidadesEmbarque({
  entidades,
  onChangeEntidades,
  isReadOnly = false
}: EntidadesEmbarqueProps) {

  const handleChange = (key: keyof EmbarqueEntidades, value: string) => {
    onChangeEntidades({
      ...entidades,
      [key]: value
    });
  };

  const fields: { key: keyof EmbarqueEntidades; label: string; icon: React.ReactNode; placeholder: string; desc: string }[] = [
    {
      key: 'expedidor',
      label: 'Expedidor (Shipper)',
      icon: <Building2 className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Shanghai Textiles Ltd.',
      desc: 'Quien envía la carga en origen'
    },
    {
      key: 'consignatario',
      label: 'Consignatario (Consignee)',
      icon: <Building2 className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Alfa Corporativo S.A.',
      desc: 'Destinatario legal de la mercancía'
    },
    {
      key: 'notificar',
      label: 'Notificar a (Notify Party)',
      icon: <UserCheck className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Roberto Jiménez (Alfa Corp)',
      desc: 'Contacto a avisar sobre arribos'
    },
    {
      key: 'agenteAduanal',
      label: 'Agente Aduanal (Customs Broker)',
      icon: <Landmark className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Agencia Aduanal Torres S.C.',
      desc: 'Responsable del despacho aduanero'
    },
    {
      key: 'agenteCarga',
      label: 'Agente de Carga (Freight Forwarder)',
      icon: <Anchor className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Vermur Logistics S.A.',
      desc: 'Coordinador del flete internacional'
    },
    {
      key: 'agenteDestino',
      label: 'Agente de Destino',
      icon: <Users className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Vermur Logistics Lázaro Cárdenas',
      desc: 'Corresponsal receptor en destino'
    },
    {
      key: 'importador',
      label: 'Importador de Registro',
      icon: <Shield className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Alfa Corporativo S.A. de C.V.',
      desc: 'Titular de la importación ante SAT'
    },
    {
      key: 'clienteCobrar',
      label: 'Cliente a Cobrar (Billing Party)',
      icon: <Building2 className="w-4 h-4 text-gray-400" />,
      placeholder: 'Ej. Alfa Corporativo S.A.',
      desc: 'Entidad comercial a la que se factura'
    }
  ];

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs">
      <div className="border-b border-gray-100 pb-3 mb-6">
        <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
          Entidades y Roles Involucrados
        </h3>
        <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wide">
          Define los contactos, expedidores, importadores y agentes del embarque.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
        {fields.map(field => (
          <div key={field.key} className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
              {field.icon}
              {field.label}
            </label>
            {isReadOnly ? (
              <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 select-all">
                {entidades[field.key] || '—'}
              </div>
            ) : (
              <input
                type="text"
                value={entidades[field.key] || ''}
                onChange={e => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 placeholder-gray-300 outline-none shadow-2xs"
              />
            )}
            <p className="text-[9px] text-gray-400 font-semibold italic">
              {field.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
