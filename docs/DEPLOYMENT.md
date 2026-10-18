# Deployment guide

## GitHub repository

```bash
git init
git add .
git commit -m "Initial CheckPrint desktop application"
git branch -M main
git remote add origin https://github.com/YOUR-ORG/checkprint.git
git push -u origin main
```

Create the empty GitHub repository before adding the remote. Do not commit real payment spreadsheets, cheque scans, credentials, or customer bank data.

## CI

Each push and pull request triggers tests, Docker build, and a Windows installer artifact. Download the installer from the workflow's Artifacts section. A successful workflow does not imply bank cheque compatibility.

## Release

```bash
git tag v1.0.0
git push origin v1.0.0
```

A tag build obfuscates the app and Authenticode-signs the installer. It fails if either GitHub Actions secret is missing, so an unsigned installer is not published:

- `WIN_CSC_LINK`: base64 text of the Authenticode `.pfx`, or a path the runner can read. Prefer base64 so the file is not stored in the repository.
- `WIN_CSC_KEY_PASSWORD`: password for that certificate.

Do not commit the `.pfx` or the password. The licence server address in `src/license/config.cjs` must already be your real `https://` hostname; the protected build stops on the placeholder. A local signed build uses the same variables:

```powershell
$env:CSC_LINK = 'C:\secrets\checkprint.pfx'
$env:CSC_KEY_PASSWORD = 'the-certificate-password'
npm run build:protected:signed
```

Buy the certificate from a trusted Windows code-signing authority. A self-signed file does not make the installer trusted. The tag build also sets `CHECKPRINT_ASAR_INTEGRITY=1`. Install that build on a clean Windows PC and confirm it starts before you send it to customers.

## Docker

`docker compose run --build ci` runs lint and tests. Docker is not a Windows printer runtime; Windows builds are produced on the GitHub-hosted Windows runner.

## Safety gate

Do not print real cheques until templates are verified on plain paper and real stock, print offsets are calibrated, and the print flow has passed acceptance testing. Print job submission is not proof of physical printing.
