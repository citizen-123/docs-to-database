// app.js — bootstrap and toolbar wiring.

import { state, loadFromStorage, clearAll, exportJSON, importJSON, subscribe, suggestionCount, suggestionCountFor } from "./state.js";
import { renderApp, setView, setImportReport, currentView } from "./render.js";
import { PACKET } from "./schema.js";
import { exportMarkdown, downloadText } from "./export-md.js";
import { exportDocx, fileStem } from "./export-docx.js";
import { printReport, printBlankPacket } from "./export-pdf.js";
import { importSpreadsheetFile, importGoogleSheetUrl } from "./importer.js";

function toast(msg, kind = "ok") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => (t.className = ""), 4000);
}

function refreshSuggestionBadge() {
  const n = suggestionCount();
  const badge = document.getElementById("suggestion-badge");
  badge.textContent = n ? `${n} suggested value${n === 1 ? "" : "s"} awaiting review` : "";
  badge.title = n ? "Click to jump to the next worksheet with unreviewed suggestions" : "";
}

function wireSuggestionBadge() {
  document.getElementById("suggestion-badge").addEventListener("click", () => {
    const ws = PACKET.worksheets.find((w) => suggestionCountFor(w.id) > 0);
    if (ws) setView(ws.id);
  });
}

// ── toolbar actions ─────────────────────────────────────────────
function wireToolbar() {
  document.getElementById("btn-save-json").addEventListener("click", () => {
    downloadText(fileStem(state) + ".json", exportJSON(), "application/json");
    toast("Progress saved as JSON. Re-import it any time to pick up where you left off.");
  });

  document.getElementById("btn-load-json").addEventListener("click", () => {
    document.getElementById("json-input").click();
  });
  document.getElementById("json-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      importJSON(await file.text());
      renderApp();
      toast("Progress loaded.");
    } catch (err) {
      toast(err.message || "Couldn\u2019t read that file.", "err");
    }
    e.target.value = "";
  });

  document.getElementById("btn-export-md").addEventListener("click", () => {
    downloadText(fileStem(state) + ".md", exportMarkdown(state));
    toast("Markdown exported.");
  });

  document.getElementById("btn-export-docx").addEventListener("click", async () => {
    if (typeof docx === "undefined") return toast("The Word library hasn\u2019t loaded — check your connection and reload.", "err");
    try {
      await exportDocx(state);
      toast("Word document exported.");
    } catch (err) {
      console.error(err);
      toast("Word export failed: " + err.message, "err");
    }
  });

  document.getElementById("btn-export-pdf").addEventListener("click", () => {
    printReport(state);
    // (browser print dialog → "Save as PDF")
  });

  document.getElementById("btn-print-blank").addEventListener("click", () => {
    printBlankPacket();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (confirm("Erase EVERYTHING and start over? Save your progress as JSON first if in doubt.")) {
      clearAll();
      setView("home");
      toast("Cleared.");
    }
  });
}

// ── spreadsheet import wiring (delegated; import pane re-renders) ──
async function handleFiles(files) {
  if (typeof XLSX === "undefined") return toast("The spreadsheet library hasn\u2019t loaded — check your connection and reload.", "err");
  const lines = [];
  for (const file of files) {
    try {
      const report = await importSpreadsheetFile(file);
      for (const tab of report.tabs) {
        lines.push(
          `<div class="report-card"><strong>${escapeHTML(file.name)}${report.tabs.length > 1 ? " — " + escapeHTML(tab.name) : ""}</strong>` +
          `<br>${tab.rowCount} rows · ${tab.columnCount} columns → ` +
          (tab.refreshed
            ? "refreshed the existing Spreadsheet Audit and Data Dictionary for this sheet (anything you typed was kept)."
            : "prefilled a Spreadsheet Audit and a Data Dictionary table.") +
          (tab.skippedRows ? `<br>Skipped ${tab.skippedRows} title/preamble row${tab.skippedRows === 1 ? "" : "s"} above the real header.` : "") +
          (tab.statusColumns.length ? `<br>Status-like columns found: ${tab.statusColumns.map(escapeHTML).join(", ")} (every distinct value captured, typos included).` : "") +
          (tab.repeatedGroups.length ? `<br>Repeated column groups: ${tab.repeatedGroups.map((g) => escapeHTML(g.columns.join(", "))).join(" · ")}` : "") +
          `</div>`
        );
      }
      if (report.relationships.length) {
        lines.push(
          `<div class="report-card rel"><strong>Relationship suggestions</strong><br>` +
          report.relationships.map((r) => escapeHTML(r.sentence)).join("<br>") +
          `<br><em>Added to Worksheet 4 — confirm or correct them there.</em></div>`
        );
      }
      if (report.duplicates.length) {
        lines.push(
          `<div class="report-card dup"><strong>Same column in multiple sheets</strong><br>` +
          report.duplicates.map((d) => `\u201C${escapeHTML(d.column)}\u201D in ${d.sheets.map(escapeHTML).join(", ")}`).join("<br>") +
          `</div>`
        );
      }
    } catch (err) {
      console.error(err);
      lines.push(`<div class="report-card err">Couldn\u2019t read ${escapeHTML(file.name)}: ${escapeHTML(err.message)}</div>`);
    }
  }
  setImportReport(lines.join(""));
  renderApp();
  toast("Import finished — amber fields are suggestions awaiting your review.");
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function wireImportDelegation() {
  document.getElementById("file-input").addEventListener("change", (e) => {
    if (e.target.files.length) handleFiles([...e.target.files]);
    e.target.value = "";
  });

  // dropzone + google sheet button live inside the re-rendered pane → delegate
  document.getElementById("main").addEventListener("dragover", (e) => {
    const dz = e.target.closest(".dropzone");
    if (dz) { e.preventDefault(); dz.classList.add("over"); }
  });
  document.getElementById("main").addEventListener("dragleave", (e) => {
    e.target.closest(".dropzone")?.classList.remove("over");
  });
  document.getElementById("main").addEventListener("drop", (e) => {
    const dz = e.target.closest(".dropzone");
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove("over");
    if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]);
  });
  document.getElementById("main").addEventListener("click", async (e) => {
    if (e.target.id !== "gsheet-btn") return;
    const url = document.getElementById("gsheet-url").value.trim();
    if (!url) return;
    e.target.disabled = true;
    e.target.textContent = "Importing\u2026";
    try {
      // fetch + parse happens in importer; reuse handleFiles-style reporting
      const report = await importGoogleSheetUrl(url);
      setImportReport(
        report.tabs.map((t) =>
          `<div class="report-card"><strong>Google Sheet — ${escapeHTML(t.name)}</strong><br>${t.rowCount} rows · ${t.columnCount} columns → prefilled.</div>`
        ).join("")
      );
      renderApp();
      toast("Google Sheet imported.");
    } catch (err) {
      toast(err.message, "err");
      renderApp();
    }
  });
}

// ── boot ────────────────────────────────────────────────────────
loadFromStorage();
wireToolbar();
wireSuggestionBadge();
wireImportDelegation();
subscribe(() => refreshSuggestionBadge());
renderApp();
refreshSuggestionBadge();
