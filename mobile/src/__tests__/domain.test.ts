import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// 1. Streak Algorithm Unit Tests
function calculateStreakLogic(completedDates: string[], todayStr: string) {
  if (completedDates.length === 0) {
    return { currentStreak: 0, bestStreak: 0, completedToday: false };
  }

  const sortedDates = Array.from(new Set(completedDates)).sort();
  const dateSet = new Set(sortedDates);
  const completedToday = dateSet.has(todayStr);

  let bestStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T00:00:00Z');
    const curr = new Date(sortedDates[i] + 'T00:00:00Z');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentRun += 1;
    } else if (diffDays > 1) {
      currentRun = 1;
    }
    if (currentRun > bestStreak) {
      bestStreak = currentRun;
    }
  }

  const today = new Date(todayStr + 'T00:00:00Z');
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let currentStreak = 0;
  let checkDate = dateSet.has(todayStr) ? today : dateSet.has(yesterdayStr) ? yesterday : null;

  if (checkDate) {
    while (true) {
      const checkStr = checkDate.toISOString().split('T')[0];
      if (dateSet.has(checkStr)) {
        currentStreak += 1;
        checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      } else {
        break;
      }
    }
  }

  return {
    currentStreak,
    bestStreak: Math.max(bestStreak, currentStreak),
    completedToday,
  };
}

// 2. Attendance Net Time Calculation
function calculateNetOfficeDuration(
  sessionStart: string,
  sessionEnd: string,
  breaks: { start: string; end: string }[]
): { grossSeconds: number; breakSeconds: number; netSeconds: number } {
  const sStart = new Date(sessionStart).getTime();
  const sEnd = new Date(sessionEnd).getTime();
  if (sEnd <= sStart) {
    throw new Error('End time must be after start time.');
  }

  const grossSeconds = Math.floor((sEnd - sStart) / 1000);
  let breakSeconds = 0;

  for (const b of breaks) {
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    if (bStart < sStart || bEnd > sEnd) {
      throw new Error('Break intervals must belong within attendance session.');
    }
    if (bEnd <= bStart) {
      throw new Error('Break end must be after break start.');
    }
    breakSeconds += Math.floor((bEnd - bStart) / 1000);
  }

  const netSeconds = Math.max(0, grossSeconds - breakSeconds);
  return { grossSeconds, breakSeconds, netSeconds };
}

// 3. Activity Validation
function validateActivityEntry(start: string, end: string | null) {
  const sStart = new Date(start).getTime();
  if (isNaN(sStart)) throw new Error('Invalid start time.');
  if (end) {
    const sEnd = new Date(end).getTime();
    if (isNaN(sEnd)) throw new Error('Invalid end time.');
    if (sEnd <= sStart) throw new Error('End time must be strictly after start time.');
    return Math.floor((sEnd - sStart) / 1000);
  }
  return 0;
}

describe('Personal Time Ledger — Domain Logic Tests', () => {
  it('calculates habit streaks accurately across consecutive days', () => {
    const dates = ['2026-10-08', '2026-10-09', '2026-10-10'];
    const res = calculateStreakLogic(dates, '2026-10-10');
    assert.equal(res.currentStreak, 3);
    assert.equal(res.bestStreak, 3);
    assert.equal(res.completedToday, true);
  });

  it('preserves current streak when yesterday completed but today not yet completed', () => {
    const dates = ['2026-10-08', '2026-10-09'];
    const res = calculateStreakLogic(dates, '2026-10-10');
    assert.equal(res.currentStreak, 2);
    assert.equal(res.bestStreak, 2);
    assert.equal(res.completedToday, false);
  });

  it('resets streak to 0 when gap exceeds one day', () => {
    const dates = ['2026-10-05', '2026-10-06'];
    const res = calculateStreakLogic(dates, '2026-10-10');
    assert.equal(res.currentStreak, 0);
    assert.equal(res.bestStreak, 2);
    assert.equal(res.completedToday, false);
  });

  it('recalculates streak correctly when historical record is removed', () => {
    // Before: 3 days streak
    const beforeDates = ['2026-10-08', '2026-10-09', '2026-10-10'];
    assert.equal(calculateStreakLogic(beforeDates, '2026-10-10').currentStreak, 3);

    // After removing 2026-10-09
    const afterDates = ['2026-10-08', '2026-10-10'];
    const res = calculateStreakLogic(afterDates, '2026-10-10');
    assert.equal(res.currentStreak, 1);
    assert.equal(res.bestStreak, 1);
  });

  it('calculates net office time: gross elapsed minus recorded breaks', () => {
    const start = '2026-10-10T09:00:00Z';
    const end = '2026-10-10T17:00:00Z'; // 8 hours = 28800s
    const breaks = [
      { start: '2026-10-10T12:00:00Z', end: '2026-10-10T13:00:00Z' }, // 1 hour = 3600s
      { start: '2026-10-10T15:00:00Z', end: '2026-10-10T15:15:00Z' }, // 15 mins = 900s
    ];

    const res = calculateNetOfficeDuration(start, end, breaks);
    assert.equal(res.grossSeconds, 28800);
    assert.equal(res.breakSeconds, 4500);
    assert.equal(res.netSeconds, 24300); // 28800 - 4500 = 24300 (6h 45m)
  });

  it('rejects breaks outside attendance session bounds', () => {
    const start = '2026-10-10T09:00:00Z';
    const end = '2026-10-10T17:00:00Z';
    const invalidBreak = [{ start: '2026-10-10T08:00:00Z', end: '2026-10-10T09:30:00Z' }];

    assert.throws(() => calculateNetOfficeDuration(start, end, invalidBreak), {
      message: 'Break intervals must belong within attendance session.',
    });
  });

  it('validates activity entries and rejects end time before start time', () => {
    const valid = validateActivityEntry('2026-10-10T10:00:00Z', '2026-10-10T11:30:00Z');
    assert.equal(valid, 5400); // 90 mins = 5400s

    assert.throws(
      () => validateActivityEntry('2026-10-10T11:00:00Z', '2026-10-10T10:00:00Z'),
      { message: 'End time must be strictly after start time.' }
    );
  });
});
