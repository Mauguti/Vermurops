import React from 'react';
import { Calendar, Filter, Download, FileText, ChevronRight, BarChart2, Activity, TrendingUp, DollarSign, Target, Clock, TrendingDown } from 'lucide-react';

export default function Reports() {
  return (
    <div className="space-y-[32px]">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-[16px]">
        <div>
          <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Reportes y BI</h2>
          <p className="text-[13px] text-text-secondary mt-[4px]">Indicadores clave y análisis de rentabilidad operativa.</p>
        </div>
        <div className="flex items-center space-x-[12px]">
          <button className="flex items-center bg-white border border-card-border px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium text-text-primary shadow-sm hover:bg-neutral-bg transition-colors">
             <Calendar className="w-[16px] h-[16px] mr-[8px] text-text-muted" />
             Octubre 2023 - Actual
          </button>
          <button className="flex items-center bg-white border border-card-border px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium text-text-primary shadow-sm hover:bg-neutral-bg transition-colors">
             <Filter className="w-[16px] h-[16px] mr-[8px] text-text-muted" />
             Filtros
          </button>
          <button className="flex items-center bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium shadow-sm hover:bg-brand-hover transition-colors">
             <Download className="w-[16px] h-[16px] mr-[8px]" />
             Exportar
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-[24px]">
        {/* Main Dashboard */}
        <div className="flex-1 space-y-[24px]">
          
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-[16px]">
             {/* Card 1 */}
             <div className="bg-white border border-card-border rounded-[12px] p-[16px] shadow-sm">
                <div className="flex justify-between items-start mb-[12px]">
                   <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] leading-tight">Ingresos (Periodo)</span>
                   <DollarSign className="w-[16px] h-[16px] text-brand" />
                </div>
                <p className="text-[18px] lg:text-[20px] font-bold text-text-primary tabular-nums tracking-tight">$1.24M <span className="text-[11px] font-medium text-text-muted">USD</span></p>
                <p className="text-[11px] font-medium text-success-text flex items-center mt-[6px]">
                  <TrendingUp className="w-[12px] h-[12px] mr-[4px]" /> +12.5% vs ant.
                </p>
             </div>
             {/* Card 2 */}
             <div className="bg-white border border-card-border rounded-[12px] p-[16px] shadow-sm">
                <div className="flex justify-between items-start mb-[12px]">
                   <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] leading-tight">Margen Promedio</span>
                   <Activity className="w-[16px] h-[16px] text-brand" />
                </div>
                <p className="text-[18px] lg:text-[20px] font-bold text-text-primary tabular-nums tracking-tight">18.5%</p>
                <p className="text-[11px] font-medium text-success-text flex items-center mt-[6px]">
                  <TrendingUp className="w-[12px] h-[12px] mr-[4px]" /> +2.1% vs ant.
                </p>
             </div>
             {/* Card 3 */}
             <div className="bg-white border border-card-border rounded-[12px] p-[16px] shadow-sm">
                <div className="flex justify-between items-start mb-[12px]">
                   <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] leading-tight">Embarques (Modo)</span>
                   <BarChart2 className="w-[16px] h-[16px] text-brand" />
                </div>
                <p className="text-[18px] lg:text-[20px] font-bold text-text-primary tabular-nums tracking-tight">250</p>
                <p className="text-[11px] font-medium text-text-secondary mt-[6px] tracking-tight">
                  145 Mar / 85 Ter / 20 Aér
                </p>
             </div>
             {/* Card 4 */}
             <div className="bg-white border border-card-border rounded-[12px] p-[16px] shadow-sm">
                <div className="flex justify-between items-start mb-[12px]">
                   <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] leading-tight">Conversión (Cotiz.)</span>
                   <Target className="w-[16px] h-[16px] text-brand" />
                </div>
                <p className="text-[18px] lg:text-[20px] font-bold text-text-primary tabular-nums tracking-tight">68.2%</p>
                <p className="text-[11px] font-medium text-success-text flex items-center mt-[6px]">
                  <TrendingUp className="w-[12px] h-[12px] mr-[4px]" /> +5.4% vs ant.
                </p>
             </div>
             {/* Card 5 */}
             <div className="bg-white border border-card-border rounded-[12px] p-[16px] shadow-sm">
                <div className="flex justify-between items-start mb-[12px]">
                   <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] leading-tight">T. Prom. Aduana</span>
                   <Clock className="w-[16px] h-[16px] text-brand" />
                </div>
                <p className="text-[18px] lg:text-[20px] font-bold text-text-primary tabular-nums tracking-tight">1.2 días</p>
                <p className="text-[11px] font-medium text-success-text flex items-center mt-[6px]">
                  <TrendingDown className="w-[12px] h-[12px] mr-[4px]" /> -0.3d vs ant.
                </p>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px]">
             {/* Line Chart */}
             <div className="bg-white border border-card-border rounded-[12px] p-[24px] shadow-sm flex flex-col">
                <h3 className="text-[14px] font-semibold text-text-primary mb-[4px]">Ingresos Mensuales</h3>
                <p className="text-[12px] text-text-muted mb-[24px]">Últimos 6 meses (Cifras en K USD)</p>
                <div className="flex-1 relative min-h-[200px]">
                   {/* CSS Chart */}
                   <div className="absolute inset-0 flex flex-col justify-between pt-[10px] pb-[20px]">
                      {[400, 300, 200, 100, 0].map(val => (
                         <div key={val} className="w-full flex items-center text-[10px] text-text-muted">
                           <span className="w-[30px] text-right mr-[8px] tabular-nums">{val}</span>
                           <div className="flex-1 border-t border-dashed border-divider"></div>
                         </div>
                      ))}
                   </div>
                   <div className="absolute inset-0 pl-[40px] pt-[10px] pb-[20px]">
                      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                         <polyline points="0,80 20,60 40,70 60,30 80,45 100,20" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                         <circle cx="100" cy="20" r="4" fill="#2563EB" stroke="white" strokeWidth="2" />
                      </svg>
                   </div>
                   <div className="absolute bottom-0 left-[40px] right-0 flex justify-between text-[11px] text-text-muted font-medium px-[10px]">
                      <span>Jun</span><span>Jul</span><span>Ago</span><span>Sep</span><span>Oct</span><span>Nov</span>
                   </div>
                </div>
             </div>

             {/* Bar Chart Modos */}
             <div className="bg-white border border-card-border rounded-[12px] p-[24px] shadow-sm flex flex-col">
                <h3 className="text-[14px] font-semibold text-text-primary mb-[4px]">Embarques por Modo</h3>
                <p className="text-[12px] text-text-muted mb-[24px]">Distribución de carga por tipo de transporte</p>
                <div className="flex-1 flex items-end justify-around pb-[20px] pt-[20px]">
                   <div className="flex flex-col items-center group">
                      <div className="text-[12px] font-medium text-text-primary mb-[8px] opacity-0 group-hover:opacity-100 transition-opacity">145</div>
                      <div className="w-[40px] bg-brand rounded-t-[4px] shadow-sm transition-all h-[140px] group-hover:bg-brand-hover"></div>
                      <span className="text-[11px] font-medium text-text-secondary mt-[12px]">Marítimo</span>
                   </div>
                   <div className="flex flex-col items-center group">
                      <div className="text-[12px] font-medium text-text-primary mb-[8px] opacity-0 group-hover:opacity-100 transition-opacity">85</div>
                      <div className="w-[40px] bg-info-text rounded-t-[4px] shadow-sm transition-all h-[90px] group-hover:brightness-110"></div>
                      <span className="text-[11px] font-medium text-text-secondary mt-[12px]">Terrestre</span>
                   </div>
                   <div className="flex flex-col items-center group">
                      <div className="text-[12px] font-medium text-text-primary mb-[8px] opacity-0 group-hover:opacity-100 transition-opacity">20</div>
                      <div className="w-[40px] bg-success-text rounded-t-[4px] shadow-sm transition-all h-[30px] group-hover:brightness-110"></div>
                      <span className="text-[11px] font-medium text-text-secondary mt-[12px]">Aéreo</span>
                   </div>
                </div>
             </div>

             {/* Donut Chart Cotizaciones */}
             <div className="bg-white border border-card-border rounded-[12px] p-[24px] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-[24px]">
                <div className="flex-1 w-full">
                   <h3 className="text-[14px] font-semibold text-text-primary mb-[4px]">Cotizaciones (Estatus)</h3>
                   <p className="text-[12px] text-text-muted mb-[24px]">Total del periodo</p>
                   <ul className="space-y-[12px]">
                      <li className="flex items-center text-[13px] font-medium text-text-secondary"><span className="w-[10px] h-[10px] rounded-full bg-success-text mr-[8px]"></span> Aceptadas (68%)</li>
                      <li className="flex items-center text-[13px] font-medium text-text-secondary"><span className="w-[10px] h-[10px] rounded-full bg-info-text mr-[8px]"></span> Enviadas (22%)</li>
                      <li className="flex items-center text-[13px] font-medium text-text-secondary"><span className="w-[10px] h-[10px] rounded-full bg-error-text mr-[8px]"></span> Vencidas/Rechz (10%)</li>
                   </ul>
                </div>
                <div className="sm:mr-[20px] shrink-0">
                   <div className="w-[140px] h-[140px] rounded-full flex items-center justify-center relative shadow-inner" style={{ background: 'conic-gradient(#10B981 0% 68%, #3B82F6 68% 90%, #EF4444 90% 100%)' }}>
                      <div className="w-[100px] h-[100px] bg-white rounded-full flex items-center justify-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
                         <div className="text-center">
                            <span className="block text-[20px] font-bold text-text-primary">342</span>
                            <span className="block text-[10px] text-text-muted uppercase tracking-wider">Total</span>
                         </div>
                      </div>
                   </div>
                </div>
             </div>

             {/* Funnel Embudo */}
             <div className="bg-white border border-card-border rounded-[12px] p-[24px] shadow-sm">
                <h3 className="text-[14px] font-semibold text-text-primary mb-[4px]">Embudo Operativo</h3>
                <p className="text-[12px] text-text-muted mb-[24px]">Conversión por etapa (% retención)</p>
                <div className="flex flex-col items-center justify-center space-y-[4px] px-[20px]">
                   <div className="bg-brand/10 text-brand text-[12px] font-bold w-full py-[6px] px-[12px] text-center rounded-[6px] flex justify-between"><span className="font-medium text-text-secondary">Cotización (100%)</span> <span>342</span></div>
                   <div className="bg-brand/30 text-brand text-[12px] font-bold w-[85%] py-[6px] px-[12px] text-center rounded-[6px] flex justify-between"><span className="font-medium bg-white/50 px-1 rounded">Reserva (75%)</span> <span>256</span></div>
                   <div className="bg-brand/60 text-white text-[12px] font-bold w-[70%] py-[6px] px-[12px] text-center rounded-[6px] flex justify-between"><span className="font-medium text-white/90">Embarque (60%)</span> <span>205</span></div>
                   <div className="bg-brand/80 text-white text-[12px] font-bold w-[60%] py-[6px] px-[12px] text-center rounded-[6px] flex justify-between"><span className="font-medium text-white/90">Entregado (55%)</span> <span>188</span></div>
                   <div className="bg-brand text-white text-[12px] font-bold w-[50%] py-[6px] px-[12px] text-center rounded-[6px] flex justify-between"><span className="font-medium text-white/90">Facturado</span> <span>171</span></div>
                </div>
             </div>

             {/* Table Top Clientes */}
             <div className="bg-white border border-card-border rounded-[12px] p-[24px] shadow-sm lg:col-span-2">
                <h3 className="text-[14px] font-semibold text-text-primary mb-[16px]">Top Clientes (Rentabilidad)</h3>
                <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr>
                            <th className="py-[12px] px-[16px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Cliente</th>
                            <th className="py-[12px] px-[16px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em] text-right">Ingresos (USD)</th>
                            <th className="py-[12px] px-[16px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em] text-right">Costo (USD)</th>
                            <th className="py-[12px] px-[16px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em] text-right">Margen Neto</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-divider font-medium">
                         <tr className="hover:bg-neutral-bg transition-colors">
                            <td className="py-[12px] px-[16px] text-[13px] text-text-primary">Tech Solutions MX</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-text-primary text-right tabular-nums">$342,500</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-text-secondary text-right tabular-nums">$275,000</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-success-text text-right tabular-nums"><span className="bg-success-bg/30 px-[6px] py-[2px] rounded">19.7%</span></td>
                         </tr>
                         <tr className="hover:bg-neutral-bg transition-colors">
                            <td className="py-[12px] px-[16px] text-[13px] text-text-primary">Grupo Textil Monterrey</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-text-primary text-right tabular-nums">$218,000</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-text-secondary text-right tabular-nums">$171,100</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-success-text text-right tabular-nums"><span className="bg-success-bg/30 px-[6px] py-[2px] rounded">21.5%</span></td>
                         </tr>
                         <tr className="hover:bg-neutral-bg transition-colors">
                            <td className="py-[12px] px-[16px] text-[13px] text-text-primary">Comercial del Norte</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-text-primary text-right tabular-nums">$185,200</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-text-secondary text-right tabular-nums">$155,000</td>
                            <td className="py-[12px] px-[16px] text-[13px] text-warning-text text-right tabular-nums"><span className="bg-warning-bg/40 px-[6px] py-[2px] rounded">16.3%</span></td>
                         </tr>
                      </tbody>
                   </table>
                </div>
             </div>
          </div>
        </div>

        {/* Right Sidebar - Saved Reports */}
        <div className="w-full lg:w-[280px] shrink-0">
           <div className="bg-canvas border border-card-border rounded-[12px] p-[20px] shadow-sm sticky top-[24px]">
              <h3 className="text-[14px] font-semibold text-text-primary mb-[16px] flex items-center">
                 <FileText className="w-[16px] h-[16px] mr-[8px] text-brand" />
                 Reportes Guardados
              </h3>
              <div className="space-y-[8px]">
                 {[
                    'Estado de cuenta consolidado',
                    'Carga on-hand en WMS',
                    'Aging y Antigüedad de CxC',
                    'Pedimentos del mes (MX)',
                    'Rentabilidad por ruta (Lane)'
                 ].map((report, i) => (
                    <button key={i} className="w-full bg-white border border-card-border rounded-[8px] p-[12px] flex items-center justify-between group hover:border-brand transition-colors text-left shadow-sm">
                       <span className="text-[12px] font-medium text-text-primary group-hover:text-brand leading-tight py-1">{report}</span>
                       <ChevronRight className="w-[14px] h-[14px] text-text-muted group-hover:text-brand shrink-0" />
                    </button>
                 ))}
              </div>
              <button className="w-full mt-[20px] border border-dashed border-card-border rounded-[8px] p-[10px] text-[12px] font-medium text-text-secondary hover:bg-white hover:text-text-primary hover:border-brand transition-colors">
                 + Crear reporte personalizado
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
