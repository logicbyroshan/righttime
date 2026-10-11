# Known Issues & Technical Debt

This document tracks known bugs, architectural limitations, technical debt, and areas requiring careful treatment.
When an issue is resolved, update its status with a date and resolution note. Never delete an issue without explanation.

---

## 1. Active Issues & Technical Debt

### ISSUE-001: Backend Development Secret Key in Settings
- **Severity**: Low (Development), High (Production)
- **Status**: Open / By Design for Dev
- **Area**: `backend/config/settings.py`
- **Description**: `SECRET_KEY` is hardcoded as `'django-insecure-personal-time-ledger-dev-key-change-in-production'` with `DEBUG = True`.
- **Mitigation/Workaround**: Acceptable for local personal development. Must be loaded from environment variables (e.g. `python-dotenv`) prior to production deployment.

### ISSUE-002: Permissive CORS & Host Configuration
- **Severity**: Low (Development), High (Production)
- **Status**: Open / By Design for Dev
- **Area**: `backend/config/settings.py`
- **Description**: `CORS_ALLOW_ALL_ORIGINS = True` and `ALLOWED_HOSTS = ['*']` are enabled to permit seamless development on Android Studio emulators (`10.0.2.2`) and physical phones across local Wi-Fi.
- **Mitigation/Workaround**: Bind to explicit origins and domain names in production.

### ISSUE-003: Single-User Auto-Registration in Auth View
- **Severity**: Low (Personal Use)
- **Status**: Open / Documented
- **Area**: `backend/apps/core/views.py` (`AuthTokenView`)
- **Description**: `User.objects.get_or_create(username=username)` creates the user if they do not exist. In an enterprise system this would permit arbitrary user creation.
- **Mitigation/Workaround**: Since this is strictly a single-user personal ledger, this simplifies mobile onboarding. For multi-user environments, disable open registration.

### ISSUE-004: Schema Migrations Versioning on Mobile SQLite
- **Severity**: Medium
- **Status**: Open / Documented
- **Area**: `mobile/src/db/database.ts`
- **Description**: The mobile database uses a simple `schema_migrations` table tracking version `1`. When Phase 2 adds new columns or tables, an explicit `applyMigrationV2(db)` function must be introduced and guarded by `currentVersion < 2`.
- **Mitigation/Workaround**: Do not alter `applyMigrationV1`; add incremental migrations sequentially.

### ISSUE-005: Web Target Compatibility Deprecation Warnings
- **Severity**: Low
- **Status**: Open / Non-blocking
- **Area**: `mobile/package.json`
- **Description**: The template includes `@expo/ui` and older transient dependencies that emit npm deprecation warnings for `uuid@7.0.3` during web compilation. Mobile Android runtime is unaffected.
- **Mitigation/Workaround**: Primary release target is Android; native modules are unaffected.

---

## 2. Resolved Issues

### ISSUE-RES-001: String Datetime Parsing in ActivityEntry and SyncView
- **Resolved Date**: 2026-10-10
- **Resolution**: `ActivityEntry.save()` and `SyncView.post()` were updated with safe date parsing using `dateutil.parser.isoparse()`, preventing `TypeError: unsupported operand type(s) for -: 'str' and 'str'`. Verified with 15 passing backend tests.

### ISSUE-RES-002: TypeScript Type Incompatibilities in UI Components
- **Resolved Date**: 2026-10-11
- **Resolution**: Replaced literal type inference with explicit types (`let bg: string`, `let dotColor: string`), converted `Card.tsx` to `StyleProp<ViewStyle>`, and eliminated unused default template components. Verified with `npx tsc --noEmit` passing with 0 errors.
