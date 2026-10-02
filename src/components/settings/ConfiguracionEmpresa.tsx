/**
 * ConfiguracionEmpresa.tsx — pantalla «Mi empresa» en Configuración.
 *
 * Editable por admin y administracion. Lee de `configuracion/empresa` de
 * Firestore; si no existe, precarga con los datos reales de Vermur.
 */

import React, { useState, useEffect } from 'react';
import { Building2, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useConfiguracionEmpresa } from '../../hooks/useConfiguracionEmpresa';
import type { ConfiguracionEmpresa as ConfigEmpresa } from '../../lib/documentosOperativos';

export default function ConfiguracionEmpresaForm() {
  const { user } = useAuth();
  const { datos, cargando, error, guardando, guardar, existeEnFirestore } = useConfiguracionEmpresa();

  const [form, setForm] = useState<ConfigEmpresa>(datos);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Sincroniza cuando llegan datos de Firestore
  useEffect(() => {
    if (!cargando) setForm(datos);
  }, [cargando, datos]);

  const puedeEditar = user?.rol === 'admin' || user?.rol === 'administracion';

  const handleChange = (campo: keyof ConfigEmpresa, valor: string) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setMensaje(null);
  };

  const handleGuardar = async () => {
    if (!user || !puedeEditar) return;
    const resultado = await guardar(form, user.uid);
    if (resultado.ok) {
      setMensaje({ tipo: 'ok', texto: 'Configuración guardada.' });
    } else {
      setMensaje({ tipo: 'error', texto: resultado.error });
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 text-text-secondary text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando configuración de la empresa...
      </div>
    );
  }

  return (
    <div className="max-w-[600px]">
      <h3 className="text-[18px] font-semibold text-text-primary mb-1 pb-[16px] border-b border-divider flex items-center gap-2">
        <Building2 className="w-5 h-5" />
        Mi Empresa
      </h3>

      {!existeEnFirestore && (
        <div className="mb-4 bg-info-bg/30 border border-info-bg rounded-lg px-4 py-3 text-[13px] text-text-secondary">
          Datos precargados con la información de las plantillas de Vermur.
          Guarda para confirmarlos.
        </div>
      )}

      {error && (
        <div className="mb-4 bg-danger-bg/30 border border-danger-bg rounded-lg px-4 py-3 text-[13px] text-danger-text flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-[20px] mt-[24px]">
        {/* Razón social */}
        <div>
          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">
            Razón Social
          </label>
          <input
            type="text"
            value={form.razonSocial}
            onChange={e => handleChange('razonSocial', e.target.value)}
            disabled={!puedeEditar}
            className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm disabled:bg-canvas disabled:cursor-not-allowed"
          />
        </div>

        <div className="grid grid-cols-2 gap-[16px]">
          {/* RFC */}
          <div>
            <label className="block text-[12px] font-medium text-text-primary mb-[6px]">
              RFC
            </label>
            <input
              type="text"
              value={form.rfc}
              onChange={e => handleChange('rfc', e.target.value.toUpperCase())}
              disabled={!puedeEditar}
              maxLength={13}
              className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm disabled:bg-canvas disabled:cursor-not-allowed font-mono"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-[12px] font-medium text-text-primary mb-[6px]">
              Teléfono
            </label>
            <input
              type="text"
              value={form.telefono}
              onChange={e => handleChange('telefono', e.target.value)}
              disabled={!puedeEditar}
              placeholder="Pendiente de confirmar"
              className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm disabled:bg-canvas disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Dirección */}
        <div>
          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">
            Dirección Fiscal
          </label>
          <textarea
            rows={2}
            value={form.direccion}
            onChange={e => handleChange('direccion', e.target.value)}
            disabled={!puedeEditar}
            className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm disabled:bg-canvas disabled:cursor-not-allowed"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">
            Correo Electrónico
          </label>
          <input
            type="email"
            value={form.email}
            onChange={e => handleChange('email', e.target.value)}
            disabled={!puedeEditar}
            placeholder="correo@vermur.com"
            className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm disabled:bg-canvas disabled:cursor-not-allowed"
          />
        </div>

        {/* Apoderado Legal */}
        <div>
          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">
            Apoderado Legal
          </label>
          <input
            type="text"
            value={form.apoderadoLegal}
            onChange={e => handleChange('apoderadoLegal', e.target.value)}
            disabled={!puedeEditar}
            className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm disabled:bg-canvas disabled:cursor-not-allowed"
          />
        </div>

        {/* Logo URL - readonly por ahora, se cambiará a upload */}
        <div>
          <label className="block text-[12px] font-medium text-text-primary mb-[6px]">
            URL del Logo
          </label>
          <input
            type="text"
            value={form.logoUrl}
            onChange={e => handleChange('logoUrl', e.target.value)}
            disabled={!puedeEditar}
            placeholder="Se cargará desde Storage"
            className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[8px] text-[13px] focus:outline-none focus:border-brand shadow-sm disabled:bg-canvas disabled:cursor-not-allowed"
          />
          <p className="text-[11px] text-text-muted mt-[4px]">
            Se mostrará en los documentos generados (PDF).
          </p>
        </div>

        {!puedeEditar && (
          <div className="bg-canvas border border-card-border rounded-lg px-4 py-3 text-[12px] text-text-muted">
            Solo Administración puede editar los datos de la empresa.
          </div>
        )}
      </div>

      {puedeEditar && (
        <div className="mt-[32px] pt-[24px] border-t border-divider flex items-center justify-between">
          {mensaje && (
            <div className={`flex items-center gap-1.5 text-[13px] ${
              mensaje.tipo === 'ok' ? 'text-success-text' : 'text-danger-text'
            }`}>
              {mensaje.tipo === 'ok'
                ? <CheckCircle2 className="w-4 h-4" />
                : <AlertCircle className="w-4 h-4" />}
              {mensaje.texto}
            </div>
          )}
          <button
            onClick={handleGuardar}
            disabled={guardando}
            className="ml-auto flex items-center gap-2 bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium shadow-sm hover:bg-brand-hover transition-colors disabled:opacity-60"
          >
            {guardando
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />}
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}
