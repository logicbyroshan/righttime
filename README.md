# Personal Time Ledger — Phase 1

A production-minded, offline-first personal time-tracking and attendance ledger built with **React Native (Expo SDK 57, Expo Router, TypeScript)** and a **Django REST Framework (Python 3.11, SQLite)** backend.

> **Purpose:** A personal-use application maintaining independent, authoritative records of office attendance punches, breaks, personal activities, timers, and daily habits so users can cross-reference records with official HR systems.

---

## 🏛️ System Architecture

```
Attendance App/
├── backend/                       # Django REST Framework Backend
│   ├── apps/
│   │   ├── core/                  # Auth, health check, user preferences
│   │   ├── attendance/            # Office sessions, breaks, events, audit corrections
│   │   ├── activities/            # Activity categories, timer intervals, manual entries
│   │   ├── habits/                # Habits, daily completions, streak calculations
│   │   ├── reports/               # Daily, weekly, monthly aggregations & trend comparisons
│   │   └── sync/                  # Idempotent batch synchronization & sync logs
│   ├── config/                    # Django settings, api_urls, wsgi/asgi
│   └── manage.py
├── mobile/                        # React Native / Expo Mobile App
│   ├── src/
│   │   ├── app/                   # Expo Router navigation
│   │   │   ├── _layout.tsx        # Root layout with SQLite initializer
│   │   │   └── (tabs)/            # Bottom Navigation Tabs
│   │   │       ├── _layout.tsx    # Tab bar with icons
│   │   │       ├── index.tsx      # A. Home Dashboard & Live Punches
│   │   │       ├── attendance.tsx # B. Attendance History & Audit Corrections
│   │   │       ├── activities.tsx # C. Activities & Live Stopwatch Timers
│   │   │       ├── habits.tsx     # D. Daily Habits, Streaks & Progress
│   │   │       ├── reports.tsx    # E. Daily, Weekly, Monthly Reports & Trends
│   │   │       └── settings.tsx   # F. Workday Targets, Backend Sync, Phase 2 Fields
│   │   ├── db/                    # Local-first SQLite persistence layer
│   │   │   ├── database.ts        # Database connection, v1 schema migrations, UUIDs
│   │   │   ├── types.ts           # Strict TypeScript database schemas
│   │   │   ├── attendanceRepo.ts  # Attendance state machine & break calculations
│   │   │   ├── activitiesRepo.ts  # Stopwatch persistence, overlap prevention, recovery
│   │   │   ├── habitsRepo.ts      # Unique daily completions & streak algorithm
│   │   │   ├── reportsRepo.ts     # Local period aggregation engine
│   │   │   ├── settingsRepo.ts    # SecureStore credentials & preferences
│   │   │   └── syncRepo.ts        # Durable offline sync queue & network retry
│   │   ├── components/ui/         # Design system (Card, Button, StatCard, Badge, etc.)
│   │   ├── constants/theme.ts     # Dark-first curated color palette & tokens
│   │   └── __tests__/             # Mobile domain unit test suite
│   ├── app.json
│   └── package.json
└── README.md
```

---

## 🚀 Setup & Execution Guide

### Prerequisites
- **Node.js**: v20+ or v24+
- **Python**: 3.11+
- **Git**
- **Android Studio** (for Android Emulator) or Expo Go on a physical phone.

---

### Backend (Django REST Framework)

