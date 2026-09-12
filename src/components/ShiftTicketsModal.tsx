import React, { useState, useMemo } from 'react';
import { 
  X, 
  Car, 
  Search, 
  CreditCard, 
  Banknote, 
  Clock, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  ArrowRight,
  TrendingDown,
  DollarSign
} from 'lucide-react';
import { ParkingRecord, UserShift } from '../types';
import { reconcileShiftRecords } from '../lib/shiftReconciliation';

interface ShiftTicketsModalProps {
  shift: UserShift;
  records: ParkingRecord[];
  onClose: () => void;
  getLotName: (id: number) => string;
}

export default function ShiftTicketsModal({
  shift,
  records,
  onClose,
  getLotName,
}: ShiftTicketsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'TODOS' | 'EFECTIVO' | 'TARJETA'>('TODOS');

  // Reconcile records for this shift
  const reconciliation = useMemo(() => {
    return reconcileShiftRecords(shift, records);
  }, [shift, records]);

  const {
    carsCount,
    totalChargedInCars,
    expectedAmount,
    actualAmount,
    differenceToExpected,
    matchesExpected,
    matchedRecords
  } = reconciliation;

  // Filter tickets by search and payment method
  const filteredRecords = useMemo(() => {
    return matchedRecords.filter((rec) => {
      // Payment method filter
      if (methodFilter === 'EFECTIVO' && rec.paymentMethod !== 'EFECTIVO') return false;
      if (methodFilter === 'TARJETA' && rec.paymentMethod !== 'TARJETA') return false;

      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchPlate = rec.plate?.toLowerCase().includes(q);
      const matchFolio = rec.id?.toLowerCase().includes(q);
      const matchType = rec.vehicleType?.toLowerCase().includes(q);
      return matchPlate || matchFolio || matchType;
    });
  }, [matchedRecords, searchQuery, methodFilter]);

  const lotId = shift.parkingLotId ?? 1;
  const startDateStr = new Date(shift.startTime).toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const endDateStr = shift.endTime
    ? new Date(shift.endTime).toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Turno activo en curso';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3 py-4 md:p-6 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-850 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-slate-700/80 bg-slate-800/40 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
                {shift.shiftId}
              </span>
              <span className="text-xs font-semibold text-white bg-slate-700/60 px-2.5 py-1 rounded-lg border border-slate-600/50">
                Cajero: <strong className="text-blue-300">@{shift.username}</strong>
              </span>
              <span className="text-xs font-medium text-slate-300 bg-slate-700/40 px-2.5 py-1 rounded-lg border border-slate-600/40 flex items-center gap-1.5">
                <Building2 size={12} className="text-blue-400" />
                Lote #{lotId}: {getLotName(lotId)}
              </span>
            </div>
            <h3 className="text-lg md:text-xl font-extrabold text-white flex items-center gap-2 pt-1">
              <Car className="text-blue-400 shrink-0" size={22} />
              Detalle de Autos Cobrados en este Corte
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
              <Clock size={12} className="text-slate-500 shrink-0" />
              <span>{startDateStr}</span>
              <ArrowRight size={11} className="text-slate-500" />
              <span>{endDateStr}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-700/50 transition-colors cursor-pointer shrink-0"
            title="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Reconciliation Comparison Cards */}
        <div className="p-5 md:p-6 bg-slate-900/40 border-b border-slate-700/60 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Card 1: Autos Cobrados */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Autos Cobrados</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-white">{carsCount}</span>
                <span className="text-xs font-mono font-bold text-emerald-400">${totalChargedInCars.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Suma de tickets del turno</span>
            </div>

            {/* Card 2: Debió Entregar (Esperado) */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Debió Entregar (Esperado)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-200">${expectedAmount.toFixed(2)}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Cálculo registrado en corte</span>
            </div>

            {/* Card 3: Entregó al Final (Físico) */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Entregó al Final (Físico)</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-emerald-400">
                  {actualAmount !== null ? `$${actualAmount.toFixed(2)}` : 'Pendiente'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Efectivo físico entregado</span>
            </div>

            {/* Card 4: Cuadre Final */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Diferencia de Cuadre</span>
              <div className="mt-2">
                {shift.difference !== null ? (
                  <span className={`text-2xl font-black ${
                    shift.difference === 0 ? 'text-emerald-400' : shift.difference < 0 ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {shift.difference > 0 
                      ? `+$${shift.difference.toFixed(2)}` 
                      : shift.difference < 0 
                        ? `-$${Math.abs(shift.difference).toFixed(2)}` 
                        : '$0.00'}
                  </span>
                ) : (
                  <span className="text-2xl font-black text-slate-500">-</span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Físico entregado vs Esperado</span>
            </div>
          </div>

          {/* Validation & Coincidence Insight Banner */}
          <div className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
            matchesExpected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : differenceToExpected > 0
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-200'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          }`}>
            {matchesExpected ? (
              <CheckCircle2 size={18} className="shrink-0 text-emerald-400 mt-0.5" />
            ) : differenceToExpected > 0 ? (
              <HelpCircle size={18} className="shrink-0 text-blue-400 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="shrink-0 text-amber-400 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-bold">
                {matchesExpected
                  ? '✓ Coincidencia exacta de cobros con el corte'
                  : differenceToExpected > 0
                    ? `Diferencia de +$${differenceToExpected.toFixed(2)} entre lo esperado y los boletos cobrados`
                    : `Discrepancia de -$${Math.abs(differenceToExpected).toFixed(2)} entre lo esperado y los boletos cobrados`}
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                {matchesExpected ? (
                  <>La suma de los {carsCount} boletos cobrados (${totalChargedInCars.toFixed(2)}) cuadra al 100% con el monto esperado del sistema (${expectedAmount.toFixed(2)}).</>
                ) : differenceToExpected > 0 ? (
                  <>
                    El monto esperado por sistema (${expectedAmount.toFixed(2)}) supera los boletos cobrados (${totalChargedInCars.toFixed(2)}) por <strong>+${differenceToExpected.toFixed(2)}</strong>. En este sistema esto típicamente corresponde a un <strong>fondo inicial de caja</strong> (ej. $100 o $200 asignados al cajero al iniciar turno) o ingresos adicionales.
                  </>
                ) : (
                  <>
                    Los boletos cobrados registrados en sistema (${totalChargedInCars.toFixed(2)}) son mayores al monto esperado de corte (${expectedAmount.toFixed(2)}). Puede deberse a pagos cancelados, cortes parciales o boletos facturados fuera de este arqueo.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 border-b border-slate-700/60 bg-slate-800/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-700/60 w-full sm:w-72">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Buscar por placa, folio o tipo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Payment Method Badges */}
          <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-700/50 text-xs">
            {(['TODOS', 'EFECTIVO', 'TARJETA'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethodFilter(m)}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  methodFilter === m
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'TODOS' ? 'Todos los métodos' : m === 'EFECTIVO' ? 'Efectivo' : 'Tarjeta'}
              </button>
            ))}
          </div>
        </div>

        {/* Table of Processed Cars / Tickets */}
        <div className="flex-1 overflow-y-auto">
          {filteredRecords.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-800 border-b border-slate-700 text-slate-400 uppercase tracking-wider font-bold text-[10px]">
                <tr>
                  <th className="py-3 px-4 font-mono">Boleto / Folio</th>
                  <th className="py-3 px-4">Placa</th>
                  <th className="py-3 px-4">Vehículo</th>
                  <th className="py-3 px-4">Entrada</th>
                  <th className="py-3 px-4">Cobro / Salida</th>
                  <th className="py-3 px-4">Método</th>
                  <th className="py-3 px-5 text-right">Monto Pagado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300 font-medium">
                {filteredRecords.map((rec) => {
                  const entryDate = rec.entryTime ? new Date(rec.entryTime) : null;
                  const exitDate = rec.exitTime ? new Date(rec.exitTime) : null;

                  return (
                    <tr key={rec.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-400">
                        {rec.id}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono font-bold text-white">
                          {rec.plate}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize text-slate-300 font-semibold">{rec.vehicleType}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {entryDate ? entryDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {exitDate ? exitDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {rec.paymentMethod === 'TARJETA' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                            <CreditCard size={10} /> Tarjeta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                            <Banknote size={10} /> Efectivo
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right font-mono font-bold text-white">
                        ${(rec.amountPaid || 0).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-16 text-center text-slate-500 space-y-2">
              <Car size={32} className="mx-auto text-slate-600 mb-2" />
              <p className="font-semibold text-slate-400 text-sm">No se encontraron boletos con los filtros aplicados</p>
              <p className="text-xs text-slate-500">
                {matchedRecords.length === 0
                  ? 'No hay registros de autos asociados a la ventana de tiempo de este turno.'
                  : 'Intenta limpiar el campo de búsqueda o cambiar el método de pago.'}
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-700/80 bg-slate-800/40 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span>
              Mostrando <strong className="text-white">{filteredRecords.length}</strong> de <strong className="text-white">{carsCount}</strong> autos
            </span>
            <span>
              Suma en tabla: <strong className="text-emerald-400 font-mono font-bold">
                ${filteredRecords.reduce((sum, r) => sum + (r.amountPaid || 0), 0).toFixed(2)}
              </strong>
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all cursor-pointer"
          >
            Cerrar Detalle
          </button>
        </div>
      </div>
    </div>
  );
}
