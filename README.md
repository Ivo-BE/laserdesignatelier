# Laser Design Atelier

Webapp om lasercut-bestanden te ontwerpen: tekst, vormen, foto's en logo's naar vector, samensmelten, contouren, sjablonen, doosjes, namenlijsten. Export voor LightBurn (.lbrn2 met lagen en volgorde), xTool, Glowforge, Epilog/Trotec (PDF), RDWorks/EZCAD (DXF) en LaserGRBL.

Product van TripleSpark, verkocht via **Sparkgate** (jaarlicentie, 14 dagen proef).

## Opbouw
- `src/editor.html` – de volledige editor (UI, gereedschap, export).
- `src/core.js` – exportkern zonder browser-API's: SVG, LightBurn (.lbrn2), DXF, PDF, tijdschatting. Ook bruikbaar in Node (`scripts/testkaart.mjs`).
- `fonts/` – ingebedde lettertypes (DejaVu, Poppins, schrijf- en sjabloonletters; allemaal OFL of vrije licentie).
- `build.mjs` – bouwt:
  - `dist/index.html` – verkoopversie (Vercel), met licentie via Sparkgate;
  - `build/claude-viewer.html` – prototype voor de Claude-viewer (geen licentie, opslag via de viewer).
- `public/` – icoon en manifest.

## Licentie (Sparkgate)
- App-sleutel: `laser-design-atelier`; product-slug: `laser-design-atelier`.
- Inloggen met e-maillink op het Sparkgate-Supabaseproject (`gmxdaheqqvhwrjdavvqe`), daarna `check-license` en `start-trial` (14 dagen).
- Gratis: ontwerpen, preview, tijd en kosten, projectbestand (.json) bewaren. Met licentie of proef: exportbestanden downloaden.
- De laatst bekende licentie staat in `localStorage` (`lda:lic`); offline blijft de app werken tot `valid_until`.
- Kopen: `https://www.sparkgate.be/kopen/laser-design-atelier`, beheren: `https://www.sparkgate.be/mijn?brand=laser-design-atelier`.

## Ontwerpen bewaren
In de browser (IndexedDB `laser-design-atelier`), automatisch. Gebruikers kunnen een ontwerp ook als `.json` bewaren en weer openen.

## Deploy (Vercel)
1. Vercel → Add New Project → deze repo. Framework: Other. `vercel.json` regelt build (`node build.mjs`) en output (`dist`).
2. Domein `app.laserdesignatelier.be` toevoegen (CNAME naar `cname.vercel-dns.com`).
3. Supabase (Sparkgate) → Authentication → URL Configuration → Redirect URLs: `https://app.laserdesignatelier.be/**` toevoegen.

## Bibliotheken (CDN)
opentype.js (MIT), JSZip (MIT/GPLv3 dual, MIT gekozen), paper.js (MIT), clipper-lib (Boost), imagetracerjs (Unlicense), supabase-js (MIT). Geen GPL-code.
