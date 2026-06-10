// export-docx.js — generate a real .docx in the browser via the `docx` UMD build
// (global `docx`, loaded from CDN in index.html). Mirrors the markdown walk.

import { PACKET } from "./schema.js";

export async function exportDocx(state) {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    HeadingLevel, WidthType, BorderStyle, AlignmentType,
  } = docx;

  const children = [];
  const meta = state.meta || {};

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun(PACKET.title + (meta.businessName ? ` — ${meta.businessName}` : ""))],
    })
  );
  if (meta.filledBy || meta.updated) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: [meta.filledBy && `Filled out by: ${meta.filledBy}`, meta.updated && `Last updated: ${meta.updated.slice(0, 10)}`]
              .filter(Boolean)
              .join("   ·   "),
            italics: true,
          }),
        ],
      })
    );
  }

  const pending = Object.keys(state.suggested || {}).length;
  if (pending > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `⚠ ${pending} machine-suggested value(s) were never confirmed by a person. Treat those answers as unverified.`,
            bold: true,
            color: "B45309",
          }),
        ],
      })
    );
  }

  const cellPara = (text, bold = false) =>
    new Paragraph({ children: [new TextRun({ text: String(text ?? ""), bold, size: 18 })] });

  const makeTable = (fieldDef, rows) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: fieldDef.columns.map(
            (c) => new TableCell({ children: [cellPara(c.label, true)], shading: { fill: "EDE8DC" } })
          ),
        }),
        ...rows.map(
          (row) =>
            new TableRow({
              children: fieldDef.columns.map((c) => new TableCell({ children: [cellPara(row[c.key])] })),
            })
        ),
      ],
    });

  for (const ws of PACKET.worksheets) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(`Worksheet ${ws.num}: ${ws.title}`)] })
    );
    const instances = ws.repeatable ? state.data[ws.id] : [state.data[ws.id]];
    if (ws.repeatable && instances.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: "(not filled out)", italics: true })] }));
      continue;
    }
    instances.forEach((inst, idx) => {
      if (ws.repeatable) {
        const label = String(inst[ws.instanceLabelField] || `${ws.instanceNoun} ${idx + 1}`);
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(label)] }));
      }
      for (const f of ws.fields) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(f.label)] }));
        const v = inst[f.key];
        if (f.kind === "table") {
          if (Array.isArray(v) && v.length) {
            children.push(makeTable(f, v));
          } else {
            children.push(new Paragraph({ children: [new TextRun({ text: "(empty)", italics: true })] }));
          }
        } else {
          const text = String(v ?? "").trim();
          if (text) {
            for (const line of text.split(/\r?\n/)) children.push(new Paragraph({ children: [new TextRun(line)] }));
          } else {
            children.push(new Paragraph({ children: [new TextRun({ text: "(no answer)", italics: true })] }));
          }
        }
      }
    });
  }

  const doc = new Document({
    creator: "docs-to-database",
    title: PACKET.title,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileStem(state) + ".docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function fileStem(state) {
  const biz = (state.meta?.businessName || "").trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  return (biz ? `${biz}-` : "") + "database-discovery-packet";
}
