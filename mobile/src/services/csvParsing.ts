/**
 * Robust RFC 4180 CSV tokenizer supporting quoted values with commas and newlines.
 */
export function parseCSVString(csvContent: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  // Normalize Windows CRLF to LF
  const cleanContent = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < cleanContent.length; i++) {
    const char = cleanContent[i];
    const nextChar = cleanContent[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote ("")
        currentVal += '"';
        i++; // skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      // Skip empty blank lines
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((field) => field.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Sanitize string against CSV Formula Injection (CWE-1236).
 * Prepends a single quote if the value begins with =, +, -, @, tab, or carriage return.
 */
export function sanitizeCSVField(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val);

  // Formula injection check
  const formulaChars = ['=', '+', '-', '@', '\t', '\r'];
  if (formulaChars.some((prefix) => str.startsWith(prefix))) {
    // If it's a pure number like -5 or +10, keep it numeric unless followed by non-digits
    const isPureNumber = /^[-+]?\d+(\.\d+)?$/.test(str);
    if (!isPureNumber) {
      str = `'${str}`;
    }
  }

  // RFC 4180 escaping
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Format 2D array into RFC 4180 CSV with UTF-8 BOM
 */
export function buildCSVString(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(sanitizeCSVField).join(',');
  const rowLines = rows.map((r) => r.map(sanitizeCSVField).join(','));
  // \uFEFF is UTF-8 Byte Order Mark for Excel
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

/**
 * Normalize flexible date strings into 'YYYY-MM-DD'
 */
export function normalizeDateInput(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // 1. ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // 2. YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    return trimmed.replace(/\//g, '-');
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // 4. Try JS Date parser
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Parse time string (e.g. "09:30 AM", "18:45", "9:00") into full ISO timestamp for given workDate
 */
export function normalizeTimeToISO(workDate: string, rawTime: string): string | null {
  if (!rawTime || !workDate) return null;
  const trimmed = rawTime.trim();

  // If already an ISO timestamp
  if (trimmed.includes('T')) {
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  // Handle 12-hour or 24-hour time strings
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const ampm = match[4]?.toUpperCase();

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  // Interpret as local and convert to ISO UTC
  const localIsoStr = `${workDate}T${hh}:${mm}:${ss}`;
  const dt = new Date(localIsoStr);
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

export interface CSVColumnMapping {
  dateColIndex: number;
  checkInColIndex: number;
  checkOutColIndex: number;
  breakDurationColIndex?: number;
  totalDurationColIndex?: number;
  notesColIndex?: number;
}

export interface ParsedOfficialRow {
  rowIndex: number;
  workDate: string | null;
  checkInISO: string | null;
  checkOutISO: string | null;
  breakMinutes: number;
  totalMinutes: number;
  notes: string;
  isValid: boolean;
  errors: string[];
}

export function parseAndValidateOfficialCSV(
  csvContent: string,
  mapping: CSVColumnMapping,
  hasHeader: boolean = true
): {
  rows: ParsedOfficialRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
} {
  const rawRows = parseCSVString(csvContent);
  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  const parsedRows: ParsedOfficialRow[] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const r = dataRows[idx];
    const errors: string[] = [];

    const rawDate = r[mapping.dateColIndex] || '';
    const workDate = normalizeDateInput(rawDate);
    if (!workDate) {
      errors.push(`Invalid date format: "${rawDate}"`);
    }

    const rawCheckIn = r[mapping.checkInColIndex] || '';
    const checkInISO = workDate ? normalizeTimeToISO(workDate, rawCheckIn) : null;
    if (rawCheckIn && !checkInISO) {
      errors.push(`Invalid check-in time: "${rawCheckIn}"`);
    }

    const rawCheckOut = r[mapping.checkOutColIndex] || '';
    const checkOutISO = workDate ? normalizeTimeToISO(workDate, rawCheckOut) : null;
    if (rawCheckOut && !checkOutISO) {
      errors.push(`Invalid check-out time: "${rawCheckOut}"`);
    }

    if (checkInISO && checkOutISO) {
      const startMs = new Date(checkInISO).getTime();
      const endMs = new Date(checkOutISO).getTime();
      if (endMs < startMs) {
        errors.push('Check-out time is earlier than check-in time');
      }
    }

    let breakMinutes = 0;
    if (mapping.breakDurationColIndex !== undefined && r[mapping.breakDurationColIndex]) {
      const parsed = parseInt(r[mapping.breakDurationColIndex], 10);
      if (!isNaN(parsed) && parsed >= 0) breakMinutes = parsed;
    }

    let totalMinutes = 0;
    if (mapping.totalDurationColIndex !== undefined && r[mapping.totalDurationColIndex]) {
      const parsed = parseInt(r[mapping.totalDurationColIndex], 10);
      if (!isNaN(parsed) && parsed >= 0) totalMinutes = parsed;
    } else if (checkInISO && checkOutISO) {
      const diffMin = Math.round(
        (new Date(checkOutISO).getTime() - new Date(checkInISO).getTime()) / 60000
      );
      totalMinutes = Math.max(0, diffMin - breakMinutes);
    }

    const notes =
      mapping.notesColIndex !== undefined ? r[mapping.notesColIndex] || '' : '';

    const isValid = errors.length === 0 && (checkInISO !== null || checkOutISO !== null);
    if (!isValid && errors.length === 0) {
      errors.push('Neither check-in nor check-out time provided');
    }

    if (isValid) validCount++;
    else invalidCount++;

    parsedRows.push({
      rowIndex: idx + 1,
      workDate,
      checkInISO,
      checkOutISO,
      breakMinutes,
      totalMinutes,
      notes,
      isValid,
      errors,
    });
  }

  return {
    rows: parsedRows,
    totalRows: dataRows.length,
    validRows: validCount,
    invalidRows: invalidCount,
  };
}
