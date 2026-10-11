# System Architecture: Personal Time Ledger

## 1. High-Level Architecture Overview

Personal Time Ledger is structured as an offline-first distributed application composed of two primary subsystems:
1. **Mobile Client (`mobile/`)**: An Android React Native application using Expo Router and local SQLite (`expo-sqlite`), acting as the primary system of record for all user interactions.
2. **Backend Service (`backend/`)**: A Django REST Framework backend using SQLite on the server side, acting as a cloud replica and centralized reporting service.

```
+-------------------------------------------------------------+
|                      Mobile Device                          |
|                                                             |
|  [Expo Router UI Screens: Home, Attendance, Activities... ] |
|                             |                               |
|              [Domain Repositories in src/db/]               |
|      (attendanceRepo, activitiesRepo, habitsRepo...)        |
|                             |                               |
|       +---------------------+---------------------+         |
|       |                                           |         |
|       v                                           v         |
|  [Local SQLite DB]                        [syncRepo.ts]     |
|  (schema_migrations v1)                   (sync_queue)      |
+---------------------------------------------------|---------+
                                                    | HTTP / JSON
                                                    | (Manual / Auto)
                                                    v
+-------------------------------------------------------------+
|                     Django REST Backend                     |
|                                                             |
|   POST /api/v1/sync/   <--->   [apps/sync/views.py]         |
|   (Idempotent Upsert)          [apps/attendance/views.py]   |
|                                [apps/activities/views.py]   |
|                                [apps/habits/views.py]       |
|                                [apps/reports/views.py]      |
|                                           |                 |
|                                           v                 |
|                                   [Server SQLite DB]        |
|                                   (Django ORM Models)       |
+-------------------------------------------------------------+
```

---

## 2. Directory Layout & Module Responsibilities

```
Attendance App/
├── backend/
│   ├── apps/
│   │   ├── core/                  # Base abstract model, UserPreferences, custom exception handler, auth/token
│   │   ├── attendance/            # AttendanceSession, BreakSession, AttendanceEvent, AttendanceCorrection
│   │   ├── activities/            # Activity, ActivityEntry (timer & manual intervals)
│   │   ├── habits/                # Habit, HabitCompletion, calculate_habit_streaks algorithm
│   │   ├── reports/               # Aggregation views (daily, weekly, monthly reports + trends)
│   │   └── sync/                  # POST /api/v1/sync/ handler and SyncLog model
│   ├── config/
│   │   ├── settings.py            # Installed apps, CORS, DRF config, SQLite foreign key hook
│   │   ├── api_urls.py            # Versioned API routes under /api/v1/
│   │   └── urls.py                # Main project URL resolver
│   └── manage.py
├── mobile/
│   ├── src/
│   │   ├── app/
│   │   │   ├── _layout.tsx        # App entry point, DB init, SplashScreen hide
│   │   │   └── (tabs)/            # Bottom Tab Navigator
│   │   │       ├── _layout.tsx    # Tab bar configuration & Ionicons
│   │   │       ├── index.tsx      # Home dashboard, live punch hero, active stopwatch
│   │   │       ├── attendance.tsx # Punch ledger, history timeline, audit correction modal
│   │   │       ├── activities.tsx # Task intervals, stopwatch controller, manual entry modal
│   │   │       ├── habits.tsx     # Habit checklist, streak badges, create habit modal
│   │   │       ├── reports.tsx    # Daily/weekly/monthly analytics, period selector, trends
│   │   │       └── settings.tsx   # Workday preferences, sync controls, DB reset
│   │   ├── db/
│   │   │   ├── database.ts        # SQLite initialization, v1 migrations, UUID generator
│   │   │   ├── types.ts           # TypeScript interfaces matching SQLite schema
│   │   │   ├── attendanceRepo.ts  # Attendance state transitions, break & net time logic
│   │   │   ├── activitiesRepo.ts  # Activity CRUD, timer start/stop, overlap check, recovery
│   │   │   ├── habitsRepo.ts      # Habit CRUD, daily toggling, streak calculation algorithm
│   │   │   ├── reportsRepo.ts     # Client-side SQL aggregation for daily/weekly/monthly reports
│   │   │   ├── settingsRepo.ts    # SecureStore token storage and preferences repo
│   │   │   └── syncRepo.ts        # Durable offline sync_queue manager & HTTP batch client
│   │   ├── components/ui/         # Card, Button, StatCard, Badge, ProgressBar, EmptyState, Input, TimelineItem
│   │   ├── constants/theme.ts     # Curated dark-first color palette, spacing, and radius tokens
│   │   ├── hooks/use-theme.ts     # Color scheme hook
│   │   └── __tests__/             # Unit tests for domain algorithms
│   ├── app.json
│   └── package.json
├── .agent-memory/                 # Persistent AI operating system memory
├── AGENTS.md                      # Primary instruction manual for AI agents
├── CHANGELOG.md                   # Human-readable change log
├── README.md                      # Setup & operational documentation
└── .gitignore                     # Git secret & artifact protection rules
```

---

## 3. Data Models & Database Architecture

Both client and backend enforce identical schema rules, keyed by client-generated UUIDv4 strings.

### A. Attendance Domain
1. **`attendance_sessions`**:
   - `id`: UUID (Primary Key)
   - `status`: `'IN_PROGRESS'` | `'COMPLETED'`
   - `start_time`: ISO UTC timestamp
   - `end_time`: ISO UTC timestamp (null if in progress)
   - `work_date`: `'YYYY-MM-DD'` local calendar date
   - `notes`: text
   - `is_incomplete`: boolean (0 or 1)
   - `is_corrected`: boolean (0 or 1)
   - Timestamps: `created_at`, `updated_at`, `client_updated_at`, `is_deleted`
