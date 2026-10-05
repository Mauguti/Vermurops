import React from 'react';
import { Truck } from 'lucide-react';
import ModuloEnDesarrollo from './ui/ModuloEnDesarrollo';

/**
 * Recolecciones.
 *
 * ── Por qué está vacío ─────────────────────────────────────────────────────
 * Tarea 57 (5-oct-2026). Lo que había eran tres recolecciones de ejemplo
 * escritas a mano —`PK-2023-110` a `PK-2023-112`, con cliente, domicilio,
 * nombre y TELÉFONO de contacto, transportista, pesos, medidas y ventanas de
 * horario— más un formulario de alta que no guardaba nada.
 *
 * Es el mismo problema de Reservas, agravado: un nombre con su teléfono se
 * lee como un contacto real y alguien podría marcarlo. Y el módulo solo lo
 * alcanza el rol admin, así que nadie lo había reportado.
 *
 * La recolección depende de la carta de porte y del transportista del
 * embarque; se construye con el motor de plantillas.
 */
export default function Pickups() {
  return (
    <div className="space-y-[24px]">
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Recolecciones</h2>
        <p className="text-[13px] text-text-secondary mt-[4px]">
          Programación de recolección en origen con el transportista.
        </p>
      </div>
      <ModuloEnDesarrollo
        icono={<Truck className="w-[32px] h-[32px]" />}
        descripcion="La orden de recolección saldrá del embarque, con el transportista y el domicilio que ya tiene la operación. Antes, este módulo mostraba tres recolecciones de ejemplo con folios de 2023 y contactos con teléfono inventados."
        pendiente="si la orden de recolección es un documento del motor de plantillas (como la notificación de arribo) o una pantalla propia, y quién la programa."
      />
    </div>
  );
}
