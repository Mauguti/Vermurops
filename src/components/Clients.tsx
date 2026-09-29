import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  filtrarProveedores, conteoPorPestana, PESTANAS_PROVEEDOR, type PestanaProveedor,
} from '../lib/filtrarProveedores';
import { contiene } from '../lib/texto';
import { Search, Database, Loader2, SlidersHorizontal } from 'lucide-react';
import { useClientes } from '../hooks/useClientes';
import { useProveedores } from '../hooks/useProveedores';
import { useCotizaciones } from '../hooks/useCotizaciones';
import type { ProveedorVermur } from './proveedores/ProveedoresData';
import FichaCliente from './clientes/FichaCliente';
import NuevoClienteModal from './clientes/NuevoClienteModal';
import ProveedorFormModal from './proveedores/ProveedorFormModal';
import FichaProveedor from './proveedores/FichaProveedor';
import { useAuth, usuariosPorRol } from '../auth/AuthContext';
import { useDestinoPendiente } from '../navegacion/NavegacionContext';
import SpreadsheetTable, { type VistaConfig } from './table/SpreadsheetTable';
import VistaSelector from './table/VistaSelector';
import { useVistasUsuario } from '../hooks/useVistasUsuario';
import { CLIENTE_COLUMNS, VISTA_DEFAULT_CLIENTES } from './clientes/clienteColumns';
import { PROVEEDOR_COLUMNS, VISTA_DEFAULT_PROVEEDORES } from './proveedores/proveedorColumns';
import type { ClienteVermur } from './clientes/ClientesData';
import { puedeEditarEnLista, aplicarCambio, CAMPO_EJECUTIVO, ETIQUETA_AREA, ROL_DEL_AREA, type AreaEjecutivo } from '../lib/edicionEnLista';
import type { EdicionEnListaMeta } from './clientes/edicionMeta';
import { nombreDeUsuario } from '../auth/AuthContext';

