import { getDatabase, generateUUID } from './database';
import {
  OfficialImportBatch,
  OfficialAttendanceRecord,
  OfficialValidationStatus,
} from './types';

export function createOfficialBatch(params: {
  id?: string;
  source_filename: string;
  file_hash: string;
  row_count: number;
  notes?: string;
}): OfficialImportBatch {
  const db = getDatabase();
  const id = params.id || generateUUID();
  const now = new Date().toISOString();

  const batch: OfficialImportBatch = {
    id,
    source_filename: params.source_filename,
    file_hash: params.file_hash,
    row_count: params.row_count,
    imported_at: now,
    notes: params.notes || '',
    created_at: now,
    updated_at: now,
    client_updated_at: now,
    is_deleted: 0,
  };

  db.runSync(
    `INSERT INTO official_attendance_batches 
      (id, source_filename, file_hash, row_count, imported_at, notes, created_at, updated_at, client_updated_at, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      batch.id,
      batch.source_filename,
      batch.file_hash,
      batch.row_count,
      batch.imported_at,
      batch.notes,
      batch.created_at,
      batch.updated_at,
      batch.client_updated_at,
      batch.is_deleted,
    ]
  );

  return batch;
}

export function findBatchByHash(fileHash: string): OfficialImportBatch | null {
  const db = getDatabase();
  const row = db.getFirstSync<OfficialImportBatch>(
    `SELECT * FROM official_attendance_batches WHERE file_hash = ? AND is_deleted = 0;`,
    [fileHash]
  );
  return row || null;
}

export function getOfficialBatches(): OfficialImportBatch[] {
  const db = getDatabase();
  return db.getAllSync<OfficialImportBatch>(
    `SELECT * FROM official_attendance_batches WHERE is_deleted = 0 ORDER BY imported_at DESC;`
  );
}

export function getBatchById(id: string): OfficialImportBatch | null {
  const db = getDatabase();
  const row = db.getFirstSync<OfficialImportBatch>(
    `SELECT * FROM official_attendance_batches WHERE id = ? AND is_deleted = 0;`,
    [id]
  );
  return row || null;
}

export function deleteBatch(id: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE official_attendance_batches SET is_deleted = 1, updated_at = ?, client_updated_at = ? WHERE id = ?;`,
      [now, now, id]
    );
    db.runSync(
      `UPDATE official_attendance_records SET is_deleted = 1, updated_at = ?, client_updated_at = ? WHERE batch_id = ?;`,
      [now, now, id]
    );
  });
}

export function saveOfficialRecords(
  records: Array<{
    id?: string;
    batch_id: string;
    work_date: string;
    check_in_time: string | null;
    check_out_time: string | null;
    break_duration_minutes?: number;
    total_duration_minutes?: number;
    source_description?: string;
    validation_status?: OfficialValidationStatus;
    discrepancy_note?: string;
    is_reviewed?: number;
  }>
): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  db.withTransactionSync(() => {
    for (const r of records) {
      const id = r.id || generateUUID();
      db.runSync(
        `INSERT INTO official_attendance_records
          (id, batch_id, work_date, check_in_time, check_out_time, break_duration_minutes, 
           total_duration_minutes, source_description, validation_status, discrepancy_note, 
           is_reviewed, created_at, updated_at, client_updated_at, is_deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           work_date = excluded.work_date,
           check_in_time = excluded.check_in_time,
           check_out_time = excluded.check_out_time,
           break_duration_minutes = excluded.break_duration_minutes,
           total_duration_minutes = excluded.total_duration_minutes,
           source_description = excluded.source_description,
           validation_status = excluded.validation_status,
           discrepancy_note = excluded.discrepancy_note,
           is_reviewed = excluded.is_reviewed,
           updated_at = excluded.updated_at,
           client_updated_at = excluded.client_updated_at;`,
        [
          id,
          r.batch_id,
          r.work_date,
          r.check_in_time || null,
          r.check_out_time || null,
          r.break_duration_minutes || 0,
          r.total_duration_minutes || 0,
          r.source_description || '',
          r.validation_status || 'VALID',
          r.discrepancy_note || '',
          r.is_reviewed || 0,
          now,
          now,
          now,
        ]
      );
    }
  });
}

