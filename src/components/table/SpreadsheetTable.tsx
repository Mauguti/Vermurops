/**
 * SpreadsheetTable.tsx (TV-0 + TV-2)
 *
 * Componente genérico de tabla tipo hoja de cálculo.
 * No sabe nada del módulo que lo usa — recibe data y columns genéricos.
 *
 * Features:
 * - Render compacto con bordes de celda sutiles
 * - Encabezado sticky al scroll vertical
 * - Sorting al clicar encabezado (asc → desc → none)
 * - Column pinning a la izquierda (sticky horizontal)
 * - Alineación por tipo (meta.align: 'left' | 'right' | 'center')
 * - Ignora columnas desconocidas en la vista (fallback silencioso)
 * - Column resize con drag handle (TV-2)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnSizingState,
  type ColumnPinningState,
  type VisibilityState,
  type ColumnOrderState,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import ColumnConfigPanel, { type ColumnInfo } from './ColumnConfigPanel';

// ─── Tipos públicos ──────────────────────────────────────────────────────────

/** Configuración de una columna en una vista guardada. */
export interface ColumnaVista {
  id: string;
  ancho?: number; // px, undefined = auto (usa size del ColumnDef)
}

/** Vista de usuario (subset relevante para la tabla). */
export interface VistaConfig {
  columnas: ColumnaVista[];
  ordenamiento?: { columnaId: string; direccion: 'asc' | 'desc' } | null;
}

/** Extensión de meta para alineación. */
export interface SpreadsheetColumnMeta {
  align?: 'left' | 'right' | 'center';
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SpreadsheetTableProps<T> {
  /** Datos a mostrar. */
  data: T[];
  /** Catálogo completo de columnas del módulo. */
  columns: ColumnDef<T, any>[];
  /** IDs de columnas fijas a la izquierda (no se ocultan, no se mueven). */
  pinnedColumnIds?: string[];
  /** Vista activa. Si null, usa todas las columnas del catálogo. */
  vista?: VistaConfig | null;
  /** Callback cuando el usuario cambia columnas visibles u orden (TV-3). */
  onVistaChange?: (vista: VistaConfig) => void;
  /** Callback al clicar una fila. */
  onRowClick?: (row: T) => void;
  /** Altura máxima del contenedor. Default: sin límite (ocupa lo que necesite). */
  maxHeight?: string;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function SpreadsheetTable<T>({
  data,
  columns,
  pinnedColumnIds = [],
  vista,
  onVistaChange,
  onRowClick,
  maxHeight,
}: SpreadsheetTableProps<T>) {
  // ── Resolver vista → estado de TanStack ───────────────────────────────

  // Set de IDs válidos del catálogo (para ignorar columnas obsoletas)
  const validColumnIds = useMemo(
    () => new Set(columns.map(c => (c as any).id ?? (c as any).accessorKey)),
    [columns],
  );

  // Sorting state
  const [sorting, setSorting] = useState<SortingState>(() => {
    if (vista?.ordenamiento && validColumnIds.has(vista.ordenamiento.columnaId)) {
      return [{ id: vista.ordenamiento.columnaId, desc: vista.ordenamiento.direccion === 'desc' }];
    }
    return [];
  });

  // Column pinning
  const columnPinning = useMemo((): ColumnPinningState => ({
    left: pinnedColumnIds.filter(id => validColumnIds.has(id)),
  }), [pinnedColumnIds, validColumnIds]);

  // ── Column config panel (TV-3) ───────────────────────────────────────

  // Build ColumnInfo[] for the config panel
  const columnInfos = useMemo((): ColumnInfo[] => {
    const pinnedSet = new Set(pinnedColumnIds);
    return columns.map(c => {
      const id = (c as any).id ?? (c as any).accessorKey;
      const label = typeof c.header === 'string' ? c.header : id;
      return { id, label, pinned: pinnedSet.has(id) };
    });
  }, [columns, pinnedColumnIds]);

  // Local vista state — starts from prop, updated locally on config changes
  const [localVista, setLocalVista] = useState<VistaConfig | null | undefined>(vista);

  // Derive visibleIds for the config panel
  const visibleIds = useMemo(() => {
    const v = localVista;
    if (!v) return [...validColumnIds]; // No vista → all visible
    return v.columnas.map(c => c.id).filter(id => validColumnIds.has(id));
  }, [localVista, validColumnIds]);

  // Handle config panel changes
  const handleConfigChange = useCallback((newVisibleIds: string[]) => {
    const newVista: VistaConfig = {
      columnas: newVisibleIds.map(id => {
        // Preserve existing ancho if any
        const existing = localVista?.columnas?.find(c => c.id === id);
        return existing ? { ...existing } : { id };
      }),
      ordenamiento: localVista?.ordenamiento ?? null,
    };
    setLocalVista(newVista);
    onVistaChange?.(newVista);
  }, [localVista, onVistaChange]);

  // Use localVista for resolving TanStack state (override the prop-derived values)
  const effectiveVista = localVista;

  // Re-derive column visibility from effectiveVista
  const effectiveVisibility = useMemo((): VisibilityState => {
    if (!effectiveVista) return {};
    const visSet = new Set(
      effectiveVista.columnas.map(c => c.id).filter(id => validColumnIds.has(id)),
    );
    const vis: VisibilityState = {};
    for (const id of validColumnIds) {
      vis[id] = visSet.has(id);
    }
    return vis;
  }, [effectiveVista, validColumnIds]);

  // Re-derive column order from effectiveVista
  const effectiveOrder = useMemo((): ColumnOrderState => {
    if (!effectiveVista) return [];
    return effectiveVista.columnas.map(c => c.id).filter(id => validColumnIds.has(id));
  }, [effectiveVista, validColumnIds]);

  // Re-derive column sizing from effectiveVista
  const effectiveSizing = useMemo(() => {
    if (!effectiveVista) return {};
    const sizing: Record<string, number> = {};
    for (const c of effectiveVista.columnas) {
      if (c.ancho && validColumnIds.has(c.id)) sizing[c.id] = c.ancho;
    }
    return sizing;
  }, [effectiveVista, validColumnIds]);

  // ── Column sizing state (controlled, con persist debounced) ──────────

  const [columnSizingState, setColumnSizingState] = useState<ColumnSizingState>(effectiveSizing);

  // Sync from vista prop when it changes (ej. user selects a saved vista)
  const prevVistaRef = useRef(vista);
  useEffect(() => {
    if (vista !== prevVistaRef.current) {
      prevVistaRef.current = vista;
      setLocalVista(vista);
      // Also reset sizing state from the new vista
      const newSizing: ColumnSizingState = {};
      if (vista) {
        for (const c of vista.columnas) {
          if (c.ancho && validColumnIds.has(c.id)) newSizing[c.id] = c.ancho;
        }
      }
      setColumnSizingState(newSizing);
    }
  }, [vista, validColumnIds]);

  // Debounce: persist sizing into vista 500ms after last resize
  const sizingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleColumnSizingChange = useCallback((updater: any) => {
    setColumnSizingState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;

      // Debounce persist
      if (sizingTimerRef.current) clearTimeout(sizingTimerRef.current);
      sizingTimerRef.current = setTimeout(() => {
        // Merge new sizes into localVista
        setLocalVista(currentVista => {
          if (!currentVista) return currentVista;
          const updated: VistaConfig = {
            ...currentVista,
            columnas: currentVista.columnas.map(c => ({
              ...c,
              ancho: next[c.id] ?? c.ancho,
            })),
          };
          onVistaChange?.(updated);
          return updated;
        });
      }, 500);

      return next;
    });
  }, [onVistaChange]);

