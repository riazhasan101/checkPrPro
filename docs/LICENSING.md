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
* Put the **private** key in `LICENSE_PRIVATE_KEY` on the server only. Never commit it, never ship it.
* Paste the **public** key into `src/license/pubkey.cjs` and your server address (https) into `src/license/config.cjs`.
* Copy `.env.example` to `.env`, fill it, then `docker compose up -d --build`. Put a TLS proxy (for example Caddy: `license.yourdomain.com { reverse_proxy 127.0.0.1:8080 }`) in front.
* Open `https://license.yourdomain.com/admin`, sign in with `ADMIN_EMAIL`, then remove `ADMIN_PASSWORD` from `.env` and restart.
* Back up the PostgreSQL volume daily. Losing the private key means re-issuing the app with a new public key.

## Daily work in the admin panel
* **Payments waiting**: compare trx ID and amount with your bKash/Nagad/bank statement, then Confirm or Reject (with a reason).
* **Customers**: add or remove days (gifts, refunds), end a subscription, block an account, remove devices.
* **Plans**: change prices and device limits.

## Build the protected installer
```bash
npm install
npm run build:protected   # obfuscates src/, then packages build-app/ with electron-builder
```
The build **stops** if the public key or server address is still a placeholder. Sign the installer (see DEPLOYMENT.md): unsigned installers show a scary warning and are easier to tamper with.

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
