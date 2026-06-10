# docs-to-database

A self-guided **database discovery packet** for small businesses moving from
spreadsheets and email to a real database.

Before anyone designs tables, someone has to answer the unglamorous questions:
what things does this business actually track, what does each column *mean*,
what do the cell colors mean, which values appear in the Status column
(typos included), and how does everything connect. This site walks a
non-technical business owner through exactly those questions and produces a
packet a developer or DBA can design a schema from.

**No backend. No accounts. No data leaves the browser.** The whole thing is
static files — host it on GitHub Pages for free.

## What's in it

Five worksheets, filled out in the browser:

1. **Noun Harvest** — list every "thing" the business tracks
2. **Spreadsheet Audit** — document each existing spreadsheet, column by column (one copy per spreadsheet)
3. **Entity Worksheet** — the life story of each thing: birth, statuses, lookups, death, history (one copy per thing)
4. **Relationships** — how things connect, with one-or-many in both directions
5. **Data Dictionary** — every field, its type, its valid values, its rules (one copy per thing)

Plus:

- **Spreadsheet import** — upload the `.xlsx` / `.xls` / `.csv` files the business
  actually runs on, and the boring parts get prefilled:
  - one Spreadsheet Audit per tab: column inventory, example values, fill rates
    ("always / usually / rarely"), row counts
  - inferred column types (date / money / number / yes-no / choice / text)
  - status-like columns detected, with **every distinct value captured verbatim,
    typos included**
  - repeated column groups flagged (`Item 1, Item 2, Item 3…`)
  - a seeded Data Dictionary table per tab
  - **cross-sheet relationship suggestions**: when values in one sheet's column
    are a subset of a key-like column in another sheet, a suggested row is added
    to Worksheet 4 with guessed cardinality
  - columns duplicated across sheets flagged ("which copy wins?")

  Public/link-shared Google Sheets can be imported by URL; private ones via
  File → Download → `.xlsx`.

- **Suggested-value review** — everything machine-filled renders amber with a ✓
  button. A human must confirm or correct it. Semantic questions (what a column
  *means*, what colors mean, what lives only in email) are deliberately left
  blank: that knowledge is the entire point of the exercise, and a form that
  looks "done" gets skimmed. Exports warn if suggestions were never reviewed.

- **Save / resume** — answers autosave to the browser (`localStorage`), and
  **Save progress** downloads a `.json` file that **Load progress** re-imports
  later or on a different machine.

- **Exports** — Markdown, Word (`.docx`), and PDF (via the browser's print
  dialog, which beats any in-browser PDF library). **Print blank packet**
  produces empty ruled worksheets for the pen-and-paper crowd.

- **`templates/`** — the original Markdown worksheets, for people who'd rather
  skip the site entirely and fill things out manually.

## How it's built

```
index.html          app shell, toolbar, CDN script tags
css/style.css       screen styles
css/print.css       print styles (PDF export + blank packet)
js/schema.js        the entire packet as data — single source of truth
js/state.js         state, autosave, JSON save/load, suggestion flags
js/render.js        schema-driven form renderer
js/infer.js         spreadsheet analysis (pure functions, no DOM)
js/importer.js      file upload → SheetJS → inference → prefilled state
js/export-md.js     Markdown export (mirrored by the .docx walk)
js/export-docx.js   Word export
js/export-pdf.js    print report + blank printable packet
js/app.js           bootstrap and wiring
templates/          original manual Markdown worksheets
test/test.mjs       node test suite for the DOM-free core
```

Worksheet content lives only in `schema.js`; the renderer and all three
exporters walk that structure. Adding a question to a worksheet is a one-line
schema change.

The inference engine (`infer.js`) is deliberately conservative: a relationship
is only suggested when the source column's values are ≥95 % contained in a
target column that is ≥95 % unique and ≥90 % filled; choice columns require
≥15 rows and ≤12 distinct values. Wrong silent prefills poison the packet, so
anything uncertain stays a visible amber suggestion or stays blank.

## Testing

```
node test/test.mjs
```

33 tests cover schema integrity, header-row detection in report-style exports, type/choice/fill inference, repeated-group and
cross-sheet relationship detection, the prefill pipeline, suggestion-flag
lifecycle (including row-removal reindexing), JSON round-tripping and
migration of old saves, and Markdown export. The repo was additionally
validated end-to-end in headless Chromium: real `.xlsx` upload through the file
input, amber-suggestion confirm flow, all three exports, JSON restore, and the
print views, with zero console errors.

## License

MIT
