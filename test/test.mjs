// test.mjs — node functional tests for the DOM-free core.
// Run: node test/test.mjs   (from repo root)
import assert from "node:assert/strict";
import { PACKET, getWorksheet } from "../js/schema.js";
import * as S from "../js/state.js";
import { analyzeSheet, detectHeaderRow, inferType, fillLabel, findRepeatedGroups, suggestRelationships, findDuplicatedColumns, buildAuditPrefill } from "../js/infer.js";
import { exportMarkdown } from "../js/export-md.js";
import { importWorkbook } from "../js/importer.js";
import { parseMarkdown, parseInline, blocksToHTML } from "../templates/templates.js";
import { readFileSync, readdirSync } from "node:fs";

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log("  ✓", name); };

console.log("schema");
ok("5 worksheets (start-here is the home pane, not a worksheet)", () => assert.equal(PACKET.worksheets.length, 5));
ok("repeatable flags", () => {
  assert.equal(getWorksheet("spreadsheetAudits").repeatable, true);
  assert.equal(getWorksheet("entities").repeatable, true);
  assert.equal(getWorksheet("dataDictionary").repeatable, true);
  assert.equal(getWorksheet("nounHarvest").repeatable, false);
  assert.equal(getWorksheet("relationships").repeatable, false);
});
ok("every field has key/kind/label; tables have columns", () => {
  for (const ws of PACKET.worksheets) {
    const seen = new Set();
    for (const f of ws.fields) {
      assert.ok(f.key && f.kind && f.label, `${ws.id}.${f.key}`);
      assert.ok(!seen.has(f.key), `duplicate key ${ws.id}.${f.key}`);
      seen.add(f.key);
      if (f.kind === "table") assert.ok(Array.isArray(f.columns) && f.columns.length > 0);
    }
    if (ws.repeatable) assert.ok(ws.fields.some((f) => f.key === ws.instanceLabelField), `${ws.id} label field exists`);
  }
});

console.log("inference: types");
ok("dates", () => assert.equal(inferType(["1/5/2026", "2/10/2026", "12/1/2025"]), "date"));
ok("money", () => assert.equal(inferType(["$1,200.00", "$80.50", "$9.99"]), "money"));
ok("numbers", () => assert.equal(inferType(["1", "42", "3.5", "1,200"]), "number"));
ok("yes-no", () => assert.equal(inferType(["Y", "N", "yes", "NO"]), "yes-no"));
ok("text", () => assert.equal(inferType(["Henderson", "Smith", "Acme Corp"]), "text"));
ok("fill labels", () => {
  assert.equal(fillLabel(1), "always");
  assert.equal(fillLabel(0.99), "always");
  assert.equal(fillLabel(0.8), "usually");
  assert.equal(fillLabel(0.3), "rarely");
});

console.log("inference: sheet analysis");
const mkJobs = () => {
  const statuses = ["scheduled", "done", "paid", "Sheduled" /* typo on purpose */];
  const rows = [["Job #", "Customer", "Status", "Amount", "Item 1", "Item 2", "Notes"]];
  for (let i = 0; i < 60; i++) {
    rows.push([
      `J-${1000 + i}`,
      `CUST-${(i % 20) + 1}`,                  // 20 customers, repeated → many-to-one
      statuses[i % statuses.length],
      `$${(100 + i).toFixed(2)}`,
      "pipe", i % 3 === 0 ? "valve" : null,    // Item 2 sparsely filled
      i % 10 === 0 ? "gate code 4412" : null,  // rarely filled
    ]);
  }
  return rows;
};
const mkCustomers = () => {
  const rows = [["Customer ID", "Name", "Phone"]];
  for (let i = 0; i < 25; i++) rows.push([`CUST-${i + 1}`, `Customer ${i + 1}`, `555-01${String(i).padStart(2, "0")}`]);
  return rows;
};

const jobs = analyzeSheet("Jobs", mkJobs());
const customers = analyzeSheet("Customers", mkCustomers());

