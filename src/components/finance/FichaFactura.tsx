import React, { useState } from 'react';
import { X, FileText, Code, CheckCircle, Download, ExternalLink, Printer } from 'lucide-react';
import { FichaHeader, BadgeEstado } from '../ui/ficha/FichaLayout';

interface FichaFacturaProps {
  invoice: any;
  onClose: () => void;
}

export default function FichaFactura({ invoice, onClose }: FichaFacturaProps) {
  const [activeTab, setActiveTab] = useState<'pdf' | 'xml'>('pdf');

  // Datos mockeados de timbrado que se verán en la ficha
  const timbradoMock = {
    uuid: invoice.uuid === 'Pendiente' ? 'Pendiente de timbrado' : '8F2C7B3A-4D9E-41F6-B29A-6E1C8A7B90F2',
    usoCfdi: 'G03 - Gastos en general',
    metodoPago: 'PPD - Pago en parcialidades o diferido',
    formaPago: '99 - Por definir',
    regimenFiscal: '601 - General de Ley Personas Morales',
    tipoComprobante: 'I - Ingreso',
    fechaEmision: '2023-10-25T14:32:00',
    fechaTimbrado: invoice.cfdiStatus === 'Timbrada' ? '2023-10-25T14:32:05' : '—',
    pac: 'SCD110105654',
    certificado: '00001000000504123456',
  };

  const xmlMock = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0" Serie="F" Folio="${invoice.id.replace('F-', '')}" Fecha="${timbradoMock.fechaEmision}" Sello="aBcD1234xYz..." FormaPago="${timbradoMock.formaPago.split(' ')[0]}" NoCertificado="${timbradoMock.certificado}" SubTotal="${invoice.subtotal}" Moneda="${invoice.currency}" Total="${invoice.total}" TipoDeComprobante="I" Exportacion="01" MetodoPago="${timbradoMock.metodoPago.split(' ')[0]}" LugarExpedicion="28200" xmlns:cfdi="http://www.sat.gob.mx/cfd/4">
  <cfdi:Emisor Rfc="VLO190520ABC" Nombre="VERMUR LOGISTICS SA DE CV" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="${invoice.rfc}" Nombre="${invoice.client}" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="601" UsoCFDI="${timbradoMock.usoCfdi.split(' ')[0]}" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="78101802" Cantidad="1" ClaveUnidad="E48" Unidad="Unidad de servicio" Descripcion="${invoice.concept}" ValorUnitario="${invoice.subtotal}" Importe="${invoice.subtotal}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${invoice.subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${invoice.vat}" />
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${invoice.vat}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${invoice.subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${invoice.vat}" />
    </cfdi:Traslados>
  </cfdi:Impuestos>
  ${invoice.cfdiStatus === 'Timbrada' ? `<cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${timbradoMock.uuid}" FechaTimbrado="${timbradoMock.fechaTimbrado}" RfcProvCertif="${timbradoMock.pac}" SelloCFD="aBcD1234xYz..." NoCertificadoSAT="00001000000501234567" SelloSAT="XyZ9876aBc..." xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd" />
  </cfdi:Complemento>` : ''}
</cfdi:Comprobante>`;

  return (
    <div className="bg-white rounded-[12px] border border-card-border shadow-sm flex flex-col h-[calc(100vh-120px)] min-h-[600px] overflow-hidden">
      {/* U-3 · Mismo encabezado que las demás fichas. La «X» de cerrar se
          convierte en la miga de pan, que es como se sale de la cotización, del
          embarque y del prospecto. */}
      <FichaHeader
        modulo="Facturas"
        onBack={onClose}
        folio={invoice.id}
        titulo={invoice.client}
        badges={
          <BadgeEstado tono={invoice.cfdiStatus === 'Timbrada' ? 'exito' : 'espera'}>
            {invoice.cfdiStatus}
          </BadgeEstado>
        }
        subtitulo={
          <p className="text-[12px] text-text-secondary font-mono">RFC: {invoice.rfc}</p>
        }
      />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Columna Izquierda: Metadatos */}
        <div className="w-full md:w-[400px] flex flex-col border-r border-divider bg-canvas overflow-y-auto custom-scrollbar shrink-0">
          <div className="p-[24px] space-y-[24px]">
            
            {/* Resumen Comercial */}
            <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
              <h4 className="text-[12px] font-bold text-text-muted uppercase tracking-[0.05em] mb-[16px] flex items-center gap-[6px]">
                <FileText className="w-[14px] h-[14px]" /> Información Comercial
              </h4>
              <div className="space-y-[12px]">
                <div>
                  <span className="block text-[11px] text-text-secondary mb-[2px]">Uso de CFDI</span>
                  <span className="block text-[13px] font-medium text-text-primary">{timbradoMock.usoCfdi}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-text-secondary mb-[2px]">Método de Pago</span>
                  <span className="block text-[13px] font-medium text-text-primary">{timbradoMock.metodoPago}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-text-secondary mb-[2px]">Forma de Pago</span>
                  <span className="block text-[13px] font-medium text-text-primary">{timbradoMock.formaPago}</span>
                </div>
                <div className="flex justify-between">
                  <div>
                    <span className="block text-[11px] text-text-secondary mb-[2px]">Moneda</span>
                    <span className="block text-[13px] font-medium text-text-primary">{invoice.currency}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-text-secondary mb-[2px]">Estatus de Pago</span>
                    <span className={`block text-[13px] font-bold ${invoice.paymentStatus === 'Pagada' ? 'text-success-text' : invoice.paymentStatus === 'Vencida' ? 'text-error-text' : 'text-warning-text'}`}>
                      {invoice.paymentStatus}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timbrado Fiscal */}
            <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
              <h4 className="text-[12px] font-bold text-text-muted uppercase tracking-[0.05em] mb-[16px] flex items-center gap-[6px]">
                <CheckCircle className="w-[14px] h-[14px]" /> Timbrado SAT
              </h4>
              <div className="space-y-[12px]">
                <div>
                  <span className="block text-[11px] text-text-secondary mb-[2px]">UUID (Folio Fiscal)</span>
                  <span className="block text-[13px] font-mono font-medium text-text-primary break-all">{timbradoMock.uuid}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-text-secondary mb-[2px]">Tipo de Comprobante</span>
                  <span className="block text-[13px] font-medium text-text-primary">{timbradoMock.tipoComprobante}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-text-secondary mb-[2px]">Fecha de Certificación</span>
                  <span className="block text-[13px] font-medium text-text-primary tabular-nums">{timbradoMock.fechaTimbrado}</span>
                </div>
                <div>
                  <span className="block text-[11px] text-text-secondary mb-[2px]">Certificado CSD</span>
                  <span className="block text-[13px] font-mono font-medium text-text-primary break-all">{timbradoMock.certificado}</span>
                </div>
              </div>
            </div>

            {/* Totales */}
            <div className="bg-white border border-card-border rounded-[12px] p-[20px] shadow-sm">
              <div className="flex justify-between items-center border-b border-divider pb-[12px] mb-[12px]">
                <span className="text-[12px] text-text-secondary font-medium">Subtotal</span>
                <span className="text-[13px] font-semibold text-text-primary tabular-nums">${invoice.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center border-b border-divider pb-[12px] mb-[12px]">
                <span className="text-[12px] text-text-secondary font-medium">IVA Trasladado (16%)</span>
                <span className="text-[13px] font-semibold text-text-primary tabular-nums">${invoice.vat.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[14px] font-bold text-text-primary">Total</span>
                <span className="text-[18px] font-black text-brand tabular-nums">${invoice.total.toLocaleString()} {invoice.currency}</span>
              </div>
            </div>

          </div>
        </div>

        {/* Columna Derecha: Visor de Documento */}
        <div className="flex-1 flex flex-col bg-neutral-bg overflow-hidden relative">
          
          {/* Tabs del visor */}
          <div className="flex border-b border-card-border bg-white px-[24px]">
            <button 
              onClick={() => setActiveTab('pdf')}
              className={`px-[20px] py-[16px] text-[13px] font-bold uppercase tracking-[0.05em] flex items-center gap-[8px] border-b-[2px] transition-colors ${
                activeTab === 'pdf' ? 'border-brand text-brand' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <FileText className="w-[16px] h-[16px]" /> Representación Impresa (PDF)
            </button>
            <button 
              onClick={() => setActiveTab('xml')}
              className={`px-[20px] py-[16px] text-[13px] font-bold uppercase tracking-[0.05em] flex items-center gap-[8px] border-b-[2px] transition-colors ${
                activeTab === 'xml' ? 'border-brand text-brand' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Code className="w-[16px] h-[16px]" /> Código XML
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-[8px]">
              <button className="p-[8px] text-text-muted hover:text-text-primary hover:bg-neutral-bg rounded-[8px] transition-colors">
                <Printer className="w-[16px] h-[16px]" />
              </button>
              <button className="p-[8px] text-text-muted hover:text-text-primary hover:bg-neutral-bg rounded-[8px] transition-colors">
                <ExternalLink className="w-[16px] h-[16px]" />
              </button>
            </div>
          </div>

          {/* Área de Visualización */}
          <div className="flex-1 overflow-y-auto p-[32px] flex justify-center custom-scrollbar">
            
            {activeTab === 'pdf' && (
              <div className="bg-white w-full max-w-[800px] min-h-[1056px] shadow-lg border border-gray-200 p-[48px] relative">
                {/* Cabecera Factura Mock */}
                <div className="flex justify-between items-start mb-[40px] border-b-[2px] border-[#E11D48] pb-[20px]">
                  <div>
                    <h1 className="text-[28px] font-black tracking-tight text-[#18181B] leading-none mb-[8px]">VERMUR</h1>
                    <p className="text-[12px] font-bold text-gray-500 tracking-[0.1em] uppercase">Logistics SA de CV</p>
                    <p className="text-[11px] text-gray-500 mt-[8px]">RFC: VLO190520ABC</p>
                    <p className="text-[11px] text-gray-500">601 - General de Ley Personas Morales</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-[20px] font-bold text-[#E11D48] uppercase tracking-wider mb-[4px]">Factura</h2>
                    <p className="text-[16px] font-medium text-gray-800">{invoice.id}</p>
                    <div className="mt-[12px] bg-gray-50 p-[12px] rounded border border-gray-200 text-left w-[240px]">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Folio Fiscal</p>
                      <p className="text-[11px] font-mono text-gray-800 break-all">{timbradoMock.uuid}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mt-[8px]">Fecha Emisión</p>
                      <p className="text-[11px] text-gray-800">{timbradoMock.fechaEmision}</p>
                    </div>
                  </div>
                </div>

                {/* Cliente */}
                <div className="mb-[32px] grid grid-cols-2 gap-[24px]">
                  <div className="bg-gray-50 p-[16px] rounded border border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-[4px]">Receptor</p>
                    <p className="text-[13px] font-bold text-gray-800 mb-[2px]">{invoice.client}</p>
                    <p className="text-[12px] text-gray-600">RFC: {invoice.rfc}</p>
                    <p className="text-[12px] text-gray-600 mt-[8px]"><span className="font-medium">Uso CFDI:</span> {timbradoMock.usoCfdi}</p>
                  </div>
                  <div className="bg-gray-50 p-[16px] rounded border border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-[4px]">Datos de Pago</p>
                    <p className="text-[12px] text-gray-600"><span className="font-medium">Método:</span> {timbradoMock.metodoPago}</p>
                    <p className="text-[12px] text-gray-600"><span className="font-medium">Forma:</span> {timbradoMock.formaPago}</p>
                    <p className="text-[12px] text-gray-600"><span className="font-medium">Moneda:</span> {invoice.currency}</p>
                  </div>
                </div>

                {/* Conceptos */}
                <table className="w-full mb-[32px] text-left">
                  <thead>
                    <tr className="border-b-2 border-gray-800">
                      <th className="py-[8px] text-[11px] font-bold text-gray-800 uppercase">Clave</th>
                      <th className="py-[8px] text-[11px] font-bold text-gray-800 uppercase">Cant</th>
                      <th className="py-[8px] text-[11px] font-bold text-gray-800 uppercase">Descripción</th>
                      <th className="py-[8px] text-[11px] font-bold text-gray-800 uppercase text-right">V. Unitario</th>
                      <th className="py-[8px] text-[11px] font-bold text-gray-800 uppercase text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200">
                      <td className="py-[12px] text-[12px] text-gray-600 font-mono">78101802</td>
                      <td className="py-[12px] text-[12px] text-gray-800">1</td>
                      <td className="py-[12px] text-[12px] text-gray-800 font-medium">{invoice.concept}</td>
                      <td className="py-[12px] text-[12px] text-gray-800 text-right tabular-nums">${invoice.subtotal.toLocaleString()}</td>
                      <td className="py-[12px] text-[12px] text-gray-800 text-right tabular-nums">${invoice.subtotal.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Totales */}
                <div className="flex justify-end mb-[48px]">
                  <div className="w-[280px]">
                    <div className="flex justify-between py-[4px]">
                      <span className="text-[12px] text-gray-600">Subtotal</span>
                      <span className="text-[12px] text-gray-800 font-medium tabular-nums">${invoice.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-[4px]">
                      <span className="text-[12px] text-gray-600">IVA Trasladado (16%)</span>
                      <span className="text-[12px] text-gray-800 font-medium tabular-nums">${invoice.vat.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-[8px] border-t-2 border-gray-800 mt-[4px]">
                      <span className="text-[14px] font-bold text-gray-800 uppercase">Total</span>
                      <span className="text-[14px] font-bold text-[#E11D48] tabular-nums">${invoice.total.toLocaleString()} {invoice.currency}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Fiscal (Sello y Cadena) */}
                {invoice.cfdiStatus === 'Timbrada' && (
                  <div className="mt-auto border-t border-gray-300 pt-[24px] flex gap-[24px]">
                    {/* Fake QR */}
                    <div className="w-[120px] h-[120px] bg-gray-100 border border-gray-300 shrink-0 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMDAwIj48L3JlY3Q+CjxyZWN0IHg9IjQiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiMwMDAiPjwvcmVjdD4KPC9zdmc+')] mix-blend-multiply" />
                      <span className="text-[10px] text-gray-400 font-bold z-10 bg-white px-2">QR SAT</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-[12px]">
                        <p className="text-[9px] font-bold text-gray-800 uppercase mb-[2px]">Sello Digital del CFDI</p>
                        <p className="text-[8px] font-mono text-gray-500 break-all leading-tight">Yl1R...{Array(80).fill('aBcD1234xYz').join('')}...==</p>
                      </div>
                      <div className="mb-[12px]">
                        <p className="text-[9px] font-bold text-gray-800 uppercase mb-[2px]">Sello del SAT</p>
                        <p className="text-[8px] font-mono text-gray-500 break-all leading-tight">XyZ9...{Array(80).fill('8765qWeRtyU').join('')}...==</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-gray-800 uppercase mb-[2px]">Cadena Original del complemento de certificación</p>
                        <p className="text-[8px] font-mono text-gray-500 break-all leading-tight">||1.1|{timbradoMock.uuid}|{timbradoMock.fechaTimbrado}|{timbradoMock.pac}|Yl1R...||</p>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="absolute bottom-[24px] left-0 right-0 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Este documento es una representación impresa de un CFDI</p>
                </div>
              </div>
            )}

            {activeTab === 'xml' && (
              <div className="w-full bg-[#1e1e1e] rounded-[12px] shadow-lg border border-[#333] overflow-hidden flex flex-col">
                <div className="bg-[#2d2d2d] px-[16px] py-[12px] border-b border-[#444] flex items-center">
                  <div className="flex gap-[6px] mr-[16px]">
                    <div className="w-[12px] h-[12px] rounded-full bg-[#ff5f56]" />
                    <div className="w-[12px] h-[12px] rounded-full bg-[#ffbd2e]" />
                    <div className="w-[12px] h-[12px] rounded-full bg-[#27c93f]" />
                  </div>
                  <span className="text-[#ccc] text-[12px] font-mono">{invoice.id}.xml</span>
                </div>
                <div className="p-[24px] overflow-auto flex-1 custom-scrollbar">
                  <pre className="text-[13px] font-mono leading-relaxed text-[#d4d4d4] whitespace-pre-wrap break-all">
                    {xmlMock}
                  </pre>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
