# Database integration validation — 2026-10-27

Environment: Windows host, Node.js 22.22.0, isolated temporary PostgreSQL 16 Docker container, database checkprint_test. No production database used. Root and server suites ran sequentially because both recreate the public schema.

Desktop suite: npm test with TEST_DATABASE_URL configured — 35 passed, 0 failed, 0 skipped.
Licence-server API suite: npm test in server/ with TEST_DATABASE_URL configured — 19 passed, 0 failed, 0 skipped.

Previously skipped tests now passed:
1. Sign up, activate after subscription grant, offline grace, expiry and clock rollback.
2. Server refusal immediately removes licence access.
3. Encrypted local licence cannot be copied to another computer.
4. Edited and foreign-signed licences rejected.
5. Fake licence server cannot unlock app.
6. Plain HTTP licence endpoints refused outside development.
7. Company registration, subscription request, admin approval and desktop activation.

No application-code changes were needed. Existing installer remains the same tested source build. This validates the local API/database path; unsigned installer, clean-machine installation, production endpoint activation and physical printer calibration limitations remain.
