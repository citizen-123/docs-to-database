// importer.js — file upload → SheetJS parse → inference → state prefills.
// Expects the SheetJS global `XLSX` (loaded from CDN in index.html).

import { analyzeSheet, suggestRelationships, findDuplicatedColumns, buildAuditPrefill } from "./infer.js";
import { state, addInstance, addRow, getPath, setPath } from "./state.js";
import { getWorksheet } from "./schema.js";

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

function importWorkbook(wb, fileName) {
  const tabNames = wb.SheetNames;
  const report = { fileName, tabs: [], relationships: [], duplicates: [], colorNote: false };

  for (const tab of tabNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[tab], { header: 1, defval: null });
    if (!rows.length || rows.every((r) => r.every((c) => c == null))) continue; // skip empty tabs
    const analysis = analyzeSheet(tab, rows);
    sessionAnalyses.set(`${fileName}::${tab}`, analysis);

    // 1) New Spreadsheet Audit instance, prefilled
    const auditWs = getWorksheet("spreadsheetAudits");
    const { prefill, suggestedPaths } = buildAuditPrefill(analysis, fileName, tabNames);
    const inst = addInstance("spreadsheetAudits", auditWs, prefill, suggestedPaths);

    // 2) Seed Worksheet 1 Part B (sheet → "one row = one ...?")
    addRow("nounHarvest.sheetRows", { sheet: prefill.name, rowIs: "" }, { suggested: true });

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
    addInstance("dataDictionary", ddWs, { entityName: prefill.name, fields: ddRows }, ddSuggested);

    report.tabs.push({
      name: tab,
      rowCount: analysis.rowCount,
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
