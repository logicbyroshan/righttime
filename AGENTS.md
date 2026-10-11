# AGENTS.md — Developer & AI Agent Operating Instructions

> **MANDATORY READING FOR ALL AI AGENTS**: Before performing ANY work on this repository, you must read this document, adhere to all rules, and follow the token-efficiency and continuous-memory protocols.

---

## 1. Project Overview & Mission

**Personal Time Ledger** is a personal-use, offline-first attendance, stopwatch, and habit-tracking application designed to maintain an independent, tamper-evident record of workplace punches, breaks, tasks, and routines.

### Key Project Realities
- **Target Audience**: Single individual maintaining records to cross-reference with official employer HR/biometric logs.
- **Not an Enterprise HR App**: There are no multi-user organizations, employee directories, payroll engines, or subscription gates.
- **Offline-First Source of Truth**: The SQLite database on the mobile device (`expo-sqlite`) is the primary system of record. The Django server is an idempotent replica.
- **Strict Transition Invariants**: Only 1 open attendance session at a time; sessions cannot finish while breaks are open; break intervals must reside within session bounds; net duration is gross elapsed minus breaks; timer start timestamps must be authoritative.

---

## 2. Architecture & File Layout

```
Attendance App/
├── backend/                       # Django REST Framework Backend
│   ├── apps/
│   │   ├── core/                  # Base models, user preferences, exception handler, auth
│   │   ├── attendance/            # AttendanceSession, BreakSession, AttendanceEvent, AttendanceCorrection
│   │   ├── activities/            # Activity, ActivityEntry (timer intervals & manual entries)
│   │   ├── habits/                # Habit, HabitCompletion, streak recalculation engine
│   │   ├── reports/               # Daily, weekly, monthly aggregation views
│   │   └── sync/                  # Idempotent batch sync handler (/api/v1/sync/)
│   ├── config/                    # settings.py, api_urls.py, urls.py
│   └── manage.py
├── mobile/                        # React Native / Expo Application
│   ├── src/
│   │   ├── app/                   # Expo Router
│   │   │   ├── _layout.tsx        # App entry point, DB init, splash hide
│   │   │   └── (tabs)/            # Bottom Tabs Navigator
│   │   │       ├── _layout.tsx    # Tab bar icons
│   │   │       ├── index.tsx      # Screen A: Home Dashboard
│   │   │       ├── attendance.tsx # Screen B: Attendance Ledger & Audit
│   │   │       ├── activities.tsx # Screen C: Activities & Stopwatch
│   │   │       ├── habits.tsx     # Screen D: Habits & Streaks
│   │   │       ├── reports.tsx    # Screen E: Analytics & Trends
│   │   │       └── settings.tsx   # Screen F: Settings & Sync
│   │   ├── db/                    # Local-First SQLite Persistence
│   │   │   ├── database.ts        # Database connection, v1 migrations, UUIDs
│   │   │   ├── types.ts           # Database schema TypeScript types
│   │   │   ├── attendanceRepo.ts  # Attendance state machine
│   │   │   ├── activitiesRepo.ts  # Stopwatch recovery & overlap checks
│   │   │   ├── habitsRepo.ts      # Unique daily completion & streak calculation
│   │   │   ├── reportsRepo.ts     # Client-side period aggregations
│   │   │   ├── settingsRepo.ts    # SecureStore credentials & preferences
│   │   │   └── syncRepo.ts        # Durable offline sync_queue
│   │   ├── components/ui/         # Card, Button, StatCard, Badge, ProgressBar, etc.
│   │   ├── constants/theme.ts     # Dark-first color palette & design tokens
│   │   └── __tests__/             # Mobile domain unit tests
│   ├── app.json
│   └── package.json
├── .agent-memory/                 # Persistent AI memory system
├── AGENTS.md                      # This instruction manual
├── CHANGELOG.md                   # Human-readable change log
├── README.md                      # Setup and operational guide
└── .gitignore                     # Git exclusion rules
```

---

## 3. Development, Testing & Build Commands

### Backend Commands (from root)
```powershell
# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# Run migrations
cd backend
python manage.py migrate

# Run development server (0.0.0.0 binds to localhost, 10.0.2.2 emulator, and LAN)
python manage.py runserver 0.0.0.0:8000

# Execute backend automated test suite
python manage.py test
```

