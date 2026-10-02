import React, { useState } from 'react';
import {
  Building2, Package, Calendar, AlertTriangle, CheckCircle2, XCircle, Ship,
} from 'lucide-react';
import type { OrdenCompra, EstadoOC } from './OrdenesCompraData';
import { ESTADOS_OC_MAP } from './OrdenesCompraData';
import { transicionesDisponiblesOC, puedeTransicionarOC, type RolOC } from '../../lib/stateMachineOC';
import {
  evaluarFondeo, esPagoDeImpuestos, type FondeoEmbarque,
} from '../../lib/fondeoCliente';
import {
  sugerirBancoVermur, sugerirCuentaProveedor, BANCOS_VERMUR, BANCOS_VERMUR_MAP,
  type BancoVermur,
} from '../../lib/cuentasPago';
import type { ProveedorVermur } from '../proveedores/ProveedoresData';
import {
  anticiposAplicables, aplicarAnticipo, quitarAnticipo, montoATransferir,
} from '../../lib/anticipos';
import { formatearPorMoneda } from '../../lib/sumarPorMoneda';
import {
  FichaLayout, FichaHeader, FichaContenido, FichaFooter, BadgeEstado, TonoBadge,
  AccionesHeader, type AccionMenu,
} from '../ui/ficha/FichaLayout';
import { BloqueEnlaces } from '../ui/ficha/EnlaceEntidad';
import LineaTiempo from '../ui/ficha/LineaTiempo';
import type { ReglaIVA } from '../conceptos/ConceptosData';
import { compararIVAFactura, type ResultadoComparacionIVA } from '../../lib/ivaOrdenCompra';

/**
 * C-2. La ficha de una orden de compra: el flujo de dos áreas.
 *
 *     OPERACIONES solicita y gestiona → ADMINISTRACIÓN autoriza y paga
 *
 * ── Qué decide qué se puede hacer ──────────────────────────────────────────
 * Nada de esto lo decide la pantalla: `transicionesDisponiblesOC` devuelve a
 * qué estados puede pasar ESTE usuario con ESTA orden, y el footer dibuja un
 * botón por cada uno. Si la máquina de estados cambia, la ficha cambia con
 * ella y no hay una segunda lista de reglas que se quede vieja.
 *
 * ── Los botones cumplen su promesa ─────────────────────────────────────────
 * Cuando falta algo —el comprobante para pagar, el motivo para rechazar— no
 * se muestra un botón que va a fallar: se dice qué falta. La máquina ya
 * devuelve la razón, así que se enseña la suya en vez de inventar otra.
 */

/** Los cuatro pasos del flujo. «Rechazada» es salida, no paso. */
const PASOS: { id: EstadoOC; label: string }[] = [
  { id: 'solicitada', label: 'Solicitada' },
  { id: 'en_gestion', label: 'En gestión' },
  { id: 'autorizada', label: 'Autorizada' },
  { id: 'pagada',     label: 'Pagada' },
];

const TONO_ESTADO: Record<EstadoOC, TonoBadge> = {
  solicitada: 'espera',
  en_gestion: 'activo',
  autorizada: 'exito',
  pagada:     'exito',
  rechazada:  'peligro',
};

/** Cómo se llama la acción de llegar a cada estado, desde quien la ejecuta. */
const ACCION: Record<EstadoOC, string> = {
  solicitada: 'Devolver a solicitada',
  en_gestion: 'Tomar y gestionar',
  autorizada: 'Autorizar el pago',
  pagada:     'Registrar el pago',
  rechazada:  'Rechazar',
};

