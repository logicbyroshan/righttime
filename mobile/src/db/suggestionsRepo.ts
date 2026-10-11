import { getDatabase, generateUUID } from './database';
import {
  PendingSuggestion,
  PendingSuggestionType,
  PendingSuggestionStatus,
  PendingSuggestionSource,
} from './types';
import { checkIn, checkOut, getActiveSession } from './attendanceRepo';
import { enqueueSync } from './syncRepo';

export interface SuggestionDetails {
  suggestion: PendingSuggestion;
  timeSinceDetectionMinutes: number;
}

/**
 * Creates a new pending suggestion if a matching one isn't already PENDING.
 */
export function createPendingSuggestion(
  eventType: PendingSuggestionType,
  detectedAt?: string,
  source: PendingSuggestionSource = 'WIFI_AUTO',
  networkMatch: number = 1,
  notes: string = ''
): PendingSuggestion {
  const db = getDatabase();
  const detectionIso = detectedAt || new Date().toISOString();
  const now = new Date().toISOString();

  // Rule: Repeated connectivity callbacks must not create repeated prompts for the same event.
  const existing = db.getFirstSync<PendingSuggestion>(
    "SELECT * FROM pending_suggestions WHERE event_type = ? AND status = 'PENDING' AND is_deleted = 0 LIMIT 1;",
    [eventType]
  );
  if (existing) {
    return existing;
  }

  const id = generateUUID();

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO pending_suggestions (
        id, event_type, detected_at, source, network_match,
        status, created_at, confirmed_at, notes, client_updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NULL, ?, ?, 0);`,
      [id, eventType, detectionIso, source, networkMatch, now, notes, now]
    );

    enqueueSync('pending_suggestions', id, 'UPSERT', {
      id,
      event_type: eventType,
      detected_at: detectionIso,
      source,
      network_match: networkMatch,
      status: 'PENDING',
      created_at: now,
      notes,
    });
  });

  return db.getFirstSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE id = ?;',
    [id]
  )!;
}

/**
 * Retrieves all currently actionable suggestions.
 * Automatically awakens snoozed suggestions whose snooze period has expired.
 */
export function getPendingSuggestions(): PendingSuggestion[] {
  const db = getDatabase();
  const now = new Date().getTime();

  // Wake up snoozed suggestions if snooze expired
  const snoozed = db.getAllSync<PendingSuggestion>(
    "SELECT * FROM pending_suggestions WHERE status = 'SNOOZED' AND is_deleted = 0;"
  );
  for (const s of snoozed) {
    // Check if snooze expiry is embedded in notes or default 10 minutes from created_at
    let expiry = 0;
    if (s.notes && s.notes.startsWith('SNOOZE_UNTIL:')) {
      const untilIso = s.notes.replace('SNOOZE_UNTIL:', '').trim();
      expiry = new Date(untilIso).getTime();
    } else {
      expiry = new Date(s.client_updated_at).getTime() + 10 * 60 * 1000;
    }

    if (now >= expiry) {
      db.runSync(
        "UPDATE pending_suggestions SET status = 'PENDING', client_updated_at = ? WHERE id = ?;",
        [new Date().toISOString(), s.id]
      );
    }
  }

  return db.getAllSync<PendingSuggestion>(
    "SELECT * FROM pending_suggestions WHERE status = 'PENDING' AND is_deleted = 0 ORDER BY detected_at DESC;"
  );
}

/**
 * Returns recent suggestions history for diagnostics and audit.
 */
export function getAllSuggestions(limit: number = 20): PendingSuggestion[] {
  const db = getDatabase();
  return db.getAllSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE is_deleted = 0 ORDER BY detected_at DESC LIMIT ?;',
    [limit]
  );
}

/**
 * Confirms a pending suggestion and creates the corresponding attendance record.
 * Never confirms twice.
 */
export function confirmSuggestion(
  id: string,
  userNotes: string = '',
  recordingPolicy: 'DETECTION_TIME' | 'NOW' = 'NOW'
): PendingSuggestion {
  const db = getDatabase();
  const suggestion = db.getFirstSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE id = ? AND is_deleted = 0;',
    [id]
  );

  if (!suggestion) {
    throw new Error('Suggestion not found.');
  }

  if (suggestion.status !== 'PENDING') {
    throw new Error(`Cannot confirm suggestion with status ${suggestion.status}.`);
  }

  const now = new Date().toISOString();
  const eventTimestamp = recordingPolicy === 'DETECTION_TIME' ? suggestion.detected_at : now;

  db.withTransactionSync(() => {
    if (suggestion.event_type === 'ARRIVAL') {
      const active = getActiveSession();
      if (active.session) {
        throw new Error('An office session is already active. Please resolve it first.');
      }
      checkIn(
        userNotes || (suggestion.notes ? `[Wi-Fi Suggestion] ${suggestion.notes}` : '[Wi-Fi Suggestion]'),
        eventTimestamp,
        {
          source: 'WIFI_SUGGESTION',
          detectedAt: suggestion.detected_at,
          confirmedAt: now,
          networkMatch: suggestion.network_match,
        }
      );
    } else if (suggestion.event_type === 'DEPARTURE') {
      const active = getActiveSession();
      if (!active.session) {
        throw new Error('No active office session found to check out.');
      }
      if (active.activeBreak) {
        throw new Error('A break is currently open. Please end your break before confirming departure.');
      }
      checkOut(
        userNotes || (suggestion.notes ? `[Wi-Fi Suggestion] ${suggestion.notes}` : '[Wi-Fi Suggestion]'),
        eventTimestamp,
        {
          source: 'WIFI_SUGGESTION',
          detectedAt: suggestion.detected_at,
          confirmedAt: now,
          networkMatch: suggestion.network_match,
        }
      );
    }

    db.runSync(
      `UPDATE pending_suggestions SET
        status = 'CONFIRMED',
        confirmed_at = ?,
        notes = CASE WHEN ? != '' THEN ? ELSE notes END,
        client_updated_at = ?
       WHERE id = ?;`,
      [now, userNotes, userNotes, now, id]
    );

    enqueueSync('pending_suggestions', id, 'UPSERT', {
      id,
      event_type: suggestion.event_type,
      detected_at: suggestion.detected_at,
      source: suggestion.source,
      network_match: suggestion.network_match,
      status: 'CONFIRMED',
      confirmed_at: now,
      notes: userNotes || suggestion.notes,
    });
  });

  return db.getFirstSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE id = ?;',
    [id]
  )!;
}

/**
 * Dismisses a pending suggestion. Dismissing an arrival activates cooldown.
 */
export function dismissSuggestion(id: string, reason: string = ''): PendingSuggestion {
  const db = getDatabase();
  const suggestion = db.getFirstSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE id = ? AND is_deleted = 0;',
    [id]
  );

  if (!suggestion) {
    throw new Error('Suggestion not found.');
  }

  if (suggestion.status !== 'PENDING') {
    return suggestion;
  }

  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE pending_suggestions SET
        status = 'DISMISSED',
        notes = CASE WHEN ? != '' THEN ? ELSE notes END,
        client_updated_at = ?
       WHERE id = ?;`,
      [reason, reason, now, id]
    );

    if (suggestion.event_type === 'ARRIVAL') {
      // Record dismissal time to user_settings for arrival cooldown
      db.runSync(
        `INSERT INTO user_settings (key, value) VALUES ('wifi_last_dismissed_arrival', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
        [now]
      );
    }

    enqueueSync('pending_suggestions', id, 'UPSERT', {
      id,
      event_type: suggestion.event_type,
      detected_at: suggestion.detected_at,
      source: suggestion.source,
      network_match: suggestion.network_match,
      status: 'DISMISSED',
      notes: reason || suggestion.notes,
    });
  });

  return db.getFirstSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE id = ?;',
    [id]
  )!;
}

/**
 * Snoozes a suggestion for the specified number of minutes.
 */
export function snoozeSuggestion(id: string, snoozeMinutes: number = 10): PendingSuggestion {
  const db = getDatabase();
  const suggestion = db.getFirstSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE id = ? AND is_deleted = 0;',
    [id]
  );

  if (!suggestion || suggestion.status !== 'PENDING') {
    throw new Error('Pending suggestion not found to snooze.');
  }

  const now = new Date();
  const expiry = new Date(now.getTime() + snoozeMinutes * 60 * 1000).toISOString();
  const noteContent = `SNOOZE_UNTIL:${expiry}`;

  db.runSync(
    `UPDATE pending_suggestions SET
      status = 'SNOOZED',
      notes = ?,
      client_updated_at = ?
     WHERE id = ?;`,
    [noteContent, now.toISOString(), id]
  );

  return db.getFirstSync<PendingSuggestion>(
    'SELECT * FROM pending_suggestions WHERE id = ?;',
    [id]
  )!;
}

/**
 * Cancels any pending departure suggestion if the office network was restored.
 */
export function cancelDepartureIfConnected(): boolean {
  const db = getDatabase();
  const pendingDeparture = db.getFirstSync<PendingSuggestion>(
    "SELECT * FROM pending_suggestions WHERE event_type = 'DEPARTURE' AND status = 'PENDING' AND is_deleted = 0 LIMIT 1;"
  );

  if (!pendingDeparture) {
    return false;
  }

  const now = new Date().toISOString();
  const cancelNote = 'Cancelled due to Wi-Fi reconnection within grace period.';

  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE pending_suggestions SET
        status = 'CANCELLED',
        notes = ?,
        client_updated_at = ?
       WHERE id = ?;`,
      [cancelNote, now, pendingDeparture.id]
    );

    enqueueSync('pending_suggestions', pendingDeparture.id, 'UPSERT', {
      id: pendingDeparture.id,
      event_type: 'DEPARTURE',
      detected_at: pendingDeparture.detected_at,
      source: pendingDeparture.source,
      network_match: pendingDeparture.network_match,
      status: 'CANCELLED',
      notes: cancelNote,
    });
  });

  return true;
}

