# Project Overview: Personal Time Ledger

## 1. Description & Purpose
**Personal Time Ledger** is a personal-use attendance, activity, and habit tracking system designed to maintain an independent, tamper-evident record of office attendance punches, breaks, work intervals, and daily routines.
Its primary objective is to allow an individual user to independently track exact office presence and productivity intervals to cross-reference with official employer HR/punch clock systems (e.g., biometric logs, badge card punch exports).

It is strictly a **personal-use ledger**, NOT an enterprise HR management system. It does not handle employee hierarchies, payroll calculations, multi-tenancy, or external subscriptions.

---

## 2. Target Users & Use Cases
- **Primary User**: An employee or contractor working in an office or hybrid environment who wants reliable, independent proof of work hours.
- **Use Cases**:
  - Punching in, taking lunch/tea breaks, resuming, and checking out.
  - Recording manual punch corrections with documented audit justifications when mistakes happen.
  - Tracking time spent on deep work, code review, study, or projects via a live stopwatch or manual entries.
  - Maintaining daily personal habits (water, reading, workouts) and computing accurate multi-day streaks.
  - Generating daily, weekly, and monthly net office hours vs. break hours reports.
  - Synchronizing local mobile data to a personal self-hosted Django backend when connected to network.

---

## 3. Technology Stack & Dependencies

### Mobile Application (`mobile/`)
- **Runtime & Framework**: React Native 0.86.3, React 19.2.3, Expo SDK ~57.0.27
- **Routing**: Expo Router ~57.0.25 (File-based routing with tab navigation)
- **Language**: TypeScript ~6.0.3 (Strict Mode enabled)
- **Local Database**: `expo-sqlite` ~57.0.4 (Synchronous SQLite API with PRAGMA foreign_keys = ON)
- **Secure Credentials**: `expo-secure-store` ~57.0.4 (Android EncryptedSharedPreferences)
- **Hardware/Crypto**: `expo-crypto` ~57.0.3 (Crypto UUIDv4 generation)
- **Icons & UI**: `@expo/vector-icons` ^15.0.2 (Ionicons), Custom dark-first Design System
- **Testing**: Node.js native test runner (`node:test`, `node:assert/strict`) via `tsx` ^4.23.15

### Backend Service (`backend/`)
- **Runtime**: Python 3.11.9
- **Web Framework**: Django 5.2.18
- **API Framework**: Django REST Framework (DRF) 3.18.3
- **Database**: SQLite 3 with Foreign Key enforcement (`PRAGMA foreign_keys = ON`)
- **CORS Support**: `django-cors-headers` 4.9.0
- **Time/Date Utilities**: `python-dateutil` 2.9.0
- **Testing**: Django standard test runner with `rest_framework.test.APIClient`

---

## 4. Key Architectural Constraints & Invariants
1. **Local-First Authoritative Store**:
   - The SQLite database on the mobile device is the primary source of truth for the user experience.
   - The Django server is an idempotent replica.
   - Network failure or server downtime must never block local check-ins, timers, habit completions, or reports.
2. **Strict Attendance State Machine**:
   - Only ONE open session allowed at any instant (`IN_PROGRESS`).
   - A session cannot be checked out while a break is active; break must be explicitly ended.
   - Breaks must belong to an attendance session and cannot overlap.
   - Net office time = gross elapsed duration minus recorded break duration.
   - Incomplete sessions remain incomplete; fake checkout timestamps are never fabricated.
3. **Timer Persistence**:
   - Active activity timers persist UTC start timestamps to disk; elapsed time is dynamically computed from system time, surviving app restarts and process termination.
   - Overlapping active timers are prevented.
4. **Unique Daily Habit Completion**:
   - Habit completions are uniquely keyed by `(habit_id, local_date)`.
   - Streaks are re-calculated retroactively if historical dates are modified.
5. **Phase 1 Boundary**:
   - Out of scope: native background geofencing / Wi-Fi broadcast monitoring, official CSV imports, PDF evidence reports.
   - Wi-Fi SSID / BSSID fields exist in settings and schemas as inactive preparation for Phase 2.

---

## 5. Current Maturity & Status
- **Current Version**: Phase 1 Baseline Complete (v1.0.0).
- **Backend Tests**: 15/15 passing.
- **Mobile Domain Tests**: 7/7 passing.
- **TypeScript**: 0 compiler errors under strict mode.
- **Remote Git**: Synchronized to `https://github.com/logicbyroshan/righttime.git` (main branch).