ok("row/column counts", () => {
  assert.equal(jobs.rowCount, 60);
  assert.equal(jobs.columns.length, 7);
});
ok("status column detected as choice with typos captured", () => {
  const st = jobs.columns.find((c) => c.name === "Status");
  assert.equal(st.isChoice, true);
  assert.ok(st.distinctValues.includes("Sheduled"), "typo captured: " + st.distinctValues.join(","));
});
ok("money column typed", () => assert.equal(jobs.columns.find((c) => c.name === "Amount").type, "money"));
ok("fill labels per column", () => {
  assert.equal(jobs.columns.find((c) => c.name === "Job #").fillLabel, "always");
  assert.equal(jobs.columns.find((c) => c.name === "Notes").fillLabel, "rarely");
});
ok("repeated groups found", () => {
  const g = jobs.repeatedGroups;
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].columns, ["Item 1", "Item 2"]);
});
ok("repeated groups ignore single numbered columns", () => {
  assert.deepEqual(findRepeatedGroups(["Address 1", "City", "State"]), []);
});

console.log("inference: report-style sheets (title block above the header)");
// Modeled on a real billing-statement .xls: merged title rows, a date line,
// blank spacers, the real header in row 10, then totals and a footer code.
const mkBillingReport = () => {
  const pad = (cells) => [...cells, ...Array(9 - cells.length).fill(null)];
  const rows = [
    pad(["Current Billing Statement"]),
    pad(["030-014956-SHOCK SQUAD"]),
    pad(["00003-SHOCK SQUAD"]),
    pad([]),
    pad(["Due Date:December 2025"]),
    pad([]), pad([]),
    pad(["List of current premiums for coverage from 12/01/2025 through 12/31/2025"]),
    pad([]),
    ["Name", "Cert/SSN", "Class", "Dep Cd", "Member Rate($)", "Dependent Rate($)", "Adjustment Date", "Adjustment Amount($)", "Total Rate($)"],
  ];
  for (let i = 0; i < 21; i++) {
    rows.push([`MEMBER,${i}`, 16 + i, 1, i % 2 ? "A" : "B", 8.07, i % 2 ? 0 : 6.45, null, 0, i % 2 ? 8.07 : 14.52]);
  }
  rows.push(pad([]));
  rows.push([" ", " ", " ", " ", " ", " ", "Total Current Premium($)", " ", 220.2]);
  rows.push(pad([]));
  rows.push([" ", " ", " ", " ", " ", " ", "TOTAL AMOUNT BILLED($)", " ", 212.13]);
  rows.push(pad([]));
  rows.push(pad(["0 03001495600003 00000021213"]));
  return rows;
};
const billing = analyzeSheet("Current Billing Statement", mkBillingReport());
ok("header found below the title block", () => {
  assert.equal(detectHeaderRow(mkBillingReport()), 9);
  assert.deepEqual(billing.headerRow.slice(0, 3), ["Name", "Cert/SSN", "Class"]);
});
ok("preamble, blank rows, and total/footer rows excluded from the body", () => {
  assert.equal(billing.rowCount, 21);
  assert.equal(billing.columns.find((c) => c.name === "Name").fillLabel, "always");
  const name = billing.columns.find((c) => c.name === "Name");
  assert.ok(![...name._values].some((v) => /Total|Statement/.test(v)), "no footer junk in values");
});
ok("plain sheets keep row 1 as the header", () => {
  assert.equal(detectHeaderRow(mkJobs()), 0);
  assert.equal(detectHeaderRow(mkCustomers()), 0);
});

console.log("inference: cross-sheet");
const rels = suggestRelationships([jobs, customers]);
ok("Jobs.Customer ⊆ Customers.Customer ID detected as many-to-one", () => {
  const r = rels.find((x) => x.fromSheet === "Jobs" && x.fromColumn === "Customer");
  assert.ok(r, "relationship found: " + JSON.stringify(rels.map((x) => x.fromSheet + "." + x.fromColumn + "→" + x.toSheet + "." + x.toColumn)));
  assert.equal(r.toSheet, "Customers");
  assert.equal(r.toColumn, "Customer ID");
  assert.equal(r.cardinality, "many-to-one");
});
ok("no self-referential or low-coverage junk for Status", () => {
  assert.ok(!rels.some((r) => r.fromColumn === "Status"));
});
ok("duplicated columns across sheets", () => {
  const dups = findDuplicatedColumns([jobs, analyzeSheet("Jobs Archive", mkJobs())]);
  assert.ok(dups.some((d) => d.column === "status"));
});

