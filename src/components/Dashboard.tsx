import React, { useState } from 'react';
import { initialShipments, initialQuotes, initialClients } from '../data';
import { Package, FileText, Users, DollarSign, AlertCircle, ArrowUpRight, ArrowDownRight, Minus, Check } from 'lucide-react';

const SparklineUp = ({ colorClass = 'text-success-text' }) => (
  <svg width="48" height="16" viewBox="0 0 48 16" fill="none" stroke="currentColor" className={colorClass} strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 14 L 14 8 L 22 10 L 34 2 L 46 4" />
  </svg>
);

const SparklineFlat = ({ colorClass = 'text-text-muted' }) => (
  <svg width="48" height="16" viewBox="0 0 48 16" fill="none" stroke="currentColor" className={colorClass} strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 10 L 14 10 L 22 8 L 34 10 L 46 10" />
  </svg>
);

export default function Dashboard() {
  const recentShipments = [
    { id: 'SHP-2023-001', client: 'Grupo Textil Monterrey', origin: 'Shanghai', destination: 'Manzanillo', mode: 'Marítimo', status: 'En tránsito', eta: '2023-11-15' },
    { id: 'SHP-2023-002', client: 'Industrias Querétaro SA', origin: 'Frankfurt', destination: 'CDMX', mode: 'Aéreo', status: 'Cotizado', eta: '2023-10-30' },
    { id: 'SHP-2023-003', client: 'Comercial del Norte', origin: 'Laredo', destination: 'Monterrey', mode: 'Terrestre', status: 'En aduana', eta: '2023-10-25' },
    { id: 'SHP-2023-004', client: 'Grupo Textil Monterrey', origin: 'Ningbo', destination: 'Ensenada', mode: 'Marítimo', status: 'Entregado', eta: '2023-10-20' }
  ];

  const upcomingDeadlines = [
    { id: 1, title: 'Cotización Comercial del Norte', date: 'Mañana, 14:00' },
    { id: 2, title: 'Libre estadía contenedor MSC', date: 'Jue 5 Nov' }
  ];

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Entregado': return 'bg-success-bg text-success-text';
      case 'En tránsito': return 'bg-info-bg text-info-text';
      case 'En aduana': return 'bg-warning-bg text-warning-text';
      case 'Cotizado': return 'bg-neutral-bg text-neutral-text';
      default: return 'bg-neutral-bg text-neutral-text';
    }
  };

  const [tasks, setTasks] = useState([
    { id: 1, title: 'Revisar BL de SHP-2023-003', done: false },
    { id: 2, title: 'Confirmar pago de aduana MXZLO', done: false },
    { id: 3, title: 'Enviar cotización a Industrias Qro', done: false }
  ]);

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const today = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-[32px]">
      
      {/* Header Greeting */}
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Dashboard</h2>
        <p className="text-[14px] text-text-secondary mt-1">Hola, Mau. {today}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[24px]">
        {/* KPI 1 */}
        <div className="bg-card p-[24px] rounded-[12px] border border-card-border shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-[16px]">
            <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-muted">Embarques activos</span>
            <SparklineUp colorClass="text-success-text opacity-40" />
          </div>
          <div>
            <div className="text-[32px] font-medium text-text-primary tabular-nums leading-none mb-[12px]">3</div>
            <div className="flex items-center text-[12px] font-medium text-success-text">
              <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
              <span>+1 vs. semana pasada</span>
            </div>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-card p-[24px] rounded-[12px] border border-card-border shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-[16px]">
            <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-muted">Cotizaciones pendientes</span>
            <SparklineFlat colorClass="text-text-muted opacity-30" />
          </div>
          <div>
            <div className="text-[32px] font-medium text-text-primary tabular-nums leading-none mb-[12px]">1</div>
            <div className="flex items-center text-[12px] font-medium text-text-muted">
              <Minus className="w-3.5 h-3.5 mr-1" />
              <span>Sin cambios vs. semana pasada</span>
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-card p-[24px] rounded-[12px] border border-card-border shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-[16px]">
            <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-muted">Clientes activos</span>
            <Users className="w-4 h-4 text-text-muted opacity-60" />
          </div>
          <div>
            <div className="text-[32px] font-medium text-text-primary tabular-nums leading-none mb-[12px]">3</div>
            <div className="flex items-center text-[12px] font-medium text-text-muted">
              <span>Mantenido estable</span>
            </div>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-card p-[24px] rounded-[12px] border border-card-border shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-[16px]">
            <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-muted">Ingresos del mes (USD)</span>
            <SparklineUp colorClass="text-success-text opacity-40" />
          </div>
          <div>
            <div className="text-[32px] font-medium text-text-primary tabular-nums leading-none mb-[12px]">$4,025</div>
            <div className="flex items-center text-[12px] font-medium text-success-text">
              <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
              <span>+12% vs. mes anterior</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px]">
        {/* Main Content (2/3 width) */}
        <div className="lg:col-span-2 space-y-[24px]">
          
          {/* Alert Band */}
          <div className="bg-card border-l-[3px] border-l-brand border-y border-r border-y-card-border border-r-card-border py-[16px] px-[20px] rounded-r-[12px] rounded-l-[4px] flex flex-col sm:flex-row sm:items-center justify-between shadow-sm">
            <div className="flex items-center text-[14px]">
              <AlertCircle className="w-[18px] h-[18px] text-brand mr-[12px]" />
              <strong className="text-text-primary mr-[6px] font-medium">Alerta operativa:</strong>
              <span className="text-text-secondary">2 embarques requieren documentación.</span>
            </div>
            <button className="mt-3 sm:mt-0 bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm whitespace-nowrap">
              Revisar
            </button>
          </div>

          {/* Table */}
          <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden">
            <div className="px-[24px] py-[20px] border-b border-divider">
               <h3 className="text-[15px] font-semibold text-text-primary">Embarques recientes</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="bg-canvas text-left px-[24px] py-[12px] text-[11px] uppercase text-text-muted tracking-[0.05em] font-medium border-b border-divider"># Embarque</th>
                    <th className="bg-canvas text-left px-[24px] py-[12px] text-[11px] uppercase text-text-muted tracking-[0.05em] font-medium border-b border-divider">Cliente</th>
                    <th className="bg-canvas text-left px-[24px] py-[12px] text-[11px] uppercase text-text-muted tracking-[0.05em] font-medium border-b border-divider">Origen → Destino</th>
                    <th className="bg-canvas text-left px-[24px] py-[12px] text-[11px] uppercase text-text-muted tracking-[0.05em] font-medium border-b border-divider">Modo</th>
                    <th className="bg-canvas text-left px-[24px] py-[12px] text-[11px] uppercase text-text-muted tracking-[0.05em] font-medium border-b border-divider">Estatus</th>
                    <th className="bg-canvas text-left px-[24px] py-[12px] text-[11px] uppercase text-text-muted tracking-[0.05em] font-medium border-b border-divider">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {recentShipments.map(shp => (
                    <tr key={shp.id} className="hover:bg-neutral-bg transition-colors">
                      <td className="px-[24px] py-[16px] text-[13px] font-medium text-text-primary tabular-nums whitespace-nowrap">{shp.id}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary">{shp.client}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary whitespace-nowrap">
                        <span className="text-text-secondary">{shp.origin}</span>
                        <span className="mx-2 text-text-muted">→</span>
                        <span className="text-text-secondary">{shp.destination}</span>
                      </td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary">{shp.mode}</td>
                      <td className="px-[24px] py-[16px]">
                        <span className={`px-[10px] py-[4px] rounded-[6px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap ${getStatusColor(shp.status)}`}>
                          {shp.status}
                        </span>
                      </td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">{shp.eta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Side Panel (1/3 width) */}
        <div className="lg:col-span-1 space-y-[24px]">
          
          {/* Tareas Pendientes */}
          <div className="bg-card rounded-[12px] border border-card-border shadow-sm p-[24px]">
            <h3 className="text-[15px] font-semibold text-text-primary mb-[20px]">Tareas pendientes</h3>
            <ul className="space-y-[16px]">
              {tasks.map(task => (
                <li key={task.id} className="flex items-start group">
                  <button 
                    onClick={() => toggleTask(task.id)}
                    className={`mt-[2px] w-[18px] h-[18px] rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${task.done ? 'bg-brand border-brand' : 'border-card-border bg-canvas group-hover:border-brand/40'}`}
                  >
                    {task.done && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <span className={`ml-[12px] text-[13px] ${task.done ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                    {task.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Próximos Vencimientos */}
          <div className="bg-card rounded-[12px] border border-card-border shadow-sm p-[24px]">
            <h3 className="text-[15px] font-semibold text-text-primary mb-[20px]">Próximos vencimientos</h3>
            <ul className="space-y-[16px]">
              {upcomingDeadlines.map(deadline => (
                <li key={deadline.id} className="flex flex-col">
                  <span className="text-[13px] text-text-primary font-medium mb-[4px]">{deadline.title}</span>
                  <div className="flex items-center text-[12px] text-warning-text font-medium bg-warning-bg w-fit px-[8px] py-[2px] rounded-[4px]">
                     {deadline.date}
                  </div>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}
