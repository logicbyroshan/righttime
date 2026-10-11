import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  calculateDateDiffMinutes,
  reconcileDay,
  generateReconciliationReport,
  formatTimeHM,
} from '../services/reconciliationService';

import {
  parseCSVString,
  sanitizeCSVField,
  buildCSVString,
  normalizeDateInput,
  normalizeTimeToISO,
  parseAndValidateOfficialCSV,
} from '../services/csvParsing';

import {
  validateBackupString,
  computeDataChecksum,
} from '../services/backupValidation';

describe('Personal Time Ledger — Phase 3 Reconciliation Tests', () => {
  describe('Difference Formula & Sign Conventions', () => {
    it('calculates positive arrival difference when personal arrival is later than official', () => {
      // Personal: 09:15, Official: 09:00 -> Personal is later -> +15m
      const diff = calculateDateDiffMinutes('2026-10-10T09:15:00Z', '2026-10-10T09:00:00Z');
      assert.strictEqual(diff, 15);
    });

    it('calculates negative arrival difference when personal arrival is earlier than official', () => {
      // Personal: 08:45, Official: 09:00 -> Personal is earlier -> -15m
      const diff = calculateDateDiffMinutes('2026-10-10T08:45:00Z', '2026-10-10T09:00:00Z');
      assert.strictEqual(diff, -15);
    });

    it('calculates zero difference when personal and official arrive simultaneously', () => {
      const diff = calculateDateDiffMinutes('2026-10-10T09:00:00Z', '2026-10-10T09:00:00Z');
      assert.strictEqual(diff, 0);
    });

    it('handles null timestamps safely', () => {
      assert.strictEqual(calculateDateDiffMinutes(null, '2026-10-10T09:00:00Z'), null);
      assert.strictEqual(calculateDateDiffMinutes('2026-10-10T09:00:00Z', null), null);
    });
  });

  describe('Reconciliation Status Classification & Tolerance', () => {
    const baseOfficial = {
      id: 'off-1',
      batch_id: 'b-1',
      work_date: '2026-10-10',
      check_in_time: '2026-10-10T09:00:00Z',
      check_out_time: '2026-10-10T17:00:00Z',
      break_duration_minutes: 60,
      total_duration_minutes: 420,
      source_description: 'HR Biometric',
      validation_status: 'VALID' as const,
      discrepancy_note: '',
      is_reviewed: 0,
      created_at: '2026-10-10T00:00:00Z',
      updated_at: '2026-10-10T00:00:00Z',
      client_updated_at: '2026-10-10T00:00:00Z',
      is_deleted: 0,
    };

    it('classifies as MATCH when both arrival and departure are within tolerance', () => {
      // Personal: 09:03 to 17:02 (diffs +3m, +2m <= 5m tolerance)
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [
            {
              id: 's-1',
              start_time: '2026-10-10T09:03:00Z',
              end_time: '2026-10-10T17:02:00Z',
              status: 'COMPLETED',
              is_incomplete: 0,
              is_corrected: 0,
              gross_seconds: 28740,
              break_seconds: 3600,
              net_seconds: 25140,
            },
          ],
        },
        officialRecords: [baseOfficial],
      });

      assert.strictEqual(res.status, 'MATCH');
      assert.strictEqual(res.arrivalDiffMinutes, 3);
      assert.strictEqual(res.departureDiffMinutes, 2);
    });

    it('classifies as ARRIVAL_DISCREPANCY when arrival exceeds tolerance but departure matches', () => {
      // Personal: 09:12 (diff +12m > 5m) to 17:01 (diff +1m <= 5m)
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [
            {
              id: 's-1',
              start_time: '2026-10-10T09:12:00Z',
              end_time: '2026-10-10T17:01:00Z',
              status: 'COMPLETED',
              is_incomplete: 0,
              is_corrected: 0,
              gross_seconds: 28140,
              break_seconds: 3600,
              net_seconds: 24540,
            },
          ],
        },
        officialRecords: [baseOfficial],
      });

      assert.strictEqual(res.status, 'ARRIVAL_DISCREPANCY');
      assert.strictEqual(res.arrivalDiffMinutes, 12);
    });

    it('classifies as DEPARTURE_DISCREPANCY when departure exceeds tolerance but arrival matches', () => {
      // Personal: 09:01 (diff +1m) to 16:30 (diff -30m)
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [
            {
              id: 's-1',
              start_time: '2026-10-10T09:01:00Z',
              end_time: '2026-10-10T16:30:00Z',
              status: 'COMPLETED',
              is_incomplete: 0,
              is_corrected: 0,
              gross_seconds: 26940,
              break_seconds: 3600,
              net_seconds: 23340,
            },
          ],
        },
        officialRecords: [baseOfficial],
      });

      assert.strictEqual(res.status, 'DEPARTURE_DISCREPANCY');
      assert.strictEqual(res.departureDiffMinutes, -30);
    });

    it('classifies as OFFICIAL_MISSING when personal attendance exists with no official record', () => {
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [
            {
              id: 's-1',
              start_time: '2026-10-10T09:00:00Z',
              end_time: '2026-10-10T17:00:00Z',
              status: 'COMPLETED',
              is_incomplete: 0,
              is_corrected: 0,
              gross_seconds: 28800,
              break_seconds: 0,
              net_seconds: 28800,
            },
          ],
        },
        officialRecords: [],
      });

      assert.strictEqual(res.status, 'OFFICIAL_MISSING');
    });

    it('classifies as PERSONAL_MISSING when official record exists with no personal attendance', () => {
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [],
        },
        officialRecords: [baseOfficial],
      });

      assert.strictEqual(res.status, 'PERSONAL_MISSING');
    });

    it('classifies as INCOMPLETE_PERSONAL when personal session has no end time', () => {
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [
            {
              id: 's-1',
              start_time: '2026-10-10T09:00:00Z',
              end_time: null,
              status: 'IN_PROGRESS',
              is_incomplete: 1,
              is_corrected: 0,
              gross_seconds: 0,
              break_seconds: 0,
              net_seconds: 0,
            },
          ],
        },
        officialRecords: [baseOfficial],
      });

      assert.strictEqual(res.status, 'INCOMPLETE_PERSONAL');
    });

    it('classifies as AMBIGUOUS when multiple personal sessions exist in one day', () => {
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [
            {
              id: 's-1',
              start_time: '2026-10-10T09:00:00Z',
              end_time: '2026-10-10T12:00:00Z',
              status: 'COMPLETED',
              is_incomplete: 0,
              is_corrected: 0,
              gross_seconds: 10800,
              break_seconds: 0,
              net_seconds: 10800,
            },
            {
              id: 's-2',
              start_time: '2026-10-10T13:00:00Z',
              end_time: '2026-10-10T17:00:00Z',
              status: 'COMPLETED',
              is_incomplete: 0,
              is_corrected: 0,
              gross_seconds: 14400,
              break_seconds: 0,
              net_seconds: 14400,
            },
          ],
        },
        officialRecords: [baseOfficial],
      });

      assert.strictEqual(res.status, 'AMBIGUOUS');
    });

    it('preserves REVIEWED status and review notes when official record is marked reviewed', () => {
      const reviewedOfficial = { ...baseOfficial, is_reviewed: 1, discrepancy_note: 'Approved by lead' };
      const res = reconcileDay({
        workDate: '2026-10-10',
        toleranceMinutes: 5,
        personalData: {
          work_date: '2026-10-10',
          sessions: [
            {
              id: 's-1',
              start_time: '2026-10-10T09:30:00Z', // +30m arrival diff
              end_time: '2026-10-10T17:00:00Z',
              status: 'COMPLETED',
              is_incomplete: 0,
              is_corrected: 0,
              gross_seconds: 27000,
              break_seconds: 0,
              net_seconds: 27000,
            },
          ],
        },
        officialRecords: [reviewedOfficial],
      });

      assert.strictEqual(res.status, 'REVIEWED');
      assert.strictEqual(res.isReviewed, true);
      assert.strictEqual(res.discrepancyNote, 'Approved by lead');
    });
  });
});

