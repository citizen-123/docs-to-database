// render.js — schema-driven form renderer.
// Strategy: full re-render of the main pane on structural changes (add/remove
// instance or row, import). Plain typing updates state directly without a
// re-render so focus is never lost.

import { PACKET, getWorksheet } from "./schema.js";
import {
  state, getPath, setPath, addInstance, removeInstance, addRow, removeRow,
  isSuggested, confirmSuggestion, confirmAll, suggestionCountFor, completion, touch,
} from "./state.js";

function confirmAllButton(prefix, where) {
  const n = suggestionCountFor(prefix);
  if (!n) return null;
  return el("button", {
    class: "confirm-all-btn",
    type: "button",
    title: "Mark every amber value " + where + " as reviewed and correct",
    onclick: () => { confirmAll(prefix); renderApp(); },
  }, `✓ Confirm all ${n} suggested value${n === 1 ? "" : "s"} ${where}`);
}

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

// ── inputs ──────────────────────────────────────────────────────
function bindSuggestion(input, path) {
  if (isSuggested(path)) {
    input.classList.add("suggested");
    input.title = "Machine-suggested — edit or click the check mark to confirm";
  }
  input.addEventListener("input", () => {
    setPath(path, input.value); // clears the flag
    input.classList.remove("suggested");
    const badge = input.parentElement?.querySelector(".confirm-btn");
    badge?.remove();
  });
}

function suggestedWrap(input, path) {
  const wrap = el("div", { class: "input-wrap" }, input);
  if (isSuggested(path)) {
    wrap.append(
      el("button", {
        class: "confirm-btn",
        type: "button",
        title: "Looks right — confirm this suggested value",
        onclick: (e) => {
          confirmSuggestion(path);
          input.classList.remove("suggested");
          e.currentTarget.remove();
        },
      }, "✓")
    );
  }
  return wrap;
}

function textInput(path, value) {
  const input = el("input", { type: "text", value: value ?? "" });
  bindSuggestion(input, path);
  return suggestedWrap(input, path);
}

function textareaInput(path, value) {
  const input = el("textarea", { rows: "4" }, value ?? "");
  bindSuggestion(input, path);
  return suggestedWrap(input, path);
}

// ── table field ─────────────────────────────────────────────────
function tableField(fieldDef, tablePath) {
  const rows = getPath(tablePath) || [];
  const wrap = el("div", { class: "table-field" });
  const table = el("table");
  const headRow = el("tr");
  for (const c of fieldDef.columns) headRow.append(el("th", { class: c.wide ? "wide" : "" }, c.label));
  headRow.append(el("th", { class: "row-actions" }, ""));
  table.append(headRow);

  rows.forEach((row, i) => {
    const tr = el("tr");
    for (const c of fieldDef.columns) {
      const cellPath = `${tablePath}.${i}.${c.key}`;
      const input = el("input", { type: "text", value: row[c.key] ?? "" });
      bindSuggestion(input, cellPath);
      tr.append(el("td", { class: c.wide ? "wide" : "" }, suggestedWrap(input, cellPath)));
    }
    tr.append(
      el("td", { class: "row-actions" },
        el("button", {
          class: "icon-btn", type: "button", title: "Remove row",
          onclick: () => { removeRow(tablePath, i); renderApp(); },
        }, "×")
      )
    );
    table.append(tr);
  });

  wrap.append(table);
  wrap.append(
    el("button", {
      class: "add-btn", type: "button",
      onclick: () => { addRow(tablePath, {}); renderApp(); },
    }, "+ Add row")
  );
  return wrap;
}

// ── field block ─────────────────────────────────────────────────
function fieldBlock(fieldDef, basePath, inst) {
  const path = `${basePath}${fieldDef.key}`;
  const block = el("div", { class: "field" });
  block.append(el("label", { class: "field-label" }, fieldDef.label));
  if (fieldDef.help) block.append(el("p", { class: "field-help" }, fieldDef.help));
  if (fieldDef.example) {
    const ex = typeof fieldDef.example === "string"
      ? fieldDef.example
      : fieldDef.example.map((row) => Object.values(row).join(" · ")).join("\n");
    block.append(el("details", { class: "field-example" }, el("summary", {}, "Example"), el("p", {}, ex)));
  }
  if (fieldDef.kind === "table") block.append(tableField(fieldDef, path));
  else if (fieldDef.kind === "textarea") block.append(textareaInput(path, inst[fieldDef.key]));
  else block.append(textInput(path, inst[fieldDef.key]));
  return block;
}

// ── worksheet pane ──────────────────────────────────────────────
export let currentView = "home"; // "home" | worksheet id | "import"
export function setView(v) {
  currentView = v;
  renderApp();
  document.getElementById("main").scrollTop = 0;
}

