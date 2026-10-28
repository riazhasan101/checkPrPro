# CheckPrint 1.3.0 — Windows, Linux and macOS

One application source, separate native packages. Includes beneficiaries and the new expanding sidebar.

| Computer | Package | Build command on the native OS |
| --- | --- | --- |
| Windows 10/11 Intel/AMD 64-bit | Setup-x64.exe | npm run build:protected -- --config.win.signAndEditExecutable=false |
| Linux Intel/AMD 64-bit | Linux-x64.AppImage and Linux-x64.deb | npm run build:linux:protected |
| MacBook Intel | macOS-x64.dmg / .zip | npm run build:mac:protected |
| MacBook Apple Silicon | macOS-arm64.dmg / .zip | npm run build:mac:protected |

Linux ARM, Windows ARM and 32-bit packages are not included. macOS build generates both architectures; use the file matching the Mac's About This Mac screen. Linux DEB targets Debian/Ubuntu-based distributions; AppImage may require the distribution's FUSE runtime.

## Install

Windows: close the app and run the setup executable. Linux: install the DEB with the OS package manager or mark the AppImage executable and run it. macOS: open the matching DMG and drag CheckPrint into Applications. Customer macOS distribution requires Apple Developer ID signing and notarization; do not disable Gatekeeper. Artifact builds are for testing, not notarized customer releases.

Install the OS-supported printer driver first. Select and bind a printer independently on each OS. Verify cheque paper size, scaling and offsets on plain paper before using real cheques; driver behavior differs across OSes. Each computer uses its own device licence and counts toward the subscription device limit. App data stays local; to move beneficiaries and settings export a current backup and restore it on the other computer. Printer bindings must then be reselected. Encrypted licence files cannot be transferred between computers. Automatic cross-device sync is not included.

## Build and CI

Use Node.js 22 and npm ci. Build output is separated into dist/win, dist/linux and dist/mac. The protected app source is generated into build-app. Run builds sequentially when sharing a checkout because protection recreates that directory.

The workflow .github/workflows/platform-builds.yml can be run from GitHub Actions using Run workflow. It runs all desktop and server tests against isolated PostgreSQL, then builds on native Windows, Linux and macOS runners. Outputs are downloadable Actions artifacts, not publicly published releases. Fork PRs use no signing secrets.

The release.yml tag workflow retains required Windows signing and adds Linux packages and signed/notarized macOS packages. Windows needs WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD. macOS needs MAC_CSC_LINK (Developer ID Application certificate), MAC_CSC_KEY_PASSWORD, APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID. Without these the corresponding signed release fails; test artifacts are not a substitute for signed release packages.

On a Windows Docker host, Linux packages can also be built using the official electronuserland/builder:20 image and scripts/build-linux-docker.sh, mounting the project read-only at /source and a writable output directory at /output. This builds in a fresh Linux workspace and keeps Windows node_modules separate.

## Verification limits

A successful installer build does not certify physical printing, clean-machine install behavior or live production licensing on all OSes. These require acceptance checks on each target machine. See the delivery BUILD-STATUS.md for actual artifact results.
