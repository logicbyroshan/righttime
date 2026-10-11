# Changelog

All meaningful changes to the **Personal Time Ledger** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
