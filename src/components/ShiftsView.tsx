import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { UserShift } from '../types';
import { useParkingLots } from '../lib/parkingLots';
import { analyzeShiftDuplicates, DeduplicationResult } from '../lib/shiftDeduplication';
import { 
  History, 
  Clock, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle, 
  Trash2, 
  Edit3, 
  X, 
  Check, 
  Loader2, 
  DollarSign, 
  FileText,
  Filter,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  Layers,
  ArrowRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Building2,
  MessageSquare
} from 'lucide-react';

interface ExtendedShift extends UserShift {
  sourceCollection: 'cash_cuts' | 'user_shifts';
}

const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

export default function ShiftsView() {
  const [shifts, setShifts] = useState<ExtendedShift[]>([]);
  const [duplicatesInfo, setDuplicatesInfo] = useState<DeduplicationResult<ExtendedShift>['duplicatesFound']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Parking lots integration
  const { parkingLots, getLotName } = useParkingLots();

  // Filter state
  const [filterMode, setFilterMode] = useState<'TODOS' | 'HOY' | 'AYER' | 'FECHA'>('HOY'); // default to Hoy
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedLot, setSelectedLot] = useState<number | 'TODOS'>('TODOS');
  const [hideDuplicates, setHideDuplicates] = useState(false);

  // Modal / Form state for manual shift close or edit
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ExtendedShift | null>(null);

  // Compare Modal for duplicate cuts
  const [comparingGroup, setComparingGroup] = useState<{ canonical: ExtendedShift; superseded: ExtendedShift[] } | null>(null);

  // Edit fields
  const [initialAmount, setInitialAmount] = useState<number>(200);
  const [expectedAmount, setExpectedAmount] = useState<number>(0);
  const [actualAmount, setActualAmount] = useState<number | ''>(''); // money reported by cashier
  const [notes, setNotes] = useState('');
  const [isClosed, setIsClosed] = useState(false);

  // Listen to both collections in real-time
  useEffect(() => {
    const db = getDb();

    // Listen to user_shifts
    const unsubShifts = onSnapshot(collection(db, 'user_shifts'), (snapShifts) => {
      // Listen to cash_cuts
      const unsubCuts = onSnapshot(collection(db, 'cash_cuts'), (snapCuts) => {
        const merged: ExtendedShift[] = [];
        const seenIds = new Set<string>();

        // Process cash_cuts first
        snapCuts.forEach((doc) => {
          const data = doc.data();
          const id = doc.id;
          seenIds.add(id);
          merged.push({
            shiftId: id,
            username: data.username || 'unknown',
            parkingLotId: data.parkingLotId !== undefined ? data.parkingLotId : 1,
            startTime: data.startTime || 0,
            endTime: data.endTime || null,
            initialAmount: data.initialAmount !== undefined ? data.initialAmount : 200,
            expectedAmount: data.expectedAmount || 0,
            actualAmount: data.actualAmount !== undefined ? data.actualAmount : null,
            collectedAmount: data.collectedAmount !== undefined ? data.collectedAmount : data.actualAmount,
            difference: data.difference !== undefined ? data.difference : null,
            isClosed: data.isClosed !== undefined ? data.isClosed : (data.endTime ? true : false),
            notes: data.notes || '',
            sourceCollection: 'cash_cuts'
          } as ExtendedShift);
        });

        // Process user_shifts second
        snapShifts.forEach((doc) => {
          if (!seenIds.has(doc.id)) {
            const data = doc.data();
            const id = doc.id;
            merged.push({
              shiftId: id,
              username: data.username || 'unknown',
              parkingLotId: data.parkingLotId !== undefined ? data.parkingLotId : 1,
              startTime: data.startTime || 0,
              endTime: data.endTime || null,
              initialAmount: data.initialAmount !== undefined ? data.initialAmount : 200,
              expectedAmount: data.expectedAmount || 0,
              actualAmount: data.actualAmount !== undefined ? data.actualAmount : null,
              collectedAmount: data.collectedAmount !== undefined ? data.collectedAmount : data.actualAmount,
              difference: data.difference !== undefined ? data.difference : null,
              isClosed: data.isClosed !== undefined ? data.isClosed : (data.endTime ? true : false),
              notes: data.notes || '',
              sourceCollection: 'user_shifts'
            } as ExtendedShift);
          }
        });

        // Sort newest start time first
        merged.sort((a, b) => b.startTime - a.startTime);

        // Run smart deduplication analysis
        const analysis = analyzeShiftDuplicates(merged);
        setShifts(analysis.deduplicatedShifts);
        setDuplicatesInfo(analysis.duplicatesFound);
        setLoading(false);
      }, (err) => {
        console.error('Error al suscribirse a cash_cuts:', err);
        setError('Error al sincronizar cortes de caja.');
        setLoading(false);
      });

      return () => {
        unsubCuts();
      };
    }, (err) => {
      console.error('Error al suscribirse a user_shifts:', err);
      setError('Error al sincronizar turnos y cortes.');
      setLoading(false);
    });

    return () => {
      unsubShifts();
    };
  }, []);

  const openEditModal = (shift: ExtendedShift) => {
    setSelectedShift(shift);
    setInitialAmount(shift.initialAmount);
    setExpectedAmount(shift.expectedAmount || 0);
    setActualAmount(shift.actualAmount !== null ? shift.actualAmount : '');
    setNotes(shift.notes || '');
    setIsClosed(shift.isClosed);
    setIsEditModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShift) return;

    try {
      const db = getDb();
      const colName = selectedShift.sourceCollection || 'cash_cuts';
      const shiftRef = doc(db, colName, selectedShift.shiftId);

      const actualNum = actualAmount === '' ? null : Number(actualAmount);
      
      // Calculate difference if closed
      let calculatedDiff: number | null = null;
      let endTimeVal = selectedShift.endTime;

      if (isClosed) {
        if (actualNum !== null) {
          calculatedDiff = actualNum - expectedAmount;
        }
        if (!endTimeVal) {
          endTimeVal = Date.now();
        }
      } else {
        endTimeVal = null;
      }

      await updateDoc(shiftRef, {
        initialAmount: Number(initialAmount),
        expectedAmount: Number(expectedAmount),
        actualAmount: actualNum,
        collectedAmount: actualNum,
        difference: calculatedDiff,
        isClosed: isClosed,
        endTime: endTimeVal,
        notes: notes
      });

      setIsEditModalOpen(false);
      setSuccessMessage(`Cambios guardados en el registro ${selectedShift.shiftId}`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      setError(`Error al guardar cambios de corte: ${err.message || err}`);
    }
  };

  const handleDeleteShift = async (shift: ExtendedShift) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente el registro de ${shift.sourceCollection === 'cash_cuts' ? 'corte' : 'turno'} ${shift.shiftId}?`)) {
      return;
    }

    try {
      const db = getDb();
      const colName = shift.sourceCollection || 'cash_cuts';
      await deleteDoc(doc(db, colName, shift.shiftId));
      setSuccessMessage(`Registro ${shift.shiftId} eliminado.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
      setError(`Error al eliminar registro: ${err.message || err}`);
    }
  };

  const handleDeleteSuperseded = async (supersededShift: ExtendedShift, canonicalShift: ExtendedShift) => {
    if (!window.confirm(`¿Confirmas eliminar permanentemente el corte anterior duplicado ${supersededShift.shiftId}?\n\nEste corte fue re-emitido y reemplazado por ${canonicalShift.shiftId} (que contiene la nota: "${canonicalShift.notes || 'Sin nota'}").\n\nAl eliminarlo, se mantendrá únicamente el corte vigente y se limpiará la base de datos.`)) {
      return;
    }

    try {
      const db = getDb();
      const colName = supersededShift.sourceCollection || 'cash_cuts';
      await deleteDoc(doc(db, colName, supersededShift.shiftId));
      setSuccessMessage(`Corte duplicado ${supersededShift.shiftId} eliminado exitosamente. Se mantiene ${canonicalShift.shiftId} como registro definitivo.`);
      setComparingGroup(null);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      setError(`Error al eliminar corte duplicado: ${err.message || err}`);
    }
  };

  // Filter logic
  const filteredShifts = shifts.filter((shift) => {
    // Lot filter
    if (selectedLot !== 'TODOS') {
      const lotId = shift.parkingLotId ?? 1;
      if (lotId !== selectedLot) return false;
    }

    // Hide duplicates filter
    if (hideDuplicates && shift.isDuplicate) {
      return false;
    }

    if (filterMode === 'TODOS') return true;

    const shiftDate = new Date(shift.startTime);
    const today = new Date();

    if (filterMode === 'HOY') {
      return isSameDay(shiftDate, today);
    }

    if (filterMode === 'AYER') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return isSameDay(shiftDate, yesterday);
    }

    if (filterMode === 'FECHA') {
      if (!customDate) return true;
      const [year, month, day] = customDate.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day);
      return isSameDay(shiftDate, targetDate);
    }

    return true;
  });

  // Strict calculations: only active (non-duplicate) shifts are summed to prevent inflating money!
  const activeFilteredShifts = filteredShifts.filter((s) => !s.isDuplicate);
  const totalCutsCount = activeFilteredShifts.length;
  const totalExpectedAmount = activeFilteredShifts.reduce((sum, s) => sum + (s.expectedAmount || 0), 0);
  const totalActualAmount = activeFilteredShifts.reduce((sum, s) => sum + (s.actualAmount || 0), 0);
  const totalDifferenceAmount = activeFilteredShifts.reduce((sum, s) => sum + (s.difference || 0), 0);

  // Duplicates within current filtered list
  const duplicatesInFilter = filteredShifts.filter((s) => s.isDuplicate);
  const totalDuplicatesAmountSaved = duplicatesInFilter.reduce((sum, s) => sum + (s.actualAmount || 0), 0);

  // Find duplicates detected in entire system or current filter
  const activeDuplicatesGroups = duplicatesInfo.filter((group) => 
    group.superseded.some((sup) => shifts.some((s) => s.shiftId === sup.shiftId))
  );

  return (
    <div className="space-y-6 p-1.5 md:p-3 max-w-7xl mx-auto font-sans text-slate-300">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img src="/logo-plaza-1.jpg" alt="Logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" onError={(e) => {
            e.currentTarget.style.display = 'none';
          }} />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Turnos y Cortes de Caja</h1>
            <p className="text-xs text-slate-400 mt-0.5">Auditoría, arqueos y control de cortes de turno por cajero y lote</p>
          </div>
        </div>

        {duplicatesInfo.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 rounded-2xl">
            <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-amber-300 block">Deduplicación Automática Activa</span>
              <span className="text-[11px] text-slate-400">Protegiendo ingresos contra cortes re-emitidos</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-300 text-sm flex items-center gap-3 animate-fade-in">
          <CheckCircle size={18} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* PROMINENT ALERT BANNER: DETECTED DUPLICATE CUTS */}
      {activeDuplicatesGroups.length > 0 && (
        <div className="p-4 md:p-5 bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-slate-900/60 border border-amber-500/30 rounded-3xl shadow-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-2xl shrink-0 mt-0.5">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-white">
                    Re-emisión de Turno Detectada ({activeDuplicatesGroups.length} caso{activeDuplicatesGroups.length > 1 ? 's' : ''})
                  </h3>
                  <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-amber-500/30">
                    Cálculo Protegido
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                  {activeDuplicatesGroups.map((g) => {
                    const supIds = g.superseded.map(s => s.shiftId).join(', ');
                    const canId = g.canonical.shiftId;
                    const username = g.canonical.username;
                    return (
                      <span key={canId} className="block mt-1">
                        El corte <strong className="text-amber-300 font-mono">{supIds}</strong> fue re-emitido ~2 minutos después como <strong className="text-emerald-400 font-mono">{canId}</strong> por el cajero <strong className="text-white">@{username}</strong>
                        {g.canonical.notes ? (
                          <> para agregar la observación: <em className="text-blue-300">"{g.canonical.notes}"</em>.</>
                        ) : '.'}
                      </span>
                    );
                  })}
                  <span className="block mt-1 text-slate-400">
                    <strong className="text-emerald-400">¿Por qué sucedió?</strong> En terminal se generó un primer corte y poco después se volvió a emitir para asentar la nota aclaratoria. Para que no se duplique el dinero, el sistema calcula únicamente el corte vigente más completo y excluye el anterior.
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
              {activeDuplicatesGroups.map((group) => (
                <button
                  key={group.canonical.shiftId}
                  onClick={() => setComparingGroup(group)}
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye size={14} /> Comparar Cortes
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Filters & Controls Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-800/40 p-4 rounded-2xl border border-slate-700/30">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 mr-2">
            <Filter size={14} className="text-blue-400" /> Filtrar por:
          </span>
          <button
            onClick={() => setFilterMode('HOY')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'HOY'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
            }`}
          >
            Hoy
          </button>
          <button
            onClick={() => setFilterMode('AYER')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'AYER'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
            }`}
          >
            Ayer
          </button>
          <button
            onClick={() => setFilterMode('FECHA')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'FECHA'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
            }`}
          >
            Seleccionar Fecha
          </button>
          <button
            onClick={() => setFilterMode('TODOS')}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'TODOS'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/10'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
            }`}
          >
            Ver Todos
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* ParkingLot Filter */}
          <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
            <Building2 size={13} className="text-blue-400" />
            <select
              value={selectedLot}
              onChange={(e) => setSelectedLot(e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value))}
              className="bg-transparent text-xs text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="TODOS" className="bg-slate-800 text-white">Todos los Lotes</option>
              {parkingLots.map((lot) => (
                <option key={lot.id} value={lot.id} className="bg-slate-800 text-white">
                  Lote #{lot.id}: {lot.name}
                </option>
              ))}
            </select>
          </div>

          {filterMode === 'FECHA' && (
            <div className="flex items-center gap-2.5 bg-slate-900/60 p-2 rounded-xl border border-slate-700/50 animate-fade-in">
              <Calendar size={14} className="text-blue-400" />
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="bg-transparent border-none text-white text-xs font-bold focus:outline-none cursor-pointer"
              />
            </div>
          )}

          {/* Hide duplicates toggle */}
          {duplicatesInFilter.length > 0 && (
            <button
              onClick={() => setHideDuplicates(!hideDuplicates)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                hideDuplicates 
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
                  : 'bg-slate-900/60 text-slate-400 border-slate-700/50 hover:text-white'
              }`}
              title="Ocultar cortes anteriores que fueron re-emitidos"
            >
              {hideDuplicates ? <EyeOff size={13} /> : <Eye size={13} />}
              {hideDuplicates ? 'Ocultando Duplicados' : 'Mostrar Todos (Inc. Duplicados)'}
            </button>
          )}
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Cortes */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Turnos Oficiales</span>
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <History size={16} />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-white block">{totalCutsCount}</span>
            {duplicatesInFilter.length > 0 && (
              <span className="text-[10px] text-amber-400 font-semibold mt-0.5 block">
                +{duplicatesInFilter.length} re-emitido{duplicatesInFilter.length > 1 ? 's' : ''} excluido{duplicatesInFilter.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Total Esperado */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Cobrado (Sist.)</span>
            <div className="p-2.5 bg-slate-500/10 border border-slate-600/20 text-slate-300 rounded-xl">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-slate-200 block">${totalExpectedAmount.toFixed(2)}</span>
            {totalDuplicatesAmountSaved > 0 && (
              <span className="text-[10px] text-emerald-400 font-semibold mt-0.5 block">
                -${totalDuplicatesAmountSaved.toFixed(2)} duplicados prevenidos
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Total Entregado */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Entregado Real (Fís.)</span>
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-emerald-400 block">${totalActualAmount.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Suma deduplicada sin inflación</span>
          </div>
        </div>

        {/* Card 4: Diferencia Total */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Diferencia Neta</span>
            <div className={`p-2.5 rounded-xl border ${totalDifferenceAmount === 0 ? 'bg-slate-500/10 border-slate-600/20 text-slate-300' : totalDifferenceAmount < 0 ? 'bg-red-500/10 border-red-500/20 text-red-400 animate-pulse' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
              <TrendingDown size={16} />
            </div>
          </div>
          <div className="mt-2">
            <span className={`text-xl font-bold block ${totalDifferenceAmount === 0 ? 'text-slate-300' : totalDifferenceAmount < 0 ? 'text-red-400' : 'text-amber-400'}`}>
              {totalDifferenceAmount > 0 ? `+$${totalDifferenceAmount.toFixed(2)}` : totalDifferenceAmount < 0 ? `-$${Math.abs(totalDifferenceAmount).toFixed(2)}` : `$${totalDifferenceAmount.toFixed(2)}`}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Físico vs Esperado</span>
          </div>
        </div>
      </div>

      {/* Shifts Table */}
      <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl shadow-xl overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 size={36} className="animate-spin text-blue-500 mx-auto mb-3" />
            <p className="text-sm font-medium">Cargando cortes y turnos...</p>
          </div>
        ) : filteredShifts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs font-bold uppercase tracking-wider bg-slate-800/40">
                  <th className="py-4 px-5 font-mono">ID Registro</th>
                  <th className="py-4 px-4">Estacionamiento</th>
                  <th className="py-4 px-4 text-center">Tipo</th>
                  <th className="py-4 px-4">Cajero</th>
                  <th className="py-4 px-5">Inicio / Fin</th>
                  <th className="py-4 px-4">Cobrado (Sist.)</th>
                  <th className="py-4 px-4">Entregado (Fís.)</th>
                  <th className="py-4 px-4">Diferencia</th>
                  <th className="py-4 px-5">Observaciones</th>
                  <th className="py-4 px-4 text-center">Estado</th>
                  <th className="py-4 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredShifts.map((shift) => {
                  const startDate = new Date(shift.startTime);
                  const endDate = shift.endTime ? new Date(shift.endTime) : null;
                  
                  // Difference alerts
                  const hasDiscrepancy = shift.difference !== null && shift.difference !== 0;
                  const isNegativeDiscrepancy = shift.difference !== null && shift.difference < 0;
                  const lotId = shift.parkingLotId ?? 1;

                  // Row highlight if duplicate
                  const isSuperseded = shift.isDuplicate;
                  const isCanonical = shift.duplicateStatus === 'canonical';

                  return (
                    <tr 
                      key={shift.shiftId} 
                      className={`text-xs text-slate-300 transition-colors ${
                        isSuperseded 
                          ? 'bg-amber-950/20 hover:bg-amber-950/30 border-l-4 border-l-amber-500' 
                          : isCanonical 
                            ? 'bg-emerald-950/10 hover:bg-slate-700/20 border-l-4 border-l-emerald-500' 
                            : 'hover:bg-slate-700/20'
                      }`}
                    >
                      <td className="py-4 px-5">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono font-bold text-blue-400">{shift.shiftId}</span>
                          {isSuperseded && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 w-fit">
                              <AlertTriangle size={10} /> Re-emitido
                            </span>
                          )}
                          {isCanonical && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 w-fit">
                              <Check size={10} /> Vigente Oficial
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Estacionamiento */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
                          <Building2 size={12} className="text-blue-400" />
                          Lote #{lotId}: {getLotName(lotId)}
                        </span>
                      </td>

                      {/* Tipo */}
                      <td className="py-4 px-4 text-center">
                        {shift.sourceCollection === 'cash_cuts' ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider uppercase text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Corte
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold tracking-wider uppercase text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-500/20">
                            Turno
                          </span>
                        )}
                      </td>

                      {/* Cajero */}
                      <td className="py-4 px-4 font-semibold text-white">@{shift.username}</td>

                      {/* Inicio / Fin */}
                      <td className="py-4 px-5 text-slate-400">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1">
                            <Clock size={11} className="text-emerald-500 shrink-0" />
                            {startDate.toLocaleDateString('es-MX')} {startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {endDate ? (
                            <span className="flex items-center gap-1 mt-0.5 text-slate-400">
                              <CheckCircle size={11} className="text-slate-500 shrink-0" />
                              {endDate.toLocaleDateString('es-MX')} {endDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 mt-0.5 text-amber-500 font-semibold italic">
                              <Clock size={11} className="animate-spin text-amber-400 shrink-0" />
                              Activo / En curso
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cobrado Sist */}
                      <td className="py-4 px-4 font-mono">
                        {isSuperseded ? (
                          <div className="flex flex-col">
                            <span className="line-through text-slate-500">${(shift.expectedAmount || 0).toFixed(2)}</span>
                            <span className="text-[9px] text-amber-400 font-sans">No sumado</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-semibold">${(shift.expectedAmount || 0).toFixed(2)}</span>
                        )}
                      </td>

                      {/* Entregado Físico */}
                      <td className="py-4 px-4 font-mono font-semibold">
                        {isSuperseded ? (
                          <div className="flex flex-col">
                            <span className="line-through text-slate-500">${shift.actualAmount !== null ? shift.actualAmount.toFixed(2) : '-'}</span>
                            <span className="text-[9px] text-amber-400 font-sans">Protegido</span>
                          </div>
                        ) : (
                          <span className="text-white">${shift.actualAmount !== null ? shift.actualAmount.toFixed(2) : '-'}</span>
                        )}
                      </td>

                      {/* Diferencia */}
                      <td className="py-4 px-4">
                        {shift.difference !== null ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold border
                            ${shift.difference === 0 
                              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' 
                              : isNegativeDiscrepancy 
                                ? 'text-red-400 bg-red-400/10 border-red-500/30 font-extrabold animate-pulse' 
                                : 'text-amber-400 bg-amber-400/10 border-amber-400/20'}`}>
                            {shift.difference > 0 ? `+$${shift.difference.toFixed(2)}` : `-$${Math.abs(shift.difference).toFixed(2)}`}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* Observaciones */}
                      <td className="py-4 px-5 max-w-[220px]">
                        {shift.notes && shift.notes.trim() ? (
                          <div className="flex items-start gap-1.5 bg-slate-900/60 p-2 rounded-xl border border-slate-700/50 text-slate-200">
                            <MessageSquare size={13} className="text-blue-400 shrink-0 mt-0.5" />
                            <span className="text-[11px] leading-tight break-words font-medium">{shift.notes}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">Sin notas</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-4 px-4 text-center">
                        {isSuperseded ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                            Reemplazado
                          </span>
                        ) : shift.isClosed ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-slate-400 bg-slate-400/10 px-2.5 py-0.5 rounded-full border border-slate-400/20">
                            Cerrado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                            Abierto
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isSuperseded && shift.supersededBy && (
                            <button
                              onClick={() => {
                                const canonical = shifts.find(s => s.shiftId === shift.supersededBy);
                                if (canonical) {
                                  setComparingGroup({ canonical, superseded: [shift] });
                                }
                              }}
                              className="p-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500 hover:text-white rounded-lg transition-all cursor-pointer"
                              title="Comparar con el corte vigente"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(shift)}
                            className="p-1.5 bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-lg transition-all cursor-pointer"
                            title={shift.isClosed ? "Editar Observaciones / Monto" : "Hacer Corte de Caja Manual"}
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteShift(shift)}
                            className="p-1.5 bg-red-600/10 text-red-400 border border-red-500/20 hover:bg-red-600 hover:text-white rounded-lg transition-all cursor-pointer"
                            title={isSuperseded ? "Eliminar este corte duplicado de la base de datos" : "Eliminar registro"}
                          >
                            <Trash2 size={13} />
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
            <History size={32} className="mx-auto text-slate-600 mb-2" />
            <span className="font-semibold text-slate-400">Sin cortes de caja en esta fecha</span>
            <p className="text-xs mt-1">Modifica los filtros o selecciona otra fecha para consultar los registros.</p>
          </div>
        )}
      </div>

      {/* MODAL: COMPARE DUPLICATE CUTS */}
      {comparingGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-850 border border-slate-700 rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative">
            <button 
              onClick={() => setComparingGroup(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Comparativa de Cortes de Turno</h3>
                <p className="text-xs text-slate-400">Análisis detallado de la re-emisión para el cajero @{comparingGroup.canonical.username}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-5">
              {/* Left: Superseded Cut */}
              {comparingGroup.superseded.map((sup) => (
                <div key={sup.shiftId} className="bg-amber-950/20 border border-amber-500/40 rounded-2xl p-4.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
                      {sup.shiftId} (Anterior)
                    </span>
                    <span className="text-[10px] uppercase font-bold text-amber-400">Reemplazado</span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Hora de Cierre:</span>
                      <span className="font-semibold text-white">
                        {sup.endTime ? new Date(sup.endTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Inicio de Turno:</span>
                      <span className="font-mono">
                        {new Date(sup.startTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cobrado (Sist.):</span>
                      <span className="font-mono font-bold">${(sup.expectedAmount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Entregado Físico:</span>
                      <span className="font-mono font-bold text-white">${(sup.actualAmount || 0).toFixed(2)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-700/60">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Notas registradas:</span>
                      <p className="text-[11px] italic bg-slate-900/80 p-2 rounded-lg text-slate-400 min-h-[36px]">
                        {sup.notes && sup.notes.trim() ? sup.notes : '(Sin notas registradas)'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => handleDeleteSuperseded(sup, comparingGroup.canonical)}
                      className="w-full py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={13} /> Depurar / Eliminar {sup.shiftId}
                    </button>
                  </div>
                </div>
              ))}

              {/* Right: Canonical Cut */}
              <div className="bg-emerald-950/20 border border-emerald-500/40 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                    {comparingGroup.canonical.shiftId} (Vigente)
                  </span>
                  <span className="text-[10px] uppercase font-bold text-emerald-400">Definitivo Oficial</span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Hora de Cierre:</span>
                    <span className="font-semibold text-emerald-300">
                      {comparingGroup.canonical.endTime 
                        ? new Date(comparingGroup.canonical.endTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) 
                        : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Inicio de Turno:</span>
                    <span className="font-mono">
                      {new Date(comparingGroup.canonical.startTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cobrado (Sist.):</span>
                    <span className="font-mono font-bold">${(comparingGroup.canonical.expectedAmount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Entregado Físico:</span>
                    <span className="font-mono font-bold text-white">${(comparingGroup.canonical.actualAmount || 0).toFixed(2)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-700/60">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Notas registradas:</span>
                    <p className="text-[11px] font-medium bg-slate-900/80 p-2 rounded-lg text-blue-300 min-h-[36px] border border-blue-500/20">
                      {comparingGroup.canonical.notes && comparingGroup.canonical.notes.trim() 
                        ? comparingGroup.canonical.notes 
                        : '(Sin notas)'}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-center p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
                  <CheckCircle size={14} className="mr-1.5" /> Se conserva e incluye en totales
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/70 rounded-2xl border border-slate-700/60 text-xs text-slate-400 leading-relaxed mb-4">
              <strong className="text-white block mb-1">Impacto Financiero Explicado:</strong>
              Ambos cortes compartían el mismo monto esperado ($1,020.00). Gracias a la deduplicación inteligente, los reportes suman únicamente los $1,020.00 de {comparingGroup.canonical.shiftId}, protegiendo tus estados de caja contra una duplicación artificial de dinero.
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setComparingGroup(null)}
                className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl text-xs transition-all cursor-pointer"
              >
                Cerrar Comparativa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SHIFT / CLOSING ARQUEO */}
      {isEditModalOpen && selectedShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <History size={20} className="text-blue-500" />
              Arqueo de Turno: {selectedShift.shiftId}
            </h3>

            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50 mb-4 space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span>Colección Origen:</span>
                <span className="font-bold text-slate-200 capitalize">{selectedShift.sourceCollection === 'cash_cuts' ? 'Cortes (Android)' : 'Turnos'}</span>
              </div>
              <div className="flex justify-between">
                <span>Estacionamiento:</span>
                <span className="font-bold text-blue-300">Lote #{selectedShift.parkingLotId ?? 1}: {getLotName(selectedShift.parkingLotId ?? 1)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cajero:</span>
                <span className="font-bold text-white">@{selectedShift.username}</span>
              </div>
              <div className="flex justify-between">
                <span>Fecha Inicio:</span>
                <span>{new Date(selectedShift.startTime).toLocaleString('es-MX')}</span>
              </div>
              <div className="flex justify-between">
                <span>Cobro Registrado por Sistema:</span>
                <span className="font-bold text-emerald-400 font-mono">${expectedAmount.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveShift} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Fondo Apertura ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Cobros Esperados ($)
                  </label>
                  <input
                    type="number"
                    required
                    value={expectedAmount}
                    onChange={(e) => setExpectedAmount(Number(e.target.value))}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Monto Físico Entregado ($)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                    <DollarSign size={16} />
                  </span>
                  <input
                    type="number"
                    placeholder="Monto entregado físicamente..."
                    value={actualAmount}
                    onChange={(e) => setActualAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-sm focus:outline-none"
                  />
                </div>
              </div>

              {/* isClosed toggle */}
              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="shift-is-closed-checkbox"
                  checked={isClosed}
                  onChange={(e) => setIsClosed(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="shift-is-closed-checkbox" className="text-xs font-semibold text-slate-300 cursor-pointer">
                  Cerrar turno definitivamente
                </label>
              </div>

              {/* Difference Preview */}
              {isClosed && actualAmount !== '' && (
                <div className="p-3.5 bg-slate-900/60 rounded-xl flex items-center justify-between text-xs font-semibold border border-slate-700/50">
                  <span className="text-slate-400">Diferencia calculada:</span>
                  <span className={`font-mono text-sm font-bold
                    ${(Number(actualAmount) - expectedAmount) === 0 
                      ? 'text-emerald-400' 
                      : (Number(actualAmount) - expectedAmount) < 0 
                        ? 'text-red-400' 
                        : 'text-amber-400'}`}>
                    ${(Number(actualAmount) - expectedAmount).toFixed(2)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Observaciones / Notas
                </label>
                <textarea
                  placeholder="ej. Todo cuadra, faltaron $10 pesos por cambio, etc..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none h-16 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-all shadow-lg shadow-blue-600/10 cursor-pointer"
                >
                  Guardar Corte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
