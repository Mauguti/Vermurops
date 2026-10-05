/**
 * EditorContactos.tsx
 *
 * El editor de contactos que comparten la ficha del cliente y el modal del
 * proveedor (tarea 60, 5-oct-2026). Antes vivía pegado dentro de
 * `ProveedorFormModal`, así que el cliente no podía usarlo; las reglas
 * están en `lib/contactos.ts` y aquí solo se pintan.
 *
 * Dos diferencias legítimas entre las dos entidades, y son props:
 *   - `tipos`: el cliente clasifica a sus contactos (dueño, quien pide la
 *     unidad, quien manda la factura, quien monitorea, otro). El proveedor
 *     no, y su `tipo` de Magaya se queda como está.
 *   - `modoBaja`: el cliente DESACTIVA (una persona que se fue sigue siendo
 *     quien firmó el correo de hace seis meses); el proveedor conserva el
 *     borrado que ya tenía. Cambiarlo también ahí sería otra tarea.
 */
import React from 'react';
import { Plus, Trash2, UserX, UserCheck } from 'lucide-react';
import {
  type ContactoEditable, contactoActivo, agregarContacto, actualizarContacto,
  marcarPrincipal, alternarActivoContacto, quitarContacto, etiquetaTipoContacto,
} from '../../lib/contactos';

const INPUT = 'w-full px-3 py-2 text-[13px] bg-white border border-card-border rounded-[6px] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand text-text-primary';
const LABEL = 'block text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1.5';

interface Props<T extends ContactoEditable> {
  contactos: T[];
  onChange: (next: T[]) => void;
  /** Opciones del selector de tipo. Sin esto, no se pinta el selector. */
  tipos?: { key: string; label: string }[];
  /** 'desactivar' (cliente) · 'eliminar' (proveedor). */
  modoBaja?: 'desactivar' | 'eliminar';
  /** Nombre del grupo de radios: dos editores en la misma página chocarían. */
  nombreGrupo?: string;
  soloLectura?: boolean;
  /** Texto cuando no hay ninguno. */
  vacio?: string;
}

export default function EditorContactos<T extends ContactoEditable>({
  contactos, onChange, tipos, modoBaja = 'desactivar',
  nombreGrupo = 'contacto-principal', soloLectura = false,
  vacio = 'Todavía no hay contactos capturados.',
}: Props<T>) {
  const set = (idx: number, campo: keyof ContactoEditable, valor: string | null) =>
    onChange(actualizarContacto(contactos, idx, campo, valor));

  return (
    <div>
      <div className="space-y-3">
        {contactos.length === 0 && (
          <p className="text-[12px] text-text-muted italic">{vacio}</p>
        )}

        {contactos.map((c, idx) => {
          const activo = contactoActivo(c);
          const etiquetaTipo = etiquetaTipoContacto(c.tipo);
          return (
            <div
              key={c.id ?? idx}
              className={`border border-card-border rounded-lg p-3 ${activo ? 'bg-canvas' : 'bg-gray-50 opacity-70'}`}
              data-testid="contacto-fila"
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="radio"
                    name={nombreGrupo}
                    checked={c.principal === true}
                    disabled={soloLectura || !activo}
                    onChange={() => onChange(marcarPrincipal(contactos, idx))}
                    className="w-4 h-4 text-brand focus:ring-brand accent-brand"
                  />
                  <span className="text-[12px] font-medium text-text-secondary">
                    {c.principal ? 'Principal' : `Contacto ${idx + 1}`}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  {/* El tipo que no es de los cinco (el 'general' de Magaya)
                      se enseña tal cual, sin pretender que significa algo. */}
                  {!etiquetaTipo && (c.tipo ?? '').trim() !== '' && (
                    <span className="text-[10px] uppercase tracking-wider text-text-muted" title="Tipo heredado de Magaya">
                      Magaya: {c.tipo}
                    </span>
                  )}
                  {!activo && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted bg-gray-200 rounded px-1.5 py-0.5">
                      Inactivo
                    </span>
                  )}
                  {!soloLectura && modoBaja === 'desactivar' && (
                    <button
                      type="button"
                      onClick={() => onChange(alternarActivoContacto(contactos, idx))}
                      className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
                      title={activo ? 'Desactivar contacto (no se borra)' : 'Reactivar contacto'}
                    >
                      {activo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {!soloLectura && modoBaja === 'eliminar' && contactos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onChange(quitarContacto(contactos, idx))}
                      className="p-1 rounded text-text-muted hover:text-danger-text transition-colors"
                      title="Eliminar contacto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nombre *</label>
                  <input className={INPUT} value={c.nombre ?? ''} disabled={soloLectura}
                    onChange={e => set(idx, 'nombre', e.target.value)} placeholder="Nombre del contacto" />
                </div>
                <div>
                  <label className={LABEL}>Puesto</label>
                  <input className={INPUT} value={c.puesto ?? ''} disabled={soloLectura}
                    onChange={e => set(idx, 'puesto', e.target.value)} placeholder="Cargo" />
                </div>
                <div>
                  <label className={LABEL}>Email</label>
                  <input className={INPUT} type="email" value={c.email ?? ''} disabled={soloLectura}
                    onChange={e => set(idx, 'email', e.target.value)} placeholder="correo@ejemplo.com" />
                </div>
                <div>
                  <label className={LABEL}>Teléfono</label>
                  <input className={INPUT} value={c.telefono ?? ''} disabled={soloLectura}
                    onChange={e => set(idx, 'telefono', e.target.value)} placeholder="55 1234 5678" />
                </div>
                {tipos && (
                  <div className="sm:col-span-2">
                    <label className={LABEL}>Tipo de contacto</label>
                    <select
                      className={INPUT}
                      value={etiquetaTipo ? (c.tipo ?? '') : ''}
                      disabled={soloLectura}
                      onChange={e => set(idx, 'tipo', e.target.value === '' ? null : e.target.value)}
                    >
                      <option value="">Sin tipo</option>
                      {tipos.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!soloLectura && (
        <button
          type="button"
          onClick={() => onChange(agregarContacto(contactos))}
          className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-brand hover:text-brand-hover transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar contacto
        </button>
      )}
    </div>
  );
}