console.log("prefill pipeline + state");
const auditWs = getWorksheet("spreadsheetAudits");
const { prefill, suggestedPaths } = buildAuditPrefill(jobs, "Jobs 2026.xlsx", ["Jobs"]);
ok("prefill leaves semantic fields blank", () => {
  assert.equal(prefill.columns.every((r) => r.meaning === "" && r.describes === ""), true);
  assert.equal(prefill.name, "Jobs 2026.xlsx");
  assert.equal(prefill.rowCount, "60");
  assert.ok(prefill.statusValues.includes("Sheduled"));
});
const inst = S.addInstance("spreadsheetAudits", auditWs, prefill, suggestedPaths);
ok("instance created with suggestion flags", () => {
  assert.equal(S.state.data.spreadsheetAudits.length, 1);
  assert.equal(S.isSuggested(`spreadsheetAudits.${inst._id}.rowCount`), true);
  assert.equal(S.isSuggested(`spreadsheetAudits.${inst._id}.columns.0.col`), true);
  assert.equal(S.isSuggested(`spreadsheetAudits.${inst._id}.columns.0.meaning`), false);
});
ok("human edit clears the flag", () => {
  S.setPath(`spreadsheetAudits.${inst._id}.rowCount`, "61");
  assert.equal(S.isSuggested(`spreadsheetAudits.${inst._id}.rowCount`), false);
  assert.equal(S.getPath(`spreadsheetAudits.${inst._id}.rowCount`), "61");
});
ok("confirm clears the flag without changing the value", () => {
  const p = `spreadsheetAudits.${inst._id}.columns.0.col`;
  S.confirmSuggestion(p);
  assert.equal(S.isSuggested(p), false);
  assert.equal(S.getPath(p), "Job #");
});
ok("removeRow reindexes suggestion flags", () => {
  const tablePath = `spreadsheetAudits.${inst._id}.columns`;
  const before = S.getPath(tablePath).length;
  assert.equal(S.isSuggested(`${tablePath}.2.col`), true);
  S.removeRow(tablePath, 1);
  assert.equal(S.getPath(tablePath).length, before - 1);
  assert.equal(S.isSuggested(`${tablePath}.1.col`), true, "flag for old index 2 shifted to 1");
});
ok("getPath/setPath on nounHarvest table rows", () => {
  S.addRow("nounHarvest.sheetRows", { sheet: "Jobs 2026.xlsx", rowIs: "" }, { suggested: true });
  assert.equal(S.isSuggested("nounHarvest.sheetRows.0.sheet"), true);
  assert.equal(S.isSuggested("nounHarvest.sheetRows.0.rowIs"), false, "empty cells not flagged");
});
ok("completion meter moves", () => {
  const ws = getWorksheet("nounHarvest");
  const before = S.completion(ws);
  S.setPath("nounHarvest.brainDump", "customers, jobs");
  assert.ok(S.completion(ws) > before);
});

console.log("JSON round-trip");
const json = S.exportJSON();
ok("export → import preserves data and flags", () => {
  const flagsBefore = Object.keys(S.state.suggested).length;
  S.importJSON(json);
  assert.equal(S.getPath("nounHarvest.brainDump"), "customers, jobs");
  assert.equal(S.state.data.spreadsheetAudits.length, 1);
  assert.equal(Object.keys(S.state.suggested).length, flagsBefore);
});
ok("import rejects garbage", () => {
  assert.throws(() => S.importJSON("{\"hello\":1}"));
  assert.throws(() => S.importJSON("not json"));
});
ok("migrate fills missing fields from old saves", () => {
  const old = JSON.parse(json);
  delete old.data.relationships;
  delete old.data.spreadsheetAudits[0].colorCoding;
  S.importJSON(JSON.stringify(old));
  assert.deepEqual(S.getPath("relationships.pairs"), []);
  assert.equal(S.getPath(`spreadsheetAudits.${S.state.data.spreadsheetAudits[0]._id}.colorCoding`), "");
});

