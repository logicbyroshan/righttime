import { getDatabase } from './database';
import { getHabitsWithStatus } from './habitsRepo';

export interface AttendanceReportSummary {
  sessionCount: number;
  completedCount: number;
  incompleteCount: number;
  grossDurationSeconds: number;
  breakDurationSeconds: number;
  netDurationSeconds: number;
}

export interface ActivityCategoryReport {
  category: string;
  durationSeconds: number;
  percentage: number;
}

export interface ActivityItemReport {
  id: string;
  name: string;
  category: string;
  color: string;
  durationSeconds: number;
  entryCount: number;
}

export interface PeriodReport {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  attendance: AttendanceReportSummary;
  activities: {
    totalDurationSeconds: number;
    byCategory: ActivityCategoryReport[];
    byActivity: ActivityItemReport[];
  };
  habits: {
    totalHabits: number;
    completedCount: number;
    completionRate: number;
  };
  trends: {
    netOfficeDiffSeconds: number;
    activityDiffSeconds: number;
    habitRateDiff: number;
  };
}

function calculateAttendanceForPeriod(startDate: string, endDate: string): AttendanceReportSummary {
  const db = getDatabase();
  const sessions = db.getAllSync<{
    id: string;
    status: string;
    start_time: string;
    end_time: string | null;
  }>(
    `SELECT id, status, start_time, end_time FROM attendance_sessions
     WHERE work_date >= ? AND work_date <= ? AND is_deleted = 0;`,
    [startDate, endDate]
  );

  let gross = 0;
  let breaksTotal = 0;
  let completed = 0;
  let incomplete = 0;

  for (const s of sessions) {
    if (s.status === 'COMPLETED') completed += 1;
    else incomplete += 1;

    if (s.end_time) {
      const sStart = new Date(s.start_time).getTime();
      const sEnd = new Date(s.end_time).getTime();
      gross += Math.max(0, Math.floor((sEnd - sStart) / 1000));
    }

    const breaks = db.getAllSync<{ start_time: string; end_time: string | null }>(
      'SELECT start_time, end_time FROM break_sessions WHERE session_id = ? AND is_deleted = 0;',
      [s.id]
    );
    for (const b of breaks) {
      if (b.end_time) {
        const bStart = new Date(b.start_time).getTime();
        const bEnd = new Date(b.end_time).getTime();
        breaksTotal += Math.max(0, Math.floor((bEnd - bStart) / 1000));
      }
    }
  }

  return {
    sessionCount: sessions.length,
    completedCount: completed,
    incompleteCount: incomplete,
    grossDurationSeconds: gross,
    breakDurationSeconds: breaksTotal,
    netDurationSeconds: Math.max(0, gross - breaksTotal),
  };
}

