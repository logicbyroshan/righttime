# Security Model & Guidelines: Personal Time Ledger

## 1. Security Model Overview

Personal Time Ledger is designed as a single-user personal-use tool, prioritizing data privacy and durable offline ownership. 
While not an enterprise multi-tenant service, robust security boundaries must be maintained to prevent credential exposure, data tampering, and unauthorized data leakage.

---

## 2. Authentication & Authorization

### Mobile Client
- **Token Storage**: Personal access tokens must NEVER be stored in plain text, standard `AsyncStorage`, or application logs.
- **Expo SecureStore**: `mobile/src/db/settingsRepo.ts` stores authentication tokens in Android `EncryptedSharedPreferences` backed by the Android Keystore system.
- **Fallback Policy**: If `expo-secure-store` is unavailable on non-mobile test runners, settings fall back safely to SQLite without logging tokens.

### Backend (Django)
- **Authentication**: `rest_framework.authentication.TokenAuthentication` enforces user identity via the `Authorization: Token <key>` HTTP header.
- **Ownership Enforcement**: All API views filter querysets strictly by `request.user` (`AttendanceSession.objects.filter(user=request.user)`). Cross-user access or data leaking across accounts is blocked at the view layer.
- **Permission Classes**: Defaults to `rest_framework.permissions.IsAuthenticated` across all data endpoints. `HealthCheckView` and `AuthTokenView` are the only public routes (`AllowAny`).

---

## 3. Data Protection & Secrets Handling

### Storage & Secrets Rules
1. **Never Commit Secrets**:
   - `db.sqlite3` and `*.sqlite3` must remain strictly ignored in [.gitignore](file:///c:/Users/iamro/Desktop/Attendance%20App/.gitignore).
   - `.env` files and API tokens must never be committed to Git.
   - Documentation files, agent memory, and commit messages must NEVER include actual production tokens, passwords, or personal credentials.
2. **Database Integrity & Foreign Keys**:
   - SQLite does not enforce foreign keys by default. Both mobile (`database.ts`) and Django (`settings.py` via `connection_created` signal) enforce `PRAGMA foreign_keys = ON;`.
   - All multi-table updates are wrapped in transactional blocks (`db.withTransactionSync` / `@transaction.atomic`).

---

## 4. Input Validation & Defense

### Input Boundaries
- **Attendance Transitions**: Business constraints cannot be bypassed by sending arbitrary payloads. For instance, `CHECK_OUT` strictly validates that the session is active and no break is open; `CHECK_IN` prevents creating a session if an active session already exists.
- **Activity Intervals**: Serializers validate `end_time >= start_time`. Negative duration entries are rejected with HTTP 400.
- **Habit Uniqueness**: Enforced via SQLite `UNIQUE(habit_id, local_date)` constraint and Django `UniqueConstraint(fields=['user', 'habit', 'local_date'])`, preventing duplicate submission attacks.
- **Idempotency**: All sync endpoints utilize UUIDv4 primary keys and `get_or_create` logic. Repeated network submissions or replay requests do not duplicate attendance events or habit counts.

---

## 5. Security-Sensitive Areas for Future Agents

When modifying the project, pay special attention to:
1. **`backend/apps/sync/views.py`**:
   - Always ensure upsert operations verify `user=request.user` when resolving foreign keys (e.g., verifying `session.user == request.user`).
2. **`mobile/src/db/settingsRepo.ts`**:
   - Do not log or print `auth_token` in console output or error logs.
3. **`backend/config/settings.py`**:
   - Before any production deployment, `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, and `CORS_ALLOW_ALL_ORIGINS` must be extracted to environment variables.
