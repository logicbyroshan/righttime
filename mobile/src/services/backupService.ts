import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '../db/database';
import {
  BackupPayload,
  computeDataChecksum,
} from './backupValidation';

export * from './backupValidation';

/**
 * Generate complete database backup payload
 */
export async function createDatabaseBackupPayload(): Promise<BackupPayload> {
  const db = getDatabase();

  const sessions = db.getAllSync('SELECT * FROM attendance_sessions;');
  const events = db.getAllSync('SELECT * FROM attendance_events;');
  const breaks = db.getAllSync('SELECT * FROM break_sessions;');
  const corrections = db.getAllSync('SELECT * FROM attendance_corrections;');
  const activities = db.getAllSync('SELECT * FROM activities;');
  const activityEntries = db.getAllSync('SELECT * FROM activity_entries;');
  const habits = db.getAllSync('SELECT * FROM habits;');
  const habitCompletions = db.getAllSync('SELECT * FROM habit_completions;');
  const suggestions = db.getAllSync('SELECT * FROM pending_suggestions;');
  const batches = db.getAllSync('SELECT * FROM official_attendance_batches;');
  const officialRecords = db.getAllSync('SELECT * FROM official_attendance_records;');

  // Exclude sensitive credentials from settings backup
  const rawSettings = db.getAllSync<{ key: string; value: string }>('SELECT * FROM user_settings;');
  const filteredSettings = rawSettings.filter(
    (s) => s.key !== 'auth_token' && s.key !== 'password'
  );

  const data = {
    attendance_sessions: sessions,
    attendance_events: events,
    break_sessions: breaks,
    attendance_corrections: corrections,
    activities: activities,
    activity_entries: activityEntries,
    habits: habits,
    habit_completions: habitCompletions,
    pending_suggestions: suggestions,
    official_attendance_batches: batches,
    official_attendance_records: officialRecords,
    user_settings: filteredSettings,
  };

  const recordCounts = {
    attendance_sessions: sessions.length,
    attendance_events: events.length,
    break_sessions: breaks.length,
    attendance_corrections: corrections.length,
    activities: activities.length,
    activity_entries: activityEntries.length,
    habits: habits.length,
    habit_completions: habitCompletions.length,
    pending_suggestions: suggestions.length,
    official_attendance_batches: batches.length,
    official_attendance_records: officialRecords.length,
    user_settings: filteredSettings.length,
  };

  const checksum = await computeDataChecksum(data);

  return {
    backup_version: 1,
    app_version: '1.2.0',
    created_at: new Date().toISOString(),
    record_counts: recordCounts,
    data,
    integrity_checksum: checksum,
  };
}

/**
 * Export backup to disk and share via native Share sheet
 */
export async function exportBackupAndShare(): Promise<string> {
  const payload = await createDatabaseBackupPayload();
  const jsonStr = JSON.stringify(payload, null, 2);

  const timestampStr = payload.created_at.replace(/[:.]/g, '-');
  const filename = `personal_time_ledger_backup_${timestampStr}.json`;
  const dir = FileSystem.documentDirectory || '';
  const filepath = `${dir}${filename}`;

  await FileSystem.writeAsStringAsync(filepath, jsonStr, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filepath, {
      mimeType: 'application/json',
      dialogTitle: 'Export Personal Time Ledger Backup',
      UTI: 'public.json',
    });
  }

  return filepath;
}

/**
 * Restore database atomically from validated backup payload.
 * Creates an emergency pre-restore rollback backup first.
 */
export async function restoreDatabaseFromPayload(
  payload: BackupPayload
): Promise<{ success: boolean; rollbackPath: string }> {
  // 1. Create an emergency pre-restore rollback file
  const rollbackPayload = await createDatabaseBackupPayload();
  const dir = FileSystem.documentDirectory || '';
  const rollbackPath = `${dir}emergency_pre_restore_rollback_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(rollbackPath, JSON.stringify(rollbackPayload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const db = getDatabase();

  // 2. Execute atomic replacement restore inside transaction
  db.withTransactionSync(() => {
    // Disable FKs temporarily during full table replacement
    db.execSync('PRAGMA foreign_keys = OFF;');

    // Clear existing data
    db.execSync(`
      DELETE FROM sync_queue;
      DELETE FROM pending_suggestions;
      DELETE FROM habit_completions;
      DELETE FROM habits;
      DELETE FROM activity_entries;
      DELETE FROM activities;
      DELETE FROM attendance_corrections;
      DELETE FROM attendance_events;
      DELETE FROM break_sessions;
      DELETE FROM attendance_sessions;
      DELETE FROM official_attendance_records;
      DELETE FROM official_attendance_batches;
    `);

    // Helper for table inserts
    const insertRows = (tableName: string, rows: any[]) => {
      if (!rows || rows.length === 0) return;
      for (const row of rows) {
        const keys = Object.keys(row);
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((k) => row[k]);
        db.runSync(
          `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders});`,
          values
        );
      }
    };

    insertRows('attendance_sessions', payload.data.attendance_sessions);
    insertRows('break_sessions', payload.data.break_sessions);
    insertRows('attendance_events', payload.data.attendance_events);
    insertRows('attendance_corrections', payload.data.attendance_corrections);
    insertRows('activities', payload.data.activities);
    insertRows('activity_entries', payload.data.activity_entries);
    insertRows('habits', payload.data.habits);
    insertRows('habit_completions', payload.data.habit_completions);
    insertRows('pending_suggestions', payload.data.pending_suggestions);
    insertRows('official_attendance_batches', payload.data.official_attendance_batches);
    insertRows('official_attendance_records', payload.data.official_attendance_records);

    // Restore settings without overwriting active secure tokens
    for (const s of payload.data.user_settings || []) {
      if (s.key !== 'auth_token') {
        db.runSync(
          `INSERT INTO user_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
          [s.key, s.value]
        );
      }
    }

    db.execSync('PRAGMA foreign_keys = ON;');
  });

  return { success: true, rollbackPath };
}
