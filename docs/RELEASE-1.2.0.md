# CheckPrint 1.2.0 — delivery notes

Release date: 2026-10-27

## Included

- Beneficiary directory: add, edit, delete, search, client reference, phone and notes.
- Select a saved beneficiary in the single-cheque form; optional bank and amount defaults.
- Duplicate names supported through stable beneficiary IDs.
- Explicit Save as beneficiary flow; printing no longer overwrites saved defaults.
- Existing saved payees migrated on first launch with the same Windows user/profile.
- Beneficiaries persisted in the desktop data directory and included in version 2 backups.
- Version 1 backups remain supported; restoring one clears the beneficiary directory because it contains no beneficiary data. Export a current backup before restoring.

## Install and use

1. Export a backup from the existing app before upgrading. Older backups do not contain legacy saved payees; retain the existing Windows app profile until migration finishes.
2. Close CheckPrint, run CheckPrint-1.2.0-Setup-x64.exe and use the existing installation location.
3. Open Beneficiaries to review migrated entries or add clients. Use a client/company reference to distinguish identical names.
4. In CheckPrint select a beneficiary, review bank and amount, enter the payment date and cheque number, and preview before printing.
5. Export a new backup after migration.

## Validation and release status

- JavaScript lint and inline renderer script syntax checks passed.
- Desktop tests: 35 passed, 0 failed, 0 skipped, including all 7 PostgreSQL-dependent licensing tests.
- Licence-server API integration tests: 19 passed, 0 failed, 0 skipped.
- Database suites ran sequentially against an isolated temporary PostgreSQL 16 container on 2026-10-27.
- New persistence, backup compatibility and autofill tests passed.
- No Authenticode certificate is configured; this delivery is unsigned.
- A clean-machine installation, interactive beneficiary workflow, real-printer calibration, production-endpoint licensing activation have not been certified. Local database integration tests have passed.
- Existing README production-readiness limitations still apply. This is a release candidate, not a certified customer production release.

## Rebuild from the supplied source

Use Node.js 22 or later on Windows. Run npm ci, npm run lint and npm test in the project directory. To create the protected unsigned installer run:

    npm run build:protected -- --config.win.signAndEditExecutable=false

For a customer signed release configure the certificate environment variables described in docs/DEPLOYMENT.md and run npm run build:protected:signed. Never put signing certificates or private keys inside the source or customer installer.

The package includes desktop source, licence-server source, lockfiles, tests, documentation and CI definitions. Dependencies and local credentials are intentionally excluded; install dependencies with npm ci in the root and server directories. Configure the server using server/.env.example and docs/LICENSING.md. The desktop licence endpoint remains https://license.rizotic.com.
