# CheckPrint 1.3.1 — setup and overlay layout repair

- Setup is now a dedicated layout column outside the content container. It does not sit beneath navigation or the account menu.
- On wide screens content reflows alongside setup; at 1100px and below setup uses the content area as its own page while the navigation rail remains available.
- Setup has a fixed header and an independently scrolling body. Opening Printer setup or Cheque setup positions the selected section below the header.
- Profile, history and reprint dialogs are body-level viewport overlays above navigation. They are height-limited and scroll on smaller displays.
- Account menu closes before opening setup or history. Escape closes the active dialog/menu/setup. Dialogs prevent keyboard focus reaching background content and restore focus on close.
- Corrected displayed app version and OS-neutral printer instructions.

Verification: Electron renderer checks at content widths 1440, 1200, 1024, 800 and 480 pixels, each with sidebar collapsed and expanded (10 scenarios). Checks cover setup/content/menu boundaries, printer section visibility, horizontal overflow, profile/history/reprint layers, background keyboard focus, and Escape handling. Screenshots were captured and visually inspected at 1440 and 480 pixels. Test uses a separate temporary profile, not customer data, and does not print.

Run npm run test:ui on Windows/macOS or xvfb-run -a npm run test:ui on a Linux CI host. The platform build workflow now runs this UI regression test before packaging.

Install the 1.3.1 package to receive these fixes; older installed apps will not change automatically. Export a backup and close the previous app before upgrading. Signing and physical-printer verification limitations from the cross-platform guide still apply.
