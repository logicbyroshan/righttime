import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const DB_NAME = 'personal_time_ledger.db';
let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DB_NAME);
    initDatabase(dbInstance);
  }
  return dbInstance;
}

export function generateUUID(): string {
  return Crypto.randomUUID();
}

export function initDatabase(db: SQLite.SQLiteDatabase) {
  // 1. Enable foreign keys
  db.execSync('PRAGMA foreign_keys = ON;');

  // 2. Schema migrations tracker
  db.execSync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const currentVersionRow = db.getFirstSync<{ version: number }>(
    'SELECT MAX(version) as version FROM schema_migrations;'
  );
  const currentVersion = currentVersionRow?.version || 0;

  if (currentVersion < 1) {
    applyMigrationV1(db);
    db.runSync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
      [1, new Date().toISOString()]
    );
  }

  if (currentVersion < 2) {
    applyMigrationV2(db);
    db.runSync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
      [2, new Date().toISOString()]
    );
  }
}

function applyMigrationV1(db: SQLite.SQLiteDatabase) {
  db.execSync(`
    -- Attendance Sessions
    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
      start_time TEXT NOT NULL,
      end_time TEXT,
      work_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      is_incomplete INTEGER DEFAULT 0,
      is_corrected INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_att_sess_date ON attendance_sessions(work_date);
    CREATE INDEX IF NOT EXISTS idx_att_sess_status ON attendance_sessions(status);

    -- Break Sessions
    CREATE TABLE IF NOT EXISTS break_sessions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_breaks_session ON break_sessions(session_id);

    -- Attendance Events
    CREATE TABLE IF NOT EXISTS attendance_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_att_events_session ON attendance_events(session_id);

    -- Attendance Corrections
    CREATE TABLE IF NOT EXISTS attendance_corrections (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT DEFAULT '',
      new_value TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_corrections_session ON attendance_corrections(session_id);

    -- Activities
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      color TEXT NOT NULL DEFAULT '#3B82F6',
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    -- Activity Entries
    CREATE TABLE IF NOT EXISTS activity_entries (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_seconds INTEGER DEFAULT 0,
      work_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      is_running INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_act_entries_date ON activity_entries(work_date);
    CREATE INDEX IF NOT EXISTS idx_act_entries_running ON activity_entries(is_running);

    -- Habits
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      target_count INTEGER DEFAULT 1,
      unit TEXT DEFAULT 'times',
      color TEXT NOT NULL DEFAULT '#10B981',
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    -- Habit Completions (Unique per habit and local_date)
    CREATE TABLE IF NOT EXISTS habit_completions (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      local_date TEXT NOT NULL,
      completed INTEGER DEFAULT 1,
      count INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0,
      UNIQUE(habit_id, local_date)
    );

    CREATE INDEX IF NOT EXISTS idx_habit_comp_date ON habit_completions(local_date);

    -- User Settings
    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Default settings
    INSERT OR IGNORE INTO user_settings (key, value) VALUES
      ('workday_start', '09:00'),
      ('workday_end', '17:00'),
      ('office_name', 'Office HQ'),
      ('timezone', 'Asia/Kolkata'),
      ('theme', 'dark'),
      ('wifi_ssid', ''),
      ('wifi_bssid', ''),
      ('backend_url', 'http://10.0.2.2:8000'),
      ('auth_token', ''),
      ('last_sync_time', '');

    -- Sync Queue (Durable offline change log)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
  `);
}

function applyMigrationV2(db: SQLite.SQLiteDatabase) {
  db.execSync(`
    -- Pending Suggestions table
    CREATE TABLE IF NOT EXISTS pending_suggestions (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'WIFI_AUTO',
      network_match INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      notes TEXT DEFAULT '',
      client_updated_at TEXT NOT NULL,
      is_deleted INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_pending_sugg_status ON pending_suggestions(status);
    CREATE INDEX IF NOT EXISTS idx_pending_sugg_detected ON pending_suggestions(detected_at);

    -- New Wi-Fi configuration settings
    INSERT OR IGNORE INTO user_settings (key, value) VALUES
      ('wifi_enabled', '1'),
      ('wifi_grace_seconds', '180'),
      ('wifi_cooldown_minutes', '15'),
      ('wifi_last_dismissed_arrival', '');
  `);

  // Safely add columns to attendance_sessions if they don't already exist
  const sessionCols = db.getAllSync<{ name: string }>("PRAGMA table_info(attendance_sessions);").map(c => c.name);
  if (!sessionCols.includes('source')) {
    db.execSync("ALTER TABLE attendance_sessions ADD COLUMN source TEXT DEFAULT 'MANUAL';");
  }
  if (!sessionCols.includes('detected_at')) {
    db.execSync("ALTER TABLE attendance_sessions ADD COLUMN detected_at TEXT;");
  }
  if (!sessionCols.includes('confirmed_at')) {
    db.execSync("ALTER TABLE attendance_sessions ADD COLUMN confirmed_at TEXT;");
  }
  if (!sessionCols.includes('network_match')) {
    db.execSync("ALTER TABLE attendance_sessions ADD COLUMN network_match INTEGER DEFAULT 1;");
  }

  // Safely add columns to attendance_events if they don't already exist
  const eventCols = db.getAllSync<{ name: string }>("PRAGMA table_info(attendance_events);").map(c => c.name);
  if (!eventCols.includes('source')) {
    db.execSync("ALTER TABLE attendance_events ADD COLUMN source TEXT DEFAULT 'MANUAL';");
  }
  if (!eventCols.includes('detected_at')) {
    db.execSync("ALTER TABLE attendance_events ADD COLUMN detected_at TEXT;");
  }
  if (!eventCols.includes('confirmed_at')) {
    db.execSync("ALTER TABLE attendance_events ADD COLUMN confirmed_at TEXT;");
  }
  if (!eventCols.includes('network_match')) {
    db.execSync("ALTER TABLE attendance_events ADD COLUMN network_match INTEGER DEFAULT 1;");
  }
}

export function resetDatabase() {
  const db = getDatabase();
  db.execSync(`
    DROP TABLE IF EXISTS sync_queue;
    DROP TABLE IF EXISTS pending_suggestions;
    DROP TABLE IF EXISTS habit_completions;
    DROP TABLE IF EXISTS habits;
    DROP TABLE IF EXISTS activity_entries;
    DROP TABLE IF EXISTS activities;
    DROP TABLE IF EXISTS attendance_corrections;
    DROP TABLE IF EXISTS attendance_events;
    DROP TABLE IF EXISTS break_sessions;
    DROP TABLE IF EXISTS attendance_sessions;
    DROP TABLE IF EXISTS user_settings;
    DROP TABLE IF EXISTS schema_migrations;
  `);
  initDatabase(db);
}
