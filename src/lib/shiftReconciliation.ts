import { ParkingRecord, UserShift } from '../types';

export interface ShiftReconciliation {
  records: ParkingRecord[];
  carsCount: number;
  totalChargedInCars: number;
  expectedAmount: number;
  actualAmount: number | null;
  differenceToExpected: number; // expectedAmount - totalChargedInCars (e.g., if shift includes a $100 initial cash fund)
  matchesExpected: boolean; // true if cars total matches expected exactly
  cashierHandoverDiff: number | null; // actualAmount - expectedAmount
}

/**
 * Matches parking ticket records to a specific shift or cash cut.
 * Uses exact shiftId, derived SHIFT{startTimeSuffix}, numerical tolerance,
 * and time-window fallback with username matching.
 */
export function reconcileShiftRecords(
  shift: UserShift,
  allRecords: ParkingRecord[]
): ShiftReconciliation {
  const startStr = String(shift.startTime || 0);
  const startSuffix = startStr.slice(-7);
  const genShiftId = 'SHIFT' + startSuffix;
  const targetNum = parseInt(startSuffix, 10);
  const shiftUser = (shift.username || '').trim().toLowerCase();

  const matched = allRecords.filter((r) => {
    // 1. Exact shiftId match
    if (r.shiftId && r.shiftId === shift.shiftId) {
      return true;
    }

    // 2. Generated shiftId from startTime suffix match (e.g. SHIFT6197769)
    if (r.shiftId && r.shiftId === genShiftId) {
      return true;
    }

    // 3. Tolerance for 1-5 ms difference in generated shiftId number
    if (r.shiftId && r.shiftId.startsWith('SHIFT') && !isNaN(targetNum)) {
      const numPart = parseInt(r.shiftId.replace('SHIFT', ''), 10);
      if (!isNaN(numPart) && Math.abs(numPart - targetNum) <= 5) {
        return true;
      }
    }

    // 4. Fallback: cashier username + completed status + time window
    if (r.status === 'COMPLETED' && shift.startTime) {
      const cashier = (r.processedBy || r.registeredBy || '').trim().toLowerCase();
      if (cashier && (cashier === shiftUser || cashier.replace(/_/g, '') === shiftUser.replace(/_/g, ''))) {
        const eventTime = r.exitTime || r.entryTime;
        if (eventTime && eventTime >= (shift.startTime - 120000)) {
          // If shift has endTime, check bound (with 2 min grace period)
          if (!shift.endTime || eventTime <= (shift.endTime + 120000)) {
            // Check lot ID if both specify one
            if (
              shift.parkingLotId === undefined || 
              shift.parkingLotId === null || 
              r.parkingLotId === undefined || 
              r.parkingLotId === null || 
              r.parkingLotId === shift.parkingLotId
            ) {
              return true;
            }
          }
        }
      }
    }

    return false;
  });

  // Sort matched records by exit/completion time descending (newest first)
  matched.sort((a, b) => (b.exitTime || b.entryTime) - (a.exitTime || a.entryTime));

  const totalChargedInCars = matched.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  const expectedAmount = shift.expectedAmount || 0;
  const actualAmount = shift.actualAmount !== undefined ? shift.actualAmount : null;
  const differenceToExpected = expectedAmount - totalChargedInCars;
  const matchesExpected = Math.abs(differenceToExpected) < 0.01;

  const cashierHandoverDiff = actualAmount !== null 
    ? (shift.difference !== null && shift.difference !== undefined 
        ? shift.difference 
        : actualAmount - expectedAmount)
    : null;

  return {
    records: matched,
    carsCount: matched.length,
    totalChargedInCars,
    expectedAmount,
    actualAmount,
    differenceToExpected,
    matchesExpected,
    cashierHandoverDiff
  };
}

/**
 * Creates a batch map of shiftId -> ShiftReconciliation for fast lookup in tables.
 */
export function reconcileAllShifts(
  shifts: UserShift[],
  allRecords: ParkingRecord[]
): Map<string, ShiftReconciliation> {
  const map = new Map<string, ShiftReconciliation>();
  for (const shift of shifts) {
    map.set(shift.shiftId, reconcileShiftRecords(shift, allRecords));
  }
  return map;
}
