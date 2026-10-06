import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useOrdenesCompra } from '../hooks/useOrdenesCompra';
import { useDepositosCliente } from '../hooks/useDepositosCliente';
import { useFacturas } from '../hooks/useFacturas';
import { calcularFondeo } from '../lib/fondeoCliente';
import { pagosDeCliente, entradasDeFondeo } from '../lib/pagos';
import { embarquesFondeables, entradasDelEmbarque } from '../lib/entradaDinero';
import PanelPagos from './ordenesCompra/PanelPagos';
import BandejaOC from './ordenesCompra/BandejaOC';
import FichaOC from './ordenesCompra/FichaOC';
import NuevaOCOficina from './ordenesCompra/NuevaOCOficina';
import { useProveedores } from '../hooks/useProveedores';
import { useConceptos } from '../hooks/useConceptos';
import type { OrdenCompra, EstadoOC } from './ordenesCompra/OrdenesCompraData';
import type { RolOC } from '../lib/stateMachineOC';
import { useAuth } from '../auth/AuthContext';
import Toast, { TipoToast } from './ui/Toast';
import ModuloEnDesarrollo from './ui/ModuloEnDesarrollo';
import PanelCuentasPorCobrar from './facturas/PanelCuentasPorCobrar';
import { cartera, resumenCartera } from '../lib/cuentasPorCobrar';
import { monedasConMonto } from '../lib/sumarPorMoneda';
import { useDestinoPendiente, useRegistrarAbierta, useNavegacion, type Destino } from '../navegacion/NavegacionContext';

