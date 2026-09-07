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
import { formatearPorMoneda } from '../../lib/sumarPorMoneda';
import {
  FichaLayout, FichaHeader, FichaContenido, FichaFooter, BadgeEstado, TonoBadge,
} from '../ui/ficha/FichaLayout';
import { BloqueEnlaces } from '../ui/ficha/EnlaceEntidad';
import LineaTiempo from '../ui/ficha/LineaTiempo';

/**
 * C-2. La ficha de una orden de compra: el flujo de tres áreas.
 *
 *     PRICING solicita → OPERACIONES gestiona → ADMIN autoriza y paga
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
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FichaOC({
  oc, rol, onBack, onTransicionar, onActualizar, fondeo, proveedor, categoriaConcepto,
}: Props) {
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

  return (
    <FichaLayout>
      <FichaHeader
        modulo="Cuentas por pagar"
        onBack={onBack}
        folio={oc.folio}
        titulo={oc.proveedorNombre}
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
          <p className="font-black text-[#E11D48] tabular-nums">
            ${money(oc.monto)} <span className="text-sm font-medium text-gray-400">{oc.moneda}</span>
          </p>
        }
      />

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
                <p className="text-[12px] text-gray-700 mt-1">
                  Depositado <strong>{formatearPorMoneda(fondeo.depositado) || '—'}</strong>
                  {' · '}comprometido <strong>{formatearPorMoneda(fondeo.comprometido) || '—'}</strong>
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

      <FichaContenido>
        <div className="max-w-3xl space-y-6">

          {/* ── Qué se paga y a quién ─────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2">
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

          {/* ── Papeles: la factura del proveedor y el comprobante ─────── */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2">
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
            <h4 className="text-[10px] font-bold text-[#E11D48] uppercase tracking-widest border-b border-gray-100 pb-2">
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
                    <div className="absolute -left-[7px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#E11D48]/30 border-2 border-white" />
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
                className="w-full h-16 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-[#E11D48] resize-none"
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
      </FichaContenido>

      <FichaFooter>
        {disponibles.filter(e => e !== 'rechazada').map(estado => (
          <button
            key={estado}
            onClick={() => onTransicionar(estado, {
              comprobantePago: comprobante.trim() || null,
              facturaAsociada: factura.trim() || null,
            })}
            className="w-full max-w-3xl mx-auto px-4 py-3 bg-green-600 hover:bg-green-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4" /> {ACCION[estado]}
          </button>
        ))}

        {/* Qué falta, en vez de un botón que va a fallar. */}
        {bloqueados.map(({ estado, r }) => (
          <div
            key={estado}
            className="w-full max-w-3xl mx-auto px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Para «{ACCION[estado]}»
              </p>
              <p className="text-[12px] text-amber-900">{r.razon}</p>
            </div>
          </div>
        ))}

        {disponibles.includes('rechazada') && (
          <button
            onClick={() => onTransicionar('rechazada', { motivoRechazo: motivo.trim() || null })}
            className="w-full max-w-3xl mx-auto px-4 py-2.5 text-xs font-bold text-red-500 border border-red-200 bg-white hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" /> Rechazar
          </button>
        )}

        {terminada && (
          <p className="text-center text-[11px] text-gray-400">
            Esta orden ya está {oc.estado === 'pagada' ? 'pagada' : 'rechazada'}: no admite más cambios.
          </p>
        )}
      </FichaFooter>
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
        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[12px] outline-none focus:border-[#E11D48] read-only:text-gray-500"
      />
      <p className="text-[10px] text-gray-400 mt-1">{ayuda}</p>
    </div>
  );
}
