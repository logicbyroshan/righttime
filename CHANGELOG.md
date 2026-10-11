# Changelog

All meaningful changes to the **Personal Time Ledger** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-10-11

### Added
- **Phase 2: Smart Wi-Fi Attendance & Android Integration**:
  - **Android Wi-Fi Connectivity Monitoring**: Native network listener via `@react-native-community/netinfo` with SSID normalization (stripping Android quotes) and BSSID MAC matching.
  - **Suggestions & Pending Confirmation System**:
    - Created durable `pending_suggestions` SQLite table with v2 migration.
    - Added `suggestionsRepo.ts` domain state machine managing suggestions lifecycle (`PENDING`, `CONFIRMED`, `DISMISSED`, `SNOOZED`, `CANCELLED`, `EXPIRED`).
    - Enforced transactional attendance generation: confirmation updates attendance session and marks suggestion confirmed atomically; double confirmation is strictly prevented.
    - Arrival suggestion creation when office network detected and no session is active.
    - Arrival dismissal cooldown (`wifi_cooldown_minutes`, default 15 min) preventing repetitive prompts while remaining connected.
    - Departure suggestion generation with configurable grace period (`wifi_grace_seconds`, default 180s); temporary network drops/AP roaming auto-cancel departure suggestions upon reconnection.
  - **Android Local Notifications & Permissions**:
    - Notification dispatch via `expo-notifications` for arrival and departure alerts.
    - Configured Android permissions (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_WIFI_STATE`, `POST_NOTIFICATIONS`).
    - Added in-app permission setup flow and transparent privacy explanation (Location is required by Android OS to reveal SSID; GPS location is never accessed).
  - **UI Extensions**:
    - **Home Screen**: Prominent Pending Confirmation Banner with live action buttons (Confirm, Not Now / Snooze, Dismiss).
    - **Attendance Screen**: Added `WI-FI` badge and detection/confirmation audit timestamps on session cards.
    - **Settings Screen**: Activated Smart Wi-Fi configuration card (SSID, BSSID, toggle, grace period, cooldown) and real-time "Check Current Wi-Fi" diagnostic card.
  - **Django REST Framework Backend Integration**:
    - Extended `UserPreferences` model with `wifi_enabled`, `wifi_grace_seconds`, `wifi_cooldown_minutes`.
    - Extended `AttendanceSession` and `AttendanceEvent` with `source`, `detected_at`, `confirmed_at`, `network_match`.
    - Added `PendingSuggestion` model, serializer, and endpoints (`/api/v1/attendance/suggestions/`, `/api/v1/attendance/suggestions/<uuid:pk>/`).
    - Extended `POST /api/v1/sync/` to batch sync `pending_suggestions` and audit metadata.
  - **Automated Tests**:
    - Mobile unit tests expanded to 23 tests covering SSID/BSSID normalization, AP matching, grace period auto-cancellation, cooldown logic, and break invariants.
    - Backend automated tests expanded to 18 tests covering suggestion lifecycle, departure blocks on open breaks, sync idempotency, and preferences.

---

## [1.0.1] - 2026-10-11

### Added
- **Mandatory Git Branching & GitHub PR Workflow**:
  - Enforced isolated task branching (`feature/*`, `fix/*`, `docs/*`, `chore/*`) for all future tasks.
  - Required Pull Request creation and merging via GitHub CLI (`gh pr create`, `gh pr merge --merge`).
  - Added project-specific operating instructions in `AGENTS.md` and `.agent-memory/CONVENTIONS.md`.
  - Added ADR-007 in `.agent-memory/DECISIONS.md`.

---

## [1.0.0] - 2026-10-11

### Added
- **Android Mobile App (`mobile/`)**:
  - React Native 0.86 with Expo SDK 57, Expo Router 57, and strict TypeScript.
  - Dark-first design system with curated color tokens (`#0B0F17` canvas, `#131C2E` surfaces, `#38BDF8` cyan accents) and reusable components (`Card`, `Button`, `StatCard`, `Badge`, `ProgressBar`, `EmptyState`, `Input`, `TimelineItem`).
  - **Screen A (Home)**: Today's date, live attendance punch hero card, real-time 1-second refresh for office duration, break duration, net office time, active stopwatch banner, habit progress, and today's chronological timeline.
  - **Screen B (Attendance)**: Punch state machine (Check In, Start Break, End Break, Check Out), historical session list, detailed event audit view, and manual correction modal with mandatory justification reasons.
  - **Screen C (Activities)**: Activity manager with color tags and categories, live stopwatch timer with reboot/process death recovery, timer overlap prevention, manual interval entries with start/end ordering validation, and interval deletion.
  - **Screen D (Habits)**: Daily habits manager with target counts, checkbox toggling enforcing unique completion per habit and local date, and streak calculation engine with historical recalculation.
  - **Screen E (Reports)**: Daily, weekly (Mon-Sun), and monthly summaries of gross office, break, net office hours, activity category breakdowns, habit completion rate, and trend deltas against previous intervals.
  - **Screen F (Settings)**: Configurable workday targets, workplace name, timezone display, backend API URL input, encrypted auth token storage via `expo-secure-store`, manual sync trigger, inactive Phase 2 Wi-Fi fields, and local database reset.
- **Local SQLite Persistence**:
  - `expo-sqlite` database with `PRAGMA foreign_keys = ON;` and `schema_migrations` tracking v1 schema.
  - Durable offline `sync_queue` storing pending changes with error resilience.
- **Django REST Framework Backend (`backend/`)**:
  - Django 5.2 and DRF 3.18 modular apps: `core`, `attendance`, `activities`, `habits`, `reports`, `sync`.
  - Token authentication onboarding view (`POST /api/v1/auth/token/`), user preferences endpoint, and health check (`GET /api/v1/health/`).
  - Attendance endpoints with state machine validation: `/api/v1/attendance/`, `/api/v1/attendance/events/`, `/api/v1/attendance/<id>/correct/`.
  - Activities & Entries endpoints with timer overlap prevention: `/api/v1/activities/`, `/api/v1/activities/entries/`.
  - Habits & Completions endpoints with unique daily constraint: `/api/v1/habits/`, `/api/v1/habits/completions/`.
  - Reports endpoints: `/api/v1/reports/daily/`, `/api/v1/reports/weekly/`, `/api/v1/reports/monthly/`.
  - Sync endpoint: `POST /api/v1/sync/` handling batch upserts keyed by UUIDv4 with `SyncLog` audit tracking.
- **Automated Test Suites**:
  - 15 Django test cases covering all apps, state transitions, break calculations, streak recalculation, and sync idempotency.
  - 7 Mobile domain unit test cases verifying streak algorithms, net office calculations, break bounds, and activity entry validation.
  - Strict TypeScript compilation verification (`npx tsc --noEmit` passing with 0 errors).
- **Persistent AI Agent Operating System**:
  - Established `AGENTS.md`, `CHANGELOG.md`, and `.agent-memory/` system to govern future agent sessions with token efficiency and minimal change principles.
