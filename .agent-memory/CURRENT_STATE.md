# Current State: Personal Time Ledger

## 1. Version & Baseline
- **Release Version**: 1.1.0 (Phase 2 Smart Wi-Fi Attendance Complete)
- **Git Branch**: `feature/smart-wifi-attendance` (merging to `main`)
- **Remote Branch**: `main` tracked on `https://github.com/logicbyroshan/righttime.git`
- **Build Status**:
  - Backend: 18/18 tests passing.
  - Mobile: 23/23 unit tests passing.
  - Mobile TypeScript: Strict compilation clean (0 errors).

---

## 2. Implemented Features

### Phase 2: Smart Wi-Fi Attendance & Android Integration
- **Wi-Fi Connectivity Monitoring**:
  - NetInfo network listener tracking active SSID/BSSID transitions.
  - Pure SSID normalization (stripping quotes) and BSSID MAC matching in `wifiMatching.ts`.
  - Android location permission check and transparent user explanation.
- **Pending Confirmation Lifecycle (`suggestionsRepo.ts`)**:
  - Durable `pending_suggestions` table in SQLite with schema v2 migration.
  - Arrival suggestions created on office Wi-Fi connection when no session is active.
  - Arrival dismissal cooldown (`wifi_cooldown_minutes`, 15 min default) preventing repetitive prompts while remaining connected.
  - Departure suggestions created after disconnection grace period (`wifi_grace_seconds`, 180s default).
  - Quick reconnection within grace period cancels pending departure suggestions.
  - Transactional confirmation enforcing single-session invariants and double-confirm prevention.
- **UI & Notifications**:
  - Local push notifications via `expo-notifications`.
  - Prominent in-app Pending Confirmation Banner on Home Dashboard (`index.tsx`).
  - Active Smart Wi-Fi configuration and real-time diagnostic card on Settings screen (`settings.tsx`).
  - Wi-Fi badge and detection/confirmation audit timestamps in Attendance Ledger (`attendance.tsx`).
- **Django Backend Phase 2 Endpoints & Sync**:
  - Extended `UserPreferences` with `wifi_enabled`, `wifi_grace_seconds`, `wifi_cooldown_minutes`.
  - Extended `AttendanceSession` and `AttendanceEvent` with detection/confirmation metadata.
  - Added `PendingSuggestion` model, serializer, and `/api/v1/attendance/suggestions/` endpoints.
  - Extended batch sync handler (`/api/v1/sync/`) for `pending_suggestions`.

### Phase 1: Core Foundation
- Attendance state machines (Check In, Start Break, End Break, Check Out) with strict transition invariants.
- Activity stopwatch with timer reboot recovery and overlap prevention.
- Daily habit tracker with unique daily completions and dynamic streak recalculation.
- Period aggregation reports (daily, weekly, monthly).
- Durable offline SQLite `sync_queue` and Django batch sync.

---

## 3. In Progress & Upcoming Work
- **Phase 1**: Fully completed and locked.
- **Phase 2**: Fully completed and verified (Wi-Fi attendance suggestions, Android permissions, diagnostics, Django models/endpoints, sync).
- **Phase 3 (Not Started)**: Biometric CSV reconciliation, PDF evidence exports.

---

## 4. Current Known Risks & Caveats
- Android OS requires Location permission (`ACCESS_FINE_LOCATION`) to reveal connected Wi-Fi SSIDs; if denied, Android reports `<unknown ssid>` and app falls back to manual check-in.
- Force-stopped apps on Android 8+ are prevented by the OS from running background broadcast receivers until reopened by the user.