export default function Finance() {
  const [activeTab, setActiveTab] = useState('Cuentas por pagar');
  const [searchTerm, setSearchTerm] = useState('');
  const [ocAbiertaId, setOcAbiertaId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ mensaje: string; tipo: TipoToast } | null>(null);
  const { user, puede } = useAuth();
  const [nuevaOCAbierta, setNuevaOCAbierta] = useState(false);
  const { proveedores } = useProveedores();
  const { conceptos } = useConceptos();

  // ── Tarea 43 · Origen para «Regresar a <ficha anterior>» ────────────────
  const irA = useNavegacion();
  const registrarAbierta = useRegistrarAbierta();
  const [origenNav, setOrigenNav] = useState<Destino | null>(null);

  React.useEffect(() => {
    if (ocAbiertaId) {
      registrarAbierta({ tipo: 'ordenCompra', id: ocAbiertaId });
    } else {
      registrarAbierta(null);
    }
  }, [ocAbiertaId, registrarAbierta]);

  /*
   * U-4 · Alguien enlazó a una orden de compra desde un embarque o desde un
   * proveedor. La OC todavía no tiene ficha propia —se construye en el bloque
   * C del plan de operación— así que el salto deja al usuario en la bandeja
   * donde vive, que es lo más cerca que se puede llevar hoy.
   */
  useDestinoPendiente(['ordenCompra'], (d, origen) => {
    setOrigenNav(origen ?? null);
    setActiveTab('Cuentas por pagar');
    setOcAbiertaId(d.id);
  });

  // ── OC: datos reales de Firestore ─────────────────────────────────────────
  const {
    ordenes, loading: loadingOC, porPagar, conteosPorEstado,
    transicionarEstado, updateOrden, createOrden,
  } = useOrdenesCompra();

  /** C-3 · El gasto de oficina lo carga Administración. */
  const puedeSolicitarPago = puede('ordenCompra.solicitar');

  // ── 1.1 / 2.3 · El fondeo del cliente ─────────────────────────────────────
  // Depósitos Y cobros: son el mismo dinero entrando por dos puertas — el
  // anticipo que se pide antes de operar y la factura que se cobra después.
  // Tarea 67 · Por eso se leen como UNA lista de pagos: el depósito es un
  // pago sin aplicaciones, el cobro uno con una. Antes eran dos listas y cada
  // call site tenía que acordarse de pasar las dos.
  const { depositos, registrarDeposito } = useDepositosCliente();
  const { facturas, cobros, pagosNuevos, registrarPagoAplicado } = useFacturas();
  /*
   * Tarea 68 · Las tres fuentes en una lista: lo que se escribe hoy
   * (`pagos/`) y los dos legados que ya no se escriben. `pagosNuevos` sale de
   * `useFacturas` y no de `useDepositosCliente` para no contar dos veces la
   * misma colección: los dos hooks la escuchan, pero aquí entra UNA.
   */
  const pagosCliente = useMemo(
    () => pagosDeCliente(pagosNuevos, cobros, depositos),
    [pagosNuevos, cobros, depositos],
  );
  /*
   * Tarea 69 · P3 · A qué embarque se le puede anticipar dinero. Se deriva de
   * las órdenes de pago abiertas: un anticipo se liga «al embarque y a la
   * orden de pago que fondea», así que un embarque sin ninguna orden
   * esperando dinero no es un destino, es un renglón que no hace nada.
   */
  const embarquesDisponibles = useMemo(() => embarquesFondeables(ordenes), [ordenes]);

  const carteraResumen = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    return resumenCartera(cartera(facturas, pagosCliente, hoy), pagosCliente, hoy);
  }, [facturas, pagosCliente]);

  /*
   * C-2 · La orden abierta se DERIVA del listener, no se guarda en estado.
   *
   * Si se guardara el objeto, al transicionarlo la pantalla seguiría
   * mostrando el estado viejo hasta recargar: el botón parecería no haber
   * hecho nada. Guardando solo el id, el snapshot de Firestore la refresca.
   */
  const ocAbierta = ocAbiertaId ? ordenes.find(o => o.id === ocAbiertaId) ?? null : null;

  const rolOC = (user?.rol ?? 'ventas') as RolOC;

  const handleTransicionar = async (nuevoEstado: EstadoOC, cambios?: Partial<OrdenCompra>) => {
    if (!ocAbierta) return;

    /*
     * Lo que el usuario acaba de escribir se guarda ANTES de transicionar y
     * viaja en el objeto que se valida. Si solo se guardara, la máquina
     * evaluaría la copia vieja del listener y rechazaría el pago diciendo que
     * falta el comprobante que el usuario está viendo en pantalla.
     */
    const conCambios: OrdenCompra = { ...ocAbierta, ...(cambios ?? {}) };
    if (cambios && Object.keys(cambios).length > 0) {
      try {
        await updateOrden(ocAbierta.id, cambios);
      } catch (err) {
        setToast({ mensaje: `No se pudo guardar: ${err instanceof Error ? err.message : err}`, tipo: 'error' });
        return;
      }
    }

    /*
     * 1.1 · El fondeo del embarque viaja con la transición. Sin esto, la
     * máquina de estados no puede afirmar que hay dinero y detiene la
     * autorización: «no saber» no es «autorizar».
     */
    const fondeo = conCambios.embarqueId
      ? calcularFondeo(
          entradasDeFondeo(pagosCliente, conCambios.embarqueId),
          ordenes.filter(o => o.embarqueId === conCambios.embarqueId),
        )
      : undefined;

    const r = await transicionarEstado(conCambios, nuevoEstado, rolOC, {
      uid: user?.uid ?? '',
      nombre: user?.nombre ?? user?.email ?? '',
    }, fondeo);
    if (!r.ok) {
      setToast({ mensaje: r.razon ?? 'No se pudo cambiar el estado.', tipo: 'error' });
      return;
    }
    setToast({ mensaje: `${ocAbierta.folio}: ${nuevoEstado.replace('_', ' ')}.`, tipo: 'exito' });
  };

  /**
   * 1.5 · Registra el pago de un GRUPO: una transferencia cubre varias
   * órdenes del mismo proveedor, así que todas pasan a pagada con la misma
   * referencia. Se hace en secuencia y se reporta lo que falló: marcar la
   * mitad y no decirlo dejaría a Julio creyendo que pagó lo que no pagó.
   */
  const registrarPagoDelGrupo = async (ocIds: string[], referencia: string) => {
    const fallidas: string[] = [];
    for (const id of ocIds) {
      const orden = ordenes.find(o => o.id === id);
      if (!orden) continue;
      try {
        await updateOrden(id, { comprobantePago: referencia });
        const r = await transicionarEstado(
          { ...orden, comprobantePago: referencia }, 'pagada', rolOC,
          { uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' },
        );
        if (!r.ok) fallidas.push(`${orden.folio}: ${r.razon}`);
      } catch (err) {
        fallidas.push(`${orden.folio}: ${err instanceof Error ? err.message : err}`);
      }
    }
    setToast(fallidas.length === 0
      ? { mensaje: `${ocIds.length} orden(es) marcadas como pagadas.`, tipo: 'exito' }
      : { mensaje: `No se pudieron pagar: ${fallidas.join(' · ')}`, tipo: 'error' });
  };

  const handleActualizarOC = (cambios: Partial<OrdenCompra>) => {
    if (!ocAbierta) return;
    updateOrden(ocAbierta.id, cambios).catch(err =>
      setToast({ mensaje: `No se pudo guardar: ${err instanceof Error ? err.message : err}`, tipo: 'error' }));
  };

  /*
   * 1.5 · «Programación de pagos» va ANTES de «Cuentas por pagar»: es la
   * pantalla que Julio abre cada mañana, y la bandeja es a dónde entra
   * cuando necesita el detalle de una orden.
   */
  const tabs = ['Programación de pagos', 'Facturas (CFDI)', 'Cuentas por cobrar', 'Cuentas por pagar', 'Estados de cuenta'];

  /*
   * Tarea 57 · Aquí vivían cuatro facturas de ejemplo (F-2023-085 a 087 y
   * F-2023-080, con RFC, UUID y montos escritos a mano), su tabla de
   * antigüedad por cliente, los badges, el export a CSV de esos datos y el
   * formulario «Nueva Factura (CFDI 4.0)» que anunciaba «Folio siguiente:
   * F-2023-088» y timbraba con un alert().
   *
   * Nada de eso estaba conectado y el botón que abría el formulario ya se
   * había retirado, así que la pantalla era inalcanzable pero el código
   * seguía ahí. Un folio consecutivo inventado es la clase de dato que se
   * copia a un correo: se ve exactamente igual que uno real.
   *
   * La pestaña «Facturas (CFDI)» dice lo que pasa de verdad con
   * ModuloEnDesarrollo, como Tipo de cambio antes de la tarea 51.
   */
  if (ocAbierta) {
    return (
      <>
        <FichaOC
          oc={ocAbierta}
          rol={rolOC}
          onBack={() => {
            if (origenNav) { registrarAbierta(null); irA(origenNav); }
            setOcAbiertaId(null);
            setOrigenNav(null);
          }}
          regresarLabel={origenNav?.id}
          onTransicionar={handleTransicionar}
          onActualizar={handleActualizarOC}
          todasLasOrdenes={ordenes}
          proveedor={proveedores.find(p => p.id === ocAbierta.proveedorId) ?? null}
          categoriaConcepto={conceptos.find(c => c.id === ocAbierta.conceptoId)?.categoria}
          reglaIVA={conceptos.find(c => c.id === ocAbierta.conceptoId)?.reglaIVA}
          /* Tarea 69 · P3 · El panel es de SOLO LECTURA: lo depositado, con
             enlace a Cuentas por cobrar, que es donde ahora se captura. */
          entradas={entradasDelEmbarque(pagosCliente, ocAbierta.embarqueId ?? '')}
          onIrACobranza={puede('cobro.registrar') ? () => {
            setOcAbiertaId(null);
            setOrigenNav(null);
            setActiveTab('Cuentas por cobrar');
          } : undefined}
          fondeo={ocAbierta.embarqueId
            ? calcularFondeo(
                entradasDeFondeo(pagosCliente, ocAbierta.embarqueId),
                ordenes.filter(o => o.embarqueId === ocAbierta.embarqueId),
              )
            : undefined}
        />
        <Toast mensaje={toast?.mensaje ?? null} tipo={toast?.tipo} onClose={() => setToast(null)} />
      </>
    );
  }

  return (
    <div className="space-y-[32px]">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px]">
            <div>
              <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Facturación y Finanzas</h2>
              <p className="text-[13px] text-text-secondary mt-[4px]">Control de pagos, facturación CFDI 4.0 y cuentas por cobrar.</p>
            </div>
            {/* El botón «Nueva factura» abría un formulario mock que no
                timbraba nada. Se retira hasta que la facturación exista dentro
                del embarque (Bloque 5). */}
          </div>

          {/* KPIs (C-1)
              Aquí había cuatro tarjetas con cifras inventadas ($145,250
              facturado, $62,400 por cobrar, $18,250 vencido, $42,100 por
              pagar) que nunca se conectaron a nada. Ahora las de pago salen de
              las OC reales, y las de cobro siguen sin existir porque la
              facturación se construye en la fase B: se dice, en vez de
              rellenarse con un número creíble. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[16px]">
            <TarjetaKPI
              titulo="Por pagar en firme"
              detalle="Órdenes autorizadas, pendientes de pago"
              montos={porPagar.enFirme}
              monedas={porPagar.monedasActivas}
              cargando={loadingOC}
              acento
            />
            <TarjetaKPI
              titulo="Solicitudes en curso"
              detalle="Solicitadas y en gestión: todavía se pueden rechazar"
              montos={porPagar.enCurso}
              monedas={porPagar.monedasActivas}
              cargando={loadingOC}
            />
            {/* La cartera, derivada de facturas y cobros (Cuentas por cobrar). */}
            <TarjetaKPI
              titulo="Por cobrar"
              detalle={`${carteraResumen.facturasAbiertas} factura${carteraResumen.facturasAbiertas !== 1 ? 's' : ''} abierta${carteraResumen.facturasAbiertas !== 1 ? 's' : ''}`}
              montos={carteraResumen.porCobrar}
              monedas={monedasConMonto(carteraResumen.porCobrar)}
              cargando={false}
            />
            <TarjetaKPI
              titulo="Vencido"
              detalle={`${carteraResumen.facturasVencidas} vencida${carteraResumen.facturasVencidas !== 1 ? 's' : ''}`}
              montos={carteraResumen.vencido}
              monedas={monedasConMonto(carteraResumen.vencido)}
              cargando={false}
            />
          </div>

          <div className="bg-card border border-card-border rounded-[12px] shadow-sm flex flex-col overflow-hidden">
             <div className="px-[24px] border-b border-divider bg-canvas">
                <nav className="-mb-px flex space-x-[24px] overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-[16px] px-[4px] text-[13px] font-medium transition-colors border-b-[2px] whitespace-nowrap ${
                        activeTab === tab
                          ? 'border-brand text-text-primary'
                          : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
             </div>

             <div className="p-[24px]">
                {activeTab === 'Programación de pagos' && (
                   <div className="space-y-4">
                     <p className="text-[12px] text-text-muted leading-relaxed">
                       Lo que se paga hoy: las órdenes ya autorizadas, agrupadas por proveedor y fecha de pago, listas para transferir.
                     </p>
                     <PanelPagos
                       ordenes={ordenes}
                       onAbrirOC={setOcAbiertaId}
                       onRegistrarPago={registrarPagoDelGrupo}
                       conteosPorEstado={conteosPorEstado}
                     />
                   </div>
                )}

                {activeTab === 'Facturas (CFDI)' && (
                   <ModuloEnDesarrollo
                     descripcion="La emisión de CFDI todavía no está conectada. La factura se generará dentro del embarque, asociada a la operación, para no capturar dos veces los conceptos."
                     pendiente="el timbrado CFDI y dónde se administran las notas de crédito."
                   />
                )}

                {activeTab === 'Cuentas por cobrar' && (
                   <PanelCuentasPorCobrar
                     facturas={facturas}
                     pagos={pagosCliente}
                     /* Tarea 69 · P3 · `cobro.registrar`, no
                        `factura.generar`: facturar es de las dos áreas y
                        recibir el dinero es solo de Administración. */
                     puedeCobrar={puede('cobro.registrar')}
                     /* Tarea 70 · P4 · UN pago repartido entre varias
                        facturas. El cobro contra una sola es este mismo pago
                        con una aplicación, y fondea las OC de los embarques
                        de las facturas que cubrió (1.1). */
                     onAplicarPago={async (datos) => {
                       const pago = await registrarPagoAplicado(datos);
                       const cuantas = pago.aplicaciones.length;
                       const sobra = Math.round((pago.monto - pago.aplicaciones.reduce((a, x) => a + x.monto, 0)) * 100) / 100;
                       setToast({
                         mensaje: `${pago.folio}: ${pago.moneda} ${pago.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })} `
                           + `aplicados a ${cuantas} factura${cuantas !== 1 ? 's' : ''}`
                           + (sobra > 1 ? `, con ${pago.moneda} ${sobra.toLocaleString('en-US', { minimumFractionDigits: 2 })} a favor del cliente.` : '.'),
                         tipo: 'exito',
                       });
                     }}
                     embarquesFondeables={embarquesDisponibles}
                     onRegistrarAnticipo={puede('cobro.registrar') ? async (a) => {
                       await registrarDeposito({ ...a, comprobante: null });
                       setToast({ mensaje: `Entrada de ${a.moneda} ${a.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })} registrada en ${a.embarqueFolio}. Ya fondea sus órdenes de pago.`, tipo: 'exito' });
                     } : undefined}
                   />
                )}

                {activeTab === 'Cuentas por pagar' && (
                   <div className="space-y-4">
                     <p className="text-[12px] text-text-muted leading-relaxed">
                       Todas las órdenes de compra en cualquier estado: desde la solicitud hasta el pago.
                     </p>
                     {/* C-3 · El segundo origen. Las de embarque nacen del
                         cargo, en la ficha del embarque; aquí solo se
                         capturan las que no cuelgan de ninguno. */}
                     {puedeSolicitarPago && (
                       <div className="flex justify-end">
                         <button
                           onClick={() => setNuevaOCAbierta(true)}
                           className="inline-flex items-center gap-1.5 bg-primario hover:bg-primario-hover text-white text-[12px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors shadow-sm"
                         >
                           <Plus className="w-3.5 h-3.5" /> Gasto de oficina
                         </button>
                       </div>
                     )}
                     <BandejaOC
                       ordenes={ordenes}
                       loading={loadingOC}
                       conteosPorEstado={conteosPorEstado}
                       onSelectOC={oc => setOcAbiertaId(oc.id)}
                       conceptos={conceptos}
                     />
                   </div>
                )}

                {activeTab === 'Estados de cuenta' && (
                   <ModuloEnDesarrollo
                     descripcion="El estado de cuenta por cliente requiere las facturas emitidas y los pagos aplicados."
                   />
                )}
             </div>
          </div>

      {/* C-3 · Alta de la orden suelta. */}
      {nuevaOCAbierta && (
        <NuevaOCOficina
          proveedores={proveedores}
          conceptos={conceptos.filter(c => c.activo !== false)}
          solicitante={{ uid: user?.uid ?? '', nombre: user?.nombre ?? user?.email ?? '' }}
          onCancelar={() => setNuevaOCAbierta(false)}
          onCrear={(datos) => {
            createOrden(datos)
              .then(oc => {
                setNuevaOCAbierta(false);
                setToast({ mensaje: `Orden ${oc.folio} solicitada para ${oc.proveedorNombre}.`, tipo: 'exito' });
              })
              .catch(err => setToast({
                mensaje: `No se pudo solicitar el pago: ${err instanceof Error ? err.message : err}`,
                tipo: 'error',
              }));
          }}
        />
      )}

      <Toast mensaje={toast?.mensaje ?? null} tipo={toast?.tipo} onClose={() => setToast(null)} />
    </div>
  );
}

