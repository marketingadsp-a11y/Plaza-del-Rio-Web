export interface User {
  username: string; // Document ID
  fullName: string;
  passwordHash: string;
  role: 'ADMIN' | 'EMPLOYEE';
  isActive: boolean;
  assignedParkingLot?: number | null; // e.g. 1, 2, or null for all/unassigned
}

export interface VehicleTypeRate {
  id?: string; // Document ID (e.g., "Hora_1", "Hora_2", "Auto")
  typeName: string; // Rate type name (e.g., "Hora", "Dia", "Auto")
  hourlyRate: number;
  isDefault: boolean;
  parkingLotId?: number;
  billingMode?: string;
}

export interface ParkingRecord {
  ticketCode: string; // Document ID
  plate: string;
  vehicleType: string;
  entryTime: number; // Milliseconds or timestamp. We'll store/read as milliseconds (number) or support conversions
  exitTime: number | null; // Milliseconds or null
  amountPaid: number | null;
  paymentMethod: 'Efectivo' | 'Tarjeta' | null;
  status: 'ACTIVE' | 'COMPLETED';
  registeredBy: string;
  processedBy: string | null;
  shiftId: string | null;
  description: string;
  paidAtEntry: boolean;
  physicalType: string | null;
  parkingLotId?: number | null;
}

export interface PrepaidVehicle {
  plate: string; // Document ID
  ownerName: string;
  validUntil: number; // Milliseconds (timestamp)
  notes: string | null;
  paymentType: 'MES_COMPLETO' | 'PAGO_POR_DIAS';
  specificDays: string | null; // e.g., "Lun, Mié, Vie"
  maxDaysAllowed: number | null;
}

export interface UserShift {
  shiftId: string; // Document ID
  username: string;
  startTime: number; // Milliseconds
  initialAmount: number;
  endTime: number | null; // Milliseconds or null
  isClosed: boolean;
  actualAmount: number | null;
  collectedAmount: number | null;
  expectedAmount: number | null;
  difference: number | null;
  notes: string | null;
  parkingLotId?: number | null;
  isDuplicate?: boolean;
  duplicateStatus?: 'canonical' | 'superseded';
  supersededBy?: string | null;
}

export interface TicketConfig {
  headerText: string;
  termsText: string;
  showLogo: boolean;
  showTerms: boolean;
  exitShowFolio: boolean;
  logoUrl?: string;
}
