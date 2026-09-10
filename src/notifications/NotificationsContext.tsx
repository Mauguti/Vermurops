import React, {
  createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect
} from 'react';
import { Notificacion, INITIAL_NOTIFICATIONS } from './notificationsStore';
import { useAuth } from '../auth/AuthContext';
import { UserRole } from '../auth/users';
import { db } from '../firebase';
import { sanitizarParaFirestore } from '../lib/sanitizarFirestore';
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// NotificationsContext — estado global del centro de notificaciones
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationsContextValue {
  /** Todas las notificaciones (sin filtrar por rol) */
  todasLasNotificaciones: Notificacion[];
  /** Notificaciones filtradas según el rol del usuario actual */
  notificaciones: Notificacion[];
  agregarNotificacion: (n: Notificacion) => void;
  marcarLeida: (id: string) => void;
  marcarTodasLeidas: () => void;
  conteoNoLeidas: number;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [todasLocales, setTodasLocales] = useState<Notificacion[]>(INITIAL_NOTIFICATIONS);
  const [firestoreNotifs, setFirestoreNotifs] = useState<Notificacion[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notificaciones'),
      where('destinatarioId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notificacion[] = [];
      snapshot.forEach(d => {
        notifs.push({ id: d.id, ...d.data() } as Notificacion);
      });
      setFirestoreNotifs(notifs);
    }, (error) => {
      console.error("Error fetching notificaciones: ", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Filtrar y combinar
  const notificaciones = useMemo(() => {
    if (!user) return [];
    const localFiltered = todasLocales.filter(n => {
      if (user.rol === 'admin') return true;
      return n.destinatarios && n.destinatarios.includes(user.rol as UserRole);
    });
    const combined = [...firestoreNotifs, ...localFiltered];
    combined.sort((a, b) => {
      const tA = a.timestamp || a.fecha || '';
      const tB = b.timestamp || b.fecha || '';
      return tB.localeCompare(tA);
    });
    return combined;
  }, [todasLocales, firestoreNotifs, user]);

  const conteoNoLeidas = useMemo(
    () => notificaciones.filter(n => !n.leida).length,
    [notificaciones]
  );

  const agregarNotificacion = useCallback(async (n: Notificacion) => {
    // Si es para alguien en especifico, guardamos en Firestore
    if (n.destinatarioId) {
      try {
        const { id, ...data } = n;
        // Firestore rechaza `undefined` y tumba la escritura entera; el chat
        // mandaba `cotizacionFolio: quote.folio` (campo que no existe) y
        // NINGUNA notificación de chat se guardaba. Mismo estándar que los
        // hooks: sanitizar antes de escribir.
        await addDoc(collection(db, 'notificaciones'), sanitizarParaFirestore(data));
      } catch (err) {
        console.error("Error adding notification:", err);
      }
    } else {
      setTodasLocales(prev => [n, ...prev]);
    }
  }, []);

  const marcarLeida = useCallback(async (id: string) => {
    if (id.startsWith('notif-mock') || id.startsWith('notif-')) {
      // Local
      setTodasLocales(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n));
    } else {
      // Firestore
      try {
        await updateDoc(doc(db, 'notificaciones', id), { leida: true });
      } catch (err) {
        console.error("Error marking as read:", err);
      }
    }
  }, []);

  const marcarTodasLeidas = useCallback(async () => {
    if (!user) return;
    // Local
    setTodasLocales(prev =>
      prev.map(n => {
        if (user.rol === 'admin' || (n.destinatarios && n.destinatarios.includes(user.rol as UserRole))) {
          return { ...n, leida: true };
        }
        return n;
      })
    );
    // Firestore
    try {
      const unread = firestoreNotifs.filter(n => !n.leida);
      if (unread.length > 0) {
        const batch = writeBatch(db);
        unread.forEach(n => {
          batch.update(doc(db, 'notificaciones', n.id), { leida: true });
        });
        await batch.commit();
      }
    } catch (err) {
      console.error("Error marking all as read:", err);
    }
  }, [user, firestoreNotifs]);

  return (
    <NotificationsContext.Provider value={{
      todasLasNotificaciones: [...firestoreNotifs, ...todasLocales],
      notificaciones,
      agregarNotificacion,
      marcarLeida,
      marcarTodasLeidas,
      conteoNoLeidas,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return ctx;
}
