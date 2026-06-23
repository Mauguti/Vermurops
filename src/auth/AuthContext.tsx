import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { AuthUser, isViewAllowed, UserRole } from './users';
import { auth } from '../firebase';

// ─────────────────────────────────────────────────────────────────────────────
// AuthContext — contexto global de autenticación para VermurOps
// ─────────────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  isAllowed: (view: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const getRolByEmail = (email: string): UserRole => {
  if (email === "admin@vermur.com")   return "admin";
  if (email === "pricing@vermur.com") return "pricing";
  if (email === "ventas@vermur.com")  return "ventas";
  return "ventas"; // fallback por default
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
    <AuthContext.Provider value={{ user, loading, logout, isAllowed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
