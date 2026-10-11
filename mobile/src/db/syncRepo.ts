import { getDatabase, generateUUID } from './database';
import { SyncQueueItem } from './types';

export function enqueueSync(
  entityType: string,
  entityId: string,
  operation: 'UPSERT' | 'DELETE',
  payload: any
): void {
  const db = getDatabase();
  const id = generateUUID();
  const now = new Date().toISOString();

  // If there is already a PENDING entry for this entity, replace it with latest payload
  const existing = db.getFirstSync<SyncQueueItem>(
    "SELECT id FROM sync_queue WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING';",
    [entityType, entityId]
  );

  if (existing) {
    db.runSync(
      `UPDATE sync_queue SET operation = ?, payload = ?, created_at = ? WHERE id = ?;`,
      [operation, JSON.stringify(payload), now, existing.id]
    );
  } else {
    db.runSync(
      `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, status, retry_count, created_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?);`,
      [id, entityType, entityId, operation, JSON.stringify(payload), now]
    );
  }
}

export interface SyncStatus {
  pendingCount: number;
  lastSyncTime: string | null;
  lastError: string | null;
}

export function getSyncQueueStatus(): SyncStatus {
  const db = getDatabase();
  const pendingRow = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING';"
  );
  const lastSyncRow = db.getFirstSync<{ value: string }>(
    "SELECT value FROM user_settings WHERE key = 'last_sync_time';"
  );
  const failedRow = db.getFirstSync<{ error_message: string }>(
    "SELECT error_message FROM sync_queue WHERE status = 'FAILED' ORDER BY created_at DESC LIMIT 1;"
  );

  return {
    pendingCount: pendingRow?.count || 0,
    lastSyncTime: lastSyncRow?.value || null,
    lastError: failedRow?.error_message || null,
  };
}

export async function performSync(
  backendUrl: string,
  authToken: string
): Promise<{ success: boolean; message: string; appliedCount: number }> {
  const db = getDatabase();
  const pendingItems = db.getAllSync<SyncQueueItem>(
    "SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 100;"
  );

  if (pendingItems.length === 0) {
    // If nothing pending, check if server is reachable and update last_sync_time
    return { success: true, message: 'All local changes are already synchronized.', appliedCount: 0 };
  }

  // Group items by entity_type for the sync endpoint
  const payload: Record<string, any[]> = {
    attendance_sessions: [],
    break_sessions: [],
    attendance_events: [],
    attendance_corrections: [],
    activities: [],
    activity_entries: [],
    habits: [],
    habit_completions: [],
  };

  const processedIds: string[] = [];

  for (const item of pendingItems) {
    try {
      const parsed = JSON.parse(item.payload);
      if (payload[item.entity_type]) {
        payload[item.entity_type].push(parsed);
        processedIds.push(item.id);
      }
    } catch (e) {
      // bad JSON
    }
  }

  const endpoint = `${backendUrl.replace(/\/+$/, '')}/api/v1/sync/`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken ? `Token ${authToken}` : '',
      },
      body: JSON.stringify({
        device_id: 'expo-android-client',
        last_sync_timestamp: new Date().toISOString(),
        ...payload,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Mark items with error without deleting
      for (const id of processedIds) {
        db.runSync(
          "UPDATE sync_queue SET status = 'FAILED', retry_count = retry_count + 1, error_message = ? WHERE id = ?;",
          [errorText.substring(0, 200), id]
        );
      }
      return { success: false, message: `Sync failed with server status ${response.status}`, appliedCount: 0 };
    }

    const data = await response.json();
    const nowIso = new Date().toISOString();

    // Mark items as SYNCED
    for (const id of processedIds) {
      db.runSync(
        "UPDATE sync_queue SET status = 'SYNCED', error_message = NULL WHERE id = ?;",
        [id]
      );
    }

    // Clean up old SYNCED records
    db.runSync("DELETE FROM sync_queue WHERE status = 'SYNCED';");

    // Update last sync time
    db.runSync(
      "UPDATE user_settings SET value = ? WHERE key = 'last_sync_time';",
      [nowIso]
    );

    return {
      success: true,
      message: `Successfully synchronized ${processedIds.length} changes.`,
      appliedCount: processedIds.length,
    };
  } catch (error: any) {
    for (const id of processedIds) {
      db.runSync(
        "UPDATE sync_queue SET status = 'FAILED', retry_count = retry_count + 1, error_message = ? WHERE id = ?;",
        [error.message || 'Network error', id]
      );
    }
    return {
      success: false,
      message: error.message || 'Unable to connect to backend server.',
      appliedCount: 0,
    };
  }
}
