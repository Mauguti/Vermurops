import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { AuthUser, isViewAllowed, UserRole } from './users';
import { Capacidad, puede as puedeCapacidad } from './permisos';
import { auth } from '../firebase';

// ─────────────────────────────────────────────────────────────────────────────
// AuthContext — contexto global de autenticación para VermurOps
// ─────────────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  /** ¿El rol tiene acceso a la VISTA/módulo? (ALLOWED_VIEWS_BY_ROLE) */
  isAllowed: (view: string) => boolean;
  /** ¿El rol puede ejecutar la ACCIÓN? (matriz de capacidades, permisos.ts) */
  puede: (cap: Capacidad) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Mapeo temporal de correo → rol. Se elimina cuando custom claims esté activo (GU).
 *
 * Cualquier correo NO listado cae en ROL_FALLBACK, que debe ser siempre el rol
 * de MENOR alcance. Nunca poner aquí un fallback con más permisos: un correo
 * mal escrito no puede convertirse en un ascenso.
 */
const _ROL_POR_EMAIL_RAW: Record<string, UserRole> = {
  // ── Cuentas de prueba ──
  // Las usan la validación manual y la operación nocturna (emuladores). Son
  // CINCO, una por rol: el flujo de órdenes de compra no se puede probar sin
  // operaciones y administracion.
  "admin@vermur.com":            "admin",
  "pricing@vermur.com":          "pricing",
  "ventas@vermur.com":           "ventas",
  "operaciones@vermur.com":      "operaciones",
  "administracion@vermur.com":   "administracion",
  // ── Equipo Vermur ──
  "itzel.laurean@vermur.com":    "ventas",
  "nohema.sosa@vermur.com":      "pricing",
  "julio.gutierrez@vermur.com":  "administracion",
  "angel.luna@vermur.com":       "operaciones",
  "gabriela.huerta@vermur.com":  "admin",
  "luis.renteria@vermur.com":    "admin",
};

// Normaliza las llaves a minúsculas+trim para que el lookup sea case-insensitive
const ROL_POR_EMAIL: Record<string, UserRole> = Object.fromEntries(
  Object.entries(_ROL_POR_EMAIL_RAW).map(([k, v]) => [k.toLowerCase().trim(), v]),
);

const ROL_FALLBACK: UserRole = "ventas";

const getRolByEmail = (email: string): UserRole => {
  const rol = ROL_POR_EMAIL[email.toLowerCase().trim()];
  if (rol) return rol;
  // Aviso en consola: un correo fuera del mapa es casi siempre un alta que se
  // olvidó registrar aquí, y el síntoma (ve de menos) es difícil de diagnosticar.
  console.warn(
    `[auth] «${email}» no está en el mapa de roles; se asigna «${ROL_FALLBACK}» (mínimo alcance).`,
  );
  return ROL_FALLBACK;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser && firebaseUser.email) {
        const rol = getRolByEmail(firebaseUser.email);
        const nombre = firebaseUser.displayName || firebaseUser.email.split('@')[0];
        const avatar = nombre.substring(0, 2).toUpperCase();

        setUser({
          uid: firebaseUser.uid,
          id: firebaseUser.uid, // backward compatibility for UI expecting .id
          email: firebaseUser.email,
          nombre,
          rol,
          avatar
        } as unknown as AuthUser); // Casta por backward compat con AuthUser viejo si difiere
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  }, []);

  const isAllowed = useCallback(
    (view: string) => {
      if (!user) return false;
      return isViewAllowed(user.rol as UserRole, view);
    },
    [user]
  );

  const puede = useCallback(
    (cap: Capacidad) => puedeCapacidad(user?.rol as UserRole | undefined, cap),
    [user]
  );

  if (loading) return (
    <div style={{
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center",
      height: "100vh",
      background: "#18181B",
      color: "#FAFAF9",
      fontFamily: "sans-serif",
      fontSize: "14px"
    }}>
      Cargando VermurOps...
    </div>
  );

  return (
    <AuthContext.Provider value={{ user, loading, logout, isAllowed, puede }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