interface Props {
  oc: OrdenCompra;
  rol: RolOC;
  onBack: () => void;
  /**
   * Cambia de estado. `cambios` son los campos que la transición NECESITA y
   * que el usuario acaba de escribir; van con ella para que se guarden y se
   * validen en el mismo acto.
   */
  onTransicionar: (nuevoEstado: EstadoOC, cambios?: Partial<OrdenCompra>) => void;
  /** Guarda campos sueltos: comprobante, factura, motivo de rechazo. */
  onActualizar: (cambios: Partial<OrdenCompra>) => void;
  /** 1.1 · Fondeo del embarque. Ausente en gastos de oficina. */
  fondeo?: FondeoEmbarque;
  /** 1.2 · El proveedor, para sugerir a qué cuenta suya va el pago. */
  proveedor?: ProveedorVermur | null;
  /** Categoría del concepto, para decidir si el gasto es aduanal. */
  categoriaConcepto?: string;
  /** Tarea 36 · Regla IVA del concepto, para calcular el IVA esperado. */
  reglaIVA?: ReglaIVA | null;
  /** 1.3 · Todas las órdenes, para encontrar los anticipos cruzables. */
  todasLasOrdenes?: OrdenCompra[];
  /**
   * 1.1 · Registrar el depósito del cliente que fondea esta orden. Solo
   * Administración; ausente cuando el rol no puede. Antes existía el hook
   * y ninguna pantalla lo llamaba: el fondeo no se podía registrar.
   */
  onRegistrarDeposito?: (d: { monto: number; moneda: 'USD' | 'MXN'; fechaDeposito: string; referencia: string }) => Promise<void>;
  /** Etiqueta del botón regresar cuando se llegó desde otra ficha. */
  regresarLabel?: string;
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FichaOC({
  oc, rol, onBack, onTransicionar, onActualizar, fondeo, proveedor, categoriaConcepto,
  reglaIVA, todasLasOrdenes = [], onRegistrarDeposito, regresarLabel,
}: Props) {
  const [depMonto, setDepMonto] = useState('');
  const [depFecha, setDepFecha] = useState(new Date().toISOString().slice(0, 10));
  const [depRef, setDepRef] = useState('');
  const [depGuardando, setDepGuardando] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState(oc.motivoRechazo ?? '');
  const [comprobante, setComprobante] = useState(oc.comprobantePago ?? '');
  const [factura, setFactura] = useState(oc.facturaAsociada ?? '');

  /*
   * La orden TAL COMO ESTÁ EN PANTALLA, con lo que el usuario acaba de
   * teclear pero Firestore todavía no confirma.
   *
   * Sin esto, escribir el comprobante y no ver aparecer el botón de pagar
   * hasta que el snapshot regrese se lee como que el campo no sirvió. Y peor:
   * el botón podría aparecer y fallar por leer el valor viejo.
   */
  const ocLocal: OrdenCompra = {
    ...oc,
    motivoRechazo: motivo.trim() || null,
    comprobantePago: comprobante.trim() || null,
    facturaAsociada: factura.trim() || null,
  };

  const disponibles = transicionesDisponiblesOC(oc.estado, rol, ocLocal, fondeo);

  /**
   * Los estados que la máquina rechaza HOY pero podría permitir si el usuario
   * completa algo. Se enseñan como «te falta esto», que es distinto de «no
   * puedes»: la diferencia entre corregir y rendirse.
   */
  const bloqueados = (['en_gestion', 'autorizada', 'pagada', 'rechazada'] as EstadoOC[])
    .filter(e => !disponibles.includes(e))
    .map(e => ({ estado: e, r: puedeTransicionarOC(oc.estado, e, rol, ocLocal, fondeo) }))
    .filter(x => !x.r.ok && x.r.razon && !x.r.razon.includes('no está permitida') && !x.r.razon.includes('Tu rol'));

  const terminada = oc.estado === 'pagada' || oc.estado === 'rechazada';

  // 1.1 · Qué dice el fondeo sobre esta orden, para mostrarlo antes de que el
  // usuario intente autorizar y se lleve la sorpresa.
  const veredicto = fondeo
    ? evaluarFondeo(ocLocal, fondeo)
    : { puedeAutorizar: true } as ReturnType<typeof evaluarFondeo>;
  const esImpuestos = esPagoDeImpuestos(ocLocal);
  const puedeMarcarNoPagar = rol === 'administracion' || rol === 'admin';

  // 1.2 · De dónde sale y a dónde entra el dinero. Se sugiere; decide quien
  // autoriza — la segmentación de abajo es lo que Vermur hace hoy, no una ley.
  const sugBanco = sugerirBancoVermur(ocLocal, {
    categoriaConcepto,
    tiposProveedor: proveedor?.tipos,
  });
  const sugCuenta = sugerirCuentaProveedor(proveedor, ocLocal);
  const bancoElegido = (oc.bancoSalida as BancoVermur | null) ?? sugBanco.banco;
  const cuentaElegidaId = oc.cuentaBancariaId ?? sugCuenta.cuenta?.id ?? '';
  const cuentasOfrecidas = sugCuenta.cuenta
    ? [sugCuenta.cuenta, ...sugCuenta.alternativas]
    : sugCuenta.alternativas;

  // 1.3 · Anticipos ya pagados a este proveedor que se pueden descontar.
  const cruzables = anticiposAplicables(oc, todasLasOrdenes);
  const aTransferir = montoATransferir(oc);

  // Tarea 36 · IVA esperado vs. declarado en la factura del proveedor.
  const ivaOC: ResultadoComparacionIVA | null = oc.facturaDatos
    ? compararIVAFactura(oc, reglaIVA)
    : null;

  return (
    <FichaLayout>
      <FichaHeader
        modulo="Cuentas por pagar"
        onBack={onBack}
        folio={oc.folio}
        titulo={oc.proveedorNombre}
        regresarLabel={regresarLabel}
        badges={
          <>
            <BadgeEstado tono={TONO_ESTADO[oc.estado]}>
              {ESTADOS_OC_MAP[oc.estado]?.label ?? oc.estado}
            </BadgeEstado>
            {oc.urgencia === 'urgente' && <BadgeEstado tono="peligro">Urgente</BadgeEstado>}
            {oc.esAnticipo && <BadgeEstado tono="neutro">Anticipo</BadgeEstado>}
            <BadgeEstado tono="neutro">
              {oc.origen === 'embarque' ? 'De un embarque' : 'Gasto de oficina'}
            </BadgeEstado>
          </>
        }
        subtitulo={
          <p className="font-black text-primario tabular-nums">
            ${money(oc.monto)} <span className="text-sm font-medium text-gray-400">{oc.moneda}</span>
          </p>
        }
        acciones={(() => {
          if (terminada) return undefined;
          const primarios = disponibles.filter(e => e !== 'rechazada');
          const items: AccionMenu[] = [];
          if (disponibles.includes('rechazada'))
            items.push({
              id: 'rechazar', label: 'Rechazar', variante: 'peligro',
              icono: <XCircle className="w-3.5 h-3.5" />,
              onClick: () => onTransicionar('rechazada', { motivoRechazo: motivo.trim() || null }),
            });
          return (
            <AccionesHeader items={items}>
              {primarios.map(estado => (
                <button
                  key={estado}
                  onClick={() => onTransicionar(estado, {
                    comprobantePago: comprobante.trim() || null,
                    facturaAsociada: factura.trim() || null,
                  })}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> {ACCION[estado]}
                </button>
              ))}
            </AccionesHeader>
          );
        })()}
      />

      {/*
       * UNA sola área con scroll (29-sep-2026).
       *
       * Antes, seis bloques —enlaces, fondeo, registrar depósito, ruta del
       * pago, anticipos y el avance— vivían FUERA de `FichaContenido`, o sea
       * fijos, y solo «Qué se paga» y lo de abajo scrolleaba. En una pantalla
       * baja eso deja al área con scroll una rendija de unos pocos píxeles,
       * con una barra casi invisible: Luis vio la ficha cortada justo bajo el
       * avance y dio por hecho que ahí terminaba.
       *
       * No se usa `FichaContenido` porque su `p-6` duplicaría el `px-6` que
       * cada bloque ya trae. El contenedor es de ESTA ficha: las otras ocho
       * que comparten FichaLayout no se tocan.
       */}
      <div className="flex-1 overflow-y-auto pb-6">
      {oc.origen === 'embarque' && oc.embarqueId && (
        <div className="px-6 pt-3">
          <BloqueEnlaces
            titulo="Embarque"
            tipo="embarque"
            ids={[oc.embarqueId]}
            vacio=""
          />
        </div>
      )}

      {/* Lo primero que hay que saber de una orden es qué se paga y a quién.
         Estaba hasta el final y más angosto que el resto. */}
      <div className="px-6 pt-3">
          {/* ── Qué se paga y a quién ─────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-[10px] font-bold text-primario uppercase tracking-widest border-b border-gray-100 pb-2">
              Qué se paga
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <Dato icono={<Building2 className="w-3.5 h-3.5" />} rotulo="Proveedor" valor={oc.proveedorNombre} />
              <Dato icono={<Package className="w-3.5 h-3.5" />} rotulo="Concepto" valor={oc.conceptoNombre} />
              {oc.origen === 'embarque' && (
                <>
                  <Dato icono={<Ship className="w-3.5 h-3.5" />} rotulo="Embarque" valor={oc.embarqueFolio ?? '—'} />
                  <Dato icono={<Building2 className="w-3.5 h-3.5" />} rotulo="Cliente" valor={oc.clienteNombre ?? '—'} />
                </>
              )}
              <Dato icono={<Calendar className="w-3.5 h-3.5" />} rotulo="Se necesita el" valor={oc.fechaRequerida || '—'} />
              <Dato icono={<Calendar className="w-3.5 h-3.5" />} rotulo="Pago sugerido" valor={oc.fechaSugeridaPago ?? 'Sin calcular'} />
            </div>
            {oc.descripcion && (
              <p className="text-[12px] text-gray-600 border-t border-gray-100 pt-3">{oc.descripcion}</p>
            )}
          </div>
      </div>

      {/* ── Tarea 36 · Alerta de IVA ─────────────────────────────────────
          Solo cuando hay facturaDatos: muestra si el IVA de la factura
          cuadra con el esperado por la regla del concepto. Solo alerta,
          no bloquea nada. */}
      {ivaOC && ivaOC.estado !== 'sin_factura' && (
        <div className="px-6 pt-3">
          <div className={`rounded-lg border px-4 py-2.5 flex items-start gap-2 ${
            ivaOC.estado === 'cuadra'
              ? 'border-emerald-200 bg-emerald-50/40'
              : ivaOC.estado === 'no_cuadra'
                ? 'border-amber-300 bg-amber-50/60'
                : 'border-gray-200 bg-gray-50/40'
          }`}>
            {ivaOC.estado === 'cuadra' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            ) : ivaOC.estado === 'no_cuadra' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 text-[12px]">
              {ivaOC.estado === 'cuadra' ? (
                <p className="text-emerald-800">
                  IVA cuadra: esperado ${money(ivaOC.ivaEsperado!)} · factura ${money(ivaOC.ivaDeclarado!)}
                  {ivaOC.retencionEsperada ? ` · retención esperada ${money(ivaOC.retencionEsperada)}` : ''}
                </p>
              ) : (
                <p className={ivaOC.estado === 'no_cuadra' ? 'text-amber-900 font-semibold' : 'text-gray-600'}>
                  {ivaOC.mensaje}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 1.1 · El fondeo del cliente ────────────────────────────────────
          «Tenemos que esperar el dinero del cliente para pagarle al
          proveedor». Administración necesita ver ESO al decidir, no
          descubrirlo cuando el botón de autorizar le diga que no. */}
      {oc.origen === 'embarque' && fondeo && (
        <div className="px-6 pt-3">
          <div className={`rounded-lg border px-4 py-3 ${
            veredicto.puedeAutorizar
              ? 'border-emerald-200 bg-emerald-50/40'
              : 'border-amber-300 bg-amber-50/60'
          }`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                  Fondeo del cliente
                  {esImpuestos && (
                    <span className="ml-2 text-amber-700 normal-case tracking-normal font-semibold">
                      · Pago de impuestos: no se financia
                    </span>
                  )}
                </p>
                {/* Un cero explícito, no un guion: «depositado —» se lee como
                    «no aplica» cuando lo que dice es «no ha llegado nada», y
                    esa diferencia es justo la que frena el pago. */}
                <p className="text-[12px] text-gray-700 mt-1">
                  Depositado <strong>{formatearPorMoneda(fondeo.depositado, { vacio: `${oc.moneda} 0.00` })}</strong>
                  {' · '}comprometido <strong>{formatearPorMoneda(fondeo.comprometido, { vacio: `${oc.moneda} 0.00` })}</strong>
                </p>
                {!veredicto.puedeAutorizar && veredicto.motivo && (
                  <p className="text-[11px] text-amber-800 mt-1.5">{veredicto.motivo}</p>
                )}
              </div>

              {/* El flag manual. Solo Administración, que es quien concilia. */}
              {puedeMarcarNoPagar && !terminada && (
                <button
                  type="button"
                  onClick={() => onActualizar(
                    oc.noPagar
                      ? { noPagar: false, motivoNoPagar: null }
                      : { noPagar: true, motivoNoPagar: window.prompt('¿Por qué se detiene este pago?')?.trim() || null },
                  )}
                  className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-md border transition-colors ${
                    oc.noPagar
                      ? 'border-red-300 bg-red-100 text-red-800 hover:bg-red-200'
                      : 'border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600'
                  }`}
                  title={oc.noPagar ? 'Quitar la marca y permitir el pago' : 'Detener este pago sin rechazar la orden'}
                >
                  {oc.noPagar ? 'Quitar «No pagar»' : 'Marcar «No pagar»'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 1.1 · Registrar el depósito del cliente ─────────────────────────
          El dinero que fondea esta orden. Sin este formulario el fondeo solo
          se alimentaba de cobros de facturas; el anticipo previo a operar no
          se podía capturar en ninguna pantalla. */}
      {oc.origen === 'embarque' && oc.embarqueId && !terminada && onRegistrarDeposito && (
        <div className="px-6 pt-3">
          <div className="rounded-lg border border-card-border bg-white px-4 py-3 space-y-2">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Registrar depósito del cliente</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Monto ({oc.moneda})</span>
                <input type="number" min={0} step="0.01" value={depMonto} onChange={e => setDepMonto(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 text-[12px] border border-card-border rounded-md outline-none focus:border-brand tabular-nums" />
              </label>
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Fecha</span>
                <input type="date" value={depFecha} onChange={e => setDepFecha(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] border border-card-border rounded-md outline-none focus:border-brand" />
              </label>
              <label className="block">
                <span className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Referencia</span>
                <input value={depRef} onChange={e => setDepRef(e.target.value)} placeholder="Ref. bancaria"
                  className="w-full px-3 py-2 text-[12px] border border-card-border rounded-md outline-none focus:border-brand font-mono" />
              </label>
              <button
                type="button"
                disabled={depGuardando || !(Number(depMonto) > 0) || !depRef.trim()}
                onClick={async () => {
                  setDepGuardando(true); setDepError(null);
                  try {
                    await onRegistrarDeposito({ monto: Math.round(Number(depMonto) * 100) / 100, moneda: oc.moneda, fechaDeposito: depFecha, referencia: depRef.trim() });
                    setDepMonto(''); setDepRef('');
                  } catch (err) {
                    setDepError(err instanceof Error ? err.message : String(err));
                  } finally { setDepGuardando(false); }
                }}
                className="px-3 py-2 bg-[#18181B] hover:bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {depGuardando ? 'Guardando…' : 'Registrar depósito'}
              </button>
            </div>
            {depError && <p className="text-[11px] text-red-600 font-semibold">{depError}</p>}
            <p className="text-[10px] text-gray-400">Entra al fondeo del embarque {oc.embarqueFolio ?? ''}: es lo que libera este pago y los demás del mismo embarque.</p>
          </div>
        </div>
      )}

      {/* ── 1.2 · De dónde sale y a dónde entra ────────────────────────────
          Un proveedor puede tener una cuenta por servicio, y depositar en la
          equivocada no rebota: se descubre cuando reclama que no le pagaron.
          Por eso se resuelve ANTES de autorizar, no al momento de transferir. */}
      {!terminada && (rol === 'administracion' || rol === 'admin') && (
        <div className="px-6 pt-3">
          <div className="rounded-lg border border-card-border bg-white px-4 py-3 space-y-3">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
              Ruta del pago
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Banco de Vermur */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                  Sale de
                </label>
                <select
                  value={bancoElegido}
                  onChange={e => onActualizar({ bancoSalida: e.target.value })}
                  className="w-full px-3 py-2 text-[12px] bg-white border border-card-border rounded-md outline-none focus:border-brand"
                >
                  {BANCOS_VERMUR.map(b => (
                    <option key={b.id} value={b.id} disabled={!b.monedas.includes(oc.moneda)}>
                      {b.nombre} — {b.usoHabitual}
                      {!b.monedas.includes(oc.moneda) ? ` (no opera ${oc.moneda})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {oc.bancoSalida
                    ? `Elegido a mano. Se sugería ${BANCOS_VERMUR_MAP[sugBanco.banco].nombre}: ${sugBanco.razon.toLowerCase()}`
                    : `Sugerido: ${sugBanco.razon}`}
                </p>
                {sugBanco.aviso && !oc.bancoSalida && (
                  <p className="text-[10px] text-amber-700 mt-0.5">{sugBanco.aviso}</p>
                )}
              </div>

              {/* Cuenta del proveedor */}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                  Entra a — cuenta de {oc.proveedorNombre}
                </label>
                {cuentasOfrecidas.length === 0 ? (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                    {sugCuenta.aviso ?? sugCuenta.razon}
                  </p>
                ) : (
                  <>
                    <select
                      value={cuentaElegidaId}
                      onChange={e => onActualizar({ cuentaBancariaId: e.target.value || null })}
                      className={`w-full px-3 py-2 text-[12px] bg-white border rounded-md outline-none focus:border-brand ${
                        cuentaElegidaId ? 'border-card-border' : 'border-amber-400'
                      }`}
                    >
                      <option value="">— Elige la cuenta —</option>
                      {cuentasOfrecidas.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.banco} · {c.moneda} · ···{c.clabe.slice(-4)}
                        </option>
                      ))}
                    </select>
                    <p className={`text-[10px] mt-1 ${sugCuenta.aviso ? 'text-amber-700' : 'text-gray-400'}`}>
                      {sugCuenta.aviso ?? sugCuenta.razon}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 1.3 · Anticipos ────────────────────────────────────────────────
          Un transportista cobra 50% adelantado y semanas después manda la
          factura por el total. Sin descontar lo entregado, Vermur paga dos
          veces la mitad del flete. */}
      {!oc.esAnticipo && !terminada && (cruzables.length > 0 || (oc.anticiposCruzados ?? []).length > 0) && (
        <div className="px-6 pt-3">
          <div className="rounded-lg border border-card-border bg-white px-4 py-3 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                Anticipos aplicados
              </p>
              {(oc.anticiposCruzados ?? []).length > 0 && (
                <p className="text-[12px] text-gray-700">
                  A transferir: <strong>{oc.moneda} {money(aTransferir)}</strong>
                  <span className="text-gray-400"> de {oc.moneda} {money(oc.monto)}</span>
                </p>
              )}
            </div>

            {(oc.anticiposCruzados ?? []).map(a => (
              <div key={a.ocId} className="flex items-center justify-between gap-3 text-[12px] border border-emerald-200 bg-emerald-50/40 rounded-md px-3 py-1.5">
                <span className="text-gray-700">
                  <span className="font-mono text-[11px] text-gray-500">{a.folio}</span>
                  {' · '}<strong>{a.moneda} {money(a.montoAplicado)}</strong>
                </span>
                {puedeMarcarNoPagar && (
                  <button
                    type="button"
                    onClick={() => onActualizar(quitarAnticipo(oc, a.ocId))}
                    className="text-[10px] font-bold text-gray-400 hover:text-red-600"
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}

            {cruzables.length > 0 && puedeMarcarNoPagar && (
              <div className="pt-1 space-y-1.5">
                <p className="text-[10px] text-gray-400">
                  Pagados a {oc.proveedorNombre} y sin usar:
                </p>
                {cruzables.map(({ anticipo, disponible }) => (
                  <div key={anticipo.id} className="flex items-center justify-between gap-3 text-[12px] border border-gray-200 rounded-md px-3 py-1.5">
                    <span className="text-gray-700">
                      <span className="font-mono text-[11px] text-gray-500">{anticipo.folio}</span>
                      {' · '}disponible <strong>{anticipo.moneda} {money(disponible)}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        // Se aplica lo que alcance: nunca más de lo disponible
                        // ni más de lo que la orden debe.
                        const sugerido = Math.min(disponible, aTransferir);
                        const texto = window.prompt(
                          `¿Cuánto de ${anticipo.folio} se aplica a esta orden? (máximo ${anticipo.moneda} ${money(sugerido)})`,
                          String(sugerido),
                        );
                        if (texto === null) return;
                        const monto = Number(texto);
                        const r = aplicarAnticipo(oc, anticipo, monto, todasLasOrdenes);
                        if (!r.ok) { window.alert(r.error); return; }
                        onActualizar(r.cambios!);
                      }}
                      className="text-[10px] font-bold text-brand hover:text-brand-hover"
                    >
                      Aplicar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-6 pt-3">
        <LineaTiempo
          titulo="Avance de la orden"
          pasos={PASOS}
          indiceActual={oc.estado === 'rechazada'
            ? PASOS.length - 1
            : PASOS.findIndex(p => p.id === oc.estado)}
          fallido={oc.estado === 'rechazada'}
        />
      </div>

        <div className="px-6 pt-3 space-y-6">

          {/* ── Papeles: la factura del proveedor y el comprobante ─────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-[10px] font-bold text-primario uppercase tracking-widest border-b border-gray-100 pb-2">
              Documentos
            </h4>

            <Campo
              rotulo="Factura del proveedor"
              ayuda="Puede llegar después de autorizar. No bloquea nada."
              valor={factura}
              onChange={setFactura}
              onGuardar={() => onActualizar({ facturaAsociada: factura.trim() || null })}
              soloLectura={terminada}
            />

            <Campo
              rotulo="Comprobante de pago"
              ayuda="Sin él no se puede marcar como pagada: el comprobante ES la prueba de que salió el dinero."
              valor={comprobante}
              onChange={setComprobante}
              onGuardar={() => onActualizar({ comprobantePago: comprobante.trim() || null })}
              soloLectura={terminada}
            />
          </div>

          {/* ── Historial: quién movió qué y cuándo ────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-3">
            <h4 className="text-[10px] font-bold text-primario uppercase tracking-widest border-b border-gray-100 pb-2">
              Historial
            </h4>
            {(oc.historialEstados ?? []).length === 0 ? (
              <p className="text-[11px] text-gray-400">
                Todavía no ha cambiado de estado desde que se solicitó.
              </p>
            ) : (
              <div className="space-y-2.5 pl-2 border-l-2 border-gray-100 ml-1">
                {oc.historialEstados.map((h, i) => (
                  <div key={`${h.estado}-${i}`} className="relative pl-4">
                    <div className="absolute -left-[7px] top-1.5 w-2.5 h-2.5 rounded-full bg-primario/30 border-2 border-white" />
                    <p className="text-[12px] text-gray-700 font-medium">
                      {ESTADOS_OC_MAP[h.estado]?.label ?? h.estado}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {h.usuarioNombre} · {h.fecha.slice(0, 16).replace('T', ' ')}
                      {h.motivo && ` · ${h.motivo}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Rechazo: el motivo va antes que el botón ───────────────── */}
          {!terminada && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-2">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Motivo de rechazo
              </h4>
              <p className="text-[10px] text-gray-400">
                Se pide antes de rechazar. Una orden rechazada sin motivo no
                explica qué corregir para volver a pedirla.
              </p>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                onBlur={() => onActualizar({ motivoRechazo: motivo.trim() || null })}
                placeholder="Duplicada, monto incorrecto, falta la factura…"
                className="w-full h-16 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario resize-none"
              />
            </div>
          )}

          {oc.estado === 'rechazada' && oc.motivoRechazo && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Rechazada</p>
              <p className="text-[12px] text-red-900 mt-0.5">{oc.motivoRechazo}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: solo avisos de bloqueo y estado terminal (tarea 44) ── */}
      {(bloqueados.length > 0 || terminada) && (
      <FichaFooter>
        <div className="flex flex-col gap-1 max-w-3xl mx-auto w-full">
          {bloqueados.map(({ estado, r }) => (
            <p
              key={estado}
              className="flex items-start gap-1.5 text-[11px] text-amber-800 leading-snug"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-px" />
              <span>
                <span className="font-bold">Para «{ACCION[estado]}»:</span> {r.razon}
              </span>
            </p>
          ))}
          {terminada && (
            <p className="text-center text-[11px] text-gray-400">
              Esta orden ya está {oc.estado === 'pagada' ? 'pagada' : 'rechazada'}: no admite más cambios.
            </p>
          )}
        </div>
      </FichaFooter>
      )}
    </FichaLayout>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

function Dato({ icono, rotulo, valor }: { icono: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{rotulo}</p>
      <div className="flex items-center gap-2 text-[12px] text-gray-700 font-medium">
        <span className="text-gray-400 shrink-0">{icono}</span>
        <span className="truncate">{valor}</span>
      </div>
    </div>
  );
}

function Campo({
  rotulo, ayuda, valor, onChange, onGuardar, soloLectura,
}: {
  rotulo: string;
  ayuda: string;
  valor: string;
  onChange: (v: string) => void;
  onGuardar: () => void;
  soloLectura: boolean;
}) {
  return (
    <div>
      <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
        {rotulo}
      </label>
      <input
        value={valor}
        onChange={e => onChange(e.target.value)}
        onBlur={onGuardar}
        readOnly={soloLectura}
        placeholder="Referencia o liga del documento"
        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-primario read-only:text-gray-500"
      />
      <p className="text-[10px] text-gray-400 mt-1">{ayuda}</p>
    </div>
  );
}
