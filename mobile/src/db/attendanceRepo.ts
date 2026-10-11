import { getDatabase, generateUUID } from './database';
import {
  AttendanceSession,
  BreakSession,
  AttendanceEvent,
  AttendanceCorrection,
} from './types';
import { enqueueSync } from './syncRepo';

export interface ActiveSessionDetails {
  session: AttendanceSession | null;
  activeBreak: BreakSession | null;
  breaks: BreakSession[];
  grossDurationSeconds: number;
  breakDurationSeconds: number;
  netDurationSeconds: number;
}

export function getActiveSession(): ActiveSessionDetails {
  const db = getDatabase();
  const session = db.getFirstSync<AttendanceSession>(
    "SELECT * FROM attendance_sessions WHERE status = 'IN_PROGRESS' AND is_deleted = 0 LIMIT 1;"
  );

  if (!session) {
    return {
      session: null,
      activeBreak: null,
      breaks: [],
      grossDurationSeconds: 0,
      breakDurationSeconds: 0,
      netDurationSeconds: 0,
    };
  }

  const breaks = db.getAllSync<BreakSession>(
    'SELECT * FROM break_sessions WHERE session_id = ? AND is_deleted = 0 ORDER BY start_time ASC;',
    [session.id]
  );

  const activeBreak = breaks.find((b) => !b.end_time) || null;

  const now = new Date().getTime();
  const startTimeMs = new Date(session.start_time).getTime();
  const grossDurationSeconds = Math.max(0, Math.floor((now - startTimeMs) / 1000));

  let breakDurationSeconds = 0;
  for (const b of breaks) {
    const bStart = new Date(b.start_time).getTime();
    const bEnd = b.end_time ? new Date(b.end_time).getTime() : now;
    if (bEnd > bStart) {
      breakDurationSeconds += Math.floor((bEnd - bStart) / 1000);
    }
  }

  const netDurationSeconds = Math.max(0, grossDurationSeconds - breakDurationSeconds);

  return {
    session,
    activeBreak,
    breaks,
    grossDurationSeconds,
    breakDurationSeconds,
    netDurationSeconds,
  };
}

export function checkIn(notes: string = '', customTimestamp?: string): AttendanceSession {
  const db = getDatabase();
  const existing = db.getFirstSync<AttendanceSession>(
    "SELECT id FROM attendance_sessions WHERE status = 'IN_PROGRESS' AND is_deleted = 0 LIMIT 1;"
  );
  if (existing) {
    throw new Error('An office session is already active.');
  }

  const timestamp = customTimestamp || new Date().toISOString();
  const workDate = timestamp.split('T')[0];
  const sessionId = generateUUID();
  const eventId = generateUUID();
  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO attendance_sessions (
        id, status, start_time, end_time, work_date, notes, is_incomplete, is_corrected,
        created_at, updated_at, client_updated_at, is_deleted
      ) VALUES (?, 'IN_PROGRESS', ?, NULL, ?, ?, 0, 0, ?, ?, ?, 0);`,
      [sessionId, timestamp, workDate, notes, now, now, now]
    );

    db.runSync(
      `INSERT INTO attendance_events (id, session_id, event_type, timestamp, notes, created_at)
       VALUES (?, ?, 'CHECK_IN', ?, ?, ?);`,
      [eventId, sessionId, timestamp, notes, now]
    );

    enqueueSync('attendance_sessions', sessionId, 'UPSERT', {
      id: sessionId,
      status: 'IN_PROGRESS',
      start_time: timestamp,
      work_date: workDate,
      notes,
    });

    enqueueSync('attendance_events', eventId, 'UPSERT', {
      id: eventId,
      session_id: sessionId,
      event_type: 'CHECK_IN',
      timestamp,
      notes,
    });
  });

  return db.getFirstSync<AttendanceSession>(
    'SELECT * FROM attendance_sessions WHERE id = ?;',
    [sessionId]
  )!;
}

export function startBreak(notes: string = '', customTimestamp?: string): BreakSession {
  const db = getDatabase();
  const session = db.getFirstSync<AttendanceSession>(
    "SELECT id FROM attendance_sessions WHERE status = 'IN_PROGRESS' AND is_deleted = 0 LIMIT 1;"
  );
  if (!session) {
    throw new Error('No active office session found.');
  }

  const activeBreak = db.getFirstSync<BreakSession>(
    'SELECT id FROM break_sessions WHERE session_id = ? AND end_time IS NULL AND is_deleted = 0 LIMIT 1;',
    [session.id]
  );
  if (activeBreak) {
    throw new Error('A break is already active.');
  }

  const timestamp = customTimestamp || new Date().toISOString();
  const breakId = generateUUID();
  const eventId = generateUUID();
  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO break_sessions (
        id, session_id, start_time, end_time, notes,
        created_at, updated_at, client_updated_at, is_deleted
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0);`,
      [breakId, session.id, timestamp, notes, now, now, now]
    );

    db.runSync(
      `INSERT INTO attendance_events (id, session_id, event_type, timestamp, notes, created_at)
       VALUES (?, ?, 'START_BREAK', ?, ?, ?);`,
      [eventId, session.id, timestamp, notes, now]
    );

    enqueueSync('break_sessions', breakId, 'UPSERT', {
      id: breakId,
      session_id: session.id,
      start_time: timestamp,
      notes,
    });

    enqueueSync('attendance_events', eventId, 'UPSERT', {
      id: eventId,
      session_id: session.id,
      event_type: 'START_BREAK',
      timestamp,
      notes,
    });
  });

  return db.getFirstSync<BreakSession>('SELECT * FROM break_sessions WHERE id = ?;', [breakId])!;
}

