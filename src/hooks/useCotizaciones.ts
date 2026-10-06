/**
 * useCotizaciones.ts
 *
 * Hook que sincroniza cotizaciones con Firestore.
 *
 * Comportamiento:
 *  1. Abre un listener onSnapshot sobre la colección 'cotizaciones'.
 *  2. Si la colección está vacía (primera vez en el proyecto), escribe el
 *     seed de initialKanbanQuotes usando setDoc → preserva el folio como
 *     document ID, sin regenerarlo.
 *  3. Tras el seed, inicializa el contador (contadores/cotizaciones.ultimo)
 *     al número más alto encontrado en los folios del seed, para que el
 *     próximo generateFolio() continúe desde ahí.
 *  4. Expone { quotes, loading, error }.
 *
 * En E3.3 se conectará a Quotes.tsx reemplazando el useState local.
 * En E3.4 se añadirán createCotizacion y updateCotizacion.
 */

import { db } from '../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { KanbanQuote } from '../components/quotes/QuotesData';
import { useTiendaCatalogo, tiendaCotizaciones } from './tiendasCatalogos';
import { useAuth } from '../auth/AuthContext';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { puedeCrearCotizacion, PermisoDenegadoError } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso } from '../lib/erroresEscritura';
import { estaCongelada, cambiosBloqueados } from '../lib/lineasCotizacion';
import { guardadoAtrasado, numeroVersionActual, sinCamposDeVersion } from '../lib/versionesCotizacion';

/* El seed y su candado viven en tiendasCatalogos.ts (tarea 93). */

export function useCotizaciones() {
  const { user } = useAuth();

  const { datos: quotes, loading, error } = useTiendaCatalogo(tiendaCotizaciones, !!user);

  // ── Writes ───────────────────────────────────────────────────────────────

  /**
   * Creación de cotización.
   *
   * Ventas SOLICITA (la cotización nace en etapa de solicitud); Pricing y Admin
   * pueden abrirla en cualquier etapa; Operaciones no crea cotizaciones.
   */
  const createCotizacion = async (quote: KanbanQuote): Promise<void> => {
    const rol = user?.rol as UserRole | undefined;
    if (!puedeCrearCotizacion(rol, quote.etapa)) {
      throw new PermisoDenegadoError(
        rol,
        'cotizacion.crear',
        `El rol «${rol ?? 'sin sesión'}» no puede crear cotizaciones en la etapa «${quote.etapa}».`,
      );
    }
    await conAviso('la cotización', () => setDoc(doc(db, 'cotizaciones', quote.id), sanitizarParaFirestore(quote)));
  };

  /**
   * Actualiza la cotización.
   *
   * Sanitiza antes de escribir: Firestore RECHAZA `undefined` con «Unsupported
   * field value» y tumba la escritura entera. KanbanQuote tiene decenas de
   * campos opcionales anidados —conceptoId, vigencia, condiciones— y basta uno
   * en undefined para que no se guarde nada.
   *
   * Sin esto el fallo era invisible: la promesa se rechazaba, nadie la
   * atrapaba, el estado de React ya se había actualizado —así que en pantalla
   * parecía guardado— y al recargar el trabajo no estaba. Lo mismo que ya
   * resolvimos en useEmbarques.
   */
  const updateCotizacion = async (id: string, data: Partial<KanbanQuote>): Promise<void> => {
    /*
     * ── El congelado, de verdad (9-sep-2026) ─────────────────────────────
     * §4.8: «una vez que pasa a embarques ya así se queda». Hasta hoy eso
     * solo escondía botones: `camposBloqueados` existía y NINGÚN código de
     * producción lo llamaba, así que la cotización de un embarque abierto
     * seguía siendo editable por cualquier vía que no fuera la ficha.
     *
     * Se compara contra lo que ya está guardado y no contra las claves del
     * patch, porque los componentes mandan la cotización entera: `servicios`
     * viene siempre, cambie o no. Un `servicios` idéntico no es un cambio y
     * pasa; uno distinto se detiene aquí, que es donde importa.
     */
    const actual = quotes.find(q => q.id === id);

    /*
     * V-2 · Una pantalla que se quedó en una versión anterior no escribe.
     * Las pantallas reescriben la cotización ENTERA; si la nueva versión se
     * creó después de abrir la ficha, este guardado pisaría la bitácora y,
     * en una perdida, hasta la reapertura.
     */
    if (actual && guardadoAtrasado(actual, data)) {
      throw new Error(
        `${id} ya va en la v${numeroVersionActual(actual)} y esta pantalla tenía una versión anterior. `
        + 'Vuelve a abrir la ficha para no pisar el trabajo.',
      );
    }

    if (actual && estaCongelada(actual)) {
      const bloqueados = cambiosBloqueados(
        actual as unknown as Record<string, unknown>,
        data as Record<string, unknown>,
      );
      if (bloqueados.length > 0) {
        throw new Error(
          `${id} ya generó embarque: sus ${bloqueados.join(' y ')} no se pueden cambiar. `
          + 'Si el embarque necesita otra cosa, corrígelo en el embarque.',
        );
      }
    }

    await conAviso('la cotización', () => updateDoc(
      doc(db, 'cotizaciones', id),
      // Los campos de versión solo los escribe la transacción de
      // useVersionesCotizacion: aquí nunca viajan, vengan como vengan.
      sanitizarParaFirestore(sinCamposDeVersion(data)) as Record<string, unknown>,
    ));
  };

  return { quotes, loading, error, createCotizacion, updateCotizacion };
}
