# Project Conventions: Personal Time Ledger

## 1. File & Directory Conventions

- **Mobile Routes**: Placed in `mobile/src/app/`. Tab screens reside under `mobile/src/app/(tabs)/` (`index.tsx`, `attendance.tsx`, `activities.tsx`, `habits.tsx`, `reports.tsx`, `settings.tsx`).
- **Mobile Repositories**: Pure TypeScript files in `mobile/src/db/` named `<entity>Repo.ts` (e.g. `attendanceRepo.ts`, `activitiesRepo.ts`, `habitsRepo.ts`).
- **UI Components**: Placed in `mobile/src/components/ui/` using PascalCase filenames (`Card.tsx`, `Button.tsx`, `StatCard.tsx`, `Badge.tsx`, `ProgressBar.tsx`, `EmptyState.tsx`, `Input.tsx`, `TimelineItem.tsx`).
- **Backend Apps**: Placed in `backend/apps/<app_name>/` (`core`, `attendance`, `activities`, `habits`, `reports`, `sync`). Each app contains standard `models.py`, `serializers.py`, `views.py`, `tests.py`.
- **Backend Routing**: Centralized in `backend/config/api_urls.py`, routed under prefix `/api/v1/`.

---

## 2. Naming Conventions

### TypeScript / React Native
- **Components**: PascalCase (e.g., `StatCard`, `HomeScreen`, `TimelineItem`).
- **Functions & Hooks**: camelCase (e.g., `getActiveSession`, `checkIn`, `formatDuration`, `useColorScheme`).
- **Interfaces & Types**: PascalCase (e.g., `AttendanceSession`, `ActiveTimerInfo`, `PeriodReport`).
- **Constants**: UPPER_SNAKE_CASE (e.g., `PRESET_COLORS`, `AUTH_TOKEN_SECURE_KEY`, `DB_NAME`).
- **Database Tables**: snake_case (e.g., `attendance_sessions`, `activity_entries`, `habit_completions`).

### Python / Django
- **Models**: PascalCase singular (e.g., `AttendanceSession`, `BreakSession`, `ActivityEntry`).
- **Views**: PascalCase with `View` suffix (e.g., `AttendanceSessionListCreateView`, `SyncView`).
- **Serializers**: PascalCase with `Serializer` suffix (e.g., `AttendanceSessionSerializer`).
- **Database Fields & Functions**: snake_case (e.g., `start_time`, `work_date`, `calculate_habit_streaks`).

---

## 3. Component & State Patterns

- **Functional Components**: All components are written as functional React components with explicit TypeScript props.
- **Hooks**: Use `useCallback` for event handlers and data loaders; `useFocusEffect` from `expo-router` to re-fetch when switching tabs; `useEffect` for 1-second timer intervals.
- **Styling**: Vanilla `StyleSheet.create` using design tokens exported from `@/constants/theme` (`Colors`, `Spacing`, `Radius`).
- **No Tailwind/Nativewind**: The project uses pure typed React Native styles. Do not inject Tailwind or Nativewind dependencies.
- **Color Scheme Support**: Components read `useColorScheme()` and dynamically select `Colors[scheme === 'light' ? 'light' : 'dark']`.

---

## 4. Database & Storage Patterns

- **Primary Keys**: Always generate client-side UUIDv4 (`generateUUID()` via `expo-crypto`) so records can be created offline and synced idempotently.
- **Timestamps**:
  - Point-in-time instants: Always store in ISO 8601 UTC string (`new Date().toISOString()`).
  - Calendar boundaries: Store local date as `'YYYY-MM-DD'` string (`work_date`, `local_date`) to prevent timezone shifting.
- **Foreign Keys**: Always enable `PRAGMA foreign_keys = ON;` in SQLite.
- **Transactions**: Multi-record modifications (e.g., check-in creating session + event + sync item) must be wrapped in `db.withTransactionSync(() => { ... })` or `@transaction.atomic`.
- **Soft Deletion**: Use `is_deleted = 1` for entities that may need offline sync reconciliation, rather than immediate hard deletion.

---

## 5. API & Error Handling Patterns

### Backend
- All endpoints live under `/api/v1/`.
- Exceptions handled by `custom_exception_handler` in `backend/apps/core/exceptions.py`.
- Structured error response format:
  ```json
  {
    "status": "error",
    "code": 400,
    "message": "Error description",
    "errors": { "field_name": ["details"] }
  }
  ```
- Validation errors return HTTP 400.
- Missing resources return HTTP 404.

### Mobile
- Repository functions throw descriptive `Error` instances (e.g., `throw new Error('An office session is already active.')`).
- UI callers wrap actions in `try / catch` blocks and display clean `Alert.alert('Title', error.message)` alerts.
- Offline and network failures gracefully set `status = 'FAILED'` in `sync_queue` without discarding local records.

---

## 6. Testing Patterns

- **Mobile Tests**: Written with Node 24 native test runner (`import { describe, it } from 'node:test'`, `import assert from 'node:assert/strict'`) in `mobile/src/__tests__/`. Executed via `npm test` using `tsx`.
- **Backend Tests**: Standard Django `TestCase` with `rest_framework.test.APIClient`. All models, business transitions, streak recalculations, and sync views must have corresponding test cases in `<app>/tests.py`. Executed via `python manage.py test`.

---

## 7. Git & Commits

- Commit messages follow conventional format:
  `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`, `refactor: ...`.
- Never commit `.venv/`, `node_modules/`, `*.sqlite3`, `*.pyc`, `.expo/`, or credentials.
- Keep remote `origin` tracking `https://github.com/logicbyroshan/righttime.git` main branch.
