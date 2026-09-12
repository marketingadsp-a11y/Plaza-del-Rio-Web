export type DateFilterMode = 'HOY' | 'AYER' | '7_DIAS' | 'MES_ACTUAL' | 'ULTIMO_MES' | 'FECHA';

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
 * Calculates accurate start and end timestamps for the requested period.
 */
export function computeDateRange(mode: DateFilterMode, customDateStr?: string): DateRangeResult {
  const now = new Date();

  if (mode === 'HOY') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return {
      mode,
      start: start.getTime(),
      end: end.getTime(),
      label: 'Hoy',
      shortLabel: 'Hoy',
      isSingleDay: true,
      dayDate: start
    };
  }

  if (mode === 'AYER') {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const start = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
    const end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
    return {
      mode,
      start: start.getTime(),
      end: end.getTime(),
      label: 'Ayer',
      shortLabel: 'Ayer',
      isSingleDay: true,
      dayDate: start
    };
  }

  if (mode === '7_DIAS') {
    // 7 days including today (from 6 days ago 00:00:00 to today 23:59:59)
    const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const start = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return {
      mode,
      start: start.getTime(),
      end: end.getTime(),
      label: 'Últimos 7 días',
      shortLabel: '7 días',
      isSingleDay: false,
      dayDate: null
    };
  }

  if (mode === 'MES_ACTUAL') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthName = start.toLocaleDateString('es-MX', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return {
      mode,
      start: start.getTime(),
      end: end.getTime(),
      label: `Mes actual (${capitalizedMonth})`,
      shortLabel: capitalizedMonth,
      isSingleDay: false,
      dayDate: null
    };
  }

  if (mode === 'ULTIMO_MES') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const monthName = start.toLocaleDateString('es-MX', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return {
      mode,
      start: start.getTime(),
      end: end.getTime(),
      label: `Último mes (${capitalizedMonth})`,
      shortLabel: `Mes pasado (${capitalizedMonth})`,
      isSingleDay: false,
      dayDate: null
    };
  }

  // FECHA manual (e.g. "2026-09-08")
  const defaultStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const effectiveStr = customDateStr && customDateStr.includes('-') ? customDateStr : defaultStr;
  const [y, m, d] = effectiveStr.split('-').map(Number);
  const targetDate = new Date(y, (m || 1) - 1, d || 1);
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  
  const formatted = targetDate.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return {
    mode: 'FECHA',
    start: start.getTime(),
    end: end.getTime(),
    label: `Día ${formatted}`,
    shortLabel: formatted,
    isSingleDay: true,
    dayDate: targetDate
  };
}
