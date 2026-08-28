import React from 'react';
import { Package, FileText, Users, Target, Handshake } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useCotizaciones } from '../hooks/useCotizaciones';
import { useProspectos } from '../hooks/useProspectos';
import ModuloEnDesarrollo from './ui/ModuloEnDesarrollo';
import { PipelineStageId } from './quotes/QuotesData';

/**
 * Dashboard.
 *
 * ── Qué cambió y por qué ───────────────────────────────────────────────────
 * Todo lo que había aquí era inventado: cuatro KPIs con números fijos, una
 * tabla de embarques fechada en 2023, una lista de tareas y otra de
 * vencimientos escritas a mano, y un saludo que decía «Hola, Mau» sin importar
 * quién entrara.
 *
 * El cliente pidió dos cosas concretas (§4.8, «Limpieza por área»):
 *   - Ventas no debe ver embarques activos ni cotizaciones pendientes: no le
 *     aportan.
 *   - Los reportes sugeridos no se usan.
 *
 * Al no haber datos reales de embarques —el módulo es un placeholder— la única
 * salida honesta es mostrar lo que sí existe: cotizaciones y prospectos, que
 * viven en Firestore. Cada rol ve sus indicadores y nada más.
 */

// ─── Etapas agrupadas ─────────────────────────────────────────────────────────
const EN_PRICING: PipelineStageId[] = [
  'solicitado_pricing', 'pricing_solicitando', 'cotizaciones_recibidas', 'consolidada',
];
const EN_CLIENTE: PipelineStageId[] = ['enviada_cliente', 'negociacion'];

interface KpiProps {
  label: string;
  valor: number | string;
  nota?: string;
  icono: React.ReactNode;
}

function Kpi({ label, valor, nota, icono }: KpiProps) {
  return (
    <div className="bg-card p-[24px] rounded-[12px] border border-card-border shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-[16px]">
        <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-muted">{label}</span>
        <span className="text-text-muted opacity-60">{icono}</span>
      </div>
      <div>
        <div className="text-[32px] font-medium text-text-primary tabular-nums leading-none mb-[8px]">{valor}</div>
        {nota && <div className="text-[12px] font-medium text-text-muted">{nota}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { quotes, loading: cargandoQuotes } = useCotizaciones();
  const { prospectos, loading: cargandoProspectos } = useProspectos();

  const rol = user?.rol ?? 'ventas';
  const esVentas = rol === 'ventas';
  const esPricing = rol === 'pricing';
  const esOperativo = rol === 'operaciones' || rol === 'administracion';

  const hoy = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  // Ventas solo cuenta lo suyo; los demás roles, todo.
  const mias = esVentas
    ? quotes.filter(q => q.vendedorId === user?.uid || q.vendedorId === user?.nombre)
    : quotes;

  const misProspectos = esVentas
    ? prospectos.filter(p => p.responsable === user?.nombre || p.responsable === user?.uid)
    : prospectos;

  const cargando = cargandoQuotes || cargandoProspectos;

  const cuenta = (etapas: PipelineStageId[]) => mias.filter(q => etapas.includes(q.etapa)).length;

  return (
    <div className="space-y-[32px]">

      {/* ── Saludo ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Dashboard</h2>
        <p className="text-[14px] text-text-secondary mt-1">
          Hola, {user?.nombre ?? ''}. {hoy}
        </p>
      </div>

      {/* ── KPIs por rol ───────────────────────────────────────────────────── */}
      {cargando ? (
        <div className="flex items-center justify-center py-[60px]">
          <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[24px]">

          {/* Ventas: sus leads y su pipeline. Sin embarques ni «cotizaciones
              pendientes», que es justo lo que el cliente pidió quitar. */}
          {esVentas && (
            <>
              <Kpi
                label="Mis prospectos"
                valor={misProspectos.filter(p => p.etapa !== 'convertido').length}
                nota="sin convertir todavía"
                icono={<Target className="w-4 h-4" />}
              />
              <Kpi
                label="Con el cliente"
                valor={cuenta(EN_CLIENTE)}
                nota="enviadas o en negociación"
                icono={<Handshake className="w-4 h-4" />}
              />
              <Kpi
                label="Ganadas"
                valor={mias.filter(q => q.etapa === 'ganada').length}
                nota="histórico"
                icono={<FileText className="w-4 h-4" />}
              />
            </>
          )}

          {/* Pricing: la carga de trabajo de su bandeja. */}
          {esPricing && (
            <>
              <Kpi
                label="En pricing"
                valor={cuenta(EN_PRICING)}
                nota="solicitudes en curso"
                icono={<FileText className="w-4 h-4" />}
              />
              <Kpi
                label="Con el cliente"
                valor={cuenta(EN_CLIENTE)}
                nota="ya cotizadas"
                icono={<Handshake className="w-4 h-4" />}
              />
              <Kpi
                label="Ganadas"
                valor={quotes.filter(q => q.etapa === 'ganada').length}
                nota="histórico"
                icono={<Target className="w-4 h-4" />}
              />
            </>
          )}

          {/* Operaciones y Administración trabajan sobre embarques, que todavía
              no tienen datos reales. Se muestra lo único cierto: cuántas
              cotizaciones están ganadas y esperando convertirse. */}
          {esOperativo && (
            <Kpi
              label="Cotizaciones ganadas"
              valor={quotes.filter(q => q.etapa === 'ganada').length}
              nota="listas para generar embarque"
              icono={<Package className="w-4 h-4" />}
            />
          )}

          {/* Admin ve el panorama completo. */}
          {rol === 'admin' && (
            <>
              <Kpi label="En pricing"   valor={cuenta(EN_PRICING)} icono={<FileText className="w-4 h-4" />} />
              <Kpi label="Con el cliente" valor={cuenta(EN_CLIENTE)} icono={<Handshake className="w-4 h-4" />} />
              <Kpi label="Prospectos"   valor={prospectos.length} icono={<Users className="w-4 h-4" />} />
            </>
          )}
        </div>
      )}

      {/* ── Lo que falta ───────────────────────────────────────────────────── */}
      <ModuloEnDesarrollo
        titulo="Indicadores operativos y de rentabilidad"
        descripcion="Los embarques activos, la carga por ruta y los ingresos del periodo se mostrarán aquí cuando el módulo de embarques y la facturación tengan datos reales. Antes, este panel mostraba cifras de ejemplo fechadas en 2023."
        pendiente="qué reportes genera hoy Vermur a mano. El cliente dijo que los sugeridos no se usan; hacen falta los que sí."
      />
    </div>
  );
}
