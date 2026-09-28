/**
 * useConceptos.ts
 *
 * Hook que sincroniza conceptos con Firestore.
 *
 * Comportamiento (mismo patrón que useProveedores / usePuertos):
 *  1. Abre un listener onSnapshot sobre la colección 'conceptos'.
 *  2. Si la colección está vacía (primera vez), escribe el seed de
 *     initialConceptos usando setDoc → preserva el id como document ID.
 *  3. Expone { conceptos, loading, error, createConcepto, updateConcepto }.
 */

import { useState, useEffect } from 'react';
import { compararTexto } from '../lib/texto';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocsFromServer } from 'firebase/firestore';
import { evaluarSeed } from '../lib/seedGuard';
import { ConceptoVermur, initialConceptos } from '../components/conceptos/ConceptosData';
import { useAuth } from '../auth/AuthContext';
import { conAviso } from '../lib/erroresEscritura';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

/**
 * Compartido por TODAS las instancias del hook: el seed corre una vez por
 * carga de la app, no una por componente que lo monte. Ver el comentario de
 * abajo.
 */
let seedIntentado = false;

export function useConceptos() {
  const { user } = useAuth();

  const [conceptos, setConceptos] = useState<ConceptoVermur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
   * El candado del seed vive a nivel de MÓDULO, no del hook.
   *
   * Era un `useRef`, o sea uno por INSTANCIA. Montar el hook en dos módulos
   * —cotizaciones y embarques— creaba dos sembradores compitiendo: el
   * recorrido e2e falló dos veces seguidas al elegir concepto, con el catálogo
   * a medio sembrar.
   *
   * `evaluarSeed` ya descarta los snapshots de caché y `getDocsFromServer`
   * confirma contra el servidor antes de escribir, pero las dos barreras son
   * por instancia: dos hooks pueden pasarlas a la vez. El candado compartido
   * cierra la ventana en el cliente, que es donde nace.
   *
   * Mismo patrón (`useRef`) en usePuertos, useTerminosPago, useProveedores,
   * useClientes y useCotizaciones. Ahí el riesgo no se ha materializado porque
   * cada uno se monta en un solo lugar; anotado, sin tocar.
   */

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, 'conceptos'),
      async (snapshot) => {
        // ── ¿Se puede sembrar? ────────────────────────────────────────────
        // evaluarSeed descarta los snapshots de caché: uno vacío NO prueba que
        // la colección esté vacía en el servidor, solo que este cliente aún no
        // la bajó. Ver src/lib/seedGuard.ts.
        if (evaluarSeed(snapshot, seedIntentado).sembrar) {
          seedIntentado = true;
          try {
            // Segunda barrera, ya con el servidor de por medio: confirma que
            // 'conceptos' sigue vacía justo antes de escribir. Cubre la carrera
            // con otra pestaña sembrando al mismo tiempo, y falla si no hay red
            // en vez de sembrar a ciegas.
            const enServidor = await getDocsFromServer(collection(db, 'conceptos'));
            if (!enServidor.empty) {
              console.warn('[seed] conceptos: el servidor ya tiene ' + enServidor.size + ' documentos. No se siembra.');
              return;
            }

            await conAviso('los conceptos iniciales', () => Promise.all(
              initialConceptos.map(c =>
                setDoc(doc(db, 'conceptos', c.id), sanitizarParaFirestore(c))
              )
            ));
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Error al sembrar conceptos iniciales';
            setError(msg);
            setLoading(false);
          }
          return;
        }

        // Snapshot que no autoriza sembrar: se pinta tal cual. Si venía de
        // caché, el snapshot del servidor llegará después y volverá a evaluar.

        // ── Snapshot con datos (normal o post-seed) ───────────────────────
        const data: ConceptoVermur[] = [];
        snapshot.forEach(docSnap => {
          data.push({ id: docSnap.id, ...docSnap.data() } as ConceptoVermur);
        });

        // Alfabético por nombre.
        // Bloque 4: un documento sin `nombre` tiraba la app entera al cargar.
        data.sort((a, b) => compararTexto(a.nombre, b.nombre));

        setConceptos(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ── Writes ───────────────────────────────────────────────────────────────

  const createConcepto = async (concepto: ConceptoVermur): Promise<void> => {
    await conAviso('el concepto', () => setDoc(doc(db, 'conceptos', concepto.id), sanitizarParaFirestore(concepto)));
  };

  const updateConcepto = async (id: string, data: Partial<ConceptoVermur>): Promise<void> => {
    // La regla de IVA y las claves SAT de un concepto se propagan a cada
    // factura que se emita con él: editarlas es de Administración (B3).
    // createConcepto queda sin guarda a propósito — es el alta rápida desde la
    // cotización, que nace en 'revisar' precisamente para que Administración
    // la resuelva aquí.
    exigir(user?.rol as UserRole | undefined, 'concepto.editar');
    await conAviso('el concepto', () => updateDoc(doc(db, 'conceptos', id), sanitizarParaFirestore(data) as Record<string, unknown>));
  };

  return { conceptos, loading, error, createConcepto, updateConcepto };
}
