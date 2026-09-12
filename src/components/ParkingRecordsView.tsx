import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { ParkingRecord, VehicleTypeRate, User } from '../types';
import { 
  Search, 
  Filter, 
  Calendar, 
  Plus, 
  Edit3, 
  CheckCircle, 
  Trash2, 
  LogOut, 
  Info, 
  Clock, 
  CreditCard, 
  Check, 
  X,
  Loader2,
  AlertTriangle
} from 'lucide-react';

interface ParkingRecordsViewProps {
  currentUser: User;
}

export default function ParkingRecordsView({ currentUser }: ParkingRecordsViewProps) {
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [rates, setRates] = useState<VehicleTypeRate[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL'); // 'ALL', 'ACTIVE', 'COMPLETED'
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<string>('ALL');
  const [cashierFilter, setCashierFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>(''); // YYYY-MM-DD format

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ParkingRecord | null>(null);

  // Form states for manual registration / creation
  const [newPlate, setNewPlate] = useState('');
  const [newVehicleType, setNewVehicleType] = useState('Auto');
  const [newDescription, setNewDescription] = useState('');
  const [newPhysicalType, setNewPhysicalType] = useState('Normal');

  // Form states for Editing
  const [editPlate, setEditPlate] = useState('');
  const [editVehicleType, setEditVehicleType] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEntryTimeStr, setEditEntryTimeStr] = useState('');
  const [editExitTimeStr, setEditExitTimeStr] = useState('');
  const [editAmountPaid, setEditAmountPaid] = useState<number | ''>('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<'Efectivo' | 'Tarjeta' | null>(null);
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [editPhysicalType, setEditPhysicalType] = useState('Normal');

  // Form states for Manual Exit Processing
  const [exitPaymentMethod, setExitPaymentMethod] = useState<'Efectivo' | 'Tarjeta'>('Efectivo');
  const [exitAmountPaid, setExitAmountPaid] = useState<number>(0);
  const [exitNotes, setExitNotes] = useState('');
  const [exitPaidAtEntry, setExitPaidAtEntry] = useState(false);

  // Load rates & records
  useEffect(() => {
    const db = getDb();
    const unsubRates = onSnapshot(collection(db, 'vehicle_type_rates'), (snap) => {
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
    });

    const unsubRecords = onSnapshot(collection(db, 'parking_records'), (snap) => {
      const list: ParkingRecord[] = [];
      snap.forEach((doc) => {
        list.push({ ticketCode: doc.id, ...doc.data() } as ParkingRecord);
      });
      // Sort: entries newest first
      list.sort((a, b) => b.entryTime - a.entryTime);
      setRecords(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => {
      unsubRates();
      unsubRecords();
    };
  }, []);

  // Deduplicated unique vehicle rates for dropdown selectors to avoid duplicate keys and options
  const uniqueRates = useMemo(() => {
    const map = new Map<string, VehicleTypeRate>();
    rates.forEach(r => {
      if (!map.has(r.typeName) || r.isDefault) {
        map.set(r.typeName, r);
      }
    });
    return Array.from(map.values());
  }, [rates]);

  // Set default manual ticket code (format PR-XXXX)
  const getNextTicketCode = () => {
    if (records.length === 0) return 'PR-1001';
    const numericCodes = records
      .map(r => parseInt(r.ticketCode.replace('PR-', '')))
      .filter(n => !isNaN(n));
    if (numericCodes.length === 0) return 'PR-1001';
    const max = Math.max(...numericCodes);
    return `PR-${(max + 1).toString().padStart(4, '0')}`;
  };

  // Triggered when manual registration is submitted
  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlate.trim()) return;

    try {
      const db = getDb();
      const code = getNextTicketCode();
      const nowMs = Date.now();

      const newRecord: ParkingRecord = {
        ticketCode: code,
        plate: newPlate.trim().toUpperCase(),
        vehicleType: newVehicleType,
        entryTime: nowMs,
        exitTime: null,
        amountPaid: null,
        paymentMethod: null,
        status: 'ACTIVE',
        registeredBy: currentUser.username,
        processedBy: null,
        shiftId: null, // Optionally tie to a shift
        description: newDescription,
        paidAtEntry: false,
        physicalType: newPhysicalType,
        parkingLotId: currentUser.assignedParkingLot ?? 1
      };

      await setDoc(doc(db, 'parking_records', code), newRecord);
      setIsCreateModalOpen(false);
      setNewPlate('');
      setNewDescription('');
      setNewPhysicalType('Normal');
    } catch (err) {
      console.error('Error creating ticket:', err);
    }
  };

  // Open Edit modal and load record data
  const openEditModal = (rec: ParkingRecord) => {
    setSelectedRecord(rec);
    setEditPlate(rec.plate);
    setEditVehicleType(rec.vehicleType);
    setEditDescription(rec.description || '');
    setEditEntryTimeStr(new Date(rec.entryTime).toISOString().slice(0, 16));
    setEditExitTimeStr(rec.exitTime ? new Date(rec.exitTime).toISOString().slice(0, 16) : '');
    setEditAmountPaid(rec.amountPaid !== null ? rec.amountPaid : '');
    setEditPaymentMethod(rec.paymentMethod);
    setEditStatus(rec.status);
    setEditPhysicalType(rec.physicalType || 'Normal');
    setIsEditModalOpen(true);
  };

  // Save edited record
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    try {
      const db = getDb();
      const recordRef = doc(db, 'parking_records', selectedRecord.ticketCode);
      
      const entryTimeMs = new Date(editEntryTimeStr).getTime();
      const exitTimeMs = editExitTimeStr ? new Date(editExitTimeStr).getTime() : null;

      const updateData: Partial<ParkingRecord> = {
        plate: editPlate.toUpperCase(),
        vehicleType: editVehicleType,
        description: editDescription,
        entryTime: entryTimeMs,
        exitTime: exitTimeMs,
        amountPaid: editAmountPaid === '' ? null : Number(editAmountPaid),
        paymentMethod: editPaymentMethod,
        status: editStatus,
        physicalType: editPhysicalType
      };

      // If transition to ACTIVE, clear exit fields
      if (editStatus === 'ACTIVE') {
        updateData.exitTime = null;
        updateData.amountPaid = null;
        updateData.paymentMethod = null;
        updateData.processedBy = null;
      } else {
        updateData.processedBy = currentUser.username;
      }

      await updateDoc(recordRef, updateData);
      setIsEditModalOpen(false);
    } catch (err) {
      console.error('Error updating ticket:', err);
    }
  };

  // Open Exit manual processing modal and calculate payment
  const openExitModal = (rec: ParkingRecord) => {
    setSelectedRecord(rec);
    const nowMs = Date.now();
    const elapsedMs = nowMs - rec.entryTime;
    
    // Find the hourly rate
    const matchedRate = rates.find(r => r.typeName.toLowerCase() === rec.vehicleType.toLowerCase()) 
      || rates.find(r => r.isDefault) 
      || { hourlyRate: 20 };
    
    // Standard parking calculation: ceiling of elapsed hours
    const elapsedHrs = Math.max(1, Math.ceil(elapsedMs / 3600000));
    const calculatedFee = elapsedHrs * matchedRate.hourlyRate;

    setExitAmountPaid(calculatedFee);
    setExitPaymentMethod('Efectivo');
    setExitNotes(rec.description || '');
    setExitPaidAtEntry(rec.paidAtEntry || false);
    setIsExitModalOpen(true);
  };

  // Process exit payment in database
  const handleProcessExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    try {
      const db = getDb();
      const recordRef = doc(db, 'parking_records', selectedRecord.ticketCode);

      await updateDoc(recordRef, {
        exitTime: Date.now(),
        amountPaid: exitAmountPaid,
        paymentMethod: exitPaymentMethod,
        status: 'COMPLETED',
        processedBy: currentUser.username,
        description: exitNotes
      });

      setIsExitModalOpen(false);
    } catch (err) {
      console.error('Error processing manual exit:', err);
    }
  };

  const handleDeleteRecord = async (ticketCode: string) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el ticket ${ticketCode}?`)) {
      return;
    }

    try {
      const db = getDb();
      await deleteDoc(doc(db, 'parking_records', ticketCode));
    } catch (err) {
      console.error('Error deleting ticket:', err);
    }
  };

  // Apply filters
  const filteredRecords = records.filter((rec) => {
    // 1. Search query (plate or code)
    const matchesSearch = 
      rec.plate.toLowerCase().includes(searchQuery.toLowerCase()) || 
      rec.ticketCode.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Status filter
    const matchesStatus = statusFilter === 'ALL' || rec.status === statusFilter;

    // 3. Vehicle Type filter
    const matchesVehicle = vehicleTypeFilter === 'ALL' || rec.vehicleType === vehicleTypeFilter;

    // 4. Cashier filter (either registered or processed)
    const matchesCashier = !cashierFilter || 
      rec.registeredBy.toLowerCase().includes(cashierFilter.toLowerCase()) || 
      (rec.processedBy && rec.processedBy.toLowerCase().includes(cashierFilter.toLowerCase()));

    // 5. Date filter (based on entryTime day)
    let matchesDate = true;
    if (dateFilter) {
      const entryDateStr = new Date(rec.entryTime).toISOString().split('T')[0];
      matchesDate = entryDateStr === dateFilter;
    }

    return matchesSearch && matchesStatus && matchesVehicle && matchesCashier && matchesDate;
  });

  // Unique cashiers list for autocompletion or visual hints
  const cashierNames = Array.from(new Set(
    records.flatMap(r => [r.registeredBy, r.processedBy].filter(Boolean) as string[])
  ));

  return (
    <div className="space-y-6 p-1.5 md:p-3 max-w-7xl mx-auto font-sans text-slate-300">
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img src="/logo-plaza-1.jpg" alt="Logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" onError={(e) => {
            e.currentTarget.style.display = 'none';
          }} />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Registros y Tickets</h1>
          </div>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/10 hover:shadow-blue-600/20 active:scale-95 transition-all self-start cursor-pointer"
        >
          <Plus size={16} />
          Registrar Entrada Manual
        </button>
      </div>

      {/* Advanced Filters Card */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5 shadow-xl space-y-4">
        {/* Row 1: Search & Status */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-6 relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              placeholder="Buscar por placa o número de ticket..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="ACTIVE">Activos (En Estacionamiento)</option>
              <option value="COMPLETED">Completados (Exited)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={vehicleTypeFilter}
              onChange={(e) => setVehicleTypeFilter(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm"
            >
              <option value="ALL">Todos los Vehículos</option>
              {uniqueRates.map(r => (
                <option key={r.id || r.typeName} value={r.typeName}>{r.typeName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Secondary Filters (Date & Cashier) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 border-t border-slate-700/30">
          <div className="md:col-span-4 flex items-center gap-2">
            <Calendar size={16} className="text-slate-400 shrink-0" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
            />
            {dateFilter && (
              <button 
                onClick={() => setDateFilter('')}
                className="text-[10px] text-red-400 hover:underline shrink-0"
              >
                Limpiar
              </button>
            )}
          </div>

          <div className="md:col-span-4 relative">
            <input
              type="text"
              placeholder="Filtrar por Cajero/Usuario..."
              value={cashierFilter}
              onChange={(e) => setCashierFilter(e.target.value)}
              list="cashier-datalist"
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none"
            />
            <datalist id="cashier-datalist">
              {cashierNames.map(name => <option key={name} value={name} />)}
            </datalist>
          </div>

          <div className="md:col-span-4 flex items-center justify-end">
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setVehicleTypeFilter('ALL');
                setCashierFilter('');
                setDateFilter('');
              }}
              className="text-xs text-slate-400 hover:text-white underline font-semibold cursor-pointer"
            >
              Restablecer Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 size={36} className="animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando registros...</p>
          </div>
        ) : filteredRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs font-bold uppercase tracking-wider bg-slate-800/40">
                  <th className="py-4 px-4 font-mono">Ticket</th>
                  <th className="py-4 px-4">Placa</th>
                  <th className="py-4 px-4">Tipo Vehículo</th>
                  <th className="py-4 px-4">Entrada</th>
                  <th className="py-4 px-4">Salida</th>
                  <th className="py-4 px-4">Cobrado</th>
                  <th className="py-4 px-4">Registrado por</th>
                  <th className="py-4 px-4 text-center">Estado</th>
                  <th className="py-4 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredRecords.map((rec) => {
                  const entryDate = new Date(rec.entryTime);
                  const exitDate = rec.exitTime ? new Date(rec.exitTime) : null;
                  
                  return (
                    <tr key={rec.ticketCode} className="hover:bg-slate-700/20 text-xs text-slate-300">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-400">{rec.ticketCode}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-slate-950 border border-slate-700 text-white font-mono rounded-lg font-bold text-[12px] tracking-wide">
                          {rec.plate}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium">{rec.vehicleType}</td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {entryDate.toLocaleDateString('es-MX')} {entryDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {exitDate ? (
                          <>
                            {exitDate.toLocaleDateString('es-MX')} {exitDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </>
                        ) : (
                          <span className="text-slate-500 font-medium italic">En recinto</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-emerald-400">
                        {rec.amountPaid !== null ? `$${rec.amountPaid.toFixed(2)}` : '-'}
                        {rec.paymentMethod && (
                          <span className="block text-[10px] text-slate-500 font-medium">{rec.paymentMethod}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400 font-mono">
                        {rec.registeredBy}
                        {rec.processedBy && <span className="block text-[10px] text-slate-500">Salida: {rec.processedBy}</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {rec.status === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full border border-emerald-400/20">
                            Terminado
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Quick exit register if active */}
                          {rec.status === 'ACTIVE' && (
                            <button
                              onClick={() => openExitModal(rec)}
                              title="Registrar Salida Manual"
                              className="p-1.5 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600 hover:text-white rounded-lg transition-all cursor-pointer"
                            >
                              <LogOut size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(rec)}
                            title="Editar Ticket"
                            className="p-1.5 bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-lg transition-all cursor-pointer"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteRecord(rec.ticketCode)}
                            title="Eliminar Ticket"
                            className="p-1.5 bg-red-600/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white rounded-lg transition-all cursor-pointer"
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
            <AlertTriangle size={32} className="mx-auto text-slate-600 mb-2" />
            <span className="font-semibold text-slate-400">No se encontraron tickets</span>
            <p className="text-xs mt-1">Prueba cambiando tu búsqueda o limpiando los filtros activos.</p>
          </div>
        )}
      </div>

      {/* MODAL: REGISTRAR ENTRADA MANUAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Plus size={20} className="text-blue-500" />
              Registrar Entrada Manual
            </h3>
            
            <form onSubmit={handleCreateRecord} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Placa
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. GWM-7762 o S/P"
                  value={newPlate}
                  onChange={(e) => setNewPlate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm uppercase focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Tipo de Vehículo
                </label>
                <select
                  value={newVehicleType}
                  onChange={(e) => setNewVehicleType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                >
                  {uniqueRates.map(r => (
                    <option key={r.id || r.typeName} value={r.typeName}>{r.typeName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Tipo Físico
                </label>
                <select
                  value={newPhysicalType}
                  onChange={(e) => setNewPhysicalType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                >
                  <option value="Normal">Boleto Normal (Por hora)</option>
                  <option value="Pensión">Pensión / Mensualidad</option>
                  <option value="Cortesía">Cortesía / Especial</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Descripción / Notas
                </label>
                <textarea
                  placeholder="Observaciones de ingreso, golpes, pertenencias..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none h-20 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/10"
                >
                  Generar Entrada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR SALIDA MANUAL Y COBRAR */}
      {isExitModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setIsExitModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <LogOut size={20} className="text-emerald-500" />
              Procesar Salida y Cobro
            </h3>
            
            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 mb-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Ticket:</span>
                <span className="font-mono font-bold text-white">{selectedRecord.ticketCode}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Placa:</span>
                <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-yellow-400 font-bold">{selectedRecord.plate}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Tipo de Vehículo:</span>
                <span className="font-semibold text-slate-300">{selectedRecord.vehicleType}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Hora Entrada:</span>
                <span className="text-slate-300">{new Date(selectedRecord.entryTime).toLocaleTimeString('es-MX')}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Tiempo Transcurrido:</span>
                <span className="text-amber-400 font-semibold font-mono">
                  {Math.max(1, Math.ceil((Date.now() - selectedRecord.entryTime) / 60000))} minutos
                </span>
              </div>
            </div>

            <form onSubmit={handleProcessExit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Monto a Cobrar ($)
                </label>
                <input
                  type="number"
                  required
                  value={exitAmountPaid}
                  onChange={(e) => setExitAmountPaid(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-md font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Método de Pago
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExitPaymentMethod('Efectivo')}
                    className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all
                      ${exitPaymentMethod === 'Efectivo' 
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 font-bold' 
                        : 'bg-slate-900/60 border-slate-700 text-slate-400'}`}
                  >
                    <Check size={14} className={exitPaymentMethod === 'Efectivo' ? 'opacity-100' : 'opacity-0'} />
                    Efectivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setExitPaymentMethod('Tarjeta')}
                    className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all
                      ${exitPaymentMethod === 'Tarjeta' 
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold' 
                        : 'bg-slate-900/60 border-slate-700 text-slate-400'}`}
                  >
                    <Check size={14} className={exitPaymentMethod === 'Tarjeta' ? 'opacity-100' : 'opacity-0'} />
                    Tarjeta
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Observaciones de Salida / Notas
                </label>
                <input
                  type="text"
                  placeholder="Salida registrada por admin..."
                  value={exitNotes}
                  onChange={(e) => setExitNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsExitModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-emerald-600/10"
                >
                  Registrar Cobro y Salida
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR DETALLES COMPLETOS DE TICKET */}
      {isEditModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl relative overflow-y-auto max-h-[90vh]">
            <button 
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Edit3 size={20} className="text-blue-500" />
              Editar Ticket {selectedRecord.ticketCode}
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Placa del Vehículo
                </label>
                <input
                  type="text"
                  required
                  value={editPlate}
                  onChange={(e) => setEditPlate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm uppercase focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Tipo de Vehículo
                  </label>
                  <select
                    value={editVehicleType}
                    onChange={(e) => setEditVehicleType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                  >
                    {uniqueRates.map(r => (
                      <option key={r.id || r.typeName} value={r.typeName}>{r.typeName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Categoría Física
                  </label>
                  <select
                    value={editPhysicalType}
                    onChange={(e) => setEditPhysicalType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Pensión">Pensión</option>
                    <option value="Cortesía">Cortesía</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Fecha/Hora Entrada
                </label>
                <input
                  type="datetime-local"
                  required
                  value={editEntryTimeStr}
                  onChange={(e) => setEditEntryTimeStr(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Estado del Ticket
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'COMPLETED')}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                >
                  <option value="ACTIVE">Activo (En Estacionamiento)</option>
                  <option value="COMPLETED">Terminado / Completado</option>
                </select>
              </div>

              {editStatus === 'COMPLETED' && (
                <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-700/40 space-y-3">
                  <p className="text-[10px] font-bold tracking-widest text-blue-400 uppercase">Campos de Liquidación</p>
                  
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Fecha/Hora Salida
                    </label>
                    <input
                      type="datetime-local"
                      required={editStatus === 'COMPLETED'}
                      value={editExitTimeStr}
                      onChange={(e) => setEditExitTimeStr(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                        Monto Cobrado ($)
                      </label>
                      <input
                        type="number"
                        required={editStatus === 'COMPLETED'}
                        value={editAmountPaid}
                        onChange={(e) => setEditAmountPaid(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                        Método de Pago
                      </label>
                      <select
                        value={editPaymentMethod || 'Efectivo'}
                        onChange={(e) => setEditPaymentMethod(e.target.value as 'Efectivo' | 'Tarjeta')}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none"
                      >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta">Tarjeta</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Descripción / Observaciones
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none h-16 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/10"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
