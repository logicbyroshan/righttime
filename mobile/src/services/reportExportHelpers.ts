import { getDatabase } from '../db/database';
import { getSettings } from '../db/settingsRepo';
import { getOfficialRecordsForPeriod } from '../db/officialRepo';
import {
  generateReconciliationReport,
  PersonalDayData,
} from './reconciliationService';
import { buildCSVString } from './csvParsing';
import { PDFReportOptions } from './pdfService';

function formatHms(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Build CSV string and filename for any of the 7 supported entity types
 */
export function buildEntityCSV(
  entityType:
    | 'attendance_sessions'
    | 'attendance_events'
    | 'break_sessions'
    | 'activity_entries'
    | 'habit_completions'
    | 'official_attendance_records'
    | 'reconciliation_results',
  startDate: string,
  endDate: string
): { filename: string; csvContent: string } {
  const db = getDatabase();
  const settings = getSettings();
  const dateRangeStr = `${startDate}_to_${endDate}`;

  switch (entityType) {
    case 'attendance_sessions': {
      const rows = db.getAllSync<any>(
        `SELECT id, work_date, status, start_time, end_time, is_incomplete, is_corrected, source, detected_at, confirmed_at, notes, created_at 
         FROM attendance_sessions 
         WHERE work_date >= ? AND work_date <= ? AND is_deleted = 0
         ORDER BY work_date ASC, start_time ASC;`,
        [startDate, endDate]
      );
      const headers = [
        'Session ID',
        'Work Date',
        'Status',
        'Start Time (UTC)',
        'End Time (UTC)',
        'Is Incomplete',
        'Is Corrected',
        'Source',
        'Detected At (UTC)',
        'Confirmed At (UTC)',
        'Notes',
        'Created At (UTC)',
      ];
      const dataRows = rows.map((r) => [
        r.id,
        r.work_date,
        r.status,
        r.start_time,
        r.end_time || '',
        r.is_incomplete ? 'TRUE' : 'FALSE',
        r.is_corrected ? 'TRUE' : 'FALSE',
        r.source || 'MANUAL',
        r.detected_at || '',
        r.confirmed_at || '',
        r.notes || '',
        r.created_at,
      ]);
      return {
        filename: `attendance_sessions_${dateRangeStr}.csv`,
        csvContent: buildCSVString(headers, dataRows),
      };
    }

    case 'attendance_events': {
      const rows = db.getAllSync<any>(
        `SELECT e.id, e.session_id, e.event_type, e.timestamp, e.source, e.detected_at, e.confirmed_at, e.notes, e.created_at
         FROM attendance_events e
         JOIN attendance_sessions s ON e.session_id = s.id
         WHERE s.work_date >= ? AND s.work_date <= ? AND s.is_deleted = 0
         ORDER BY e.timestamp ASC;`,
        [startDate, endDate]
      );
      const headers = [
        'Event ID',
        'Session ID',
        'Event Type',
        'Timestamp (UTC)',
        'Source',
        'Detected At (UTC)',
        'Confirmed At (UTC)',
        'Notes',
        'Created At (UTC)',
      ];
      const dataRows = rows.map((r) => [
        r.id,
        r.session_id,
        r.event_type,
        r.timestamp,
        r.source || 'MANUAL',
        r.detected_at || '',
        r.confirmed_at || '',
        r.notes || '',
        r.created_at,
      ]);
      return {
        filename: `attendance_events_${dateRangeStr}.csv`,
        csvContent: buildCSVString(headers, dataRows),
      };
    }

    case 'break_sessions': {
      const rows = db.getAllSync<any>(
        `SELECT b.id, b.session_id, b.start_time, b.end_time, b.notes, b.created_at
         FROM break_sessions b
         JOIN attendance_sessions s ON b.session_id = s.id
         WHERE s.work_date >= ? AND s.work_date <= ? AND b.is_deleted = 0 AND s.is_deleted = 0
         ORDER BY b.start_time ASC;`,
        [startDate, endDate]
      );
      const headers = [
        'Break ID',
        'Session ID',
        'Start Time (UTC)',
        'End Time (UTC)',
        'Duration (Min)',
        'Notes',
        'Created At (UTC)',
      ];
      const dataRows = rows.map((r) => {
        let durMin = 0;
        if (r.start_time && r.end_time) {
          durMin = Math.round(
            (new Date(r.end_time).getTime() - new Date(r.start_time).getTime()) / 60000
          );
        }
        return [
          r.id,
          r.session_id,
          r.start_time,
          r.end_time || '',
          durMin,
          r.notes || '',
          r.created_at,
        ];
      });
      return {
        filename: `break_sessions_${dateRangeStr}.csv`,
        csvContent: buildCSVString(headers, dataRows),
      };
    }

    case 'activity_entries': {
      const rows = db.getAllSync<any>(
        `SELECT e.id, a.name as activity_name, a.category, e.work_date, e.start_time, e.end_time, e.duration_seconds, e.notes, e.created_at
         FROM activity_entries e
         JOIN activities a ON e.activity_id = a.id
         WHERE e.work_date >= ? AND e.work_date <= ? AND e.is_deleted = 0 AND a.is_deleted = 0
         ORDER BY e.work_date ASC, e.start_time ASC;`,
        [startDate, endDate]
      );
      const headers = [
        'Entry ID',
        'Activity Name',
        'Category',
        'Work Date',
        'Start Time (UTC)',
        'End Time (UTC)',
        'Duration (Seconds)',
        'Duration (Minutes)',
        'Notes',
        'Created At (UTC)',
      ];
      const dataRows = rows.map((r) => [
        r.id,
        r.activity_name,
        r.category,
        r.work_date,
        r.start_time,
        r.end_time || '',
        r.duration_seconds,
        Math.round(r.duration_seconds / 60),
        r.notes || '',
        r.created_at,
      ]);
      return {
        filename: `activity_entries_${dateRangeStr}.csv`,
        csvContent: buildCSVString(headers, dataRows),
      };
    }

    case 'habit_completions': {
      const rows = db.getAllSync<any>(
        `SELECT c.id, h.name as habit_name, c.local_date, c.completed, c.count, c.notes, c.created_at
         FROM habit_completions c
         JOIN habits h ON c.habit_id = h.id
         WHERE c.local_date >= ? AND c.local_date <= ? AND c.is_deleted = 0 AND h.is_deleted = 0
         ORDER BY c.local_date ASC, h.name ASC;`,
        [startDate, endDate]
      );
      const headers = [
        'Completion ID',
        'Habit Name',
        'Local Date',
        'Completed',
        'Count',
        'Notes',
        'Created At (UTC)',
      ];
      const dataRows = rows.map((r) => [
        r.id,
        r.habit_name,
        r.local_date,
        r.completed ? 'YES' : 'NO',
        r.count,
        r.notes || '',
        r.created_at,
      ]);
      return {
        filename: `habit_completions_${dateRangeStr}.csv`,
        csvContent: buildCSVString(headers, dataRows),
      };
    }

    case 'official_attendance_records': {
      const rows = getOfficialRecordsForPeriod(startDate, endDate);
      const headers = [
        'Record ID',
        'Batch ID',
        'Work Date',
        'Official Check-In (UTC)',
        'Official Check-Out (UTC)',
        'Break Duration (Min)',
        'Total Duration (Min)',
        'Source Description',
        'Validation Status',
        'Is Reviewed',
        'Discrepancy Note',
      ];
      const dataRows = rows.map((r) => [
        r.id,
        r.batch_id,
        r.work_date,
        r.check_in_time || '',
        r.check_out_time || '',
        r.break_duration_minutes,
        r.total_duration_minutes,
        r.source_description || '',
        r.validation_status,
        r.is_reviewed ? 'YES' : 'NO',
        r.discrepancy_note || '',
      ]);
      return {
        filename: `official_attendance_records_${dateRangeStr}.csv`,
        csvContent: buildCSVString(headers, dataRows),
      };
    }

    case 'reconciliation_results': {
      const { items, summary } = getReconciliationData(startDate, endDate);
      const headers = [
        'Work Date',
        'Weekday',
        'Personal Arrival (UTC)',
        'Personal Departure (UTC)',
        'Personal Net (Min)',
        'Official Check-In (UTC)',
        'Official Check-Out (UTC)',
        'Official Net (Min)',
        'Arrival Diff (Min) [Personal - Official]',
        'Departure Diff (Min) [Personal - Official]',
        'Net Duration Diff (Min)',
        'Reconciliation Status',
        'Is Reviewed',
        'Discrepancy Note',
      ];
      const dataRows = items.map((it) => [
        it.date,
        it.weekday,
        it.personalArrival || '',
        it.personalDeparture || '',
        it.personalNetMinutes,
        it.officialArrival || '',
        it.officialDeparture || '',
        it.officialNetMinutes,
        it.arrivalDiffMinutes !== null ? it.arrivalDiffMinutes : '',
        it.departureDiffMinutes !== null ? it.departureDiffMinutes : '',
        it.netDurationDiffMinutes !== null ? it.netDurationDiffMinutes : '',
        it.status,
        it.isReviewed ? 'YES' : 'NO',
        it.discrepancyNote || '',
      ]);
      return {
        filename: `attendance_reconciliation_results_${dateRangeStr}.csv`,
        csvContent: buildCSVString(headers, dataRows),
      };
    }
  }
}

/**
 * Load personal and official attendance records and compute full reconciliation
 */
export function getReconciliationData(startDate: string, endDate: string) {
  const db = getDatabase();
  const settings = getSettings();
  const tolerance = parseInt(settings.reconciliation_tolerance_minutes || '5', 10);

  // 1. Fetch personal sessions & breaks
  const sessions = db.getAllSync<any>(
    `SELECT id, work_date, status, start_time, end_time, is_incomplete, is_corrected, source
     FROM attendance_sessions
     WHERE work_date >= ? AND work_date <= ? AND is_deleted = 0
     ORDER BY work_date ASC, start_time ASC;`,
    [startDate, endDate]
  );

  const personalMap = new Map<string, PersonalDayData>();

  for (const s of sessions) {
    let gross = 0;
    let breaksTotal = 0;
    if (s.end_time) {
      gross = Math.max(
        0,
        Math.floor((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000)
      );
    }
    const breaks = db.getAllSync<any>(
      `SELECT start_time, end_time FROM break_sessions WHERE session_id = ? AND is_deleted = 0;`,
      [s.id]
    );
    for (const b of breaks) {
      if (b.end_time) {
        breaksTotal += Math.max(
          0,
          Math.floor((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 1000)
        );
      }
    }

    if (!personalMap.has(s.work_date)) {
      personalMap.set(s.work_date, {
        work_date: s.work_date,
        sessions: [],
      });
    }

    personalMap.get(s.work_date)!.sessions.push({
      id: s.id,
      start_time: s.start_time,
      end_time: s.end_time,
      status: s.status,
      is_incomplete: s.is_incomplete,
      is_corrected: s.is_corrected,
      source: s.source,
      gross_seconds: gross,
      break_seconds: breaksTotal,
      net_seconds: Math.max(0, gross - breaksTotal),
    });
  }

  // 2. Fetch official records
  const officialRecords = getOfficialRecordsForPeriod(startDate, endDate);
  const officialMap = new Map<string, any[]>();
  for (const r of officialRecords) {
    if (!officialMap.has(r.work_date)) {
      officialMap.set(r.work_date, []);
    }
    officialMap.get(r.work_date)!.push(r);
  }

  return generateReconciliationReport({
    startDate,
    endDate,
    personalDataMap: personalMap,
    officialRecordsMap: officialMap,
    toleranceMinutes: tolerance,
  });
}

/**
 * Prepare complete PDF options payload from SQLite data
 */
export function buildPDFOptions(
  reportType: 'ATTENDANCE_ONLY' | 'ATTENDANCE_WITH_ACTIVITIES' | 'RECONCILIATION',
  startDate: string,
  endDate: string,
  displayName?: string
): PDFReportOptions {
  const db = getDatabase();
  const settings = getSettings();

  const sessions = db.getAllSync<any>(
    `SELECT id, work_date, status, start_time, end_time, is_incomplete, is_corrected, source
     FROM attendance_sessions
     WHERE work_date >= ? AND work_date <= ? AND is_deleted = 0
     ORDER BY work_date ASC, start_time ASC;`,
    [startDate, endDate]
  );

  let grossTotal = 0;
  let breaksTotal = 0;
  let manualEvents = 0;
  let wifiEvents = 0;
  let corrections = 0;
  let incompleteDays = 0;
  const attendanceDaySet = new Set<string>();

  const dailyRowsMap = new Map<string, any>();

  for (const s of sessions) {
    attendanceDaySet.add(s.work_date);
    if (s.is_incomplete || !s.end_time) incompleteDays++;
    if (s.is_corrected) corrections++;
    if (s.source?.includes('WIFI')) wifiEvents++;
    else manualEvents++;

    let gross = 0;
    if (s.end_time) {
      gross = Math.max(
        0,
        Math.floor((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000)
      );
    }
    grossTotal += gross;

    const breaks = db.getAllSync<any>(
      `SELECT start_time, end_time FROM break_sessions WHERE session_id = ? AND is_deleted = 0;`,
      [s.id]
    );
    let sBreakSec = 0;
    for (const b of breaks) {
      if (b.end_time) {
        sBreakSec += Math.max(
          0,
          Math.floor((new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / 1000)
        );
      }
    }
    breaksTotal += sBreakSec;

    if (!dailyRowsMap.has(s.work_date)) {
      const parts = s.work_date.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });

      dailyRowsMap.set(s.work_date, {
        date: s.work_date,
        weekday,
        arrival: s.start_time,
        departure: s.end_time,
        grossSec: gross,
        breakSec: sBreakSec,
        netSec: Math.max(0, gross - sBreakSec),
        source: s.source || 'MANUAL',
        isIncomplete: Boolean(s.is_incomplete || !s.end_time),
        isCorrected: Boolean(s.is_corrected),
      });
    } else {
      const row = dailyRowsMap.get(s.work_date)!;
      row.grossSec += gross;
      row.breakSec += sBreakSec;
      row.netSec += Math.max(0, gross - sBreakSec);
      if (s.end_time) row.departure = s.end_time;
      if (s.is_incomplete) row.isIncomplete = true;
      if (s.is_corrected) row.isCorrected = true;
    }
  }

  const dailyRows = Array.from(dailyRowsMap.values()).map((r) => ({
    date: r.date,
    weekday: r.weekday,
    arrival: r.arrival,
    departure: r.departure,
    grossHms: formatHms(r.grossSec),
    breakHms: formatHms(r.breakSec),
    netHms: formatHms(r.netSec),
    source: r.source,
    isIncomplete: r.isIncomplete,
    isCorrected: r.isCorrected,
  }));

  // Calendar days
  const startD = new Date(startDate);
  const endD = new Date(endDate);
  const calendarDays = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1);

  // Reconciliation data
  let reconciliationItems: any[] | undefined;
  let reconciliationSummary: any | undefined;
  if (reportType === 'RECONCILIATION') {
    const recon = getReconciliationData(startDate, endDate);
    reconciliationItems = recon.items;
    reconciliationSummary = recon.summary;
  }

  // Activities & Habits data (if requested)
  let activities: any[] | undefined;
  let habits: any[] | undefined;
  if (reportType === 'ATTENDANCE_WITH_ACTIVITIES') {
    const entries = db.getAllSync<any>(
      `SELECT a.category, a.name, SUM(e.duration_seconds) as total_sec
       FROM activity_entries e
       JOIN activities a ON e.activity_id = a.id
       WHERE e.work_date >= ? AND e.work_date <= ? AND e.is_deleted = 0 AND a.is_deleted = 0
       GROUP BY a.id ORDER BY total_sec DESC;`,
      [startDate, endDate]
    );
    const totalActSec = entries.reduce((acc, curr) => acc + (curr.total_sec || 0), 0);
    activities = entries.map((e) => ({
      category: e.category,
      name: e.name,
      durationHms: formatHms(e.total_sec || 0),
      percentage: totalActSec > 0 ? Math.round(((e.total_sec || 0) / totalActSec) * 100) : 0,
    }));
  }

  return {
    reportType,
    displayName,
    officeName: settings.office_name || 'Office HQ',
    timezone: settings.timezone || 'Asia/Kolkata',
    startDate,
    endDate,
    summary: {
      calendarDays,
      attendanceDays: attendanceDaySet.size,
      incompleteSessions: incompleteDays,
      grossDurationSeconds: grossTotal,
      breakDurationSeconds: breaksTotal,
      netDurationSeconds: Math.max(0, grossTotal - breaksTotal),
      manualEventsCount: manualEvents,
      wifiConfirmedCount: wifiEvents,
      correctionsCount: corrections,
      unresolvedDiscrepancies: reconciliationSummary?.discrepancyDays,
    },
    dailyRows,
    activities,
    habits,
    reconciliationItems,
    reconciliationSummary,
  };
}