console.log("markdown export");
ok("renders headings, tables, pending-suggestion warning", () => {
  const md = exportMarkdown(S.state);
  assert.ok(md.includes("# Database Discovery Packet"));
  assert.ok(md.includes("## Worksheet 2: Spreadsheet Audit"));
  assert.ok(md.includes("| Column name |"));
  assert.ok(md.includes("machine-suggested value"));
  assert.ok(md.includes("Jobs 2026.xlsx"));
});
ok("pipes and newlines escaped in cells", () => {
  S.setPath("nounHarvest.sheetRows.0.sheet", "a|b\nc");
  const md = exportMarkdown(S.state);
  assert.ok(md.includes("a\\|b<br>c"));
});

console.log("re-import (uploading the same file twice must not duplicate state)");
// importWorkbook only needs sheet_to_json from the XLSX global; feed it
// pre-parsed arrays-of-arrays so no spreadsheet library is required here.
globalThis.XLSX = { utils: { sheet_to_json: (sheet) => sheet } };
const wbOf = (name, rows) => ({ SheetNames: [name], Sheets: { [name]: rows } });

S.clearAll();
ok("re-upload refreshes instead of duplicating", () => {
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  assert.equal(S.state.data.spreadsheetAudits.length, 1);
  assert.equal(S.state.data.dataDictionary.length, 1);
  assert.equal(S.getPath("nounHarvest.sheetRows").filter((r) => r.sheet === "jobs.xlsx").length, 1);
});
ok("human edits survive a re-upload", () => {
  const audit = S.state.data.spreadsheetAudits[0];
  S.setPath("nounHarvest.sheetRows.0.rowIs", "a job");
  S.setPath(`spreadsheetAudits.${audit._id}.columns.0.meaning`, "internal job number");
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  assert.equal(S.getPath("nounHarvest.sheetRows.0.rowIs"), "a job");
  assert.equal(S.getPath(`spreadsheetAudits.${audit._id}.columns.0.meaning`), "internal job number");
  assert.equal(S.state.data.spreadsheetAudits.length, 1);
});
ok("stale untouched duplicates from older imports get pruned", () => {
  // simulate the pre-fix bug: a leftover untouched audit + Part B row for the same file
  const { prefill: p, suggestedPaths: sp } = buildAuditPrefill(jobs, "jobs.xlsx", ["Jobs"]);
  S.addInstance("spreadsheetAudits", getWorksheet("spreadsheetAudits"), p, sp);
  S.addRow("nounHarvest.sheetRows", { sheet: "jobs.xlsx", rowIs: "" }, { suggested: true });
  assert.equal(S.state.data.spreadsheetAudits.length, 2);
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  assert.equal(S.state.data.spreadsheetAudits.length, 1);
  assert.equal(S.getPath("nounHarvest.sheetRows").filter((r) => r.sheet === "jobs.xlsx").length, 1);
});

