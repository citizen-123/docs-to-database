// importer.js — file upload → SheetJS parse → inference → state prefills.
// Expects the SheetJS global `XLSX` (loaded from CDN in index.html).

import { analyzeSheet, suggestRelationships, findDuplicatedColumns, buildAuditPrefill } from "./infer.js";
import { state, addInstance, removeInstance, addRow, removeRow, getPath, setPath, isSuggested } from "./state.js";
import { getWorksheet } from "./schema.js";

// ── re-import-safe state writes ─────────────────────────────────
// Uploading the same file twice must refresh the previous import, not stack
// duplicate audits, Part B rows, and dictionaries. A value is ours to
// overwrite only while the human hasn't touched it: still flagged as a
// suggestion, or empty.
const blank = (v) => String(v ?? "").trim() === "";
const overwritable = (path) => isSuggested(path) || blank(getPath(path));

const AUDIT_TABLE = { key: "columns", machine: ["col", "example", "filled"], human: ["meaning", "describes"] };
const DD_TABLE = { key: "fields", machine: ["field", "example", "required", "type", "choices"], human: ["meaning", "whoSets"] };

function tableUntouched(tablePath, table) {
  const rows = getPath(tablePath) || [];
  return rows.every((row, i) =>
    table.machine.every((c) => blank(row[c]) || isSuggested(`${tablePath}.${i}.${c}`)) &&
    table.human.every((c) => blank(row[c]))
  );
}

function replaceTable(tablePath, rows, table) {
  for (const k of Object.keys(state.suggested)) {
    if (k.startsWith(`${tablePath}.`)) delete state.suggested[k];
  }
  rows.forEach((row, i) => {
    for (const c of table.machine) {
      if (!blank(row[c])) state.suggested[`${tablePath}.${i}.${c}`] = true;
    }
  });
  setPath(tablePath, rows);
}

function instanceUntouched(wsId, inst, table) {
  const base = `${wsId}.${inst._id}`;
  return Object.keys(inst).every(
    (k) => k === "_id" || k === table.key || overwritable(`${base}.${k}`)
  ) && tableUntouched(`${base}.${table.key}`, table);
}

// Add the instance, or — when one with the same matchField already exists —
// refresh its untouched fields in place. Returns true when it refreshed.
function upsertInstance(wsId, ws, prefill, suggestedPaths, matchField, table) {
  const matches = state.data[wsId].filter((i) => i[matchField] === prefill[matchField]);
  if (!matches.length) {
    addInstance(wsId, ws, prefill, suggestedPaths);
    return false;
  }
  const base = `${wsId}.${matches[0]._id}`;
  for (const [key, value] of Object.entries(prefill)) {
    if (key === matchField || key === table.key) continue;
    const path = `${base}.${key}`;
    if (overwritable(path)) setPath(path, value, { suggested: !blank(value) });
  }
  if (tableUntouched(`${base}.${table.key}`, table)) {
    replaceTable(`${base}.${table.key}`, prefill[table.key], table);
  }
  // stale copies stacked up by earlier imports — safe to drop while untouched
  for (const dup of matches.slice(1)) {
    if (instanceUntouched(wsId, dup, table)) removeInstance(wsId, dup._id);
  }
  return true;
}

function upsertSheetRow(sheetName) {
  const rows = getPath("nounHarvest.sheetRows") || [];
  const firstIdx = rows.findIndex((r) => r.sheet === sheetName);
  if (firstIdx === -1) {
    addRow("nounHarvest.sheetRows", { sheet: sheetName, rowIs: "" }, { suggested: true });
    return;
  }
  // drop duplicate rows for this sheet that the human never filled in
  for (let i = rows.length - 1; i > firstIdx; i--) {
    if (rows[i].sheet === sheetName && blank(rows[i].rowIs)) removeRow("nounHarvest.sheetRows", i);
  }
}

// Accumulated analyses across all uploads this session, keyed by file+tab so a
// re-upload refreshes its analysis instead of duplicating it. Relationship
// suggestions improve as more sheets arrive.
const sessionAnalyses = new Map();

export async function importSpreadsheetFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  return importWorkbook(wb, file.name);
}