### Mobile Commands (from `mobile/`)
```powershell
# Install dependencies
npm install

# Run TypeScript static type check
npx tsc --noEmit

# Run mobile domain unit tests
npm test

# Start Expo development server
npx expo start

# Launch on Android emulator
npm run android
```

---

## 4. Code & Architectural Conventions

### Naming Conventions
- **React Components**: PascalCase (`StatCard.tsx`, `TimelineItem.tsx`).
- **Repositories & Helpers**: camelCase (`attendanceRepo.ts`, `getActiveSession()`).
- **Database Tables & Columns**: snake_case (`attendance_sessions`, `start_time`, `is_running`).
- **Django Models**: PascalCase singular (`AttendanceSession`, `ActivityEntry`).
- **Django Views & Serializers**: PascalCase with suffix (`DailyReportView`, `HabitSerializer`).

### Architectural Patterns
1. **UUIDv4 Primary Keys**: All records are created with client-side UUIDs (`generateUUID()` via `expo-crypto`) and stored in Django `UUIDField(primary_key=True)`.
2. **Timestamps vs. Dates**:
   - Point-in-time: ISO 8601 UTC strings (`start_time`, `end_time`, `timestamp`).
   - Day boundaries: Explicit local date strings `'YYYY-MM-DD'` (`work_date`, `local_date`).
3. **Foreign Keys Enforcement**: SQLite foreign keys are always explicitly enabled (`PRAGMA foreign_keys = ON;`).
4. **Transactions**: All multi-record mutations must be enclosed in `db.withTransactionSync` on mobile or `@transaction.atomic` in Django.
5. **No CSS Frameworks**: Mobile styling is written with pure React Native `StyleSheet.create` using tokens from `@/constants/theme`. Never install or import Tailwind/Nativewind.

---

## 5. Security Rules

1. **Token Storage**: Personal auth tokens must be stored using `expo-secure-store` (Android EncryptedSharedPreferences). Never store tokens in plain AsyncStorage or print them in application logs.
2. **Never Commit Secrets or Databases**: `db.sqlite3`, `*.sqlite3`, `.venv/`, `node_modules/`, and `.env` must remain strictly in `.gitignore`.
3. **Data Ownership**: In all Django views and serializers, querysets must filter by `user=request.user`. Users must never view or modify another user's records.
4. **Never Log Sensitive Credentials**: Do not write real API tokens, passwords, or keys into `.agent-memory/`, documentation, or Git commit messages.

---

## 6. What an Agent MUST DO

- **Read Memory First**: Read `AGENTS.md` and relevant `.agent-memory/` files before beginning any task.
- **Validate Invariants**:
  - Verify that attendance sessions cannot be started if an existing session is `IN_PROGRESS`.
  - Verify that sessions cannot be checked out while a break is active.
  - Verify that habit completions are uniquely constrained to `(habit_id, local_date)`.
  - Verify that activity entries satisfy `end_time > start_time`.
- **Run Tests Before & After Changes**:
  - Run `python manage.py test` in `backend/` (must pass 15/15 tests).
  - Run `npm test` in `mobile/` (must pass 7/7 tests).
  - Run `npx tsc --noEmit` in `mobile/` (must have 0 errors).
- **Update Documentation & Memory**: Update `CHANGELOG.md`, `.agent-memory/TASK_HISTORY.md`, and `.agent-memory/CURRENT_STATE.md` after any meaningful work.

---

## 7. What an Agent MUST NOT DO

- **DO NOT** modify, refactor, or format code unrelated to the requested task.
- **DO NOT** replace SQLite with an alternative database without an ADR and explicit instruction.
- **DO NOT** install unvetted or unmaintained third-party dependencies.
- **DO NOT** implement fake or nonfunctional UI buttons for future Phase 2 features (keep them clearly marked inactive or out of navigation).
- **DO NOT** delete local records simply because synchronization fails.
- **DO NOT** fabricate checkout times for incomplete sessions.
- **DO NOT** waste tokens reading the entire repository when a targeted file inspection is sufficient.
- **DO NOT** commit or push directly to `main`. Always follow the branching and PR workflow below.

