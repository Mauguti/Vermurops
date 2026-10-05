import React from 'react';
import { FileCheck } from 'lucide-react';
import ModuloEnDesarrollo from './ui/ModuloEnDesarrollo';

/**
 * Reservas (booking con la naviera o la aerolínea).
 *
 * ── Por qué está vacío ─────────────────────────────────────────────────────
 * Tarea 57 (5-oct-2026). Lo que había eran dos reservas de ejemplo escritas
 * a mano —`BKG-2023-014` con Hapag-Lloyd y `BKG-2023-015`, con número de
 * contenedor, «Cut-off 2023-11-05», cliente y cotización inventados— más un
 * formulario de alta que no guardaba nada.
 *
 * Un folio consecutivo falso es la clase de dato que alguien copia a un
 * correo: `BKG-2023-014` se ve exactamente igual que uno real. Y el módulo
 * solo lo alcanza el rol admin, así que nadie lo había reportado.
 *
 * La reserva real sale del embarque, con el booking que confirma la naviera.
 * Mientras eso no exista, el módulo dice que falta en vez de aparentar.
 */
export default function Bookings() {
  return (
    <div className="space-y-[24px]">
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Reservas</h2>
        <p className="text-[13px] text-text-secondary mt-[4px]">
          Booking con la naviera, la aerolínea o el transportista.
        </p>
      </div>
      <ModuloEnDesarrollo
        icono={<FileCheck className="w-[32px] h-[32px]" />}
        descripcion="La reserva se confirmará desde el embarque, con el número de booking que da la naviera. Antes, este módulo mostraba dos reservas de ejemplo con folios y fechas inventadas de 2023."
        pendiente="de dónde llega el booking (captura manual, correo de la naviera o integración) y si la reserva es una pestaña del embarque o un módulo aparte."
      />
    </div>
  );
}
