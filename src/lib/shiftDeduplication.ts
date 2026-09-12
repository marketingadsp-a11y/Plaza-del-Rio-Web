import { UserShift } from '../types';

export interface DeduplicationResult<T extends UserShift> {
  deduplicatedShifts: T[];
  duplicatesFound: {
    canonical: T;
    superseded: T[];
  }[];
  totalDuplicatesCount: number;
}

/**
 * Detects duplicate/re-emitted cash cuts where a cashier or terminal submitted
 * two cuts for the exact same shift (e.g. identical or near-identical start time,
 * within minutes of each other, often done to add notes or re-print).
 */
export function analyzeShiftDuplicates<T extends UserShift>(shifts: T[]): DeduplicationResult<T> {
  // Group potential duplicates
  // We identify groups of shifts from the same username, same lot, and near-identical start time
  const groups: Map<string, T[]> = new Map();

  for (const shift of shifts) {
    if (!shift.startTime) continue;
    // Normalize start time within a 5-minute bucket or use exact key
    // For exact match:
    const lotKey = shift.parkingLotId ?? 1;
    // Round startTime to nearest 2 minutes to catch near-identical start timestamps
    const startBucket = Math.round(shift.startTime / (2 * 60 * 1000));
    const groupKey = `${shift.username.toLowerCase()}_lot${lotKey}_start${startBucket}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(shift);
  }

  const duplicatesFound: { canonical: T; superseded: T[] }[] = [];
  const supersededIds = new Set<string>();
  const canonicalMap = new Map<string, string>(); // supersededId -> canonicalId

  groups.forEach((group) => {
    if (group.length > 1) {
      // Sort: preference to later endTime, then has notes, then higher actualAmount, then latest ID
      group.sort((a, b) => {
        const aNotes = (a.notes || '').trim().length;
        const bNotes = (b.notes || '').trim().length;
        const aEnd = a.endTime || 0;
        const bEnd = b.endTime || 0;

        // 1. If one has notes and the other does not, prefer the one with notes
        if (aNotes > 0 && bNotes === 0) return -1;
        if (bNotes > 0 && aNotes === 0) return 1;

        // 2. Prefer the later endTime (the re-emitted/final one)
        if (bEnd !== aEnd) return bEnd - aEnd;

        // 3. Fallback to newest shiftId
        return b.shiftId.localeCompare(a.shiftId);
      });

      const canonical = group[0];
      const supersededList = group.slice(1);

      supersededList.forEach((s) => {
        supersededIds.add(s.shiftId);
        canonicalMap.set(s.shiftId, canonical.shiftId);
      });

      duplicatesFound.push({
        canonical,
        superseded: supersededList
      });
    }
  });

  const deduplicatedShifts = shifts.map((shift) => {
    if (supersededIds.has(shift.shiftId)) {
      return {
        ...shift,
        isDuplicate: true,
        duplicateStatus: 'superseded' as const,
        supersededBy: canonicalMap.get(shift.shiftId) || null
      };
    }

    const isCanonicalOfGroup = duplicatesFound.some((d) => d.canonical.shiftId === shift.shiftId);
    if (isCanonicalOfGroup) {
      return {
        ...shift,
        isDuplicate: false,
        duplicateStatus: 'canonical' as const
      };
    }

    return {
      ...shift,
      isDuplicate: false
    };
  });

  return {
    deduplicatedShifts,
    duplicatesFound,
    totalDuplicatesCount: supersededIds.size
  };
}

/**
 * Returns only active, non-superseded shifts to prevent double-counting money in totals
 */
export function getNonDuplicateShifts<T extends UserShift>(shifts: T[]): T[] {
  const result = analyzeShiftDuplicates(shifts);
  return result.deduplicatedShifts.filter((s) => !s.isDuplicate);
}