function worksheetPane(ws) {
  const pane = el("div", { class: "ws-pane" });
  pane.append(
    el("div", { class: "ws-head" },
      el("p", { class: "eyebrow" }, `Worksheet ${ws.num} · ${ws.time}`),
      el("h2", {}, ws.title),
      el("p", { class: "blurb" }, ws.blurb)
    )
  );

  if (!ws.repeatable) {
    const cab = confirmAllButton(ws.id, "on this worksheet");
    if (cab) pane.append(cab);
    const basePath = `${ws.id}.`;
    for (const f of ws.fields) pane.append(fieldBlock(f, basePath, state.data[ws.id]));
    return pane;
  }

  const instances = state.data[ws.id];
  if (instances.length === 0) {
    pane.append(
      el("div", { class: "empty-state" },
        el("p", {}, `No ${ws.instanceNoun}s yet. Add one for each ${ws.instanceNoun} ` +
          (ws.id === "spreadsheetAudits" ? "your business uses — or upload the files on the Import tab and they\u2019ll appear here prefilled." : "on your master list.")),
        el("button", { class: "add-btn big", type: "button", onclick: () => { addInstance(ws.id, ws); renderApp(); } },
          `+ Add ${ws.instanceNoun}`)
      )
    );
    return pane;
  }

  instances.forEach((inst, idx) => {
    const label = String(inst[ws.instanceLabelField] || "").trim() || `${ws.instanceNoun} ${idx + 1}`;
    const card = el("details", { class: "instance-card", ...(instances.length === 1 ? { open: "" } : {}) });
    card.append(
      el("summary", {},
        el("span", { class: "instance-label" }, label),
        el("button", {
          class: "icon-btn danger", type: "button", title: `Remove this ${ws.instanceNoun}`,
          onclick: (e) => {
            e.preventDefault();
            if (confirm(`Remove \u201C${label}\u201D and everything filled in for it?`)) {
              removeInstance(ws.id, inst._id);
              renderApp();
            }
          },
        }, "×")
      )
    );
    const cab = confirmAllButton(`${ws.id}.${inst._id}`, "in this card");
    if (cab) card.append(cab);
    const basePath = `${ws.id}.${inst._id}.`;
    for (const f of ws.fields) card.append(fieldBlock(f, basePath, inst));
    pane.append(card);
  });

  pane.append(
    el("button", { class: "add-btn big", type: "button", onclick: () => { addInstance(ws.id, ws); renderApp(); } },
      `+ Add another ${ws.instanceNoun}`)
  );
  return pane;
}

// ── home + sidebar ──────────────────────────────────────────────
function homePane() {
  const pane = el("div", { class: "ws-pane home" });
  pane.append(
    el("p", { class: "eyebrow" }, "Start here"),
    el("h2", {}, PACKET.title),
    el("p", { class: "blurb" }, PACKET.intro)
  );

  const metaCard = el("div", { class: "field" });
  metaCard.append(el("label", { class: "field-label" }, "Business name"));
  const biz = el("input", { type: "text", value: state.meta.businessName || "" });
  biz.addEventListener("input", () => { state.meta.businessName = biz.value; touch(); });
  metaCard.append(biz);
  metaCard.append(el("label", { class: "field-label", style: "margin-top:12px" }, "Filled out by"));
  const who = el("input", { type: "text", value: state.meta.filledBy || "" });
  who.addEventListener("input", () => { state.meta.filledBy = who.value; touch(); });
  metaCard.append(who);
  pane.append(metaCard);

  const rules = el("div", { class: "ground-rules" }, el("h3", {}, "Ground rules"));
  const ul = el("ul");
  for (const r of PACKET.groundRules) ul.append(el("li", {}, r));
  rules.append(ul);
  pane.append(rules);

  pane.append(
    el("div", { class: "home-howto" },
      el("h3", {}, "How this works"),
      el("p", {}, "Work through the worksheets in order, left sidebar. Everything autosaves in this browser. " +
        "Use Save progress to download a .json file you can re-import later or on another machine. " +
        "Got spreadsheets? Upload them on the Import tab and big chunks of Worksheets 1, 2, 4, and 5 get prefilled — " +
        "prefilled values show in amber until you confirm or correct them."),
      el("p", {}, "Plan for one to two working days, spread across a week. Don\u2019t do it in one sitting — you\u2019ll remember things in the shower."),
      el("p", {}, "Prefer paper? Use Print blank packet in the toolbar, or grab the original Markdown templates from the "),
      el("a", { href: "templates/", target: "_blank" }, "templates folder"), el("span", {}, ".")
    )
  );
  return pane;
}

