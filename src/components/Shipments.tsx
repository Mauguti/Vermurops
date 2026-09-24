import React, { useState } from 'react';
import { EmbarqueCompleto, recalcularCargos } from './shipments/EmbarquesData';
import EmbarquesList from './shipments/EmbarquesList';
import FichaEmbarque from './shipments/FichaEmbarque';
import { useEmbarques } from '../hooks/useEmbarques';
import { useCotizaciones } from '../hooks/useCotizaciones';
import { useClientes } from '../hooks/useClientes';
import CotizacionesGanadas from './shipments/CotizacionesGanadas';
import { agruparPorEstado, estadoDe, ETAPAS_EMBARQUE } from '../lib/estadoEmbarque';
import { crearEmbarquesDeCotizacionGanada } from '../lib/crearEmbarquesGanada';
import { razonSinCliente } from '../lib/frenoCliente';
import { exigirExpediente, textoSalto, type SaltoExpediente } from '../lib/frenoExpediente';
import { anotarBitacora } from '../hooks/anotarBitacora';
import type { UserRole } from '../auth/users';
import { mapearCotizacionAEmbarque } from '../lib/cotizacionAEmbarque';
import { construirEmbarqueDesdeCotizacion } from '../lib/generacionEmbarque';
import { EMBARQUE_AUTOMATICO_DISPONIBLE } from '../config/banderas';
import { useServicios } from '../config/serviciosStore';
import { useDestinoPendiente } from '../navegacion/NavegacionContext';
import { useAuth } from '../auth/AuthContext';
import { reservarFoliosSerie, generateFolioEmbarque } from '../lib/folioService';
import { db } from '../firebase';
import { runTransaction } from 'firebase/firestore';
import Toast, { TipoToast } from './ui/Toast';

