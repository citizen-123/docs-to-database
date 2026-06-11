// infer.js — spreadsheet analysis. Pure functions, no DOM, no SheetJS:
// callers hand in plain arrays-of-arrays so this whole module is testable in node.

const SAMPLE_LIMIT = 2000;   // rows sampled per column for type/choice analysis
const CHOICE_MAX_DISTINCT = 12;
const CHOICE_MIN_ROWS = 15;

// ── per-column analysis ─────────────────────────────────────────
// "NOVEMBER, 2025", "Nov 2025", "January 5, 2026" — month-name dates that the
// slash/dash rule below misses.
const MONTH_DATE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{1,2}(st|nd|rd|th)?,?\s+)?\d{2,4}$/i;

export function inferType(values) {
  // values: non-empty samples (strings or native types from SheetJS)
  let dates = 0, numbers = 0, currency = 0, yesno = 0;
  const n = values.length;
  if (!n) return "text";
  for (const v of values) {
    if (v instanceof Date) { dates++; continue; }
    const s = String(v).trim();
    if (/^(y|n|yes|no|true|false|x|✓)$/i.test(s)) { yesno++; continue; }
    if (/^[$€£]\s?-?[\d,]+(\.\d+)?$/.test(s) || /^-?[\d,]+\.\d{2}$/.test(s)) { currency++; continue; }
    if (s !== "" && !isNaN(Number(s.replace(/,/g, "")))) { numbers++; continue; }
    if (MONTH_DATE.test(s)) { dates++; continue; }
    if (!isNaN(Date.parse(s)) && /[\/\-]/.test(s) && /\d/.test(s)) { dates++; continue; }
  }
  const dominant = (count) => count / n >= 0.85;
  if (dominant(dates)) return "date";
  if (dominant(yesno)) return "yes-no";
  if (dominant(currency)) return "money";
  if (dominant(numbers + currency)) return "number";
  return "text";
}

export function fillLabel(fillRate) {
  if (fillRate >= 0.98) return "always";
  if (fillRate >= 0.7) return "usually";
  return "rarely";
}

// ── header-row detection ────────────────────────────────────────
const isFilled = (c) => c != null && String(c).trim() !== "";