  // ── TanStack Table ────────────────────────────────────────────────────

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility: effectiveVisibility,
      columnOrder: effectiveOrder.length > 0 ? effectiveOrder : undefined,
      columnSizing: columnSizingState,
      columnPinning,
    },
    onSortingChange: setSorting,
    onColumnSizingChange: handleColumnSizingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
  });

  // ── Render ────────────────────────────────────────────────────────────

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;

  return (
    <div className="relative">
      {/* Config panel button — positioned above the table */}
      {onVistaChange && (
        <div className="absolute -top-8 right-0 z-30">
          <ColumnConfigPanel
            allColumns={columnInfos}
            visibleIds={visibleIds}
            onChange={handleConfigChange}
          />
        </div>
      )}

      <div
        className="border border-gray-200 rounded-lg overflow-auto bg-white"
        style={maxHeight ? { maxHeight } : undefined}
      >
      <table className="w-full border-collapse" style={{ minWidth: table.getTotalSize() }}>
        {/* Header sticky */}
        <thead className="sticky top-0 z-20 bg-gray-50">
          {headerGroups.map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => {
                const meta = header.column.columnDef.meta as SpreadsheetColumnMeta | undefined;
                const align = meta?.align ?? 'left';
                const isPinned = header.column.getIsPinned();
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();

                return (
                  <th
                    key={header.id}
                    className={`
                      relative group/th
                      px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider
                      border-b border-r border-gray-200 select-none whitespace-nowrap
                      ${canSort ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}
                      ${isPinned ? 'sticky z-30 bg-gray-50' : ''}
                      ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}
                    `}
                    style={{
                      width: header.getSize(),
                      minWidth: header.getSize(),
                      ...(isPinned ? { left: header.getStart('left') } : {}),
                    }}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <span className="flex items-center gap-1 justify-between">
                      <span className={`flex-1 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {canSort && (
                        <span className="shrink-0 w-3 h-3 text-gray-300">
                          {sorted === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-primario" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="w-3 h-3 text-primario" />
                          ) : (
                            <ChevronsUpDown className="w-3 h-3" />
                          )}
                        </span>
                      )}
                    </span>
                    {/* Resize handle */}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={e => { e.stopPropagation(); header.getResizeHandler()(e); }}
                        onTouchStart={e => { e.stopPropagation(); header.getResizeHandler()(e); }}
                        onClick={e => e.stopPropagation()}
                        className={`
                          absolute right-0 top-0 h-full w-1 cursor-col-resize
                          group-hover/th:bg-primario/30
                          ${header.column.getIsResizing() ? 'bg-primario' : ''}
                        `}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        {/* Body */}
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={table.getVisibleLeafColumns().length}
                className="px-4 py-12 text-center text-sm text-gray-400"
              >
                Sin registros
              </td>
            </tr>
          )}

          {rows.map(row => (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={`
                border-b border-gray-100 transition-colors
                ${onRowClick ? 'cursor-pointer hover:bg-primario/5' : 'hover:bg-gray-50/60'}
              `}
            >
              {row.getVisibleCells().map(cell => {
                const meta = cell.column.columnDef.meta as SpreadsheetColumnMeta | undefined;
                const align = meta?.align ?? 'left';
                const isPinned = cell.column.getIsPinned();

                return (
                  <td
                    key={cell.id}
                    className={`
                      px-3 py-1.5 text-[11px] text-gray-700 border-r border-gray-50 whitespace-nowrap
                      ${isPinned ? 'sticky z-10 bg-white' : ''}
                      ${align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : ''}
                    `}
                    style={{
                      width: cell.column.getSize(),
                      minWidth: cell.column.getSize(),
                      ...(isPinned ? { left: cell.column.getStart('left') } : {}),
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
