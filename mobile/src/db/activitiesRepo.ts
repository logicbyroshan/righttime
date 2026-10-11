import { getDatabase, generateUUID } from './database';
import { Activity, ActivityEntry } from './types';
import { enqueueSync } from './syncRepo';

export interface ActiveTimerInfo {
  entry: ActivityEntry | null;
  activity: Activity | null;
  elapsedSeconds: number;
}

export function getActivities(includeArchived: boolean = false): Activity[] {
  const db = getDatabase();
  const query = includeArchived
    ? 'SELECT * FROM activities WHERE is_deleted = 0 ORDER BY name ASC;'
    : 'SELECT * FROM activities WHERE is_deleted = 0 AND is_archived = 0 ORDER BY name ASC;';
  return db.getAllSync<Activity>(query);
}

export function createActivity(name: string, category: string = 'General', color: string = '#3B82F6'): Activity {
  const db = getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();

  db.runSync(
    `INSERT INTO activities (id, name, category, color, is_archived, created_at, updated_at, client_updated_at, is_deleted)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0);`,
    [id, name.trim(), category.trim(), color, now, now, now]
  );

  enqueueSync('activities', id, 'UPSERT', {
    id,
    name: name.trim(),
    category: category.trim(),
    color,
    is_archived: 0,
  });

  return db.getFirstSync<Activity>('SELECT * FROM activities WHERE id = ?;', [id])!;
}

export function updateActivity(id: string, updates: Partial<Activity>): Activity {
  const db = getDatabase();
  const current = db.getFirstSync<Activity>('SELECT * FROM activities WHERE id = ? AND is_deleted = 0;', [id]);
  if (!current) throw new Error('Activity not found.');

  const now = new Date().toISOString();
  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  const category = updates.category !== undefined ? updates.category.trim() : current.category;
  const color = updates.color !== undefined ? updates.color : current.color;
  const is_archived = updates.is_archived !== undefined ? updates.is_archived : current.is_archived;

  db.runSync(
    `UPDATE activities SET name = ?, category = ?, color = ?, is_archived = ?, updated_at = ?, client_updated_at = ?
     WHERE id = ?;`,
    [name, category, color, is_archived, now, now, id]
  );

  enqueueSync('activities', id, 'UPSERT', {
    id,
    name,
    category,
    color,
    is_archived,
  });

  return db.getFirstSync<Activity>('SELECT * FROM activities WHERE id = ?;', [id])!;
}

export function deleteActivity(id: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.runSync(
    'UPDATE activities SET is_deleted = 1, updated_at = ?, client_updated_at = ? WHERE id = ?;',
    [now, now, id]
  );
  enqueueSync('activities', id, 'DELETE', { id, is_deleted: 1 });
}

export function getActiveTimer(): ActiveTimerInfo {
  const db = getDatabase();
  const entry = db.getFirstSync<ActivityEntry>(
    'SELECT * FROM activity_entries WHERE is_running = 1 AND is_deleted = 0 LIMIT 1;'
  );

  if (!entry) {
    return { entry: null, activity: null, elapsedSeconds: 0 };
  }

  const activity = db.getFirstSync<Activity>('SELECT * FROM activities WHERE id = ?;', [entry.activity_id]);
  const startMs = new Date(entry.start_time).getTime();
  const nowMs = new Date().getTime();
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));

  return { entry, activity, elapsedSeconds };
}

export function startTimer(activityId: string, notes: string = ''): ActivityEntry {
  const db = getDatabase();
  // Check for any currently running timer to prevent overlaps
  const existingRunning = db.getFirstSync<ActivityEntry>(
    'SELECT id FROM activity_entries WHERE is_running = 1 AND is_deleted = 0 LIMIT 1;'
  );
  if (existingRunning) {
    throw new Error('Another activity timer is already running. Please stop it first.');
  }

  const activity = db.getFirstSync<Activity>('SELECT id FROM activities WHERE id = ? AND is_deleted = 0;', [activityId]);
  if (!activity) {
    throw new Error('Activity not found.');
  }

  const id = generateUUID();
  const now = new Date().toISOString();
  const workDate = now.split('T')[0];

  db.runSync(
    `INSERT INTO activity_entries (
      id, activity_id, start_time, end_time, duration_seconds, work_date,
      notes, is_running, created_at, updated_at, client_updated_at, is_deleted
    ) VALUES (?, ?, ?, NULL, 0, ?, ?, 1, ?, ?, ?, 0);`,
    [id, activityId, now, workDate, notes, now, now, now]
  );

  enqueueSync('activity_entries', id, 'UPSERT', {
    id,
    activity_id: activityId,
    start_time: now,
    work_date: workDate,
    notes,
    is_running: true,
  });

  return db.getFirstSync<ActivityEntry>('SELECT * FROM activity_entries WHERE id = ?;', [id])!;
}

