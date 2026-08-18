import React, { useState } from 'react';
import { Plus, Clock } from 'lucide-react';
import { CotizacionProveedor, TipoServicio } from './QuotesData';
import { ProveedorVermur, Modalidad, contactoPrincipal } from '../proveedores/ProveedoresData';
import { useProveedores } from '../../hooks/useProveedores';
import AltaRapidaProveedorModal from '../proveedores/AltaRapidaProveedorModal';
import { storage } from '../../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface FormProveedorFichaProps {
  onGuardar: (cp: CotizacionProveedor) => void;
  onCancelar: () => void;
  servicioTipo: TipoServicio;
  proveedores: ProveedorVermur[];
}

export function FormProveedorFicha({ onGuardar, onCancelar, servicioTipo, proveedores }: FormProveedorFichaProps) {
  const { createProveedor } = useProveedores();
  const [proveedor, setProveedor] = useState('');
  const [contacto, setContacto] = useState('');
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('USD');
  const [tiempo, setTiempo] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [condiciones, setCondiciones] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showAltaRapida, setShowAltaRapida] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedor.trim() || !monto) return;

    setUploading(true);
    let adjuntoUrl: string | null = null;
    let archivoNombre: string | null = null;

    try {
      if (file) {
        const fileRef = ref(storage, `quotes/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(fileRef, file);
        adjuntoUrl = await getDownloadURL(snapshot.ref);
        archivoNombre = file.name;
      }
      onGuardar({
        id: `cp-${Date.now()}`,
        proveedor, contacto,
        monto: Number(monto), moneda,
        tiempoTransito: tiempo, vigencia, condiciones,
        adjuntoUrl, archivoNombre, seleccionada: false,
      });
    } catch (err) {
      console.error("Error subiendo archivo:", err);
      alert("Hubo un error al subir el archivo.");
    } finally {
      setUploading(false);
    }
  };

  const labelCls = 'block text-[9px] font-bold text-gray-400 uppercase mb-1';
  const inputCls = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 bg-white';

  const availableProviders = proveedores.filter(p => p.activo && (!p.modalidades?.length || p.modalidades.includes(servicioTipo as any)));

  const TIPO_A_MODALIDAD: Record<string, Modalidad> = {
    'maritimo': 'maritimo', 'aereo': 'aereo', 'terrestre': 'terrestre', 'aduanal': 'aduanal',
  };
  const modalidadFiltro = TIPO_A_MODALIDAD[servicioTipo];

  const handleProveedorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__nuevo__') {
      setShowAltaRapida(true);
      return;
    }
    setProveedor(val);
    const provObj = availableProviders.find(p => p.nombre === val);
    if (provObj) {
      const cp = contactoPrincipal(provObj);
      setContacto(cp?.nombre ?? '');
    } else {
      setContacto('');
    }
  };

  return (
    <>
    <form onSubmit={handleSubmit} className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 space-y-3 mt-2">
      <h6 className="text-[9px] font-bold text-indigo-700 uppercase tracking-widest">
        Nueva cotización de proveedor
      </h6>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Proveedor *</label>
          <select required value={proveedor} onChange={handleProveedorChange} className={inputCls}>
            <option value="">Seleccionar proveedor...</option>
            {availableProviders.map(p => (
              <option key={p.id} value={p.nombre}>{p.nombre}</option>
            ))}
            <option value="__nuevo__">+ Nuevo proveedor...</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Contacto</label>
          <input type="text" placeholder="Nombre" value={contacto}
            onChange={e => setContacto(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={labelCls}>Monto *</label>
          <input required type="number" placeholder="3200" value={monto}
            onChange={e => setMonto(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Moneda</label>
          <select value={moneda} onChange={e => setMoneda(e.target.value as 'USD' | 'MXN')} className={inputCls}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Tiempo de tránsito</label>
          <input type="text" placeholder="18-22 días" value={tiempo}
            onChange={e => setTiempo(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Vigencia</label>
          <input type="date" value={vigencia} onChange={e => setVigencia(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Condiciones / Notas</label>
        <textarea rows={2} placeholder="Condiciones especiales..." value={condiciones}
          onChange={e => setCondiciones(e.target.value)}
          className={`${inputCls} resize-none`} />
      </div>

      <div>
        <label className={labelCls}>Cotización del proveedor (adjunto)</label>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={e => setFile(e.target.files?.[0] || null)}
          className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 focus:outline-none transition-all"
        />
        {file && <p className="text-[10px] text-gray-400 mt-1">Seleccionado: {file.name}</p>}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancelar} disabled={uploading}
          className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 uppercase disabled:opacity-50">
          Cancelar
        </button>
        <button type="submit" disabled={uploading}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50">
          {uploading ? (
            <span className="flex items-center gap-1"><Clock className="w-3 h-3 animate-spin" /> Subiendo...</span>
          ) : (
            <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> Guardar</span>
          )}
        </button>
      </div>
    </form>
    {showAltaRapida && (
      <AltaRapidaProveedorModal
        onClose={() => setShowAltaRapida(false)}
        onCreate={createProveedor}
        modalidadContexto={modalidadFiltro}
        onCreated={(_id, nombre) => {
          setProveedor(nombre);
          setShowAltaRapida(false);
        }}
      />
    )}
    </>
  );
}
