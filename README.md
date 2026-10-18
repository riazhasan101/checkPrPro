# CheckPrint — Windows Cheque Printing

Offline-first Electron desktop app for Excel-driven bank cheque preparation and printing.

## Status

**Engineering foundation / pre-production. NOT approved for live bank cheques.** Requires physical bank cheque calibration, printer testing, security review, and implementation of all remaining SRS requirements before production deployment.

## Run locally

Install Node.js 22+, then:

```bash
npm install
npm start
```

## Test

```bash
npm run lint
npm test
```

## Docker CI

```bash
docker compose run --build ci
```

Docker runs tests only. Printing must run on Windows with a correctly configured physical printer.

## Build Windows installer

On Windows:

```powershell
npm install
npm run build:win
```

Installer output: `dist/`.

## GitHub CI/CD

- `.github/workflows/ci.yml`: lint, unit tests, Docker build, Windows installer artifact.
- `.github/workflows/release.yml`: tag `v*` to build and attach installer to a GitHub release.
- To publish: create a new GitHub repository and push this directory. GitHub Actions will run automatically.
- Configure Windows code-signing credentials and replace release workflow with signed builds before public distribution.

## Matching the preview to a real cheque

The preview draws your text on top of an image of the **blank** cheque, using the same millimetre positions the printer uses, so what you see is what prints.

- **City Bank** and **IFIC Bank** ship with a measured layout and a built-in blank cheque image (embedded in `index.html`, so the app stays one file).
- **Any other bank:** open **Setup → Adjust print positions**, pick the bank, and choose a scan or photo of a *blank* cheque of that bank (cropped to the cheque edges, 190.5 × 88.9 mm). Then drag each field onto its line; the X/Y values are saved. The image is only a preview aid and is never printed.
- To make a calibrated layout permanent for everyone, copy the final X/Y/width values into `TEMPLATES` in `index.html` and `src/core/cheque.cjs` (a test checks the two stay identical), and add the image to `BUILTIN_SCANS` in `index.html`.

## Required next steps

1. Replace generic cheque layout with bank-specific millimetre-positioned templates.
2. Calibrate the in-app layout editor against plain paper, then real cheque stock.
3. Wire batch validation through the same path as printing before any live printing.
4. Saved printer profiles are still required. Print status and reprint reasons are recorded on this computer.
5. Replace the legacy XLSX parser with a maintained and security-reviewed dependency; evaluate ExcelJS for `.xlsx` and CSV, and explicitly handle legacy `.xls` conversion.
6. Test real printers, paper sizes, and bank cheque stock.
7. Run security review, dependency audit, and end-to-end acceptance testing.

See `docs/DEPLOYMENT.md` for GitHub instructions and limitations.

## Subscription licensing
See [docs/LICENSING.md](docs/LICENSING.md): licence server, admin panel, device binding, protected build and the limits of copy protection.
