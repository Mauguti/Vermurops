import React, { useState } from 'react';
import { ChevronRight, Save, X, Calendar, Plus, Check, FileText, Landmark, ShieldCheck, DollarSign, Activity, GitCommit, Ship, Plane, Truck, ArrowRight, Trash2, Package, Layers } from 'lucide-react';
import { EmbarqueCompleto, TIPOS_DOCUMENTO, EVENT_TYPES, CargoDetalle, EmbarqueEvento, EmbarqueDocumento, recalcularCargos, EmbarqueProducto, totalesDe, monedasConMovimiento } from './EmbarquesData';
import EntidadesEmbarque from './EntidadesEmbarque';
import RutaEmbarque from './RutaEmbarque';
import DocumentosEmbarque from './DocumentosEmbarque';
import ProductosEmbarque from './ProductosEmbarque';
import { useClientes } from '../../hooks/useClientes';
import { useProveedores } from '../../hooks/useProveedores';
import { useAuth } from '../../auth/AuthContext';
import TablaCargosEmbarque from './TablaCargosEmbarque';
import { editarMontoCargo, restaurarMontoCargo, desviacionDelEmbarque } from '../../lib/cargosEditables';
import { generateFolioEmbarque, parseFolioNumero } from '../../lib/folioService';

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
  const { user, puede } = useAuth();

  /**
   * A-3 · Quién corrige costos.
   *
   * Textual: «el costo lo puede modificar operaciones». Administración entra a
   * este embarque a registrar cierres y pagos, no a reescribir lo que costó.
   */
  const puedeEditarCargos = puede('embarque.generar');

  const nombreProveedor = (id: string | undefined) =>
    (id ? proveedores.find(p => p.id === id)?.nombre : '') ?? '';

  const [activeTab, setActiveTab] = useState<'general' | 'entidades' | 'ruta' | 'cargos' | 'documentos' | 'eventos' | 'productos' | 'master_hijo'>('general');

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

  return (
    <div className="space-y-6">
      
      {/* Breadcrumbs y Barra superior */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-150">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <span className="cursor-pointer hover:text-gray-700 transition-colors uppercase tracking-wide">Embarques</span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-gray-800 uppercase tracking-wide font-extrabold">{embarque.folio}</span>
          <span className="text-[9px] bg-gray-100 text-gray-400 font-extrabold tracking-wider px-1.5 py-0.5 rounded uppercase ml-2">
            {embarque.modalidad}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors self-start sm:self-center"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-x-6 gap-y-2 -mb-px">
          {([
            { id: 'general', label: 'General' },
            { id: 'entidades', label: 'Entidades' },
            { id: 'ruta', label: 'Ruta y Aduanas' },
            { id: 'cargos', label: 'Cargos' },
            { id: 'documentos', label: 'Documentos' },
            { id: 'eventos', label: 'Seguimiento' },
            { id: 'productos', label: 'Productos' },
            { id: 'master_hijo', label: 'Master / Hijo' },
          ] as const).map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 text-xs font-bold uppercase tracking-wider border-b-2 transition-all
                  ${active
                    ? 'border-[#E11D48] text-[#E11D48] font-extrabold'
                    : 'border-transparent text-gray-400 hover:text-gray-600'}`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Contenedor del Tab activo */}
      <div className="space-y-6">
        
        {/* GENERAL TAB */}
        {activeTab === 'general' && (
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
                    onToggle={() => handleToggleCierre('operativo')}
                  />
                  <CierreToggle
                    label="Cierre de Pagos / Finanzas"
                    desc="Facturado y costos pagados."
                    done={embarque.cierres.pago}
                    onToggle={() => handleToggleCierre('pago')}
                  />
                  <CierreToggle
                    label="Cierre Administrativo"
                    desc="Expediente completo y archivado sin pendientes."
                    done={embarque.cierres.administrativo}
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

        {/* ENTIDADES TAB */}
        {activeTab === 'entidades' && (
          <EntidadesEmbarque
            entidades={embarque.entidades}
            onChangeEntidades={updated => onUpdateEmbarque({ ...embarque, entidades: updated, updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') })}
          />
        )}

        {/* RUTA TAB (CON ADUANAS) */}
        {activeTab === 'ruta' && (
          <RutaEmbarque
            ruta={embarque.ruta}
            onChangeRuta={updated => onUpdateEmbarque({ ...embarque, ruta: updated, updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') })}
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
        {activeTab === 'documentos' && (
          <DocumentosEmbarque
            documentos={embarque.documentos}
            onAddDocumento={handleAddDocumento}
            onDeleteDocumento={handleDeleteDocumento}
          />
        )}

        {/* EVENTOS TAB */}
        {activeTab === 'eventos' && (
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-purple-50/50 border border-purple-100 rounded-xl">
                  <div>
                    <span className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      Embarque Master Consolidado (MBL)
                    </span>
                    <span className="block text-[10px] text-purple-600 font-semibold leading-tight mt-1">
                      Este embarque agrupa múltiples guías/cargas hijas (House BL) bajo un solo Bill of Lading maestro.
                    </span>
                  </div>

                  <button
                    onClick={handleCrearHijo}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1 shrink-0"
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
                          className="p-4 border border-gray-200 hover:border-purple-300 rounded-xl cursor-pointer hover:bg-purple-50/10 transition-all flex flex-col justify-between"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-bold text-gray-800 hover:text-purple-600">
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
                      <span className="block text-xs font-bold text-purple-700 hover:underline cursor-pointer mt-1" onClick={() => onSelectEmbarqueById(master.id)}>
                        {master.folio} — MBL: {master.numeroGuia}
                      </span>
                    </div>

                    <button
                      onClick={() => onSelectEmbarqueById(master.id)}
                      className="text-purple-600 hover:text-purple-800 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
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
  label, desc, done, onToggle
}: {
  label: string;
  desc: string;
  done: boolean;
  onToggle: () => void;
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