/**
 * Reconciles pending suggestions against current active attendance session.
 */
export function reconcileSuggestionsWithSessionState(): void {
  const db = getDatabase();
  const active = getActiveSession();
  const now = new Date().toISOString();

  if (active.session) {
    // If active session exists, any pending ARRIVAL is cancelled/expired
    const pendingArrivals = db.getAllSync<PendingSuggestion>(
      "SELECT * FROM pending_suggestions WHERE event_type = 'ARRIVAL' AND status = 'PENDING' AND is_deleted = 0;"
    );
    for (const arr of pendingArrivals) {
      db.runSync(
        "UPDATE pending_suggestions SET status = 'CANCELLED', notes = 'Cancelled: session already in progress', client_updated_at = ? WHERE id = ?;",
        [now, arr.id]
      );
    }
  } else {
    // If no active session exists, any pending DEPARTURE is cancelled/expired
    const pendingDepartures = db.getAllSync<PendingSuggestion>(
      "SELECT * FROM pending_suggestions WHERE event_type = 'DEPARTURE' AND status = 'PENDING' AND is_deleted = 0;"
    );
    for (const dep of pendingDepartures) {
      db.runSync(
        "UPDATE pending_suggestions SET status = 'CANCELLED', notes = 'Cancelled: no active session found', client_updated_at = ? WHERE id = ?;",
        [now, dep.id]
      );
    }
  }
}
