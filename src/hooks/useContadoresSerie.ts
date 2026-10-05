/**
 * useContadoresSerie.ts
 *
 * Lee y siembra los consecutivos de folio de cada serie de embarque.
 *
 * ── Por qué hace falta sembrarlos ──────────────────────────────────────────
 * Vermur trae folios históricos de Magaya: los ejemplos reales muestran
 * VLIT-24-107 y VLIA-24-020, o sea que cada serie ya iba por un número. Un
 * contador que arranca en 0 generaría VLIT-26-001 y duplicaría un folio que ya
 * existe en papel.
 *
 * Sembrar es fijar el último consecutivo usado en Magaya. A partir de ahí el
 * sistema continúa la serie.
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, collection, deleteField } from 'firebase/firestore';
import {
  SERIES_EMBARQUE, EstadoContadorSerie, DOC_CONFIG_EMBARQUES,
  docConfiguracionEmbarques, leerInterruptorEmbarque,
  type InterruptorEmbarqueAutomatico,
} from '../lib/folioService';
import {
  formatoParaGuardar, razonFormatoInvalido, type FormatoFolioSerie,
} from '../lib/formatoFolioSerie';
import { useAuth } from '../auth/AuthContext';
import { exigir } from '../auth/permisos';
import { UserRole } from '../auth/users';
import { conAviso } from '../lib/erroresEscritura';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';

export function useContadoresSerie() {
  const { user } = useAuth();
  const [contadores, setContadores] = useState<EstadoContadorSerie[]>([]);
  const [loading, setLoading] = useState(true);
  /*
   * Tarea 66 · El interruptor de la creación automática. Arranca APAGADO y se
   * queda apagado mientras la lectura no haya llegado: ver
   * `leerInterruptorEmbarque`, falla cerrado.
   */
  const [interruptor, setInterruptor] = useState<InterruptorEmbarqueAutomatico>(
    { activo: false },
  );

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const unsub = onSnapshot(collection(db, 'contadores'), (snap) => {
      const porSerie = new Map<string, EstadoContadorSerie>();
      let config: Record<string, unknown> | undefined;
      snap.forEach(d => {
        if (d.id === DOC_CONFIG_EMBARQUES) { config = d.data(); return; }
        if (!d.id.startsWith('embarques_')) return;
        const serie = d.id.replace('embarques_', '');
        const data = d.data();
        porSerie.set(serie, {
          serie,
          ultimo: (data.ultimo as number) ?? 0,
          sembrado: (data.sembrado as boolean) ?? false,
          fechaSiembra: data.fechaSiembra as string | undefined,
          sembradoPor: data.sembradoPor as string | undefined,
          formato: data.formato as Partial<FormatoFolioSerie> | undefined,
        });
      });

      // Las series que aún no tienen documento se muestran en cero, para que
      // se vea qué falta sembrar en vez de que simplemente no aparezcan.
      setContadores(SERIES_EMBARQUE.map(serie =>
        porSerie.get(serie) ?? { serie, ultimo: 0, sembrado: false },
      ));
      setInterruptor(leerInterruptorEmbarque(config));
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [user]);

  /**
   * Fija el consecutivo de una serie.
   *
   * Solo Admin: es mantenimiento, no una función del negocio, igual que la
   * importación masiva de catálogos.
   */
  const sembrarContador = async (serie: string, ultimo: number): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'catalogo.importarMasivo');
    if (!Number.isInteger(ultimo) || ultimo < 0) {
      throw new Error('El consecutivo debe ser un entero mayor o igual a cero.');
    }
    await conAviso('el consecutivo de folio', () => setDoc(doc(db, 'contadores', `embarques_${serie}`), sanitizarParaFirestore({
      ultimo,
      sembrado: true,
      fechaSiembra: new Date().toISOString(),
      sembradoPor: user?.email ?? '',
    }), { merge: true }));
  };

  /**
   * Guarda el formato del folio de una serie.
   *
   * Va en el MISMO documento que el consecutivo, así que la transacción que
   * reserva el folio ya lo tiene en la mano. Cuando el formato es el
   * predeterminado se BORRA el campo en vez de escribirlo: un documento con
   * cuatro campos que repiten el default hace creer que alguien lo configuró.
   *
   * Solo Admin, igual que sembrar: el folio va impreso en el BL y en el
   * pedimento, y cambiarlo a media serie deja dos formatos en el mismo año.
   */
  const guardarFormato = async (serie: string, formato: FormatoFolioSerie): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'catalogo.importarMasivo');
    const razon = razonFormatoInvalido(formato);
    if (razon) throw new Error(razon);

    const guardable = formatoParaGuardar(serie, formato);
    await conAviso('el formato del folio', () => setDoc(
      doc(db, 'contadores', `embarques_${serie}`),
      // deleteField() no pasa por sanitizarParaFirestore —que descarta
      // `undefined`—, así que el borrado se escribe aparte del resto.
      guardable
        ? sanitizarParaFirestore({ formato: guardable })
        : { formato: deleteField() },
      { merge: true },
    ));
  };

  /**
   * Enciende o apaga la creación automática de embarques.
   *
   * Encenderlo es decisión de Mau con el formato del folio confirmado por
   * Vermur: a partir de ese momento, marcar una cotización como ganada emite
   * folios que van impresos y que no se pueden recoger. Por eso queda apagado
   * y por eso la escritura guarda quién y cuándo.
   */
  const cambiarEmbarqueAutomatico = async (activo: boolean): Promise<void> => {
    exigir(user?.rol as UserRole | undefined, 'catalogo.importarMasivo');
    await conAviso('el interruptor de creación automática', () => setDoc(
      docConfiguracionEmbarques(),
      sanitizarParaFirestore({
        embarqueAutomatico: activo,
        fechaCambio: new Date().toISOString(),
        cambiadoPor: user?.email ?? '',
      }),
      { merge: true },
    ));
  };

  return {
    contadores, loading, sembrarContador, guardarFormato,
    embarqueAutomatico: interruptor, cambiarEmbarqueAutomatico,
  };
}
