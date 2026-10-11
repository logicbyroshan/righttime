/**
 * Pure TypeScript FIPS 180-4 SHA-256 implementation.
 * Zero platform dependencies (runs identically on Android, iOS, Web, and Node test runner).
 */
function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let i = 0;
  for (i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }

  words[ascii.length >> 2] |= 0x80 << ((3 - (ascii.length % 4)) * 8);
  words[(((ascii.length + 8) >> 6) << 4) + 15] = asciiBitLength;

  for (let j = 0; j < words.length; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const s1 = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1 + ch + k[i] + w[i]) | 0;
      const s0 = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0 + maj) | 0;

      hash = [
        (temp1 + temp2) | 0,
        hash[0],
        hash[1],
        hash[2],
        (hash[3] + temp1) | 0,
        hash[4],
        hash[5],
        hash[6],
      ];
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

export interface BackupPayload {
  backup_version: number;
  app_version: string;
  created_at: string;
  record_counts: Record<string, number>;
  data: {
    attendance_sessions: any[];
    attendance_events: any[];
    break_sessions: any[];
    attendance_corrections: any[];
    activities: any[];
    activity_entries: any[];
    habits: any[];
    habit_completions: any[];
    pending_suggestions: any[];
    official_attendance_batches: any[];
    official_attendance_records: any[];
    user_settings: any[];
  };
  integrity_checksum: string;
}

export interface BackupValidationResult {
  isValid: boolean;
  backupVersion: number;
  createdAt: string;
  recordCounts: Record<string, number>;
  error?: string;
  parsedPayload?: BackupPayload;
}

/**
 * Compute SHA-256 checksum of data object.
 * Pure implementation with zero platform dependencies.
 */
export async function computeDataChecksum(dataObj: any): Promise<string> {
  const serialized = JSON.stringify(dataObj);
  return sha256(serialized);
}

/**
 * Validate backup JSON string and checksum integrity before restore
 */
export async function validateBackupString(jsonStr: string): Promise<BackupValidationResult> {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e: any) {
    return {
      isValid: false,
      backupVersion: 0,
      createdAt: '',
      recordCounts: {},
      error: `Malformed JSON backup file: ${e.message}`,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      isValid: false,
      backupVersion: 0,
      createdAt: '',
      recordCounts: {},
      error: 'Invalid backup structure: root must be an object',
    };
  }

  if (!parsed.backup_version || parsed.backup_version !== 1) {
    return {
      isValid: false,
      backupVersion: parsed.backup_version || 0,
      createdAt: parsed.created_at || '',
      recordCounts: {},
      error: `Unsupported backup version (${parsed.backup_version}). Expected version 1.`,
    };
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    return {
      isValid: false,
      backupVersion: parsed.backup_version,
      createdAt: parsed.created_at || '',
      recordCounts: {},
      error: 'Corrupt backup: missing data payload',
    };
  }

  // Verify SHA-256 checksum
  const expectedChecksum = await computeDataChecksum(parsed.data);
  if (parsed.integrity_checksum !== expectedChecksum) {
    return {
      isValid: false,
      backupVersion: parsed.backup_version,
      createdAt: parsed.created_at || '',
      recordCounts: parsed.record_counts || {},
      error: 'Integrity checksum verification failed. The backup file appears corrupted or altered.',
    };
  }

  return {
    isValid: true,
    backupVersion: parsed.backup_version,
    createdAt: parsed.created_at || '',
    recordCounts: parsed.record_counts || {},
    parsedPayload: parsed as BackupPayload,
  };
}
