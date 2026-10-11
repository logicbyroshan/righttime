# Architecture Decision Records (ADR)

This file maintains the permanent record of architectural decisions for Personal Time Ledger.
Do not silently reverse any decision recorded here.

---

## ADR-001: Monorepo Structure for Mobile & Backend
- **Date**: 2026-10-10
- **Status**: Accepted
- **Context**: The application requires both an Android mobile client and a Django REST Framework backend.
- **Decision**: House both `mobile/` and `backend/` in a single unified Git repository with root configuration, documentation, and `.gitignore`.
- **Alternatives Considered**:
  - Separate Git repositories: Would increase coordination overhead and disconnect versioning of local SQLite migrations and Django sync contracts.
- **Consequences**: Easy single-clone workflow; CI/CD can test both sides together.

---

## ADR-002: Local-First SQLite as Primary System of Record
- **Date**: 2026-10-10
- **Status**: Accepted
- **Context**: Users frequently punch in or start timers in low-connectivity environments (e.g. elevators, office basements, transit).
- **Decision**: The mobile SQLite database (`expo-sqlite`) is authoritative for user actions. The Django backend is a synchronized copy. Local writes succeed immediately and are queued in `sync_queue`.
- **Alternatives Considered**:
  - Cloud-first API: Fails when offline; introduces latency into simple punch button taps.
- **Consequences**: Mobile app remains 100% operational offline. Requires robust idempotent upsert logic in Django.

---

## ADR-003: Client-Generated UUIDv4 Primary Keys
- **Date**: 2026-10-10
- **Status**: Accepted
- **Context**: When records are created offline on the mobile device, auto-incrementing integer IDs cause collisions during multi-device or multi-session sync.
- **Decision**: All primary keys for attendance sessions, breaks, events, corrections, activities, entries, habits, and completions are UUIDv4 generated on the mobile device (`expo-crypto`) and preserved in Django models (`UUIDField(primary_key=True)`).
- **Alternatives Considered**:
  - Auto-increment integers + local temporary IDs: Requires re-mapping IDs on sync and rewriting local foreign keys.
- **Consequences**: Enables zero-remapping idempotent upserts (`get_or_create(id=uuid)`).

---

## ADR-004: Separate UTC Instant Timestamps and Local Calendar Dates
- **Date**: 2026-10-10
- **Status**: Accepted
- **Context**: Point-in-time punch events (e.g., Check In at 09:00:15) need unambiguous ordering across timezones, but habit completions and attendance day grouping are strictly calendar-date concepts.
- **Decision**:
  - Record point-in-time events in ISO 8601 UTC strings (`start_time`, `end_time`, `timestamp`).
  - Store local calendar dates explicitly as `'YYYY-MM-DD'` strings (`work_date`, `local_date`).
- **Alternatives Considered**:
  - Deriving dates dynamically using server timezone: Creates shifting day boundaries when crossing timezones or daylight saving changes.
- **Consequences**: Habit streaks and daily attendance remain locked to the user's local day regardless of server timezone.

---

## ADR-005: Authoritative Persistent Start Timestamps for Timers
- **Date**: 2026-10-10
- **Status**: Accepted
- **Context**: In-memory interval timers drift and reset whenever the mobile OS kills the app in the background or the device reboots.
- **Decision**: Timers write their start timestamp (`start_time`) directly to SQLite upon launch. The UI calculates elapsed time as `Date.now() - start_time`. Monotonic in-memory intervals are used solely to trigger UI re-renders.
- **Alternatives Considered**:
  - Accumulating seconds every 1000ms: Drifts over time; destroyed on process death.
- **Consequences**: Zero time loss across app restarts or device reboots.

---

## ADR-006: Explicit Boundary for Phase 2 Wi-Fi Features
- **Date**: 2026-10-10
- **Status**: Accepted
- **Context**: Phase 1 scope explicitly excludes background network monitoring and geofence punch triggers, but requires architectural readiness.
- **Decision**: Provide configuration fields for Office Wi-Fi SSID and BSSID in the database schema and Settings screen, but clearly label them "NOT YET ACTIVE" with descriptive explanation rather than implementing nonfunctional dummy buttons.
- **Alternatives Considered**:
  - Fake automated Wi-Fi triggers: Misleads user and violates requirements.
  - Omitting fields entirely: Would require breaking schema migrations in Phase 2.
- **Consequences**: Seamless transition to Phase 2 native modules without database migration overhead.

---

## ADR-007: Feature Branching and PR Merge Workflow via GitHub CLI
- **Date**: 2026-10-11
- **Status**: Accepted
- **Context**: Working directly on the `main` branch risks introducing untested regressions, lacks branch audit history, and does not leverage GitHub's review and pull request infrastructure.
- **Decision**: All future tasks, features, bug fixes, and documentation updates must be developed on a dedicated task branch (`feature/*`, `fix/*`, `docs/*`, `chore/*`), pushed to remote, submitted as a Pull Request via GitHub CLI (`gh pr create`), and merged into `main` using `gh pr merge --merge --delete-branch`.
- **Alternatives Considered**:
  - Direct pushes to `main`: Faster for single developers, but bypasses PR audit trails and makes task rollbacks harder.
- **Consequences**: Complete traceability of each change set via GitHub Pull Requests; `main` remains continuously releasable.

---

## ADR-008: Wi-Fi Suggestion Invariant — Connection is not Attendance
- **Date**: 2026-10-11
- **Status**: Accepted
- **Context**: Automatic punch-in / punch-out based purely on Wi-Fi state creates false attendance records due to signal drops, router restarts, AP roaming, or passing near the office without entering.
- **Decision**: Wi-Fi detection generates *pending suggestions* stored in `pending_suggestions`, requiring explicit user confirmation. Loss of Wi-Fi uses a configurable grace period (`wifi_grace_seconds`, default 180s) that auto-cancels if the network reconnects. Dismissing arrival prompts activates a cooldown window (`wifi_cooldown_minutes`, default 15m) to avoid repetitive prompts.
- **Alternatives Considered**:
  - Automatic check-in/check-out on connection change: Generates inaccurate punches and false sessions.
  - Silent checkout on timeout: Violates tamper-evident personal ledger guarantee.
- **Consequences**: Highly reliable, tamper-evident records preserving separate detection and confirmation timestamps.

