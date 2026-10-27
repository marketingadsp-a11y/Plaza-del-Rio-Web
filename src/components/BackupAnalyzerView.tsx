import React, { useState, useMemo, useRef } from 'react';
import {
  UploadCloud,
  FileCheck2,
  Trash2,
  DollarSign,
  Car,
  History,
  Scale,
  Search,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  PieChart as PieChartIcon,
  BarChart3,
  Activity,
  Sparkles,
  User as UserIcon,
  Calendar,
  Wifi,
  HardDrive
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area
} from 'recharts';
import * as XLSX from 'xlsx';

// Normalized interfaces for the Backup JSON
interface NormalizedBackupRecord {
  ticketCode: string;
  plate: string;
  vehicleType: string;
  entryTime: number | null;
  exitTime: number | null;
  amountPaid: number;
  paymentMethod: 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Sin cobro';
  status: 'ACTIVE' | 'COMPLETED';
  paidAtEntry: boolean;
  registeredBy: string;
  processedBy: string;
  description: string;
}

interface NormalizedBackupCut {
  cutId: string;
  cashier: string;
  startTime: number | null;
  endTime: number | null;
  expectedAmount: number;
  reportedAmount: number;
  difference: number;
  notes: string;
}

interface ParsedBackupFile {
  fileName: string;
  version: string | number;
  usuario: string;
  modo: 'LOCAL' | 'EN LINEA' | string;
  fechaExportacion: string;
  registros: NormalizedBackupRecord[];
  cortes: NormalizedBackupCut[];
}

