export type DateFilterMode = 'HOY' | 'AYER' | '7_DIAS' | 'MES_ACTUAL' | 'ULTIMO_MES' | 'FECHA';

export const GUADALAJARA_TIMEZONE = 'America/Mexico_City';

export interface DateRangeResult {
  mode: DateFilterMode;
  start: number; // Unix timestamp in ms (start of range 00:00:00.000)
  end: number;   // Unix timestamp in ms (end of range 23:59:59.999)
  label: string; // Human-friendly label, e.g. "Hoy", "Ayer", "Últimos 7 días", "Septiembre 2026"
  shortLabel: string;
  isSingleDay: boolean;
  dayDate: Date | null;
}

/**
 * Returns YYYY-MM-DD formatted string in Mexico / Guadalajara timezone
 */
export function getGuadalajaraDateStr(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: GUADALAJARA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  } catch (e) {
    // Fallback if Intl timeZone is unsupported
    const offsetMs = 6 * 60 * 60 * 1000;
    const gdlTime = new Date(date.getTime() - offsetMs);
    return gdlTime.toISOString().slice(0, 10);
  }
}

/**
 * Converts a YYYY-MM-DD string into start (00:00:00.000) and end (23:59:59.999)
 * timestamps for Guadalajara, Jalisco, Mexico (UTC-6).
 */
export function getDayBoundsForDate(dateStr: string): { start: number; end: number } {
  // Mexico Central Standard Time is UTC-6 without DST
  const start = new Date(`${dateStr}T00:00:00.000-06:00`).getTime();
  const end = new Date(`${dateStr}T23:59:59.999-06:00`).getTime();
  return { start, end };
}

/**
 * Calculates accurate start and end timestamps for the requested period,
 * aligned with Guadalajara, Jalisco, Mexico timezone (UTC-6).
 */
export function computeDateRange(mode: DateFilterMode, customDateStr?: string): DateRangeResult {
  const now = new Date();
  const todayStr = getGuadalajaraDateStr(now);

  if (mode === 'HOY') {
    const { start, end } = getDayBoundsForDate(todayStr);
    const dayDate = new Date(start);
    return {
      mode,
      start,
      end,
      label: 'Hoy',
      shortLabel: 'Hoy',
      isSingleDay: true,
      dayDate
    };
  }

  if (mode === 'AYER') {
    // Yesterday in Guadalajara
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterdayStr = getGuadalajaraDateStr(yesterdayDate);
    const { start, end } = getDayBoundsForDate(yesterdayStr);
    const dayDate = new Date(start);
    return {
      mode,
      start,
      end,
      label: 'Ayer',
      shortLabel: 'Ayer',
      isSingleDay: true,
      dayDate
    };
  }

  if (mode === '7_DIAS') {
    // 7 days including today in Guadalajara
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const startStr = getGuadalajaraDateStr(sixDaysAgo);
    const { start } = getDayBoundsForDate(startStr);
    const { end } = getDayBoundsForDate(todayStr);
    return {
      mode,
      start,
      end,
      label: 'Últimos 7 días',
      shortLabel: '7 días',
      isSingleDay: false,
      dayDate: null
    };
  }

  if (mode === 'MES_ACTUAL') {
    const [yearStr, monthStr] = todayStr.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const startStr = `${yearStr}-${monthStr}-01`;
    // Last day of month
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const endStr = `${yearStr}-${monthStr}-${String(lastDayOfMonth).padStart(2, '0')}`;
    
    const { start } = getDayBoundsForDate(startStr);
    const { end } = getDayBoundsForDate(endStr);
    const dummyDate = new Date(start);
    const monthName = dummyDate.toLocaleDateString('es-MX', { month: 'long', timeZone: GUADALAJARA_TIMEZONE });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    return {
      mode,
      start,
      end,
      label: `Mes actual (${capitalizedMonth})`,
      shortLabel: capitalizedMonth,
      isSingleDay: false,
      dayDate: null
    };
  }

  if (mode === 'ULTIMO_MES') {
    const [yearStr, monthStr] = todayStr.split('-');
    let prevYear = Number(yearStr);
    let prevMonth = Number(monthStr) - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevMonthPadded = String(prevMonth).padStart(2, '0');
    const startStr = `${prevYear}-${prevMonthPadded}-01`;
    const lastDayOfMonth = new Date(prevYear, prevMonth, 0).getDate();
    const endStr = `${prevYear}-${prevMonthPadded}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const { start } = getDayBoundsForDate(startStr);
    const { end } = getDayBoundsForDate(endStr);
    const dummyDate = new Date(start);
    const monthName = dummyDate.toLocaleDateString('es-MX', { month: 'long', timeZone: GUADALAJARA_TIMEZONE });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    return {
      mode,
      start,
      end,
      label: `Último mes (${capitalizedMonth})`,
      shortLabel: `Mes pasado (${capitalizedMonth})`,
      isSingleDay: false,
      dayDate: null
    };
  }

  // FECHA manual (e.g. "2026-09-11")
  const effectiveStr = customDateStr && customDateStr.includes('-') ? customDateStr : todayStr;
  const { start, end } = getDayBoundsForDate(effectiveStr);
  const dayDate = new Date(start);

  const formatted = dayDate.toLocaleDateString('es-MX', {
    timeZone: GUADALAJARA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return {
    mode: 'FECHA',
    start,
    end,
    label: `Día ${formatted}`,
    shortLabel: formatted,
    isSingleDay: true,
    dayDate
  };
}
