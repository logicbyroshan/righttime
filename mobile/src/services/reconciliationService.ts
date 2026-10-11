import {
  ReconciliationItem,
  ReconciliationSummary,
  ReconciliationStatus,
  OfficialAttendanceRecord,
} from '../db/types';

export interface PersonalDayData {
  work_date: string;
  sessions: Array<{
    id: string;
    start_time: string;
    end_time: string | null;
    status: string;
    is_incomplete: number;
    is_corrected: number;
    source?: string;
    gross_seconds: number;
    break_seconds: number;
    net_seconds: number;
  }>;
}

export function calculateDateDiffMinutes(
  timeStrA: string | null,
  timeStrB: string | null
): number | null {
  if (!timeStrA || !timeStrB) return null;
  const dateA = new Date(timeStrA).getTime();
  const dateB = new Date(timeStrB).getTime();
  if (isNaN(dateA) || isNaN(dateB)) return null;
  return Math.round((dateA - dateB) / 60000);
}

export function formatTimeHM(isoString: string | null): string | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function getWeekdayName(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function reconcileDay(params: {
  workDate: string;
  personalData?: PersonalDayData;
  officialRecords?: OfficialAttendanceRecord[];
  toleranceMinutes: number;
}): ReconciliationItem {
  const { workDate, personalData, officialRecords = [], toleranceMinutes } = params;
  const weekday = getWeekdayName(workDate);

  const personalSessions = personalData?.sessions || [];
  const officialRecord = officialRecords.length > 0 ? officialRecords[0] : null;
  const isMultiplePersonal = personalSessions.length > 1;
  const isMultipleOfficial = officialRecords.length > 1;

  // 1. Personal metrics
  let personalArrival: string | null = null;
  let personalDeparture: string | null = null;
  let personalGrossSec = 0;
  let personalBreakSec = 0;
  let personalNetSec = 0;
  let personalIsIncomplete = false;
  let personalIsCorrected = false;
  let personalSource = 'MANUAL';

  if (personalSessions.length > 0) {
    // Sort chronologically
    const sorted = [...personalSessions].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    personalArrival = sorted[0].start_time;
    const lastSession = sorted[sorted.length - 1];
    personalDeparture = lastSession.end_time;
    personalSource = sorted[0].source || 'MANUAL';

    for (const s of sorted) {
      personalGrossSec += s.gross_seconds;
      personalBreakSec += s.break_seconds;
      personalNetSec += s.net_seconds;
      if (s.is_incomplete || !s.end_time) personalIsIncomplete = true;
      if (s.is_corrected) personalIsCorrected = true;
    }
  }

  const personalGrossMinutes = Math.round(personalGrossSec / 60);
  const personalBreakMinutes = Math.round(personalBreakSec / 60);
  const personalNetMinutes = Math.round(personalNetSec / 60);

  // 2. Official metrics
  let officialArrival: string | null = null;
  let officialDeparture: string | null = null;
  let officialBreakMinutes = 0;
  let officialNetMinutes = 0;
  let officialRecordId: string | null = null;
  let isReviewed = false;
  let discrepancyNote = '';
  let isOfficialInvalid = false;

  if (officialRecord) {
    officialRecordId = officialRecord.id;
    officialArrival = officialRecord.check_in_time;
    officialDeparture = officialRecord.check_out_time;
    officialBreakMinutes = officialRecord.break_duration_minutes || 0;
    officialNetMinutes = officialRecord.total_duration_minutes || 0;
    isReviewed = officialRecord.is_reviewed === 1;
    discrepancyNote = officialRecord.discrepancy_note || '';
    if (officialRecord.validation_status === 'INVALID' || officialRecord.validation_status === 'EXCLUDED') {
      isOfficialInvalid = true;
    }
  }

  // 3. Difference calculations (Personal - Official)
  // Positive = Personal is later than Official
  // Negative = Personal is earlier than Official
  const arrivalDiffMinutes = calculateDateDiffMinutes(personalArrival, officialArrival);
  const departureDiffMinutes = calculateDateDiffMinutes(personalDeparture, officialDeparture);
  const netDurationDiffMinutes =
    personalSessions.length > 0 && officialRecord && officialNetMinutes > 0
      ? personalNetMinutes - officialNetMinutes
      : null;

  // 4. Status determination
  let status: ReconciliationStatus = 'MATCH';

  if (isOfficialInvalid) {
    status = 'INVALID_OFFICIAL';
  } else if (isMultiplePersonal || isMultipleOfficial) {
    status = 'AMBIGUOUS';
  } else if (personalSessions.length === 0 && officialRecord) {
    status = 'PERSONAL_MISSING';
  } else if (personalSessions.length > 0 && !officialRecord) {
    status = 'OFFICIAL_MISSING';
  } else if (personalIsIncomplete) {
    status = 'INCOMPLETE_PERSONAL';
  } else if (arrivalDiffMinutes !== null && departureDiffMinutes !== null) {
    const arrExceeded = Math.abs(arrivalDiffMinutes) > toleranceMinutes;
    const depExceeded = Math.abs(departureDiffMinutes) > toleranceMinutes;

    if (arrExceeded && depExceeded) {
      status = 'DURATION_DISCREPANCY';
    } else if (arrExceeded) {
      status = 'ARRIVAL_DISCREPANCY';
    } else if (depExceeded) {
      status = 'DEPARTURE_DISCREPANCY';
    } else if (netDurationDiffMinutes !== null && Math.abs(netDurationDiffMinutes) > toleranceMinutes) {
      status = 'DURATION_DISCREPANCY';
    } else {
      status = 'MATCH';
    }
  }

  if (isReviewed && status !== 'MATCH') {
    status = 'REVIEWED';
  }

  return {
    date: workDate,
    weekday,
    personalArrival,
    personalDeparture,
    personalGrossMinutes,
    personalBreakMinutes,
    personalNetMinutes,
    personalSource,
    personalIsIncomplete,
    personalIsCorrected,
    officialRecordId,
    officialArrival,
    officialDeparture,
    officialBreakMinutes,
    officialNetMinutes,
    arrivalDiffMinutes,
    departureDiffMinutes,
    netDurationDiffMinutes,
    status,
    isReviewed,
    discrepancyNote,
  };
}

export function generateReconciliationReport(params: {
  startDate: string;
  endDate: string;
  personalDataMap: Map<string, PersonalDayData>;
  officialRecordsMap: Map<string, OfficialAttendanceRecord[]>;
  toleranceMinutes: number;
}): { items: ReconciliationItem[]; summary: ReconciliationSummary } {
  const { startDate, endDate, personalDataMap, officialRecordsMap, toleranceMinutes } = params;

  // Collect all unique dates in the interval or present in maps
  const dateSet = new Set<string>();

  const curr = new Date(startDate);
  const end = new Date(endDate);
  while (curr <= end) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    dateSet.add(`${y}-${m}-${d}`);
    curr.setDate(curr.getDate() + 1);
  }

  // Also include any dates outside range if they exist in the maps within bounds
  for (const k of personalDataMap.keys()) {
    if (k >= startDate && k <= endDate) dateSet.add(k);
  }
  for (const k of officialRecordsMap.keys()) {
    if (k >= startDate && k <= endDate) dateSet.add(k);
  }

  const sortedDates = Array.from(dateSet).sort();
  const items: ReconciliationItem[] = [];

  let matchedDays = 0;
  let discrepancyDays = 0;
  let missingPersonalDays = 0;
  let missingOfficialDays = 0;
  let reviewedDays = 0;

  for (const date of sortedDates) {
    const personal = personalDataMap.get(date);
    const official = officialRecordsMap.get(date) || [];
    const item = reconcileDay({
      workDate: date,
      personalData: personal,
      officialRecords: official,
      toleranceMinutes,
    });

    items.push(item);

    if (item.status === 'MATCH') {
      matchedDays++;
    } else if (item.status === 'PERSONAL_MISSING') {
      missingPersonalDays++;
      discrepancyDays++;
    } else if (item.status === 'OFFICIAL_MISSING') {
      missingOfficialDays++;
      discrepancyDays++;
    } else if (item.status === 'REVIEWED') {
      reviewedDays++;
    } else {
      discrepancyDays++;
    }
  }

  const summary: ReconciliationSummary = {
    periodStart: startDate,
    periodEnd: endDate,
    totalDays: items.length,
    matchedDays,
    discrepancyDays,
    missingPersonalDays,
    missingOfficialDays,
    reviewedDays,
    toleranceMinutes,
  };

  return { items, summary };
}
