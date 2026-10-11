import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { generateUUID } from '../db/database';
import { ReconciliationItem, ReconciliationSummary } from '../db/types';

export interface PDFReportOptions {
  reportType: 'ATTENDANCE_ONLY' | 'ATTENDANCE_WITH_ACTIVITIES' | 'RECONCILIATION';
  displayName?: string;
  officeName: string;
  timezone: string;
  startDate: string;
  endDate: string;
  summary: {
    calendarDays: number;
    attendanceDays: number;
    incompleteSessions: number;
    grossDurationSeconds: number;
    breakDurationSeconds: number;
    netDurationSeconds: number;
    manualEventsCount: number;
    wifiConfirmedCount: number;
    correctionsCount: number;
    unresolvedDiscrepancies?: number;
  };
  dailyRows: Array<{
    date: string;
    weekday: string;
    arrival: string | null;
    departure: string | null;
    grossHms: string;
    breakHms: string;
    netHms: string;
    source: string;
    isIncomplete: boolean;
    isCorrected: boolean;
    officialStatus?: string;
  }>;
  events?: Array<{
    date: string;
    eventType: string;
    timestamp: string;
    source: string;
    detectedAt?: string | null;
    confirmedAt?: string | null;
    notes?: string;
  }>;
  activities?: Array<{
    category: string;
    name: string;
    durationHms: string;
    percentage: number;
  }>;
  habits?: Array<{
    name: string;
    completionRate: number;
  }>;
  reconciliationItems?: ReconciliationItem[];
  reconciliationSummary?: ReconciliationSummary;
}

