import { getDatabase, resetDatabase } from './database';
import { UserSettings } from './types';
import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_SECURE_KEY = 'plt_auth_token';

export function getSettings(): UserSettings {
  const db = getDatabase();
  const rows = db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM user_settings;');
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }

  // Retrieve token securely if possible
  let token = map['auth_token'] || '';
  try {
    const secureToken = SecureStore.getItem(AUTH_TOKEN_SECURE_KEY);
    if (secureToken) {
      token = secureToken;
    }
  } catch (e) {
    // fallback to SQLite settings
  }

  return {
    workday_start: map['workday_start'] || '09:00',
    workday_end: map['workday_end'] || '17:00',
    office_name: map['office_name'] || 'Office HQ',
    timezone: map['timezone'] || 'Asia/Kolkata',
    theme: (map['theme'] as 'dark' | 'light' | 'system') || 'dark',
    wifi_ssid: map['wifi_ssid'] || '',
    wifi_bssid: map['wifi_bssid'] || '',
    backend_url: map['backend_url'] || 'http://10.0.2.2:8000',
    auth_token: token,
    last_sync_time: map['last_sync_time'] || null,
  };
}

export function updateSettings(updates: Partial<UserSettings>): UserSettings {
  const db = getDatabase();

  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      if (k === 'auth_token') {
        try {
          SecureStore.setItem(AUTH_TOKEN_SECURE_KEY, v as string);
        } catch (e) {
          // ignore
        }
      }
      db.runSync(
        `INSERT INTO user_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
        [k, String(v)]
      );
    }
  }

  return getSettings();
}

export function resetApplicationData(): void {
  try {
    SecureStore.deleteItemAsync(AUTH_TOKEN_SECURE_KEY);
  } catch (e) {
    // ignore
  }
  resetDatabase();
}
