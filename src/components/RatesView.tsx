import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { VehicleTypeRate } from '../types';
import { useParkingLots } from '../lib/parkingLots';
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  AlertTriangle, 
  Info,
  Loader2,
  Tag
} from 'lucide-react';

export default function RatesView() {
  const [rates, setRates] = useState<VehicleTypeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getLotName } = useParkingLots();

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<VehicleTypeRate | null>(null);
  
  const [typeName, setTypeName] = useState('');
  const [hourlyRate, setHourlyRate] = useState<number | ''>('');
  const [isDefault, setIsDefault] = useState(false);

  // Listen to rates in real-time
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(collection(db, 'vehicle_type_rates'), (snap) => {
      const list: VehicleTypeRate[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        list.push({ 
          id: doc.id,
          typeName: data.typeName || doc.id,
          hourlyRate: data.hourlyRate ?? 0,
          isDefault: !!data.isDefault,
          parkingLotId: data.parkingLotId,
          billingMode: data.billingMode,
          ...data
        } as VehicleTypeRate);
      });
      setRates(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Error al conectar con Firestore.');
      setLoading(false);
    });

    return unsub;
  }, []);

  const openAddModal = () => {
    setEditingRate(null);
    setTypeName('');
    setHourlyRate('');
    // If no rates exist yet, default this one to true
    setIsDefault(rates.length === 0);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rate: VehicleTypeRate) => {
    setEditingRate(rate);
    setTypeName(rate.typeName);
    setHourlyRate(rate.hourlyRate);
    setIsDefault(rate.isDefault);
    setError(null);
    setIsModalOpen(true);
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanTypeName = typeName.trim();
    if (!cleanTypeName) {
      setError('El nombre del tipo de vehículo es obligatorio.');
      return;
    }
    if (hourlyRate === '' || Number(hourlyRate) < 0) {
      setError('La tarifa horaria debe ser un número positivo.');
      return;
    }

    try {
      const db = getDb();
      const batch = writeBatch(db);

      // Validate default flag
      // If setting this rate as default, set all other rates' isDefault to false
      if (isDefault) {
        rates.forEach(r => {
          if (r.typeName !== cleanTypeName) {
            batch.update(doc(db, 'vehicle_type_rates', r.typeName), { isDefault: false });
          }
        });
      } else {
        // If unsetting default, we must make sure at least one other rate is default
        const anyOtherDefault = rates.some(r => r.typeName !== cleanTypeName && r.isDefault);
        const editingIsDefault = editingRate?.isDefault;

        if (!anyOtherDefault && editingIsDefault) {
          setError('Debe existir al menos una tarifa marcada como predeterminada.');
          return;
        }
      }

      // Save record (setDoc creates or overwrites)
      const targetDocId = editingRate?.id || cleanTypeName;
      const rateRef = doc(db, 'vehicle_type_rates', targetDocId);
      const newRateData = {
        typeName: cleanTypeName,
        hourlyRate: Number(hourlyRate),
        isDefault: isDefault
      };

      batch.set(rateRef, newRateData, { merge: true });
      await batch.commit();

      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar la tarifa: ${err.message || err}`);
    }
  };

  const handleDeleteRate = async (rate: VehicleTypeRate) => {
    setError(null);
    if (rate.isDefault) {
      setError('No puedes eliminar la tarifa predeterminada. Configura otra tarifa como predeterminada primero.');
      return;
    }

    if (!window.confirm(`¿Estás seguro de que deseas eliminar la tarifa para "${rate.typeName}"?`)) {
      return;
    }

    try {
      const db = getDb();
      const docId = rate.id || rate.typeName;
      await deleteDoc(doc(db, 'vehicle_type_rates', docId));
    } catch (err: any) {
      console.error(err);
      setError(`Error al eliminar: ${err.message || err}`);
    }
  };

  return (
    <div className="space-y-6 p-1.5 md:p-3 max-w-7xl mx-auto font-sans text-slate-300">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img src="/logo-plaza-1.jpg" alt="Logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" onError={(e) => {
            e.currentTarget.style.display = 'none';
          }} />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Catálogo de Tarifas</h1>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/10 active:scale-95 transition-all self-start cursor-pointer animate-fade-in"
        >
          <Plus size={16} />
          Agregar Tipo de Tarifa
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Info Warning Alert */}
      <div className="bg-slate-800/40 border border-blue-500/10 rounded-2xl p-4 text-xs flex gap-3 text-slate-300 items-start">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5 animate-pulse" />
        <div>
          <span className="font-bold text-blue-300">Regla de Negocio del Sistema:</span>
          <p className="mt-0.5 text-slate-400 leading-relaxed">
            Debe existir exactamente una tarifa predeterminada (<span className="text-emerald-400 font-semibold">Predeterminada</span>). Esta se aplica de forma automática en la app móvil y en el panel si un vehículo ingresa sin una tarifa explícitamente seleccionada.
          </p>
        </div>
      </div>

      {/* Grid of Rates Cards */}
      {loading ? (
        <div className="py-24 text-center">
          <Loader2 size={36} className="animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-sm font-medium">Cargando catálogo de tarifas...</p>
        </div>
      ) : rates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {rates.map((rate, idx) => (
            <div 
              key={rate.id || `${rate.typeName}-${idx}`} 
              className={`bg-slate-800/60 border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 group hover:scale-[1.01]
                ${rate.isDefault 
                  ? 'border-emerald-500/30 ring-1 ring-emerald-500/10' 
                  : 'border-slate-700/50 hover:border-slate-600'
                }`}
            >
              {/* Background Glow for Default Rate */}
              {rate.isDefault && (
                <div className="absolute top-0 right-0 p-8 bg-emerald-500/5 rounded-full translate-x-1/3 -translate-y-1/3" />
              )}

              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold text-lg">{rate.typeName}</span>
                    {rate.parkingLotId && (
                      <span className="inline-flex items-center text-[10px] font-semibold bg-slate-700/80 text-blue-300 border border-slate-600/60 px-2 py-0.5 rounded-md">
                        Lote #{rate.parkingLotId}: {getLotName(rate.parkingLotId)}
                      </span>
                    )}
                    {rate.isDefault && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                        <Check size={8} /> Predeterminado
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 block">ID: <code className="font-mono bg-slate-900/60 px-1 py-0.5 rounded">{rate.id || rate.typeName}</code></span>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
                  <Tag size={20} />
                </div>
              </div>

              <div className="py-4 border-t border-b border-slate-700/30 my-4 flex items-baseline gap-1">
                <span className="text-3xl font-black text-white">${rate.hourlyRate.toFixed(2)}</span>
                <span className="text-xs text-slate-400 font-medium">/ Hora o fracción</span>
              </div>

              {/* Card Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => openEditModal(rate)}
                  className="flex items-center gap-1 px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl text-xs transition-all cursor-pointer"
                >
                  <Edit3 size={13} />
                  Editar
                </button>
                <button
                  onClick={() => handleDeleteRate(rate)}
                  disabled={rate.isDefault}
                  className={`flex items-center gap-1 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer
                    ${rate.isDefault 
                      ? 'bg-slate-800 text-slate-600 border border-slate-700/30 cursor-not-allowed' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white'}`}
                >
                  <Trash2 size={13} />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-slate-700/50 rounded-2xl text-slate-500">
          <AlertTriangle size={32} className="mx-auto text-slate-600 mb-2" />
          <span className="font-semibold text-slate-400">Sin tarifas registradas</span>
          <p className="text-xs mt-1">Crea una nueva tarifa haciendo clic en el botón de arriba.</p>
        </div>
      )}

      {/* MODAL: ADD / EDIT RATE */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <DollarSign size={20} className="text-blue-500" />
              {editingRate ? 'Editar Tipo de Tarifa' : 'Agregar Tipo de Tarifa'}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveRate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nombre de Categoría (ej. Auto, Motocicleta, Camión)
                </label>
                <input
                  type="text"
                  required
                  disabled={editingRate !== null} // document ID is immutable in firestore once created
                  placeholder="ej. SUV"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none disabled:opacity-50 disabled:bg-slate-950 disabled:cursor-not-allowed"
                />
                {editingRate && (
                  <p className="text-[10px] text-slate-500 mt-1">El nombre identificador de tarifa no se puede modificar.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Costo por Hora ($)
                </label>
                <input
                  type="number"
                  required
                  placeholder="ej. 25"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>

              {/* Default checkbox */}
              <div className="flex items-center gap-2.5 pt-2">
                <input
                  type="checkbox"
                  id="is-default-checkbox"
                  checked={isDefault}
                  disabled={editingRate?.isDefault} // Cannot uncheck if it's already default
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="is-default-checkbox" className="text-xs font-semibold text-slate-300">
                  Establecer como tarifa predeterminada
                </label>
              </div>
              {editingRate?.isDefault && (
                <p className="text-[10px] text-emerald-400 font-medium">Esta es la tarifa predeterminada actual. Para cambiarla, edita otra tarifa y márcala como predeterminada.</p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/10"
                >
                  Guardar Tarifa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
