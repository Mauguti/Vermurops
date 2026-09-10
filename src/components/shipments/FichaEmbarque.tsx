import React, { useState } from 'react';
import { ChevronRight, Save, X, Calendar, Plus, Check, FileText, Landmark, ShieldCheck, DollarSign, Activity, GitCommit, Ship, Plane, Truck, ArrowRight, Trash2, Package, Layers } from 'lucide-react';
import { EmbarqueCompleto, TIPOS_DOCUMENTO, EVENT_TYPES, CargoDetalle, EmbarqueEvento, EmbarqueDocumento, recalcularCargos, EmbarqueProducto, totalesDe, monedasConMovimiento } from './EmbarquesData';
import EntidadesEmbarque from './EntidadesEmbarque';
import RutaEmbarque from './RutaEmbarque';
import DocumentosEmbarque from './DocumentosEmbarque';
import ProductosEmbarque from './ProductosEmbarque';
import { useClientes } from '../../hooks/useClientes';
import { useConceptos } from '../../hooks/useConceptos';
import { useFacturas } from '../../hooks/useFacturas';
import PanelFacturasEmbarque from '../facturas/PanelFacturasEmbarque';
import { traficoDeFolio } from '../../lib/facturacionEmbarque';
import { evaluarCierres, avisoDeOrden } from '../../lib/cierresEmbarque';
import { useProveedores } from '../../hooks/useProveedores';
import { useAuth } from '../../auth/AuthContext';
import TablaCargosEmbarque from './TablaCargosEmbarque';
import { clienteDelEmbarque } from '../../lib/entidadesEmbarque';
import { editarMontoCargo, restaurarMontoCargo, desviacionDelEmbarque } from '../../lib/cargosEditables';
import { construirOCDesdeCargo, marcarCargoConOrden, puedeConvertirse } from '../../lib/ocDesdeCargo';
import { generateFolioEmbarque, parseFolioNumero } from '../../lib/folioService';
import { FichaHeader, FichaTabs, BadgeEstado } from '../ui/ficha/FichaLayout';
import { EnlaceEntidad, BloqueEnlaces } from '../ui/ficha/EnlaceEntidad';
import LineaTiempo from '../ui/ficha/LineaTiempo';
import { ETAPAS_EMBARQUE, estadoDe } from '../../lib/estadoEmbarque';
import { useOrdenesCompra } from '../../hooks/useOrdenesCompra';
import Toast, { TipoToast } from '../ui/Toast';

/**
 * Las pestañas, en el orden en que se trabaja (decisión de Mau, 10-sep-2026):
 * Información fusiona General + Entidades + Ruta y aduanas —son las tres
 * secciones del encabezado del BL y se consultan juntas—; Historial es la
 * línea de tiempo que antes se llamaba Seguimiento. Plantillas se agrega
 * cuando exista: no se monta una pestaña vacía.
 */
type PestanaEmbarque =
  | 'informacion' | 'cargos' | 'productos' | 'documentos' | 'facturas'
  | 'historial' | 'master_hijo';

interface FichaEmbarqueProps {
  embarque: EmbarqueCompleto;
  allEmbarques: EmbarqueCompleto[];
  onClose: () => void;
  onUpdateEmbarque: (updated: EmbarqueCompleto) => void;
  onSelectEmbarqueById: (id: string) => void;
}