// ── import pane ─────────────────────────────────────────────────
let importReportHTML = "";
export function setImportReport(html) { importReportHTML = html; }

function importPane() {
  const pane = el("div", { class: "ws-pane" });
  pane.append(
    el("p", { class: "eyebrow" }, "Optional, but it does the boring parts for you"),
    el("h2", {}, "Import your spreadsheets"),
    el("p", { class: "blurb" },
      "Upload the actual files your business runs on (.xlsx, .xls, or .csv). Each sheet becomes a prefilled " +
      "Spreadsheet Audit, seeds the Data Dictionary, and — once you\u2019ve uploaded two or more related sheets — " +
      "suggests Relationship rows by matching values across them. Everything happens in your browser; no file leaves your computer.")
  );

  const drop = el("div", { class: "dropzone", id: "dropzone" },
    el("p", { class: "drop-big" }, "Drop spreadsheet files here"),
    el("p", {}, "or"),
    el("button", { class: "add-btn", type: "button", onclick: () => document.getElementById("file-input").click() }, "Choose files\u2026")
  );
  pane.append(drop);

  pane.append(
    el("div", { class: "gsheet-row" },
      el("label", { class: "field-label" }, "Google Sheet (must be link-shared)"),
      el("p", { class: "field-help" }, "Private sheet? In Google Sheets use File \u2192 Download \u2192 Microsoft Excel (.xlsx), then upload that file above."),
      el("div", { class: "gsheet-controls" },
        el("input", { type: "url", id: "gsheet-url", placeholder: "https://docs.google.com/spreadsheets/d/\u2026" }),
        el("button", { class: "add-btn", type: "button", id: "gsheet-btn" }, "Import")
      )
    )
  );

  pane.append(
    el("p", { class: "field-help amber-note" },
      "Machine-filled values appear with an amber background and a ✓ button. They are guesses about clerical facts — column names, fill rates, status values. " +
      "The questions that matter (what columns MEAN, what the colors mean, what\u2019s tracked only in email) stay blank on purpose. Those are yours.")
  );

  const report = el("div", { class: "import-report", id: "import-report" });
  report.innerHTML = importReportHTML;
  pane.append(report);
  return pane;
}

// ── sidebar ─────────────────────────────────────────────────────
function sidebar() {
  const nav = el("nav", { class: "sidebar-nav" });
  const item = (id, label, sub) => {
    const a = el("button", { class: "nav-item" + (currentView === id ? " active" : ""), type: "button", onclick: () => setView(id) },
      el("span", { class: "nav-label" }, label));
    if (sub != null) a.append(el("span", { class: "nav-sub" }, sub));
    return a;
  };
  nav.append(item("home", "Start here"));
  nav.append(item("import", "Import spreadsheets"));
  for (const ws of PACKET.worksheets) {
    const pct = Math.round(completion(ws) * 100);
    const count = ws.repeatable ? ` · ${state.data[ws.id].length}` : "";
    const navItem = item(ws.id, `${ws.num}. ${ws.title}`, `${pct}%${count}`);
    if (pct === 100) navItem.classList.add("done");
    nav.append(navItem);
  }
  return nav;
}

// ── prev/next pager ─────────────────────────────────────────────
const viewOrder = () => ["home", "import", ...PACKET.worksheets.map((w) => w.id)];

function viewLabel(id) {
  if (id === "home") return "Start here";
  if (id === "import") return "Import spreadsheets";
  const ws = getWorksheet(id);
  return ws ? `${ws.num}. ${ws.title}` : id;
}

function pager() {
  const order = viewOrder();
  const idx = order.indexOf(currentView);
  if (idx === -1) return null;
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx < order.length - 1 ? order[idx + 1] : null;
  const nav = el("nav", { class: "pager", "aria-label": "Previous and next worksheet" });
  const btn = (id, dir) =>
    el("button", { class: `pager-btn ${dir}`, type: "button", onclick: () => setView(id) },
      el("span", { class: "pager-dir" }, dir === "prev" ? "← Previous" : "Next →"),
      el("span", { class: "pager-target" }, viewLabel(id)));
  nav.append(prev ? btn(prev, "prev") : el("span"));
  if (next) nav.append(btn(next, "next"));
  return nav;
}

// ── top-level render ────────────────────────────────────────────
export function renderApp() {
  const side = document.getElementById("sidebar");
  side.innerHTML = "";
  side.append(sidebar());

  const main = document.getElementById("main");
  main.innerHTML = "";
  if (currentView === "home") main.append(homePane());
  else if (currentView === "import") main.append(importPane());
  else {
    const ws = getWorksheet(currentView);
    main.append(ws ? worksheetPane(ws) : homePane());
  }
  const p = pager();
  if (p) main.append(p);
}
