import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { ParkingRecord, UserShift, VehicleTypeRate, User } from '../types';
import { analyzeShiftDuplicates } from '../lib/shiftDeduplication';
import { 
  Car, 
  TrendingUp, 
  Users, 
  DollarSign, 
  Clock, 
  PieChart as PieIcon, 
  CreditCard, 
  CheckCircle, 
  Loader2, 
  Database,
  AlertTriangle,
  ChevronRight,
  X,
  Info,
  History,
  TrendingDown,
  Calendar,
  LogOut,
  Check,
  Key,
  Copy,
  RefreshCw
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import DemoSeeder from './DemoSeeder';
import { computeDateRange, DateFilterMode } from '../lib/dateRanges';
import { useAppLogo } from '../lib/appConfig';

interface DashboardViewProps {
  currentUser?: User | null;
}

export default function DashboardView({ currentUser }: DashboardViewProps) {
  const { logoUrl, defaultLogo } = useAppLogo();
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [userShifts, setUserShifts] = useState<UserShift[]>([]);
  const [cashCuts, setCashCuts] = useState<UserShift[]>([]);
  const [rates, setRates] = useState<VehicleTypeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueMode, setRevenueMode] = useState<'REAL' | 'FISICO' | 'TEORICO'>('REAL');
  const [showCutsModal, setShowCutsModal] = useState(false);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('HOY');
  const [customDate, setCustomDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Exit Vehicle Modal state
  const [exitRecord, setExitRecord] = useState<ParkingRecord | null>(null);
  const [exitChargeMode, setExitChargeMode] = useState<'CON_COBRO' | 'SIN_COBRO'>('CON_COBRO');
  const [exitAmountPaid, setExitAmountPaid] = useState<number | ''>(0);
  const [exitPaymentMethod, setExitPaymentMethod] = useState<'Efectivo' | 'Tarjeta'>('Efectivo');
  const [exitNotes, setExitNotes] = useState<string>('');
  const [submittingExit, setSubmittingExit] = useState(false);

  // Dynamic weekly permission code from permission_codes/current -> CodigoPermiso
  const [permissionCode, setPermissionCode] = useState<string | null>(null);
  const [copiedPermissionCode, setCopiedPermissionCode] = useState(false);
  const [generatingPermissionCode, setGeneratingPermissionCode] = useState(false);

  useEffect(() => {
    const db = getDb();
    const unsubCode = onSnapshot(
      doc(db, 'permission_codes', 'current'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const codeVal = data?.CodigoPermiso ?? data?.codigoPermiso ?? data?.code ?? null;
          setPermissionCode(codeVal !== null && codeVal !== undefined ? String(codeVal) : null);
        } else {
          setPermissionCode(null);
        }
      },
      (err) => {
        console.error('Error listening to permission_codes/current:', err);
      }
    );
    return unsubCode;
  }, []);

  const handleCopyPermissionCode = () => {
    if (!permissionCode) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(permissionCode);
      setCopiedPermissionCode(true);
      setTimeout(() => setCopiedPermissionCode(false), 2000);
    }
  };

  const handleGenerateNewPermissionCode = async () => {
    if (generatingPermissionCode) return;
    setGeneratingPermissionCode(true);
    try {
      const db = getDb();
      let newCode = String(Math.floor(1000 + Math.random() * 9000));
      if (newCode === permissionCode) {
        newCode = String(Math.floor(1000 + Math.random() * 9000));
      }
      await setDoc(
        doc(db, 'permission_codes', 'current'),
        {
          CodigoPermiso: newCode,
          updatedAt: Date.now()
        },
        { merge: true }
      );
      setPermissionCode(newCode);
    } catch (err) {
      console.error('Error generating new permission code:', err);
    } finally {
      setGeneratingPermissionCode(false);
    }
  };

  // Load rates
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
    }, (error) => {
      console.error('Error fetching rates:', error);
    });
    return unsub;
  }, []);

  // Listen to parking records in real-time
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(collection(db, 'parking_records'), (snap) => {
      const list: ParkingRecord[] = [];
      snap.forEach((doc) => {
        list.push({ ticketCode: doc.id, ...doc.data() } as ParkingRecord);
      });
      setRecords(list);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to parking records:', error);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Listen to user_shifts in real-time
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(collection(db, 'user_shifts'), (snap) => {
      const list: UserShift[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        list.push({
          shiftId: doc.id,
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
        } as UserShift);
      });
      setUserShifts(list);
    }, (error) => {
      console.error('Error listening to user_shifts:', error);
    });
    return unsub;
  }, []);

  // Listen to cash_cuts in real-time
  useEffect(() => {
    const db = getDb();
    const unsub = onSnapshot(collection(db, 'cash_cuts'), (snap) => {
      const list: UserShift[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        list.push({
          shiftId: doc.id,
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
        } as UserShift);
      });
      setCashCuts(list);
    }, (error) => {
      console.error('Error listening to cash_cuts:', error);
    });
    return unsub;
  }, []);

  // Merge shifts and cuts in useMemo with deduplication
  const shifts = React.useMemo(() => {
    const merged: UserShift[] = [...cashCuts];
    const seenIds = new Set<string>(cashCuts.map(c => c.shiftId));
    userShifts.forEach(s => {
      if (!seenIds.has(s.shiftId)) {
        merged.push(s);
      }
    });
    return analyzeShiftDuplicates(merged).deduplicatedShifts;
  }, [userShifts, cashCuts]);

  // Calculations
  const activeRecords = React.useMemo(() => {
    return records
      .filter(r => r.status === 'ACTIVE')
      .sort((a, b) => (b.entryTime || 0) - (a.entryTime || 0));
  }, [records]);
  const activeCount = activeRecords.length;

  // Open manual exit modal for an active vehicle
  const openExitVehicleModal = (rec: ParkingRecord) => {
    setExitRecord(rec);
    const nowMs = Date.now();
    const elapsedMs = Math.max(0, nowMs - (rec.entryTime || nowMs));
    const matchedRate = rates.find(r => r.typeName.toLowerCase() === (rec.vehicleType || '').toLowerCase())
      || rates.find(r => r.isDefault)
      || { hourlyRate: 15 };
    const elapsedHrs = Math.max(1, Math.ceil(elapsedMs / 3600000));
    const suggestedFee = rec.paidAtEntry ? (rec.amountPaid || 0) : elapsedHrs * matchedRate.hourlyRate;

    setExitChargeMode('CON_COBRO');
    setExitAmountPaid(suggestedFee);
    setExitPaymentMethod(rec.paymentMethod || 'Efectivo');
    setExitNotes(rec.description || '');
  };

  // Process exit for active vehicle (either with payment or $0 non-accounted adjustment)
  const handleConfirmExitVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitRecord || submittingExit) return;

    setSubmittingExit(true);
    try {
      const db = getDb();
      const recordRef = doc(db, 'parking_records', exitRecord.ticketCode);
      const numericAmount = exitChargeMode === 'SIN_COBRO' ? 0 : Math.max(0, Number(exitAmountPaid) || 0);
      const isNoCharge = exitChargeMode === 'SIN_COBRO' || numericAmount === 0;

      const updatePayload: Record<string, any> = {
        exitTime: Date.now(),
        amountPaid: numericAmount,
        paymentMethod: isNoCharge ? null : exitPaymentMethod,
        status: 'COMPLETED',
        processedBy: currentUser?.username || 'admin',
        description: exitNotes.trim() || (isNoCharge ? 'Salida sin cobro ($0 - Ajuste)' : ''),
        excludeFromAccounting: isNoCharge
      };

      if (isNoCharge) {
        updatePayload.shiftId = null;
      }

      await updateDoc(recordRef, updatePayload);
      setExitRecord(null);
    } catch (err) {
      console.error('Error al dar salida al vehículo:', err);
    } finally {
      setSubmittingExit(false);
    }
  };

  // Active Date Range based on selected filter
  const dateRange = React.useMemo(() => {
    return computeDateRange(dateFilterMode, customDate);
  }, [dateFilterMode, customDate]);

  // Completed records in selected date range (considers collection time if paidAtEntry, excludes $0 adjustments)
  const completedInPeriod = React.useMemo(() => {
    return records.filter(r => {
      if (r.status !== 'COMPLETED') return false;
      if (r.excludeFromAccounting) return false;
      const transactionTime = (r.paidAtEntry && r.entryTime) ? r.entryTime : (r.exitTime || r.entryTime);
      return transactionTime !== null && transactionTime !== undefined &&
        transactionTime >= dateRange.start && transactionTime <= dateRange.end;
    });
  }, [records, dateRange]);

  // 1. Boletos registrados como cobrados en sistema en el período (monto teórico)
  const theoreticalEarningsInPeriod = React.useMemo(() => {
    return completedInPeriod.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  }, [completedInPeriod]);

  // 2. Cortes de caja del período (excluyendo duplicados para no inflar métricas)
  const periodCuts = React.useMemo(() => {
    return shifts.filter(s => {
      if (!s.isClosed || s.isDuplicate) return false;
      const cutTimestamp = s.endTime || s.startTime;
      return cutTimestamp ? (cutTimestamp >= dateRange.start && cutTimestamp <= dateRange.end) : false;
    });
  }, [shifts, dateRange]);

  // Análisis de cortes del período: físico entregado, esperado y saldos negativos / faltantes
  const { 
    cutsActualDelivered, 
    cutsExpectedAmount, 
    totalSaldosNegativos, 
    negativeCuts,
    totalSobrantes,
    totalDiferenciaCortes 
  } = React.useMemo(() => {
    let actual = 0;
    let expected = 0;
    let negTotal = 0;
    let posTotal = 0;
    let netDiff = 0;
    const negList: typeof periodCuts = [];

    periodCuts.forEach(s => {
      actual += (s.actualAmount || 0);
      expected += (s.expectedAmount || 0);

      const diff = s.difference !== null && s.difference !== undefined 
        ? s.difference 
        : ((s.actualAmount !== null && s.actualAmount !== undefined) ? (s.actualAmount - (s.expectedAmount || 0)) : 0);
      
      netDiff += diff;
      if (diff < 0) {
        negTotal += diff;
        negList.push(s);
      } else if (diff > 0) {
        posTotal += diff;
      }
    });

    return {
      cutsActualDelivered: actual,
      cutsExpectedAmount: expected,
      totalSaldosNegativos: negTotal, // número negativo ej. -75
      negativeCuts: negList,
      totalSobrantes: posTotal,
      totalDiferenciaCortes: netDiff
    };
  }, [periodCuts]);

  // Ingreso Real del período:
  // Tomamos los boletos cobrados en el sistema y descontamos los faltantes / saldos negativos de los cortes cerrados.
  // Así evitamos sumar ingresos de cortes que cerraron en negativo (dinero que no ingresó a caja).
  const realEarningsInPeriod = Math.max(0, theoreticalEarningsInPeriod + totalSaldosNegativos);

  // Monto a mostrar según el modo seleccionado
  const displayRevenue = revenueMode === 'REAL' 
    ? realEarningsInPeriod 
    : revenueMode === 'FISICO' 
      ? cutsActualDelivered 
      : theoreticalEarningsInPeriod;

  // Smart calculation for Active Cashiers:
  // 1. Cashiers who have an explicitly open shift in shifts state
  // 2. PLUS cashiers who have registered/processed a ticket within the last 12 hours and do not have a closed shift after that
  const activeCashiersCount = React.useMemo(() => {
    const activeSet = new Set<string>();
    
    // Check open shifts
    shifts.forEach(s => {
      if (!s.isClosed && s.username) {
        activeSet.add(s.username);
      }
    });

    // Check recent ticket activity (last 12 hours)
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
    records.forEach(r => {
      if (r.entryTime && r.entryTime >= twelveHoursAgo) {
        if (r.registeredBy) {
          const hasClosedShiftAfter = shifts.some(s => s.username === r.registeredBy && s.isClosed && s.endTime && s.endTime > r.entryTime);
          if (!hasClosedShiftAfter) {
            activeSet.add(r.registeredBy);
          }
        }
      }
      if (r.exitTime && r.exitTime >= twelveHoursAgo) {
        if (r.processedBy) {
          const hasClosedShiftAfter = shifts.some(s => s.username === r.processedBy && s.isClosed && s.endTime && s.endTime > r.exitTime);
          if (!hasClosedShiftAfter) {
            activeSet.add(r.processedBy);
          }
        }
      }
    });

    return activeSet.size;
  }, [shifts, records]);

  // Chart data: Distribution by Vehicle Type in period
  const vehicleTypeCounts: { [key: string]: number } = {};
  const recordsForVehiclePie = completedInPeriod.length > 0 ? completedInPeriod : records;
  recordsForVehiclePie.forEach(r => {
    const type = r.vehicleType || 'Auto';
    vehicleTypeCounts[type] = (vehicleTypeCounts[type] || 0) + 1;
  });

  const pieData = Object.entries(vehicleTypeCounts).map(([name, value]) => ({
    name,
    value
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  // Chart data: Preferred Payment Methods for period
  let cashCount = 0;
  let cardCount = 0;
  completedInPeriod.forEach(r => {
    if (r.paymentMethod === 'Efectivo') cashCount++;
    if (r.paymentMethod === 'Tarjeta') cardCount++;
  });

  const paymentData = [
    { name: 'Efectivo', cantidad: cashCount, monto: completedInPeriod.filter(r => r.paymentMethod === 'Efectivo').reduce((s, r) => s + (r.amountPaid || 0), 0) },
    { name: 'Tarjeta', cantidad: cardCount, monto: completedInPeriod.filter(r => r.paymentMethod === 'Tarjeta').reduce((s, r) => s + (r.amountPaid || 0), 0) }
  ];

  // Timeline Chart Data:
  // If single day (Hoy, Ayer, or manual date): 24 hourly buckets
  // If multi-day (7 días, mes actual, último mes): Daily trend buckets
  const timelineChartData = React.useMemo(() => {
    if (dateRange.isSingleDay) {
      const hourlyDataMap: { [hour: number]: { label: string; ingresos: number; autos: number } } = {};
      for (let h = 0; h < 24; h++) {
        hourlyDataMap[h] = {
          label: `${h.toString().padStart(2, '0')}:00`,
          ingresos: 0,
          autos: 0
        };
      }

      records.forEach(r => {
        if (r.entryTime && r.entryTime >= dateRange.start && r.entryTime <= dateRange.end) {
          const entryHour = new Date(r.entryTime).getHours();
          if (entryHour >= 0 && entryHour < 24) {
            hourlyDataMap[entryHour].autos += 1;
          }
        }
        if (r.status === 'COMPLETED') {
          const transTime = (r.paidAtEntry && r.entryTime) ? r.entryTime : (r.exitTime || r.entryTime);
          if (transTime && transTime >= dateRange.start && transTime <= dateRange.end) {
            const transHour = new Date(transTime).getHours();
            if (transHour >= 0 && transHour < 24) {
              hourlyDataMap[transHour].ingresos += (r.amountPaid || 0);
            }
          }
        }
      });

      return Object.values(hourlyDataMap);
    } else {
      // Build daily buckets from dateRange.start to dateRange.end
      const dailyBuckets: { [dayKey: string]: { label: string; ingresos: number; autos: number; timestamp: number } } = {};
      const cur = new Date(dateRange.start);
      while (cur.getTime() <= dateRange.end) {
        const key = `${cur.getFullYear()}-${cur.getMonth() + 1}-${cur.getDate()}`;
        const dayLabel = cur.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
        dailyBuckets[key] = {
          label: dayLabel,
          ingresos: 0,
          autos: 0,
          timestamp: cur.getTime()
        };
        cur.setDate(cur.getDate() + 1);
      }

      records.forEach(r => {
        if (r.entryTime && r.entryTime >= dateRange.start && r.entryTime <= dateRange.end) {
          const d = new Date(r.entryTime);
          const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
          if (dailyBuckets[key]) {
            dailyBuckets[key].autos += 1;
          }
        }
        if (r.status === 'COMPLETED') {
          const transTime = (r.paidAtEntry && r.entryTime) ? r.entryTime : (r.exitTime || r.entryTime);
          if (transTime && transTime >= dateRange.start && transTime <= dateRange.end) {
            const d = new Date(transTime);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
            if (dailyBuckets[key]) {
              dailyBuckets[key].ingresos += (r.amountPaid || 0);
            }
          }
        }
      });

      return Object.values(dailyBuckets);
    }
  }, [dateRange, records]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 size={40} className="animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-medium">Sincronizando panel con Firestore...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-1.5 md:p-3 max-w-7xl mx-auto">
      {/* Header and Quick Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img 
            src={logoUrl || defaultLogo} 
            alt="Logo" 
            className="w-14 h-14 rounded-2xl object-contain bg-slate-800 border border-slate-700/60 shadow-lg p-1" 
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = defaultLogo;
            }} 
          />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Panel de Control</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Código de Permiso Dinámico (permission_codes/current -> CodigoPermiso) */}
          <div className="flex items-center gap-2.5 bg-slate-800/90 border border-amber-500/30 px-3.5 py-2 rounded-2xl shadow-lg">
            <div className="p-1.5 bg-amber-500/15 border border-amber-500/30 text-amber-400 rounded-xl shrink-0">
              <Key size={15} />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                Código de Permiso
              </span>
              <span className="font-mono font-extrabold text-sm text-amber-300 tracking-wider mt-0.5">
                {permissionCode || 'Sin código'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 ml-1">
              {permissionCode && (
                <button
                  onClick={handleCopyPermissionCode}
                  title="Copiar Código de Permiso"
                  className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${
                    copiedPermissionCode
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {copiedPermissionCode ? (
                    <>
                      <Check size={14} className="text-emerald-400" />
                      <span className="text-[10px]">Copiado</span>
                    </>
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              )}
              <button
                onClick={handleGenerateNewPermissionCode}
                disabled={generatingPermissionCode}
                title="Generar nuevo Código de Permiso"
                className="p-2 rounded-xl border bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-300 hover:text-amber-200 transition-all cursor-pointer flex items-center gap-1 text-xs font-bold disabled:opacity-50"
              >
                <RefreshCw size={14} className={generatingPermissionCode ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-4 py-2.5 rounded-2xl text-xs text-emerald-400 font-semibold w-fit shadow-md">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            Sincronizado con Android
          </div>
        </div>
      </div>

      {/* Demo Seeder (Only shown if records are empty) */}
      {records.length === 0 && (
        <DemoSeeder />
      )}

      {/* Selector de Período de Ingresos y Métricas */}
      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
            <Calendar size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Filtrar Ingresos y Actividad</h3>
            <p className="text-xs text-slate-400">
              Período actual: <span className="text-blue-400 font-semibold">{dateRange.label}</span>
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'HOY', label: 'Hoy' },
            { id: 'AYER', label: 'Ayer' },
            { id: '7_DIAS', label: 'Últimos 7 días' },
            { id: 'MES_ACTUAL', label: 'Mes actual' },
            { id: 'ULTIMO_MES', label: 'Último mes' },
            { id: 'FECHA', label: 'Por fecha' },
          ].map((btn) => {
            const isActive = dateFilterMode === btn.id;
            return (
              <button
                key={btn.id}
                onClick={() => setDateFilterMode(btn.id as DateFilterMode)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-400/40'
                    : 'bg-slate-900/60 text-slate-300 hover:text-white hover:bg-slate-700/50 border border-slate-700/50'
                }`}
              >
                {btn.label}
              </button>
            );
          })}

          {dateFilterMode === 'FECHA' && (
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-blue-500/40 animate-fade-in">
              <Calendar size={13} className="text-blue-400 shrink-0" />
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="bg-transparent border-none text-white text-xs font-bold focus:outline-none cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* Indicador de base de datos en línea cuando hoy aún no tiene registros */}
      {dateFilterMode === 'HOY' && completedInPeriod.length === 0 && periodCuts.length === 0 && activeCount === 0 && !loading && (
        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-fade-in shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-slate-300">
              <strong className="text-white">Base de datos en línea y sincronizada:</strong> No hay registros generados hoy todavía (los datos se reflejarán automáticamente en cuanto se abra turno o cobren boletos).
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setDateFilterMode('AYER')}
              className="px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-semibold cursor-pointer transition-all"
            >
              Consultar Ayer
            </button>
            <button
              onClick={() => setDateFilterMode('7_DIAS')}
              className="px-3 py-1.5 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 border border-slate-600/50 font-semibold cursor-pointer transition-all"
            >
              Últimos 7 días
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Active Vehicles */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300 flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-8 bg-blue-500/5 rounded-full translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform pointer-events-none" />
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Autos Estacionados</span>
              <div className="flex items-baseline gap-2.5">
                <h3 className="text-3xl font-extrabold text-white">{activeCount}</h3>
                <p className="text-[11px] text-blue-400 font-medium">Vehículos activos en el recinto</p>
              </div>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl shrink-0">
              <Car size={24} />
            </div>
          </div>

          {/* Lista compacta de tickets estacionados con botón de darle salida */}
          <div className="mt-4 pt-3 border-t border-slate-700/50">
            {activeRecords.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {activeRecords.map((rec) => {
                  const elapsedMin = Math.max(0, Math.floor((Date.now() - rec.entryTime) / 60000));
                  const hours = Math.floor(elapsedMin / 60);
                  const mins = elapsedMin % 60;
                  const elapsedStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                  return (
                    <div
                      key={rec.ticketCode}
                      className="flex items-center justify-between gap-2 bg-slate-900/75 border border-slate-700/60 rounded-xl px-3 py-2 text-xs hover:border-blue-500/40 transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-blue-400 shrink-0" title="Número de Ticket">
                          #{rec.ticketCode}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-950 border border-slate-700 text-white font-mono rounded font-bold text-[11px] truncate">
                          {rec.plate}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {elapsedStr}
                        </span>
                      </div>

                      <button
                        onClick={() => openExitVehicleModal(rec)}
                        title={`Dar salida al ticket ${rec.ticketCode}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-[11px] font-bold transition-all cursor-pointer shrink-0"
                      >
                        <LogOut size={13} />
                        <span>Salida</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                Sin autos estacionados en este momento
              </p>
            )}
          </div>
        </div>

        {/* KPI 2: Revenue in period */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 p-8 bg-emerald-500/5 rounded-full translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform" />
          <div className="flex items-start justify-between">
            <div className="space-y-2 w-full pr-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {revenueMode === 'REAL' 
                    ? `Ingresos Reales (${dateRange.shortLabel})` 
                    : revenueMode === 'FISICO' 
                      ? `Efectivo Entregado (${dateRange.shortLabel})` 
                      : `Boletos en Sistema (${dateRange.shortLabel})`}
                </span>
              </div>
              <h3 className={`text-3xl font-extrabold ${revenueMode === 'REAL' ? 'text-emerald-400' : revenueMode === 'FISICO' ? 'text-blue-400' : 'text-slate-200'}`}>
                ${displayRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>

              {/* Selector de modo de cálculo */}
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  onClick={() => setRevenueMode('REAL')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    revenueMode === 'REAL' 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' 
                      : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-700/40'
                  }`}
                  title="Ingreso real: descuenta los saldos negativos de cortes para no sumar dinero no entregado"
                >
                  Real (Ajustado)
                </button>
                <button
                  onClick={() => setRevenueMode('FISICO')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    revenueMode === 'FISICO' 
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm' 
                      : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-700/40'
                  }`}
                  title="Efectivo físico entregado en cortes cerrados"
                >
                  Físico en Cortes
                </button>
                <button
                  onClick={() => setRevenueMode('TEORICO')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    revenueMode === 'TEORICO' 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                      : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-700/40'
                  }`}
                  title="Suma bruta de boletos completados en el período"
                >
                  Teórico Boletos
                </button>
              </div>

              {/* Alerta interactiva de saldos negativos o resumen */}
              {negativeCuts.length > 0 ? (
                <div className="pt-2 border-t border-slate-700/40">
                  <button
                    onClick={() => setShowCutsModal(true)}
                    className="flex items-center gap-1.5 text-[11px] text-red-400 hover:text-red-300 font-medium transition-colors cursor-pointer text-left group/btn"
                  >
                    <AlertTriangle size={13} className="shrink-0 text-red-400" />
                    <span>
                      {negativeCuts.length} corte(s) con saldo negativo (<strong className="font-bold text-red-300">-${Math.abs(totalSaldosNegativos).toFixed(2)}</strong>) deducidos
                    </span>
                    <ChevronRight size={12} className="shrink-0 group-hover/btn:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 font-medium pt-1">
                  Suma de <span className="font-bold text-slate-300">{completedInPeriod.length}</span> tickets pagados en este período
                </p>
              )}
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
              <DollarSign size={24} />
            </div>
          </div>
        </div>

        {/* KPI 3: Active Cashiers */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-purple-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 p-8 bg-purple-500/5 rounded-full translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform" />
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Cajeros Activos</span>
              <h3 className="text-3xl font-extrabold text-white">{activeCashiersCount}</h3>
              <p className="text-[11px] text-purple-400 font-medium">Turnos abiertos en este momento</p>
            </div>
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl">
              <Users size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Chart: Hourly or Daily Activity */}
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-6 shadow-xl lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h4 className="font-bold text-white text-md">
                {dateRange.isSingleDay 
                  ? `Flujo e Ingresos por Hora (${dateRange.label})` 
                  : `Tendencia de Ingresos y Flujo Diario (${dateRange.label})`}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                {dateRange.isSingleDay 
                  ? 'Entradas de vehículos y cobro registrado hora por hora' 
                  : 'Comportamiento diario de recaudación y entradas en el período seleccionado'}
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-blue-400 font-medium">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm" />
                Ingresos ($)
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
                {dateRange.isSingleDay ? 'Autos Entrados' : 'Autos Totales'}
              </span>
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorAutos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis 
                  dataKey="label" 
                  stroke="#64748b" 
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#64748b" 
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    borderColor: '#334155', 
                    borderRadius: '12px',
                    color: '#fff',
                    fontSize: '12px'
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="ingresos" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorIngresos)" 
                  name="Ingresos ($)"
                />
                <Area 
                  type="monotone" 
                  dataKey="autos" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorAutos)" 
                  name={dateRange.isSingleDay ? "Autos Entrados" : "Autos Totales"}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: Vehicle Distribution */}
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-white text-md">Distribución por Vehículo</h4>
            <p className="text-xs text-slate-400 mt-1">Porcentaje y conteo de vehículos registrados en total</p>
          </div>

          <div className="h-56 relative flex items-center justify-center my-4">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      borderColor: '#334155', 
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-500 font-medium">No hay vehículos registrados</div>
            )}
            <div className="absolute text-center">
              <span className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">Registros</span>
              <span className="text-2xl font-black text-white">{records.length}</span>
            </div>
          </div>

          <div className="space-y-2">
            {pieData.map((item, index) => {
              const percentage = records.length > 0 ? Math.round((item.value / records.length) * 100) : 0;
              return (
                <div key={item.name} className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2 text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-white font-semibold">{item.value}</span>
                    <span className="text-[10px] bg-slate-700/40 px-1.5 py-0.5 rounded font-mono">({percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Second Row: Payment Methods & Active Tickets list */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Methods Breakdown */}
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-6 shadow-xl">
          <h4 className="font-bold text-white text-md mb-2">Métodos de Pago Utilizados ({dateRange.label})</h4>
          <p className="text-xs text-slate-400 mb-6">Preferencia de Efectivo vs. Tarjeta en ingresos del período</p>

          <div className="h-52 my-4">
            {cashCount + cardCount > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paymentData} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      borderColor: '#334155', 
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px'
                    }} 
                  />
                  <Bar dataKey="monto" fill="#10b981" radius={[8, 8, 0, 0]} name="Ingreso total ($)">
                    <Cell fill="#10b981" />
                    <Cell fill="#6366f1" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 font-medium">
                Sin cobros registrados el día de hoy
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Efectivo</span>
              <span className="block text-lg font-bold text-emerald-400 mt-1">${paymentData[0].monto.toFixed(2)}</span>
              <span className="text-[10px] text-slate-500">{paymentData[0].cantidad} tickets</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 text-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Tarjeta</span>
              <span className="block text-lg font-bold text-indigo-400 mt-1">${paymentData[1].monto.toFixed(2)}</span>
              <span className="text-[10px] text-slate-500">{paymentData[1].cantidad} tickets</span>
            </div>
          </div>
        </div>

        {/* Active tickets summary */}
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-6 shadow-xl lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-bold text-white text-md">Vehículos Activos Recientes</h4>
              <p className="text-xs text-slate-400 mt-1">Últimos vehículos ingresados que siguen en el estacionamiento</p>
            </div>
            <span className="text-xs bg-blue-500/10 text-blue-400 font-semibold px-3 py-1 rounded-full border border-blue-500/20">
              {activeCount} total
            </span>
          </div>

          <div className="overflow-x-auto">
            {activeRecords.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3 px-2">Ticket</th>
                    <th className="py-3 px-2">Placa</th>
                    <th className="py-3 px-2">Tipo</th>
                    <th className="py-3 px-2">Hora Entrada</th>
                    <th className="py-3 px-2 text-right">Duración</th>
                    <th className="py-3 px-2 text-right">Dar Salida</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRecords.slice(0, 10).map((rec) => {
                    const elapsedMin = Math.max(0, Math.floor((Date.now() - rec.entryTime) / 60000));
                    const hours = Math.floor(elapsedMin / 60);
                    const mins = elapsedMin % 60;
                    const elapsedStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                    return (
                      <tr key={rec.ticketCode} className="border-b border-slate-800/60 hover:bg-slate-700/20 text-xs text-slate-300">
                        <td className="py-3 px-2 font-mono font-bold text-blue-400">#{rec.ticketCode}</td>
                        <td className="py-3 px-2">
                          <span className="px-2 py-0.5 bg-slate-900 border border-slate-700 text-white font-mono rounded font-semibold text-[11px]">
                            {rec.plate}
                          </span>
                        </td>
                        <td className="py-3 px-2">{rec.vehicleType}</td>
                        <td className="py-3 px-2 text-slate-400">
                          {new Date(rec.entryTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-semibold text-amber-400">{elapsedStr}</td>
                        <td className="py-3 px-2 text-right">
                          <button
                            onClick={() => openExitVehicleModal(rec)}
                            title={`Dar salida al ticket ${rec.ticketCode}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white text-xs font-bold transition-all cursor-pointer"
                          >
                            <LogOut size={13} />
                            <span>Dar Salida</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-xs text-slate-500 font-medium">
                No hay vehículos activos en el estacionamiento en este momento.
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Clock size={12} />
              Última actualización: {new Date().toLocaleTimeString('es-MX')}
            </span>
          </div>
        </div>
      </div>

      {/* Modal: Detalle y Auditoría de Cortes de Caja de Hoy */}
      {showCutsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                  <History size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Auditoría de Cortes y Ajuste de Ingresos (Hoy)</h3>
                  <p className="text-xs text-slate-400">Desglose de boletos cobrados vs. efectivo físico entregado por cajero</p>
                </div>
              </div>
              <button
                onClick={() => setShowCutsModal(false)}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-800/60 border border-slate-700/50 p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Boletos en Sistema</span>
                  <span className="text-xl font-extrabold text-slate-200 mt-1 block">
                    ${theoreticalEarningsInPeriod.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-400">{completedInPeriod.length} boletos cobrados</span>
                </div>

                <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block">Faltantes en Cortes</span>
                  <span className="text-xl font-extrabold text-red-400 mt-1 block">
                    -${Math.abs(totalSaldosNegativos).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-red-300">{negativeCuts.length} corte(s) con saldo negativo</span>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">Ingreso Real en Caja</span>
                  <span className="text-xl font-extrabold text-emerald-400 mt-1 block">
                    ${realEarningsInPeriod.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-emerald-300">Total neto recaudado</span>
                </div>
              </div>

              {/* Informative explanation */}
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
                <Info size={18} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300 leading-relaxed">
                  <strong>Cálculo Real:</strong> Si un cajero cerró su corte con saldo negativo (faltante o dinero no entregado), el sistema deduce automáticamente esa diferencia del total de boletos para reflejar únicamente los ingresos que realmente ingresaron a la caja.
                </p>
              </div>

              {/* Table of period's cuts */}
              <div>
                <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center justify-between">
                  <span>Cortes Registrados en el Período ({periodCuts.length})</span>
                </h4>
                {periodCuts.length > 0 ? (
                  <div className="border border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-800/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
                        <tr>
                          <th className="py-3 px-3">Cajero</th>
                          <th className="py-3 px-3">Hora de Corte</th>
                          <th className="py-3 px-3 text-right">Esperado</th>
                          <th className="py-3 px-3 text-right">Entregado</th>
                          <th className="py-3 px-3 text-right">Diferencia</th>
                          <th className="py-3 px-3">Estado / Notas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {periodCuts.map((s, idx) => {
                          const diff = s.difference !== null && s.difference !== undefined 
                            ? s.difference 
                            : ((s.actualAmount !== null && s.actualAmount !== undefined) ? (s.actualAmount - (s.expectedAmount || 0)) : 0);
                          const isNegative = diff < 0;
                          const isPositive = diff > 0;
                          const cutTime = s.endTime ? new Date(s.endTime) : (s.startTime ? new Date(s.startTime) : null);

                          return (
                            <tr key={s.shiftId || idx} className="hover:bg-slate-800/30">
                              <td className="py-3 px-3 font-semibold text-white">@{s.username}</td>
                              <td className="py-3 px-3 text-slate-400">
                                {cutTime ? cutTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                              </td>
                              <td className="py-3 px-3 text-right font-mono">${(s.expectedAmount || 0).toFixed(2)}</td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-slate-200">
                                ${(s.actualAmount || 0).toFixed(2)}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold">
                                {isNegative ? (
                                  <span className="text-red-400 inline-flex items-center gap-1">
                                    -${Math.abs(diff).toFixed(2)}
                                  </span>
                                ) : isPositive ? (
                                  <span className="text-blue-400 inline-flex items-center gap-1">
                                    +${diff.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-emerald-400">$0.00</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <div className="space-y-1">
                                  {isNegative ? (
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                                      Faltante (Deducido)
                                    </span>
                                  ) : isPositive ? (
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                      Sobrante
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                      Exacto
                                    </span>
                                  )}
                                  {s.notes && (
                                    <p className="text-[10px] text-slate-400 italic max-w-[200px] truncate" title={s.notes}>
                                      {s.notes}
                                    </p>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    No hay cortes de caja cerrados registrados el día de hoy.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex justify-end">
              <button
                onClick={() => setShowCutsModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cerrar Auditoría
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dar Salida a Vehículo Estacionado (Con cobro o Sin cobro $0 para ajuste) */}
      {exitRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl relative animate-fade-in">
            <button
              onClick={() => setExitRecord(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-700/50 cursor-pointer"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <LogOut size={20} className="text-emerald-400" />
              Dar Salida a Vehículo
            </h3>

            {/* Resumen del Ticket */}
            <div className="bg-slate-900/75 p-4 rounded-2xl border border-slate-700/60 mb-4 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Ticket:</span>
                <span className="font-mono font-bold text-blue-400 text-sm">#{exitRecord.ticketCode}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Placa:</span>
                <span className="font-mono bg-slate-950 border border-slate-700 px-2 py-0.5 rounded text-yellow-400 font-bold">
                  {exitRecord.plate}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Tipo de Vehículo:</span>
                <span className="font-semibold text-slate-200">{exitRecord.vehicleType}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Hora de Entrada:</span>
                <span className="text-slate-300">
                  {new Date(exitRecord.entryTime).toLocaleDateString('es-MX')}{' '}
                  {new Date(exitRecord.entryTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Tiempo Estacionado:</span>
                <span className="text-amber-400 font-semibold font-mono">
                  {Math.max(1, Math.ceil((Date.now() - exitRecord.entryTime) / 60000))} min
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmExitVehicle} className="space-y-4">
              {/* Selector: ¿Se cobró o fue salida sin cobro ($0)? */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  ¿Se realizó cobro al darle salida?
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setExitChargeMode('CON_COBRO');
                      if (exitAmountPaid === 0 || exitAmountPaid === '') {
                        const matchedRate = rates.find(r => r.typeName.toLowerCase() === (exitRecord.vehicleType || '').toLowerCase())
                          || rates.find(r => r.isDefault)
                          || { hourlyRate: 15 };
                        const elapsedHrs = Math.max(1, Math.ceil(Math.max(0, Date.now() - exitRecord.entryTime) / 3600000));
                        setExitAmountPaid(elapsedHrs * matchedRate.hourlyRate);
                      }
                    }}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      exitChargeMode === 'CON_COBRO'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <DollarSign size={14} />
                      <span>Sí se cobró</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-80">Contabilizar monto</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExitChargeMode('SIN_COBRO');
                      setExitAmountPaid(0);
                    }}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      exitChargeMode === 'SIN_COBRO'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-sm'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <X size={14} />
                      <span>Sin cobro ($0)</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-80">No contabilizar / Ajuste</span>
                  </button>
                </div>
              </div>

              {exitChargeMode === 'CON_COBRO' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Monto Cobrado ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={exitAmountPaid}
                      onChange={(e) => setExitAmountPaid(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-base font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-slate-400">Rápido:</span>
                      {[0, 15, 30, 45, 60].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            setExitAmountPaid(val);
                            if (val === 0) setExitChargeMode('SIN_COBRO');
                          }}
                          className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-700 border border-slate-700 text-[11px] font-mono text-slate-300 cursor-pointer"
                        >
                          ${val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      Método de Pago
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setExitPaymentMethod('Efectivo')}
                        className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          exitPaymentMethod === 'Efectivo'
                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 font-bold'
                            : 'bg-slate-900/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        <Check size={14} className={exitPaymentMethod === 'Efectivo' ? 'opacity-100' : 'opacity-0'} />
                        Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setExitPaymentMethod('Tarjeta')}
                        className={`py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          exitPaymentMethod === 'Tarjeta'
                            ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold'
                            : 'bg-slate-900/60 border-slate-700 text-slate-400'
                        }`}
                      >
                        <Check size={14} className={exitPaymentMethod === 'Tarjeta' ? 'opacity-100' : 'opacity-0'} />
                        Tarjeta
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-200 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <Info size={14} className="shrink-0" />
                    <span>Salida con Monto $0.00 (Sin Contabilizar)</span>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    El auto se retirará de <strong>Autos Estacionados</strong> con monto <strong>$0.00</strong> y no sumará dinero a los ingresos ni afectará el corte de caja.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Motivo / Observaciones de Salida
                </label>
                <input
                  type="text"
                  placeholder={exitChargeMode === 'SIN_COBRO' ? 'Ej. Ajuste de corte de caja / Salida sin cobro...' : 'Notas opcionales de salida...'}
                  value={exitNotes}
                  onChange={(e) => setExitNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setExitRecord(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-medium text-white transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingExit}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-lg cursor-pointer flex items-center gap-1.5 ${
                    exitChargeMode === 'SIN_COBRO'
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/15'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/15'
                  }`}
                >
                  {submittingExit && <Loader2 size={14} className="animate-spin" />}
                  <span>
                    {exitChargeMode === 'SIN_COBRO'
                      ? 'Dar Salida sin Cobro ($0)'
                      : `Confirmar Salida ($${Number(exitAmountPaid || 0).toFixed(2)})`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