export function endBreak(notes: string = '', customTimestamp?: string): BreakSession {
  const db = getDatabase();
  const session = db.getFirstSync<AttendanceSession>(
    "SELECT id FROM attendance_sessions WHERE status = 'IN_PROGRESS' AND is_deleted = 0 LIMIT 1;"
  );
  if (!session) {
    throw new Error('No active office session found.');
  }

  const activeBreak = db.getFirstSync<BreakSession>(
    'SELECT * FROM break_sessions WHERE session_id = ? AND end_time IS NULL AND is_deleted = 0 LIMIT 1;',
    [session.id]
  );
  if (!activeBreak) {
    throw new Error('No active break found to end.');
  }

  const timestamp = customTimestamp || new Date().toISOString();
  const eventId = generateUUID();
  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE break_sessions SET end_time = ?, updated_at = ?, client_updated_at = ?
       WHERE id = ?;`,
      [timestamp, now, now, activeBreak.id]
    );

    db.runSync(
      `INSERT INTO attendance_events (id, session_id, event_type, timestamp, notes, created_at)
       VALUES (?, ?, 'END_BREAK', ?, ?, ?);`,
      [eventId, session.id, timestamp, notes, now]
    );

    enqueueSync('break_sessions', activeBreak.id, 'UPSERT', {
      id: activeBreak.id,
      session_id: session.id,
      start_time: activeBreak.start_time,
      end_time: timestamp,
      notes: activeBreak.notes,
    });

    enqueueSync('attendance_events', eventId, 'UPSERT', {
      id: eventId,
      session_id: session.id,
      event_type: 'END_BREAK',
      timestamp,
      notes,
    });
  });

  return db.getFirstSync<BreakSession>('SELECT * FROM break_sessions WHERE id = ?;', [
    activeBreak.id,
  ])!;
}

export function checkOut(notes: string = '', customTimestamp?: string): AttendanceSession {
  const db = getDatabase();
  const session = db.getFirstSync<AttendanceSession>(
    "SELECT * FROM attendance_sessions WHERE status = 'IN_PROGRESS' AND is_deleted = 0 LIMIT 1;"
  );
  if (!session) {
    throw new Error('No active office session found to check out.');
  }

  const openBreak = db.getFirstSync<BreakSession>(
    'SELECT id FROM break_sessions WHERE session_id = ? AND end_time IS NULL AND is_deleted = 0 LIMIT 1;',
    [session.id]
  );
  if (openBreak) {
    throw new Error('A break is currently open. Please end your break before checking out.');
  }

  const timestamp = customTimestamp || new Date().toISOString();
  const eventId = generateUUID();
  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE attendance_sessions SET
        status = 'COMPLETED',
        end_time = ?,
        notes = CASE WHEN ? != '' THEN notes || ' ' || ? ELSE notes END,
        updated_at = ?,
        client_updated_at = ?
       WHERE id = ?;`,
      [timestamp, notes, notes, now, now, session.id]
    );

    db.runSync(
      `INSERT INTO attendance_events (id, session_id, event_type, timestamp, notes, created_at)
       VALUES (?, ?, 'CHECK_OUT', ?, ?, ?);`,
      [eventId, session.id, timestamp, notes, now]
    );

    enqueueSync('attendance_sessions', session.id, 'UPSERT', {
      id: session.id,
      status: 'COMPLETED',
      start_time: session.start_time,
      end_time: timestamp,
      work_date: session.work_date,
      notes: session.notes ? `${session.notes} ${notes}`.trim() : notes,
    });

    enqueueSync('attendance_events', eventId, 'UPSERT', {
      id: eventId,
      session_id: session.id,
      event_type: 'CHECK_OUT',
      timestamp,
      notes,
    });
  });

  return db.getFirstSync<AttendanceSession>(
    'SELECT * FROM attendance_sessions WHERE id = ?;',
    [session.id]
  )!;
}