// ─── Tarjeta de KPI ───────────────────────────────────────────────────────────

/**
 * Un KPI de dinero, con un renglón POR MONEDA.
 *
 * §4.3: los totales nunca se mezclan. Una tarjeta con un solo número y la
 * etiqueta «USD» encima de una suma de pesos y dólares se ve perfectamente
 * bien y es basura. Si no hay movimiento, dice cero en vez de quedarse vacía.
 */
function TarjetaKPI({
  titulo, detalle, montos, monedas, cargando, acento = false,
}: {
  titulo: string;
  detalle: string;
  montos: Record<'USD' | 'MXN', number>;
  monedas: ('USD' | 'MXN')[];
  cargando: boolean;
  acento?: boolean;
}) {
  const money = (n: number) =>
    n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="bg-white p-[20px] rounded-[12px] border border-card-border shadow-sm">
      <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">
        {titulo}
      </p>
      {cargando ? (
        <p className="text-[24px] font-semibold text-text-muted tabular-nums">…</p>
      ) : monedas.length === 0 ? (
        <p className={`text-[24px] font-semibold tabular-nums ${acento ? 'text-primario' : 'text-text-primary'}`}>
          $0.00
        </p>
      ) : (
        <div className="space-y-0.5">
          {monedas.map(m => (
            <p
              key={m}
              className={`text-[20px] font-semibold tabular-nums leading-tight ${
                acento ? 'text-primario' : 'text-text-primary'}`}
            >
              ${money(montos[m])}{' '}
              <span className="text-[12px] text-text-muted font-normal">{m}</span>
            </p>
          ))}
        </div>
      )}
      <p className="text-[10px] text-text-muted mt-[6px] leading-snug">{detalle}</p>
    </div>
  );
}