export function stopTimer(entryId: string, notes?: string): ActivityEntry {
  const db = getDatabase();
  const entry = db.getFirstSync<ActivityEntry>(
    'SELECT * FROM activity_entries WHERE id = ? AND is_deleted = 0;',
    [entryId]
  );
  if (!entry) {
    throw new Error('Activity entry not found.');
  }
  if (entry.is_running === 0) {
    return entry;
  }

  const now = new Date().toISOString();
  const startMs = new Date(entry.start_time).getTime();
  const nowMs = new Date(now).getTime();
  const durationSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const finalNotes = notes !== undefined ? notes : entry.notes;

  db.runSync(
    `UPDATE activity_entries SET
      end_time = ?,
      duration_seconds = ?,
      notes = ?,
      is_running = 0,
      updated_at = ?,
      client_updated_at = ?
     WHERE id = ?;`,
    [now, durationSeconds, finalNotes, now, now, entryId]
  );

  enqueueSync('activity_entries', entryId, 'UPSERT', {
    id: entryId,
    activity_id: entry.activity_id,
    start_time: entry.start_time,
    end_time: now,
    duration_seconds: durationSeconds,
    work_date: entry.work_date,
    notes: finalNotes,
    is_running: false,
  });

  return db.getFirstSync<ActivityEntry>('SELECT * FROM activity_entries WHERE id = ?;', [entryId])!;
}

export function addManualEntry(
  activityId: string,
  startTime: string,
  endTime: string,
  notes: string = ''
): ActivityEntry {
  const db = getDatabase();
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error('Invalid start or end time format.');
  }
  if (endMs <= startMs) {
    throw new Error('End time must be strictly after start time.');
  }

  const durationSeconds = Math.floor((endMs - startMs) / 1000);
  const workDate = startTime.split('T')[0];
  const id = generateUUID();
  const now = new Date().toISOString();

  db.runSync(
    `INSERT INTO activity_entries (
      id, activity_id, start_time, end_time, duration_seconds, work_date,
      notes, is_running, created_at, updated_at, client_updated_at, is_deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0);`,
    [id, activityId, startTime, endTime, durationSeconds, workDate, notes, now, now, now]
  );

  enqueueSync('activity_entries', id, 'UPSERT', {
    id,
    activity_id: activityId,
    start_time: startTime,
    end_time: endTime,
    duration_seconds: durationSeconds,
    work_date: workDate,
    notes,
    is_running: false,
  });

  return db.getFirstSync<ActivityEntry>('SELECT * FROM activity_entries WHERE id = ?;', [id])!;
}

export function deleteEntry(id: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.runSync(
    'UPDATE activity_entries SET is_deleted = 1, updated_at = ?, client_updated_at = ? WHERE id = ?;',
    [now, now, id]
  );
  enqueueSync('activity_entries', id, 'DELETE', { id, is_deleted: 1 });
}

export interface ActivitySummaryItem {
  activityId: string;
  name: string;
  category: string;
  color: string;
  totalSeconds: number;
  entryCount: number;
}

export function getTodayActivitiesSummary(workDate?: string): ActivitySummaryItem[] {
  const db = getDatabase();
  const dateStr = workDate || new Date().toISOString().split('T')[0];

  const rows = db.getAllSync<{
    activity_id: string;
    name: string;
    category: string;
    color: string;
    total_seconds: number;
    entry_count: number;
  }>(
    `SELECT a.id as activity_id, a.name, a.category, a.color,
            COALESCE(SUM(e.duration_seconds), 0) as total_seconds,
            COUNT(e.id) as entry_count
     FROM activities a
     JOIN activity_entries e ON a.id = e.activity_id
     WHERE e.work_date = ? AND e.is_deleted = 0 AND a.is_deleted = 0
     GROUP BY a.id, a.name, a.category, a.color
     ORDER BY total_seconds DESC;`,
    [dateStr]
  );

  return rows.map((r) => ({
    activityId: r.activity_id,
    name: r.name,
    category: r.category,
    color: r.color,
    totalSeconds: r.total_seconds,
    entryCount: r.entry_count,
  }));
}

export function getEntriesForDate(workDate: string): (ActivityEntry & { activity_name: string; activity_color: string })[] {
  const db = getDatabase();
  return db.getAllSync<ActivityEntry & { activity_name: string; activity_color: string }>(
    `SELECT e.*, a.name as activity_name, a.color as activity_color
     FROM activity_entries e
     JOIN activities a ON e.activity_id = a.id
     WHERE e.work_date = ? AND e.is_deleted = 0
     ORDER BY e.start_time DESC;`,
    [workDate]
  );
}