export function recordCorrection(
  sessionId: string,
  reason: string,
  updates: { startTime?: string; endTime?: string; notes?: string }
): AttendanceSession {
  const db = getDatabase();
  const session = db.getFirstSync<AttendanceSession>(
    'SELECT * FROM attendance_sessions WHERE id = ? AND is_deleted = 0;',
    [sessionId]
  );
  if (!session) {
    throw new Error('Attendance session not found.');
  }
  if (!reason.trim()) {
    throw new Error('A reason is required for manual corrections.');
  }

  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    if (updates.startTime && updates.startTime !== session.start_time) {
      db.runSync(
        `INSERT INTO attendance_corrections (id, session_id, reason, field_name, old_value, new_value, created_at)
         VALUES (?, ?, ?, 'start_time', ?, ?, ?);`,
        [generateUUID(), sessionId, reason, session.start_time, updates.startTime, now]
      );
      session.start_time = updates.startTime;
    }

    if (updates.endTime !== undefined && updates.endTime !== session.end_time) {
      db.runSync(
        `INSERT INTO attendance_corrections (id, session_id, reason, field_name, old_value, new_value, created_at)
         VALUES (?, ?, ?, 'end_time', ?, ?, ?);`,
        [generateUUID(), sessionId, reason, session.end_time || 'None', updates.endTime || 'None', now]
      );
      session.end_time = updates.endTime;
      if (session.end_time) {
        session.status = 'COMPLETED';
      }
    }

    if (updates.notes !== undefined && updates.notes !== session.notes) {
      db.runSync(
        `INSERT INTO attendance_corrections (id, session_id, reason, field_name, old_value, new_value, created_at)
         VALUES (?, ?, ?, 'notes', ?, ?, ?);`,
        [generateUUID(), sessionId, reason, session.notes, updates.notes, now]
      );
      session.notes = updates.notes;
    }

    db.runSync(
      `UPDATE attendance_sessions SET
        start_time = ?,
        end_time = ?,
        notes = ?,
        status = ?,
        is_corrected = 1,
        updated_at = ?,
        client_updated_at = ?
       WHERE id = ?;`,
      [session.start_time, session.end_time, session.notes, session.status, now, now, sessionId]
    );

    // Event log
    db.runSync(
      `INSERT INTO attendance_events (id, session_id, event_type, timestamp, notes, created_at)
       VALUES (?, ?, 'CORRECTION', ?, ?, ?);`,
      [generateUUID(), sessionId, now, `Correction: ${reason}`, now]
    );

    enqueueSync('attendance_sessions', sessionId, 'UPSERT', {
      id: sessionId,
      status: session.status,
      start_time: session.start_time,
      end_time: session.end_time,
      notes: session.notes,
      is_corrected: 1,
    });
  });

  return db.getFirstSync<AttendanceSession>(
    'SELECT * FROM attendance_sessions WHERE id = ?;',
    [sessionId]
  )!;
}

export function getAttendanceHistory(limit: number = 30, offset: number = 0): AttendanceSession[] {
  const db = getDatabase();
  return db.getAllSync<AttendanceSession>(
    'SELECT * FROM attendance_sessions WHERE is_deleted = 0 ORDER BY work_date DESC, start_time DESC LIMIT ? OFFSET ?;',
    [limit, offset]
  );
}

export function getSessionEvents(sessionId: string): AttendanceEvent[] {
  const db = getDatabase();
  return db.getAllSync<AttendanceEvent>(
    'SELECT * FROM attendance_events WHERE session_id = ? ORDER BY timestamp ASC;',
    [sessionId]
  );
}

export function getSessionBreaks(sessionId: string): BreakSession[] {
  const db = getDatabase();
  return db.getAllSync<BreakSession>(
    'SELECT * FROM break_sessions WHERE session_id = ? AND is_deleted = 0 ORDER BY start_time ASC;',
    [sessionId]
  );
}

export function getSessionCorrections(sessionId: string): AttendanceCorrection[] {
  const db = getDatabase();
  return db.getAllSync<AttendanceCorrection>(
    'SELECT * FROM attendance_corrections WHERE session_id = ? ORDER BY created_at DESC;',
    [sessionId]
  );
}

export function getTodayTimeline(workDate?: string): AttendanceEvent[] {
  const db = getDatabase();
  const dateStr = workDate || new Date().toISOString().split('T')[0];
  return db.getAllSync<AttendanceEvent>(
    `SELECT e.* FROM attendance_events e
     JOIN attendance_sessions s ON e.session_id = s.id
     WHERE s.work_date = ? AND s.is_deleted = 0
     ORDER BY e.timestamp ASC;`,
    [dateStr]
  );
}
