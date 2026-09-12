import React, { useState } from 'react';
import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { getDb, sha256 } from '../lib/firebase';
import { Database, AlertTriangle, Check, Loader2 } from 'lucide-react';

interface DemoSeederProps {
  onSeedComplete?: () => void;
}

export default function DemoSeeder({ onSeedComplete }: DemoSeederProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seedData = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const db = getDb();
      
      const pHash = await sha256('admin123');
      const cHash = await sha256('cajero123');

      // 1. Users
      const users = {
        'admin': { username: 'admin', fullName: 'Administrador Plaza del Río', passwordHash: pHash, role: 'ADMIN', isActive: true },
        'cajero1': { username: 'cajero1', fullName: 'Juan Pérez García', passwordHash: cHash, role: 'EMPLOYEE', isActive: true },
        'cajero2': { username: 'cajero2', fullName: 'María López Solís', passwordHash: cHash, role: 'EMPLOYEE', isActive: true },
        'cajero_inactivo': { username: 'cajero_old', fullName: 'Pedro Ramírez (Inactivo)', passwordHash: cHash, role: 'EMPLOYEE', isActive: false }
      };

      for (const [username, uData] of Object.entries(users)) {
        await setDoc(doc(db, 'users', username), uData);
      }

      // 2. Vehicle Type Rates
      const rates = {
        'Auto': { typeName: 'Auto', hourlyRate: 20, isDefault: true },
        'Motocicleta': { typeName: 'Motocicleta', hourlyRate: 10, isDefault: false },
        'Camioneta/SUV': { typeName: 'Camioneta/SUV', hourlyRate: 30, isDefault: false }
      };

      for (const [typeName, rData] of Object.entries(rates)) {
        await setDoc(doc(db, 'vehicle_type_rates', typeName), rData);
      }

      // 3. Ticket Config
      const ticketConfig = {
        headerText: 'PLAZA DEL RÍO - PARKING',
        termsText: 'Este boleto ampara únicamente el depósito del vehículo. No nos hacemos responsables por pérdidas de objetos personales, fallas mecánicas o siniestros ajenos a nuestro control. Favor de conservar su boleto.',
        showLogo: true,
        showTerms: true,
        exitShowFolio: true
      };
      await setDoc(doc(db, 'ticket_config', 'config'), ticketConfig);

      // Timestamps relative to now
      const now = Date.now();
      const hour = 3600000;
      const day = 24 * hour;

      // 4. Prepaid Vehicles (Pensions)
      const prepaids = {
        'XYZ-9876': { plate: 'XYZ-9876', ownerName: 'Esteban Martínez', validUntil: now + 15 * day, notes: 'Auto sedán azul, pensión mensual completa.', paymentType: 'MES_COMPLETO', specificDays: null, maxDaysAllowed: null },
        'ABC-1234': { plate: 'ABC-1234', ownerName: 'Lucía Fernández', validUntil: now - 2 * day, notes: 'Vencida hace 2 días, reportó que pagaría el lunes.', paymentType: 'MES_COMPLETO', specificDays: null, maxDaysAllowed: null },
        'MOT-4433': { plate: 'MOT-4433', ownerName: 'Carlos Ruiz Segura', validUntil: now + 5 * day, notes: 'Motocicleta reparto, pase especial de lunes a viernes.', paymentType: 'PAGO_POR_DIAS', specificDays: 'Lun, Mar, Mié, Jue, Vie', maxDaysAllowed: 20 }
      };

      for (const [plate, pData] of Object.entries(prepaids)) {
        await setDoc(doc(db, 'prepaid_vehicles', plate), pData);
      }

      // 5. User Shifts
      const shifts = {
        'shift_yesterday_1': {
          shiftId: 'shift_yesterday_1',
          username: 'cajero1',
          startTime: now - 32 * hour,
          endTime: now - 24 * hour,
          initialAmount: 200,
          expectedAmount: 980,
          collectedAmount: 980,
          actualAmount: 980,
          difference: 0,
          isClosed: true,
          notes: 'Turno sin novedades, todo cuadrado.'
        },
        'shift_yesterday_2': {
          shiftId: 'shift_yesterday_2',
          username: 'cajero2',
          startTime: now - 24 * hour,
          endTime: now - 16 * hour,
          initialAmount: 200,
          expectedAmount: 840,
          collectedAmount: 820,
          actualAmount: 820,
          difference: -20,
          isClosed: true,
          notes: 'Faltante de $20 pesos debido a redondeo de cambio.'
        },
        'shift_today_active': {
          shiftId: 'shift_today_active',
          username: 'cajero1',
          startTime: now - 4 * hour,
          endTime: null,
          initialAmount: 200,
          expectedAmount: 380,
          collectedAmount: null,
          actualAmount: null,
          difference: null,
          isClosed: false,
          notes: 'Turno matutino activo.'
        }
      };

      for (const [shiftId, sData] of Object.entries(shifts)) {
        await setDoc(doc(db, 'user_shifts', shiftId), sData);
      }

      // 6. Parking Records (History & Active Tickets)
      const records = [
        // Active Vehicles
        {
          ticketCode: 'PR-1001',
          plate: 'GWM-7762',
          vehicleType: 'Auto',
          entryTime: now - 3.5 * hour,
          exitTime: null,
          amountPaid: null,
          paymentMethod: null,
          status: 'ACTIVE',
          registeredBy: 'cajero1',
          processedBy: null,
          shiftId: 'shift_today_active',
          description: 'Auto Toyota gris, abolladura leve en puerta trasera.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-1002',
          plate: 'MXP-4491',
          vehicleType: 'Motocicleta',
          entryTime: now - 2 * hour,
          exitTime: null,
          amountPaid: null,
          paymentMethod: null,
          status: 'ACTIVE',
          registeredBy: 'cajero1',
          processedBy: null,
          shiftId: 'shift_today_active',
          description: 'Moto Italika negra con casco en manubrio.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-1003',
          plate: 'VEX-8821',
          vehicleType: 'Camioneta/SUV',
          entryTime: now - 0.5 * hour,
          exitTime: null,
          amountPaid: null,
          paymentMethod: null,
          status: 'ACTIVE',
          registeredBy: 'cajero1',
          processedBy: null,
          shiftId: 'shift_today_active',
          description: 'Camioneta Honda CRV blanca.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-1004',
          plate: 'XYZ-9876', // Pensionado
          vehicleType: 'Auto',
          entryTime: now - 1 * hour,
          exitTime: null,
          amountPaid: 0,
          paymentMethod: 'Efectivo',
          status: 'ACTIVE',
          registeredBy: 'cajero1',
          processedBy: null,
          shiftId: 'shift_today_active',
          description: 'PENSIONADO ACTIVO - Esteban Martínez',
          paidAtEntry: true,
          physicalType: 'Pensión'
        },
        // Completed Records (Today)
        {
          ticketCode: 'PR-0995',
          plate: 'FGT-2211',
          vehicleType: 'Auto',
          entryTime: now - 8 * hour,
          exitTime: now - 7 * hour,
          amountPaid: 20,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_today_active',
          description: 'Auto Nissan Versa rojo.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0996',
          plate: 'JKL-4567',
          vehicleType: 'Camioneta/SUV',
          entryTime: now - 6 * hour,
          exitTime: now - 4 * hour,
          amountPaid: 60,
          paymentMethod: 'Tarjeta',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_today_active',
          description: 'Jeep Wrangler negro.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0997',
          plate: 'OPM-2311',
          vehicleType: 'Motocicleta',
          entryTime: now - 5 * hour,
          exitTime: now - 2 * hour,
          amountPaid: 30,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_today_active',
          description: 'Vespa azul.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0998',
          plate: 'CVX-1122',
          vehicleType: 'Auto',
          entryTime: now - 4 * hour,
          exitTime: now - 2 * hour,
          amountPaid: 40,
          paymentMethod: 'Tarjeta',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_today_active',
          description: 'Mazda 3 gris.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0999',
          plate: 'PPW-0901',
          vehicleType: 'Auto',
          entryTime: now - 3 * hour,
          exitTime: now - 1 * hour,
          amountPaid: 40,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_today_active',
          description: 'Kia Forte blanco.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        // Completed Records (Yesterday)
        {
          ticketCode: 'PR-0980',
          plate: 'ZZX-8901',
          vehicleType: 'Auto',
          entryTime: now - 28 * hour,
          exitTime: now - 25 * hour,
          amountPaid: 60,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_yesterday_1',
          description: 'Chevrolet Aveo gris.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0981',
          plate: 'TTR-3344',
          vehicleType: 'Camioneta/SUV',
          entryTime: now - 27 * hour,
          exitTime: now - 23 * hour,
          amountPaid: 120,
          paymentMethod: 'Tarjeta',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_yesterday_1',
          description: 'Ford Explorer roja.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0982',
          plate: 'NMO-1234',
          vehicleType: 'Motocicleta',
          entryTime: now - 26 * hour,
          exitTime: now - 24 * hour,
          amountPaid: 20,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          registeredBy: 'cajero1',
          processedBy: 'cajero1',
          shiftId: 'shift_yesterday_1',
          description: 'Yamaha azul.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0983',
          plate: 'LMN-7766',
          vehicleType: 'Auto',
          entryTime: now - 21 * hour,
          exitTime: now - 18 * hour,
          amountPaid: 60,
          paymentMethod: 'Efectivo',
          status: 'COMPLETED',
          registeredBy: 'cajero2',
          processedBy: 'cajero2',
          shiftId: 'shift_yesterday_2',
          description: 'Honda Civic gris.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0984',
          plate: 'POL-1199',
          vehicleType: 'Auto',
          entryTime: now - 20 * hour,
          exitTime: now - 19 * hour,
          amountPaid: 20,
          paymentMethod: 'Tarjeta',
          status: 'COMPLETED',
          registeredBy: 'cajero2',
          processedBy: 'cajero2',
          shiftId: 'shift_yesterday_2',
          description: 'VW Jetta blanco.',
          paidAtEntry: false,
          physicalType: 'Normal'
        },
        {
          ticketCode: 'PR-0985',
          plate: 'KHY-5522',
          vehicleType: 'Camioneta/SUV',
          entryTime: now - 18 * hour,
          exitTime: now - 16 * hour,
          amountPaid: 60,
          paymentMethod: 'Tarjeta',
          status: 'COMPLETED',
          registeredBy: 'cajero2',
          processedBy: 'cajero2',
          shiftId: 'shift_yesterday_2',
          description: 'Hyundai Tucson gris.',
          paidAtEntry: false,
          physicalType: 'Normal'
        }
      ];

      for (const rec of records) {
        await setDoc(doc(db, 'parking_records', rec.ticketCode), rec);
      }

      setSuccess(true);
      if (onSeedComplete) {
        onSeedComplete();
      }
    } catch (err: any) {
      console.error('Error seeding demo data:', err);
      setError(`Error al poblar datos: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-900/40 to-slate-900/40 border border-blue-500/30 rounded-2xl p-5 mb-8 flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-500/15 text-blue-400 rounded-xl border border-blue-500/25 shrink-0 mt-1">
          <Database size={24} className="animate-pulse" />
        </div>
        <div>
          <h4 className="font-bold text-white text-md">¿Base de datos lista pero sin datos reales aún?</h4>
          <p className="text-slate-300 text-xs mt-1 leading-relaxed max-w-xl">
            Sincroniza al instante un conjunto completo de datos reales de prueba en Firestore (15 registros, 3 tarifas, 3 turnos, configuraciones de ticket, 4 usuarios). Así podrás validar el Dashboard con gráficos, buscar folios y probar los cortes de caja de inmediato.
          </p>
        </div>
      </div>

      <div className="shrink-0 flex flex-col items-stretch md:items-end gap-2 w-full md:w-auto">
        <button
          onClick={seedData}
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/10 active:scale-95"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generando datos...
            </>
          ) : success ? (
            <>
              <Check size={14} className="text-emerald-400" />
              ¡Base de Datos Poblada!
            </>
          ) : (
            'Poblar Base de Datos de Prueba'
          )}
        </button>
        {success && (
          <span className="text-[10px] text-emerald-400 font-semibold text-center md:text-right">
            ¡Hecho! Recarga el Dashboard si es necesario.
          </span>
        )}
        {error && (
          <span className="text-[10px] text-red-400 font-semibold text-center md:text-right flex items-center gap-1">
            <AlertTriangle size={10} />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
