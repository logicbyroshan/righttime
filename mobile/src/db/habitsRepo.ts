import { getDatabase, generateUUID } from './database';
import { Habit, HabitCompletion } from './types';
import { enqueueSync } from './syncRepo';

export interface HabitWithStatus extends Habit {
  completedToday: boolean;
  currentStreak: number;
  bestStreak: number;
  todayCount: number;
}

export function getHabits(includeArchived: boolean = false): Habit[] {
  const db = getDatabase();
  const query = includeArchived
    ? 'SELECT * FROM habits WHERE is_deleted = 0 ORDER BY name ASC;'
    : 'SELECT * FROM habits WHERE is_deleted = 0 AND is_archived = 0 ORDER BY name ASC;';
  return db.getAllSync<Habit>(query);
}

export function createHabit(
  name: string,
  description: string = '',
  targetCount: number = 1,
  unit: string = 'times',
  color: string = '#10B981'
): Habit {
  const db = getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();

  db.runSync(
    `INSERT INTO habits (id, name, description, target_count, unit, color, is_archived, created_at, updated_at, client_updated_at, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0);`,
    [id, name.trim(), description.trim(), targetCount, unit.trim(), color, now, now, now]
  );

  enqueueSync('habits', id, 'UPSERT', {
    id,
    name: name.trim(),
    description: description.trim(),
    target_count: targetCount,
    unit: unit.trim(),
    color,
    is_archived: 0,
  });

  return db.getFirstSync<Habit>('SELECT * FROM habits WHERE id = ?;', [id])!;
}

export function updateHabit(id: string, updates: Partial<Habit>): Habit {
  const db = getDatabase();
  const current = db.getFirstSync<Habit>('SELECT * FROM habits WHERE id = ? AND is_deleted = 0;', [id]);
  if (!current) throw new Error('Habit not found.');

  const now = new Date().toISOString();
  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  const description = updates.description !== undefined ? updates.description.trim() : current.description;
  const target_count = updates.target_count !== undefined ? updates.target_count : current.target_count;
  const unit = updates.unit !== undefined ? updates.unit.trim() : current.unit;
  const color = updates.color !== undefined ? updates.color : current.color;
  const is_archived = updates.is_archived !== undefined ? updates.is_archived : current.is_archived;

  db.runSync(
    `UPDATE habits SET name = ?, description = ?, target_count = ?, unit = ?, color = ?, is_archived = ?, updated_at = ?, client_updated_at = ?
     WHERE id = ?;`,
    [name, description, target_count, unit, color, is_archived, now, now, id]
  );

  enqueueSync('habits', id, 'UPSERT', {
    id,
    name,
    description,
    target_count,
    unit,
    color,
    is_archived,
  });

  return db.getFirstSync<Habit>('SELECT * FROM habits WHERE id = ?;', [id])!;
}

export function deleteHabit(id: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.runSync(
    'UPDATE habits SET is_deleted = 1, updated_at = ?, client_updated_at = ? WHERE id = ?;',
    [now, now, id]
  );
  enqueueSync('habits', id, 'DELETE', { id, is_deleted: 1 });
}

export function calculateHabitStreaks(habitId: string, referenceDate?: string): { currentStreak: number; bestStreak: number } {
  const db = getDatabase();
  const rows = db.getAllSync<{ local_date: string }>(
    `SELECT DISTINCT local_date FROM habit_completions
     WHERE habit_id = ? AND completed = 1 AND is_deleted = 0
     ORDER BY local_date ASC;`,
    [habitId]
  );

  if (rows.length === 0) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  const completedDates = rows.map((r) => r.local_date);
  const dateSet = new Set(completedDates);

  // Best streak
  let bestStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < completedDates.length; i++) {
    const prev = new Date(completedDates[i - 1] + 'T00:00:00Z');
    const curr = new Date(completedDates[i] + 'T00:00:00Z');
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

  // Current streak (active if today or yesterday is completed)
  const todayStr = referenceDate || new Date().toISOString().split('T')[0];
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
  };
}

export function toggleHabitCompletion(
  habitId: string,
  localDate?: string,
  forcedCompleted?: boolean,
  count: number = 1,
  notes: string = ''
): HabitCompletion {
  const db = getDatabase();
  const dateStr = localDate || new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const existing = db.getFirstSync<HabitCompletion>(
    'SELECT * FROM habit_completions WHERE habit_id = ? AND local_date = ?;',
    [habitId, dateStr]
  );

  let newCompleted = forcedCompleted !== undefined ? (forcedCompleted ? 1 : 0) : existing ? (existing.completed ? 0 : 1) : 1;
  let completionId = existing?.id || generateUUID();

  if (existing) {
    db.runSync(
      `UPDATE habit_completions SET
        completed = ?,
        count = ?,
        notes = ?,
        is_deleted = 0,
        updated_at = ?,
        client_updated_at = ?
       WHERE id = ?;`,
      [newCompleted, count, notes || existing.notes, now, now, existing.id]
    );
  } else {
    db.runSync(
      `INSERT INTO habit_completions (
        id, habit_id, local_date, completed, count, notes,
        created_at, updated_at, client_updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0);`,
      [completionId, habitId, dateStr, newCompleted, count, notes, now, now, now]
    );
  }

  enqueueSync('habit_completions', completionId, 'UPSERT', {
    id: completionId,
    habit_id: habitId,
    local_date: dateStr,
    completed: newCompleted === 1,
    count,
    notes,
  });

  return db.getFirstSync<HabitCompletion>('SELECT * FROM habit_completions WHERE id = ?;', [completionId])!;
}

export function getHabitsWithStatus(localDate?: string): HabitWithStatus[] {
  const db = getDatabase();
  const dateStr = localDate || new Date().toISOString().split('T')[0];
  const habits = getHabits(false);

  return habits.map((h) => {
    const comp = db.getFirstSync<HabitCompletion>(
      'SELECT * FROM habit_completions WHERE habit_id = ? AND local_date = ? AND is_deleted = 0;',
      [h.id, dateStr]
    );
    const streaks = calculateHabitStreaks(h.id, dateStr);

    return {
      ...h,
      completedToday: comp ? comp.completed === 1 : false,
      todayCount: comp ? comp.count : 0,
      currentStreak: streaks.currentStreak,
      bestStreak: streaks.bestStreak,
    };
  });
}
