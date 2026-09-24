import React from 'react';
import {
  Home, FileText, Users, BarChart2, BookmarkMinus, Ship,
  DollarSign, Settings as Settings2, Calculator, Bell, Anchor,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useNotifications } from '../notifications/NotificationsContext';

interface SidebarProps {
  currentView: string;
  onChangeView: (view: string) => void;
}

const ROLE_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',       icon: <Home        className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'quotes',     label: 'CRM',              icon: <FileText    className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'shipments',  label: 'Embarques',        icon: <Ship        className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'finance',    label: 'Finanzas',         icon: <DollarSign  className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'exchange',   label: 'Tipo de cambio',   icon: <Calculator  className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'clients',    label: 'Altas',            icon: <Users       className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'puertos',    label: 'Puertos',          icon: <Anchor      className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'rates',      label: 'Tarifas',          icon: <BookmarkMinus className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'reports',    label: 'Reportes',         icon: <BarChart2   className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  { id: 'settings',   label: 'Configuración',    icon: <Settings2   className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
  // Notificaciones: siempre visible (se filtra aparte)
  { id: 'notifications', label: 'Notificaciones', icon: <Bell className="w-[18px] h-[18px] mr-3 stroke-[1.5px]" /> },
];

export default function Sidebar({ currentView, onChangeView }: SidebarProps) {
  const { isAllowed } = useAuth();
  const { conteoNoLeidas } = useNotifications();

  const menuItems = ROLE_ITEMS.filter(
    item => item.id === 'notifications' || isAllowed(item.id)
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-[240px] bg-shell border-r border-shell-border min-h-screen text-text-primary shrink-0 fixed z-20">
        <div className="h-[60px] px-[24px] flex items-center border-b border-shell-border shrink-0">
          <div className="flex items-center w-full">
            <div className="flex items-center justify-center w-full">
              <img
                src="https://firebasestorage.googleapis.com/v0/b/digsol-academy.firebasestorage.app/o/LOGOTIPO%20(1).png?alt=media&token=702db209-5869-4471-acb6-ac7740e5453b"
                alt="Vermur Logo"
                className="h-6 object-contain"
              />
            </div>
          </div>
        </div>

        <nav className="flex-1 mt-6 px-[12px]">
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em] mb-3 px-[12px]">
            Plataforma
          </div>
          <ul className="flex flex-col space-y-[2px]">
            {menuItems.map((item) => {
              const isNotif = item.id === 'notifications';
              const isActive = currentView === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onChangeView(item.id)}
                    className={`w-full flex items-center px-[12px] py-[8px] text-[14px] rounded-md transition-colors ${
                      isActive
                        ? 'bg-primario/8 text-primario font-semibold'
                        : 'text-text-primary hover:bg-neutral-bg'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                    {isNotif && conteoNoLeidas > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] bg-primario text-white text-[10px] font-black rounded-full flex items-center justify-center px-[3px]">
                        {conteoNoLeidas > 9 ? '9+' : conteoNoLeidas}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-[24px] text-[12px] text-text-muted">
          VermurOps v2.4
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-shell border-t border-shell-border z-50">
        <nav className="flex justify-around overflow-x-auto">
          {menuItems.map((item) => {
            const isNotif = item.id === 'notifications';
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={`flex flex-col items-center py-3 px-2 shrink-0 relative ${
                  currentView === item.id ? 'text-primario' : 'text-text-muted'
                }`}
              >
                <div className="mb-1 relative">
                  {item.icon}
                  {isNotif && conteoNoLeidas > 0 && (
                    <span className="absolute -top-[4px] -right-[6px] min-w-[14px] h-[14px] bg-primario text-white text-[9px] font-black rounded-full flex items-center justify-center px-[2px]">
                      {conteoNoLeidas > 9 ? '9+' : conteoNoLeidas}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
