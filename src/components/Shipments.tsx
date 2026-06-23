import React, { useState } from 'react';
import { initialEmbarquesCompletos, EmbarqueCompleto } from './shipments/EmbarquesData';
import EmbarquesList from './shipments/EmbarquesList';
import FichaEmbarque from './shipments/FichaEmbarque';

export default function Shipments() {
  const [embarques, setEmbarques] = useState<EmbarqueCompleto[]>(initialEmbarquesCompletos);
  const [selectedEmbarqueId, setSelectedEmbarqueId] = useState<string | null>(null);

  // Seleccionar embarque activo
  const selectedEmbarque = embarques.find(e => e.id === selectedEmbarqueId) || null;

  // Actualizar un embarque
  const handleUpdateEmbarque = (updated: EmbarqueCompleto) => {
    // Si es un nuevo embarque, lo añade; de lo contrario lo reemplaza
    if (!embarques.some(e => e.id === updated.id)) {
      setEmbarques([...embarques, updated]);
    } else {
      setEmbarques(embarques.map(e => e.id === updated.id ? updated : e));
    }
  };

  // Acción de creación rápida para Nuevo Embarque
  const handleCrearEmbarque = () => {
    const nextNum = embarques.length + 1;
    const nuevoId = `SHP-2026-${String(nextNum).padStart(4, '0')}`;
    const nuevoFolio = `SHP-26-${String(nextNum).padStart(4, '0')}`;
    const fechaActual = new Date().toISOString().slice(0, 10);

    const nuevo: EmbarqueCompleto = {
      id: nuevoId,
      folio: nuevoFolio,
      cotizacionId: '',
      modalidad: 'maritimo',
      tipo: 'hijo',
      masterId: null,
      numeroGuia: 'MBL-POR-DEFINIR',
      numeroReservacion: 'BKG-POR-DEFINIR',
      referenciaCliente: 'PO-POR-DEFINIR',
      entidades: {
        expedidor: '',
        consignatario: 'Nuevo Cliente S.A.',
        notificar: '',
        agenteAduanal: '',
        agenteCarga: '',
        agenteDestino: '',
        importador: '',
        clienteCobrar: 'Nuevo Cliente S.A.'
      },
      ruta: {
        origen: {
          puertoCarga: '',
          transportista: '',
          buque: '',
          bandera: '',
          viaje: ''
        },
        destino: {
          puertoDescarga: '',
          transportistaEntrega: '',
          lugarEntrega: ''
        },
        aduana: {
          aes: false,
          pedimento: ''
        }
      },
      fechas: {
        salida: fechaActual,
        arribo: fechaActual,
        ordenGeneral: '',
        limiteDocumentacion: '',
        libreDemoras: '',
        libreAlmacenaje: ''
      },
      descripcionCarga: 'Descripción de mercancía general',
      valorDeclarado: 0,
      cierres: {
        operativo: false,
        pago: false,
        administrativo: false
      },
      cargos: {
        ingresos: 0,
        gastos: 0,
        ganancia: 0,
        moneda: 'USD',
        detalles: []
      },
      documentos: [],
      eventos: [
        {
          id: `evt-init-${Date.now()}`,
          titulo: 'Embarque Creado',
          descripcion: 'El folio operativo se ha iniciado en el sistema.',
          fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
          tipo: 'info'
        }
      ],
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };

    setEmbarques([nuevo, ...embarques]);
    setSelectedEmbarqueId(nuevo.id);
  };

  return (
    <div className="space-y-[32px]">
      {!selectedEmbarque ? (
        <EmbarquesList
          embarques={embarques}
          onSelectEmbarque={e => setSelectedEmbarqueId(e.id)}
          onCrearEmbarque={handleCrearEmbarque}
        />
      ) : (
        <FichaEmbarque
          embarque={selectedEmbarque}
          allEmbarques={embarques}
          onClose={() => setSelectedEmbarqueId(null)}
          onUpdateEmbarque={handleUpdateEmbarque}
          onSelectEmbarqueById={setSelectedEmbarqueId}
        />
      )}
    </div>
  );
}