2. **`break_sessions`**:
   - `id`: UUID (Primary Key)
   - `session_id`: Foreign Key to `attendance_sessions(id)`
   - `start_time`: ISO UTC timestamp
   - `end_time`: ISO UTC timestamp (null if break active)
   - `notes`: text
3. **`attendance_events`**:
   - `id`: UUID (Primary Key)
   - `session_id`: Foreign Key
   - `event_type`: `'CHECK_IN'` | `'START_BREAK'` | `'END_BREAK'` | `'CHECK_OUT'` | `'CORRECTION'`
   - `timestamp`: ISO UTC timestamp
   - `notes`: text
4. **`attendance_corrections`**:
   - Audit trail capturing `field_name`, `old_value`, `new_value`, `reason`, and `created_at`.

### B. Activities Domain
1. **`activities`**:
   - `id`: UUID (Primary Key)
   - `name`: string
   - `category`: string (e.g. `'Work'`, `'Study'`, `'Personal'`)
   - `color`: hex color string (e.g. `'#38BDF8'`)
   - `is_archived`: boolean
2. **`activity_entries`**:
   - `id`: UUID (Primary Key)
   - `activity_id`: Foreign Key to `activities(id)`
   - `start_time`: ISO UTC timestamp
   - `end_time`: ISO UTC timestamp (null if timer running)
   - `duration_seconds`: integer
   - `work_date`: `'YYYY-MM-DD'`
   - `is_running`: boolean

### C. Habits Domain
1. **`habits`**:
   - `id`: UUID (Primary Key)
   - `name`: string
   - `description`: text
   - `target_count`: integer (default 1)
   - `unit`: string (default `'times'`)
   - `color`: hex color
   - `is_archived`: boolean
2. **`habit_completions`**:
   - `id`: UUID (Primary Key)
   - `habit_id`: Foreign Key to `habits(id)`
   - `local_date`: `'YYYY-MM-DD'`
   - `completed`: boolean
   - `count`: integer
   - **Constraint**: `UNIQUE(habit_id, local_date)` enforces one completion record per calendar day.

### D. Synchronization & Settings Domain
1. **`user_settings`** (key-value table):
   - `workday_start`, `workday_end`, `office_name`, `timezone`, `theme`, `wifi_ssid`, `wifi_bssid`, `backend_url`, `auth_token`, `last_sync_time`.
2. **`sync_queue`**:
   - `id`: UUID
   - `entity_type`: string
   - `entity_id`: string
   - `operation`: `'UPSERT'` | `'DELETE'`
   - `payload`: JSON string
   - `status`: `'PENDING'` | `'SYNCED'` | `'FAILED'`
   - `retry_count`: integer
   - `error_message`: text

---

## 4. State Machines & Core Invariants

### Attendance State Machine
- **State Transition 1 (Check In)**: Allowed only when no session has `status = 'IN_PROGRESS'`. Creates `attendance_sessions` + `attendance_events(CHECK_IN)`.
- **State Transition 2 (Start Break)**: Allowed only when session is active and no break has `end_time IS NULL`. Creates `break_sessions` + `attendance_events(START_BREAK)`.
- **State Transition 3 (End Break)**: Allowed only when break has `end_time IS NULL`. Updates `break_sessions.end_time` + creates `attendance_events(END_BREAK)`.
- **State Transition 4 (Check Out)**: Allowed only when session is active AND no break has `end_time IS NULL` (user must end break explicitly). Updates `attendance_sessions.status = 'COMPLETED'` + creates `attendance_events(CHECK_OUT)`.
- **Net Duration Calculation**:
  $$\text{Net Office Time} = \max(0, \text{Gross Duration} - \sum \text{Break Durations})$$

### Stopwatch Timer Recovery
- Stopwatch timers do NOT rely on an in-memory accumulator.
- The start instant is committed to SQLite as UTC ISO.
- On UI render or 1-second ticks:
  $$\text{Elapsed} = \lfloor(\text{Current Time} - \text{Start Time}) / 1000\rfloor$$
- If the application crashes, restarts, or the phone reboots, the timer resumes seamlessly.

### Streak Calculation Algorithm
- Ordered unique completed dates for habit: $\{D_0, D_1, \dots, D_n\}$.
- **Best Streak**: Longest sequence where $D_{i} = D_{i-1} + 1\text{ day}$.
- **Current Streak**: Active if today ($T$) or yesterday ($T - 1$) is in the set. Walks backwards day by day while dates exist in set.
- Editing an entry on a historical date recalculates both current and best streak deterministically.

---

## 5. Synchronization Flow

1. **Local Enqueue**: Any create/update/delete operation in mobile repositories automatically inserts or updates an entry in `sync_queue` with `status = 'PENDING'`.
2. **Batch Push**: When `performSync()` is called, pending items are grouped by entity type and sent in a single `POST /api/v1/sync/` request.
3. **Idempotent Upsert**:
   - Server processes items by UUID using Django `get_or_create`.
   - Existing records are updated in-place without generating duplicates.
   - Server returns applied count and server updates since client's `last_sync_timestamp`.
4. **Queue Reconciliation**:
   - On HTTP 200: Pending items are marked `SYNCED`, cleaned up, and `last_sync_time` updated.
   - On HTTP error or network timeout: Items marked `FAILED` with error message. Local data remains completely intact.
