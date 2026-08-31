import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

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

interface Contexto {
  irA: (destino: Destino) => void;
  /** No usar directo: es lo que consume `useDestinoPendiente`. */
  pendiente: Destino | null;
  consumir: () => void;
}

const Ctx = createContext<Contexto>({
  irA: () => {},
  pendiente: null,
  consumir: () => {},
});

export function NavegacionProvider({
  children, onCambiarVista,
}: {
  children: React.ReactNode;
  onCambiarVista: (vista: string) => void;
}) {
  const [pendiente, setPendiente] = useState<Destino | null>(null);

  const irA = useCallback((destino: Destino) => {
    setPendiente(destino);
    onCambiarVista(MODULO[destino.tipo]);
  }, [onCambiarVista]);

  const consumir = useCallback(() => setPendiente(null), []);

  return (
    <Ctx.Provider value={{ irA, pendiente, consumir }}>{children}</Ctx.Provider>
  );
}

/** Para los enlaces: «llévame a esta entidad». */
export function useNavegacion() {
  const { irA } = useContext(Ctx);
  return irA;
}

/**
 * Para los módulos: «¿alguien me mandó a abrir algo?».
 *
 * Llama a `abrir` una sola vez por destino y lo consume. El módulo decide qué
 * hacer con cada tipo; los que no le tocan los ignora y el destino se queda
 * para quien sí lo entienda.
 */
export function useDestinoPendiente(
  tipos: TipoEntidad[],
  abrir: (destino: Destino) => void,
) {
  const { pendiente, consumir } = useContext(Ctx);
  const atendido = useRef<string | null>(null);

  React.useEffect(() => {
    if (!pendiente) { atendido.current = null; return; }
    if (!tipos.includes(pendiente.tipo)) return;

    const clave = `${pendiente.tipo}:${pendiente.id}`;
    if (atendido.current === clave) return;
    atendido.current = clave;

    abrir(pendiente);
    consumir();
    // `abrir` y `tipos` se recrean en cada render de quien llama; depender de
    // ellos volvería a disparar el salto. La guarda es `pendiente`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente]);
}