// Public/link-shared Google Sheet by URL (no auth; export endpoint).
export async function importGoogleSheetUrl(url) {
  const m = String(url).match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (!m) throw new Error("That doesn\u2019t look like a Google Sheets link.");
  const exportUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`;
  let resp;
  try {
    resp = await fetch(exportUrl);
  } catch {
    throw new Error("Couldn\u2019t reach Google Sheets. If the sheet is private, use File \u2192 Download \u2192 Microsoft Excel (.xlsx) and upload the file instead.");
  }
  if (!resp.ok) {
    throw new Error("Google wouldn\u2019t hand the sheet over — it\u2019s probably not link-shared. Use File \u2192 Download \u2192 Microsoft Excel (.xlsx) and upload the file instead.");
  }
  const buf = await resp.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  return importWorkbook(wb, "Google Sheet");
}

export function importWorkbook(wb, fileName) {
  const tabNames = wb.SheetNames;
  const report = { fileName, tabs: [], relationships: [], duplicates: [], colorNote: false };

  for (const tab of tabNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[tab], { header: 1, defval: null });
    if (!rows.length || rows.every((r) => r.every((c) => c == null))) continue; // skip empty tabs
    const analysis = analyzeSheet(tab, rows);
    sessionAnalyses.set(`${fileName}::${tab}`, analysis);

    // 1) Spreadsheet Audit instance, prefilled — or refreshed on re-upload
    const auditWs = getWorksheet("spreadsheetAudits");
    const { prefill, suggestedPaths } = buildAuditPrefill(analysis, fileName, tabNames);
    const refreshed = upsertInstance("spreadsheetAudits", auditWs, prefill, suggestedPaths, "name", AUDIT_TABLE);

    // 2) Seed Worksheet 1 Part B (sheet → "one row = one ...?") — once per sheet
    upsertSheetRow(prefill.name);

    // 3) Seed a Data Dictionary table for this sheet
    const ddWs = getWorksheet("dataDictionary");
    const ddRows = analysis.columns.map((c) => ({
      field: c.name,
      meaning: "",
      example: String(c.example ?? ""),
      required: c.fillLabel === "always" ? "yes" : c.fillLabel === "usually" ? "eventually" : "no",
      type: c.type,
      choices: c.isChoice ? c.distinctValues.join(", ") : "",
      whoSets: "",
    }));
    const ddSuggested = ["entityName"];
    ddRows.forEach((_, i) =>
      ddSuggested.push(`fields.${i}.field`, `fields.${i}.example`, `fields.${i}.required`, `fields.${i}.type`, `fields.${i}.choices`)
    );
    upsertInstance("dataDictionary", ddWs, { entityName: prefill.name, fields: ddRows }, ddSuggested, "entityName", DD_TABLE);

    report.tabs.push({
      name: tab,
      rowCount: analysis.rowCount,
      skippedRows: analysis.headerRowIndex,
      refreshed,
      columnCount: analysis.columns.length,
      statusColumns: analysis.statusColumns.map((c) => c.name),
      repeatedGroups: analysis.repeatedGroups,
    });
  }

  // 4) Cross-sheet inference over everything uploaded so far
  const rels = suggestRelationships([...sessionAnalyses.values()]);
  const existing = getPath("relationships.pairs") || [];
  for (const r of rels) {
    const a = r.toSheet, b = r.fromSheet; // "one" side first reads better
    const already = existing.some((row) => row.sentence === r.sentence);
    if (already) continue;
    addRow(
      "relationships.pairs",
      {
        a, b,
        aHasB: r.cardinality === "many-to-one" ? "many" : "one",
        bHasA: "one",
        sentence: r.sentence,
      },
      { suggested: true }
    );
    report.relationships.push(r);
  }

  // 5) Duplicated columns across sheets → note on each audit's duplication field
  const dups = findDuplicatedColumns([...sessionAnalyses.values()]);
  if (dups.length) {
    report.duplicates = dups;
    const lines = dups.map((d) => `\u201C${d.column}\u201D appears in: ${d.sheets.join(", ")} — which copy wins when they disagree?`);
    for (const inst of state.data.spreadsheetAudits) {
      const path = `spreadsheetAudits.${inst._id}.duplication`;
      const cur = getPath(path);
      const relevant = lines.filter((l) => !String(cur || "").includes(l));
      if (relevant.length && !String(cur || "").trim()) {
        setPath(path, relevant.join("\n"), { suggested: true });
      }
    }
  }

  return report;
}
