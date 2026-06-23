import React, { useState } from 'react';
import { Truck, Plus, Search, Filter, ChevronRight, Printer, Package, MapPin, User, Clock, FileText } from 'lucide-react';

export default function Pickups() {
  const [selectedPickup, setSelectedPickup] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const initialPickups = [
    {
      id: 'PK-2023-110',
      client: 'Comercial del Norte',
      address: 'Laredo, TX (Bodega 4)',
      contact: 'Carlos Gómez',
      phone: '+1 956 555 1234',
      piecesWeight: '2 pallets / 1,200 kg',
      carrier: 'Transportes del Norte',
      date: '2023-10-24',
      timeWindow: '09:00 - 11:00',
      status: 'Recolectada',
      instructions: 'Presentarse en andén 3. Llevar equipo de seguridad (chaleco y botas).',
      items: [
        { desc: 'Pallet de electrónicos (TVs)', qty: 1, weight: '600 kg', dims: '1.2 x 1.0 x 1.5 m' },
        { desc: 'Pallet de accesorios', qty: 1, weight: '600 kg', dims: '1.2 x 1.0 x 1.5 m' }
      ]
    },
    {
      id: 'PK-2023-111',
      client: 'Industrias Querétaro SA',
      address: 'Parque Ind. Finsa, Qro',
      contact: 'María López',
      phone: '442 987 6543',
      piecesWeight: '5 cajas / 150 kg',
      carrier: 'DHL Express',
      date: '2023-10-26',
      timeWindow: '14:00 - 16:00',
      status: 'Programada',
      instructions: 'Acceso por puerta 2, registrarse con identificación en caseta.',
      items: [
        { desc: 'Cajas de refacciones', qty: 5, weight: '150 kg', dims: '0.5 x 0.5 x 0.5 m (c/u)' }
      ]
    },
    {
      id: 'PK-2023-112',
      client: 'Grupo Textil Monterrey',
      address: 'Apodaca, N.L. Centro Logístico',
      contact: 'Juan Pérez',
      phone: '81 1234 5678',
      piecesWeight: '1 pallet / 500 kg',
      carrier: 'AutoLíneas Regias',
      date: '2023-10-25',
      timeWindow: '10:00 - 12:00',
      status: 'En ruta',
      instructions: 'Carga frágil, mantener seca. Recolección urgente.',
      items: [
        { desc: 'Rollos de tela premium', qty: 1, weight: '500 kg', dims: '1.2 x 1.2 x 1.0 m' }
      ]
    }
  ];

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Programada': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-info-bg text-info-text">Programada</span>;
      case 'En ruta': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-warning-bg text-warning-text">En ruta</span>;
      case 'Recolectada': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-success-bg text-success-text">Recolectada</span>;
      case 'Cancelada': return <span className="px-[8px] py-[2px] rounded-[4px] text-[11px] font-medium tracking-[0.02em] whitespace-nowrap bg-neutral-bg text-text-secondary">Cancelada</span>;
      default: return null;
    }
  };

  const filteredPickups = initialPickups.filter(pk => 
    pk.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pk.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-[24px]">
      {!selectedPickup && !showForm && (
        <>
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-[16px] mb-[24px]">
            <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">Recolecciones</h2>
            <button 
              onClick={() => setShowForm(true)}
              className="bg-brand text-white px-[16px] py-[10px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva recolección
            </button>
          </div>

          <div className="flex gap-[12px] items-center mb-[24px]">
            <div className="relative max-w-[400px] flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input 
                type="text" 
                placeholder="Buscar por orden, cliente..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-[36px] bg-white border border-card-border rounded-[8px] p-[10px] text-[13px] focus:outline-none focus:border-brand shadow-sm text-text-primary" 
              />
            </div>
            <button className="flex items-center text-[13px] font-medium text-text-secondary bg-white border border-card-border rounded-[8px] px-[16px] py-[10px] hover:bg-neutral-bg transition-colors shadow-sm">
              <Filter className="w-4 h-4 mr-2" /> Filtros
            </button>
          </div>

          <div className="bg-card rounded-[12px] border border-card-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]"># Orden</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Cliente</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Dirección</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Piezas / Peso</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Transportista</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Fecha Prog.</th>
                    <th className="bg-canvas text-left px-[24px] py-[14px] text-[11px] font-medium text-text-muted border-b border-divider uppercase tracking-[0.05em]">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {filteredPickups.map((pk) => (
                    <tr 
                      key={pk.id} 
                      onClick={() => setSelectedPickup(pk)}
                      className="hover:bg-neutral-bg transition-colors cursor-pointer group"
                    >
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary font-medium whitespace-nowrap">{pk.id}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary">{pk.client}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary truncate max-w-[200px]">{pk.address}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary whitespace-nowrap">{pk.piecesWeight}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-primary">{pk.carrier}</td>
                      <td className="px-[24px] py-[16px] text-[13px] text-text-secondary tabular-nums whitespace-nowrap">{pk.date} {pk.timeWindow.split('-')[0]}</td>
                      <td className="px-[24px] py-[16px]">
                        {getStatusBadge(pk.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <div className="bg-card rounded-[12px] border border-card-border shadow-sm flex flex-col">
          <div className="px-[32px] py-[24px] border-b border-divider flex justify-between items-center">
            <h3 className="text-[18px] font-semibold text-text-primary tracking-tight">Programar nueva recolección</h3>
            <button onClick={() => setShowForm(false)} className="text-[13px] text-text-secondary hover:text-text-primary font-medium transition-colors">Volver</button>
          </div>
          <div className="p-[32px] flex-1">
            <div className="max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-[24px]">
               <div className="space-y-[16px]">
                  <h4 className="text-[13px] font-semibold text-text-primary border-b border-divider pb-[8px]">Datos de recolección</h4>
                  <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Cliente</label>
                    <select className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm">
                       <option>Comercial del Norte</option>
                       <option>Industrias Querétaro SA</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Dirección de origen</label>
                    <textarea className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm" rows={2} placeholder="Calle, número, ciudad, estado, CP..."></textarea>
                  </div>
                  <div className="grid grid-cols-2 gap-[16px]">
                    <div>
                      <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Contacto en sitio</label>
                      <input type="text" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm" />
                    </div>
                    <div>
                      <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Teléfono</label>
                      <input type="text" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm" />
                    </div>
                  </div>
               </div>

               <div className="space-y-[16px]">
                  <h4 className="text-[13px] font-semibold text-text-primary border-b border-divider pb-[8px]">Programación y notas</h4>
                  <div className="grid grid-cols-2 gap-[16px]">
                    <div>
                      <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Fecha programada</label>
                      <input type="date" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm" />
                    </div>
                    <div>
                      <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Ventana horaria</label>
                      <input type="text" placeholder="Ej. 09:00 - 12:00" className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Transportista asignado</label>
                    <select className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm">
                       <option>Transportes del Norte</option>
                       <option>DHL Express</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-text-primary text-[11px] font-medium mb-[6px]">Instrucciones especiales</label>
                    <textarea className="w-full border border-card-border rounded-[8px] p-[10px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none text-[13px] text-text-primary bg-white shadow-sm" rows={2}></textarea>
                  </div>
               </div>
            </div>
            
            <div className="max-w-4xl mt-[32px]">
               <div className="flex justify-between items-center border-b border-divider pb-[8px] mb-[16px]">
                  <h4 className="text-[13px] font-semibold text-text-primary">Ítems a recolectar</h4>
                  <button className="text-[12px] font-medium text-brand">Vincular cotización...</button>
               </div>
               <div className="bg-canvas border border-card-border p-[40px] text-center text-text-muted rounded-[8px] border-dashed text-[13px]">
                 Agrega los bultos, pallets o cajas a recolectar
               </div>
            </div>
          </div>
          <div className="px-[32px] py-[24px] border-t border-divider bg-canvas rounded-b-[12px] flex justify-end space-x-[12px]">
            <button 
              onClick={() => setShowForm(false)}
              className="px-[16px] py-[10px] border border-card-border bg-white text-text-primary rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm"
            >
              Cancelar
            </button>
            <button 
              onClick={() => { alert('Recolección programada.'); setShowForm(false); }}
              className="px-[16px] py-[10px] bg-brand text-white rounded-[8px] text-[13px] font-medium hover:bg-brand-hover transition-colors shadow-sm"
            >
              Programar
            </button>
          </div>
        </div>
      )}

      {selectedPickup && (
        <div className="space-y-[24px]">
          {/* Header Detail */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-[8px] text-[13px] text-text-secondary">
              <button onClick={() => setSelectedPickup(null)} className="hover:text-text-primary transition-colors">Recolecciones</button>
              <ChevronRight className="w-[14px] h-[14px] text-text-muted" />
              <span className="text-text-primary font-medium">{selectedPickup.id}</span>
            </div>
            <div className="flex space-x-[12px]">
               <button className="bg-white border border-card-border text-text-primary px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-neutral-bg transition-colors shadow-sm flex items-center">
                 <Printer className="w-[14px] h-[14px] mr-[8px]" />
                 Imprimir orden
               </button>
               <button className="bg-brand text-white px-[16px] py-[8px] rounded-[8px] text-[13px] font-medium hover:bg-brand-hover shadow-sm transition-colors flex items-center">
                 Generar recibo de almacén
               </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[24px]">
             
             <div className="lg:col-span-2 space-y-[24px]">
                <div className="bg-white rounded-[12px] border border-card-border shadow-sm p-[32px]">
                   <div className="flex justify-between items-start mb-[24px] pb-[24px] border-b border-divider">
                      <div>
                         <div className="flex items-center space-x-[12px] mb-[8px]">
                           <h2 className="text-[24px] font-semibold text-text-primary tracking-tight">{selectedPickup.id}</h2>
                           {getStatusBadge(selectedPickup.status)}
                         </div>
                         <p className="text-[14px] text-text-secondary flex items-center">
                            {selectedPickup.client}
                         </p>
                      </div>
                      <div className="text-right">
                         <span className="text-[11px] font-medium text-text-muted uppercase tracking-[0.05em] block mb-[4px]">Transportista</span>
                         <span className="text-[15px] font-medium text-text-primary">{selectedPickup.carrier}</span>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-[24px]">
                      <div>
                         <h4 className="flex items-center text-[13px] font-semibold text-text-primary mb-[12px]">
                           <MapPin className="w-[16px] h-[16px] mr-[8px] text-text-muted" /> Detalles de origen
                         </h4>
                         <div className="space-y-[12px] text-[13px]">
                            <p className="text-text-primary">{selectedPickup.address}</p>
                            <div className="flex items-start text-text-secondary">
                               <User className="w-[14px] h-[14px] mr-[8px] mt-[2px] shrink-0" />
                               <div>
                                 <span className="block text-text-primary font-medium">{selectedPickup.contact}</span>
                                 <span className="block">{selectedPickup.phone}</span>
                               </div>
                            </div>
                         </div>
                      </div>

                      <div>
                         <h4 className="flex items-center text-[13px] font-semibold text-text-primary mb-[12px]">
                           <Clock className="w-[16px] h-[16px] mr-[8px] text-text-muted" /> Programación
                         </h4>
                         <div className="space-y-[12px] text-[13px]">
                            <div className="flex justify-between border-b border-divider pb-[8px]">
                               <span className="text-text-secondary">Fecha</span>
                               <span className="text-text-primary font-medium tabular-nums">{selectedPickup.date}</span>
                            </div>
                            <div className="flex justify-between border-b border-divider pb-[8px]">
                               <span className="text-text-secondary">Ventana horaria</span>
                               <span className="text-text-primary font-medium tabular-nums">{selectedPickup.timeWindow}</span>
                            </div>
                         </div>
                      </div>
                   </div>

                   <div className="mt-[24px] p-[16px] bg-canvas border border-card-border rounded-[8px]">
                      <h4 className="flex items-center text-[12px] font-medium text-text-primary mb-[8px]">
                        <FileText className="w-[14px] h-[14px] mr-[6px] text-text-muted" /> Instrucciones especiales
                      </h4>
                      <p className="text-[13px] text-text-secondary leading-relaxed">{selectedPickup.instructions}</p>
                   </div>
                </div>

                <div className="bg-white rounded-[12px] border border-card-border shadow-sm p-[32px]">
                   <h3 className="text-[16px] font-semibold text-text-primary mb-[20px] flex items-center">
                     <Package className="w-[18px] h-[18px] mr-[8px] text-text-muted" /> Ítems a recolectar
                   </h3>
                   <div className="overflow-x-auto">
                     <table className="w-full border-collapse">
                       <thead>
                         <tr>
                           <th className="bg-canvas text-left px-[16px] py-[10px] text-[11px] font-medium text-text-muted border-y border-divider">Descripción</th>
                           <th className="bg-canvas text-right px-[16px] py-[10px] text-[11px] font-medium text-text-muted border-y border-divider">Cant.</th>
                           <th className="bg-canvas text-right px-[16px] py-[10px] text-[11px] font-medium text-text-muted border-y border-divider">Peso</th>
                           <th className="bg-canvas text-right px-[16px] py-[10px] text-[11px] font-medium text-text-muted border-y border-divider">Dimensiones</th>
                         </tr>
                       </thead>
                       <tbody className="divide-y divide-divider">
                         {selectedPickup.items.map((item: any, idx: number) => (
                           <tr key={idx}>
                             <td className="px-[16px] py-[12px] text-[13px] text-text-primary">{item.desc}</td>
                             <td className="px-[16px] py-[12px] text-[13px] text-text-primary font-medium text-right tabular-nums">{item.qty}</td>
                             <td className="px-[16px] py-[12px] text-[13px] text-text-secondary text-right tabular-nums">{item.weight}</td>
                             <td className="px-[16px] py-[12px] text-[13px] text-text-secondary text-right tabular-nums">{item.dims}</td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                   <div className="mt-[16px] flex justify-end text-[13px]">
                      <div className="bg-canvas px-[16px] py-[10px] rounded-[6px] border border-card-border flex items-center space-x-[24px]">
                        <div>
                           <span className="text-text-muted mr-[8px]">Piezas totales:</span>
                           <span className="font-medium text-text-primary tabular-nums">{selectedPickup.piecesWeight.split('/')[0].trim()}</span>
                        </div>
                        <div>
                           <span className="text-text-muted mr-[8px]">Peso total:</span>
                           <span className="font-medium text-text-primary tabular-nums">{selectedPickup.piecesWeight.split('/')[1].trim()}</span>
                        </div>
                      </div>
                   </div>
                </div>
             </div>

             <div className="lg:col-span-1">
                <div className="bg-white rounded-[12px] border border-card-border shadow-sm p-[24px]">
                  <h3 className="text-[14px] font-semibold text-text-primary mb-[20px]">Actividad</h3>
                  <div className="relative pl-[16px] border-l-[2px] border-divider space-y-[24px]">
                    <div className="relative">
                       <div className="absolute -left-[21px] top-[2px] w-[10px] h-[10px] rounded-full bg-brand border-[2px] border-brand shadow-[0_0_0_4px_white]"></div>
                       <p className="text-[12px] font-medium text-text-primary mb-[2px]">Orden Recolectada</p>
                       <p className="text-[12px] text-text-secondary">Mercancía confirmada a bordo.</p>
                       <p className="text-[11px] text-text-muted mt-[4px]">24 Oct, 11:30 AM</p>
                    </div>
                    <div className="relative">
                       <div className="absolute -left-[21px] top-[2px] w-[10px] h-[10px] rounded-full bg-white border-[2px] border-brand shadow-[0_0_0_4px_white]"></div>
                       <p className="text-[12px] font-medium text-text-primary mb-[2px]">En ruta a origen</p>
                       <p className="text-[12px] text-text-secondary">Unidad aproximándose.</p>
                       <p className="text-[11px] text-text-muted mt-[4px]">24 Oct, 09:15 AM</p>
                    </div>
                    <div className="relative">
                       <div className="absolute -left-[21px] top-[2px] w-[10px] h-[10px] rounded-full bg-white border-[2px] border-card-border shadow-[0_0_0_4px_white]"></div>
                       <p className="text-[12px] font-medium text-text-primary mb-[2px]">Programada</p>
                       <p className="text-[12px] text-text-secondary">Con Transportes del Norte.</p>
                       <p className="text-[11px] text-text-muted mt-[4px]">22 Oct, 16:45 PM</p>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
