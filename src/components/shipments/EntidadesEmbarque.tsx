import React from 'react';
import { Building2, UserCheck, Shield, Users, Landmark, Anchor, AlertCircle, X } from 'lucide-react';
import { EmbarqueEntidades, EntidadesRef, RolEnlazable } from './EmbarquesData';
import type { ClienteVermur } from '../clientes/ClientesData';
import type { ProveedorVermur } from '../proveedores/ProveedoresData';
import SelectorCliente from '../clientes/SelectorCliente';
import SelectorProveedor from '../proveedores/SelectorProveedor';
import { EnlaceEntidad } from '../ui/ficha/EnlaceEntidad';
import {
  COLECCION_POR_ROL, modalidadRelevantePara, refDe, vincular, desvincular, escribirNombre,
} from '../../lib/entidadesEmbarque';

interface EntidadesEmbarqueProps {
  entidades: EmbarqueEntidades;
  refs: EntidadesRef | undefined;
  onChange: (entidades: EmbarqueEntidades, refs: EntidadesRef) => void;
  clientes: ClienteVermur[];
  proveedores: ProveedorVermur[];
  modalidad?: string;
  isReadOnly?: boolean;
}

const CAMPOS: { key: keyof EmbarqueEntidades; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'expedidor', label: 'Expedidor (Shipper)', icon: <Building2 className="w-4 h-4 text-gray-400" />, desc: 'Quien envía la carga en origen' },
  { key: 'consignatario', label: 'Consignatario (Consignee)', icon: <Building2 className="w-4 h-4 text-gray-400" />, desc: 'Destinatario legal de la mercancía' },
  { key: 'notificar', label: 'Notificar a (Notify Party)', icon: <UserCheck className="w-4 h-4 text-gray-400" />, desc: 'Contacto a avisar sobre arribos' },
  { key: 'agenteAduanal', label: 'Agente Aduanal (Customs Broker)', icon: <Landmark className="w-4 h-4 text-gray-400" />, desc: 'Responsable del despacho aduanero' },
  { key: 'agenteCarga', label: 'Agente de Carga (Freight Forwarder)', icon: <Anchor className="w-4 h-4 text-gray-400" />, desc: 'Coordinador del flete internacional' },
  { key: 'agenteDestino', label: 'Agente de Destino', icon: <Users className="w-4 h-4 text-gray-400" />, desc: 'Corresponsal receptor en destino' },
  { key: 'importador', label: 'Importador de Registro', icon: <Shield className="w-4 h-4 text-gray-400" />, desc: 'Titular de la importación ante SAT' },
  { key: 'clienteCobrar', label: 'Cliente a Cobrar (Billing Party)', icon: <Building2 className="w-4 h-4 text-gray-400" />, desc: 'Entidad comercial a la que se factura' },
];

/**
 * Un rol del embarque: del catálogo (con enlace a su ficha) o texto libre
 * (marcado como no validado). Compartido con el transportista de la ruta.
 */
export function CampoEntidad({
  rol, nombre, refs, clientes, proveedores, modalidad, isReadOnly, onChange,
}: {
  rol: RolEnlazable;
  nombre: string;
  refs: EntidadesRef | undefined;
  clientes: ClienteVermur[];
  proveedores: ProveedorVermur[];
  modalidad?: string;
  isReadOnly?: boolean;
  onChange: (nombre: string, refs: EntidadesRef) => void;
}) {
  const ref = refDe(refs, rol);
  const coleccion = COLECCION_POR_ROL[rol];
  const tipoEnlace = coleccion === 'clientes' ? 'cliente' : 'proveedor';

  if (isReadOnly || ref) {
    return (
      <div className="flex items-center gap-2 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700">
        {ref ? (
          <EnlaceEntidad tipo={tipoEnlace} id={ref.id} title={`Abrir la ficha de ${nombre}`}>
            <span className="font-sans not-italic">{nombre || ref.id}</span>
          </EnlaceEntidad>
        ) : (
          <span className="flex-1">{nombre || '—'}</span>
        )}
        {!isReadOnly && ref && (
          <button
            type="button"
            onClick={() => onChange(nombre, desvincular(refs, rol))}
            title="Cambiar"
            className="ml-auto text-gray-400 hover:text-red-500"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  const props = {
    nombreLibreActual: nombre || undefined,
    onNombreLibre: (n: string) => {
      const r = escribirNombre(refs, rol, n, nombre);
      onChange(r.nombre, r.refs);
    },
  };
  return (
    <div className="space-y-1">
      {coleccion === 'clientes' ? (
        <SelectorCliente
          clientes={clientes}
          valorId={null}
          onSelect={c => { const r = vincular(refs, rol, { id: c.id, nombre: c.nombre, coleccion: 'clientes' }); onChange(r.nombre, r.refs); }}
          {...props}
        />
      ) : (
        <SelectorProveedor
          proveedores={proveedores}
          valorId={null}
          modalidadRelevante={modalidadRelevantePara(rol, modalidad)}
          onSelect={p => { const r = vincular(refs, rol, { id: p.id, nombre: p.nombre, coleccion: 'proveedores' }); onChange(r.nombre, r.refs); }}
          {...props}
        />
      )}
      {nombre && (
        <p className="flex items-center gap-1 text-[9px] font-semibold text-amber-700">
          <AlertCircle className="w-3 h-3" /> Sin validar: no salió del catálogo, no tiene ficha.
        </p>
      )}
    </div>
  );
}

export default function EntidadesEmbarque({
  entidades, refs, onChange, clientes, proveedores, modalidad, isReadOnly = false,
}: EntidadesEmbarqueProps) {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs">
      <div className="border-b border-gray-100 pb-3 mb-6">
        <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
          Entidades y Roles Involucrados
        </h3>
        <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wide">
          Del catálogo, con enlace a su ficha. Texto libre solo para entidades extranjeras no catalogadas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
        {CAMPOS.map(campo => (
          <div key={campo.key} className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
              {campo.icon}
              {campo.label}
            </label>
            <CampoEntidad
              rol={campo.key}
              nombre={entidades[campo.key] || ''}
              refs={refs}
              clientes={clientes}
              proveedores={proveedores}
              modalidad={modalidad}
              isReadOnly={isReadOnly}
              onChange={(nombre, nuevosRefs) => onChange({ ...entidades, [campo.key]: nombre }, nuevosRefs)}
            />
            <p className="text-[9px] text-gray-400 font-semibold italic">{campo.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