describe('Personal Time Ledger — Phase 3 CSV Import & Export Tests', () => {
  describe('RFC 4180 Parsing & Normalization', () => {
    it('parses standard CSV rows and ignores blank lines', () => {
      const csv = 'Date,In,Out\n2026-10-10,09:00,17:00\n\n2026-10-11,09:15,17:15\n';
      const rows = parseCSVString(csv);
      assert.strictEqual(rows.length, 3);
      assert.deepStrictEqual(rows[1], ['2026-10-10', '09:00', '17:00']);
    });

    it('parses quoted fields with embedded commas and quotes', () => {
      const csv = 'Name,Note\n"Doe, John","Arrived late, ""Traffic"""';
      const rows = parseCSVString(csv);
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[1][0], 'Doe, John');
      assert.strictEqual(rows[1][1], 'Arrived late, "Traffic"');
    });

    it('normalizes multiple date input formats to YYYY-MM-DD', () => {
      assert.strictEqual(normalizeDateInput('2026-10-15'), '2026-10-15');
      assert.strictEqual(normalizeDateInput('2026/10/15'), '2026-10-15');
      assert.strictEqual(normalizeDateInput('15/10/2026'), '2026-10-15');
      assert.strictEqual(normalizeDateInput('15-10-2026'), '2026-10-15');
      assert.strictEqual(normalizeDateInput('invalid-date'), null);
    });

    it('normalizes 12-hour AM/PM and 24-hour time strings to ISO', () => {
      const iso1 = normalizeTimeToISO('2026-10-10', '09:30 AM');
      assert.ok(iso1 && iso1.includes('T'));

      const iso2 = normalizeTimeToISO('2026-10-10', '05:30 PM');
      assert.ok(iso2 && iso2.includes('T'));

      const iso3 = normalizeTimeToISO('2026-10-10', '17:30');
      assert.ok(iso3 && iso3.includes('T'));
    });

    it('validates CSV and rejects check-out earlier than check-in', () => {
      const csv = `Date,CheckIn,CheckOut\n2026-10-10,18:00,09:00`;
      const res = parseAndValidateOfficialCSV(csv, {
        dateColIndex: 0,
        checkInColIndex: 1,
        checkOutColIndex: 2,
      });

      assert.strictEqual(res.totalRows, 1);
      assert.strictEqual(res.validRows, 0);
      assert.strictEqual(res.invalidRows, 1);
      assert.ok(res.rows[0].errors.some((e) => e.includes('earlier')));
    });
  });

  describe('Safe CSV Export & Formula Injection Prevention (CWE-1236)', () => {
    it('prepends single quote to values starting with formula characters', () => {
      assert.strictEqual(sanitizeCSVField('=SUM(A1:B2)'), "'=SUM(A1:B2)");
      assert.strictEqual(sanitizeCSVField('+cmd|/c calc'), "'+cmd|/c calc");
      assert.strictEqual(sanitizeCSVField('@HYPERLINK("http://evil.com")'), `"'@HYPERLINK(""http://evil.com"")"`);
    });

    it('preserves pure numbers starting with - or + without escaping', () => {
      assert.strictEqual(sanitizeCSVField('-15'), '-15');
      assert.strictEqual(sanitizeCSVField('+45'), '+45');
      assert.strictEqual(sanitizeCSVField('0'), '0');
    });

    it('includes UTF-8 BOM in exported CSV string', () => {
      const csv = buildCSVString(['Header1', 'Header2'], [['Val1', 'Val2']]);
      assert.ok(csv.startsWith('\uFEFF'));
      assert.ok(csv.includes('Header1,Header2'));
      assert.ok(csv.includes('Val1,Val2'));
    });
  });
});

