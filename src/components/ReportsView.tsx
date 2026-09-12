import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { getDb } from '../lib/firebase';
import { ParkingRecord, UserShift, VehicleTypeRate } from '../types';
import { analyzeShiftDuplicates } from '../lib/shiftDeduplication';
import { 
  FileText, 
  Download, 
  Calendar, 
  ArrowRight, 
  DollarSign, 
  Car, 
  History, 
  Printer, 
  FileSpreadsheet, 
  Loader2, 
  CheckCircle,
  Filter,
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

interface ExtendedShift extends UserShift {
  sourceCollection: 'cash_cuts' | 'user_shifts';
}

const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

export default function ReportsView() {
  const [records, setRecords] = useState<ParkingRecord[]>([]);
  const [rates, setRates] = useState<VehicleTypeRate[]>([]);
  const [userShifts, setUserShifts] = useState<UserShift[]>([]);
  const [cashCuts, setCashCuts] = useState<UserShift[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [filterMode, setFilterMode] = useState<'HOY' | 'AYER' | '7_DIAS' | 'ULTIMO_MES_COMPLETO' | 'MES_EN_CURSO' | 'RANGO'>('HOY');
  const [customStart, setCustomStart] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().split('T')[0]);

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

  // Merge Shifts in useMemo with deduplication so re-emitted cuts don't inflate totals
  const shifts = useMemo(() => {
    const merged: ExtendedShift[] = [];
    const seenIds = new Set<string>();

    cashCuts.forEach(c => {
      seenIds.add(c.shiftId);
      merged.push({ ...c, sourceCollection: 'cash_cuts' });
    });

    userShifts.forEach(s => {
      if (!seenIds.has(s.shiftId)) {
        merged.push({ ...s, sourceCollection: 'user_shifts' });
      }
    });

    // Run smart deduplication so superseded cuts don't duplicate amounts
    return analyzeShiftDuplicates(merged).deduplicatedShifts;
  }, [userShifts, cashCuts]);

  // Compute Active Range Milliseconds
  const range = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    switch (filterMode) {
      case 'HOY':
        break;
      case 'AYER':
        start.setDate(now.getDate() - 1);
        end.setDate(now.getDate() - 1);
        break;
      case '7_DIAS':
        start.setDate(now.getDate() - 6);
        break;
      case 'ULTIMO_MES_COMPLETO': {
        const prevMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const prevMonthIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        start = new Date(prevMonthYear, prevMonthIndex, 1, 0, 0, 0, 0);
        end = new Date(prevMonthYear, prevMonthIndex + 1, 0, 23, 59, 59, 999);
        break;
      }
      case 'MES_EN_CURSO':
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'RANGO':
        if (customStart) {
          const [y, m, d] = customStart.split('-').map(Number);
          start = new Date(y, m - 1, d, 0, 0, 0, 0);
        }
        if (customEnd) {
          const [y, m, d] = customEnd.split('-').map(Number);
          end = new Date(y, m - 1, d, 23, 59, 59, 999);
        }
        break;
    }
    return { startMs: start.getTime(), endMs: end.getTime() };
  }, [filterMode, customStart, customEnd]);

  // Filtered Parking Records inside Range
  const filteredRecords = useMemo(() => {
    return records.filter(r => r.entryTime >= range.startMs && r.entryTime <= range.endMs);
  }, [records, range]);

  // Filtered Shifts inside Range (accounting for shifts whose startTime OR endTime falls within range)
  const filteredShifts = useMemo(() => {
    return shifts.filter(s => {
      const startInRange = s.startTime >= range.startMs && s.startTime <= range.endMs;
      const endInRange = s.endTime ? (s.endTime >= range.startMs && s.endTime <= range.endMs) : false;
      return startInRange || endInRange;
    });
  }, [shifts, range]);

  // Calculations for Filtered Period
  const totalEntradas = filteredRecords.length;
  const totalSalidas = filteredRecords.filter(r => r.status === 'COMPLETED').length;
  const autosActivos = filteredRecords.filter(r => r.status === 'ACTIVE').length;
  const totalRecaudadoBoletos = filteredRecords.filter(r => r.status === 'COMPLETED').reduce((sum, r) => sum + (r.amountPaid || 0), 0);

  // Cortes y saldos del periodo (entregado, esperado y faltantes/saldos negativos)
  const { cortesEntregado, cortesEsperado, cortesFaltantesNegativos, cortesDiferenciaNeta } = useMemo(() => {
    let entregado = 0;
    let esperado = 0;
    let faltantes = 0;
    let difNeta = 0;

    filteredShifts.forEach(s => {
      // Exclude duplicate/superseded shifts from financial calculations
      if (s.isClosed && !s.isDuplicate) {
        entregado += (s.actualAmount || 0);
        esperado += (s.expectedAmount || 0);
        const diff = s.difference !== null && s.difference !== undefined 
          ? s.difference 
          : ((s.actualAmount !== null && s.actualAmount !== undefined) ? (s.actualAmount - (s.expectedAmount || 0)) : 0);
        difNeta += diff;
        if (diff < 0) {
          faltantes += diff;
        }
      }
    });

    return {
      cortesEntregado: entregado,
      cortesEsperado: esperado,
      cortesFaltantesNegativos: faltantes,
      cortesDiferenciaNeta: difNeta
    };
  }, [filteredShifts]);

  // Ingreso Real del periodo: descontando los faltantes / saldos negativos de cortes de caja
  const totalRecaudadoReal = Math.max(0, totalRecaudadoBoletos + cortesFaltantesNegativos);
  const totalRecaudado = totalRecaudadoReal;

  // Group stats by vehicle type for selected range
  const vehicleStats = useMemo(() => {
    const stats: { [key: string]: { count: number; revenue: number } } = {};
    filteredRecords.forEach(r => {
      const type = r.vehicleType || 'Auto';
      if (!stats[type]) {
        stats[type] = { count: 0, revenue: 0 };
      }
      stats[type].count += 1;
      if (r.status === 'COMPLETED') {
        stats[type].revenue += r.amountPaid || 0;
      }
    });
    return stats;
  }, [filteredRecords]);

  // Label helper for the current filter mode
  const filterLabel = useMemo(() => {
    switch (filterMode) {
      case 'HOY': return 'Hoy';
      case 'AYER': return 'Ayer';
      case '7_DIAS': return 'Últimos 7 días';
      case 'ULTIMO_MES_COMPLETO': {
        const now = new Date();
        const prevMonthIndex = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return `Último mes completo (${months[prevMonthIndex]})`;
      }
      case 'MES_EN_CURSO': {
        const now = new Date();
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return `Mes en curso (${months[now.getMonth()]})`;
      }
      case 'RANGO': return 'Rango Personalizado';
      default: return '';
    }
  }, [filterMode]);

  // Export to native multi-sheet Excel file (.xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumen General
    const resumenData = [
      ["Reporte de Estacionamiento - Plaza del Río"],
      ["Filtro de Fechas", filterLabel],
      ["Periodo", `${new Date(range.startMs).toLocaleDateString()} - ${new Date(range.endMs).toLocaleDateString()}`],
      ["Generado por", "Panel de Control"],
      ["Fecha de Exportación", new Date().toLocaleString()],
      [],
      ["Métrica de Vista General", "Valor"],
      ["Total Autos que Entraron", totalEntradas],
      ["Total Autos que Salieron (Cobrados)", totalSalidas],
      ["Autos que Quedan Activos en el Periodo", autosActivos],
      ["Recaudación Real Neta ($)", totalRecaudadoReal],
      ["Total Boletos en Sistema ($)", totalRecaudadoBoletos],
      ["Total Físico Entregado en Cortes ($)", cortesEntregado],
      ["Faltantes / Saldos Negativos en Cortes ($)", cortesFaltantesNegativos],
      ["Diferencia Neta de Cortes ($)", cortesDiferenciaNeta]
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen General");

    // Sheet 2: Por Tipo de Vehículo
    const vehiculosHeaders = [["Tipo de Vehículo", "Tickets Totales", "Recaudado ($)"]];
    const vehiculosRows = Object.entries(vehicleStats).map(([type, stats]) => {
      const s = stats as { count: number; revenue: number };
      return [type, s.count, s.revenue];
    });
    const wsVehiculos = XLSX.utils.aoa_to_sheet([...vehiculosHeaders, ...vehiculosRows]);
    XLSX.utils.book_append_sheet(wb, wsVehiculos, "Por Tipo de Vehículo");

    // Sheet 3: Cortes de Caja de Empleados
    const cortesHeaders = [["ID Registro", "Origen", "Cajero", "Fecha Inicio", "Fecha Fin", "Fondo Apertura ($)", "Monto Esperado ($)", "Monto Entregado ($)", "Diferencia ($)", "Estado", "Notas"]];
    const cortesRows = filteredShifts.map(s => [
      s.shiftId,
      s.sourceCollection === 'cash_cuts' ? 'Corte de Caja' : 'Turno Manual',
      `@${s.username}`,
      new Date(s.startTime).toLocaleString(),
      s.endTime ? new Date(s.endTime).toLocaleString() : 'N/A',
      s.initialAmount,
      s.expectedAmount,
      s.actualAmount !== null ? s.actualAmount : 'N/A',
      s.difference !== null ? s.difference : 'N/A',
      s.isClosed ? 'Cerrado' : 'Abierto',
      s.notes || ''
    ]);
    const wsCortes = XLSX.utils.aoa_to_sheet([...cortesHeaders, ...cortesRows]);
    XLSX.utils.book_append_sheet(wb, wsCortes, "Cortes de Caja de Empleados");

    // Sheet 4: Detalle de Boletos
    const boletosHeaders = [["Código Ticket", "Placa", "Tipo Vehículo", "Estado", "Entrada", "Salida", "Método Pago", "Monto Pagado ($)", "Registrado Por", "Cobrado Por", "Tipo Físico"]];
    const boletosRows = filteredRecords.map(r => [
      r.ticketCode,
      r.plate,
      r.vehicleType,
      r.status === 'ACTIVE' ? 'Activo (Adentro)' : 'Completado (Salida)',
      new Date(r.entryTime).toLocaleString(),
      r.exitTime ? new Date(r.exitTime).toLocaleString() : 'N/A',
      r.paymentMethod || 'N/A',
      r.amountPaid !== null ? r.amountPaid : 0,
      r.registeredBy,
      r.processedBy || 'N/A',
      r.physicalType || 'Normal'
    ]);
    const wsBoletos = XLSX.utils.aoa_to_sheet([...boletosHeaders, ...boletosRows]);
    XLSX.utils.book_append_sheet(wb, wsBoletos, "Detalle de Boletos");

    // Write workbook file
    XLSX.writeFile(wb, `Reporte_Plaza_del_Rio_${filterMode}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Export to native styled PDF file (.pdf)
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    let y = 15;

    // Header Frame & Logo Text
    doc.setFillColor(15, 23, 42); // slate-900 background
    doc.rect(0, 0, 210, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('PLAZA DEL RÍO - REPORTES', 14, 16);

    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Filtro: ${filterLabel} (${new Date(range.startMs).toLocaleDateString()} - ${new Date(range.endMs).toLocaleDateString()})`, 14, 23);
    doc.text(`Fecha de exportación: ${new Date().toLocaleString()}`, 14, 28);
    
    // Draw white rectangle logo mockup in corner
    doc.setFillColor(59, 130, 246); // blue-500
    doc.rect(168, 8, 28, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('PARKING', 174, 18);
    doc.text('ADMIN', 177, 23);

    y = 48;

    // 1. Executive Summary Box
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('1. VISTA GENERAL DE MÉTRICAS', 14, y);
    y += 5;
    
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(14, y, 196, y);
    y += 7;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // slate-600
    doc.text('Total Entradas (Autos):', 16, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(String(totalEntradas), 70, y);

    doc.setFont('Helvetica', 'bold');
    doc.text('Autos Activos (Quedan Adentro):', 110, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(String(autosActivos), 175, y);
    y += 6;

    doc.setFont('Helvetica', 'bold');
    doc.text('Total Salidas (Pagados):', 16, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(String(totalSalidas), 70, y);

    doc.setFont('Helvetica', 'bold');
    doc.text('Recaudación Real ($):', 110, y);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(`$${totalRecaudadoReal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`, 175, y);
    y += 5;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Boletos: $${totalRecaudadoBoletos.toFixed(2)} | Cortes físicos: $${cortesEntregado.toFixed(2)} | Faltantes en cortes: -$${Math.abs(cortesFaltantesNegativos).toFixed(2)}`, 16, y);
    y += 7;

    // 2. Vehicle Stats
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('2. INGRESOS POR TIPO DE VEHÍCULO', 14, y);
    y += 5;
    doc.line(14, y, 196, y);
    y += 6;

    // Table Headers
    doc.setFillColor(241, 245, 249); // slate-100
    doc.rect(14, y, 182, 6, 'F');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Categoría de Vehículo', 16, y + 4.5);
    doc.text('Tickets Registrados', 90, y + 4.5);
    doc.text('Total Recaudado', 150, y + 4.5);
    y += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    
    const statsEntries = Object.entries(vehicleStats);
    if (statsEntries.length === 0) {
      doc.text('No se registraron cobros en este periodo.', 16, y + 5);
      y += 8;
    } else {
      statsEntries.forEach(([type, stats]) => {
        const s = stats as { count: number; revenue: number };
        doc.line(14, y, 196, y);
        doc.text(type, 16, y + 4.5);
        doc.text(String(s.count), 90, y + 4.5);
        doc.text(`$${s.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`, 150, y + 4.5);
        y += 6;
      });
    }
    y += 10;

    // 3. Employee Shifts
    if (y > 230) { doc.addPage(); y = 15; }
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('3. TURNOS Y CORTES DE EMPLEADOS', 14, y);
    y += 5;
    doc.line(14, y, 196, y);
    y += 6;

    // Table Headers
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 6, 'F');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Cajero', 16, y + 4.5);
    doc.text('Inicio de Turno', 45, y + 4.5);
    doc.text('Monto Esperado', 95, y + 4.5);
    doc.text('Físico Entregado', 130, y + 4.5);
    doc.text('Diferencia', 165, y + 4.5);
    y += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(30, 41, 59);

    if (filteredShifts.length === 0) {
      doc.text('No hay registros de turnos o cortes en este periodo.', 16, y + 5);
      y += 8;
    } else {
      filteredShifts.forEach(s => {
        if (y > 270) { doc.addPage(); y = 15; }
        doc.line(14, y, 196, y);
        doc.text(`@${s.username}`, 16, y + 4.5);
        doc.text(new Date(s.startTime).toLocaleDateString() + ' ' + new Date(s.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 45, y + 4.5);
        doc.text(`$${s.expectedAmount.toFixed(2)}`, 95, y + 4.5);
        doc.text(s.actualAmount !== null ? `$${s.actualAmount.toFixed(2)}` : 'Abierto', 130, y + 4.5);
        
        if (s.difference !== null) {
          const diffText = `$${s.difference.toFixed(2)}`;
          if (s.difference < 0) {
            doc.setTextColor(239, 68, 68); // red-500
          } else if (s.difference > 0) {
            doc.setTextColor(59, 130, 246); // blue-500
          } else {
            doc.setTextColor(16, 185, 129); // emerald-500
          }
          doc.text(diffText, 165, y + 4.5);
          doc.setTextColor(30, 41, 59); // reset
        } else {
          doc.text('N/A', 165, y + 4.5);
        }
        y += 6;
      });
    }
    y += 10;

    // 4. Ticket Details
    if (y > 220) { doc.addPage(); y = 15; }
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('4. HISTORIAL DETALLADO DE BOLETOS', 14, y);
    y += 5;
    doc.line(14, y, 196, y);
    y += 6;

    // Table Headers
    doc.setFillColor(241, 245, 249);
    doc.rect(14, y, 182, 6, 'F');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Ticket', 16, y + 4.5);
    doc.text('Placa', 40, y + 4.5);
    doc.text('Categoría', 65, y + 4.5);
    doc.text('Entrada', 95, y + 4.5);
    doc.text('Monto Cobrado', 145, y + 4.5);
    doc.text('Estado', 175, y + 4.5);
    y += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(30, 41, 59);

    if (filteredRecords.length === 0) {
      doc.text('No hay boletos registrados en el periodo seleccionado.', 16, y + 5);
    } else {
      // Show first 60 records in PDF to keep file lightweight and fast
      const maxPdfRecords = filteredRecords.slice(0, 100);
      maxPdfRecords.forEach(r => {
        if (y > 270) { doc.addPage(); y = 15; }
        doc.line(14, y, 196, y);
        doc.text(r.ticketCode, 16, y + 4.5);
        doc.text(r.plate, 40, y + 4.5);
        doc.text(r.vehicleType, 65, y + 4.5);
        doc.text(new Date(r.entryTime).toLocaleDateString() + ' ' + new Date(r.entryTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 95, y + 4.5);
        doc.text(r.amountPaid !== null ? `$${r.amountPaid.toFixed(2)}` : '$0.00', 145, y + 4.5);
        doc.text(r.status === 'ACTIVE' ? 'Adentro' : 'Cobrado', 175, y + 4.5);
        y += 6;
      });

      if (filteredRecords.length > 100) {
        doc.setFont('Helvetica', 'italic');
        doc.setTextColor(100, 116, 139);
        doc.text(`* Mostrando los primeros 100 de ${filteredRecords.length} boletos. El reporte de Excel contiene la totalidad de los datos.`, 16, y + 5);
      }
    }

    doc.save(`Reporte_Plaza_del_Rio_${filterMode}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Trigger Print to PDF/Window Layout
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <Loader2 size={40} className="animate-spin text-blue-500 mb-3" />
        <p className="text-sm font-medium">Sincronizando base de datos en tiempo real...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1.5 md:p-3 max-w-7xl mx-auto font-sans text-slate-300 print:bg-white print:text-slate-900 print:p-0">
      
      {/* View Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3.5">
          <img src="/logo-plaza-1.jpg" alt="Logo" className="w-14 h-14 rounded-2xl object-cover border border-slate-700/60 shadow-lg" onError={(e) => {
            e.currentTarget.style.display = 'none';
          }} />
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Módulo de Reportes</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-4 py-2 rounded-2xl text-xs text-blue-400 font-semibold w-fit shadow-md">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          Datos en Tiempo Real
        </div>
      </div>

      {/* Date Filters Container */}
      <div className="bg-slate-800/40 border border-slate-700/40 rounded-3xl p-6 shadow-xl space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2 text-white font-semibold">
            <Filter size={18} className="text-blue-400" />
            <span>Filtros de Período</span>
          </div>
        </div>

        {/* Filter Buttons Layout */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'HOY', label: 'Hoy' },
            { id: 'AYER', label: 'Ayer' },
            { id: '7_DIAS', label: 'Últimos 7 días' },
            { id: 'MES_EN_CURSO', label: 'Mes en curso' },
            { id: 'ULTIMO_MES_COMPLETO', label: 'Último mes completo' },
            { id: 'RANGO', label: 'Rango Personalizado' }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setFilterMode(mode.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterMode === mode.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/15 border border-blue-500'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Conditional Custom Date Picker Range */}
        {filterMode === 'RANGO' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md pt-2 bg-slate-900/40 p-4 rounded-2xl border border-slate-800 animate-fade-in">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fecha Desde</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fecha Hasta</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Export Buttons bar */}
      <div className="flex flex-wrap gap-3 items-center justify-end print:hidden">
        <button
          onClick={handleExportExcel}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/10 active:scale-95 transition-all cursor-pointer"
        >
          <FileSpreadsheet size={16} />
          Exportar a Excel
        </button>
        <button
          onClick={handleExportPDF}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-600/10 active:scale-95 transition-all cursor-pointer"
        >
          <FileText size={16} />
          Descargar PDF
        </button>
        <button
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl shadow-lg active:scale-95 transition-all cursor-pointer"
        >
          <Printer size={16} />
          Imprimir / Guardar Local
        </button>
      </div>

      {/* Print View Header Banner */}
      <div className="hidden print:flex items-center justify-between border-b border-slate-300 pb-4 mb-6">
        <div className="flex items-center gap-4">
          <img src="/logo-plaza-1.jpg" alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Estacionamiento Plaza del Río</h1>
            <p className="text-xs text-slate-500">Reporte de Operaciones General</p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p className="font-bold text-slate-800">Filtro: {filterLabel}</p>
          <p>Periodo: {new Date(range.startMs).toLocaleDateString()} - {new Date(range.endMs).toLocaleDateString()}</p>
          <p className="text-[10px] mt-0.5">Impreso: {new Date().toLocaleString()}</p>
        </div>
      </div>

      {/* Report Content Grid */}
      <div className="space-y-6 print:space-y-8">
        
        {/* Executive Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
          
          <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-2xl shadow-lg flex items-center gap-4 print:bg-slate-50 print:border-slate-300 print:shadow-none print:text-slate-900">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl print:bg-blue-100 print:text-blue-700">
              <Car size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block print:text-slate-500">Total Entradas</span>
              <span className="text-2xl font-extrabold text-white print:text-slate-900">{totalEntradas}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 print:text-slate-500">Autos ingresados</span>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-2xl shadow-lg flex items-center gap-4 print:bg-slate-50 print:border-slate-300 print:shadow-none print:text-slate-900">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl print:bg-emerald-100 print:text-emerald-700">
              <CheckCircle size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block print:text-slate-500">Total Salidas</span>
              <span className="text-2xl font-extrabold text-white print:text-slate-900">{totalSalidas}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 print:text-slate-500">Tickets cobrados</span>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-2xl shadow-lg flex items-center gap-4 print:bg-slate-50 print:border-slate-300 print:shadow-none print:text-slate-900">
            <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-xl print:bg-purple-100 print:text-purple-700">
              <Clock size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block print:text-slate-500">Autos Activos</span>
              <span className="text-2xl font-extrabold text-white print:text-slate-900">{autosActivos}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5 print:text-slate-500">Aún en estacionamiento</span>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-2xl shadow-lg flex items-center gap-4 print:bg-slate-50 print:border-slate-300 print:shadow-none print:text-slate-900">
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl print:bg-yellow-100 print:text-yellow-700">
              <DollarSign size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block print:text-slate-500">Ingresos Reales Periodo</span>
              <span className="text-2xl font-extrabold text-emerald-400 print:text-emerald-700">${totalRecaudadoReal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {cortesFaltantesNegativos < 0 ? (
                <span className="text-[10px] text-red-400 font-semibold block mt-0.5 print:text-red-700">
                  Deducidos -${Math.abs(cortesFaltantesNegativos).toFixed(2)} por saldos negativos en cortes
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 block mt-0.5 print:text-slate-500">Monto neto real recaudado</span>
              )}
            </div>
          </div>

        </div>

        {/* Secondary Report details split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:grid-cols-12 print:gap-4">
          
          {/* Revenue by Vehicle Type Card */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-3xl p-6 shadow-xl lg:col-span-4 print:col-span-12 print:bg-white print:border-slate-300 print:shadow-none print:p-2">
            <h3 className="text-md font-bold text-white flex items-center gap-2 pb-4 border-b border-slate-700/40 print:text-slate-800 print:border-slate-300">
              <BarChart3 size={18} className="text-blue-400 print:text-slate-700" />
              Por Tipo de Vehículo
            </h3>
            
            <div className="mt-4 space-y-3.5">
              {Object.entries(vehicleStats).length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs">No hay datos de vehículos para este período.</div>
              ) : (
                Object.entries(vehicleStats).map(([type, stats]) => {
                  const s = stats as { count: number; revenue: number };
                  return (
                    <div key={type} className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800 rounded-2xl print:bg-slate-50 print:border-slate-200">
                      <div>
                        <span className="font-bold text-white block text-sm print:text-slate-800">{type}</span>
                        <span className="text-xs text-slate-500">{s.count} boletos</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-400 print:text-emerald-700">${s.revenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Cuts / Shifts Table */}
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-3xl p-6 shadow-xl lg:col-span-8 print:col-span-12 print:bg-white print:border-slate-300 print:shadow-none print:p-2">
            <h3 className="text-md font-bold text-white flex items-center gap-2 pb-4 border-b border-slate-700/40 print:text-slate-800 print:border-slate-300">
              <History size={18} className="text-blue-400 print:text-slate-700" />
              Cortes de Caja de los Empleados
            </h3>
            
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 font-bold print:border-slate-300 print:text-slate-600">
                    <th className="py-2">Cajero</th>
                    <th className="py-2">Inicio de Turno</th>
                    <th className="py-2">Fin de Turno</th>
                    <th className="py-2 text-right">Esperado</th>
                    <th className="py-2 text-right">Entregado</th>
                    <th className="py-2 text-right">Diferencia</th>
                    <th className="py-2">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 print:divide-slate-200 print:text-slate-800">
                  {filteredShifts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">No hay turnos registrados en este período.</td>
                    </tr>
                  ) : (
                    filteredShifts.map((s) => (
                      <tr 
                        key={s.shiftId} 
                        className={`hover:bg-slate-800/10 print:hover:bg-transparent ${s.isDuplicate ? 'bg-amber-950/20' : ''}`}
                      >
                        <td className="py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-white print:text-slate-900">@{s.username}</span>
                            <span className="font-mono text-[10px] text-blue-400">{s.shiftId}</span>
                            {s.isDuplicate && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 w-fit mt-0.5">
                                <AlertTriangle size={9} /> Re-emitido
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">{new Date(s.startTime).toLocaleDateString()} {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-3">{s.endTime ? `${new Date(s.endTime).toLocaleDateString()} ${new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-500/20 text-[10px] print:text-emerald-700 font-bold">Activo</span>}</td>
                        <td className="py-3 text-right font-mono font-medium">
                          {s.isDuplicate ? (
                            <span className="line-through text-slate-500" title="Excluido de totales para evitar duplicación">${s.expectedAmount.toFixed(2)}</span>
                          ) : (
                            <span>${s.expectedAmount.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-3 text-right font-mono font-medium">
                          {s.isDuplicate ? (
                            <span className="line-through text-slate-500" title="Excluido de totales">${s.actualAmount !== null ? `$${s.actualAmount.toFixed(2)}` : 'N/A'}</span>
                          ) : (
                            <span>{s.actualAmount !== null ? `$${s.actualAmount.toFixed(2)}` : 'N/A'}</span>
                          )}
                        </td>
                        <td className={`py-3 text-right font-mono font-bold ${s.difference !== null ? (s.difference < 0 ? 'text-red-400 print:text-red-600' : s.difference > 0 ? 'text-blue-400 print:text-blue-600' : 'text-emerald-400 print:text-emerald-600') : ''}`}>
                          {s.difference !== null ? (s.difference === 0 ? '$0.00' : `${s.difference > 0 ? '+' : ''}$${s.difference.toFixed(2)}`) : 'N/A'}
                        </td>
                        <td className="py-3 max-w-[150px] text-slate-400 text-[11px]" title={s.notes}>
                          {s.notes ? (
                            <span className="text-slate-200 font-medium">{s.notes}</span>
                          ) : (
                            <span className="text-slate-500 italic">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Detailed Records Listing */}
        <div className="bg-slate-800/50 border border-slate-700/40 rounded-3xl p-6 shadow-xl print:bg-white print:border-slate-300 print:shadow-none print:p-2">
          <h3 className="text-md font-bold text-white flex items-center gap-2 pb-4 border-b border-slate-700/40 print:text-slate-800 print:border-slate-300">
            <FileText size={18} className="text-blue-400 print:text-slate-700" />
            Detalle de Boletos y Tickets de Estacionamiento ({filteredRecords.length})
          </h3>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 font-bold print:border-slate-300 print:text-slate-600">
                  <th className="py-2.5">Código</th>
                  <th className="py-2.5">Placa</th>
                  <th className="py-2.5">Categoría</th>
                  <th className="py-2.5">Fecha Entrada</th>
                  <th className="py-2.5">Fecha Salida</th>
                  <th className="py-2.5">Cajero Entrada</th>
                  <th className="py-2.5">Cajero Cobro</th>
                  <th className="py-2.5">Método Pago</th>
                  <th className="py-2.5 text-right">Monto Pagado</th>
                  <th className="py-2.5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 print:divide-slate-200 print:text-slate-800">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-slate-500">No hay boletos registrados en el período filtrado.</td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.ticketCode} className="hover:bg-slate-800/10 print:hover:bg-transparent">
                      <td className="py-3 font-mono font-bold text-blue-400 print:text-blue-700">{r.ticketCode}</td>
                      <td className="py-3 font-semibold text-white print:text-slate-900">{r.plate}</td>
                      <td className="py-3">{r.vehicleType}</td>
                      <td className="py-3 text-slate-400 print:text-slate-700">{new Date(r.entryTime).toLocaleString()}</td>
                      <td className="py-3 text-slate-400 print:text-slate-700">{r.exitTime ? new Date(r.exitTime).toLocaleString() : 'N/A'}</td>
                      <td className="py-3 text-slate-400 print:text-slate-700">@{r.registeredBy}</td>
                      <td className="py-3 text-slate-400 print:text-slate-700">{r.processedBy ? `@${r.processedBy}` : 'N/A'}</td>
                      <td className="py-3">{r.paymentMethod || 'N/A'}</td>
                      <td className="py-3 text-right font-mono font-medium">${(r.amountPaid || 0).toFixed(2)}</td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          r.status === 'ACTIVE'
                            ? 'bg-blue-400/10 text-blue-400 border border-blue-400/20 print:bg-blue-100 print:text-blue-700'
                            : 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 print:bg-emerald-100 print:text-emerald-700'
                        }`}>
                          {r.status === 'ACTIVE' ? 'Adentro' : 'Cobrado'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