// Report-style exports (billing statements, system reports) put a title block
// above the real header: a merged title cell, account lines, dates, blank
// spacers. Score each row near the top on how header-like it is — wide, all
// words, no repeats, data underneath — and pick the best. A small earliness
// bonus means plain sheets with headers in row 1 are untouched.
export function detectHeaderRow(rows, scanLimit = 25) {
  const limit = Math.min(rows.length, scanLimit);
  let best = 0, bestScore = -Infinity;
  for (let i = 0; i < limit; i++) {
    const cells = rows[i].filter(isFilled);
    if (!cells.length) continue;
    const textish = cells.filter(
      (c) => typeof c === "string" && isNaN(Number(String(c).trim().replace(/,/g, "")))
    ).length;
    const distinct = new Set(cells.map((c) => String(c).trim().toLowerCase())).size;
    let j = i + 1;
    while (j < rows.length && !rows[j].some(isFilled)) j++;
    const below = j < rows.length ? rows[j].filter(isFilled).length : 0;
    const score =
      cells.length * 2 +                      // headers span the sheet's width
      textish +                               // headers are words, not values
      (distinct === cells.length ? 2 : 0) +   // labels don't repeat
      Math.min(below, cells.length) -         // data sits underneath
      i * 0.5;                                // near-ties go to the earlier row
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

// ── per-sheet analysis ──────────────────────────────────────────
// rows: array of arrays; header row is detected (reports bury it under a
// title block), blank rows are dropped, and trailing total/footer lines —
// rows much emptier than the typical data row — are trimmed off.
export function analyzeSheet(sheetName, rows) {
  if (!rows || !rows.length) {
    return { sheetName, headerRowIndex: 0, headerRow: [], rowCount: 0, columns: [], repeatedGroups: [], statusColumns: [] };
  }
  const headerRowIndex = detectHeaderRow(rows);
  const headerRow = rows[headerRowIndex].map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  const body = rows.slice(headerRowIndex + 1).filter((r) => r.some(isFilled));
  const fills = body.map((r) => r.filter(isFilled).length).sort((a, b) => a - b);
  const medianFill = fills.length ? fills[Math.floor(fills.length / 2)] : 0;
  while (body.length && body[body.length - 1].filter(isFilled).length < Math.max(2, medianFill / 2)) {
    body.pop();
  }
  const sample = body.length > SAMPLE_LIMIT ? body.slice(0, SAMPLE_LIMIT) : body;

  const columns = headerRow.map((name, ci) => {
    const raw = sample.map((r) => r[ci]).filter((v) => v != null && String(v).trim() !== "");
    const fillRate = sample.length ? raw.length / sample.length : 0;
    const distinct = new Map();
    for (const v of raw) {
      const key = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim();
      distinct.set(key, (distinct.get(key) || 0) + 1);
    }
    let type = inferType(raw);
    // Header hint: "Member Rate($)" and "Dependent Rate($)" should land on the
    // same type even when one column's values (16.5, 0) miss the strict
    // two-decimal currency pattern.
    if (type === "number" && /[$€£]|\b(rate|price|amount|cost|total|fee|charge|paid|balance)\b/i.test(name)) {
      type = "money";
    }
    const isChoice =
      type === "text" &&
      raw.length >= CHOICE_MIN_ROWS &&
      distinct.size > 1 &&
      distinct.size <= CHOICE_MAX_DISTINCT &&
      distinct.size / raw.length <= 0.5;
    const examples = [...distinct.keys()].slice(0, 3);
    return {
      name,
      index: ci,
      fillRate,
      fillLabel: fillLabel(fillRate),
      type: isChoice ? "choice" : type,
      isChoice,
      distinctCount: distinct.size,
      distinctValues: isChoice ? [...distinct.keys()] : null,
      example: examples[0] ?? "",
      nonEmpty: raw.length,
      // distinct value set for cross-sheet work (cap to keep memory sane)
      _values: new Set([...distinct.keys()].slice(0, 5000)),
    };
  });

  return {
    sheetName,
    headerRowIndex,
    headerRow,
    rowCount: body.length,
    columns,
    repeatedGroups: findRepeatedGroups(headerRow),
    statusColumns: columns.filter((c) => c.isChoice),
  };
}

// "Item 1, Item 2, Item 3" / "Phone1, Phone2" → grouped
export function findRepeatedGroups(headers) {
  const groups = new Map();
  for (const h of headers) {
    const m = String(h).trim().match(/^(.*?)[\s_#-]*(\d+)$/);
    if (!m || !m[1].trim()) continue;
    const base = m[1].trim().toLowerCase();
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(h);
  }
  return [...groups.entries()]
    .filter(([, cols]) => cols.length >= 2)
    .map(([base, cols]) => ({ base, columns: cols }));
}

// ── cross-sheet relationship suggestions ────────────────────────
// For each text column A in one sheet and key-like column B in another sheet:
// if A's values ⊆ B's values, suggest "many A-sheet rows point at one B-sheet row".
export function suggestRelationships(analyses) {
  const suggestions = [];
  for (const src of analyses) {
    for (const dst of analyses) {
      if (src === dst) continue;
      for (const b of dst.columns) {
        // B must look like an identifier: mostly unique, well filled
        if (b.nonEmpty < 5) continue;
        const uniqueness = b.distinctCount / b.nonEmpty;
        if (uniqueness < 0.95 || b.fillRate < 0.9) continue;
        for (const a of src.columns) {
          if (a.nonEmpty < 5 || a._values.size < 3) continue;
          if (a === b) continue;
          // identity guard: same-named sheet + same-named column is a
          // re-upload or mirror, not a relationship
          if (src.sheetName === dst.sheetName && a.name === b.name) continue;
          let contained = 0;
          for (const v of a._values) if (b._values.has(v)) contained++;
          const coverage = contained / a._values.size;
          if (coverage < 0.95) continue;
          const aHasDuplicates = a.distinctCount < a.nonEmpty;
          suggestions.push({
            fromSheet: src.sheetName,
            fromColumn: a.name,
            toSheet: dst.sheetName,
            toColumn: b.name,
            coverage,
            cardinality: aHasDuplicates ? "many-to-one" : "one-to-one(?)",
            sentence:
              `Values in \u201C${src.sheetName}\u201D column \u201C${a.name}\u201D match \u201C${dst.sheetName}\u201D column \u201C${b.name}\u201D — ` +
              (aHasDuplicates
                ? `many ${src.sheetName} rows can share one ${dst.sheetName} row`
                : `each ${src.sheetName} row matches at most one ${dst.sheetName} row`),
          });
        }
      }
    }
  }
  // de-dupe mirrored/self-evident pairs, keep highest coverage per from-column
  const best = new Map();
  for (const s of suggestions) {
    const key = `${s.fromSheet}::${s.fromColumn}`;
    if (!best.has(key) || best.get(key).coverage < s.coverage) best.set(key, s);
  }
  return [...best.values()];
}

// Same column name in 2+ sheets → duplication flag
export function findDuplicatedColumns(analyses) {
  const seen = new Map();
  for (const a of analyses) {
    for (const c of a.columns) {
      const key = c.name.trim().toLowerCase();
      if (!key || key.startsWith("column ")) continue;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(a.sheetName);
    }
  }
  return [...seen.entries()]
    .filter(([, sheets]) => new Set(sheets).size >= 2)
    .map(([col, sheets]) => ({ column: col, sheets: [...new Set(sheets)] }));
}

// ── shape the analysis into worksheet prefills ──────────────────
// Returns { auditPrefill, auditSuggestedPaths } for one sheet → one Spreadsheet Audit instance.
export function buildAuditPrefill(analysis, fileName, tabNames) {
  const columnsRows = analysis.columns.map((c) => ({
    col: c.name,
    meaning: "", // semantic — always left for the human
    example: String(c.example ?? ""),
    describes: "",
    filled: c.fillLabel,
  }));

  const statusText = analysis.statusColumns
    .map((c) => `${c.name}: ${c.distinctValues.join(", ")}`)
    .join("\n");

  const repeatedText = analysis.repeatedGroups
    .map((g) => `${g.columns.join(", ")} — what happens when you need a ${g.columns.length + 1}th?`)
    .join("\n");

  const prefill = {
    name: fileName ? `${fileName}${analysis.sheetName && tabNames?.length > 1 ? ` — tab \u201C${analysis.sheetName}\u201D` : ""}` : analysis.sheetName,
    rowCount: String(analysis.rowCount),
    tabs: tabNames && tabNames.length > 1 ? tabNames.join(", ") : "",
    columns: columnsRows,
    statusValues: statusText,
    repeatedGroups: repeatedText,
  };

  const suggestedPaths = [];
  if (prefill.name) suggestedPaths.push("name");
  suggestedPaths.push("rowCount");
  if (prefill.tabs) suggestedPaths.push("tabs");
  if (statusText) suggestedPaths.push("statusValues");
  if (repeatedText) suggestedPaths.push("repeatedGroups");
  columnsRows.forEach((row, i) => {
    suggestedPaths.push(`columns.${i}.col`, `columns.${i}.example`, `columns.${i}.filled`);
  });

  return { prefill, suggestedPaths };
}
