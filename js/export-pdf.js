// export-pdf.js — render a print-styled report and call window.print().
// The browser's print-to-PDF produces better output than any in-browser PDF
// library at a tenth of the code. Two modes:
//   printReport(state)        — filled answers
//   printBlankPacket()        — empty worksheets with ruled lines, for the
//                               print-and-fill-by-hand crowd

import { PACKET } from "./schema.js";

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function buildReport(state, { blank = false } = {}) {
  const root = el("div", { class: "print-report" });
  const meta = state?.meta || {};

  root.append(el("h1", {}, PACKET.title + (!blank && meta.businessName ? ` — ${meta.businessName}` : "")));
  if (blank) {
    root.append(el("p", { class: "rep-meta" }, "Business: ____________________   Filled out by: ____________________   Date: ____________"));
    const gr = el("div", { class: "rep-rules" }, el("h3", {}, "Ground rules"));
    const ul = el("ul");
    for (const r of PACKET.groundRules) ul.append(el("li", {}, r));
    gr.append(ul);
    root.append(el("p", {}, PACKET.intro), gr);
  } else {
    const bits = [];
    if (meta.filledBy) bits.push(`Filled out by: ${meta.filledBy}`);
    if (meta.updated) bits.push(`Last updated: ${meta.updated.slice(0, 10)}`);
    if (bits.length) root.append(el("p", { class: "rep-meta" }, bits.join("   ·   ")));
    const pending = Object.keys(state.suggested || {}).length;
    if (pending > 0) {
      root.append(el("p", { class: "rep-warn" }, `⚠ ${pending} machine-suggested value(s) were never confirmed by a person. Treat those answers as unverified.`));
    }
  }

  for (const ws of PACKET.worksheets) {
    const section = el("section", { class: "rep-ws" });
    section.append(el("h2", {}, `Worksheet ${ws.num}: ${ws.title}`));
    if (blank) section.append(el("p", { class: "rep-blurb" }, `${ws.blurb} (Time: ${ws.time})`));

    const instances = blank
      ? [null] // one blank copy; the page tells them to photocopy repeatables
      : ws.repeatable ? state.data[ws.id] : [state.data[ws.id]];

    if (!blank && ws.repeatable && instances.length === 0) {
      section.append(el("p", { class: "rep-empty" }, "(not filled out)"));
      root.append(section);
      continue;
    }
    if (blank && ws.repeatable) {
      section.append(el("p", { class: "rep-note" }, `Make one copy of this worksheet per ${ws.instanceNoun}.`));
    }

    instances.forEach((inst, idx) => {
      if (!blank && ws.repeatable) {
        const label = String(inst[ws.instanceLabelField] || `${ws.instanceNoun} ${idx + 1}`);
        section.append(el("h3", { class: "rep-instance" }, label));
      }
      for (const f of ws.fields) {
        const block = el("div", { class: "rep-field" });
        block.append(el("h4", {}, f.label));
        if (blank && f.help) block.append(el("p", { class: "rep-help" }, f.help));
        if (blank && f.example) block.append(el("p", { class: "rep-help" }, "Example: " + (typeof f.example === "string" ? f.example : "")));

        if (f.kind === "table") {
          const table = el("table", { class: "rep-table" });
          const thead = el("tr");
          for (const c of f.columns) thead.append(el("th", {}, c.label));
          table.append(thead);
          const rows = blank ? Array.from({ length: 6 }, () => ({})) : inst[f.key] || [];
          if (!blank && rows.length === 0) {
            block.append(table, el("p", { class: "rep-empty" }, "(empty)"));
          } else {
            for (const row of rows) {
              const tr = el("tr");
              for (const c of f.columns) tr.append(el("td", {}, blank ? "\u00A0" : String(row[c.key] ?? "")));
              table.append(tr);
            }
            block.append(table);
          }
        } else {
          if (blank) {
            for (let i = 0; i < (f.kind === "textarea" ? 4 : 1); i++) block.append(el("div", { class: "rep-line" }, "\u00A0"));
          } else {
            const text = String(inst[f.key] ?? "").trim();
            block.append(text ? el("p", { class: "rep-answer" }, text) : el("p", { class: "rep-empty" }, "(no answer)"));
          }
        }
        section.append(block);
      }
    });
    root.append(section);
  }
  return root;
}

function printNode(node) {
  const holder = document.getElementById("print-holder");
  holder.innerHTML = "";
  holder.append(node);
  document.body.classList.add("printing");
  const cleanup = () => {
    document.body.classList.remove("printing");
    holder.innerHTML = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Safari sometimes skips afterprint; belt and suspenders:
  setTimeout(cleanup, 2000);
}

export function printReport(state) {
  printNode(buildReport(state));
}

export function printBlankPacket() {
  printNode(buildReport(null, { blank: true }));
}
