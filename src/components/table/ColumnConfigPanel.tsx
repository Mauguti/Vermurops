/**
 * ColumnConfigPanel.tsx (TV-3)
 *
 * Panel desplegable para configurar columnas visibles y su orden.
 * - Checkbox para mostrar/ocultar cada columna
 * - Drag-to-reorder con @dnd-kit/sortable
 * - Columnas pinneadas: siempre visibles, no se reordenan
 * - Genérico: recibe catálogo de columnas, emite VistaConfig
 */

import React, { useCallback, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Settings } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ColumnInfo {
  id: string;
  label: string;
  pinned: boolean;
}

interface ColumnConfigPanelProps {
  /** All columns from the catalog. */
  allColumns: ColumnInfo[];
  /** Currently visible column IDs in order. */
  visibleIds: string[];
  /** Callback when the user changes visibility or order. */
  onChange: (visibleIds: string[]) => void;
}

// ─── Sortable item ──────────────────────────────────────────────────────────

function SortableColumnItem({
  col,
  isVisible,
  onToggle,
}: {
  col: ColumnInfo;
  isVisible: boolean;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id, disabled: col.pinned });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 px-2 py-1.5 rounded text-xs
        ${isDragging ? 'bg-[#E11D48]/5' : 'hover:bg-gray-50'}
      `}
    >
      {/* Drag handle */}
      {!col.pinned ? (
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
          tabIndex={-1}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      ) : (
        <span className="shrink-0 w-3.5" />
      )}

      {/* Visibility toggle */}
      <button
        onClick={col.pinned ? undefined : onToggle}
        className={`shrink-0 ${col.pinned ? 'text-gray-300 cursor-not-allowed' : isVisible ? 'text-[#E11D48] hover:text-[#BE123C]' : 'text-gray-300 hover:text-gray-500'}`}
        title={col.pinned ? 'Columna fija' : isVisible ? 'Ocultar' : 'Mostrar'}
      >
        {isVisible || col.pinned ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>

      {/* Label */}
      <span className={`flex-1 truncate ${isVisible || col.pinned ? 'text-gray-700' : 'text-gray-400'}`}>
        {col.label}
      </span>

      {col.pinned && (
        <span className="text-[9px] text-gray-400 uppercase tracking-wider">Fija</span>
      )}
    </div>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export default function ColumnConfigPanel({
  allColumns,
  visibleIds,
  onChange,
}: ColumnConfigPanelProps) {
  const [open, setOpen] = useState(false);

  // Current order: pinned first (fixed), then reorderable columns in visibleIds order, then hidden
  const pinnedCols = allColumns.filter(c => c.pinned);
  const reorderableCols = (() => {
    const nonPinned = allColumns.filter(c => !c.pinned);
    const idOrder = new Map(visibleIds.map((id, i) => [id, i]));
    // Sort: visible columns in their order, then hidden columns in catalog order
    return nonPinned.sort((a, b) => {
      const aVis = idOrder.has(a.id);
      const bVis = idOrder.has(b.id);
      if (aVis && bVis) return (idOrder.get(a.id)! - idOrder.get(b.id)!);
      if (aVis && !bVis) return -1;
      if (!aVis && bVis) return 1;
      return 0;
    });
  })();

  const visibleSet = new Set(visibleIds);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleToggle = useCallback((colId: string) => {
    if (visibleSet.has(colId)) {
      onChange(visibleIds.filter(id => id !== colId));
    } else {
      onChange([...visibleIds, colId]);
    }
  }, [visibleIds, visibleSet, onChange]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const reorderableIds = reorderableCols.filter(c => visibleSet.has(c.id)).map(c => c.id);
    const oldIndex = reorderableIds.indexOf(active.id as string);
    const newIndex = reorderableIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(reorderableIds, oldIndex, newIndex);
    // Rebuild visibleIds: pinned IDs first (preserve order), then reordered
    const pinnedIds = pinnedCols.map(c => c.id).filter(id => visibleIds.includes(id));
    onChange([...pinnedIds, ...reordered]);
  }, [reorderableCols, visibleSet, visibleIds, pinnedCols, onChange]);

  const sortableIds = reorderableCols.filter(c => visibleSet.has(c.id)).map(c => c.id);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`p-1.5 rounded transition-colors border ${open ? 'bg-[#E11D48]/5 border-[#E11D48]/30 text-[#E11D48]' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
        title="Configurar columnas"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-2">
            <h4 className="px-3 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Columnas
            </h4>

            {/* Pinned columns (not draggable) */}
            {pinnedCols.map(col => (
              <SortableColumnItem
                key={col.id}
                col={col}
                isVisible={true}
                onToggle={() => {}}
              />
            ))}

            {pinnedCols.length > 0 && reorderableCols.length > 0 && (
              <div className="mx-3 my-1 border-t border-gray-100" />
            )}

            {/* Reorderable columns */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {reorderableCols.map(col => (
                  <SortableColumnItem
                    key={col.id}
                    col={col}
                    isVisible={visibleSet.has(col.id)}
                    onToggle={() => handleToggle(col.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </>
      )}
    </div>
  );
}