1. **Activate or create Python virtual environment**:
   ```powershell
   # From root:
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. **Install backend dependencies**:
   ```powershell
   cd backend
   pip install django djangorestframework django-cors-headers python-dateutil
   ```

3. **Apply database migrations**:
   ```powershell
   python manage.py migrate
   ```

4. **Run the backend development server**:
   ```powershell
   # Binds to 0.0.0.0 so both Emulator (10.0.2.2) and Physical Devices can connect:
   python manage.py runserver 0.0.0.0:8000
   ```

5. **Verify health endpoint**:
   ```
   GET http://127.0.0.1:8000/api/v1/health/
   ```

---

### Mobile App (React Native / Expo)

1. **Install mobile dependencies**:
   ```powershell
   cd mobile
   npm install
   ```

2. **Start Expo Development Server**:
   ```powershell
   npx expo start
   ```

3. **Launch on Android Emulator**:
   - Press `a` in the Expo terminal, or run:
   ```powershell
   npm run android
   ```

4. **Launch on Physical Device**:
   - Install the **Expo Go** app from the Google Play Store.
   - Scan the QR code displayed in the terminal.

---

## 🌐 API Base URL Configuration

In the Mobile App, open the **Settings** tab:

- **Android Studio Emulator**:
  Set Backend API URL to:
  ```
  http://10.0.2.2:8000
  ```
  *(10.0.2.2 is the special alias to your host loopback interface).*

- **Physical Android Phone**:
  Find your host computer's Local IP address using `ipconfig` (e.g. `192.168.1.5`):
  Set Backend API URL to:
  ```
  http://192.168.1.5:8000
  ```
  *(Ensure both your computer and phone are connected to the same Wi-Fi network).*

- **Auth Token**:
  Obtain a token via `POST /api/v1/auth/token/` with username/password and paste into Settings. Tokens are encrypted using Android `EncryptedSharedPreferences` via `expo-secure-store`.

---

## 🧪 Automated Test Results

### 1. Backend Test Suite (Django)
```powershell
cd backend
python manage.py test
```
**Results:**
```
Ran 15 tests in 14.237s
OK
System check identified no issues.
```
- `CoreApiTests`: Health endpoint, token authentication onboarding, preferences update.
- `AttendanceApiTests`: Check-in, duplicate open session prevention, break starts/ends, break overlap prevention, checkout validation with open break, net office calculations, and manual correction audit log.
- `ActivitiesApiTests`: Activity CRUD, running timer overlap prevention, start/end ordering validation, and duration calculations.
- `HabitsApiTests`: Unique daily completion per date, streak calculations, and historical edits recalculation.
- `ReportsApiTests`: Daily/weekly/monthly calculations, trends comparison with previous period, and safe zeroed-out empty states.
- `SyncApiTests`: Batch upserts, UUID-keyed idempotency, duplicate request handling, and sync logs.

### 2. Mobile Domain Test Suite
```powershell
cd mobile
npm test
```
**Results:**
```
✔ calculates habit streaks accurately across consecutive days
✔ preserves current streak when yesterday completed but today not yet completed
✔ resets streak to 0 when gap exceeds one day
✔ recalculates streak correctly when historical record is removed
✔ calculates net office time: gross elapsed minus recorded breaks
✔ rejects breaks outside attendance session bounds
✔ validates activity entries and rejects end time before start time

tests 7 | pass 7 | fail 0
```

### 3. Mobile TypeScript Static Analysis
```powershell
cd mobile
npx tsc --noEmit
```
**Results:** `0 errors` (Clean compilation under strict mode).

---

## ✅ Phase 1 Completion Checklist

| Criterion | Status | Description |
|---|:---:|---|
| **Android Mobile App with Expo Router** | **PASS** | Complete 6-tab navigation (`Home`, `Attendance`, `Activities`, `Habits`, `Reports`, `Settings`). |
| **Local-First SQLite Storage** | **PASS** | Versioned migrations, foreign keys enabled (`PRAGMA foreign_keys = ON`), durable queue. |
| **Attendance State Machine** | **PASS** | No 2 open sessions; cannot checkout while break is open; breaks must belong to session; net duration = elapsed - breaks. |
| **Timer Recovery Across Process Death** | **PASS** | Autoritative UTC start timestamps persisted; elapsed time calculated dynamically from clock. |
| **Attendance Corrections with Audit Log** | **PASS** | Corrections require justification reason; old and new values logged. |
| **Activities & Timers** | **PASS** | Create, edit, archive activities; timer overlap prevention; manual intervals with start/end validation. |
| **Habits & Streak Engine** | **PASS** | Daily target; duplicate completion prevention on same local date; streak recalculation on historical edits. |
| **Reports & Trend Calculations** | **PASS** | Daily, weekly, monthly summaries; gross, break, net office hours; activity categories; habit consistency; comparison vs previous period. |
| **Settings & Secure Storage** | **PASS** | Configurable workday targets, office name, timezone, theme, `expo-secure-store` credentials, database reset. |
| **Phase 2 Wi-Fi Preparation Fields** | **PASS** | Wi-Fi SSID / BSSID fields configured in schema and UI, clearly marked as inactive for Phase 1. |
| **Django REST Framework Backend** | **PASS** | Models, serializers, versioned endpoints under `/api/v1/`, health endpoint, auth, and SQLite storage. |
| **Synchronization** | **PASS** | Durable local sync queue; idempotent batch upserts; status indicators; retry on network failure. |

---

## 🔮 Phase 2 Implementation Plan

Phase 2 will introduce automated background intelligence and native Android hardware integrations:

1. **Native Background Wi-Fi & Geofence Detection**:
   - Integration with Android `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, and `ACCESS_WIFI_STATE`.
   - Native WorkManager task or Android Foreground Service periodically polling connected BSSID against configured office Wi-Fi networks.

2. **Confirmation Punch Notifications**:
   - Rather than silent automatic check-ins, deliver local Android notifications asking: *"Arrived at Office HQ? Tap to confirm Check In."*
   - Support action buttons directly in the Android notification shade.

3. **Punch-Record Comparison & Import**:
   - Parser for official biometric attendance CSV/Excel exports.
   - Side-by-side reconciliation highlighting punch discrepancies.

4. **Evidence PDF Generation**:
   - Offline PDF export summarizing verified hours, breaks, and manual corrections for HR evidence.
