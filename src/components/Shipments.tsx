import React, { useState } from 'react';
import { EmbarqueCompleto } from './shipments/EmbarquesData';
import EmbarquesList from './shipments/EmbarquesList';
import FichaEmbarque from './shipments/FichaEmbarque';
import { useEmbarques } from '../hooks/useEmbarques';
import { generateFolioEmbarque } from '../lib/folioService';
import Toast, { TipoToast } from './ui/Toast';

export default function Shipments() {
  // E-1: los embarques viven en Firestore. Antes eran useState sembrado desde
  // el mock y se perdían al recargar.
  const { embarques, loading, error, guardarEmbarque } = useEmbarques();
  const [selectedEmbarqueId, setSelectedEmbarqueId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);
  const [creando, setCreando] = useState(false);

  // Seleccionar embarque activo
  const selectedEmbarque = embarques.find(e => e.id === selectedEmbarqueId) || null;

  /**
   * Mismo contrato que antes: recibe el embarque completo y hace upsert.
   * FichaEmbarque lo llama en catorce sitios y no necesita saber que ahora
   * esto escribe en Firestore.
   */
  const handleUpdateEmbarque = (updated: EmbarqueCompleto) => {
    guardarEmbarque(updated).catch(err => {
      setToast({
        mensaje: `No se pudo guardar el embarque: ${err instanceof Error ? err.message : err}`,
        tipo: 'error',
      });
    });
  };

  // Acción de creación rápida para Nuevo Embarque
  const handleCrearEmbarque = async () => {
    // EmbarquesList no recibe estado de carga (no toco su contrato en E-1),
    // así que la reentrada se corta aquí: dos clics rápidos crearían dos folios.
    if (creando) return;
    setCreando(true);
    let nuevoId: string;
    try {
      // Folio transaccional: con los embarques persistidos, un id derivado de
      // la longitud del array sobrescribiría un documento real.
      nuevoId = await generateFolioEmbarque();
    } catch (err) {
      setToast({
        mensaje: `No se pudo generar el folio: ${err instanceof Error ? err.message : err}`,
        tipo: 'error',
      });
      setCreando(false);
      return;
    }
    const nuevoFolio = nuevoId.replace('SHP-20', 'SHP-');
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

    try {
      await guardarEmbarque(nuevo);
      setSelectedEmbarqueId(nuevo.id);
      setToast({ mensaje: `Embarque ${nuevo.folio} creado.`, tipo: 'exito' });
    } catch (err) {
      setToast({
        mensaje: `No se pudo crear el embarque: ${err instanceof Error ? err.message : err}`,
        tipo: 'error',
      });
    } finally {
      setCreando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-danger-bg text-danger-text px-4 py-3 rounded-lg text-[13px]">
        Error al cargar embarques: {error}
      </div>
    );
  }

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

      <Toast
        mensaje={toast?.mensaje ?? null}
        tipo={toast?.tipo}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
