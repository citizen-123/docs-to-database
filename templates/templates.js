// templates.js — download buttons for the manual Markdown worksheets.
// The .md files are the source of truth; Word and PDF are generated in the
// browser from the same files (Word via the `docx` UMD global, PDF via the
// print dialog, matching the main app). The parser below covers exactly the
// constructs the templates use: headings, bold/italic/code, lists, quotes,
// fenced code, tables, and rules.

// ── markdown → blocks ───────────────────────────────────────────
export function parseInline(text) {
  const runs = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[1] != null) runs.push({ text: m[1], bold: true });
    else if (m[2] != null) runs.push({ text: m[2], italic: true });
    else runs.push({ text: m[3], code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

export function parseMarkdown(text) {
  const lines = String(text).split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push({ type: "heading", level: h[1].length, runs: parseInline(h[2]) }); i++; continue; }

    if (/^-{3,}\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }

    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(parseInline(lines[i++].replace(/^>\s?/, "")));
      blocks.push({ type: "quote", lines: buf });
      continue;
    }

    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        const cells = lines[i].replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => c.trim());
        const isSeparator = cells.every((c) => /^:?-+:?$/.test(c));
        if (!isSeparator) rows.push(cells.map(parseInline));
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    const li = line.match(/^([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      const ordered = /\d/.test(li[1]);
      const items = [];
      while (i < lines.length) {
        const m2 = lines[i].match(/^([-*]|\d+\.)\s+(.*)$/);
        if (!m2 || /\d/.test(m2[1]) !== ordered) break;
        items.push(parseInline(m2[2]));
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|-{3,}\s*$|```|>|\||([-*]|\d+\.)\s)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    blocks.push({ type: "para", runs: parseInline(buf.join(" ")) });
  }
  return blocks;
}

// ── blocks → HTML (PDF goes through the print dialog) ───────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function runsToHTML(runs) {
  return runs.map((r) => {
    let t = esc(r.text);
    if (r.code) t = `<code>${t}</code>`;
    if (r.italic) t = `<em>${t}</em>`;
    if (r.bold) t = `<strong>${t}</strong>`;
    return t;
  }).join("");
}

export function blocksToHTML(blocks) {
  return blocks.map((b) => {
    switch (b.type) {
      case "heading": return `<h${b.level}>${runsToHTML(b.runs)}</h${b.level}>`;
      case "hr": return "<hr>";
      case "code": return `<pre>${esc(b.text)}</pre>`;
      case "quote": return `<blockquote>${b.lines.map((l) => `<p>${runsToHTML(l)}</p>`).join("")}</blockquote>`;
      case "table":
        return "<table>" + b.rows.map((row, ri) =>
          "<tr>" + row.map((cell) => ri === 0 ? `<th>${runsToHTML(cell)}</th>` : `<td>${runsToHTML(cell)}</td>`).join("") + "</tr>"
        ).join("") + "</table>";
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        return `<${tag}>` + b.items.map((it) => `<li>${runsToHTML(it)}</li>`).join("") + `</${tag}>`;
      }
      default: return `<p>${runsToHTML(b.runs)}</p>`;
    }
  }).join("\n");
}

// ── blocks → docx ───────────────────────────────────────────────
// parts: [{ blocks }] — each part starts on a new page.
export function buildDocx(parts) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, WidthType, BorderStyle,
  } = docx;
  const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };
  const runTo = (r, extra = {}) =>
    new TextRun({ text: r.text, bold: !!r.bold, italics: !!r.italic, ...(r.code ? { font: "Courier New" } : {}), ...extra });
  const children = [];

  parts.forEach((part, pi) => {
    if (pi > 0) children.push(new Paragraph({ children: [], pageBreakBefore: true }));
    for (const b of part.blocks) {
      switch (b.type) {
        case "heading":
          children.push(new Paragraph({ heading: HEADINGS[b.level], children: b.runs.map((r) => runTo(r)) }));
          break;
        case "hr":
          children.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "B8B2A2" } } }));
          break;
        case "code":
          for (const line of b.text.split("\n")) {
            children.push(new Paragraph({
              shading: { fill: "F2EFE6" },
              children: [new TextRun({ text: line || " ", font: "Courier New", size: 18 })],
            }));
          }
          break;
        case "quote":
          for (const l of b.lines) {
            children.push(new Paragraph({
              indent: { left: 360 },
              border: { left: { style: BorderStyle.SINGLE, size: 12, color: "D8D3C4" } },
              children: l.map((r) => runTo(r)),
            }));
          }
          break;
        case "table":
          children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: b.rows.map((row, ri) => new TableRow({
              tableHeader: ri === 0,
              children: row.map((cell) => new TableCell({
                ...(ri === 0 ? { shading: { fill: "EDE8DC" } } : {}),
                children: [new Paragraph({ children: cell.map((r) => runTo(r, { size: 18, ...(ri === 0 ? { bold: true } : {}) })) })],
              })),
            })),
          }));
          break;
        case "list":
          b.items.forEach((runs, ii) => {
            children.push(new Paragraph({
              ...(b.ordered ? {} : { bullet: { level: 0 } }),
              children: [...(b.ordered ? [new TextRun(`${ii + 1}. `)] : []), ...runs.map((r) => runTo(r))],
            }));
          });
          break;
        default:
          children.push(new Paragraph({ children: b.runs.map((r) => runTo(r)) }));
      }
    }
  });

  return new Document({ creator: "docs-to-database", title: "Database Discovery Packet templates", sections: [{ children }] });
}

// ── page wiring (skipped under node tests) ──────────────────────
if (typeof document !== "undefined" && document.querySelector("[data-file]")) {
  const mdCache = new Map();
  const fetchMd = async (file) => {
    if (!mdCache.has(file)) {
      const resp = await fetch(file);
      if (!resp.ok) throw new Error(`Couldn't load ${file}`);
      mdCache.set(file, await resp.text());
    }
    return mdCache.get(file);
  };

  const toast = (msg) => {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.remove("show"), 4000);
  };

  const download = (name, blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const stem = (file) => file.replace(/\.md$/, "");
  const ALL_STEM = "database-discovery-packet-templates";

  const cards = [...document.querySelectorAll("[data-file]")].map((el) => ({
    file: el.getAttribute("data-file"),
    el,
  }));

  async function getParts(files) {
    const texts = await Promise.all(files.map(fetchMd));
    return texts.map((t) => ({ blocks: parseMarkdown(t) }));
  }

  async function doDownload(files, format, outStem) {
    if (format === "md") {
      const texts = await Promise.all(files.map(fetchMd));
      download(outStem + ".md", new Blob([texts.join("\n\n---\n\n")], { type: "text/markdown" }));
      toast("Markdown downloaded.");
    } else if (format === "docx") {
      if (typeof docx === "undefined") return toast("The Word library hasn't loaded — check your connection and reload.");
      const doc = buildDocx(await getParts(files));
      download(outStem + ".docx", await docx.Packer.toBlob(doc));
      toast("Word document downloaded.");
    } else {
      const parts = await getParts(files);
      const holder = document.getElementById("print-holder");
      holder.innerHTML = parts.map((p) => `<section class="print-tpl">${blocksToHTML(p.blocks)}</section>`).join("");
      const oldTitle = document.title;
      document.title = outStem; // becomes the suggested PDF filename
      document.body.classList.add("printing");
      const cleanup = () => {
        document.body.classList.remove("printing");
        document.title = oldTitle;
        holder.innerHTML = "";
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
    }
  }

  const safely = (fn) => fn().catch((err) => { console.error(err); toast(err.message || "Download failed."); });

  for (const card of cards) {
    card.el.querySelectorAll("button[data-format]").forEach((btn) => {
      btn.addEventListener("click", () =>
        safely(() => doDownload([card.file], btn.getAttribute("data-format"), stem(card.file))));
    });
  }

  document.getElementById("btn-all").addEventListener("click", () => {
    const format = document.getElementById("all-format").value;
    safely(() => doDownload(cards.map((c) => c.file), format, ALL_STEM));
  });
}
