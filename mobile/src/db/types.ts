export type AttendanceStatus = 'IN_PROGRESS' | 'COMPLETED';

export type AttendanceEventType = 
  | 'CHECK_IN' 
  | 'START_BREAK' 
  | 'END_BREAK' 
  | 'CHECK_OUT' 
  | 'CORRECTION';

export type PendingSuggestionStatus = 
  | 'PENDING' 
  | 'CONFIRMED' 
  | 'DISMISSED' 
  | 'SNOOZED' 
  | 'CANCELLED' 
  | 'EXPIRED';

export type PendingSuggestionType = 'ARRIVAL' | 'DEPARTURE';

export type PendingSuggestionSource = 'WIFI_AUTO' | 'MANUAL';

export interface PendingSuggestion {
  id: string;
  event_type: PendingSuggestionType;
  detected_at: string; // ISO UTC string
  source: PendingSuggestionSource;
  network_match: number; // 0 or 1
  status: PendingSuggestionStatus;
  created_at: string; // ISO UTC string
  confirmed_at: string | null; // ISO UTC string
  notes: string;
  client_updated_at: string;
  is_deleted: number;
}

export interface AttendanceSession {
  id: string;
  status: AttendanceStatus;
  start_time: string; // ISO UTC string
  end_time: string | null; // ISO UTC string
  work_date: string; // YYYY-MM-DD
  notes: string;
  is_incomplete: number; // 0 or 1
  is_corrected: number; // 0 or 1
  source?: string;
  detected_at?: string | null;
  confirmed_at?: string | null;
  network_match?: number;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  is_deleted: number;
}

export interface BreakSession {
  id: string;
  session_id: string;
  start_time: string; // ISO UTC string
  end_time: string | null; // ISO UTC string
  notes: string;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  is_deleted: number;
}

export interface AttendanceEvent {
  id: string;
  session_id: string;
  event_type: AttendanceEventType;
  timestamp: string; // ISO UTC string
  notes: string;
  source?: string;
  detected_at?: string | null;
  confirmed_at?: string | null;
  network_match?: number;
  created_at: string;
}

export interface AttendanceCorrection {
  id: string;
  session_id: string;
  reason: string;
  field_name: string;
  old_value: string;
  new_value: string;
  created_at: string;
}

export interface Activity {
  id: string;
  name: string;
  category: string;
  color: string;
  is_archived: number; // 0 or 1
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  is_deleted: number;
}

export interface ActivityEntry {
  id: string;
  activity_id: string;
  start_time: string; // ISO UTC string
  end_time: string | null; // ISO UTC string
  duration_seconds: number;
  work_date: string; // YYYY-MM-DD
  notes: string;
  is_running: number; // 0 or 1
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  is_deleted: number;
}

export interface Habit {
  id: string;
  name: string;
  description: string;
  target_count: number;
  unit: string;
  color: string;
  is_archived: number;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  is_deleted: number;
}

export interface HabitCompletion {
  id: string;
  habit_id: string;
  local_date: string; // YYYY-MM-DD
  completed: number; // 0 or 1
  count: number;
  notes: string;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
  is_deleted: number;
}

export interface UserSettings {
  workday_start: string; // e.g. "09:00"
  workday_end: string; // e.g. "17:00"
  office_name: string;
  timezone: string;
  theme: 'dark' | 'light' | 'system';
  wifi_ssid: string; // Phase 2 field
  wifi_bssid: string; // Phase 2 field
  wifi_enabled: string; // '1' | '0'
  wifi_grace_seconds: string; // e.g. '180'
  wifi_cooldown_minutes: string; // e.g. '15'
  wifi_last_dismissed_arrival: string; // ISO timestamp or ''
  backend_url: string;
  auth_token: string;
  last_sync_time: string | null;
}

export interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: 'UPSERT' | 'DELETE';
  payload: string; // JSON string
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retry_count: number;
  error_message: string | null;
  created_at: string;
}
