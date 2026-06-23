import React, { useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Calculator, History, AlertCircle, Building, CheckCircle2 } from 'lucide-react';

export default function ExchangeRates() {
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [amount, setAmount] = useState('1000');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('MXN');

  const currentRates = {
    USD: 17.85,
    EUR: 19.40,
    CNY: 2.45
  };

  const calculateConversion = () => {
    const num = parseFloat(amount) || 0;
    if (fromCurrency === 'USD' && toCurrency === 'MXN') return (num * currentRates.USD).toFixed(2);
    if (fromCurrency === 'EUR' && toCurrency === 'MXN') return (num * currentRates.EUR).toFixed(2);
    if (fromCurrency === 'CNY' && toCurrency === 'MXN') return (num * currentRates.CNY).toFixed(2);
    
    if (fromCurrency === 'MXN' && toCurrency === 'USD') return (num / currentRates.USD).toFixed(2);
    if (fromCurrency === 'MXN' && toCurrency === 'EUR') return (num / currentRates.EUR).toFixed(2);
    if (fromCurrency === 'MXN' && toCurrency === 'CNY') return (num / currentRates.CNY).toFixed(2);

    return num.toFixed(2); // same currency
  };

  const history = [
    { date: '24 Oct 2023', usd: 17.85, eur: 19.40, source: 'DOF / Banxico', user: 'Sistema (Auto)' },
    { date: '23 Oct 2023', usd: 17.82, eur: 19.35, source: 'DOF / Banxico', user: 'Sistema (Auto)' },
    { date: '20 Oct 2023', usd: 17.90, eur: 19.50, source: 'DOF / Banxico', user: 'Sistema (Auto)' },
    { date: '19 Oct 2023', usd: 17.95, eur: 19.55, source: 'Manual', user: 'Ana Silva' },
    { date: '18 Oct 2023', usd: 17.88, eur: 19.45, source: 'DOF / Banxico', user: 'Sistema (Auto)' },
  ];

  return (
    <div className="space-y-[32px]">
      <div>
        <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Tipo de Cambio</h2>
        <p className="text-[13px] text-text-secondary mt-[4px]">Gestión multi-moneda (USD, EUR, CNY a MXN) para cotizaciones y facturación CFDI.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[16px]">
        <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
          <div className="flex justify-between items-start mb-[12px]">
             <span className="text-[14px] font-bold text-text-primary tracking-tight">USD / MXN</span>
             <span className="text-[10px] font-medium text-text-secondary bg-neutral-bg px-[8px] py-[2px] rounded uppercase tracking-wider">DOF / Banxico</span>
          </div>
          <div className="flex items-end mb-[8px]">
             <span className="text-[32px] font-bold text-text-primary tabular-nums leading-none mr-[12px]">{currentRates.USD.toFixed(4)}</span>
             <span className="flex items-center text-[13px] font-bold text-error-text mb-[2px]">
               <TrendingDown className="w-[16px] h-[16px] mr-[4px]" />
               -0.03
             </span>
          </div>
          <p className="text-[11px] text-text-muted">Actualizado hoy 13:00</p>
        </div>

        <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
          <div className="flex justify-between items-start mb-[12px]">
             <span className="text-[14px] font-bold text-text-primary tracking-tight">EUR / MXN</span>
             <span className="text-[10px] font-medium text-text-secondary bg-neutral-bg px-[8px] py-[2px] rounded uppercase tracking-wider">DOF / Banxico</span>
          </div>
          <div className="flex items-end mb-[8px]">
             <span className="text-[32px] font-bold text-text-primary tabular-nums leading-none mr-[12px]">{currentRates.EUR.toFixed(4)}</span>
             <span className="flex items-center text-[13px] font-bold text-success-text mb-[2px]">
               <TrendingUp className="w-[16px] h-[16px] mr-[4px]" />
               +0.05
             </span>
          </div>
          <p className="text-[11px] text-text-muted">Actualizado hoy 13:00</p>
        </div>

        <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
          <div className="flex justify-between items-start mb-[12px]">
             <span className="text-[14px] font-bold text-text-primary tracking-tight">CNY / MXN</span>
             <span className="text-[10px] font-medium text-text-secondary bg-neutral-bg px-[8px] py-[2px] rounded uppercase tracking-wider">Manual</span>
          </div>
          <div className="flex items-end mb-[8px]">
             <span className="text-[32px] font-bold text-text-primary tabular-nums leading-none mr-[12px]">{currentRates.CNY.toFixed(4)}</span>
             <span className="flex items-center text-[13px] font-bold text-text-muted mb-[2px]">
               0.00
             </span>
          </div>
          <p className="text-[11px] text-text-muted">Actualizado ayer 09:30</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px]">
        
        {/* Main Control Panel */}
        <div className="lg:col-span-2 space-y-[24px]">
           <div className="bg-white border border-card-border rounded-[12px] p-[24px] shadow-sm relative overflow-hidden">
             {/* Decorative background element */}
             <div className="absolute top-0 right-0 w-[120px] h-[120px] bg-brand/5 rounded-bl-[100px] pointer-events-none" />
             
             <div className="flex items-start justify-between mb-[24px] relative z-10">
                <div>
                   <h3 className="text-[16px] font-semibold text-text-primary flex items-center">
                     <Building className="w-[18px] h-[18px] mr-[8px] text-brand" />
                     Tipo de cambio del día (Para CFDI)
                   </h3>
                   <p className="text-[13px] text-text-secondary mt-[4px]">Este es el tipo de cambio oficial DOF vigente usado al timbrar facturas.</p>
                </div>
                <div className="bg-success-bg/30 text-success-text px-[10px] py-[4px] rounded-full text-[11px] font-bold uppercase tracking-wide flex items-center shadow-sm">
                   <CheckCircle2 className="w-[12px] h-[12px] mr-[4px]" /> En sincronía
                </div>
             </div>

             <div className="flex flex-col sm:flex-row gap-[24px] items-center p-[20px] bg-canvas border border-card-border rounded-[12px] mb-[24px]">
                <div className="text-center sm:text-left">
                   <p className="text-[11px] font-bold text-text-muted uppercase tracking-[0.05em] mb-[4px]">Valor Fiscal Vigente (USD)</p>
                   <p className="text-[36px] font-black text-brand tabular-nums leading-tight tracking-tight">${currentRates.USD.toFixed(4)} <span className="text-[14px] font-medium text-text-secondary">MXN</span></p>
                </div>
                
                <div className="hidden sm:block w-[1px] h-[60px] bg-divider mx-[12px]" />
                
                <div className="flex-1 w-full space-y-[16px]">
                   <label className="flex items-center justify-between p-[12px] border border-card-border rounded-[8px] bg-white cursor-pointer hover:border-brand transition-colors">
                      <div>
                         <span className="block text-[13px] font-semibold text-text-primary">Actualización automática</span>
                         <span className="block text-[11px] text-text-secondary">Sincroniza con Banxico/DOF diariamente.</span>
                      </div>
                      <div className="relative inline-flex items-center">
                         <input type="checkbox" className="sr-only peer" checked={autoUpdate} onChange={() => setAutoUpdate(!autoUpdate)} />
                         <div className="w-[36px] h-[20px] bg-card-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[16px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[16px] after:w-[16px] after:transition-all peer-checked:bg-brand"></div>
                      </div>
                   </label>
                   
                   <button className="w-full flex items-center justify-center bg-white border border-card-border px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium text-text-primary shadow-sm hover:bg-neutral-bg transition-colors">
                      <RefreshCw className="w-[14px] h-[14px] mr-[8px]" />
                      Actualizar de Banxico ahora
                   </button>
                </div>
             </div>

             <div className="bg-info-bg/30 border border-info-bg rounded-[8px] p-[12px] flex items-start">
               <AlertCircle className="w-[16px] h-[16px] text-info-text mr-[12px] shrink-0 mt-[2px]" />
               <p className="text-[12px] text-info-text leading-relaxed">
                  <strong>Nota:</strong> Este valor centralizado se aplica automáticamente a las nuevas cotizaciones generadas y es el que se utilizará para el timbrado de facturas (CFDI) en el día operativo en curso.
               </p>
             </div>
           </div>

           <div className="bg-white border border-card-border rounded-[12px] shadow-sm overflow-hidden flex flex-col">
              <div className="p-[20px] border-b border-divider flex items-center">
                 <History className="w-[18px] h-[18px] mr-[8px] text-text-secondary" />
                 <h3 className="text-[16px] font-semibold text-text-primary">Historial de variaciones</h3>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr>
                          <th className="bg-canvas border-b border-card-border py-[12px] px-[20px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em]">Fecha</th>
                          <th className="bg-canvas border-b border-card-border py-[12px] px-[20px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em]">USD / MXN</th>
                          <th className="bg-canvas border-b border-card-border py-[12px] px-[20px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em]">EUR / MXN</th>
                          <th className="bg-canvas border-b border-card-border py-[12px] px-[20px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em]">Fuente</th>
                          <th className="bg-canvas border-b border-card-border py-[12px] px-[20px] text-[11px] font-medium text-text-muted uppercase tracking-[0.05em]">Capturado por</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-divider font-medium">
                       {history.map((record, i) => (
                          <tr key={i} className="hover:bg-neutral-bg transition-colors">
                             <td className="py-[12px] px-[20px] text-[13px] text-text-secondary whitespace-nowrap">{record.date}</td>
                             <td className="py-[12px] px-[20px] text-[13px] text-text-primary tabular-nums font-bold">${record.usd.toFixed(4)}</td>
                             <td className="py-[12px] px-[20px] text-[13px] text-text-primary tabular-nums">${record.eur.toFixed(4)}</td>
                             <td className="py-[12px] px-[20px]">
                                <span className={`text-[11px] px-[8px] py-[2px] rounded ${record.source === 'DOF / Banxico' ? 'bg-success-bg/30 text-success-text' : 'bg-warning-bg/40 text-warning-text'}`}>{record.source}</span>
                             </td>
                             <td className="py-[12px] px-[20px] text-[13px] text-text-secondary">{record.user}</td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>

        {/* Quick Conversion Widget */}
        <div className="w-full">
           <div className="bg-white border border-card-border rounded-[12px] shadow-sm p-[24px] sticky top-[24px]">
              <div className="flex items-center mb-[20px]">
                 <Calculator className="w-[18px] h-[18px] mr-[8px] text-brand" />
                 <h3 className="text-[16px] font-semibold text-text-primary">Conversión Rápida</h3>
              </div>
              <p className="text-[13px] text-text-secondary mb-[24px]">Calcula el valor equivalente para revisión de facturas o cotizaciones.</p>
              
              <div className="space-y-[16px]">
                 <div>
                    <label className="block text-[12px] font-medium text-text-primary mb-[6px]">Monto</label>
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[10px] text-[16px] font-semibold text-text-primary focus:outline-none focus:border-brand shadow-sm" 
                    />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-[12px]">
                    <div>
                       <label className="block text-[12px] font-medium text-text-primary mb-[6px]">De</label>
                       <select 
                         value={fromCurrency}
                         onChange={(e) => setFromCurrency(e.target.value)}
                         className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[10px] text-[14px] font-medium text-text-primary focus:outline-none focus:border-brand shadow-sm"
                       >
                          <option>USD</option>
                          <option>EUR</option>
                          <option>CNY</option>
                          <option>MXN</option>
                       </select>
                    </div>
                    <div>
                       <label className="block text-[12px] font-medium text-text-primary mb-[6px]">A</label>
                       <select 
                         value={toCurrency}
                         onChange={(e) => setToCurrency(e.target.value)}
                         className="w-full bg-white border border-card-border rounded-[8px] px-[12px] py-[10px] text-[14px] font-medium text-text-primary focus:outline-none focus:border-brand shadow-sm"
                       >
                          <option>MXN</option>
                          <option>USD</option>
                          <option>EUR</option>
                          <option>CNY</option>
                       </select>
                    </div>
                 </div>

                 <div className="pt-[16px] mt-[8px] border-t border-divider">
                    <p className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] mb-[4px]">Resultado</p>
                    <p className="text-[28px] font-black text-text-primary tabular-nums tracking-tight">
                       ${calculateConversion()} <span className="text-[16px] font-bold text-text-secondary">{toCurrency}</span>
                    </p>
                 </div>
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
