import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Download, Eye, Trash2, Plus, AlertCircle } from 'lucide-react';
import { EmbarqueDocumento, TIPOS_DOCUMENTO } from './EmbarquesData';

interface DocumentosEmbarqueProps {
  documentos: EmbarqueDocumento[];
  onAddDocumento: (doc: Omit<EmbarqueDocumento, 'id'>) => void;
  onDeleteDocumento: (id: string) => void;
}

export default function DocumentosEmbarque({
  documentos,
  onAddDocumento,
  onDeleteDocumento
}: DocumentosEmbarqueProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedType, setSelectedType] = useState<EmbarqueDocumento['tipo']>('bl');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files: FileList) => {
    const file = files[0];
    if (!file) return;

    setUploadError(null);

    // Mock storage URL creation
    const fileUrl = URL.createObjectURL(file);
    const fechaActual = new Date().toISOString().slice(0, 16).replace('T', ' ');

    onAddDocumento({
      tipo: selectedType,
      nombre: file.name,
      url: fileUrl,
      fechaCarga: fechaActual,
      cargadoPor: 'Admin Vermur'
    });
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const getDocIconColor = (tipo: EmbarqueDocumento['tipo']) => {
    switch (tipo) {
      case 'cotizacion': return 'text-blue-500 bg-blue-50';
      case 'pedimento': return 'text-purple-500 bg-purple-50';
      case 'bl':
      case 'mbl':
      case 'hbl': return 'text-emerald-500 bg-emerald-50';
      case 'factura': return 'text-rose-500 bg-rose-50';
      case 'packing_list': return 'text-amber-500 bg-amber-50';
      default: return 'text-gray-500 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-gray-150 shadow-2xs">
        <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider mb-4">
          Cargar nuevo documento
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
              Tipo de Documento
            </label>
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value as EmbarqueDocumento['tipo'])}
              className="w-full text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-2.5 outline-none focus:border-[#E11D48] cursor-pointer"
            >
              {Object.entries(TIPOS_DOCUMENTO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleChange}
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
            />

            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={onButtonClick}
              className={`w-full py-6 px-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200
                ${dragActive
                  ? 'border-[#E11D48] bg-[#E11D48]/[0.02]'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'}`}
            >
              <UploadCloud className={`w-8 h-8 mb-2 transition-colors ${dragActive ? 'text-[#E11D48]' : 'text-gray-400 group-hover:text-gray-500'}`} />
              <p className="text-xs font-bold text-gray-600 text-center">
                Arrastra y suelta tu archivo aquí, o <span className="text-[#E11D48] hover:underline">explora</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1 text-center">
                Soporta PDF, Imagen, Excel, Word (máx. 10MB)
              </p>
            </div>
          </div>
        </div>

        {uploadError && (
          <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-500">
            <AlertCircle className="w-4 h-4" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Lista de documentos */}
      <div className="bg-white rounded-xl border border-gray-150 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#18181B] uppercase tracking-wider">
            Documentos adjuntos ({documentos.length})
          </h3>
        </div>

        {documentos.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-400 italic">
            No hay documentos cargados en este embarque.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {documentos.map(doc => (
              <div key={doc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${getDocIconColor(doc.tipo)}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-800 break-all leading-tight">
                      {doc.nombre}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-gray-400 font-semibold">
                      <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">
                        {TIPOS_DOCUMENTO[doc.tipo]}
                      </span>
                      <span>•</span>
                      <span>Subido: {doc.fechaCarga}</span>
                      <span>•</span>
                      <span>Por: {doc.cargadoPor}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {doc.url !== '#' && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Ver vista previa"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                  )}
                  {doc.url !== '#' && (
                    <a
                      href={doc.url}
                      download={doc.nombre}
                      className="p-2 text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Descargar archivo"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => onDeleteDocumento(doc.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar documento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