describe('Personal Time Ledger — Phase 3 Backup & Restore Integrity Tests', () => {
  it('computes deterministic SHA-256 data checksum', async () => {
    const data1 = { test: 'value', count: 42 };
    const checksum1 = await computeDataChecksum(data1);
    const checksum2 = await computeDataChecksum(data1);
    assert.strictEqual(checksum1, checksum2);
    assert.strictEqual(checksum1.length, 64);
  });

  it('validates authentic backup string with matching checksum', async () => {
    const data = { attendance_sessions: [], activities: [] };
    const checksum = await computeDataChecksum(data);
    const payload = {
      backup_version: 1,
      app_version: '1.2.0',
      created_at: new Date().toISOString(),
      record_counts: { attendance_sessions: 0 },
      data,
      integrity_checksum: checksum,
    };

    const res = await validateBackupString(JSON.stringify(payload));
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.backupVersion, 1);
  });

  it('rejects tampered backup with mismatched checksum', async () => {
    const data = { attendance_sessions: [{ id: '1' }] };
    const fakeChecksum = '0000000000000000000000000000000000000000000000000000000000000000';
    const payload = {
      backup_version: 1,
      app_version: '1.2.0',
      created_at: new Date().toISOString(),
      record_counts: { attendance_sessions: 1 },
      data,
      integrity_checksum: fakeChecksum,
    };

    const res = await validateBackupString(JSON.stringify(payload));
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('checksum verification failed'));
  });

  it('rejects unsupported backup version', async () => {
    const data = { attendance_sessions: [] };
    const checksum = await computeDataChecksum(data);
    const payload = {
      backup_version: 99,
      app_version: '99.0.0',
      created_at: new Date().toISOString(),
      record_counts: {},
      data,
      integrity_checksum: checksum,
    };

    const res = await validateBackupString(JSON.stringify(payload));
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('Unsupported backup version'));
  });

  it('rejects malformed JSON backup string safely', async () => {
    const res = await validateBackupString('not-valid-json{{{');
    assert.strictEqual(res.isValid, false);
    assert.ok(res.error?.includes('Malformed JSON'));
  });
});
