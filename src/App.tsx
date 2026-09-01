/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useRef, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ALLOWED_VIEWS_BY_ROLE } from './auth/users';
import { NotificationsProvider, useNotifications } from './notifications/NotificationsContext';
import { tiempoRelativo } from './notifications/notificationsStore';
import { NotifCard } from './pages/Notificaciones';
import LoginPage from './components/Login';
import Sidebar from './components/Sidebar';
import { NavegacionProvider } from './navegacion/NavegacionContext';
import Dashboard from './components/Dashboard';
import Quotes from './components/Quotes';
import Bookings from './components/Bookings';
import Pickups from './components/Pickups';
import Shipments from './components/Shipments';
import Finance from './components/Finance';
import ClientPortal from './components/ClientPortal';
import Clients from './components/Clients';
import Reports from './components/Reports';
import RatesManagement from './components/RatesManagement';
import Settings from './components/Settings';
import ExchangeRates from './components/ExchangeRates';
import Puertos from './components/Puertos';
import Notificaciones from './pages/Notificaciones';
import LandingPage from './components/LandingPage';
import { ChevronDown, User, LogOut, Bell, ArrowRight, CheckCheck } from 'lucide-react';
import { useProveedores } from './hooks/useProveedores';
import { usePuertos } from './hooks/usePuertos';
import { useTerminosPago } from './hooks/useTerminosPago';
import { useTarifas } from './hooks/useTarifas';
import AvisosEscritura from './components/ui/AvisosEscritura';

// ─── Role badge labels ────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  ventas: 'Ventas',
  pricing: 'Pricing',
  operaciones: 'Operaciones',
  administracion: 'Administración',
  admin: 'Admin',
};

// Color del badge por rol (evita la cadena de ternarios en el markup).
const ROLE_BADGE_STYLE: Record<string, { background: string; color: string }> = {
  admin:          { background: '#FEE2E2', color: '#B91C1C' },
  administracion: { background: '#F0FDF4', color: '#15803D' },
  pricing:        { background: '#EFF6FF', color: '#1D4ED8' },
  operaciones:    { background: '#ECFDF5', color: '#047857' },
  ventas:         { background: '#FFF7ED', color: '#C2410C' },
};

// ─── View title map ───────────────────────────────────────────────────────────
// Sin 'documents': la sección suelta se retiró para todos los roles. Los
// documentos viven dentro de la cotización y del embarque (§4.8).
//
// Sin 'pricing': era una bandeja de RFQs con datos de ejemplo, anterior a que
// el trabajo de Pricing viviera en la Bandeja del módulo de cotizaciones. Dos
// pantallas para lo mismo, y solo una con datos reales. Ojo: el ROL 'pricing'
// sigue existiendo — lo que se retira es la VISTA.
const VIEW_LABELS: Record<string, string> = {
  dashboard: 'Vista general',
  quotes: 'CRM',
  bookings: 'Reservas',
  pickups: 'Recolecciones',
  shipments: 'Embarques',
  finance: 'Finanzas',
  exchange: 'Tipo de cambio',
  clients: 'Altas',
  puertos: 'Puertos',
  rates: 'Tarifas',
  reports: 'Reportes',
  settings: 'Configuración',
  notifications: 'Notificaciones',
};

// ─── Notification Badge ───────────────────────────────────────────────────────
function NotifBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="absolute -top-[5px] -right-[5px] min-w-[18px] h-[18px] rounded-full bg-[#E11D48] text-white text-[10px] font-black flex items-center justify-center px-[3px] leading-none pointer-events-none"
      style={{ boxShadow: '0 0 0 2px #0A0A0C' }}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