console.log("import polish: types, dictionary source, bulk confirm");
ok("month-name dates detected", () => {
  assert.equal(inferType(["NOVEMBER, 2025", "Dec 2025", "January 5, 2026"]), "date");
});
ok("money-hinted headers promote number → money; plain numbers don't", () => {
  const rows = [["Dependent Rate($)", "Cert/SSN"]];
  for (let i = 0; i < 20; i++) rows.push([i % 2 ? 16.5 : 0, 100 + i]);
  const a = analyzeSheet("Rates", rows);
  assert.equal(a.columns[0].type, "money");
  assert.equal(a.columns[1].type, "number");
});
ok("imported dictionary: entityName left blank, source keys the re-upload", () => {
  S.clearAll();
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  assert.equal(S.state.data.dataDictionary.length, 1);
  const dd = S.state.data.dataDictionary[0];
  assert.equal(dd.entityName, "");
  assert.equal(dd.source, "jobs.xlsx");
  assert.ok(S.isSuggested(`dataDictionary.${dd._id}.source`));
});
ok("dictionary from a pre-source import is adopted, not duplicated", () => {
  S.clearAll();
  // legacy shape: filename in entityName, no source
  const ddWs = getWorksheet("dataDictionary");
  const legacy = S.addInstance("dataDictionary", ddWs, { entityName: "jobs.xlsx", fields: [] }, ["entityName"]);
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  assert.equal(S.state.data.dataDictionary.length, 1);
  assert.equal(S.state.data.dataDictionary[0]._id, legacy._id);
  assert.equal(S.getPath(`dataDictionary.${legacy._id}.source`), "jobs.xlsx");
  assert.equal(S.getPath(`dataDictionary.${legacy._id}.entityName`), "", "unconfirmed filename-name cleared");
});
ok("a human-named legacy dictionary keeps its name", () => {
  S.clearAll();
  const ddWs = getWorksheet("dataDictionary");
  const named = S.addInstance("dataDictionary", ddWs, { entityName: "jobs.xlsx", fields: [] }, []);
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  assert.equal(S.getPath(`dataDictionary.${named._id}.entityName`), "jobs.xlsx");
  assert.equal(S.state.data.dataDictionary.length, 1);
});
ok("confirmAll clears flags under a prefix only", () => {
  S.clearAll();
  importWorkbook(wbOf("Jobs", mkJobs()), "jobs.xlsx");
  const before = S.suggestionCount();
  const dd = S.state.data.dataDictionary[0];
  const n = S.confirmAll(`dataDictionary.${dd._id}`);
  assert.ok(n > 0 && S.suggestionCountFor(`dataDictionary.${dd._id}`) === 0);
  assert.equal(S.suggestionCount(), before - n, "other worksheets untouched");
  assert.ok(S.suggestionCountFor("spreadsheetAudits") > 0);
});

console.log("template markdown parser (drives the Word/PDF downloads)");
ok("inline bold/italic/code runs", () => {
  assert.deepEqual(parseInline("**Goal:** list *things*, use `code`"), [
    { text: "Goal:", bold: true },
    { text: " list " },
    { text: "things", italic: true },
    { text: ", use " },
    { text: "code", code: true },
  ]);
});
ok("block types: headings, hr, quote, fence, table, lists, paragraphs", () => {
  const blocks = parseMarkdown([
    "# Title", "", "Some **bold** prose", "that wraps.", "", "---",
    "> quoted line one", "> quoted line two",
    "```", "(write here)", "```",
    "| A | B |", "|---|---|", "| 1 | 2 |",
    "- alpha", "- beta",
    "1. first", "2. second",
  ].join("\n"));
  assert.deepEqual(blocks.map((b) => b.type), ["heading", "para", "hr", "quote", "code", "table", "list", "list"]);
  assert.equal(blocks[1].runs.map((r) => r.text).join(""), "Some bold prose that wraps.");
  assert.equal(blocks[3].lines.length, 2);
  assert.equal(blocks[4].text, "(write here)");
  assert.equal(blocks[5].rows.length, 2, "separator row dropped");
  assert.equal(blocks[6].ordered, false);
  assert.equal(blocks[7].ordered, true);
});
ok("every real template parses cleanly and round-trips to HTML", () => {
  const dir = new URL("../templates/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const blocks = parseMarkdown(readFileSync(new URL(f, dir), "utf8"));
    assert.ok(blocks.length > 10, `${f} parsed into blocks`);
    assert.equal(blocks[0].type, "heading", `${f} starts with a heading`);
    const html = blocksToHTML(blocks);
    assert.ok(!html.includes("**"), `${f}: no unparsed bold markers in HTML`);
    assert.ok(!/\|---/.test(html), `${f}: no table separators leaked into HTML`);
  }
});

console.log(`\nAll ${passed} tests passed.`);
