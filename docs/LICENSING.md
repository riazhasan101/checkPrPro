# Subscription licensing

CheckPrint is sold as a subscription. A computer can run the app only while it is **signed in**, **registered to the customer's account**, and the account has a **paid, unexpired plan**. Payments are confirmed by hand (bKash, Nagad or bank transfer) in an admin panel.

```
 Desktop app (customer PC)                     Licence server (your VPS, https)
 ┌───────────────────────────┐   sign in /      ┌──────────────────────────────┐
 │ licence window  → app     │   refresh        │ Node.js + PostgreSQL         │
 │ main process checks token │ ───────────────▶ │ users, plans, payments,      │
 │ (public key only)         │ ◀─────────────── │ devices, audit log           │
 └───────────────────────────┘  signed token    │ /admin panel (you)           │
                                                └──────────────────────────────┘
```

## How it works
1. The customer creates an account in the app and signs in. The app sends a hashed id of the computer; the server registers it as a **device**.
2. No plan yet: the app shows the plans, the bKash/Nagad/bank details and a form for the **transaction ID**. The payment appears in `/admin` as *pending*.
3. You check the money arrived and press **Confirm**. One month or one year is added (on top of any time left).
4. The customer presses *I have paid, check now*. The server returns a **signed licence token** (Ed25519). The app verifies it with the embedded **public key**.
5. Every 15 minutes (and at start) the app renews the token. The token is valid for at most **7 days offline**; after that the app locks until it reaches the server. When the subscription ends, the app locks at the end date even if offline.
6. Plans decide how many computers: Basic 1, Pro 3, Business 5 (editable in the admin panel). Customers can remove an old computer themselves; you can remove any.

## Set up the server
```bash
cd server
npm install
npm run keygen            # writes licence-private.pem (SECRET) and licence-public.pem
```
* Put the **private** key in `LICENSE_PRIVATE_KEY` inside `server/.env` only. Never commit it, never ship it. `npm run verify-keys` checks that it matches `src/license/pubkey.cjs`.
* The **public** key belongs in `src/license/pubkey.cjs`. Set the server address with `node scripts/set-license-url.cjs https://license.yourdomain.com` (the same hostname as `LICENSE_DOMAIN`). A placeholder blocks `npm run build:protected`.
* From `server/`, fill `.env` and run `docker compose up -d --build`. Caddy in that compose file is the only published service: it terminates HTTPS on ports 80 and 443 and proxies to the API. Point DNS at the VPS first.
* Open `https://license.yourdomain.com/admin`, sign in, then run `npm run seal-admin` and `docker compose up -d`. The server refuses the next start while `ADMIN_PASSWORD` is still set.
* Back up the PostgreSQL volume daily. Losing the private key means re-issuing the app with a new public key.

## Admin dashboard (`https://license.yourdomain.com/admin`)
* **Overview**: requests and payments waiting, subscriptions ending in 7 days, active/expired counts, revenue of the last 30 days.
* **Subscription requests**: customers ask for a plan inside the desktop app after signing in. **Allow** starts the subscription at once (optionally for a custom number of days); **Deny** shows them your reason.
* **Payments**: customers who paid by bKash/Nagad/bank send the transaction ID; compare it with your statement and **Confirm**.
* **Companies**: create and edit companies (contact, phone, address), block a whole company, see its users and their subscriptions.
* **Users**: create users (optionally with free days), change name/phone/company, set a new password, block, add or remove days, end a subscription, remove computers.
* **Plans & prices** and an **Activity log** of every action.

In the desktop app: sign in (or create an account, optionally with a company name), then choose **Ask for approval** or **Pay now**. Once you allow it, the customer presses *Check now* and the app opens. The *Subscription* button in the app shows the plan, the end date and lets them renew.

## Publishing the installer (no code-signing certificate needed)
The server has a public page `https://license.yourdomain.com/download` with a download button, the SHA-256 checksum and a Bengali install guide (including the "Windows protected your PC → More info → Run anyway" step).
1. On the VPS, put the installer in `server/downloads/` (next to `compose.yaml`), named exactly `CheckPrint-<version>-Setup-x64.exe`. The newest version is shown.
2. `docker compose up -d` (the folder is mounted read-only at `/downloads`; only files with that exact name pattern are ever served).
3. Send clients the `/download` link only. Do not send the file over chat.
An unsigned installer works; Windows just shows a warning once. See the signing notes above if you later buy a certificate.

## Daily work in the admin panel
* **Payments waiting**: compare trx ID and amount with your bKash/Nagad/bank statement, then Confirm or Reject (with a reason).
* **Customers**: add or remove days (gifts, refunds), end a subscription, block an account, remove devices.
* **Plans**: change prices and device limits.

## Build the protected installer
```bash
npm install
node scripts/set-license-url.cjs https://license.yourdomain.com
npm run build:protected:signed   # obfuscates src/, then packages and Authenticode-signs the installer
```
The build **stops** if the public key or server address is still a placeholder, or if `CSC_LINK` / `CSC_KEY_PASSWORD` (the Windows code-signing certificate) is missing. See DEPLOYMENT.md. A self-signed file does not make Windows trust the installer.

`scripts/fuses.cjs` turns off Node mode, `--inspect` and loose-folder loading in the packaged app. The asar integrity check is **off by default**; set `CHECKPRINT_ASAR_INTEGRITY=1` for a release build, then install it on a clean Windows PC and confirm it starts before you ship it.

## What this protects, and what it cannot
Protected:
* No account, no plan, expired plan, blocked account: no app. Enforced by the **server** and by a token the customer cannot edit or forge (tampered, foreign-key and copied tokens are rejected in `tests/license.test.cjs`).
* A copied install folder or licence file does not work on another computer: the token and credentials are bound to the machine id, and stored encrypted (Windows DPAPI).
* Sharing one login across many offices hits the plan's device limit.
* Wrong passwords lock the account for 15 minutes; sign-ups, payments and refreshes are rate limited; passwords use scrypt; the admin panel has its own sessions and an audit log.
* The app window can only load the app's own files, cannot open new windows or devtools (packaged), and every data/print channel checks both the sender and a live licence.

Not possible to guarantee:
* **No desktop software is 100 % copy-proof.** Someone with time and skill can patch the program on their own PC. Obfuscation, fuses and code signing make that slow and expensive, and the 7-day token window limits how long a cracked copy keeps working against your server, but they do not make it impossible.
* A customer can still print cheques for as long as the paid period and offline window last, and can copy their own cheque data.
* Real protection against cracked copies comes from moving valuable logic to the server. A good next step: keep the bank layouts and cheque images on the server and deliver them only to licensed devices.

## Tests
```bash
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/testdb npm --prefix server test
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/testdb npm test
```
The database is wiped on every run: use a throwaway one.