// ─── Notifications Bell + Dropdown ───────────────────────────────────────────
function NotificationsDropdown({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { notificaciones, marcarLeida, marcarTodasLeidas, conteoNoLeidas } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const preview = notificaciones.slice(0, 5);
  const hayNoLeidas = conteoNoLeidas > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        id="notifications-bell"
        onClick={() => setOpen(v => !v)}
        className="relative p-[6px] text-text-inverse-muted hover:text-text-inverse transition-colors rounded-md hover:bg-surface-elevated"
        aria-label="Notificaciones"
      >
        <Bell className="w-[20px] h-[20px]" />
        <NotifBadge count={conteoNoLeidas} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+10px)] z-50 flex flex-col overflow-hidden"
          style={{
            width: 380,
            background: '#FAFAF9',
            border: '1px solid #E4E4E7',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-[16px] py-[14px] border-b border-[#E4E4E7]">
            <span className="text-[14px] font-bold text-[#18181B]">Notificaciones</span>
            {hayNoLeidas && (
              <button
                onClick={() => { marcarTodasLeidas(); }}
                className="flex items-center gap-[5px] text-[12px] font-medium text-text-secondary hover:text-brand transition-colors"
              >
                <CheckCheck className="w-[13px] h-[13px]" />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[380px] p-[10px] space-y-[6px]">
            {preview.length === 0 ? (
              <div className="py-[40px] text-center">
                <Bell className="w-8 h-8 text-text-muted mx-auto mb-[10px]" />
                <p className="text-[13px] text-text-muted">Sin notificaciones</p>
              </div>
            ) : (
              preview.map(notif => (
                <NotifCard
                  key={notif.id}
                  notif={notif}
                  expanded={false}
                  onClick={() => {
                    marcarLeida(notif.id);
                    onNavigate('quotes');
                    setOpen(false);
                  }}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div
            className="px-[16px] py-[12px] border-t border-[#E4E4E7] text-center"
          >
            <button
              onClick={() => { onNavigate('notifications'); setOpen(false); }}
              className="text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors"
            >
              Ver todas las notificaciones
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User Avatar + Dropdown ───────────────────────────────────────────────────
function UserMenu({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;
  const roleLabel = ROLE_LABEL[user.rol] ?? user.rol;

  return (
    <div className="relative" ref={ref}>
      <button
        id="user-menu-trigger"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-[10px] hover:opacity-90 transition-opacity"
      >
        <div
          className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
          style={{ background: '#E11D48' }}
        >
          {user.avatar}
        </div>
        <span className="text-text-inverse-muted font-medium text-[13px] hidden sm:block">
          {user.nombre}
        </span>
        <ChevronDown className={`w-[14px] h-[14px] text-text-inverse-muted hidden sm:block transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] w-[220px] rounded-[10px] shadow-xl border overflow-hidden z-50"
          style={{ background: '#fff', borderColor: '#E4E4E7' }}
        >
          <div className="px-[16px] py-[14px] border-b" style={{ borderColor: '#F1F1F3' }}>
            <p className="text-[13px] font-semibold text-[#18181B]">{user.nombre}</p>
            <p className="text-[11px] text-[#71717A] mt-[2px]">{user.email}</p>
            <span
              className="inline-block mt-[6px] text-[10px] font-bold uppercase tracking-wider px-[8px] py-[2px] rounded-[4px]"
              style={ROLE_BADGE_STYLE[user.rol] ?? ROLE_BADGE_STYLE.ventas}
            >
              {roleLabel}
            </span>
          </div>
          <div className="py-[6px]">
            <button
              id="user-menu-profile"
              onClick={() => { onNavigate('settings'); setOpen(false); }}
              className="w-full flex items-center px-[16px] py-[9px] text-[13px] text-[#18181B] hover:bg-[#F4F4F5] transition-colors gap-[10px]"
            >
              <User className="w-[15px] h-[15px] text-[#71717A]" />
              Mi perfil
            </button>
            <div className="my-[4px] mx-[10px] border-t" style={{ borderColor: '#F1F1F3' }} />
            <button
              id="user-menu-logout"
              onClick={() => { setOpen(false); logout(); }}
              className="w-full flex items-center px-[16px] py-[9px] text-[13px] text-[#E11D48] hover:bg-[#FFF1F2] transition-colors gap-[10px]"
            >
              <LogOut className="w-[15px] h-[15px]" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main app shell ───────────────────────────────────────────────────────────
function AppShell() {
  const { user, isAllowed } = useAuth();
  const [currentView, setCurrentView] = useState('dashboard');
  const [showPortal, setShowPortal] = useState(false);

  // E9: seed de proveedores a Firestore en cualquier vista (no solo Clientes).
  useProveedores();
  // E10.0: seed de puertos a Firestore.
  usePuertos();
  // 1.2: seed de términos de pago a Firestore.
  useTerminosPago();
  // TA-1: listener acotado de tarifas (activo + vigente ± 60d).
  useTarifas();

  const safeNavigate = (view: string) => {
    // notifications is accessible to all roles
    if (view === 'notifications' || isAllowed(view)) {
      setCurrentView(view);
    } else {
      setCurrentView('dashboard');
    }
  };

  if (showPortal) {
    return <ClientPortal onReturn={() => setShowPortal(false)} />;
  }

  const renderContent = () => {
    if (currentView === 'notifications') {
      return <Notificaciones onNavigateToCRM={() => safeNavigate('quotes')} />;
    }
    if (!isAllowed(currentView)) return <Dashboard />;
    switch (currentView) {
      case 'dashboard':  return <Dashboard />;
      case 'quotes':     return <Quotes />;
      case 'bookings':   return <Bookings />;
      case 'pickups':    return <Pickups />;
      case 'shipments':  return <Shipments />;
      case 'finance':    return <Finance />;
      case 'exchange':   return <ExchangeRates />;
      case 'clients':    return <Clients />;
      case 'puertos':    return <Puertos />;
      case 'rates':      return <RatesManagement />;
      case 'reports':    return <Reports />;
      case 'settings':   return <Settings />;
      default:           return <Dashboard />;
    }
  };

  return (
    /* U-4 · Los saltos entre entidades (embarque → su cotización, cliente →
       sus embarques) necesitan cambiar de módulo Y decirle al módulo qué
       abrir. El proveedor envuelve todo porque el origen y el destino del
       salto viven en módulos distintos. */
    <NavegacionProvider onCambiarVista={safeNavigate}>
    <div className="flex min-h-screen bg-canvas font-sans">
      <Sidebar currentView={currentView} onChangeView={safeNavigate} />

      <div className="flex-1 md:ml-[240px] pb-20 md:pb-0 flex flex-col h-screen overflow-hidden">
        {/* ── Header ── */}
        <header className="bg-surface-dark border-b border-surface-border h-[60px] flex items-center justify-between px-[32px] shrink-0 z-10 sticky top-0 text-text-inverse">
          <h1 className="text-[15px] font-medium tracking-tight hidden md:block">
            {VIEW_LABELS[currentView] ?? 'VermurOps'}
          </h1>

          {/* Mobile logo */}
          <div className="md:hidden flex items-center">
            <div className="bg-white rounded py-1 px-2 flex items-center justify-center border border-surface-border">
              <img
                src="https://firebasestorage.googleapis.com/v0/b/digsol-academy.firebasestorage.app/o/LOGOTIPO%20(1).png?alt=media&token=702db209-5869-4471-acb6-ac7740e5453b"
                alt="Vermur Logo"
                className="h-5 object-contain"
              />
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-[16px] text-[13px]">
            {user?.rol === 'admin' && (
              <button
                onClick={() => setShowPortal(true)}
                className="bg-brand text-text-inverse-primary px-[12px] py-[6px] rounded-[6px] font-semibold tracking-tight shadow-sm hover:brightness-110 transition hidden sm:block"
              >
                Portal del Cliente
              </button>
            )}
            {/* Campana de notificaciones */}
            <NotificationsDropdown onNavigate={safeNavigate} />
            <UserMenu onNavigate={safeNavigate} />
          </div>
        </header>

        {/* Avisos de fallo de escritura: montado una vez, visible desde
            cualquier pantalla. Un guardado que falla es pérdida de trabajo. */}
        <AvisosEscritura />

        {/* ── Content ── */}
        <main className="flex-1 overflow-y-auto p-[24px] md:p-[32px]">
          <div className="max-w-[1100px] mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
    </NavegacionProvider>
  );
}

// ─── Root with auth flow ──────────────────────────────────────────────────────
function Root() {
  const { user } = useAuth();
  const [showLanding, setShowLanding] = useState(true);

  if (user) return <AppShell />;

  if (showLanding) {
    return <LandingPage onShowLogin={() => setShowLanding(false)} />;
  }

  return (
    <LoginPage
      onLoginSuccess={() => { /* user state updates reactively via AuthContext */ }}
      onBack={() => setShowLanding(true)}
    />
  );
}

// ─── App root — provider stack ────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <NotificationsProviderWrapper />
    </AuthProvider>
  );
}

// Wrapper to use both contexts correctly (NotificationsProvider needs useAuth internally)
function NotificationsProviderWrapper() {
  return (
    <NotificationsProvider>
      <Root />
    </NotificationsProvider>
  );
}