export default function FichaEmbarque({
  embarque,
  allEmbarques,
  onClose,
  onUpdateEmbarque,
  onSelectEmbarqueById
}: FichaEmbarqueProps) {
  const { clientes } = useClientes();
  const { proveedores } = useProveedores();
  const { ordenes, createOrden } = useOrdenesCompra();

  /** U-4 · Las órdenes de compra que se pagan por este embarque. */
  const ocDelEmbarque = ordenes.filter(o => o.embarqueId === embarque.id);

  const [avisoOC, setAvisoOC] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);

  const { user, puede } = useAuth();

  /** Solo quien puede solicitar pagos ve la acción. */
  const puedeSolicitarPago = puede('ordenCompra.solicitar');

  /**
   * A-3 · Quién corrige costos.
   *
   * Textual: «el costo lo puede modificar operaciones». Administración entra a
   * este embarque a registrar cierres y pagos, no a reescribir lo que costó.
   */
  const puedeEditarCargos = puede('embarque.generar');

  const nombreProveedor = (id: string | undefined) =>
    (id ? proveedores.find(p => p.id === id)?.nombre : '') ?? '';

  /**
   * Días de crédito del proveedor para la modalidad de ESTE embarque (§4.6).
   * `undefined` cuando no se conocen: la fecha de pago queda sin calcular en
   * vez de inventarse un plazo que nadie pactó.
   */
  /*
   * 2.1 · Facturas y cobros de ESTE embarque. El cobro no solo cierra la
   * cuenta por cobrar: alimenta el fondeo que libera el pago al proveedor.
   */
  const {
    facturas: facturasDelEmbarque, cobros, registrarFactura, cancelarFactura,
    registrarCobro, anularCobro,
  } = useFacturas(embarque.id);
  const { conceptos } = useConceptos();

  /*
   * El embarque guarda el NOMBRE del cliente a cobrar, no su id. Se resuelve
   * contra el catálogo para leer sus días de crédito; si no hace match, el
   * vencimiento se calcula como contado en vez de con un plazo inventado.
   */
  /*
   * 2.4 · Los tres cierres, evaluados contra datos reales: órdenes de compra,
   * facturas y cobros de ESTE embarque. No se toma el control del
   * interruptor; se dice lo que falta o si ya se puede cerrar.
   */
  const cierresEvaluados = evaluarCierres({
    embarque,
    ordenes: ordenes.filter(o => o.embarqueId === embarque.id),
    facturas: facturasDelEmbarque,
    cobros,
  });

  // Por enlace primero; por nombre exacto para los embarques anteriores al enlace.
  const clienteVinculado = clienteDelEmbarque(embarque, clientes);

  const creditoDelProveedor = (id: string | undefined): number | undefined => {
    const dc = id ? proveedores.find(p => p.id === id)?.diasCredito : undefined;
    if (!dc) return undefined;
    // La modalidad del embarque es texto libre; solo tres coinciden con el
    // desglose del proveedor. El resto usa el crédito general.
    const m = embarque.modalidad;
    const porModalidad = m === 'maritimo' ? dc.maritimo
      : m === 'terrestre' ? dc.terrestre
      : m === 'aereo' ? dc.aereo
      : undefined;
    return porModalidad ?? dc.general;
  };

  const [activeTab, setActiveTab] = useState<PestanaEmbarque>('informacion');

  // Estado temporal de edición general
  const [desc, setDesc] = useState(embarque.descripcionCarga);
  const [valDec, setValDec] = useState(embarque.valorDeclarado);
  const [refCli, setRefCli] = useState(embarque.referenciaCliente);
  const [numRes, setNumRes] = useState(embarque.numeroReservacion);
  const [numGuia, setNumGuia] = useState(embarque.numeroGuia);

  // Campos Magaya / INLAND
  const [nombreEmb, setNombreEmb] = useState(embarque.nombreEmbarque || embarque.folio);
  const [lugarReal, setLugarReal] = useState(embarque.lugarRealizacion || '');
  const [realizadoPorVal, setRealizadoPorVal] = useState(embarque.realizadoPor || '');
  const [tipoEntregaVal, setTipoEntregaVal] = useState(embarque.tipoEntrega || '');

  // Fechas
  const [salida, setSalida] = useState(embarque.fechas.salida);
  const [arribo, setArribo] = useState(embarque.fechas.arribo);
  const [ordenGen, setOrdenGen] = useState(embarque.fechas.ordenGeneral);
  const [limDoc, setLimDoc] = useState(embarque.fechas.limiteDocumentacion);
  const [libDem, setLibDem] = useState(embarque.fechas.libreDemoras);
  const [libAlm, setLibAlm] = useState(embarque.fechas.libreAlmacenaje);

  // Estados de adición manual de cargos y eventos
  const [newCargoConcept, setNewCargoConcept] = useState('');
  const [newCargoTipo, setNewCargoTipo] = useState<'ingreso' | 'gasto'>('gasto');
  const [newCargoMonto, setNewCargoMonto] = useState(0);
  const [newCargoMoneda, setNewCargoMoneda] = useState<'USD' | 'MXN'>('USD');
  /* A-3 · Un gasto sin proveedor no se le puede pagar a nadie: es lo primero
     que la orden de compra necesita saber (C-3). */
  const [newCargoProveedor, setNewCargoProveedor] = useState('');

  const [newEventTitulo, setNewEventTitulo] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventTipo, setNewEventTipo] = useState<'info' | 'alerta' | 'exito' | 'aduana'>('info');

  // Handlers para guardar cambios en datos generales
  const handleSaveGeneral = () => {
    const updated: EmbarqueCompleto = {
      ...embarque,
      descripcionCarga: desc,
      valorDeclarado: Number(valDec),
      referenciaCliente: refCli,
      numeroReservacion: numRes,
      numeroGuia: numGuia,
      nombreEmbarque: nombreEmb,
      lugarRealizacion: lugarReal,
      realizadoPor: realizadoPorVal,
      tipoEntrega: tipoEntregaVal,
      fechas: {
        salida,
        arribo,
        ordenGeneral: ordenGen,
        limiteDocumentacion: limDoc,
        libreDemoras: libDem,
        libreAlmacenaje: libAlm
      },
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };
    onUpdateEmbarque(updated);
  };

  const handleToggleCierre = (cierreType: 'operativo' | 'pago' | 'administrativo') => {
    // §4.7: operativo → pago → administrativo. No se bloquea marcar fuera de
    // orden —a veces se cobra antes de que Operaciones termine— pero cerrar
    // administrativamente algo sin cobrar suele ser un clic mal dado.
    if (!embarque.cierres[cierreType]) {
      const aviso = avisoDeOrden(cierreType, embarque.cierres);
      if (aviso && !window.confirm(`${aviso}\n\n¿Marcarlo de todos modos?`)) return;
    }
    const updated: EmbarqueCompleto = {
      ...embarque,
      cierres: {
        ...embarque.cierres,
        [cierreType]: !embarque.cierres[cierreType]
      },
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };
    onUpdateEmbarque(updated);
  };

  // Cargos Handlers
  const handleAddCargo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCargoConcept.trim() || newCargoMonto <= 0) return;

    const newCargo: CargoDetalle = {
      id: `cargo-${Date.now()}`,
      concepto: newCargoConcept,
      tipo: newCargoTipo,
      monto: Number(newCargoMonto),
      moneda: newCargoMoneda,
      origen: 'manual',
      ...(newCargoTipo === 'gasto' && newCargoProveedor ? { proveedorId: newCargoProveedor } : {}),
      facturaId: null,
    };

    const newDetalles = [...(embarque.cargos.detalles || []), newCargo];
    const newCargosInfo = recalcularCargos(newDetalles);

    onUpdateEmbarque({
      ...embarque,
      cargos: newCargosInfo,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    });

    setNewCargoConcept('');
    setNewCargoMonto(0);
    setNewCargoProveedor('');
  };

  /**
   * A-3 · Corrige el importe de un cargo.
   *
   * Escribe SOLO en el embarque. La cotización no se toca: es lo que se pactó
   * y así se queda. La diferencia entre las dos es el dato del profit real.
   */
  const guardarDetalles = (detalles: CargoDetalle[]) => {
    onUpdateEmbarque({
      ...embarque,
      cargos: recalcularCargos(detalles),
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });
  };

  const handleEditarMontoCargo = (id: string, monto: number) => {
    guardarDetalles(editarMontoCargo(
      embarque.cargos.detalles || [], id, monto,
      { nombre: user?.nombre ?? user?.email ?? '', cuando: new Date().toISOString() },
    ));
  };

  const handleRestaurarCargo = (id: string) => {
    guardarDetalles(restaurarMontoCargo(embarque.cargos.detalles || [], id));
  };

  /**
   * C-3 · El gasto se convierte en orden de compra.
   *
   * El cargo se marca con la orden que generó DESPUÉS de crearla, y solo si
   * se creó. Marcarlo antes dejaría un gasto que dice tener orden y no la
   * tiene: nadie volvería a pedir su pago y el proveedor se quedaría sin
   * cobrar sin que nada lo señalara.
   */
  const handleGenerarOC = async (cargoId: string) => {
    const detalles = embarque.cargos.detalles || [];
    const cargo = detalles.find(c => c.id === cargoId);
    if (!cargo) return;

    const revision = puedeConvertirse(cargo);
    if (!revision.puede) {
      setAvisoOC({ mensaje: revision.detalle ?? 'Este cargo no se puede pagar.', tipo: 'error' });
      return;
    }

    try {
      const oc = await createOrden(construirOCDesdeCargo(cargo, {
        embarque,
        proveedorNombre: nombreProveedor(cargo.proveedorId) || 'Proveedor sin nombre',
        solicitante: { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' },
        ahora: new Date().toISOString(),
        // 1.4 · Los días de crédito son POR MODALIDAD: el mismo proveedor
        // financia distinto un marítimo que un terrestre.
        diasCredito: creditoDelProveedor(cargo.proveedorId),
      }));

      guardarDetalles(marcarCargoConOrden(detalles, cargoId, oc.id));
      setAvisoOC({
        mensaje: `Orden ${oc.folio} solicitada para ${oc.proveedorNombre}. Operaciones la gestiona y Administración la autoriza.`,
        tipo: 'exito',
      });
    } catch (err) {
      setAvisoOC({
        mensaje: `No se pudo solicitar el pago: ${err instanceof Error ? err.message : err}`,
        tipo: 'error',
      });
    }
  };

  const handleDeleteCargo = (id: string) => {
    const newDetalles = (embarque.cargos.detalles || []).filter(c => c.id !== id);
    const newCargosInfo = recalcularCargos(newDetalles);

    onUpdateEmbarque({
      ...embarque,
      cargos: newCargosInfo,
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    });
  };

  // Eventos Handlers
  const handleAddEvento = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitulo.trim()) return;

    const newEvento: EmbarqueEvento = {
      id: `evt-${Date.now()}`,
      titulo: newEventTitulo,
      descripcion: newEventDesc,
      fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
      tipo: newEventTipo
    };

    onUpdateEmbarque({
      ...embarque,
      eventos: [newEvento, ...(embarque.eventos || [])],
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    });

    setNewEventTitulo('');
    setNewEventDesc('');
  };

  // Documentos Handlers
  const handleAddDocumento = (doc: Omit<EmbarqueDocumento, 'id'>) => {
    const newDocObj = {
      id: `doc-${Date.now()}`,
      ...doc
    };
    onUpdateEmbarque({
      ...embarque,
      documentos: [...(embarque.documentos || []), newDocObj],
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    });
  };

  const handleDeleteDocumento = (docId: string) => {
    onUpdateEmbarque({
      ...embarque,
      documentos: (embarque.documentos || []).filter(d => d.id !== docId),
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    });
  };

  // ── En Tránsito Handler (Magaya: Acciones → Poner/Quitar En Tránsito) ──────────
  const handleEnTransito = () => {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    onUpdateEmbarque({
      ...embarque,
      enTransito: !embarque.enTransito,
      fechaEnTransito: !embarque.enTransito ? now : undefined,
      updatedAt: now,
    });
  };

  // ── Productos Handlers ───────────────────────────────────────────────────────────
  const handleAddProducto = (prod: Omit<EmbarqueProducto, 'id'>) => {
    const newProd: EmbarqueProducto = { id: `prod-${Date.now()}`, ...prod };
    onUpdateEmbarque({
      ...embarque,
      productos: [...(embarque.productos || []), newProd],
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });
  };

  const handleDeleteProducto = (prodId: string) => {
    onUpdateEmbarque({
      ...embarque,
      productos: (embarque.productos || []).filter(p => p.id !== prodId),
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });
  };

  // Master / Hijos Handlers
  // §4.3 — totales por moneda, con fallback para embarques anteriores a E-2.
  const totales = totalesDe(embarque.cargos);
  const monedasActivas = monedasConMovimiento(embarque.cargos.detalles ?? []);

  const hijos = allEmbarques.filter(e => e.masterId === embarque.id);
  const master = allEmbarques.find(e => e.id === embarque.masterId);

  const handleCrearHijo = async () => {
    // E-1: con los embarques en Firestore, `allEmbarques.length + 1` deja de
    // ser solo un id repetido y pasa a SOBRESCRIBIR un documento real.
    let nuevoId: string;
    try {
      nuevoId = await generateFolioEmbarque();
    } catch (err) {
      // Sin esto el onClick deja una promesa rechazada sin atrapar en consola.
      alert(`No se pudo generar el folio del HBL hijo: ${err instanceof Error ? err.message : err}`);
      return;
    }
    const nextNum = parseFolioNumero(nuevoId);
    const nuevoHijo: EmbarqueCompleto = {
      id: nuevoId,
      folio: nuevoId.replace('SHP-20', 'SHP-'),
      cotizacionId: embarque.cotizacionId,
      modalidad: embarque.modalidad,
      tipo: 'hijo',
      masterId: embarque.id,
      numeroGuia: `HBL-VERM-${String(nextNum).padStart(3, '0')}`,
      numeroReservacion: embarque.numeroReservacion,
      referenciaCliente: `${embarque.referenciaCliente}-HIJO`,
      nombreEmbarque: `HAWB-${String(nextNum).padStart(7, '0')}`,
      lugarRealizacion: embarque.lugarRealizacion || '',
      realizadoPor: embarque.realizadoPor || '',
      tipoEntrega: embarque.tipoEntrega || '',
      enTransito: false,
      productos: [],
      entidades: {
        ...embarque.entidades,
        consignatario: 'Por Definir',
        clienteCobrar: 'Por Definir'
      },
      ruta: {
        ...embarque.ruta,
        aduana: { aes: false, pedimento: '' }
      },
      fechas: { ...embarque.fechas },
      descripcionCarga: `Carga hija de consolidado ${embarque.folio}`,
      valorDeclarado: 0,
      cierres: { operativo: false, pago: false, administrativo: false },
      cargos: { ingresos: 0, gastos: 0, ganancia: 0, moneda: 'USD', detalles: [] },
      documentos: [],
      eventos: [
        { id: `evt-ch-${Date.now()}`, titulo: 'HBL / BOL Creado', descripcion: `Asociado al master ${embarque.folio}`, fecha: new Date().toISOString().slice(0, 16).replace('T', ' '), tipo: 'info' }
      ],
      createdAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };

    onUpdateEmbarque(nuevoHijo); // Esta acción la registra en el listado central
    alert(`Se ha creado el HBL Hijo ${nuevoHijo.folio}. Puedes buscarlo en la lista.`);
  };

  const PESTANAS = [
    { id: 'informacion' as const, label: 'Información' },
    { id: 'cargos' as const, label: 'Cargos', contador: (embarque.cargos.detalles ?? []).length },
    { id: 'productos' as const, label: 'Productos', contador: (embarque.productos ?? []).length },
    { id: 'documentos' as const, label: 'Documentos', contador: (embarque.documentos ?? []).length },
    // 2.1 · Después de Cargos porque de ahí salen las líneas facturables.
    { id: 'facturas' as const, label: 'Facturas', contador: facturasDelEmbarque.length },
    { id: 'historial' as const, label: 'Historial' },
    { id: 'master_hijo' as const, label: 'Master / hijo' },
  ];

  return (
    <div className="space-y-6">
      {/* U-3 · Mismo encabezado que la ficha de cotización. Antes el folio
          vivía en la miga de pan y el embarque no tenía título: el cliente al
          que pertenece solo aparecía dentro de una pestaña. */}
      <FichaHeader
        modulo="Embarques"
        onBack={onClose}
        folio={embarque.folio}
        titulo={embarque.entidades?.clienteCobrar || 'Sin cliente'}
        badges={
          <>
            <BadgeEstado tono="neutro">{embarque.modalidad}</BadgeEstado>
            {embarque.requiereCaptura && (
              <BadgeEstado
                tono="espera"
                title="Nació de una cotización ganada y le falta la captura operativa."
              >
                Por capturar
              </BadgeEstado>
            )}
            {embarque.cierres?.administrativo ? (
              <BadgeEstado tono="exito">Cerrado</BadgeEstado>
            ) : embarque.cierres?.operativo ? (
              <BadgeEstado tono="activo">Cierre operativo</BadgeEstado>
            ) : null}
            {(embarque.advertenciasHeredadas?.length ?? 0) > 0 && (
              <BadgeEstado
                tono="peligro"
                title="La cotización de origen dejó advertencias. Se revisan en Seguimiento."
              >
                {embarque.advertenciasHeredadas!.length} advertencia
                {embarque.advertenciasHeredadas!.length !== 1 ? 's' : ''}
              </BadgeEstado>
            )}
          </>
        }
        subtitulo={
          embarque.ruta?.origen?.puertoCarga || embarque.ruta?.destino?.puertoDescarga ? (
            <p className="text-[12px] text-gray-500">
              {embarque.ruta.origen.puertoCarga || '—'} → {embarque.ruta.destino.puertoDescarga || '—'}
            </p>
          ) : undefined
        }
      />

      {/* U-4 · De aquí a lo que este embarque toca, sin salir a las listas.
          Operaciones llega a la cotización que lo originó de un clic. */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 -mt-2">
        <BloqueEnlaces
          titulo="Cotización"
          tipo="cotizacion"
          ids={embarque.cotizacionId ? [embarque.cotizacionId] : []}
          vacio="Se capturó a mano, no nació de una cotización."
        />
        <BloqueEnlaces
          titulo="Órdenes de compra"
          tipo="ordenCompra"
          ids={ocDelEmbarque.map(o => o.id)}
          vacio="Todavía no se ha solicitado ninguna."
        />
      </div>

      {/* U-5 · La misma línea del tiempo que la cotización y el prospecto.
          Los pasos son los del Kanban de embarques, así que la ficha y el
          tablero dicen lo mismo. NO es interactiva: el estado se DERIVA de la
          captura y de los cierres (estadoDe), no se elige. */}
      <LineaTiempo
        titulo="Avance del embarque"
        pasos={ETAPAS_EMBARQUE.map(e => ({ id: e.id, label: e.label }))}
        indiceActual={ETAPAS_EMBARQUE.findIndex(e => e.id === estadoDe(embarque))}
      />

      <FichaTabs<PestanaEmbarque>
        pestanas={PESTANAS}
        activa={activeTab}
        onCambiar={setActiveTab}
      />

      <Toast mensaje={avisoOC?.mensaje ?? null} tipo={avisoOC?.tipo} onClose={() => setAvisoOC(null)} />

      {/* Contenedor del Tab activo */}
      <div className="space-y-6">
        
        {/* INFORMACIÓN · General + Entidades + Ruta y aduanas, apiladas */}
        {activeTab === 'informacion' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Detalles principales */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-5">
              <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-3">
                Información del Embarque
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Folio Operativo</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600">{embarque.folio}</div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">ID de Cotización Origen</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600">{embarque.cotizacionId || 'Sin cotización asociada'}</div>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Guía (MBL / AWB)</label>
                  <input
                    type="text"
                    value={numGuia}
                    onChange={e => setNumGuia(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Número de Reserva (Booking)</label>
                  <input
                    type="text"
                    value={numRes}
                    onChange={e => setNumRes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Referencia Cliente (PO)</label>
                  <input
                    type="text"
                    value={refCli}
                    onChange={e => setRefCli(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Valor Declarado Comercial</label>
                  <input
                    type="number"
                    value={valDec}
                    onChange={e => setValDec(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                  />
                </div>
              </div>

              {/* Campos Magaya / INLAND */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Nombre del Embarque (Magaya)</label>
                  <input
                    type="text"
                    value={nombreEmb}
                    onChange={e => setNombreEmb(e.target.value)}
                    placeholder="Ej. VLIA-24-020 / BOL 9016543"
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tipo de Entrega</label>
                  <input
                    type="text"
                    value={tipoEntregaVal}
                    onChange={e => setTipoEntregaVal(e.target.value)}
                    placeholder="Ej. Entrega Exprés"
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Lugar de Realización</label>
                  <input
                    type="text"
                    value={lugarReal}
                    onChange={e => setLugarReal(e.target.value)}
                    placeholder="Ej. Querétaro"
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Realizado por</label>
                  <input
                    type="text"
                    value={realizadoPorVal}
                    onChange={e => setRealizadoPorVal(e.target.value)}
                    placeholder="Ej. Angel Luna"
                    className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Descripción de la Carga</label>
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 focus:border-[#E11D48] rounded-lg text-xs font-semibold text-gray-700 outline-none shadow-2xs"
                />
              </div>

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  onClick={handleSaveGeneral}
                  className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Save className="w-4 h-4" /> Guardar Cambios
                </button>
              </div>
            </div>

            {/* Fechas y Cierres */}
            <div className="space-y-6">
              
              {/* Fechas de Seguimiento */}
              <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-3">
                  Hitos Temporales (Fechas)
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">ETD (Salida)</label>
                      <input type="date" value={salida} onChange={e => setSalida(e.target.value)} className="w-full border border-gray-200 rounded-lg p-1.5 text-xs font-semibold outline-none focus:border-[#E11D48]" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">ETA (Arribo)</label>
                      <input type="date" value={arribo} onChange={e => setArribo(e.target.value)} className="w-full border border-gray-200 rounded-lg p-1.5 text-xs font-semibold outline-none focus:border-[#E11D48]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Límite de Documentación</label>
                    <input type="date" value={limDoc} onChange={e => setLimDoc(e.target.value)} className="w-full border border-gray-200 rounded-lg p-1.5 text-xs font-semibold outline-none focus:border-[#E11D48]" />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Orden General (Aduana)</label>
                    <input type="date" value={ordenGen} onChange={e => setOrdenGen(e.target.value)} className="w-full border border-gray-200 rounded-lg p-1.5 text-xs font-semibold outline-none focus:border-[#E11D48]" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Libre de Demoras</label>
                      <input type="date" value={libDem} onChange={e => setLibDem(e.target.value)} className="w-full border border-gray-200 rounded-lg p-1.5 text-xs font-semibold outline-none focus:border-[#E11D48]" />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-0.5">Libre Almacenaje</label>
                      <input type="date" value={libAlm} onChange={e => setLibAlm(e.target.value)} className="w-full border border-gray-200 rounded-lg p-1.5 text-xs font-semibold outline-none focus:border-[#E11D48]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Toggles de Cierre */}
              <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-3">
                  Cierres de Auditoría
                </h3>

                <div className="space-y-3">
                  <CierreToggle
                    label="Cierre Operativo"
                    desc="Se entregó la carga y se concluyeron los tránsitos."
                    done={embarque.cierres.operativo}
                    evaluacion={cierresEvaluados.operativo}
                    onToggle={() => handleToggleCierre('operativo')}
                  />
                  <CierreToggle
                    label="Cierre de Pagos / Finanzas"
                    desc="Facturado y costos pagados."
                    done={embarque.cierres.pago}
                    evaluacion={cierresEvaluados.pago}
                    onToggle={() => handleToggleCierre('pago')}
                  />
                  <CierreToggle
                    label="Cierre Administrativo"
                    desc="Expediente completo y archivado sin pendientes."
                    done={embarque.cierres.administrativo}
                    evaluacion={cierresEvaluados.administrativo}
                    onToggle={() => handleToggleCierre('administrativo')}
                  />
                </div>
              </div>

              {/* Panel En Tránsito — Magaya: Acciones → Poner/Quitar En Tránsito */}
              <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-2.5">
                  Estado de Tránsito
                </h3>
                <div className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                  embarque.enTransito ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="space-y-0.5">
                    <span className={`text-xs font-bold flex items-center gap-1.5 ${
                      embarque.enTransito ? 'text-emerald-700' : 'text-gray-600'
                    }`}>
                      <Package className={`w-4 h-4 ${embarque.enTransito ? 'text-emerald-600' : 'text-gray-400'}`} />
                      {embarque.enTransito ? 'En Tránsito — Activo ✓' : 'Sin Tránsito (detenido)'}
                    </span>
                    {embarque.enTransito && embarque.fechaEnTransito && (
                      <span className="block text-[10px] text-emerald-600 font-semibold">
                        Desde: {embarque.fechaEnTransito}
                      </span>
                    )}
                    {!embarque.enTransito && (
                      <span className="block text-[10px] text-gray-400 font-semibold leading-tight">
                        Ejecutar «Acciones → Poner En Tránsito» cuando el embarque salga.
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleEnTransito}
                    className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm shrink-0 ml-4 ${
                      embarque.enTransito
                        ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        : 'bg-[#E11D48] hover:bg-[#BE123C] text-white'
                    }`}
                  >
                    {embarque.enTransito ? 'Quitar En Tránsito' : 'Poner En Tránsito'}
                  </button>
                </div>
              </div>

            </div>

          </div>
        )}

        {activeTab === 'informacion' && (
          <EntidadesEmbarque
            entidades={embarque.entidades}
            refs={embarque.entidadesRef}
            clientes={clientes}
            proveedores={proveedores}
            modalidad={embarque.modalidad}
            onChange={(entidades, entidadesRef) => onUpdateEmbarque({
              ...embarque, entidades, entidadesRef,
              updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
            })}
          />
        )}

        {activeTab === 'informacion' && (
          <RutaEmbarque
            ruta={embarque.ruta}
            onChangeRuta={updated => onUpdateEmbarque({ ...embarque, ruta: updated, updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') })}
            refs={embarque.entidadesRef}
            onChangeRefs={entidadesRef => onUpdateEmbarque({ ...embarque, entidadesRef })}
            proveedores={proveedores}
            clientes={clientes}
            modalidad={embarque.modalidad}
          />
        )}

        {/* CARGOS TAB */}
        {activeTab === 'cargos' && (
          <div className="space-y-6">
            
            {/* A-3 · Cargos por concepto, editables por Operaciones. */}
            <TablaCargosEmbarque
              detalles={embarque.cargos.detalles || []}
              editable={puedeEditarCargos}
              nombreProveedor={nombreProveedor}
              onEditarMonto={handleEditarMontoCargo}
              onRestaurar={handleRestaurarCargo}
              onQuitar={handleDeleteCargo}
              onGenerarOC={puedeSolicitarPago ? handleGenerarOC : undefined}
            />

            {/* Lo que se movió respecto a la cotización. Es lo que dirección
                revisa: no basta con que el embarque cuadre consigo mismo. */}
            {(() => {
              const d = desviacionDelEmbarque(embarque.cargos.detalles || []);
              const conMovimiento = (['USD', 'MXN'] as const)
                .filter(m => d[m].ingresos !== 0 || d[m].gastos !== 0);
              if (conMovimiento.length === 0) return null;
              return (
                <div className="bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3">
                  <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-2">
                    Diferencia contra lo cotizado
                  </p>
                  <div className="flex flex-wrap gap-x-8 gap-y-1">
                    {conMovimiento.map(m => (
                      <div key={m} className="text-[12px] text-amber-900">
                        <span className="font-bold font-mono mr-2">{m}</span>
                        <span className="mr-4">
                          Se cobra{' '}
                          <span className="font-bold tabular-nums">
                            {d[m].ingresos >= 0 ? '+' : ''}
                            {d[m].ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                        <span>
                          Cuesta{' '}
                          <span className="font-bold tabular-nums">
                            {d[m].gastos >= 0 ? '+' : ''}
                            {d[m].gastos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Totales y Agregar Cargo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Formulario Agregar Cargo — solo Operaciones. */}
              <div className={`md:col-span-2 bg-white p-5 rounded-xl border border-gray-150 shadow-2xs space-y-4 ${puedeEditarCargos ? '' : 'hidden'}`}>
                <h4 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-2.5">
                  Agregar nuevo cargo
                </h4>

                <form onSubmit={handleAddCargo} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Concepto</label>
                    <input
                      type="text" required
                      value={newCargoConcept}
                      onChange={e => setNewCargoConcept(e.target.value)}
                      placeholder="Ej. Flete Terrestre Laredo-México"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-[#E11D48]"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tipo de Cargo</label>
                    <select
                      value={newCargoTipo}
                      onChange={e => setNewCargoTipo(e.target.value as any)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white outline-none focus:border-[#E11D48]"
                    >
                      <option value="gasto">Gasto (Costo de compra)</option>
                      <option value="ingreso">Ingreso (Monto facturado a cobrar)</option>
                    </select>
                  </div>

                  {newCargoTipo === 'gasto' && (
                    <div className="sm:col-span-2">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">
                        Proveedor a pagar
                      </label>
                      <select
                        value={newCargoProveedor}
                        onChange={e => setNewCargoProveedor(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white outline-none focus:border-[#E11D48]"
                      >
                        <option value="">Sin definir todavía</option>
                        {proveedores.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </select>
                      {!newCargoProveedor && (
                        <p className="text-[9px] text-amber-600 font-semibold mt-1">
                          Sin proveedor no se puede generar la orden de compra de este gasto.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Importe</label>
                      <input
                        type="number" required
                        value={newCargoMonto}
                        onChange={e => setNewCargoMonto(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-[#E11D48]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Moneda</label>
                      <select
                        value={newCargoMoneda}
                        onChange={e => setNewCargoMoneda(e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 bg-white outline-none focus:border-[#E11D48]"
                      >
                        <option value="USD">USD</option>
                        <option value="MXN">MXN</option>
                      </select>
                    </div>
                  </div>

                  <div className="sm:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Agregar Cargo
                    </button>
                  </div>
                </form>
              </div>

              {/* Totales Resumen */}
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 flex flex-col justify-between">
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 pb-2.5">
                    Resumen Financiero
                  </h4>

                  {/* §4.3: un bloque por moneda, sin convertir. Antes esto
                      mostraba un solo total mezclando USD y MXN a una tasa fija
                      de 18.00 escrita en el código. */}
                  {monedasActivas.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Sin cargos capturados.</p>
                  ) : (
                    <div className="space-y-5">
                      {monedasActivas.map(m => (
                        <div key={m} className="space-y-3 text-xs">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{m}</span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span className="text-gray-400">Ingresos:</span>
                            <span className="font-mono text-emerald-600">
                              ${totales[m].ingresos.toLocaleString()} {m}
                            </span>
                          </div>
                          <div className="flex justify-between font-semibold">
                            <span className="text-gray-400">Gastos:</span>
                            <span className="font-mono text-rose-500">
                              ${totales[m].gastos.toLocaleString()} {m}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline border-t border-gray-200 pt-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Utilidad</span>
                            <span className="text-base font-black text-gray-800 font-mono tracking-tight">
                              ${totales[m].ganancia.toLocaleString()} {m}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-4 mt-6">
                  <p className="text-[9px] text-gray-400 font-semibold italic">
                    {monedasActivas.length > 1
                      ? 'Los totales no se suman entre monedas: convertirlos exige un tipo de cambio real con su fecha.'
                      : 'Cada moneda se totaliza por separado.'}
                  </p>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* DOCUMENTOS TAB */}
        {activeTab === 'facturas' && (
          <PanelFacturasEmbarque
            embarque={embarque}
            facturas={facturasDelEmbarque}
            cobros={cobros}
            conceptos={conceptos}
            trafico={traficoDeFolio(embarque.folio)}
            clienteId={clienteVinculado?.id ?? null}
            credito={clienteVinculado
              ? (clienteVinculado.diasCreditoPorTipo ?? { general: clienteVinculado.dias })
              : null}
            puedeFacturar={puede('factura.generar')}
            onRegistrar={async (datos, cargoIds) => {
              try {
                const f = await registrarFactura(datos);
                /*
                 * Las líneas quedan marcadas con la factura que las cubre. La
                 * marca vive en la LÍNEA: así una línea no puede acabar en dos
                 * facturas, que es como se cobra dos veces lo mismo.
                 */
                guardarDetalles((embarque.cargos?.detalles ?? []).map(c =>
                  cargoIds.includes(c.id) ? { ...c, facturaId: f.id } : c));
                setAvisoOC({ mensaje: `Factura ${f.numero} registrada. Vence el ${f.fechaVencimiento}.`, tipo: 'exito' });
              } catch (err) {
                setAvisoOC({ mensaje: `No se pudo registrar: ${err instanceof Error ? err.message : err}`, tipo: 'error' });
              }
            }}
            onCancelar={async (id, motivo) => {
              try {
                await cancelarFactura(id, motivo);
                // Las líneas vuelven a estar facturables: la factura ya no las cubre.
                guardarDetalles((embarque.cargos?.detalles ?? []).map(c =>
                  c.facturaId === id ? { ...c, facturaId: null } : c));
                setAvisoOC({ mensaje: 'Factura cancelada. Sus líneas vuelven a estar por facturar.', tipo: 'exito' });
              } catch (err) {
                setAvisoOC({ mensaje: `No se pudo cancelar: ${err instanceof Error ? err.message : err}`, tipo: 'error' });
              }
            }}
            onCobrar={async (datos) => {
              try {
                await registrarCobro(datos);
                setAvisoOC({
                  mensaje: `Cobro registrado. Ese dinero ya fondea las órdenes de compra de este embarque.`,
                  tipo: 'exito',
                });
              } catch (err) {
                setAvisoOC({ mensaje: `No se pudo registrar el cobro: ${err instanceof Error ? err.message : err}`, tipo: 'error' });
              }
            }}
            onAnularCobro={async (id) => {
              try { await anularCobro(id); }
              catch (err) { setAvisoOC({ mensaje: `No se pudo anular: ${err instanceof Error ? err.message : err}`, tipo: 'error' }); }
            }}
          />
        )}

        {activeTab === 'documentos' && (
          <DocumentosEmbarque
            documentos={embarque.documentos}
            onAddDocumento={handleAddDocumento}
            onDeleteDocumento={handleDeleteDocumento}
          />
        )}

        {/* HISTORIAL · la línea de tiempo del embarque */}
        {activeTab === 'historial' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Timeline */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-5">
              <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-3">
                Historial de Eventos (Timeline)
              </h3>

              <div className="relative border-l-2 border-gray-150 pl-5 space-y-6">
                {(embarque.eventos || []).length === 0 ? (
                  <p className="text-xs text-gray-400 italic">No hay eventos registrados en este embarque.</p>
                ) : (
                  embarque.eventos.map(evt => {
                    const typeStyle = EVENT_TYPES[evt.tipo] || EVENT_TYPES.info;
                    return (
                      <div key={evt.id} className="relative">
                        <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-white border-2 border-[#E11D48] ring-4 ring-white shadow-sm" />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <h4 className="text-xs font-bold text-[#18181B]">
                              {evt.titulo}
                            </h4>
                            <span className={`text-[8px] font-bold uppercase tracking-wider border px-1.5 py-0.2 rounded ${typeStyle.color}`}>
                              {typeStyle.label}
                            </span>
                            <span className="text-[10px] text-gray-400 font-semibold tabular-nums ml-auto">
                              {evt.fecha}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 leading-tight">
                            {evt.descripcion}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Agregar Evento Form */}
            <div className="bg-white p-5 rounded-xl border border-gray-150 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider border-b border-gray-100 pb-2.5">
                Registrar Hito / Evento
              </h3>

              <form onSubmit={handleAddEvento} className="space-y-4">
                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Título del Evento *</label>
                  <input
                    type="text" required
                    value={newEventTitulo}
                    onChange={e => setNewEventTitulo(e.target.value)}
                    placeholder="Ej. Carga ingresada al almacén"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-[#E11D48]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Tipo de Evento</label>
                  <select
                    value={newEventTipo}
                    onChange={e => setNewEventTipo(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white outline-none focus:border-[#E11D48]"
                  >
                    <option value="info">General (Información)</option>
                    <option value="aduana">Despacho Aduanal</option>
                    <option value="alerta">Alerta Operativa</option>
                    <option value="exito">Hito / Logro Exitoso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Detalle / Notas</label>
                  <textarea
                    value={newEventDesc}
                    onChange={e => setNewEventDesc(e.target.value)}
                    rows={3}
                    placeholder="Ej. Maniobras concluidas ante aduana."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:border-[#E11D48]"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <GitCommit className="w-4 h-4" /> Registrar Evento
                  </button>
                </div>
              </form>
            </div>

          </div>
        )}

        {/* PRODUCTOS TAB */}
        {activeTab === 'productos' && (
          <ProductosEmbarque
            productos={embarque.productos || []}
            clientes={clientes}
            onAddProducto={handleAddProducto}
            onDeleteProducto={handleDeleteProducto}
          />
        )}

        {/* MASTER / HIJO TAB */}
        {activeTab === 'master_hijo' && (
          <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
                Relación y Consolidación de Embarques
              </h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-1">
                Administración de Bill of Ladings consolidados (Master MBL vs Hijos HBL).
              </p>
            </div>

            {embarque.tipo === 'master' ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#E11D48]/5 border border-[#E11D48]/10 rounded-xl">
                  <div>
                    <span className="text-xs font-bold text-[#BE123C] flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      Embarque Master Consolidado (MBL)
                    </span>
                    <span className="block text-[10px] text-[#E11D48] font-semibold leading-tight mt-1">
                      Este embarque agrupa múltiples guías/cargas hijas (House BL) bajo un solo Bill of Lading maestro.
                    </span>
                  </div>

                  <button
                    onClick={handleCrearHijo}
                    className="bg-[#E11D48] hover:bg-[#BE123C] text-white text-[10px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" /> Crear HBL Hijo
                  </button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Embarques Hijos Asociados ({hijos.length})
                  </h4>

                  {hijos.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No hay embarques hijos asociados a este consolidado master.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {hijos.map(h => (
                        <div
                          key={h.id}
                          onClick={() => onSelectEmbarqueById(h.id)}
                          className="p-4 border border-gray-200 hover:border-[#E11D48]/30 rounded-xl cursor-pointer hover:bg-[#E11D48]/5 transition-all flex flex-col justify-between"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-bold text-gray-800 hover:text-[#E11D48]">
                                {h.folio}
                              </span>
                              <span className="block text-[9px] text-gray-400 font-bold uppercase mt-0.5">
                                HBL: {h.numeroGuia}
                              </span>
                            </div>
                            <span className="text-[9px] font-extrabold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                              Hijo
                            </span>
                          </div>

                          <div className="border-t border-gray-100 pt-2.5 mt-3 flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-gray-600 truncate max-w-[150px]">
                              {h.entidades.consignatario}
                            </span>
                            <span className="font-bold text-gray-500 tabular-nums">
                              Val: ${h.valorDeclarado.toLocaleString()} USD
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <Ship className="w-4 h-4 text-sky-500" />
                    Embarque Hijo (House Bill of Lading / HBL)
                  </span>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-1">
                    Este embarque es una carga individual consignada a un cliente específico.
                  </p>
                </div>

                {master ? (
                  <div className="p-4 border border-gray-150 rounded-xl flex items-center justify-between bg-white shadow-2xs">
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase">Embarque Master Asociado</span>
                      <span className="block text-xs font-bold text-[#BE123C] hover:underline cursor-pointer mt-1" onClick={() => onSelectEmbarqueById(master.id)}>
                        {master.folio} — MBL: {master.numeroGuia}
                      </span>
                    </div>

                    <button
                      onClick={() => onSelectEmbarqueById(master.id)}
                      className="text-[#E11D48] hover:text-[#9F1239] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                    >
                      Ver Master <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-100 text-amber-800 text-xs rounded-xl flex items-start gap-2">
                    <span>
                      Este embarque está configurado como Hijo, pero el Embarque Master con ID <strong>{embarque.masterId || 'ninguno'}</strong> no fue encontrado o no está asociado.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── CierreToggle Component ──────────────────────────────────────────────────

function CierreToggle({
  label, desc, done, onToggle, evaluacion,
}: {
  label: string;
  desc: string;
  done: boolean;
  onToggle: () => void;
  /**
   * 2.4 · Lo que los DATOS dicen sobre este cierre. El interruptor sigue
   * siendo de la persona —a veces sabe algo que el sistema no— pero cuando
   * marca algo que los datos contradicen, se le dice.
   */
  evaluacion?: { listo: boolean; faltantes: string[] };
}) {
  return (
    <div className="flex items-center justify-between p-3.5 border border-gray-150 rounded-xl bg-gray-50/50 shadow-2xs">
      <div className="space-y-0.5">
        <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
          {done ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <X className="w-4 h-4 text-red-400" />
          )}
          {label}
        </span>
        <span className="block text-[9px] text-gray-400 font-semibold leading-tight">{desc}</span>
        {evaluacion && !evaluacion.listo && (
          <span className={`block text-[10px] leading-tight mt-1 ${done ? 'text-red-600 font-semibold' : 'text-amber-700'}`}>
            {done && '⚠ Marcado, pero: '}{evaluacion.faltantes[0]}
          </span>
        )}
        {evaluacion?.listo && !done && (
          <span className="block text-[10px] text-emerald-700 leading-tight mt-1">
            Los datos ya lo respaldan: se puede cerrar.
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`w-10 h-5.5 rounded-full transition-colors relative flex items-center cursor-pointer shrink-0
          ${done ? 'bg-green-500' : 'bg-gray-200'}`}
      >
        <span className={`w-3.5 h-3.5 bg-white rounded-full transition-transform shadow-sm absolute ${done ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