export default function Shipments() {
  // E-1: los embarques viven en Firestore. Antes eran useState sembrado desde
  // el mock y se perdían al recargar.
  const { embarques, loading, error, guardarEmbarque } = useEmbarques();
  const { quotes, updateCotizacion } = useCotizaciones();
  const { clientes } = useClientes();
  const { user, puede } = useAuth();
  const { serviciosActivos } = useServicios();
  const [selectedEmbarqueId, setSelectedEmbarqueId] = useState<string | null>(null);
  /** 5.3 · Vista del módulo: lista, kanban por estado, o cotizaciones por abrir. */
  const [vista, setVista] = useState<'bandeja' | 'kanban' | 'lista'>('bandeja');
  const [toast, setToast] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);
  const [creando, setCreando] = useState(false);

  // U-4 · Alguien enlazó a un embarque desde otro módulo.
  useDestinoPendiente(['embarque'], (d) => {
    setSelectedEmbarqueId(d.id);
    setVista('lista');
  });

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
      cargos: recalcularCargos([]),
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

  const ganadas = quotes.filter(q => q.etapa === 'ganada');
  const yaConEmbarque = new Set(embarques.map(e => e.cotizacionId).filter(Boolean));
  const puedeGenerar = puede('embarque.generar');

  /**
   * 5.1 · Abre el embarque desde una cotización ganada.
   *
   * Hereda los conceptos a cobrar y a pagar con el mapeo de E-3, y arrastra
   * sus advertencias: quien cerró la venta no vio el resultado.
   */
  const abrirEmbarqueDesdeCotizacion = async (quote: typeof quotes[number], serie: string) => {
    if (creando) return;
    // Bloque 2a: el freno también aquí, que es la ruta que corre hoy.
    const sinCliente = razonSinCliente(quote);
    if (sinCliente) { setToast({ mensaje: sinCliente, tipo: 'error' }); return; }
    // Bloque 2b: el expediente. Un salto que admin ya registró en la
    // cotización se hereda; sin él, Operaciones no puede abrir.
    let salto: SaltoExpediente | null = null;
    try {
      salto = exigirExpediente(quote, {
        cliente: clientes.find(c => c.id === quote.clienteId) ?? null,
        rol: user?.rol as UserRole | undefined,
        saltoPrevio: quote.saltoExpediente,
      });
    } catch (err) {
      setToast({ mensaje: err instanceof Error ? err.message : String(err), tipo: 'error' });
      return;
    }
    setCreando(true);

    /*
     * Bandera de A-1 apagada: el camino manual usa el folio SHP-, cuyo
     * contador SÍ está sembrado. Los folios por serie (VLIM, VLIT…) esperan
     * los consecutivos de Magaya: sin sembrar, el primero duplicaría uno
     * histórico que va impreso en documentos. Ver config/banderas.ts.
     */
    if (!EMBARQUE_AUTOMATICO_DISPONIBLE) {
      try {
        const cliente = clientes.find(c => c.id === quote.clienteId) ?? null;
        const { cargos, advertencias } = mapearCotizacionAEmbarque(quote, { cliente });
        /*
         * B3 (21-sep-2026): la ruta manual ya usa la SERIE que Operaciones
         * elige (VLIM, VLIT…), no el SHP- genérico. Del prefijo sale el
         * tráfico y del tráfico el IVA de las facturas. La bandera automática
         * sigue apagada; el contador sin sembrar se avisa, no bloquea.
         */
        const reserva = await runTransaction(db, tx => reservarFoliosSerie(tx, serie, 1));
        const folio = reserva.folios[0];
        if (!reserva.sembrado) {
          advertencias.push({
            tipo: 'contador_sin_sembrar', lineaId: '', concepto: '',
            detalle: `La serie ${serie} no tiene sembrado el consecutivo de Magaya: ${folio} puede duplicar un folio histórico. Siémbralo en Configuración → Contadores de folio.`,
          });
        }
        const nuevo = construirEmbarqueDesdeCotizacion({
          quote, folio, cargos, advertencias,
          origen: 'automatico',
          generadoPor: user?.nombre ?? user?.email ?? '',
          ahora: new Date().toISOString(),
          responsableOperativo: cliente?.responsableOperativo ?? null,
          // Ruta manual: un solo embarque para toda la cotización, así que
          // hereda los productos de TODOS sus servicios.
          serviciosGrupo: quote.servicios ?? [],
        });
        if (salto) nuevo.saltoExpediente = salto;
        await guardarEmbarque(nuevo);
        if (salto) {
          await anotarBitacora(nuevo.id, 'otro', 'Expediente sin validar: salto autorizado',
            { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' }, textoSalto(salto));
        }

        /*
         * ── El enlace de vuelta (9-sep-2026) ──────────────────────────────
         * La cotización tiene que saber que ya tiene embarque. De ese campo
         * depende `estaCongelada`, y de ella que sus conceptos dejen de
         * editarse (§4.8).
         *
         * La ruta automática lo escribía en su transacción; esta —la que se
         * usa hoy con la bandera apagada— no, así que en producción una
         * cotización con embarque abierto seguía editable y podía divergir
         * del embarque sin que nadie se enterara.
         *
         * Va DESPUÉS de guardar el embarque: si se escribiera antes y el
         * embarque fallara, la cotización quedaría congelada apuntando a un
         * embarque que no existe.
         */
        await updateCotizacion(quote.id, {
          embarqueIds: [...(quote.embarqueIds ?? []), nuevo.id],
        });

        setSelectedEmbarqueId(nuevo.id);
        setToast({
          mensaje: advertencias.length > 0
            ? `Embarque ${folio} abierto con ${advertencias.length} advertencia(s). Revísalas en la ficha.`
            : `Embarque ${folio} abierto desde ${quote.id}.`,
          tipo: advertencias.length > 0 ? 'error' : 'exito',
        });
      } catch (err) {
        setToast({
          mensaje: `No se pudo abrir el embarque: ${err instanceof Error ? err.message : err}`,
          tipo: 'error',
        });
      } finally {
        setCreando(false);
      }
      return;
    }

    try {
      const cliente = clientes.find(c => c.id === quote.clienteId) ?? null;
      const r = await crearEmbarquesDeCotizacionGanada({
        quote,
        cliente,
        catalogoServicios: serviciosActivos,
        generadoPor: user?.nombre ?? user?.email ?? '',
      });

      setSelectedEmbarqueId(r.embarqueIds[0] ?? null);

      if (r.yaExistian) {
        setToast({
          mensaje: `${quote.id} ya tenía embarque (${r.embarqueIds.join(', ')}).`,
          tipo: 'exito',
        });
        return;
      }

      const folios = r.embarques.map(e => e.folio).join(', ');
      setToast({
        mensaje: r.advertencias.length > 0
          ? `Embarque ${folios} abierto con ${r.advertencias.length} advertencia(s). Revísalas en la ficha.`
          : `Embarque ${folios} abierto desde ${quote.id}.`,
        tipo: r.advertencias.length > 0 ? 'error' : 'exito',
      });
    } catch (err) {
      setToast({
        mensaje: `No se pudo abrir el embarque: ${err instanceof Error ? err.message : err}`,
        tipo: 'error',
      });
    } finally {
      setCreando(false);
    }
  };

  const grupos = agruparPorEstado(embarques);

  return (
    <div className="space-y-[24px]">
      {!selectedEmbarque && (
        <div className="flex items-center gap-1 border-b border-gray-200">
          {([
            ['bandeja', `Por capturar (${embarques.filter(e => e.requiereCaptura).length})`],
            ['kanban', 'Tablero'],
            ['lista', 'Todos los embarques'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setVista(id)}
              className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-[1px] transition-colors ${
                vista === id
                  ? 'border-[#E11D48] text-[#18181B]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!selectedEmbarque && vista === 'bandeja' && (
        <CotizacionesGanadas
          ganadas={ganadas}
          yaConEmbarque={yaConEmbarque}
          onAbrirEmbarque={abrirEmbarqueDesdeCotizacion}
          puedeGenerar={puedeGenerar}
        />
      )}

      {!selectedEmbarque && vista === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {grupos.map(g => (
            <div key={g.estado} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#18181B] uppercase tracking-wider">{g.label}</span>
                <span className="text-[11px] font-bold text-gray-400">{g.embarques.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[120px]">
                {g.embarques.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEmbarqueId(e.id)}
                    className="w-full text-left bg-white border border-gray-200 rounded-lg p-3 hover:border-[#E11D48]/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[12px] font-semibold text-gray-900">{e.folio}</span>
                      {e.origen === 'automatico' && e.requiereCaptura && (
                        <span className="text-[8px] font-bold uppercase tracking-wider bg-[#E11D48]/10 text-[#E11D48] px-1.5 py-0.5 rounded">
                          Nuevo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      {e.entidades?.clienteCobrar || 'Sin cliente'}
                    </p>
                    {e.cotizacionId && (
                      <p className="text-[10px] text-gray-400 mt-0.5 font-mono">← {e.cotizacionId}</p>
                    )}
                  </button>
                ))}
                {g.embarques.length === 0 && (
                  <p className="text-[11px] text-gray-300 text-center py-6">Sin embarques</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!selectedEmbarque && vista === 'lista' ? (
        <EmbarquesList
          embarques={embarques}
          onSelectEmbarque={e => setSelectedEmbarqueId(e.id)}
          onCrearEmbarque={handleCrearEmbarque}
        />
      ) : selectedEmbarque ? (
        <FichaEmbarque
          embarque={selectedEmbarque}
          allEmbarques={embarques}
          onClose={() => setSelectedEmbarqueId(null)}
          onUpdateEmbarque={handleUpdateEmbarque}
          onSelectEmbarqueById={setSelectedEmbarqueId}
        />
      ) : null}

      <Toast
        mensaje={toast?.mensaje ?? null}
        tipo={toast?.tipo}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
