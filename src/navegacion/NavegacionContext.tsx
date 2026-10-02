import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * Navegación entre entidades (U-4).
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 * Los datos ya están relacionados: el embarque sabe de qué cotización nació,
 * la orden de compra sabe a qué embarque pertenece, el cliente tiene las suyas.
 * Lo que faltaba era que la navegación lo reflejara. Para ir de un embarque a
 * su cotización había que salir a la lista de cotizaciones y buscar el folio a
 * mano.
 *
 * ── Cómo funciona ──────────────────────────────────────────────────────────
 * `irA` hace dos cosas: cambia de módulo y deja anotado QUÉ abrir ahí. El
 * módulo destino lo recoge con `useDestinoPendiente` y lo consume una sola
 * vez — si se quedara, cerrar la ficha volvería a abrirla en el siguiente
 * render y no habría forma de salir.
 *
 * ── Origen (tarea 43) ──────────────────────────────────────────────────────
 * Cuando se salta de una ficha a otra (p. ej. del embarque a su cotización),
 * el salto captura la entidad abierta como «origen». El módulo destino
 * recibe el origen en `useDestinoPendiente` y puede ofrecer «Regresar a
 * EMB-0001» en vez de «Regresar a la lista».
 *
 * No guarda historial ni URL: es un salto, no un enrutador. Cuando la app
 * tenga rutas de verdad, esto se reemplaza por ellas.
 */

export type TipoEntidad =
  | 'cotizacion' | 'prospecto' | 'embarque' | 'cliente' | 'proveedor' | 'ordenCompra';

export interface Destino {
  tipo: TipoEntidad;
  id: string;
}

/** Módulo donde vive cada entidad. */
const MODULO: Record<TipoEntidad, string> = {
  cotizacion:  'quotes',
  prospecto:   'quotes',
  embarque:    'shipments',
  cliente:     'clients',
  proveedor:   'clients',
  ordenCompra: 'finance',
};

interface DestinoPendiente extends Destino {
  origen?: Destino;
}

interface Contexto {
  irA: (destino: Destino) => void;
  /** No usar directo: es lo que consume `useDestinoPendiente`. */
  pendiente: DestinoPendiente | null;
  consumir: () => void;
  /** Registra la entidad actualmente abierta, para capturar el origen al saltar. */
  registrarAbierta: (entidad: Destino | null) => void;
}

const Ctx = createContext<Contexto>({
  irA: () => {},
  pendiente: null,
  consumir: () => {},
  registrarAbierta: () => {},
});

export function NavegacionProvider({
  children, onCambiarVista, destinoInicial = null,
}: {
  children: React.ReactNode;
  onCambiarVista: (vista: string) => void;
  /**
   * Bloque 13 · Lo que pidió la URL (`?proveedor=PRV-0042`). Se salta UNA vez
   * al montar; después la URL ya no manda. Vive aquí y no en `AppShell`
   * porque `irA` solo existe dentro del proveedor.
   */
  destinoInicial?: Destino | null;
}) {
  const [pendiente, setPendiente] = useState<DestinoPendiente | null>(null);
  const abiertaRef = useRef<Destino | null>(null);

  const registrarAbierta = useCallback((entidad: Destino | null) => {
    abiertaRef.current = entidad;
  }, []);

  const irA = useCallback((destino: Destino) => {
    const conOrigen: DestinoPendiente = {
      ...destino,
      origen: abiertaRef.current ?? undefined,
    };
    setPendiente(conOrigen);
    onCambiarVista(MODULO[destino.tipo]);
  }, [onCambiarVista]);

  /*
   * El salto inicial va en un efecto y no en el `useState` de arriba: además
   * de dejar el destino pendiente hay que cambiar de módulo, y hacerlo
   * durante el render de otro componente es un `setState` en render.
   *
   * `saltoHecho` es una ref y no un estado: si fuera estado, el re-render que
   * provoca volvería a entrar aquí antes de que el valor nuevo esté leído.
   */
  const saltoHecho = useRef(false);
  useEffect(() => {
    if (saltoHecho.current || !destinoInicial) return;
    saltoHecho.current = true;
    irA(destinoInicial);
  }, [destinoInicial, irA]);

  const consumir = useCallback(() => setPendiente(null), []);

  return (
    <Ctx.Provider value={{ irA, pendiente, consumir, registrarAbierta }}>{children}</Ctx.Provider>
  );
}

/** Para los enlaces: «llévame a esta entidad». */
export function useNavegacion() {
  const { irA } = useContext(Ctx);
  return irA;
}

/** Para registrar la entidad abierta (el origen del próximo salto). */
export function useRegistrarAbierta() {
  const { registrarAbierta } = useContext(Ctx);
  return registrarAbierta;
}

/**
 * Para los módulos: «¿alguien me mandó a abrir algo?».
 *
 * Llama a `abrir` una sola vez por destino y lo consume. El módulo decide qué
 * hacer con cada tipo; los que no le tocan los ignora y el destino se queda
 * para quien sí lo entienda.
 *
 * El segundo parámetro de `abrir` es el origen: la ficha desde la que se
 * saltó. Cuando existe, «Regresar» debería llevar ahí, no a la lista.
 */
export function useDestinoPendiente(
  tipos: TipoEntidad[],
  abrir: (destino: Destino, origen?: Destino) => void,
) {
  const { pendiente, consumir } = useContext(Ctx);
  const atendido = useRef<string | null>(null);

  React.useEffect(() => {
    if (!pendiente) { atendido.current = null; return; }
    if (!tipos.includes(pendiente.tipo)) return;

    const clave = `${pendiente.tipo}:${pendiente.id}`;
    if (atendido.current === clave) return;
    atendido.current = clave;

    abrir(pendiente, pendiente.origen);
    consumir();
    // `abrir` y `tipos` se recrean en cada render de quien llama; depender de
    // ellos volvería a disparar el salto. La guarda es `pendiente`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente]);
}
