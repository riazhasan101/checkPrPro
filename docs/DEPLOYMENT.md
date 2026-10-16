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

A tag build signs the installer when both GitHub Actions secrets are set:

- `WIN_CSC_LINK`: base64 text of the Authenticode `.pfx`, or a path the runner can read. Prefer base64 so the file is not stored in the repository.
- `WIN_CSC_KEY_PASSWORD`: password for that certificate.

Do not commit the `.pfx` or the password. Without those secrets the tag build still produces an unsigned installer and says so in the log. A local signed build uses the same variables:

```powershell
$env:CSC_LINK = 'C:\secrets\checkprint.pfx'
$env:CSC_KEY_PASSWORD = 'the-certificate-password'
npm run build:win:signed
```

For production distribution, also configure protected environments, branch protections, reviewed dependency updates, and signed artifacts. Add `npm audit` and dependency/license review as required release gates. The certificate must come from a trusted Windows code-signing authority. A self-signed file does not make the installer trusted.

## Docker

`docker compose run --build ci` runs lint and tests. Docker is not a Windows printer runtime; Windows builds are produced on the GitHub-hosted Windows runner.

## Safety gate

Do not print real cheques until templates are verified on plain paper and real stock, print offsets are calibrated, and the print flow has passed acceptance testing. Print job submission is not proof of physical printing.