function formatSecToHM(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function buildHTMLForReport(options: PDFReportOptions): string {
  const reportId = generateUUID().substring(0, 8).toUpperCase();
  const generatedAt = new Date().toISOString();
  const userName = options.displayName?.trim() || 'Personal Record (Independent)';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Attendance Evidence Report — ${reportId}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 12mm 15mm 12mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .header-left h1 {
      font-size: 18px;
      margin: 0 0 4px 0;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .header-left p {
      margin: 0;
      color: #64748b;
      font-size: 10px;
    }
    .header-right {
      text-align: right;
      font-size: 10px;
      color: #475569;
    }
    .meta-badge {
      display: inline-block;
      background: #f1f5f9;
      padding: 3px 6px;
      border-radius: 4px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }
    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 10px;
    }
    .summary-card .label {
      font-size: 9px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .summary-card .value {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #334155;
      margin: 16px 0 8px 0;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 10px;
    }
    thead {
      display: table-header-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #f1f5f9;
      color: #475569;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
      font-weight: 600;
    }
    td {
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    .badge {
      display: inline-block;
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-manual { background: #e0f2fe; color: #0369a1; }
    .badge-wifi { background: #dcfce7; color: #15803d; }
    .badge-match { background: #dcfce7; color: #166534; }
    .badge-discrepancy { background: #fee2e2; color: #991b1b; }
    .badge-incomplete { background: #fef3c7; color: #92400e; }
    .badge-reviewed { background: #f3e8ff; color: #6b21a8; }
    .disclaimer {
      margin-top: 20px;
      padding: 10px;
      background: #f8fafc;
      border-left: 3px solid #0284c7;
      font-size: 9px;
      color: #64748b;
      line-height: 1.4;
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 9px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }
  </style>
</head>
<body>

  <!-- Report Header -->
  <div class="header">
    <div class="header-left">
      <h1>Personal Time Ledger — Evidence Report</h1>
      <p>Independent Attendance & Activity Record Log</p>
      <p style="margin-top: 4px;"><strong>Record Holder:</strong> ${userName} &bull; <strong>Office:</strong> ${options.officeName}</p>
    </div>
    <div class="header-right">
      <div class="meta-badge">REPORT #${reportId}</div>
      <div><strong>Period:</strong> ${options.startDate} to ${options.endDate}</div>
      <div><strong>Timezone:</strong> ${options.timezone}</div>
      <div><strong>Generated:</strong> ${generatedAt.replace('T', ' ').substring(0, 19)} UTC</div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Total Office Days</div>
      <div class="value">${options.summary.attendanceDays} <span style="font-size: 10px; color:#64748b;">/ ${options.summary.calendarDays}d</span></div>
    </div>
    <div class="summary-card">
      <div class="label">Net Office Duration</div>
      <div class="value">${formatSecToHM(options.summary.netDurationSeconds)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Gross Elapsed Time</div>
      <div class="value">${formatSecToHM(options.summary.grossDurationSeconds)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Recorded Breaks</div>
      <div class="value">${formatSecToHM(options.summary.breakDurationSeconds)}</div>
    </div>
  </div>

  <div class="summary-grid" style="grid-template-columns: repeat(4, 1fr); margin-top: -8px;">
    <div class="summary-card">
      <div class="label">Manual Events</div>
      <div class="value">${options.summary.manualEventsCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">Wi-Fi Confirmed</div>
      <div class="value">${options.summary.wifiConfirmedCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">Corrections</div>
      <div class="value">${options.summary.correctionsCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">Incomplete Days</div>
      <div class="value" style="${options.summary.incompleteSessions > 0 ? 'color: #b45309;' : ''}">${options.summary.incompleteSessions}</div>
    </div>
  </div>

  <!-- Daily Attendance Log Table -->
  <div class="section-title">Daily Attendance Ledger</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Arrival</th>
        <th>Departure</th>
        <th>Gross Time</th>
        <th>Breaks</th>
        <th>Net Time</th>
        <th>Source</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${options.dailyRows
        .map(
          (r) => `
        <tr>
          <td><strong>${r.date}</strong> <span style="color: #64748b;">(${r.weekday})</span></td>
          <td>${r.arrival ? r.arrival.substring(11, 16) : '—'}</td>
          <td>${r.departure ? r.departure.substring(11, 16) : '<span style="color:#d97706;">Open</span>'}</td>
          <td>${r.grossHms}</td>
          <td>${r.breakHms}</td>
          <td><strong>${r.netHms}</strong></td>
          <td>
            <span class="badge ${r.source.includes('WIFI') ? 'badge-wifi' : 'badge-manual'}">
              ${r.source.includes('WIFI') ? 'Wi-Fi Confirmed' : 'Manual'}
            </span>
          </td>
          <td>
            ${r.isIncomplete ? '<span class="badge badge-incomplete">Incomplete</span> ' : ''}
            ${r.isCorrected ? '<span class="badge" style="background:#f1f5f9; color:#475569;">Audit Edit</span> ' : ''}
            ${r.officialStatus ? `<span class="badge ${r.officialStatus.includes('MATCH') ? 'badge-match' : 'badge-discrepancy'}">${r.officialStatus}</span>` : '—'}
          </td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <!-- Official Reconciliation Section (If requested) -->
  ${
    options.reconciliationItems && options.reconciliationItems.length > 0
      ? `
    <div class="section-title">Official vs. Personal Attendance Reconciliation</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Personal (Arr / Dep)</th>
          <th>Official (Arr / Dep)</th>
          <th>Arrival Diff</th>
          <th>Departure Diff</th>
          <th>Net Diff</th>
          <th>Reconciliation Status</th>
        </tr>
      </thead>
      <tbody>
        ${options.reconciliationItems
          .map((item) => {
            const arrDiffStr =
              item.arrivalDiffMinutes !== null
                ? `${item.arrivalDiffMinutes > 0 ? '+' : ''}${item.arrivalDiffMinutes}m`
                : '—';
            const depDiffStr =
              item.departureDiffMinutes !== null
                ? `${item.departureDiffMinutes > 0 ? '+' : ''}${item.departureDiffMinutes}m`
                : '—';
            const netDiffStr =
              item.netDurationDiffMinutes !== null
                ? `${item.netDurationDiffMinutes > 0 ? '+' : ''}${item.netDurationDiffMinutes}m`
                : '—';

            let badgeClass = 'badge-match';
            if (item.status === 'REVIEWED') badgeClass = 'badge-reviewed';
            else if (item.status.includes('DISCREPANCY')) badgeClass = 'badge-discrepancy';
            else if (item.status.includes('MISSING')) badgeClass = 'badge-incomplete';

            return `
            <tr>
              <td><strong>${item.date}</strong></td>
              <td>${item.personalArrival ? item.personalArrival.substring(11, 16) : '—'} &rarr; ${item.personalDeparture ? item.personalDeparture.substring(11, 16) : '—'}</td>
              <td>${item.officialArrival ? item.officialArrival.substring(11, 16) : '—'} &rarr; ${item.officialDeparture ? item.officialDeparture.substring(11, 16) : '—'}</td>
              <td style="${item.arrivalDiffMinutes && Math.abs(item.arrivalDiffMinutes) > 5 ? 'color:#b91c1c; font-weight:600;' : ''}">${arrDiffStr}</td>
              <td style="${item.departureDiffMinutes && Math.abs(item.departureDiffMinutes) > 5 ? 'color:#b91c1c; font-weight:600;' : ''}">${depDiffStr}</td>
              <td>${netDiffStr}</td>
              <td><span class="badge ${badgeClass}">${item.status}</span></td>
            </tr>
          `;
          })
          .join('')}
      </tbody>
    </table>
  `
      : ''
  }

  <!-- Activities & Habits Section (If requested) -->
  ${
    options.activities && options.activities.length > 0
      ? `
    <div class="section-title">Activity Tracking Summary</div>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Activity</th>
          <th>Logged Duration</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        ${options.activities
          .map(
            (a) => `
          <tr>
            <td><strong>${a.category}</strong></td>
            <td>${a.name}</td>
            <td>${a.durationHms}</td>
            <td>${a.percentage}%</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `
      : ''
  }

  <!-- Legal & Evidence Disclaimer -->
  <div class="disclaimer">
    <strong>Evidence Notice & Integrity Guarantee:</strong>
    This document was automatically compiled from an offline SQLite local ledger maintained on the user's personal device.
    Wi-Fi confirmed timestamps reflect device network association times confirmed by explicit user interaction.
    Differences are calculated as: <em>Difference = Personal Time &minus; Official Time</em> (positive values indicate personal recorded time was later; negative values indicate earlier).
    This report is intended for personal reconciliation and discrepancy resolution discussions.
  </div>

  <div class="footer">
    Personal Time Ledger &bull; Report ID ${reportId} &bull; Generated from tamper-evident local-first SQLite store
  </div>

</body>
</html>`;
}

/**
 * Generate PDF file and present native Android/iOS share sheet
 */
export async function generateAndSharePDF(options: PDFReportOptions): Promise<string> {
  const html = buildHTMLForReport(options);

  const file = await Print.printToFileAsync({
    html,
    base64: false,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share Attendance Report (${options.startDate} to ${options.endDate})`,
      UTI: 'com.adobe.pdf',
    });
  }

  return file.uri;
}
