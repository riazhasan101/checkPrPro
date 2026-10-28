# CheckPrint 1.3.2 — remove blank PDF/print pages

The print stylesheet left the hidden application shell in normal document flow with a viewport-sized minimum height. This produced an empty first page before the cheque output. A forced break after every cheque was also replaced with breaks only between cheques.

Print now hides all body-level UI except printRoot, resets page margin/padding/minimum height, and isolates the physical cheque sheets from screen layout. Cheque coordinates and paper dimensions are unchanged.

Reproduced before repair: one cheque generated 2 PDF pages (first blank); three cheques generated 4 pages (first blank).
After repair: 1 cheque = 1 page, 3 cheques = 3 pages, alignment test = 1 page, including when setup is open and when exporting on A4 paper. Electron regression tests cover 6 print scenarios; pypdf independently confirmed page counts and nonempty page text. A rendered PDF page was visually inspected.

Run npm run test:print. This creates test PDFs using a separate temporary profile and sends nothing to a physical printer. The native platform workflow runs print pagination checks alongside UI layout tests before building installers.

Upgrade to 1.3.2 to receive the fix. Previously saved PDFs are not changed. Print-driver paper/scaling and physical cheque calibration still require testing on the target printer.