export function getOfficialRecordsForPeriod(
  startDate: string,
  endDate: string
): OfficialAttendanceRecord[] {
  const db = getDatabase();
  return db.getAllSync<OfficialAttendanceRecord>(
    `SELECT * FROM official_attendance_records 
     WHERE work_date >= ? AND work_date <= ? AND is_deleted = 0
     ORDER BY work_date ASC, check_in_time ASC;`,
    [startDate, endDate]
  );
}

export function updateOfficialRecord(
  id: string,
  updates: Partial<OfficialAttendanceRecord>
): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  const current = db.getFirstSync<OfficialAttendanceRecord>(
    `SELECT * FROM official_attendance_records WHERE id = ? AND is_deleted = 0;`,
    [id]
  );
  if (!current) return;

  const merged = { ...current, ...updates, updated_at: now, client_updated_at: now };

  db.runSync(
    `UPDATE official_attendance_records SET
      work_date = ?,
      check_in_time = ?,
      check_out_time = ?,
      break_duration_minutes = ?,
      total_duration_minutes = ?,
      source_description = ?,
      validation_status = ?,
      discrepancy_note = ?,
      is_reviewed = ?,
      updated_at = ?,
      client_updated_at = ?
     WHERE id = ?;`,
    [
      merged.work_date,
      merged.check_in_time,
      merged.check_out_time,
      merged.break_duration_minutes,
      merged.total_duration_minutes,
      merged.source_description,
      merged.validation_status,
      merged.discrepancy_note,
      merged.is_reviewed,
      merged.updated_at,
      merged.client_updated_at,
      id,
    ]
  );
}

export function setRecordReviewed(id: string, isReviewed: boolean, note?: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  if (note !== undefined) {
    db.runSync(
      `UPDATE official_attendance_records 
       SET is_reviewed = ?, discrepancy_note = ?, updated_at = ?, client_updated_at = ? 
       WHERE id = ?;`,
      [isReviewed ? 1 : 0, note, now, now, id]
    );
  } else {
    db.runSync(
      `UPDATE official_attendance_records 
       SET is_reviewed = ?, updated_at = ?, client_updated_at = ? 
       WHERE id = ?;`,
      [isReviewed ? 1 : 0, now, now, id]
    );
  }
}

export function createManualOfficialRecord(params: {
  work_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  break_duration_minutes?: number;
  total_duration_minutes?: number;
  notes?: string;
}): OfficialAttendanceRecord {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Find or create default manual batch
  let manualBatch = db.getFirstSync<OfficialImportBatch>(
    `SELECT * FROM official_attendance_batches WHERE source_filename = 'Manual Entry' AND is_deleted = 0;`
  );
  if (!manualBatch) {
    manualBatch = createOfficialBatch({
      source_filename: 'Manual Entry',
      file_hash: 'manual-entry-batch',
      row_count: 1,
      notes: 'User created manual official attendance records',
    });
  }

  const id = generateUUID();
  const record: OfficialAttendanceRecord = {
    id,
    batch_id: manualBatch.id,
    work_date: params.work_date,
    check_in_time: params.check_in_time,
    check_out_time: params.check_out_time,
    break_duration_minutes: params.break_duration_minutes || 0,
    total_duration_minutes: params.total_duration_minutes || 0,
    source_description: 'Manual official entry',
    validation_status: 'VALID',
    discrepancy_note: params.notes || '',
    is_reviewed: 0,
    created_at: now,
    updated_at: now,
    client_updated_at: now,
    is_deleted: 0,
  };

  saveOfficialRecords([record]);
  return record;
}
