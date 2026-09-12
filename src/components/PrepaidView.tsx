import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { PrepaidVehicle } from '../types';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Edit2, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  X, 
  AlertTriangle, 
  Loader2,
  FileText
} from 'lucide-react';

export default function PrepaidView() {
  const [prepaids, setPrepaids] = useState<PrepaidVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal / Form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrepaid, setEditingPrepaid] = useState<PrepaidVehicle | null>(null);

  const [plate, setPlate] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [validUntilStr, setValidUntilStr] = useState(''); // YYYY-MM-DD
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'MES_COMPLETO' | 'PAGO_POR_DIAS'>('MES_COMPLETO');
  const [specificDays, setSpecificDays] = useState('');
  const [maxDaysAllowed, setMaxDaysAllowed] = useState<number | ''>('');

  // Listen to prepaid_vehicles in real-time
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(collection(db, 'prepaid_vehicles'), (snap) => {
      const list: PrepaidVehicle[] = [];
      snap.forEach((doc) => {
        list.push({ plate: doc.id, ...doc.data() } as PrepaidVehicle);
      });
      setPrepaids(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError('Error al cargar pensionados.');
      setLoading(false);
    });

    return unsub;
  }, []);

  const openAddModal = () => {
    setEditingPrepaid(null);
    setPlate('');
    setOwnerName('');
    
    // Default valid until to 1 month from now
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setValidUntilStr(nextMonth.toISOString().split('T')[0]);
    
    setNotes('');
    setPaymentType('MES_COMPLETO');
    setSpecificDays('');
    setMaxDaysAllowed('');
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: PrepaidVehicle) => {
    setEditingPrepaid(p);
    setPlate(p.plate);
    setOwnerName(p.ownerName);
    setValidUntilStr(new Date(p.validUntil).toISOString().split('T')[0]);
    setNotes(p.notes || '');
    setPaymentType(p.paymentType);
    setSpecificDays(p.specificDays || '');
    setMaxDaysAllowed(p.maxDaysAllowed !== null ? p.maxDaysAllowed : '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleSavePrepaid = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPlate = plate.trim().toUpperCase();
    const cleanOwner = ownerName.trim();

    if (!cleanPlate) {
      setError('La placa es obligatoria.');
      return;
    }
    if (!cleanOwner) {
      setError('El nombre del propietario es obligatorio.');
      return;
    }
    if (!validUntilStr) {
      setError('La fecha límite de vigencia es obligatoria.');
      return;
    }

    try {
      const db = getDb();
      const docRef = doc(db, 'prepaid_vehicles', cleanPlate);

      // Convert date string back to milliseconds
      const dateParts = validUntilStr.split('-');
      const validUntilMs = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]), 23, 59, 59, 999).getTime();

      const recordData: PrepaidVehicle = {
        plate: cleanPlate,
        ownerName: cleanOwner,
        validUntil: validUntilMs,
        notes: notes.trim() || null,
        paymentType: paymentType,
        specificDays: paymentType === 'PAGO_POR_DIAS' ? (specificDays.trim() || null) : null,
        maxDaysAllowed: paymentType === 'PAGO_POR_DIAS' && maxDaysAllowed !== '' ? Number(maxDaysAllowed) : null
      };

      await setDoc(docRef, recordData);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar pensión: ${err.message || err}`);
    }
  };

  const handleDeletePrepaid = async (pPlate: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente la pensión para la placa ${pPlate}?`)) {
      return;
    }

    try {
      const db = getDb();
      await deleteDoc(doc(db, 'prepaid_vehicles', pPlate));
    } catch (err: any) {
      console.error(err);
      setError(`Error al eliminar pensión: ${err.message || err}`);
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
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Vehículos Pensionados</h1>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/10 active:scale-95 transition-all self-start cursor-pointer"
        >
          <Plus size={16} />
          Registrar Vehículo Pensionado
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Prepaid Vehicles Grid / Table */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 size={36} className="animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando pensionados...</p>
          </div>
        ) : prepaids.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs font-bold uppercase tracking-wider bg-slate-800/40">
                  <th className="py-4 px-6">Placa</th>
                  <th className="py-4 px-6">Propietario / Cliente</th>
                  <th className="py-4 px-6">Vigencia Límite</th>
                  <th className="py-4 px-6">Tipo Pensión</th>
                  <th className="py-4 px-6">Condiciones Especiales</th>
                  <th className="py-4 px-6 text-center">Estado</th>
                  <th className="py-4 px-6 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {prepaids.map((p) => {
                  const now = Date.now();
                  const isVigente = p.validUntil >= now;
                  const limitDate = new Date(p.validUntil);

                  return (
                    <tr key={p.plate} className="hover:bg-slate-700/20 text-xs text-slate-300">
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 bg-slate-950 border border-slate-700 text-white font-mono rounded-lg font-bold text-[12px] tracking-wide">
                          {p.plate}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-semibold text-white">
                        {p.ownerName}
                        {p.notes && (
                          <span className="block text-[10px] text-slate-500 font-normal italic mt-0.5 max-w-xs truncate" title={p.notes}>
                            {p.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Calendar size={13} className="text-slate-500" />
                          <span className={isVigente ? 'text-slate-300' : 'text-red-400 font-semibold'}>
                            {limitDate.toLocaleDateString('es-MX')}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {p.paymentType === 'MES_COMPLETO' ? (
                          <span className="text-blue-400 font-medium">Mes Completo / 24 hrs</span>
                        ) : (
                          <span className="text-purple-400 font-medium">Pago por Días</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-slate-400 font-mono text-[11px]">
                        {p.paymentType === 'PAGO_POR_DIAS' ? (
                          <div className="flex flex-col gap-0.5">
                            {p.specificDays && <span>Días: {p.specificDays}</span>}
                            {p.maxDaysAllowed && <span>Límite: {p.maxDaysAllowed} días</span>}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Ninguna</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-center">
                        {isVigente ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full border border-emerald-400/20">
                            <CheckCircle size={10} /> Vigente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-red-400 bg-red-400/10 px-2.5 py-0.5 rounded-full border border-red-500/30 font-bold animate-pulse">
                            <XCircle size={10} /> Vencido
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1.5 bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-lg transition-all cursor-pointer"
                            title="Editar Pensión"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletePrepaid(p.plate)}
                            className="p-1.5 bg-red-600/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white rounded-lg transition-all cursor-pointer"
                            title="Eliminar Pensión"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-24 text-center text-slate-500">
            <CreditCard size={32} className="mx-auto text-slate-600 mb-2" />
            <span className="font-semibold text-slate-400">Sin pensionados registrados</span>
            <p className="text-xs mt-1">Registra un nuevo vehículo pensionado haciendo clic en el botón de arriba.</p>
          </div>
        )}
      </div>

      {/* MODAL: ADD / EDIT PREPAID VEHICLE */}
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
              <CreditCard size={20} className="text-blue-500" />
              {editingPrepaid ? 'Editar Pensión de Vehículo' : 'Registrar Vehículo Pensionado'}
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSavePrepaid} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Placa de Vehículo
                </label>
                <input
                  type="text"
                  required
                  disabled={editingPrepaid !== null} // Plate is document ID
                  placeholder="ej. XYZ-9876"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm uppercase focus:outline-none disabled:opacity-50 disabled:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Nombre Completo del Dueño / Cliente
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Esteban Martínez Solís"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Vigente Hasta (Fecha)
                  </label>
                  <input
                    type="date"
                    required
                    value={validUntilStr}
                    onChange={(e) => setValidUntilStr(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Tipo de Pago
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as 'MES_COMPLETO' | 'PAGO_POR_DIAS')}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                  >
                    <option value="MES_COMPLETO">Mes Completo</option>
                    <option value="PAGO_POR_DIAS">Pago por Días</option>
                  </select>
                </div>
              </div>

              {paymentType === 'PAGO_POR_DIAS' && (
                <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-700/50 space-y-3">
                  <p className="text-[10px] font-bold tracking-widest text-purple-400 uppercase">Configuración de Pago por Días</p>
                  
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Días Permitidos Especiales (ej. Lun, Mié, Vie)
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Lun, Mar, Mié, Jue, Vie"
                      value={specificDays}
                      onChange={(e) => setSpecificDays(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Máximo de Días Permitidos por Mes
                    </label>
                    <input
                      type="number"
                      placeholder="ej. 15"
                      value={maxDaysAllowed}
                      onChange={(e) => setMaxDaysAllowed(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Observaciones / Notas
                </label>
                <textarea
                  placeholder="Detalles del coche, color, marca, deudas de pago, etc..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none h-16 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-1">
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
                  Guardar Pensión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
