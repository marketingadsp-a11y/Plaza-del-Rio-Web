import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { ParkingRecord, UserShift, VehicleTypeRate } from '../types';
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
  TrendingDown
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

export default function DashboardView() {
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [userShifts, setUserShifts] = useState<UserShift[]>([]);
  const [cashCuts, setCashCuts] = useState<UserShift[]>([]);
  const [rates, setRates] = useState<VehicleTypeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueMode, setRevenueMode] = useState<'REAL' | 'FISICO' | 'TEORICO'>('REAL');
  const [showCutsModal, setShowCutsModal] = useState(false);

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
  const activeRecords = records.filter(r => r.status === 'ACTIVE');
  const activeCount = activeRecords.length;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();

  const isSameDay = (timestamp: number, target: Date) => {
    const d = new Date(timestamp);
    return d.getFullYear() === target.getFullYear() &&
           d.getMonth() === target.getMonth() &&
           d.getDate() === target.getDate();
  };

  const completedToday = records.filter(r => 
    r.status === 'COMPLETED' && 
    r.exitTime !== null && 
    r.exitTime >= startOfTodayMs
  );

  // 1. Boletos registrados como cobrados en sistema hoy (monto teórico)
  const theoreticalEarningsToday = completedToday.reduce((sum, r) => sum + (r.amountPaid || 0), 0);

  // 2. Cortes de caja de hoy (excluyendo duplicados para no inflar métricas)
  const todayCuts = React.useMemo(() => {
    return shifts.filter(s => {
      if (!s.isClosed || s.isDuplicate) return false;
      const cutTimestamp = s.endTime || s.startTime;
      return cutTimestamp ? isSameDay(cutTimestamp, startOfToday) : false;
    });
  }, [shifts, startOfToday]);

  // Análisis de cortes: físico entregado, esperado y saldos negativos / faltantes
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
    const negList: typeof todayCuts = [];

    todayCuts.forEach(s => {
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
  }, [todayCuts]);

  // Ingreso Real de Hoy:
  // Tomamos los boletos cobrados en el sistema y descontamos los faltantes / saldos negativos de los cortes cerrados.
  // Así evitamos sumar ingresos de cortes que cerraron en negativo (dinero que no ingresó a caja).
  const realEarningsToday = Math.max(0, theoreticalEarningsToday + totalSaldosNegativos);

  // Monto a mostrar según el modo seleccionado
  const displayRevenue = revenueMode === 'REAL' 
    ? realEarningsToday 
    : revenueMode === 'FISICO' 
      ? cutsActualDelivered 
      : theoreticalEarningsToday;

  const earningsToday = displayRevenue;

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

  // Chart data: Distribution by Vehicle Type
  const vehicleTypeCounts: { [key: string]: number } = {};
  records.forEach(r => {
    const type = r.vehicleType || 'Auto';
    vehicleTypeCounts[type] = (vehicleTypeCounts[type] || 0) + 1;
  });

  const pieData = Object.entries(vehicleTypeCounts).map(([name, value]) => ({
    name,
    value
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

  // Chart data: Preferred Payment Methods
  let cashCount = 0;
  let cardCount = 0;
  completedToday.forEach(r => {
    if (r.paymentMethod === 'Efectivo') cashCount++;
    if (r.paymentMethod === 'Tarjeta') cardCount++;
  });

  const paymentData = [
    { name: 'Efectivo', cantidad: cashCount, monto: completedToday.filter(r => r.paymentMethod === 'Efectivo').reduce((s, r) => s + (r.amountPaid || 0), 0) },
    { name: 'Tarjeta', cantidad: cardCount, monto: completedToday.filter(r => r.paymentMethod === 'Tarjeta').reduce((s, r) => s + (r.amountPaid || 0), 0) }
  ];

  // Chart data: Hourly occupancy/revenue today
  // Let's create an array of hours (e.g. 7:00 to 22:00 or group by hourly slots)
  const hourlyDataMap: { [hour: number]: { hourLabel: string; ingresos: number; autos: number } } = {};
  for (let h = 0; h < 24; h++) {
    hourlyDataMap[h] = {
      hourLabel: `${h.toString().padStart(2, '0')}:00`,
      ingresos: 0,
      autos: 0
    };
  }

  // Populate autos active and exited today grouped by hour of event
  records.forEach(r => {
    // If entered today, add to occupancy for that entry hour
    if (r.entryTime >= startOfTodayMs) {
      const entryHour = new Date(r.entryTime).getHours();
      if (entryHour >= 0 && entryHour < 24) {
        hourlyDataMap[entryHour].autos += 1;
      }
    }
    // If exited today, add to revenue for that exit hour
    if (r.status === 'COMPLETED' && r.exitTime && r.exitTime >= startOfTodayMs) {
      const exitHour = new Date(r.exitTime).getHours();
      if (exitHour >= 0 && exitHour < 24) {
        hourlyDataMap[exitHour].ingresos += r.amountPaid || 0;
      }
    }
  });

  // Convert map to sorted array, filter hours with some activity to keep graph readable (or show last 12 hours)
  const hourlyChartData = Object.values(hourlyDataMap);

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
          <img src="/logo-plaza-1.jpg" alt="Logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" onError={(e) => {
            e.currentTarget.style.display = 'none';
          }} />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Panel de Control</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-4 py-2 rounded-2xl text-xs text-emerald-400 font-semibold w-fit shadow-md">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
          Sincronizado con Android
        </div>
      </div>

      {/* Demo Seeder (Only shown if records are empty) */}
      {records.length === 0 && (
        <DemoSeeder />
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1: Active Vehicles */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 p-8 bg-blue-500/5 rounded-full translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform" />
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Autos Estacionados</span>
              <h3 className="text-3xl font-extrabold text-white">{activeCount}</h3>
              <p className="text-[11px] text-blue-400 font-medium">Vehículos activos en el recinto</p>
            </div>
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
              <Car size={24} />
            </div>
          </div>
        </div>

        {/* KPI 2: Today's Revenue */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 p-8 bg-emerald-500/5 rounded-full translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform" />
          <div className="flex items-start justify-between">
            <div className="space-y-2 w-full pr-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  {revenueMode === 'REAL' ? 'Ingresos Reales (Hoy)' : revenueMode === 'FISICO' ? 'Efectivo Entregado (Hoy)' : 'Boletos en Sistema (Hoy)'}
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
                  title="Suma bruta de boletos completados hoy (sin ajustes)"
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
                  Suma de <span className="font-bold text-slate-300">{completedToday.length}</span> tickets pagados hoy
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
        {/* Line Chart: Hourly Activity */}
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-6 shadow-xl lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h4 className="font-bold text-white text-md">Flujo e Ingresos por Hora (Hoy)</h4>
              <p className="text-xs text-slate-400 mt-1">Gráfico acumulado de ingresos y afluencia por franja horaria</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-blue-400 font-medium">
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm" />
                Ingresos ($)
              </span>
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
                Autos Entrados
              </span>
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                  dataKey="hourLabel" 
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
                  name="Autos Entrados"
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
          <h4 className="font-bold text-white text-md mb-2">Métodos de Pago Utilizados (Hoy)</h4>
          <p className="text-xs text-slate-400 mb-6">Preferencia de Efectivo vs. Tarjeta en ingresos de hoy</p>

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
                  </tr>
                </thead>
                <tbody>
                  {activeRecords.slice(0, 5).map((rec) => {
                    const elapsedMin = Math.max(0, Math.floor((Date.now() - rec.entryTime) / 60000));
                    const hours = Math.floor(elapsedMin / 60);
                    const mins = elapsedMin % 60;
                    const elapsedStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                    return (
                      <tr key={rec.ticketCode} className="border-b border-slate-800/60 hover:bg-slate-700/20 text-xs text-slate-300">
                        <td className="py-3 px-2 font-mono font-bold text-blue-400">{rec.ticketCode}</td>
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
                    ${theoreticalEarningsToday.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-slate-400">{completedToday.length} boletos cobrados</span>
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
                    ${realEarningsToday.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
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

              {/* Table of today's cuts */}
              <div>
                <h4 className="text-sm font-bold text-slate-200 mb-3 flex items-center justify-between">
                  <span>Cortes Registrados Hoy ({todayCuts.length})</span>
                </h4>
                {todayCuts.length > 0 ? (
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
                        {todayCuts.map((s, idx) => {
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
    </div>
  );
}
