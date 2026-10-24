import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { UserShift, ParkingRecord } from '../types';
import { useParkingLots } from '../lib/parkingLots';
import { analyzeShiftDuplicates, DeduplicationResult } from '../lib/shiftDeduplication';
import { reconcileAllShifts } from '../lib/shiftReconciliation';
import ShiftTicketsModal from './ShiftTicketsModal';
import { useAppLogo } from '../lib/appConfig';
import { computeDateRange, DateFilterMode } from '../lib/dateRanges';
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
  MessageSquare,
  Car,
  ChevronDown,
  ChevronUp,
  Copy
} from 'lucide-react';

interface ExtendedShift extends UserShift {
  sourceCollection: 'cash_cuts' | 'user_shifts';
}

export default function ShiftsView() {
  const { logoUrl } = useAppLogo();
  const [shifts, setShifts] = useState<ExtendedShift[]>([]);
  const [duplicatesInfo, setDuplicatesInfo] = useState<DeduplicationResult<ExtendedShift>['duplicatesFound']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Parking lots integration
  const { parkingLots, getLotName } = useParkingLots();

  // Filter state (supporting Hoy, Ayer, 7 días, Mes actual, Último mes, Fecha manual, Todos)
  const [filterMode, setFilterMode] = useState<DateFilterMode | 'TODOS'>('HOY');
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedLot, setSelectedLot] = useState<number | 'TODOS'>('TODOS');
  const [hideDuplicates, setHideDuplicates] = useState(false);

  // Mobile layout & density states: compact vs detailed
  const [mobileViewMode, setMobileViewMode] = useState<'compact' | 'detailed'>('compact');
  const [expandedShiftIds, setExpandedShiftIds] = useState<Record<string, boolean>>({});
  const [copiedShiftId, setCopiedShiftId] = useState<string | null>(null);

  const toggleExpandShift = (shiftId: string) => {
    setExpandedShiftIds((prev) => ({
      ...prev,
      [shiftId]: !prev[shiftId],
    }));
  };

  const copyShiftIdToClipboard = (shiftId: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(shiftId);
      setCopiedShiftId(shiftId);
      setTimeout(() => setCopiedShiftId(null), 1800);
    }
  };

  // Modal / Form state for manual shift close or edit
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<ExtendedShift | null>(null);

  // Modal state for processed cars / tickets breakdown
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [selectedShiftForTickets, setSelectedShiftForTickets] = useState<ExtendedShift | null>(null);

  // Compare Modal for duplicate cuts
  const [comparingGroup, setComparingGroup] = useState<{ canonical: ExtendedShift; superseded: ExtendedShift[] } | null>(null);

  // Edit fields
  const [initialAmount, setInitialAmount] = useState<number>(200);
  const [expectedAmount, setExpectedAmount] = useState<number>(0);
  const [actualAmount, setActualAmount] = useState<number | ''>(''); // money reported by cashier
  const [notes, setNotes] = useState('');
  const [isClosed, setIsClosed] = useState(false);

  // Listen to collections in real-time
  useEffect(() => {
    const db = getDb();

    // Listen to parking_records to reconcile cars processed per shift
    const unsubRecords = onSnapshot(collection(db, 'parking_records'), (snapRecords) => {
      const list: ParkingRecord[] = [];
      snapRecords.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as unknown as ParkingRecord);
      });
      setRecords(list);
    }, (err) => {
      console.error('Error al suscribirse a parking_records:', err);
    });

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
      unsubRecords();
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

  // Compute date range for Guadalajara timezone
  const shiftDateRange = useMemo(() => {
    if (filterMode === 'TODOS') return null;
    return computeDateRange(filterMode as DateFilterMode, customDate);
  }, [filterMode, customDate]);

  // Filter logic
  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      // Lot filter
      if (selectedLot !== 'TODOS') {
        const lotId = shift.parkingLotId ?? 1;
        if (lotId !== selectedLot) return false;
      }

      // Hide duplicates filter
      if (hideDuplicates && shift.isDuplicate) {
        return false;
      }

      if (!shiftDateRange) return true;

      const shiftStart = shift.startTime;
      const shiftEnd = shift.endTime || Date.now();
      const primaryTime = shift.endTime || shift.startTime;
      const inRangeByPrimary = primaryTime >= shiftDateRange.start && primaryTime <= shiftDateRange.end;
      const overlaps = (shiftStart <= shiftDateRange.end && shiftEnd >= shiftDateRange.start);

      return inRangeByPrimary || overlaps;
    });
  }, [shifts, selectedLot, hideDuplicates, shiftDateRange]);

  // Strict calculations: only active (non-duplicate) shifts are summed to prevent inflating money!
  const activeFilteredShifts = filteredShifts.filter((s) => !s.isDuplicate);
  const totalCutsCount = activeFilteredShifts.length;
  const totalExpectedAmount = activeFilteredShifts.reduce((sum, s) => sum + (s.expectedAmount || 0), 0);
  const totalActualAmount = activeFilteredShifts.reduce((sum, s) => sum + (s.actualAmount || 0), 0);
  const totalDifferenceAmount = activeFilteredShifts.reduce((sum, s) => sum + (s.difference || 0), 0);

  // Reconcile shifts with individual parking ticket records
  const reconciliations = useMemo(() => {
    return reconcileAllShifts(shifts, records);
  }, [shifts, records]);

  // Aggregate cars count and ticket revenue in current active filter
  const totalCarsProcessed = activeFilteredShifts.reduce((sum, s) => {
    const rec = reconciliations.get(s.shiftId);
    return sum + (rec?.carsCount || 0);
  }, 0);

  const totalCarsAmountPaid = activeFilteredShifts.reduce((sum, s) => {
    const rec = reconciliations.get(s.shiftId);
    return sum + (rec?.totalChargedInCars || 0);
  }, 0);

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
          <img 
            src={logoUrl || '/logo-plaza-1.jpg'} 
            alt="Logo" 
            className="w-14 h-14 rounded-2xl object-contain bg-slate-800 border border-slate-700/60 shadow-lg p-1" 
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = '/logo-plaza-1.jpg';
            }} 
          />
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

      {/* COMPACT ALERT BANNER: DETECTED DUPLICATE CUTS */}
      {activeDuplicatesGroups.length > 0 && (
        <div className="p-3 bg-gradient-to-r from-amber-950/40 to-slate-900/80 border border-amber-500/30 rounded-2xl shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl shrink-0">
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">Re-emisión de Turno Detectada ({activeDuplicatesGroups.length} caso{activeDuplicatesGroups.length > 1 ? 's' : ''})</span>
                  <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/30">
                    Cálculo Protegido
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Se calcula el corte definitivo oficial y se excluyen duplicados para no duplicar dinero.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
              {activeDuplicatesGroups.map((group) => (
                <button
                  key={group.canonical.shiftId}
                  onClick={() => setComparingGroup(group)}
                  className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye size={13} /> Comparar Cortes
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Filters & Controls Panel (Mobile Compact + Horizontal Scroll) */}
      <div className="bg-slate-850/90 p-3 sm:p-3.5 rounded-2xl border border-slate-700/50 space-y-2.5">
        {/* Row 1: Date quick buttons with smooth horizontal scroll on mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 mr-1 shrink-0">
            <Filter size={12} className="text-blue-400" /> Periodo:
          </span>
          {[
            { id: 'HOY', label: 'Hoy' },
            { id: 'AYER', label: 'Ayer' },
            { id: '7_DIAS', label: '7 Días' },
            { id: 'MES_ACTUAL', label: 'Mes Actual' },
            { id: 'ULTIMO_MES', label: 'Último Mes' },
            { id: 'FECHA', label: 'Por Fecha' },
            { id: 'TODOS', label: 'Ver Todos' },
          ].map((btn) => {
            const isActive = filterMode === btn.id;
            return (
              <button
                key={btn.id}
                onClick={() => setFilterMode(btn.id as DateFilterMode | 'TODOS')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-900/90 text-slate-400 hover:text-white border border-slate-700/60'
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Row 2: Lot filter, date picker if active, hide duplicates, and density toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* ParkingLot Filter */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-slate-700/60">
              <Building2 size={13} className="text-blue-400 shrink-0" />
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
              <div className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-slate-700/60 animate-fade-in">
                <Calendar size={13} className="text-blue-400 shrink-0" />
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-transparent border-none text-white text-xs font-bold focus:outline-none cursor-pointer"
                />
              </div>
            )}

            {duplicatesInFilter.length > 0 && (
              <button
                onClick={() => setHideDuplicates(!hideDuplicates)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  hideDuplicates 
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
                    : 'bg-slate-900/90 text-slate-400 border-slate-700/60 hover:text-white'
                }`}
                title="Ocultar cortes anteriores que fueron re-emitidos"
              >
                {hideDuplicates ? <EyeOff size={12} /> : <Eye size={12} />}
                <span className="hidden sm:inline">{hideDuplicates ? 'Ocultando Re-emitidos' : 'Mostrar Re-emitidos'}</span>
                <span className="sm:hidden">{hideDuplicates ? 'Ocultando' : 'Mostrar Todos'}</span>
              </button>
            )}
          </div>

          {/* Density toggle for mobile: Compacto vs Detallado */}
          <div className="lg:hidden flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-700/60">
            <button
              onClick={() => setMobileViewMode('compact')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                mobileViewMode === 'compact'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Compacto
            </button>
            <button
              onClick={() => setMobileViewMode('detailed')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                mobileViewMode === 'detailed'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Detallado
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE COMPACT SUMMARY (< lg): High-Density Executive Ribbon */}
      <div className="lg:hidden bg-slate-850/90 border border-slate-700/60 rounded-2xl p-3 shadow-lg space-y-2">
        <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-750">
          <div className="flex items-center gap-1.5">
            <History size={13} className="text-blue-400" />
            <span className="font-bold text-white text-xs">{totalCutsCount} Turnos Registrados</span>
            {duplicatesInFilter.length > 0 && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                +{duplicatesInFilter.length} re-emitido
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Auditoría Ejecutiva</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* 1. Autos Cobrados */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Autos Cobrados</span>
              <Car size={13} className="text-cyan-400" />
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-black text-white">{totalCarsProcessed}</span>
              <span className="text-xs font-mono font-bold text-cyan-300">${totalCarsAmountPaid.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-slate-400 mt-0.5">En boletos de turno</span>
          </div>

          {/* 2. Debió Entregar (Esperado) */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Debió Entregar</span>
              <DollarSign size={13} className="text-slate-400" />
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-black text-slate-100">${totalExpectedAmount.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-slate-400 mt-0.5">Calculado por sistema</span>
          </div>

          {/* 3. Entregó al Final (Físico) */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Entregó Final</span>
              <CheckCircle size={13} className="text-emerald-400" />
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-lg font-black text-emerald-400">${totalActualAmount.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-emerald-500/80 mt-0.5">Efectivo físico entregado</span>
          </div>

          {/* 4. Diferencia de Cuadre */}
          <div className={`rounded-xl p-2.5 border flex flex-col justify-between ${
            totalDifferenceAmount === 0 
              ? 'bg-slate-900/90 border-slate-800/80' 
              : totalDifferenceAmount < 0 
                ? 'bg-red-950/25 border-red-500/40' 
                : 'bg-amber-950/20 border-amber-500/40'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Diferencia</span>
              <TrendingDown size={13} className={totalDifferenceAmount === 0 ? 'text-slate-400' : totalDifferenceAmount < 0 ? 'text-red-400' : 'text-amber-400'} />
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono">
              <span className={`text-lg font-black ${
                totalDifferenceAmount === 0 
                  ? 'text-emerald-400' 
                  : totalDifferenceAmount < 0 
                    ? 'text-red-400' 
                    : 'text-amber-400'
              }`}>
                {totalDifferenceAmount === 0 
                  ? '$0.00' 
                  : totalDifferenceAmount > 0 
                    ? `+$${totalDifferenceAmount.toFixed(2)}` 
                    : `-$${Math.abs(totalDifferenceAmount).toFixed(2)}`}
              </span>
              <span className={`text-[10px] font-bold uppercase ${
                totalDifferenceAmount === 0 ? 'text-emerald-400' : totalDifferenceAmount < 0 ? 'text-red-400' : 'text-amber-400'
              }`}>
                {totalDifferenceAmount === 0 ? '✓ Cuadra' : totalDifferenceAmount < 0 ? 'Faltante' : 'Sobrante'}
              </span>
            </div>
            <span className="text-[9px] text-slate-400 mt-0.5">Físico vs Esperado</span>
          </div>
        </div>
      </div>

      {/* DESKTOP METRICS SUMMARY CARDS (>= lg) */}
      <div className="hidden lg:grid lg:grid-cols-5 gap-3.5">
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
            {duplicatesInFilter.length > 0 ? (
              <span className="text-[10px] text-amber-400 font-semibold mt-0.5 block">
                +{duplicatesInFilter.length} re-emitido{duplicatesInFilter.length > 1 ? 's' : ''} excluido{duplicatesInFilter.length > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 mt-0.5 block">Cortes procesados</span>
            )}
          </div>
        </div>

        {/* Card 2: Autos Cobrados (Nuevo) */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Autos Cobrados</span>
            <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
              <Car size={16} />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-cyan-300 block">{totalCarsProcessed} autos</span>
            <span className="text-[10px] font-mono text-slate-300 mt-0.5 block">
              ${totalCarsAmountPaid.toFixed(2)} en boletos
            </span>
          </div>
        </div>

        {/* Card 3: Total Debió Entregar (Esperado) */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Debió Entregar (Esperado)</span>
            <div className="p-2.5 bg-slate-500/10 border border-slate-600/20 text-slate-300 rounded-xl">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-slate-200 block">${totalExpectedAmount.toFixed(2)}</span>
            {totalDuplicatesAmountSaved > 0 ? (
              <span className="text-[10px] text-emerald-400 font-semibold mt-0.5 block">
                -${totalDuplicatesAmountSaved.toFixed(2)} duplicados prevenidos
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 mt-0.5 block">Calculado por sistema</span>
            )}
          </div>
        </div>

        {/* Card 4: Total Entregado Real */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Entregó al Final (Físico)</span>
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold text-emerald-400 block">${totalActualAmount.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Efectivo físico entregado</span>
          </div>
        </div>

        {/* Card 5: Diferencia Total */}
        <div className="bg-slate-850 border border-slate-700/40 rounded-2xl p-4 flex flex-col justify-between shadow-lg col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">Diferencia de Cuadre</span>
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
          <>
            {/* MOBILE VIEW: Compact & Professional Audit Cards (< lg) */}
            <div className="lg:hidden p-2 sm:p-3 space-y-2.5">
              {filteredShifts.map((shift) => {
                const startDate = new Date(shift.startTime);
                const endDate = shift.endTime ? new Date(shift.endTime) : null;
                const hasDiscrepancy = shift.difference !== null && shift.difference !== 0;
                const isNegativeDiscrepancy = shift.difference !== null && shift.difference < 0;
                const lotId = shift.parkingLotId ?? 1;
                const isSuperseded = shift.isDuplicate;
                const isCanonical = shift.duplicateStatus === 'canonical';
                const rec = reconciliations.get(shift.shiftId);

                // Calculate duration
                const durationMs = (shift.endTime || Date.now()) - shift.startTime;
                const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

                const isExpanded = mobileViewMode === 'detailed' || !!expandedShiftIds[shift.shiftId];

                return (
                  <div
                    key={shift.shiftId}
                    className={`rounded-2xl transition-all border shadow-sm overflow-hidden ${
                      isSuperseded
                        ? 'bg-amber-950/20 border-amber-500/40'
                        : isCanonical
                          ? 'bg-slate-850 border-emerald-500/40'
                          : 'bg-slate-850 border-slate-750 hover:border-slate-600'
                    }`}
                  >
                    {/* Header Row: Cashier, Folio, Lot & Status */}
                    <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Cashier Avatar & Name */}
                        <div className="w-6 h-6 rounded-lg bg-blue-600/25 border border-blue-500/30 text-blue-300 flex items-center justify-center font-black text-[10px] uppercase shrink-0">
                          {shift.username.slice(0, 2)}
                        </div>
                        <span className="font-bold text-white text-xs truncate max-w-[90px] sm:max-w-[130px]">
                          @{shift.username}
                        </span>

                        {/* Shift ID with Copy Action */}
                        <button
                          onClick={() => copyShiftIdToClipboard(shift.shiftId)}
                          className="font-mono text-[11px] font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/20 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                          title="Copiar folio"
                        >
                          <span>{shift.shiftId}</span>
                          {copiedShiftId === shift.shiftId ? (
                            <Check size={10} className="text-emerald-400" />
                          ) : (
                            <Copy size={9} className="opacity-60" />
                          )}
                        </button>

                        {/* Lot Badge */}
                        <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/80 shrink-0 hidden sm:inline-block">
                          L#{lotId}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div className="shrink-0 flex items-center gap-1">
                        {isSuperseded ? (
                          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                            <AlertTriangle size={10} /> Re-emitido
                          </span>
                        ) : shift.isClosed ? (
                          <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700 flex items-center gap-1">
                            <CheckCircle size={10} className="text-emerald-400" /> Cerrado
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1 animate-pulse">
                            <Clock size={10} /> En curso
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Body: Ultra-Compact High-Density Metrics Capsule */}
                    <div className="p-2.5 sm:p-3 space-y-2">
                      {/* 4-Metric Grid */}
                      <div className="grid grid-cols-4 divide-x divide-slate-800 bg-slate-950/70 rounded-xl py-1.5 px-1 border border-slate-800 text-center">
                        {/* 1. Autos Cobrados */}
                        <div className="px-1 flex flex-col justify-center">
                          <span className="text-[9px] font-bold text-cyan-400 block uppercase tracking-wider">Autos</span>
                          <span className="text-sm font-black text-white block mt-0.5">
                            {rec?.carsCount || 0}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-cyan-300 block truncate">
                            ${(rec?.totalChargedInCars || 0).toFixed(0)}
                          </span>
                        </div>

                        {/* 2. Debió Entregar (Esperado) */}
                        <div className="px-1 flex flex-col justify-center">
                          <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Debió</span>
                          <span className="text-sm font-bold text-slate-200 block mt-0.5 font-mono truncate">
                            ${(shift.expectedAmount || 0).toFixed(0)}
                          </span>
                          <span className="text-[9px] text-slate-500 block truncate">Esperado</span>
                        </div>

                        {/* 3. Entregó al Final (Físico) */}
                        <div className="px-1 flex flex-col justify-center">
                          <span className="text-[9px] font-bold text-emerald-400 block uppercase tracking-wider">Entregó</span>
                          <span className="text-sm font-bold text-emerald-400 block mt-0.5 font-mono truncate">
                            {shift.actualAmount !== null ? `$${shift.actualAmount.toFixed(0)}` : '-'}
                          </span>
                          <span className="text-[9px] text-emerald-500/80 block truncate">Físico</span>
                        </div>

                        {/* 4. Diferencia */}
                        <div className="px-1 flex flex-col justify-center">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Diferencia</span>
                          <span className={`text-sm font-black font-mono block mt-0.5 truncate ${
                            shift.difference === null
                              ? 'text-slate-500'
                              : shift.difference === 0
                                ? 'text-emerald-400'
                                : isNegativeDiscrepancy
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                          }`}>
                            {shift.difference === null
                              ? '-'
                              : shift.difference === 0
                                ? '$0'
                                : shift.difference > 0
                                  ? `+$${shift.difference.toFixed(0)}`
                                  : `-$${Math.abs(shift.difference).toFixed(0)}`}
                          </span>
                          <span className={`text-[9px] font-bold block truncate ${
                            shift.difference === null
                              ? 'text-slate-500'
                              : shift.difference === 0
                                ? 'text-emerald-400'
                                : isNegativeDiscrepancy
                                  ? 'text-red-400'
                                  : 'text-amber-400'
                          }`}>
                            {shift.difference === null
                              ? 'Sin arqueo'
                              : shift.difference === 0
                                ? 'Cuadra'
                                : isNegativeDiscrepancy
                                  ? 'Faltante'
                                  : 'Sobrante'}
                          </span>
                        </div>
                      </div>

                      {/* Info Sub-strip: Time Range, Duration, Origin, Lot */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <Clock size={11} className="text-slate-500 shrink-0" />
                          <span className="truncate">
                            {startDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} {startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            {' → '}
                            {endDate ? endDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'En curso'}
                          </span>
                          <span className="text-slate-500 text-[10px] shrink-0">({durationHours}h {durationMinutes}m)</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="sm:hidden text-[9px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/80">
                            L#{lotId}
                          </span>
                          {shift.sourceCollection === 'cash_cuts' ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              Android
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                              Web
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Cashier Notes (if present) */}
                      {shift.notes && shift.notes.trim() ? (
                        <div className="bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] flex items-center gap-2">
                          <MessageSquare size={12} className="text-blue-400 shrink-0" />
                          <span className="text-slate-300 italic truncate">{shift.notes}</span>
                        </div>
                      ) : null}

                      {/* Expandable detailed drawer */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-800 space-y-1.5 text-xs animate-fade-in">
                          <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/90 space-y-1.5">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-400">Estacionamiento:</span>
                              <span className="font-bold text-white">Lote #{lotId}: {getLotName(lotId)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-400">Total autos cobrados:</span>
                              <span className="font-bold text-white">{rec?.carsCount || 0} vehículos</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-400">Total cobrado en boletos:</span>
                              <span className="font-mono font-bold text-cyan-300">${(rec?.totalChargedInCars || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-400">Debió entregar (sistema):</span>
                              <span className="font-mono font-bold text-slate-200">${(shift.expectedAmount || 0).toFixed(2)}</span>
                            </div>
                            {rec && rec.carsCount > 0 && !rec.matchesExpected && (
                              <div className="flex justify-between items-center text-[11px]">
                                <span className="text-slate-400">Diferencia vs boletos:</span>
                                <span className={rec.differenceToExpected > 0 ? 'text-blue-300 font-bold' : 'text-amber-400 font-bold'}>
                                  {rec.differenceToExpected > 0 
                                    ? `+$${rec.differenceToExpected.toFixed(2)} (fondo/extra)` 
                                    : `-$${Math.abs(rec.differenceToExpected).toFixed(2)} (menor a boletos)`}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-slate-400">Efectivo físico entregado:</span>
                              <span className="font-mono font-bold text-emerald-400">
                                {shift.actualAmount !== null ? `$${shift.actualAmount.toFixed(2)}` : 'Sin arqueo'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-800">
                              <span className="text-slate-400">Diferencia de cuadre:</span>
                              <span className={`font-mono font-bold ${
                                shift.difference === null 
                                  ? 'text-slate-400' 
                                  : shift.difference === 0 
                                    ? 'text-emerald-400' 
                                    : isNegativeDiscrepancy 
                                      ? 'text-red-400' 
                                      : 'text-amber-400'
                              }`}>
                                {shift.difference === null 
                                  ? 'Pendiente' 
                                  : shift.difference === 0 
                                    ? '✓ $0.00 (Cuadrado)' 
                                    : shift.difference > 0 
                                      ? `+$${shift.difference.toFixed(2)} (Sobrante)` 
                                      : `-$${Math.abs(shift.difference).toFixed(2)} (Faltante)`}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Card Action Bar (Sleek, Compact, Ergonomic) */}
                      <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/80">
                        <button
                          onClick={() => setSelectedShiftForTickets(shift)}
                          className="flex-1 py-1.5 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-all cursor-pointer min-h-[36px]"
                        >
                          <Car size={14} />
                          <span>Ver {rec?.carsCount || 0} Boletos</span>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleExpandShift(shift.shiftId)}
                            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition-all cursor-pointer"
                            title={isExpanded ? 'Contraer detalles' : 'Expandir detalles'}
                          >
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>

                          <button
                            onClick={() => openEditModal(shift)}
                            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition-all cursor-pointer"
                            title="Editar arqueo y notas"
                          >
                            <Edit3 size={14} />
                          </button>

                          {isSuperseded && shift.supersededBy && (
                            <button
                              onClick={() => {
                                const canonical = shifts.find(s => s.shiftId === shift.supersededBy);
                                if (canonical) {
                                  setComparingGroup({ canonical, superseded: [shift] });
                                }
                              }}
                              className="w-9 h-9 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 flex items-center justify-center border border-amber-500/40 transition-all cursor-pointer"
                              title="Comparar re-emisión"
                            >
                              <Eye size={14} />
                            </button>
                          )}

                          <button
                            onClick={() => handleDeleteShift(shift)}
                            className="w-9 h-9 rounded-xl bg-red-600/15 hover:bg-red-600/25 text-red-400 flex items-center justify-center border border-red-500/30 transition-all cursor-pointer"
                            title="Eliminar corte"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP VIEW: Comprehensive Audit Table (>= lg) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-xs font-bold uppercase tracking-wider bg-slate-800/40">
                  <th className="py-4 px-5 font-mono">ID Registro</th>
                  <th className="py-4 px-4">Estacionamiento</th>
                  <th className="py-4 px-3 text-center">Tipo</th>
                  <th className="py-4 px-4">Cajero</th>
                  <th className="py-4 px-4">Inicio / Fin</th>
                  <th className="py-4 px-4">Autos Cobrados</th>
                  <th className="py-4 px-4">Debió Entregar (Esperado)</th>
                  <th className="py-4 px-4">Entregó al Final (Físico)</th>
                  <th className="py-4 px-4">Diferencia</th>
                  <th className="py-4 px-4">Observaciones</th>
                  <th className="py-4 px-3 text-center">Estado</th>
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

                  // Reconciliation with parking tickets
                  const rec = reconciliations.get(shift.shiftId);

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
                      <td className="py-4 px-3 text-center">
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
                      <td className="py-4 px-4 text-slate-400">
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

                      {/* Autos Cobrados (Nuevo) */}
                      <td className="py-4 px-4">
                        {rec && rec.carsCount > 0 ? (
                          <div className="flex flex-col items-start gap-1">
                            <button
                              onClick={() => setSelectedShiftForTickets(shift)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 hover:border-blue-400 transition-all cursor-pointer group"
                              title="Haz clic para ver la lista de autos cobrados en este turno"
                            >
                              <Car size={13} className="shrink-0 text-blue-400 group-hover:scale-110 transition-transform" />
                              <span>{rec.carsCount} autos</span>
                            </button>
                            <span className="text-[10px] font-mono text-slate-400">
                              ${rec.totalChargedInCars.toFixed(2)} en boletos
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col text-slate-500">
                            <span className="text-xs italic">0 autos</span>
                            <span className="text-[10px]">Sin boletos</span>
                          </div>
                        )}
                      </td>

                      {/* Debió Entregar (Esperado por sistema) */}
                      <td className="py-4 px-4 font-mono">
                        {isSuperseded ? (
                          <div className="flex flex-col">
                            <span className="line-through text-slate-500">${(shift.expectedAmount || 0).toFixed(2)}</span>
                            <span className="text-[9px] text-amber-400 font-sans">Re-emitido</span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-slate-200 font-bold text-sm">
                              ${(shift.expectedAmount || 0).toFixed(2)}
                            </span>
                            {rec && rec.carsCount > 0 && (
                              rec.matchesExpected ? (
                                <span className="text-[10px] text-emerald-400 font-sans font-semibold">
                                  ✓ Coincide con boletos
                                </span>
                              ) : rec.differenceToExpected > 0 ? (
                                <span className="text-[10px] text-blue-400 font-sans font-medium" title="El sistema esperaba más dinero que los boletos cobrados, típicamente por fondo inicial de caja">
                                  +${rec.differenceToExpected.toFixed(2)} fondo/extra
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-400 font-sans font-medium">
                                  -${Math.abs(rec.differenceToExpected).toFixed(2)} vs boletos
                                </span>
                              )
                            )}
                          </div>
                        )}
                      </td>

                      {/* Entregó al Final (Físico) */}
                      <td className="py-4 px-4 font-mono">
                        {isSuperseded ? (
                          <div className="flex flex-col">
                            <span className="line-through text-slate-500">${shift.actualAmount !== null ? shift.actualAmount.toFixed(2) : '-'}</span>
                            <span className="text-[9px] text-amber-400 font-sans">Protegido</span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-white font-bold text-sm">
                              ${shift.actualAmount !== null ? shift.actualAmount.toFixed(2) : '-'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-sans">
                              {shift.actualAmount !== null ? 'Entregado en mano' : 'Por entregar'}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Diferencia (Cuadre) */}
                      <td className="py-4 px-4">
                        {shift.difference !== null ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[11px] font-bold border
                            ${shift.difference === 0 
                              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' 
                              : isNegativeDiscrepancy 
                                ? 'text-red-400 bg-red-400/10 border-red-500/30 font-extrabold animate-pulse' 
                                : 'text-amber-400 bg-amber-400/10 border-amber-400/20'}`}>
                            {shift.difference === 0 
                              ? '✓ $0.00 (Cuadrado)' 
                              : shift.difference > 0 
                                ? `+$${shift.difference.toFixed(2)} (Sobrante)` 
                                : `-$${Math.abs(shift.difference).toFixed(2)} (Faltante)`}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* Observaciones */}
                      <td className="py-4 px-4 max-w-[200px]">
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
                      <td className="py-4 px-3 text-center">
                        {isSuperseded ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30">
                            Reemplazado
                          </span>
                        ) : shift.isClosed ? (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-slate-400 bg-slate-400/10 px-2 py-0.5 rounded-full border border-slate-400/20">
                            Cerrado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-wider uppercase text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                            Abierto
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botón Ver autos cobrados */}
                          <button
                            onClick={() => setSelectedShiftForTickets(shift)}
                            className="p-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-lg transition-all cursor-pointer"
                            title="Ver detalle y boletos de autos cobrados"
                          >
                            <Car size={13} />
                          </button>

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
        </>
      ) : (
          <div className="py-16 px-4 text-center space-y-4 max-w-lg mx-auto">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-800 border border-slate-700/70 flex items-center justify-center text-slate-400 shadow-inner">
              <History size={26} />
            </div>
            
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Base de datos en línea y sincronizada
              </div>
              <h3 className="text-base font-bold text-white">
                {filterMode === 'HOY' 
                  ? 'Sin cortes ni turnos registrados el día de hoy todavía' 
                  : 'Sin cortes de caja en el período seleccionado'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {filterMode === 'HOY'
                  ? 'La base de datos está operando normalmente. En cuanto un cajero abra un turno o realice un corte hoy, se reflejará aquí en tiempo real de forma automática.'
                  : 'Modifica los filtros o selecciona otra fecha para consultar los registros anteriores.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {filterMode !== 'AYER' && (
                <button
                  onClick={() => setFilterMode('AYER')}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold transition-all cursor-pointer"
                >
                  Ver Cortes de Ayer
                </button>
              )}
              {filterMode !== '7_DIAS' && (
                <button
                  onClick={() => setFilterMode('7_DIAS')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Ver Últimos 7 Días
                </button>
              )}
              {filterMode !== 'TODOS' && (
                <button
                  onClick={() => setFilterMode('TODOS')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Ver Todos los Registros
                </button>
              )}
            </div>
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

      {/* Shift Tickets Reconciliation Modal */}
      {selectedShiftForTickets && (
        <ShiftTicketsModal
          shift={selectedShiftForTickets}
          records={records}
          onClose={() => setSelectedShiftForTickets(null)}
          getLotName={getLotName}
        />
      )}
    </div>
  );
}