function calculateActivitiesForPeriod(startDate: string, endDate: string) {
  const db = getDatabase();
  const entries = db.getAllSync<{
    activity_id: string;
    name: string;
    category: string;
    color: string;
    duration_seconds: number;
  }>(
    `SELECT e.activity_id, a.name, a.category, a.color, e.duration_seconds
     FROM activity_entries e
     JOIN activities a ON e.activity_id = a.id
     WHERE e.work_date >= ? AND e.work_date <= ? AND e.is_deleted = 0 AND a.is_deleted = 0;`,
    [startDate, endDate]
  );

  let totalDuration = 0;
  const catMap: Record<string, number> = {};
  const actMap: Record<string, ActivityItemReport> = {};

  for (const e of entries) {
    totalDuration += e.duration_seconds;
    const cat = e.category || 'General';
    catMap[cat] = (catMap[cat] || 0) + e.duration_seconds;

    if (!actMap[e.activity_id]) {
      actMap[e.activity_id] = {
        id: e.activity_id,
        name: e.name,
        category: cat,
        color: e.color,
        durationSeconds: 0,
        entryCount: 0,
      };
    }
    actMap[e.activity_id].durationSeconds += e.duration_seconds;
    actMap[e.activity_id].entryCount += 1;
  }

  const byCategory: ActivityCategoryReport[] = Object.entries(catMap)
    .map(([cat, dur]) => ({
      category: cat,
      durationSeconds: dur,
      percentage: totalDuration > 0 ? Math.round((dur / totalDuration) * 100) : 0,
    }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds);

  const byActivity: ActivityItemReport[] = Object.values(actMap).sort(
    (a, b) => b.durationSeconds - a.durationSeconds
  );

  return {
    totalDurationSeconds: totalDuration,
    byCategory,
    byActivity,
  };
}

function calculateHabitsForPeriod(startDate: string, endDate: string) {
  const db = getDatabase();
  const habits = getHabitsWithStatus(endDate);
  const totalHabits = habits.length;

  const startMs = new Date(startDate + 'T00:00:00Z').getTime();
  const endMs = new Date(endDate + 'T00:00:00Z').getTime();
  const daysInPeriod = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

  const totalPossible = totalHabits * daysInPeriod;

  const compCountRow = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM habit_completions
     WHERE local_date >= ? AND local_date <= ? AND completed = 1 AND is_deleted = 0;`,
    [startDate, endDate]
  );
  const completedCount = compCountRow?.count || 0;
  const completionRate = totalPossible > 0 ? Math.round((completedCount / totalPossible) * 100) : 0;

  return {
    totalHabits,
    completedCount,
    completionRate,
  };
}

export function getDailyReport(dateStr: string): PeriodReport {
  const prevDate = new Date(new Date(dateStr + 'T00:00:00Z').getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const currentAtt = calculateAttendanceForPeriod(dateStr, dateStr);
  const prevAtt = calculateAttendanceForPeriod(prevDate, prevDate);

  const currentAct = calculateActivitiesForPeriod(dateStr, dateStr);
  const prevAct = calculateActivitiesForPeriod(prevDate, prevDate);

  const currentHab = calculateHabitsForPeriod(dateStr, dateStr);
  const prevHab = calculateHabitsForPeriod(prevDate, prevDate);

  return {
    period: 'daily',
    startDate: dateStr,
    endDate: dateStr,
    attendance: currentAtt,
    activities: currentAct,
    habits: currentHab,
    trends: {
      netOfficeDiffSeconds: currentAtt.netDurationSeconds - prevAtt.netDurationSeconds,
      activityDiffSeconds: currentAct.totalDurationSeconds - prevAct.totalDurationSeconds,
      habitRateDiff: currentHab.completionRate - prevHab.completionRate,
    },
  };
}

export function getWeeklyReport(refDateStr: string): PeriodReport {
  const ref = new Date(refDateStr + 'T00:00:00Z');
  // Monday of week
  const day = ref.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(ref.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);

  const startDate = monday.toISOString().split('T')[0];
  const endDate = sunday.toISOString().split('T')[0];

  const prevMonday = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const prevSunday = new Date(monday.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const currentAtt = calculateAttendanceForPeriod(startDate, endDate);
  const prevAtt = calculateAttendanceForPeriod(prevMonday, prevSunday);

  const currentAct = calculateActivitiesForPeriod(startDate, endDate);
  const prevAct = calculateActivitiesForPeriod(prevMonday, prevSunday);

  const currentHab = calculateHabitsForPeriod(startDate, endDate);
  const prevHab = calculateHabitsForPeriod(prevMonday, prevSunday);

  return {
    period: 'weekly',
    startDate,
    endDate,
    attendance: currentAtt,
    activities: currentAct,
    habits: currentHab,
    trends: {
      netOfficeDiffSeconds: currentAtt.netDurationSeconds - prevAtt.netDurationSeconds,
      activityDiffSeconds: currentAct.totalDurationSeconds - prevAct.totalDurationSeconds,
      habitRateDiff: currentHab.completionRate - prevHab.completionRate,
    },
  };
}

export function getMonthlyReport(yearMonth: string): PeriodReport {
  const parts = yearMonth.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);

  const start = new Date(Date.UTC(year, month - 1, 1));
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const end = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);

  const startDate = start.toISOString().split('T')[0];
  const endDate = end.toISOString().split('T')[0];

  const prevStart = new Date(Date.UTC(year, month - 2, 1));
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStartDate = prevStart.toISOString().split('T')[0];
  const prevEndDate = prevEnd.toISOString().split('T')[0];

  const currentAtt = calculateAttendanceForPeriod(startDate, endDate);
  const prevAtt = calculateAttendanceForPeriod(prevStartDate, prevEndDate);

  const currentAct = calculateActivitiesForPeriod(startDate, endDate);
  const prevAct = calculateActivitiesForPeriod(prevStartDate, prevEndDate);

  const currentHab = calculateHabitsForPeriod(startDate, endDate);
  const prevHab = calculateHabitsForPeriod(prevStartDate, prevEndDate);

  return {
    period: 'monthly',
    startDate,
    endDate,
    attendance: currentAtt,
    activities: currentAct,
    habits: currentHab,
    trends: {
      netOfficeDiffSeconds: currentAtt.netDurationSeconds - prevAtt.netDurationSeconds,
      activityDiffSeconds: currentAct.totalDurationSeconds - prevAct.totalDurationSeconds,
      habitRateDiff: currentHab.completionRate - prevHab.completionRate,
    },
  };
}
