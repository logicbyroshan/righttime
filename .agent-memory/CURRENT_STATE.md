# Current State: Personal Time Ledger

## 1. Version & Baseline
- **Release Version**: 1.0.0 (Phase 1 Baseline Complete)
- **Git Commit**: `1fc4abb`
- **Remote Branch**: `main` tracked on `https://github.com/logicbyroshan/righttime.git`
- **Build Status**:
  - Backend: 15/15 tests passing.
  - Mobile: 7/7 unit tests passing.
  - Mobile TypeScript: Strict compilation clean (0 errors).

---

## 2. Implemented Features

### Mobile (`mobile/`)
- **Home Dashboard (`index.tsx`)**:
  - Live punch hero card with context-aware action button (Check In, Start Break, End Break, Check Out).
  - Real-time 1-second refresh computing gross elapsed, recorded break, and net office durations.
  - Active activity stopwatch banner with direct stop action.
  - Habit checklist progress bar and completion rate.
  - Chronological timeline of today's punch events.
- **Attendance Ledger (`attendance.tsx`)**:
  - Full punch controls with strict transition validation.
  - Historical list of sessions by date with status badges.
  - Session event audit inspection.
  - Manual correction modal with mandatory justification reason, updating session and creating audit log.
- **Activities & Stopwatch (`activities.tsx`)**:
  - Create activities with names, categories, and color tags.
  - Live stopwatch timer with restart/reboot recovery and overlap prevention.
  - Manual entry modal with start, end, duration, and notes.
  - Daily interval history and deletion with confirmation.
- **Habits & Streaks (`habits.tsx`)**:
  - Create habits with target counts and units.
  - Daily toggle checkbox enforcing unique completion per habit and local date.
  - Consecutive streak calculation (current streak, best streak).
  - Dynamic streak recalculation when historical records are modified.
- **Reports & Analytics (`reports.tsx`)**:
  - Daily, weekly, and monthly summaries.
  - Gross office, break duration, and net office duration.
  - Activity breakdown by category and activity item.
  - Habit completion percentages and period trend comparison against previous interval.
- **Settings & Sync (`settings.tsx`)**:
  - Workday target hours (start/end) and workplace name.
  - Local timezone display.
  - Django API base URL input (with 10.0.2.2 emulator helper).
  - Encrypted auth token storage via `expo-secure-store`.
  - Manual sync trigger with pending count badge.
  - Inactive Phase 2 Wi-Fi configuration fields.
  - Destructive database reset action with explicit confirmation dialog.

### Backend (`backend/`)
- **Core App**: Base abstract model, user preferences model, custom structured exception handler, token authentication onboarding (`/api/v1/auth/token/`), health check (`/api/v1/health/`).
- **Attendance App**: Models, serializers, and views for sessions, breaks, events, and audit corrections (`/api/v1/attendance/`, `/api/v1/attendance/events/`, `/api/v1/attendance/<id>/correct/`).
- **Activities App**: Models, serializers, and views for activities and entries with timer overlap prevention (`/api/v1/activities/`, `/api/v1/activities/entries/`).
- **Habits App**: Models, serializers, views, and streak engine (`/api/v1/habits/`, `/api/v1/habits/completions/`).
- **Reports App**: Aggregation views for daily, weekly, and monthly analytics (`/api/v1/reports/daily/`, etc.).
- **Sync App**: Multi-entity idempotent batch upsert handler (`/api/v1/sync/`) and `SyncLog` audit tracker.

---

## 3. In Progress & Upcoming Work
- **Phase 1**: Fully completed, verified, and locked.
- **Phase 2 (Next Milestone)**:
  - Native background Wi-Fi network detection (`ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`).
  - Arrival / departure confirmation notifications.
  - Biometric punch import comparison (CSV/Excel).
  - Evidence PDF export generator.

---

## 4. Current Known Risks & Caveats
- Android physical device sync requires host computer and phone to share the same local Wi-Fi network and configuring the PC's LAN IP (`http://192.168.x.x:8000`).
- Token authentication in development permits single-user self-registration without email verification.
