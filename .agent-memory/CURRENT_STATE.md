# Current State: Personal Time Ledger

## 1. Version & Baseline
- **Release Version**: 1.2.0 (Phase 3 Evidence Reports, Reconciliation, Backup & Release Complete)
- **Git Branch**: `feature/phase3-evidence-reports-reconciliation-backup` (merging to `main`)
- **Remote Branch**: `main` tracked on `https://github.com/logicbyroshan/righttime.git`
- **Build Status**:
  - Backend: 20/20 tests passing.
  - Mobile: 48/48 unit tests passing.
  - Mobile TypeScript: Strict compilation clean (0 errors).

---

## 2. Implemented Features

### Phase 3: Evidence Reports, Reconciliation, Backup & Release Readiness
- **Attendance Evidence Reports (`reportExportHelpers.ts`, `reports.tsx`)**:
  - Daily, weekly, monthly report compilation from SQLite ledger.
  - Summary metrics: calendar days, attendance days, incomplete count, gross/break/net duration, manual vs Wi-Fi breakdown, corrections count.
  - Daily attendance table with per-session timestamps, break sums, source indicators, and audit tags.
- **Official Attendance Reconciliation Engine (`reconciliationService.ts`)**:
  - Pure comparison algorithm matching personal arrival/departure against employer HR punch.
  - Strict sign convention: `Difference = Personal Time - Official Time` (+ means personal is later, - means personal is earlier).
  - Configurable tolerance (default ±5 min).
  - Classifications: `MATCH`, `ARRIVAL_DISCREPANCY`, `DEPARTURE_DISCREPANCY`, `DURATION_DISCREPANCY`, `OFFICIAL_MISSING`, `PERSONAL_MISSING`, `INCOMPLETE_PERSONAL`, `AMBIGUOUS`, `INVALID_OFFICIAL`, `REVIEWED`.
  - Discrepancy review and audit note attachment.
- **Official CSV Import Wizard (`csvParsing.ts`, `settings.tsx`, `officialRepo.ts`)**:
  - RFC 4180 tokenizer supporting quotes, newlines, multiple date formats (ISO, DD/MM/YYYY, MM/DD/YYYY), and 12h/24h time formats.
  - Column mapper, row validator, duplicate file SHA-256 hash detection, and batch persistence.
- **PDF Evidence Report Generator (`pdfService.ts`)**:
  - Vector PDF generator via `expo-print` and `expo-sharing`.
  - Print-friendly typography, repeated table headers, page-break avoidance, and integrity notice.
- **CSV Data Exporter (`csvParsing.ts`, `csvService.ts`)**:
  - Exports for all 7 entity types (Sessions, Events, Breaks, Activities, Habits, Official Records, Reconciliation Results).
  - Formula injection mitigation (CWE-1236) escaping `=, +, -, @` with single quotes.
  - UTF-8 with BOM for Excel compatibility.
- **Backup & Restore System (`backupValidation.ts`, `backupService.ts`)**:
  - Structured versioned JSON snapshot with pure FIPS 180-4 SHA-256 checksum verification.
  - Pre-restore validation, record preview, emergency rollback backup creation, and atomic replacement restore inside transaction.
- **Django Backend Phase 3 Endpoints & Sync**:
  - `OfficialImportBatch` and `OfficialAttendanceRecord` models, serializers, and endpoints (`/api/v1/attendance/official-batches/`, `/api/v1/attendance/official-records/`).
  - Batch sync handler (`/api/v1/sync/`) supports official batches and records.
- **Android Release Readiness**:
  - Configured `mobile/app.json`: package `com.logicbyroshan.personaltimeledger`, version `1.2.0`, versionCode `3`.

### Phase 2: Smart Wi-Fi Attendance & Android Integration
- Wi-Fi connectivity monitoring, pure SSID/BSSID normalization, arrival cooldown (15m), departure grace period (180s), local push notifications, pending suggestion confirmations.

### Phase 1: Core Foundation
- Offline-first SQLite persistence, attendance state machine, stopwatch timer, habits and streaks, client/server reports, durable offline sync.

---

## 3. Project Roadmap Status
- **Phase 1**: Fully completed and locked.
- **Phase 2**: Fully completed and locked.
- **Phase 3**: Fully completed, regression-tested, and release-ready.

---

## 4. Current Known Risks & Caveats
- Android OS requires Location permission (`ACCESS_FINE_LOCATION`) to reveal connected Wi-Fi SSIDs; if denied, app falls back to manual check-in.
- Force-stopped apps on Android 8+ are prevented by the OS from running background broadcast receivers until reopened by the user.