// Helper to parse flexible timestamps (epoch ms, epoch sec, or ISO/date string)
function parseTimestamp(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === 0) return null;
  if (typeof val === 'number') {
    // Handle seconds vs milliseconds
    return val < 10000000000 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      return num < 10000000000 ? num * 1000 : num;
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

function formatDateTime(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatDuration(entryMs: number | null, exitMs: number | null, status: 'ACTIVE' | 'COMPLETED'): string {
  if (!entryMs) return '—';
  const end = exitMs || (status === 'ACTIVE' ? Date.now() : null);
  if (!end || end < entryMs) return '—';
  const diffMin = Math.max(1, Math.floor((end - entryMs) / 60000));
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function normalizePaymentMethod(raw: unknown, amount: number): 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Sin cobro' {
  if (!raw && amount <= 0) return 'Sin cobro';
  const str = String(raw || 'Efectivo').toLowerCase().trim();
  if (str.includes('tarj') || str.includes('card') || str.includes('tdc') || str.includes('tdd')) {
    return 'Tarjeta';
  }
  if (str.includes('transf') || str.includes('spei') || str.includes('banco')) {
    return 'Transferencia';
  }
  if (str.includes('sin') || str.includes('ninguno') || str.includes('cortesia')) {
    return 'Sin cobro';
  }
  return 'Efectivo';
}

function normalizeStatus(rawStatus: unknown, exitTime: number | null): 'ACTIVE' | 'COMPLETED' {
  const s = String(rawStatus || '').toUpperCase().trim();
  if (s === 'COMPLETED' || s === 'COMPLETADO' || s === 'FINALIZADO' || s === 'SALIDA' || s === 'PAGADO') {
    return 'COMPLETED';
  }
  if (s === 'ACTIVE' || s === 'ACTIVO' || s === 'DENTRO' || s === 'EN_SITIO') {
    return 'ACTIVE';
  }
  return exitTime ? 'COMPLETED' : 'ACTIVE';
}

const PIE_COLORS: Record<string, string> = {
  Efectivo: '#10B981',      // Emerald green
  Tarjeta: '#3B82F6',       // Corporate Blue
  Transferencia: '#8B5CF6', // Violet
  'Sin cobro': '#64748B'    // Slate
};

export default function BackupAnalyzerView() {
  const [backupData, setBackupData] = useState<ParsedBackupFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filters for Transactions Table
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'ACTIVE'>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'Efectivo' | 'Tarjeta' | 'Transferencia'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const parseAndValidateJson = (rawText: string, fileName: string) => {
    setErrorMsg(null);
    try {
      const json = JSON.parse(rawText);

      if (!json || typeof json !== 'object') {
        throw new Error('El archivo no contiene un objeto JSON válido.');
      }

      // Check required keys from the Android backup specification
      const hasVersion = 'version' in json || 'appVersion' in json;
      const hasUsuario = 'usuario' in json || 'user' in json || 'exportedBy' in json;
      const hasRegistros = Array.isArray(json.registrosEstacionamiento) || Array.isArray(json.parkingRecords);
      const hasCortes = Array.isArray(json.cortesDeCaja) || Array.isArray(json.cashCuts);

      if (!hasVersion || !hasUsuario || !hasRegistros || !hasCortes) {
        const missing: string[] = [];
        if (!hasVersion) missing.push('version');
        if (!hasUsuario) missing.push('usuario');
        if (!hasRegistros) missing.push('registrosEstacionamiento');
        if (!hasCortes) missing.push('cortesDeCaja');
        throw new Error(
          `Estructura de respaldo inválida. Faltan los campos requeridos por la app móvil: ${missing.join(', ')}.`
        );
      }

      const rawRegistros: Record<string, unknown>[] = json.registrosEstacionamiento || json.parkingRecords || [];
      const rawCortes: Record<string, unknown>[] = json.cortesDeCaja || json.cashCuts || [];

      const registros: NormalizedBackupRecord[] = rawRegistros.map((r, idx) => {
        const entryTime = parseTimestamp(r.entryTime ?? r.horaEntrada ?? r.fechaEntrada);
        const exitTime = parseTimestamp(r.exitTime ?? r.horaSalida ?? r.fechaSalida);
        const status = normalizeStatus(r.status ?? r.estado, exitTime);
        const paidAtEntry = Boolean(r.paidAtEntry ?? r.pagoAlEntrar ?? false);
        const rawAmount = Number(r.amountPaid ?? r.monto ?? r.totalPagado ?? r.importe ?? 0);
        const amountPaid = isNaN(rawAmount) ? 0 : rawAmount;
        const paymentMethod = normalizePaymentMethod(r.paymentMethod ?? r.metodoPago ?? r.metodo, amountPaid);

        return {
          ticketCode: String(r.ticketCode ?? r.folio ?? r.id ?? `SIN-FOLIO-${idx + 1}`),
          plate: String(r.plate ?? r.placa ?? 'S/P').toUpperCase(),
          vehicleType: String(r.vehicleType ?? r.tipoVehiculo ?? r.tarifa ?? 'Auto'),
          entryTime,
          exitTime,
          amountPaid,
          paymentMethod,
          status,
          paidAtEntry,
          registeredBy: String(r.registeredBy ?? r.registradoPor ?? json.usuario ?? '—'),
          processedBy: String(r.processedBy ?? r.cobradoPor ?? '—'),
          description: String(r.description ?? r.descripcion ?? '')
        };
      });

      // Sort records most recent entryTime first
      registros.sort((a, b) => (b.entryTime || 0) - (a.entryTime || 0));

      const cortes: NormalizedBackupCut[] = rawCortes.map((c, idx) => {
        const startTime = parseTimestamp(c.startTime ?? c.horaInicio ?? c.fechaInicio);
        const endTime = parseTimestamp(c.endTime ?? c.horaFin ?? c.fechaFin);
        const expectedAmount = Number(c.expectedAmount ?? c.montoEsperado ?? c.esperado ?? 0) || 0;
        const reportedAmount =
          Number(
            c.actualAmount ??
              c.collectedAmount ??
              c.montoReportado ??
              c.reportado ??
              c.montoReal ??
              0
          ) || 0;
        const rawDiff = c.difference ?? c.diferencia;
        const difference =
          rawDiff !== undefined && rawDiff !== null && !isNaN(Number(rawDiff))
            ? Number(rawDiff)
            : reportedAmount - expectedAmount;

        return {
          cutId: String(c.shiftId ?? c.corteId ?? c.idCorte ?? c.id ?? `CORTE-${idx + 1}`),
          cashier: String(c.username ?? c.cajero ?? c.usuario ?? json.usuario ?? '—'),
          startTime,
          endTime,
          expectedAmount,
          reportedAmount,
          difference,
          notes: String(c.notes ?? c.notas ?? c.observaciones ?? '')
        };
      });

      cortes.sort((a, b) => (b.endTime || b.startTime || 0) - (a.endTime || a.startTime || 0));

      // Extract export date from JSON or filename
      const rawExportDate =
        json.fechaExportacion ??
        json.fechaRespaldo ??
        json.exportDate ??
        json.timestamp ??
        json.fecha;
      const parsedExportTs = parseTimestamp(rawExportDate);
      const fechaExportacion = parsedExportTs
        ? formatDateTime(parsedExportTs)
        : typeof rawExportDate === 'string' && rawExportDate.trim()
        ? rawExportDate
        : extractDateFromFilename(fileName);

      // Extract work mode (LOCAL or EN LINEA)
      const rawModo = String(
        json.modo ?? json.modoTrabajo ?? json.workMode ?? json.mode ?? 'LOCAL'
      ).toUpperCase();
      const modo = rawModo.includes('LINEA') || rawModo.includes('ONLINE') ? 'EN LINEA' : 'LOCAL';

      setBackupData({
        fileName,
        version: json.version ?? json.appVersion ?? '1.0',
        usuario: String(json.usuario ?? json.user ?? json.exportedBy ?? 'Desconocido'),
        modo,
        fechaExportacion,
        registros,
        cortes
      });
      setCurrentPage(1);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al procesar el archivo JSON. Verifica que sea un respaldo válido.');
    }
  };

  function extractDateFromFilename(name: string): string {
    // Matches respaldo-dia-mes-año-usuario-hora.json
    const match = name.match(/respaldo-(\d{1,2})-(\d{1,2})-(\d{4})/i);
    if (match) {
      return `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`;
    }
    return new Date().toLocaleDateString('es-MX');
  }

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setErrorMsg('Por favor selecciona un archivo con extensión .json');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result;
      if (typeof content === 'string') {
        parseAndValidateJson(content, file.name);
      }
    };
    reader.onerror = () => {
      setErrorMsg('No se pudo leer el archivo seleccionado.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const loadSampleBackup = () => {
    const now = Date.now();
    const hourMs = 3600 * 1000;
    const baseMorning = new Date().setHours(8, 0, 0, 0);

    const sampleJson = {
      version: '2.4.1',
      usuario: 'ramon1',
      modo: 'LOCAL',
      fechaExportacion: now,
      registrosEstacionamiento: [
        {
          ticketCode: '1-75401',
          plate: 'JKL-482-A',
          vehicleType: 'Por Hora',
          entryTime: baseMorning + 0.2 * hourMs,
          exitTime: baseMorning + 2.5 * hourMs,
          amountPaid: 45,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          paidAtEntry: false
        },
        {
          ticketCode: '1-75402',
          plate: 'MNP-910-B',
          vehicleType: 'Por Día',
          entryTime: baseMorning + 0.5 * hourMs,
          exitTime: baseMorning + 6.2 * hourMs,
          amountPaid: 80,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          paidAtEntry: true
        },
        {
          ticketCode: '1-75403',
          plate: 'GTR-221-C',
          vehicleType: 'Auto',
          entryTime: baseMorning + 1.1 * hourMs,
          exitTime: baseMorning + 3.0 * hourMs,
          amountPaid: 36,
          paymentMethod: 'Tarjeta',
          status: 'COMPLETED',
          paidAtEntry: false
        },
        {
          ticketCode: '1-75404',
          plate: 'MOTO-88X',
          vehicleType: 'Moto',
          entryTime: baseMorning + 1.8 * hourMs,
          exitTime: baseMorning + 4.1 * hourMs,
          amountPaid: 25,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          paidAtEntry: false
        },
        {
          ticketCode: '1-75405',
          plate: 'VBN-304-F',
          vehicleType: 'Cobro Manual',
          entryTime: baseMorning + 2.3 * hourMs,
          exitTime: baseMorning + 5.0 * hourMs,
          amountPaid: 120,
          paymentMethod: 'Transferencia',
          status: 'COMPLETED',
          paidAtEntry: true
        },
        {
          ticketCode: '1-75406',
          plate: 'QWE-771-D',
          vehicleType: 'Por Hora',
          entryTime: baseMorning + 3.2 * hourMs,
          exitTime: baseMorning + 4.8 * hourMs,
          amountPaid: 36,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          paidAtEntry: false
        },
        {
          ticketCode: '1-75407',
          plate: 'ZXC-512-H',
          vehicleType: 'Por Hora',
          entryTime: baseMorning + 4.4 * hourMs,
          exitTime: null,
          amountPaid: 0,
          paymentMethod: 'Efectivo',
          status: 'ACTIVE',
          paidAtEntry: false
        },
        {
          ticketCode: '1-75408',
          plate: 'RTY-199-K',
          vehicleType: 'Por Día',
          entryTime: baseMorning + 5.1 * hourMs,
          exitTime: null,
          amountPaid: 80,
          paymentMethod: 'Tarjeta',
          status: 'ACTIVE',
          paidAtEntry: true
        }
      ],
      cortesDeCaja: [
        {
          shiftId: 'CUT-984120',
          username: 'ramon1',
          startTime: baseMorning,
          endTime: baseMorning + 6 * hourMs,
          expectedAmount: 422,
          actualAmount: 402,
          difference: -20,
          notes: 'Diferencia por cambio en efectivo de boleto 1-75401'
        },
        {
          shiftId: 'CUT-984199',
          username: 'luz',
          startTime: baseMorning + 6 * hourMs,
          endTime: baseMorning + 10 * hourMs,
          expectedAmount: 540,
          actualAmount: 540,
          difference: 0,
          notes: 'Corte cuadrado sin incidencias'
        }
      ]
    };

    parseAndValidateJson(
      JSON.stringify(sampleJson),
      'respaldo-26-10-2026-ramon1-1830.json'
    );
  };

  // Executive KPIs calculation
  const kpis = useMemo(() => {
    if (!backupData) {
      return {
        totalCollected: 0,
        totalVehicles: 0,
        completedCount: 0,
        activeCount: 0,
        cutsCount: 0,
        netDifference: 0
      };
    }

    let totalCollected = 0;
    let completedCount = 0;
    let activeCount = 0;

    backupData.registros.forEach((r) => {
      totalCollected += r.amountPaid || 0;
      if (r.status === 'COMPLETED') completedCount++;
      else activeCount++;
    });

    const netDifference = backupData.cortes.reduce((acc, c) => acc + (c.difference || 0), 0);

    return {
      totalCollected,
      totalVehicles: backupData.registros.length,
      completedCount,
      activeCount,
      cutsCount: backupData.cortes.length,
      netDifference
    };
  }, [backupData]);

  // Chart 1: Income distribution by Payment Method
  const paymentMethodChartData = useMemo(() => {
    if (!backupData) return [];
    const totals: Record<string, { name: string; value: number; count: number }> = {
      Efectivo: { name: 'Efectivo', value: 0, count: 0 },
      Tarjeta: { name: 'Tarjeta', value: 0, count: 0 },
      Transferencia: { name: 'Transferencia', value: 0, count: 0 }
    };

    backupData.registros.forEach((r) => {
      const m = r.paymentMethod;
      if (r.amountPaid > 0) {
        if (!totals[m]) totals[m] = { name: m, value: 0, count: 0 };
        totals[m].value += r.amountPaid;
        totals[m].count += 1;
      }
    });

    return Object.values(totals).filter((item) => item.value > 0 || item.count > 0);
  }, [backupData]);

  // Chart 2: Flow & Revenue by Vehicle Type
  const vehicleTypeChartData = useMemo(() => {
    if (!backupData) return [];
    const map: Record<string, { tipo: string; vehiculos: number; ingresos: number }> = {};

    backupData.registros.forEach((r) => {
      const key = r.vehicleType || 'Otro';
      if (!map[key]) {
        map[key] = { tipo: key, vehiculos: 0, ingresos: 0 };
      }
      map[key].vehiculos += 1;
      map[key].ingresos += r.amountPaid || 0;
    });

    return Object.values(map).sort((a, b) => b.ingresos - a.ingresos);
  }, [backupData]);

  // Chart 3: Hourly entry flow (histogram by hour)
  const hourlyFlowChartData = useMemo(() => {
    if (!backupData) return [];
    const hours = Array.from({ length: 24 }, (_, h) => ({
      hora: `${String(h).padStart(2, '0')}:00`,
      entradas: 0,
      ingresos: 0
    }));

    backupData.registros.forEach((r) => {
      if (r.entryTime) {
        const d = new Date(r.entryTime);
        if (!isNaN(d.getTime())) {
          const h = d.getHours();
          hours[h].entradas += 1;
          hours[h].ingresos += r.amountPaid || 0;
        }
      }
    });

    // Trim leading/trailing empty hours if data is concentrated, keeping at least 07:00 to 21:00
    const firstActive = hours.findIndex((h) => h.entradas > 0);
    const lastActive = hours.length - 1 - [...hours].reverse().findIndex((h) => h.entradas > 0);
    const startIdx = firstActive === -1 ? 7 : Math.max(0, Math.min(7, firstActive - 1));
    const endIdx = firstActive === -1 ? 21 : Math.min(23, Math.max(21, lastActive + 1));

    return hours.slice(startIdx, endIdx + 1);
  }, [backupData]);

  // Filtered Transactions for Table
  const filteredRecords = useMemo(() => {
    if (!backupData) return [];
    const q = searchQuery.trim().toLowerCase();

    return backupData.registros.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (methodFilter !== 'ALL' && r.paymentMethod !== methodFilter) return false;
      if (q) {
        const matchPlate = r.plate.toLowerCase().includes(q);
        const matchFolio = r.ticketCode.toLowerCase().includes(q);
        const matchType = r.vehicleType.toLowerCase().includes(q);
        if (!matchPlate && !matchFolio && !matchType) return false;
      }
      return true;
    });
  }, [backupData, searchQuery, statusFilter, methodFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage]);

  // Export filtered transactions to Excel (.xlsx) or CSV
  const handleExportExcel = (format: 'xlsx' | 'csv') => {
    if (!backupData || filteredRecords.length === 0) return;

    const rows = filteredRecords.map((r) => ({
      'Folio (#ticketCode)': r.ticketCode,
      Placa: r.plate,
      'Tipo de Vehículo': r.vehicleType,
      'Hora Entrada': formatDateTime(r.entryTime),
      'Hora Salida': r.status === 'COMPLETED' ? formatDateTime(r.exitTime) : 'En estacionamiento',
      Duración: formatDuration(r.entryTime, r.exitTime, r.status),
      'Pago al Entrar': r.paidAtEntry ? 'Sí' : 'No',
      Estado: r.status === 'COMPLETED' ? 'COMPLETADO' : 'ACTIVO',
      Método: r.paymentMethod,
      'Monto ($)': r.amountPaid
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transacciones Respaldo');

    const cleanBaseName = backupData.fileName.replace(/\.json$/i, '');
    if (format === 'csv') {
      XLSX.writeFile(workbook, `${cleanBaseName}-transacciones.csv`, { bookType: 'csv' });
    } else {
      XLSX.writeFile(workbook, `${cleanBaseName}-transacciones.xlsx`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400">
            <FileCheck2 size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Analizar Respaldos
          </h1>
        </div>

        {backupData && (
          <button
            onClick={() => {
              setBackupData(null);
              setErrorMsg(null);
              setSearchQuery('');
              setStatusFilter('ALL');
              setMethodFilter('ALL');
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm font-semibold transition-colors cursor-pointer shrink-0"
          >
            <Trash2 size={16} />
            <span>Limpiar / Cargar otro respaldo</span>
          </button>
        )}
      </div>

      {/* 1. ZONA DE CARGA DE ARCHIVO (DROPZONE SIMPLE) */}
      {!backupData ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer
              ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-700 hover:border-blue-500/60 bg-slate-950/50 hover:bg-slate-950/80'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center mx-auto mb-4">
              <UploadCloud size={28} />
            </div>

            <h3 className="text-base font-semibold text-white mb-4">
              Subir archivo de respaldo (.json)
            </h3>

            <span className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-600/20 transition-colors">
              Seleccionar archivo
            </span>
          </div>

          {errorMsg && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-300 text-sm">
              <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-400">Archivo no válido</p>
                <p className="text-xs text-red-300/90 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Metadata Summary Bar of Loaded Backup */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0">
                <CheckCircle2 size={22} />
              </div>
              <div className="min-w-0">
                <span className="text-xs text-slate-400 font-medium block">Archivo de respaldo cargado</span>
                <p className="text-base font-bold text-white font-mono truncate" title={backupData.fileName}>
                  {backupData.fileName}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm">
              <div>
                <span className="text-xs text-slate-400 block">Exportado por</span>
                <span className="font-semibold text-white flex items-center gap-1.5 mt-0.5">
                  <UserIcon size={14} className="text-blue-400" />
                  @{backupData.usuario}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-800 hidden sm:block" />

              <div>
                <span className="text-xs text-slate-400 block">Modo de Trabajo</span>
                <span className="font-semibold text-white flex items-center gap-1.5 mt-0.5">
                  {backupData.modo === 'EN LINEA' ? (
                    <>
                      <Wifi size={14} className="text-emerald-400" />
                      <span className="text-emerald-400">EN LÍNEA</span>
                    </>
                  ) : (
                    <>
                      <HardDrive size={14} className="text-amber-400" />
                      <span className="text-amber-400">{backupData.modo}</span>
                    </>
                  )}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-800 hidden sm:block" />

              <div>
                <span className="text-xs text-slate-400 block">Fecha de Exportación</span>
                <span className="font-semibold text-slate-200 font-mono flex items-center gap-1.5 mt-0.5 tabular-nums">
                  <Calendar size={14} className="text-blue-400" />
                  {backupData.fechaExportacion}
                </span>
              </div>

              <div className="h-8 w-px bg-slate-800 hidden sm:block" />

              <div>
                <span className="text-xs text-slate-400 block">Versión App</span>
                <span className="font-mono font-semibold text-slate-300 mt-0.5 block tabular-nums">
                  v{backupData.version}
                </span>
              </div>
            </div>
          </div>

          {/* 2. TARJETAS KPI SUPERIORES (RESUMEN EJECUTIVO) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Total Recaudado */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400">Total Recaudado ($)</span>
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <DollarSign size={18} />
                </div>
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                  ${kpis.totalCollected.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Suma de transacciones en el respaldo
                </p>
              </div>
            </div>

            {/* KPI 2: Total de Vehículos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400">Total de Vehículos</span>
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Car size={18} />
                </div>
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                  {kpis.totalVehicles}
                </p>
                <div className="flex items-center gap-2 mt-2 text-xs font-medium tabular-nums">
                  <span className="text-emerald-400 font-semibold">
                    {kpis.completedCount} COMPLETADOS
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-amber-400 font-semibold">
                    {kpis.activeCount} ACTIVOS
                  </span>
                </div>
              </div>
            </div>

            {/* KPI 3: Cortes de Caja */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-400">Cortes de Caja</span>
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <History size={18} />
                </div>
              </div>
              <div>
                <p className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                  {kpis.cutsCount}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Cierres de turno registrados en el JSON
                </p>
              </div>
            </div>

            {/* KPI 4: Diferencia Neta de Caja */}
            <div
              className={`bg-slate-900 border rounded-2xl p-5 shadow-md flex flex-col justify-between ${
                kpis.netDifference < 0
                  ? 'border-red-500/40 bg-red-950/10'
                  : 'border-emerald-500/40 bg-emerald-950/10'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-300">Diferencia Neta de Caja ($)</span>
                <div
                  className={`p-2 rounded-xl border ${
                    kpis.netDifference < 0
                      ? 'bg-red-500/15 border-red-500/30 text-red-400'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  <Scale size={18} />
                </div>
              </div>
              <div>
                <p
                  className={`text-3xl font-extrabold font-mono tabular-nums tracking-tight ${
                    kpis.netDifference < 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {kpis.netDifference > 0 ? '+' : ''}
                  ${kpis.netDifference.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p
                  className={`text-xs font-semibold mt-2 ${
                    kpis.netDifference < 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {kpis.netDifference < 0
                    ? 'Faltante Neto en Cortes'
                    : kpis.netDifference === 0
                    ? 'Caja Cuadrada ($0.00)'
                    : 'Sobrante Neto en Cortes'}
                </p>
              </div>
            </div>
          </div>

          {/* 3. GRÁFICOS INTERACTIVOS DE ANÁLISIS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico 1: Pastilla / Pie Chart - Distribución por Método de Pago */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Ingresos por Método de Pago</h3>
                  <p className="text-xs text-slate-400">Efectivo, Tarjeta y Transferencia</p>
                </div>
                <PieChartIcon size={18} className="text-blue-400" />
              </div>

              {paymentMethodChartData.length === 0 ? (
                <div className="flex-1 min-h-[250px] flex items-center justify-center text-sm text-slate-500">
                  Sin ingresos cobrados para graficar
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentMethodChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                      >
                        {paymentMethodChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={PIE_COLORS[entry.name] || '#3B82F6'}
                            stroke="transparent"
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#1E293B',
                          borderRadius: '12px',
                          color: '#F8FAFC',
                          fontSize: '12px'
                        }}
                        formatter={(value: any, name: any, props: any) => [
                          `$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${props.payload.count} cobros)`,
                          name
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={32}
                        formatter={(value) => <span className="text-xs text-slate-300">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Gráfico 2: Barras - Flujo e Ingresos por Tipo de Vehículo */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Flujo e Ingresos por Tipo</h3>
                  <p className="text-xs text-slate-400">Comparativa por categoría / tarifa</p>
                </div>
                <BarChart3 size={18} className="text-blue-400" />
              </div>

              {vehicleTypeChartData.length === 0 ? (
                <div className="flex-1 min-h-[250px] flex items-center justify-center text-sm text-slate-500">
                  Sin registros de vehículos
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vehicleTypeChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="tipo" stroke="#94A3B8" fontSize={11} />
                      <YAxis yAxisId="left" stroke="#3B82F6" fontSize={11} />
                      <YAxis yAxisId="right" orientation="right" stroke="#10B981" fontSize={11} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          borderColor: '#1E293B',
                          borderRadius: '12px',
                          color: '#F8FAFC',
                          fontSize: '12px'
                        }}
                        formatter={(value: any, name: any) =>
                          name === 'Ingresos ($)'
                            ? [`$${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, name]
                            : [value, name]
                        }
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={32}
                        formatter={(value) => <span className="text-xs text-slate-300">{value}</span>}
                      />
                      <Bar yAxisId="left" dataKey="vehiculos" name="Vehículos" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                      <Bar yAxisId="right" dataKey="ingresos" name="Ingresos ($)" fill="#10B981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Gráfico 3: Línea / Histograma - Afluencia de entradas por horario */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Afluencia por Horario</h3>
                  <p className="text-xs text-slate-400">Entradas registradas por hora del día</p>
                </div>
                <Activity size={18} className="text-blue-400" />
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlyFlowChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                    <XAxis dataKey="hora" stroke="#94A3B8" fontSize={11} />
                    <YAxis stroke="#94A3B8" fontSize={11} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#1E293B',
                        borderRadius: '12px',
                        color: '#F8FAFC',
                        fontSize: '12px'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="entradas"
                      name="Entradas"
                      stroke="#3B82F6"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorEntradas)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 4. TABLA DETALLADA DE TRANSACCIONES Y BÚSQUEDA */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Detalle de Transacciones (<span className="font-mono tabular-nums text-blue-400">{filteredRecords.length}</span>)
                </h2>
                <p className="text-xs text-slate-400">
                  Listado completo de <code className="font-mono text-slate-300">registrosEstacionamiento</code> incluidos en el archivo
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => handleExportExcel('xlsx')}
                  disabled={filteredRecords.length === 0}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <FileSpreadsheet size={15} />
                  <span>Exportar Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() => handleExportExcel('csv')}
                  disabled={filteredRecords.length === 0}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <Download size={15} />
                  <span>Exportar CSV</span>
                </button>
              </div>
            </div>

            {/* Quick Filters Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              {/* Universal Search */}
              <div className="relative">
                <Search size={16} className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Buscar por Placa, Folio (#ticketCode) o Tipo..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Status Selector */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                {(
                  [
                    { id: 'ALL', label: 'Todos' },
                    { id: 'COMPLETED', label: 'Completados' },
                    { id: 'ACTIVE', label: 'Activos' }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      statusFilter === tab.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Payment Method Selector */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                {(
                  [
                    { id: 'ALL', label: 'Todos' },
                    { id: 'Efectivo', label: 'Efectivo' },
                    { id: 'Tarjeta', label: 'Tarjeta' },
                    { id: 'Transferencia', label: 'Transferencia' }
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setMethodFilter(m.id);
                      setCurrentPage(1);
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer truncate ${
                      methodFilter === m.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Responsive Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">Folio (#ticketCode)</th>
                    <th className="py-3 px-4">Placa</th>
                    <th className="py-3 px-4">Tipo de Vehículo</th>
                    <th className="py-3 px-4">Hora Entrada</th>
                    <th className="py-3 px-4">Hora Salida</th>
                    <th className="py-3 px-4">Duración</th>
                    <th className="py-3 px-4">Pago al Entrar</th>
                    <th className="py-3 px-4">Método</th>
                    <th className="py-3 px-4 text-right">Monto ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-sm">
                  {paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500">
                        No se encontraron transacciones con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((r) => (
                      <tr key={r.ticketCode} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-400 tabular-nums whitespace-nowrap">
                          #{r.ticketCode}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                          {r.plate}
                        </td>
                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          {r.vehicleType}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-300 tabular-nums whitespace-nowrap">
                          {formatDateTime(r.entryTime)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                          {r.status === 'COMPLETED' ? (
                            <span className="text-slate-300">{formatDateTime(r.exitTime)}</span>
                          ) : (
                            <span className="text-amber-400 font-sans font-semibold">ACTIVO (Dentro)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                          {formatDuration(r.entryTime, r.exitTime, r.status)}
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          <span className={r.paidAtEntry ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                            {r.paidAtEntry ? 'Sí (Anticipado)' : 'No'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              r.paymentMethod === 'Efectivo'
                                ? 'text-emerald-400'
                                : r.paymentMethod === 'Tarjeta'
                                ? 'text-blue-400'
                                : r.paymentMethod === 'Transferencia'
                                ? 'text-violet-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {r.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-white tabular-nums whitespace-nowrap">
                          ${r.amountPaid.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {filteredRecords.length > pageSize && (
              <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
                <span className="tabular-nums">
                  Mostrando {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filteredRecords.length)} de {filteredRecords.length} registros
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="font-mono font-semibold text-white tabular-nums px-2">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white cursor-pointer"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5. SECCIÓN DE ARQUEO Y AUDITORÍA DE CORTES DE CAJA */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Arqueo y Auditoría de Cortes de Caja (<span className="font-mono tabular-nums text-blue-400">{backupData.cortes.length}</span>)
                </h2>
                <p className="text-xs text-slate-400">
                  Revisión de cierres de turno incluidos en <code className="font-mono text-slate-300">cortesDeCaja</code> (se resaltan en rojo los faltantes menores a $0.00)
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                    <th className="py-3 px-4">ID Corte</th>
                    <th className="py-3 px-4">Cajero</th>
                    <th className="py-3 px-4">Hora Inicio</th>
                    <th className="py-3 px-4">Hora Fin</th>
                    <th className="py-3 px-4 text-right">Esperado ($)</th>
                    <th className="py-3 px-4 text-right">Reportado ($)</th>
                    <th className="py-3 px-4 text-right">Diferencia ($)</th>
                    <th className="py-3 px-4">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-sm">
                  {backupData.cortes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Este archivo de respaldo no incluye cortes de caja cerrados.
                      </td>
                    </tr>
                  ) : (
                    backupData.cortes.map((c) => {
                      const isShortage = c.difference < 0;
                      return (
                        <tr
                          key={c.cutId}
                          className={`transition-colors ${
                            isShortage
                              ? 'bg-red-950/25 hover:bg-red-950/40'
                              : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-400 tabular-nums whitespace-nowrap">
                            {c.cutId}
                          </td>
                          <td className="py-3 px-4 font-semibold text-white whitespace-nowrap">
                            @{c.cashier}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-300 tabular-nums whitespace-nowrap">
                            {formatDateTime(c.startTime)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-300 tabular-nums whitespace-nowrap">
                            {formatDateTime(c.endTime)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-200 tabular-nums whitespace-nowrap">
                            ${c.expectedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-white tabular-nums whitespace-nowrap">
                            ${c.reportedAmount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-extrabold tabular-nums whitespace-nowrap ${
                              isShortage ? 'text-red-400' : 'text-emerald-400'
                            }`}
                          >
                            {c.difference > 0 ? '+' : ''}
                            ${c.difference.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {isShortage && (
                              <span className="ml-2 text-[10px] font-sans font-bold text-red-400">
                                (FALTANTE)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-300 max-w-xs">
                            {c.notes || 'Sin observaciones'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
