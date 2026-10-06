/**
 * escrituraPagoProveedor.ts (tarea 85)
 *
 * Arma, SIN escribir, todo lo que cambia cuando se registra o se anula un pago
 * a proveedor: el documento del pago, cada orden que cubre y la bitácora de
 * cada embarque que toca. `hooks/escribirAtomico.ts` lo ejecuta en UNA
 * transacción de Firestore: o se escribe todo, o no se escribe nada.
 *
 * Antes eran escrituras sueltas en un bucle (el pago, luego orden por orden):
 * si una fallaba a la mitad quedaba un pago anulado con órdenes todavía
 * `pagada`, o un pago registrado con órdenes sin marcar.
 *
 * Aquí viven las validaciones y los campos de cada orden; los mismos que antes
 * ponían `transicionarEstado` y `revertirPago`, que siguen existiendo para las
 * demás transiciones de una orden.
 */

import type { OrdenCompra, EstadoOC, RegistroEstadoOC } from '../components/ordenesCompra/OrdenesCompraData';
import type { EntradaBitacora } from '../components/shipments/EmbarquesData';
import { puedeTransicionarOC, puedeRevertirPagoOC, ESTADO_TRAS_REVERSA_PAGO, type RolOC } from './stateMachineOC';
import { entradaSistema, tituloOC, type Autor } from './bitacoraEmbarque';
import type { MotivoCorreccion, Pago } from './pagos';

export type ColeccionAtomica = 'pagos' | 'ordenesCompra';

export interface EscrituraDoc {
  coleccion: ColeccionAtomica;
  id: string;
  /** `crear` es un set de documento nuevo; `actualizar` exige que exista. */
  tipo: 'crear' | 'actualizar';
  datos: Record<string, unknown>;
  /**
   * Estado que la orden debe tener en el SERVIDOR al escribir. Si otra sesión
   * ya la movió, la transacción se detiene: el plan se calculó sobre una foto
   * vieja.
   */
  esperaEstado?: EstadoOC;
}

export interface EscrituraBitacora {
  embarqueId: string;
  entrada: EntradaBitacora;
}

export interface PlanEscritura {
  documentos: EscrituraDoc[];
  bitacora: EscrituraBitacora[];
}

export interface ArchivoComprobante { storagePath: string; url: string; nombre: string }

const montoTexto = (o: OrdenCompra) =>
  `${o.moneda} ${o.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} · ${o.conceptoNombre}`;

/**
 * Registrar: crea el pago y pasa cada orden a `pagada`.
 * Lanza antes de armar nada si una orden no puede pasar a pagada.
 */
export function planRegistroPagoProveedor(args: {
  pago: Pago;
  grupo: readonly OrdenCompra[];
  referencia: string;
  archivo: ArchivoComprobante | null;
  rol: RolOC;
  usuario: Autor;
  ahora: string;
}): PlanEscritura {
  const { pago, grupo, referencia, archivo, rol, usuario, ahora } = args;
  const documentos: EscrituraDoc[] = [{ coleccion: 'pagos', id: pago.id, tipo: 'crear', datos: pago as unknown as Record<string, unknown> }];
  const bitacora: EscrituraBitacora[] = [];

  for (const orden of grupo) {
    const conRef = { ...orden, comprobantePago: referencia };
    const v = puedeTransicionarOC(orden.estado, 'pagada', rol, conRef);
    if (!v.ok) throw new Error(`${orden.folio}: ${v.razon}`);

    const registro: RegistroEstadoOC = {
      estado: 'pagada', fecha: ahora, usuarioId: usuario.uid, usuarioNombre: usuario.nombre,
    };
    documentos.push({
      coleccion: 'ordenesCompra', id: orden.id, tipo: 'actualizar', esperaEstado: orden.estado,
      datos: {
        comprobantePago: referencia,
        ...(archivo ? {
          documentos: [...(orden.documentos ?? []), {
            id: `doc-${Date.parse(ahora)}-${orden.id}`,
            tipo: 'comprobante_pago',
            nombre: archivo.nombre,
            storagePath: archivo.storagePath,
            url: archivo.url,
            subidoPor: usuario.nombre,
            fecha: pago.createdAt,
          }],
        } : {}),
        estado: 'pagada',
        historialEstados: [...orden.historialEstados, registro],
        pagadaPor: { uid: usuario.uid, nombre: usuario.nombre, fecha: ahora },
        updatedAt: ahora,
      },
    });
    if (orden.embarqueId) {
      bitacora.push({
        embarqueId: orden.embarqueId,
        entrada: entradaSistema('orden_compra',
          tituloOC('pagada', orden.folio, orden.proveedorNombre, usuario.nombre), usuario, ahora, montoTexto(orden)),
      });
    }
  }
  return { documentos, bitacora };
}

/**
 * Anular: marca el pago anulado y regresa cada orden a `autorizada` por el
 * arco de la máquina. Lanza si alguna no puede regresar.
 */
export function planAnulacionPagoProveedor(args: {
  pago: Pago;
  ordenes: readonly OrdenCompra[];
  motivo: string;
  rol: RolOC;
  usuario: Autor;
  ahora: string;
}): PlanEscritura {
  const { pago, ordenes, rol, usuario, ahora } = args;
  const motivo = args.motivo.trim();
  const anulacion: MotivoCorreccion = { motivo, por: usuario.nombre, en: ahora };
  const documentos: EscrituraDoc[] = [{
    coleccion: 'pagos', id: pago.id, tipo: 'actualizar',
    datos: { activo: false, updatedAt: ahora, anulacion },
  }];
  const bitacora: EscrituraBitacora[] = [];

  for (const orden of ordenes) {
    const v = puedeRevertirPagoOC(rol, orden);
    if (!v.ok) throw new Error(`${orden.folio}: ${v.razon}`);
    const registro: RegistroEstadoOC = {
      estado: ESTADO_TRAS_REVERSA_PAGO, fecha: ahora,
      usuarioId: usuario.uid, usuarioNombre: usuario.nombre,
      motivo: `Anulado el pago ${pago.folio}: ${motivo}`,
    };
    documentos.push({
      coleccion: 'ordenesCompra', id: orden.id, tipo: 'actualizar', esperaEstado: orden.estado,
      datos: {
        estado: ESTADO_TRAS_REVERSA_PAGO,
        historialEstados: [...orden.historialEstados, registro],
        pagadaPor: null,
        comprobantePago: null,
        updatedAt: ahora,
      },
    });
    if (orden.embarqueId) {
      bitacora.push({
        embarqueId: orden.embarqueId,
        entrada: entradaSistema('orden_compra',
          `${usuario.nombre} revirtió la orden de compra ${orden.folio} a ${orden.proveedorNombre}: se anuló el pago ${pago.folio}`,
          usuario, ahora, `Vuelve a «autorizada» · Motivo: ${motivo}`),
      });
    }
  }
  return { documentos, bitacora };
}
