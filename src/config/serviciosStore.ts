import { useState, useEffect } from 'react';
import React from 'react';
import * as Icons from 'lucide-react';

export type CategoriaServicio = 'transporte' | 'aduana' | 'carga' | 'otros';

export interface Servicio {
  id: string;
  nombre: string;
  categoria: CategoriaServicio;
  activo: boolean;
  icono: string;
  descripcion?: string;
  esDefault?: boolean; // Permite identificar los que no se pueden borrar
}

const DEFAULT_SERVICIOS: Servicio[] = [
  { id: 'srv-def-1',  nombre: 'Flete Internacional',      categoria: 'transporte', activo: true, icono: 'Ship', esDefault: true },
  { id: 'srv-def-2',  nombre: 'Transporte Terrestre',     categoria: 'transporte', activo: true, icono: 'Truck', esDefault: true },
  { id: 'srv-def-3',  nombre: 'Transporte Aéreo',         categoria: 'transporte', activo: true, icono: 'Plane', esDefault: true },
  { id: 'srv-def-4',  nombre: 'Maniobras',                categoria: 'carga',      activo: true, icono: 'Package', esDefault: true },
  { id: 'srv-def-5',  nombre: 'Almacenaje Nacional',      categoria: 'carga',      activo: true, icono: 'Warehouse', esDefault: true },
  { id: 'srv-def-6',  nombre: 'Almacenaje Internacional', categoria: 'carga',      activo: true, icono: 'Warehouse', esDefault: true },
  { id: 'srv-def-7',  nombre: 'Seguro de Mercancía',      categoria: 'otros',      activo: true, icono: 'Shield', esDefault: true },
  { id: 'srv-def-8',  nombre: 'Recolección',              categoria: 'transporte', activo: true, icono: 'MapPin', esDefault: true },
  { id: 'srv-def-9',  nombre: 'Asesoría Aduanal',         categoria: 'aduana',     activo: true, icono: 'FileCheck', esDefault: true },
  { id: 'srv-def-10', nombre: 'Otros Servicios',          categoria: 'otros',      activo: true, icono: 'MoreHorizontal', esDefault: true },
];

export const STORAGE_KEY = 'vermurops_servicios';

export function useServicios() {
  const [servicios, setServicios] = useState<Servicio[]>([]);

  // Cargar inicial
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setServicios(JSON.parse(saved));
      } catch (e) {
        setServicios(DEFAULT_SERVICIOS);
      }
    } else {
      setServicios(DEFAULT_SERVICIOS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SERVICIOS));
    }
  }, []);

  // Guardar cambios
  const updateServicios = (nuevos: Servicio[]) => {
    setServicios(nuevos);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevos));
  };

  const addServicio = (srv: Omit<Servicio, 'id' | 'esDefault'>) => {
    const nuevo: Servicio = {
      ...srv,
      id: `srv-cus-${Date.now()}`,
      esDefault: false,
    };
    updateServicios([...servicios, nuevo]);
  };

  const updateServicio = (id: string, partial: Partial<Servicio>) => {
    updateServicios(servicios.map(s => s.id === id ? { ...s, ...partial } : s));
  };

  const deleteServicio = (id: string) => {
    const srv = servicios.find(s => s.id === id);
    if (srv && srv.esDefault) return; // Protección extra
    updateServicios(servicios.filter(s => s.id !== id));
  };

  return {
    servicios,
    serviciosActivos: servicios.filter(s => s.activo),
    addServicio,
    updateServicio,
    deleteServicio,
    updateServicios // para reordenar o updates batch si se ocupara
  };
}

/**
 * Función para renderizar un ícono de Lucide por su nombre (string).
 * Recibe className para estilado adicional.
 */
export function renderIcon(iconName: string, className?: string) {
  // Lucide usa UpperCamelCase en las keys exportadas en react, 
  // Intentamos un match directo, si no cae a HelpCircle (fallback).
  // Convertimos snake/kebab case a PascalCase para que funcione con los nombres
  const toPascal = (s: string) => s.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  
  const parsedName = toPascal(iconName);
  
  // @ts-ignore
  const IconComp = Icons[parsedName] || Icons.HelpCircle;
  return React.createElement(IconComp, { className: className || 'w-4 h-4' });
}
