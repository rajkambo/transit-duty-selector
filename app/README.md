# Transit Duty Selector

A 100% in-browser web app that helps senior bus operators pick their preferred
duty by joining driver **Signup Reference** PDFs with the corresponding **Block
Report** PDFs. Everything happens client-side — no PDFs ever leave your
device. Built to be hostable on GitHub Pages.

## Features

- Drag-and-drop upload of any number of Signup Reference and Block Report
  PDFs (weekday + Saturday + Sunday all supported).
- Client-side PDF text extraction with `pdfjs-dist` and regex-based parsing.
- Joins driver pieces with bus blocks, computes layovers / deadheads /
  unpaid split breaks.
- Filter sidebar:
  - Days I want OFF (Mon–Sun)
  - Shift type (Straight / Split / CWW / Other)
  - Earliest start, latest end (15-minute granularity)
  - Minimum paid hours
  - Minimum bonus pay (paid time minus working time)
  - Maximum deadhead time
  - Same-depot toggle, single-route toggle
  - Free-text search (route, depot, roster #)
- Duty cards with high-contrast layout, large numerals, and an expand /
  collapse for full trip and layover details.
- Visual Gantt-style timeline (driving / deadhead / layover / unpaid split
  break) with a legend.
- Bonus Pay badge highlighting paid > working differentials.
- Save-for-later list with `localStorage` persistence, copy-to-clipboard, and
  a print-friendly view.

## Tech stack

- **Vite** + **React 19** for fast iteration and a tiny static bundle
- **Tailwind CSS v4** (via `@tailwindcss/vite`) for accessible, high-contrast
  styling
- **pdfjs-dist** for browser-side PDF text extraction

## Getting started

```bash
cd app
npm install
npm run dev          # http://localhost:5173
```

Then drop in your Signup Reference and Block Report PDFs.

## Smoke-testing the parsers offline

A helper script runs the same parsing pipeline used in the browser against
the sample PDFs that live in the repo root:

```bash
node scripts/smoke.mjs
```

It prints duty/block counts and a few sample duties with their joined
metrics so you can sanity-check parser changes.

## Deploying to GitHub Pages

```bash
npm run build
# Then push the `dist/` folder to a `gh-pages` branch (or use a
# GitHub Pages action). The Vite config sets `base: './'` so assets resolve
# correctly from any path on Pages.
```

## Project layout

```
src/
  App.jsx                       Master state & layout
  components/
    FileUploader.jsx            Drag-and-drop + parsing entry point
    FilterSidebar.jsx           All filters + sliders + search
    DutyList.jsx                Sortable list of DutyCards
    DutyCard.jsx                Per-duty card with bonus badge
    VisualTimeline.jsx          Gantt-style colored timeline
    SavedDuties.jsx             "My Choices" saved/print view
  utils/
    pdfText.js                  pdfjs-dist text extraction
    parseSignup.js              Driver signup PDF -> duties[]
    parseBlocks.js              Block report PDF -> blocks[]
    joinData.js                 Merge + compute layovers / deadheads
    timeUtils.js                Time / duration helpers
scripts/
  smoke.mjs                     Headless parser smoke test
```

## Limitations & notes

- PDF parsing relies on regular expressions plus token heuristics, which
  works well for the canonical CMBC-style schedule PDFs but may need tweaks
  if the upstream report format changes.
- The app does not attempt to perfectly classify every block-report row as
  "driving" vs "deadhead" — it uses the trip's `Line` and `Dhd` columns and
  treats trips with no public-facing line as deadheads.
- For multi-day duties (CWW), `Paid time` and `Working time` fields are
  weekly totals as printed in the PDF; the timeline shows a single
  representative day's pieces.