export default function Clients() {
  // Matriz §4.1: las altas definitivas de clientes y proveedores son solo de
  // Administración. Los demás roles entran a consultar.
  const { puede, user } = useAuth();
  const puedeAltaCliente = puede('cliente.alta');
  const puedeAltaProveedor = puede('proveedor.alta');
  // Herramienta de mantenimiento, no función de negocio: solo superusuario.
  const puedeImportarCatalogo = puede('catalogo.importarMasivo');

  const {
    clientes, loading, error,
    createCliente, updateCliente,
    analizarImportacionClientes, importarClientesDesdeJSON,
  } = useClientes();
  const [seedingClientes, setSeedingClientes] = useState(false);

  const handleSeedClientes = useCallback(async () => {
    setSeedingClientes(true);
    try {
      // Contar primero: la confirmación tiene que decir cuántos registros VIVOS
      // se pisan, no un aproximado. Es una escritura contra la base en uso.
      const { total, aSobrescribir, nuevos } = await analizarImportacionClientes();

      const ok = window.confirm(
        `IMPORTAR CATÁLOGO DE CLIENTES DESDE MAGAYA\n\n` +
        `Se escribirán ${total} registros:\n` +
        `  • ${aSobrescribir} SOBRESCRIBEN clientes que ya existen\n` +
        `  • ${nuevos} son nuevos\n\n` +
        `Los ${aSobrescribir} que se sobrescriben son registros con los que el ` +
        `equipo está trabajando ahora mismo. Todo cambio hecho sobre ellos desde ` +
        `la última carga se pierde.\n\n` +
        `Esta acción no se puede deshacer. ¿Continuar?`
      );
      if (!ok) return;

      const count = await importarClientesDesdeJSON();
      window.alert(`Importación completa: ${count} clientes escritos.`);
    } catch (err) {
      window.alert(`Error al importar: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSeedingClientes(false);
    }
  }, [analizarImportacionClientes, importarClientesDesdeJSON]);
  const { proveedores, loading: loadingProv, error: errorProv, createProveedor, updateProveedor } = useProveedores();
  const { quotes } = useCotizaciones();
  const [viewType, setViewType] = useState<'Clientes' | 'Proveedores'>('Clientes');

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactivos, setShowInactivos] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  // Bloque 5: las pestañas de proveedores nunca estuvieron conectadas.
  const [pestanaProveedor, setPestanaProveedor] = useState<PestanaProveedor>('todos');
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // U-4 · Alguien enlazó a un cliente o a un proveedor desde otro módulo.
  useDestinoPendiente(['cliente', 'proveedor'], (d) => {
    if (d.tipo === 'cliente') {
      setViewType('Clientes');
      setSelectedProviderId(null);
      setSelectedClientId(d.id);
    } else {
      setViewType('Proveedores');
      setSelectedClientId(null);
      setSelectedProviderId(d.id);
    }
  });
  const selectedProvider = selectedProviderId
    ? (proveedores.find(p => p.id === selectedProviderId) ?? null)
    : null;

  const [showProvModal, setShowProvModal] = useState<false | 'crear' | 'editar'>(false);

  // Derive selectedClient from live clientes array so FichaCliente always gets fresh data
  const selectedClient = selectedClientId
    ? (clientes.find(c => c.id === selectedClientId) ?? null)
    : null;

  // ── Vistas guardadas ────────────────────────────────────────────────────────
  const vistasClientes = useVistasUsuario('clientes');
  const vistasProveedores = useVistasUsuario('proveedores');

  const [vistaClienteId, setVistaClienteId] = useState<string | null>(null);
  const [vistaClienteTabla, setVistaClienteTabla] = useState<VistaConfig>(VISTA_DEFAULT_CLIENTES);

  const [vistaProveedorId, setVistaProveedorId] = useState<string | null>(null);
  const [vistaProveedorTabla, setVistaProveedorTabla] = useState<VistaConfig>(VISTA_DEFAULT_PROVEEDORES);

  // Cargar vista default del usuario para clientes
  const defaultClienteCargada = useRef(false);
  useEffect(() => {
    if (defaultClienteCargada.current || !vistasClientes.vistaDefault || vistaClienteId !== null) return;
    defaultClienteCargada.current = true;
    setVistaClienteId(vistasClientes.vistaDefault.id);
    setVistaClienteTabla({
      columnas: vistasClientes.vistaDefault.columnas,
      ordenamiento: vistasClientes.vistaDefault.ordenamiento ?? null,
    });
  }, [vistasClientes.vistaDefault, vistaClienteId]);

  // Cargar vista default del usuario para proveedores
  const defaultProveedorCargada = useRef(false);
  useEffect(() => {
    if (defaultProveedorCargada.current || !vistasProveedores.vistaDefault || vistaProveedorId !== null) return;
    defaultProveedorCargada.current = true;
    setVistaProveedorId(vistasProveedores.vistaDefault.id);
    setVistaProveedorTabla({
      columnas: vistasProveedores.vistaDefault.columnas,
      ordenamiento: vistasProveedores.vistaDefault.ordenamiento ?? null,
    });
  }, [vistasProveedores.vistaDefault, vistaProveedorId]);

  const seleccionarVistaCliente = useCallback((id: string | null) => {
    setVistaClienteId(id);
    const v = id ? vistasClientes.vistas.find(v => v.id === id) : null;
    if (v) {
      setVistaClienteTabla({ columnas: v.columnas, ordenamiento: v.ordenamiento ?? null });
    } else {
      setVistaClienteTabla(VISTA_DEFAULT_CLIENTES);
    }
  }, [vistasClientes.vistas]);

  const seleccionarVistaProveedor = useCallback((id: string | null) => {
    setVistaProveedorId(id);
    const v = id ? vistasProveedores.vistas.find(v => v.id === id) : null;
    if (v) {
      setVistaProveedorTabla({ columnas: v.columnas, ordenamiento: v.ordenamiento ?? null });
    } else {
      setVistaProveedorTabla(VISTA_DEFAULT_PROVEEDORES);
    }
  }, [vistasProveedores.vistas]);

  if (loading || loadingProv) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (error || errorProv) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-center">
          <p className="text-[14px] font-medium text-danger-text mb-1">Error al cargar datos</p>
          <p className="text-[12px] text-text-muted">{error || errorProv}</p>
        </div>
      </div>
    );
  }

  const filteredClients = clientes.filter(c => {
    // Filtro por estatus: por default solo activos
    if (!showInactivos && c.statusOperativo !== 'ACTIVO') return false;
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    return contiene(c.nombre, q) ||
      (c.rfc ?? '').toLowerCase().includes(q) ||
      (c.representante ?? '').toLowerCase().includes(q) ||
      (c.idSemantico ?? '').toLowerCase().includes(q) ||
      (c.comercial ?? '').toLowerCase().includes(q);
  });

  const filteredProviders = filtrarProveedores(proveedores, {
    pestana: pestanaProveedor,
    busqueda: providerSearchTerm,
  });

  /* Las pestañas son los TIPOS que el dato tiene (§4.5). «Navieras» y
     «Aerolíneas» no existen como tipo y daban siempre cero. */
  const conteoProveedores = conteoPorPestana(proveedores, { busqueda: providerSearchTerm });

  // ── Edición en línea (Bloque 14) ──────────────────────────────────────────
  // Solo admin y administracion. Los demás ven las columnas en solo lectura.
  const rolActual = user?.rol;
  const editable = puedeEditarEnLista(rolActual as any);
  const autorEmail = user?.email ?? 'desconocido';

  const opcionesEjecutivo = useCallback((area: AreaEjecutivo) => {
    return usuariosPorRol(ROL_DEL_AREA[area]);
  }, []);

  const handleCambiarEstadoCliente = useCallback(async (id: string, nuevoActivo: boolean) => {
    const cliente = clientes.find(c => c.id === id);
    if (!cliente) return;
    const resultado = aplicarCambio(
      cliente as any, 'statusOperativo',
      nuevoActivo ? 'ACTIVO' : 'INACTIVO', autorEmail, new Date().toISOString(),
      { antes: cliente.statusOperativo === 'ACTIVO' ? 'Activo' : 'Inactivo', despues: nuevoActivo ? 'Activo' : 'Inactivo' },
    );
    if (!resultado) return;
    await updateCliente(id, {
      statusOperativo: nuevoActivo ? 'ACTIVO' : 'INACTIVO',
      cambios: resultado.entidad.cambios,
    });
  }, [clientes, autorEmail, updateCliente]);

  const handleCambiarEjecutivoCliente = useCallback(async (id: string, area: AreaEjecutivo, email: string | null) => {
    const cliente = clientes.find(c => c.id === id);
    if (!cliente) return;
    const campo = CAMPO_EJECUTIVO[area];
    const resultado = aplicarCambio(
      cliente as any, campo, email ?? null, autorEmail, new Date().toISOString(),
      { antes: nombreDeUsuario((cliente as any)[campo]) || '—', despues: email ? nombreDeUsuario(email) : '—' },
    );
    if (!resultado) return;
    await updateCliente(id, {
      [campo]: email ?? null,
      cambios: resultado.entidad.cambios,
    } as any);
  }, [clientes, autorEmail, updateCliente]);

  const handleCambiarEstadoProveedor = useCallback(async (id: string, nuevoActivo: boolean) => {
    const prov = proveedores.find(p => p.id === id);
    if (!prov) return;
    const resultado = aplicarCambio(
      prov as any, 'activo', nuevoActivo, autorEmail, new Date().toISOString(),
      { antes: prov.activo ? 'Activo' : 'Inactivo', despues: nuevoActivo ? 'Activo' : 'Inactivo' },
    );
    if (!resultado) return;
    await updateProveedor(id, {
      activo: nuevoActivo,
      cambios: resultado.entidad.cambios,
    });
  }, [proveedores, autorEmail, updateProveedor]);

  const handleCambiarEjecutivoProveedor = useCallback(async (id: string, area: AreaEjecutivo, email: string | null) => {
    const prov = proveedores.find(p => p.id === id);
    if (!prov) return;
    const campo = CAMPO_EJECUTIVO[area];
    const resultado = aplicarCambio(
      prov as any, campo, email ?? null, autorEmail, new Date().toISOString(),
      { antes: nombreDeUsuario((prov as any)[campo]) || '—', despues: email ? nombreDeUsuario(email) : '—' },
    );
    if (!resultado) return;
    await updateProveedor(id, {
      [campo]: email ?? null,
      cambios: resultado.entidad.cambios,
    } as any);
  }, [proveedores, autorEmail, updateProveedor]);

  const clienteTableMeta = useMemo((): EdicionEnListaMeta => ({
    edicion: {
      puedeEditar: editable,
      onCambiarEstado: handleCambiarEstadoCliente,
      onCambiarEjecutivo: handleCambiarEjecutivoCliente,
      opcionesEjecutivo,
    },
  }), [editable, handleCambiarEstadoCliente, handleCambiarEjecutivoCliente, opcionesEjecutivo]);

  const proveedorTableMeta = useMemo((): EdicionEnListaMeta => ({
    edicion: {
      puedeEditar: editable,
      onCambiarEstado: handleCambiarEstadoProveedor,
      onCambiarEjecutivo: handleCambiarEjecutivoProveedor,
      opcionesEjecutivo,
    },
  }), [editable, handleCambiarEstadoProveedor, handleCambiarEjecutivoProveedor, opcionesEjecutivo]);

  return (
    <div className="space-y-[24px]">
      {/* Top Toggle Selector */}
      {!selectedClientId && !selectedProvider && (
        <div className="flex justify-between items-center mb-[12px] bg-card p-4 rounded-xl border border-card-border shadow-sm">
          <h2 className="text-[18px] font-semibold text-text-primary tracking-tight">
            Altas
          </h2>
          <div className="bg-canvas border border-card-border p-1 rounded-lg flex items-center shadow-2xs">
            <button
              onClick={() => setViewType('Clientes')}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${viewType === 'Clientes' ? 'bg-white text-text-primary shadow-sm border border-card-border' : 'text-text-muted hover:text-text-secondary'}`}
            >
              Clientes
            </button>
            <button
              onClick={() => setViewType('Proveedores')}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${viewType === 'Proveedores' ? 'bg-white text-text-primary shadow-sm border border-card-border' : 'text-text-muted hover:text-text-secondary'}`}
            >
              Proveedores
            </button>
          </div>
        </div>
      )}

      {viewType === 'Clientes' && !selectedClientId && (
        <>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px] mb-[24px]">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-[480px]">
                <Search className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Buscar por razón social, RFC, representante..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-[36px] pr-[12px] py-[10px] outline-none text-[14px] bg-card border border-card-border rounded-[8px] focus:border-brand focus:ring-1 focus:ring-brand shadow-sm text-text-primary"
                />
              </div>
              <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showInactivos}
                  onChange={e => setShowInactivos(e.target.checked)}
                  className="accent-brand w-3.5 h-3.5"
                />
                Mostrar inactivos
              </label>
              <span className="text-[11px] text-text-muted tabular-nums">{filteredClients.length} de {clientes.length}</span>
            </div>
            <div className="flex items-center space-x-[12px]">
              {/* Importar Magaya sobrescribe el catálogo completo contra la base
                  en uso. Los datos ya están cargados: hoy solo puede hacer daño.
                  Mantenimiento, no negocio → solo superusuario. */}
              {puedeImportarCatalogo && (
                <button
                  onClick={handleSeedClientes}
                  disabled={seedingClientes}
                  title="Sobrescribe el catálogo de clientes con el seed de Magaya"
                  className="flex items-center bg-white border border-danger-text/30 text-danger-text px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-danger-bg shadow-sm transition-colors shrink-0 disabled:opacity-60"
                >
                  {seedingClientes ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
                  {seedingClientes ? 'Importando…' : 'Importar Magaya'}
                </button>
              )}
              {puedeAltaCliente && (
                <button
                  onClick={() => setShowModal(true)}
                  className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0"
                >
                  Nuevo cliente
                </button>
              )}
            </div>
          </div>

          {/* Selector de vistas */}
          <div className="flex items-center justify-end gap-2 mb-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
            <VistaSelector
              vistas={vistasClientes.vistas}
              vistaActivaId={vistaClienteId}
              currentUserId={user?.uid || user?.id || ''}
              vistaActual={vistaClienteTabla}
              labelDefault="Vista por defecto"
              onSeleccionar={seleccionarVistaCliente}
              onGuardar={async (nombre) => {
                const id = await vistasClientes.crearVista(nombre, vistaClienteTabla.columnas);
                setVistaClienteId(id);
              }}
              onActualizar={(id, cambios) => vistasClientes.actualizarVista(id, cambios)}
              onEliminar={async (id) => {
                await vistasClientes.eliminarVista(id);
                if (vistaClienteId === id) seleccionarVistaCliente(null);
              }}
            />
          </div>

          <SpreadsheetTable<ClienteVermur>
            data={filteredClients}
            columns={CLIENTE_COLUMNS}
            pinnedColumnIds={['nombre']}
            vista={vistaClienteTabla}
            onVistaChange={setVistaClienteTabla}
            onRowClick={(c) => setSelectedClientId(c.id)}
            maxHeight="calc(100vh - 320px)"
            tableMeta={clienteTableMeta}
          />
        </>
      )}

      {viewType === 'Clientes' && selectedClient && (
        <FichaCliente
          cliente={selectedClient}
          onBack={() => setSelectedClientId(null)}
          onUpdate={updateCliente}
        />
      )}

      {/* ========================================================= */}
      {/* VISTA DE PROVEEDORES */}
      {/* ========================================================= */}

      {viewType === 'Proveedores' && !selectedProvider ? (
        <>
          <div className="border-b border-divider mb-[24px]">
            <nav className="-mb-px flex space-x-[32px]">
              {PESTANAS_PROVEEDOR.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setPestanaProveedor(id)}
                  aria-pressed={pestanaProveedor === id}
                  className={`pb-[12px] px-[4px] text-[14px] font-medium transition-colors border-b-[2px] ${
                    pestanaProveedor === id
                      ? 'border-brand text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary hover:border-text-muted'
                  }`}
                >
                  {label}
                  <span className="ml-[6px] text-[12px] text-text-muted tabular-nums">{conteoProveedores[id]}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px] mb-[24px]">
            <div className="relative flex-1 max-w-[480px]">
              <Search className="w-[18px] h-[18px] absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Buscar por nombre, RFC o contacto..."
                value={providerSearchTerm}
                onChange={(e) => setProviderSearchTerm(e.target.value)}
                className="w-full pl-[36px] pr-[12px] py-[10px] outline-none text-[14px] bg-card border border-card-border rounded-[8px] focus:border-brand focus:ring-1 focus:ring-brand shadow-sm text-text-primary"
              />
            </div>
            {puedeAltaProveedor && (
              <div className="flex items-center space-x-[12px]">
                <button
                  onClick={() => setShowProvModal('crear')}
                  className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors shrink-0"
                >
                  Nuevo proveedor
                </button>
              </div>
            )}
          </div>

          {/* Selector de vistas */}
          <div className="flex items-center justify-end gap-2 mb-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
            <VistaSelector
              vistas={vistasProveedores.vistas}
              vistaActivaId={vistaProveedorId}
              currentUserId={user?.uid || user?.id || ''}
              vistaActual={vistaProveedorTabla}
              labelDefault="Vista por defecto"
              onSeleccionar={seleccionarVistaProveedor}
              onGuardar={async (nombre) => {
                const id = await vistasProveedores.crearVista(nombre, vistaProveedorTabla.columnas);
                setVistaProveedorId(id);
              }}
              onActualizar={(id, cambios) => vistasProveedores.actualizarVista(id, cambios)}
              onEliminar={async (id) => {
                await vistasProveedores.eliminarVista(id);
                if (vistaProveedorId === id) seleccionarVistaProveedor(null);
              }}
            />
          </div>

          <SpreadsheetTable<ProveedorVermur>
            data={filteredProviders}
            columns={PROVEEDOR_COLUMNS}
            pinnedColumnIds={['nombre']}
            vista={vistaProveedorTabla}
            onVistaChange={setVistaProveedorTabla}
            onRowClick={(p) => setSelectedProviderId(p.id)}
            maxHeight="calc(100vh - 380px)"
            tableMeta={proveedorTableMeta}
          />
        </>
      ) : null}

      {/* Ficha de Proveedor */}
      {viewType === 'Proveedores' && selectedProvider && (
        <FichaProveedor
          proveedor={selectedProvider}
          quotes={quotes}
          onBack={() => setSelectedProviderId(null)}
          onEdit={() => setShowProvModal('editar')}
        />
      )}

      {showModal && (
        <NuevoClienteModal
          onClose={() => setShowModal(false)}
          onCreate={createCliente}
        />
      )}

      {showProvModal && (
        <ProveedorFormModal
          mode={showProvModal}
          proveedor={showProvModal === 'editar' && selectedProvider ? selectedProvider : undefined}
          onClose={() => setShowProvModal(false)}
          onCreate={createProveedor}
          onUpdate={updateProveedor}
        />
      )}
    </div>
  );
}
