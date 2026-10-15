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

This triggers an unsigned GitHub release installer. For production distribution, configure Windows Authenticode code signing, protected environments, branch protections, reviewed dependency updates, and signed artifacts. Add `npm audit` and dependency/license review as required release gates.

## Docker

`docker compose run --build ci` runs lint and tests. Docker is not a Windows printer runtime; Windows builds are produced on the GitHub-hosted Windows runner.

## Safety gate

Do not print real cheques until templates are verified on plain paper and real stock, print offsets are calibrated, and the print flow has passed acceptance testing. Print job submission is not proof of physical printing.