---

## 8. Mandatory Git Branching & GitHub PR Workflow

**RULE**: Never push code directly to `main`. Every task, feature, bug fix, or documentation update must be executed in an isolated branch and merged via a Pull Request using the GitHub CLI (`gh`).

### Step-by-Step Task Execution Protocol:
1. **Branch Out from Updated Main**:
   ```powershell
   git checkout main
   git pull origin main
   git checkout -b <prefix>/<short-task-name>
   ```
   Branch naming conventions:
   - `feature/<name>` for new features or enhancements
   - `fix/<name>` for bug fixes or corrections
   - `docs/<name>` for documentation or memory updates
   - `chore/<name>` for tooling, dependencies, or configuration
2. **Execute Work & Test**:
   - Implement the minimal necessary change.
   - Run backend tests: `cd backend; python manage.py test`.
   - Run mobile tests: `cd mobile; npm test`.
   - Run TypeScript check: `cd mobile; npx tsc --noEmit`.
3. **Commit Changes**:
   - Stage affected files: `git add <files>`
   - Commit with conventional message: `git commit -m "<type>: <description>"`
4. **Push Branch to Remote**:
   ```powershell
   git push -u origin <branch-name>
   ```
5. **Create Pull Request via GitHub CLI (`gh`)**:
   ```powershell
   gh pr create --title "<Title>" --body "<Detailed description of changes and test results>"
   ```
6. **Merge Pull Request via GitHub CLI**:
   ```powershell
   gh pr merge --merge --delete-branch
   ```
7. **Return to Main & Synchronize**:
   ```powershell
   git checkout main
   git pull origin main
   ```
8. **Next Task**: Start each new task on a fresh separate branch branched from the freshly updated `main`.

---

## 8. Rules for Modifying Existing Code & Adding Features

### Modifying Existing Code
1. Inspect the relevant repository file (`attendanceRepo.ts`, `activitiesRepo.ts`, etc.) and corresponding Django model/view.
2. Ensure existing tests still pass.
3. Apply the minimal necessary modification.
4. If a database schema change is needed on mobile, add an incremental migration function (e.g. `applyMigrationV2(db)`) in `database.ts` and bump `version`. On Django, generate and apply migrations with `makemigrations` and `migrate`.

### Adding Features
1. Assess whether the feature belongs in Phase 1 (attendance, activities, habits, reports, sync) or Phase 2 (Wi-Fi detection, punch notifications, CSV reconciliation, PDF exports).
2. Adhere to the established repository pattern:
   - TypeScript interfaces in `mobile/src/db/types.ts`.
   - SQLite table & migration in `mobile/src/db/database.ts`.
   - Domain functions in `mobile/src/db/<domain>Repo.ts`.
   - UI screen in `mobile/src/app/(tabs)/<screen>.tsx`.
   - Django model in `backend/apps/<app>/models.py`.
   - Serializer in `backend/apps/<app>/serializers.py`.
   - API view in `backend/apps/<app>/views.py`.
   - Unit tests on both mobile and backend.

---

## 9. Rules for Updating Memory & Changelog

Whenever meaningful work is completed:
1. **`CHANGELOG.md`**: Record features, bug fixes, breaking changes, or dependency additions under the appropriate version header.
2. **`.agent-memory/CURRENT_STATE.md`**: Update current version, implemented items, and active priorities.
3. **`.agent-memory/TASK_HISTORY.md`**: Add an entry following the standard task format (`Date`, `Task`, `Reason`, `Files affected`, `What changed`, `Testing performed`).
4. **`.agent-memory/DECISIONS.md`**: Record an ADR if an architectural or design decision was made.
5. **`.agent-memory/KNOWN_ISSUES.md`**: Mark resolved issues as resolved or record new technical debt discovered.

---

## 10. Source of Truth Priority

When information conflicts, resolve in this order:
1. **Actual current implementation in the repository**
2. **Explicit user instructions**
3. **This document (`AGENTS.md`)**
4. **Current project configuration files (`app.json`, `package.json`, `settings.py`)**
5. **`.agent-memory/` documentation**
6. **`CHANGELOG.md`**
7. **Agent assumptions**
