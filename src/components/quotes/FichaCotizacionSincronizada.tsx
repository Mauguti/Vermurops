import React from 'react';
import FichaCotizacion from './FichaCotizacion';
import { useCotizacionAbierta } from '../../hooks/useCotizacionAbierta';
import type { KanbanQuote } from './QuotesData';

type PropsFicha = React.ComponentProps<typeof FichaCotizacion>;

/**
 * La ficha, con lo ajeno adoptado y el aviso de conflicto (tarea 122, P4).
 * Es un componente aparte porque los tres hosts abren la ficha de forma
 * condicional y un hook no puede ir dentro de un `if`. `quote` es la copia
 * del host; `lista`, la del listener.
 */
export default function FichaCotizacionSincronizada({
  quote, lista, ...resto
}: Omit<PropsFicha, 'conflictos' | 'onRecargar'> & { lista: readonly KanbanQuote[] }) {
  const { quote: abierta, conflictos, recargar } = useCotizacionAbierta(quote, lista);
  return <FichaCotizacion {...resto} quote={abierta} conflictos={conflictos} onRecargar={recargar} />;
}
