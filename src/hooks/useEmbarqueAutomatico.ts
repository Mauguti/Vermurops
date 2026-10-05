/**
 * useEmbarqueAutomatico.ts — tarea 66.
 *
 * ¿Marcar una cotización como ganada abre su embarque solo?
 *
 * Lee UN documento (`contadores/configuracionEmbarques`) y nada más: lo
 * consultan dos pantallas grandes —Cotizaciones y Embarques— y suscribirlas a
 * la colección entera de contadores para un booleano sería ruido.
 *
 * **Falla cerrado.** Mientras la lectura no llega, mientras el documento no
 * existe y si la lectura falla, devuelve `false`: marcar ganada solo marca
 * ganada, que es lo que producción hace hoy. Lo contrario emitiría folios —que
 * van impresos en el BL y en el pedimento— por un parpadeo de carga.
 */

import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { docConfiguracionEmbarques, leerInterruptorEmbarque } from '../lib/folioService';
import { EMBARQUE_AUTOMATICO_PREDETERMINADO } from '../config/banderas';
import { useAuth } from '../auth/AuthContext';

export function useEmbarqueAutomatico(): { activo: boolean; cargando: boolean } {
  const { user } = useAuth();
  const [activo, setActivo] = useState(EMBARQUE_AUTOMATICO_PREDETERMINADO);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!user) { setCargando(false); return; }
    const unsub = onSnapshot(
      docConfiguracionEmbarques(),
      snap => {
        setActivo(leerInterruptorEmbarque(snap.exists() ? snap.data() : undefined).activo);
        setCargando(false);
      },
      () => { setActivo(EMBARQUE_AUTOMATICO_PREDETERMINADO); setCargando(false); },
    );
    return () => unsub();
  }, [user]);

  return { activo, cargando };
}
