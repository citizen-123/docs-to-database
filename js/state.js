// state.js — single source of truth for all answers.
// Shape:
// {
//   version: 1,
//   meta: { businessName, filledBy, updated },
//   data: {
//     <worksheetId>: { <fieldKey>: value, ... }              // non-repeatable
//     <worksheetId>: [ { _id, <fieldKey>: value, ... }, ... ] // repeatable
//   },
//   suggested: { "<path>": true }   // machine-prefilled, awaiting human confirmation
// }
// Table field values are arrays of row objects.
// Paths look like "spreadsheetAudits.abc123.columns.2.meaning" or "nounHarvest.brainDump".

import { PACKET, SCHEMA_VERSION } from "./schema.js";

const STORAGE_KEY = "docs-to-database:v1";
const listeners = new Set();

export let state = blankState();

export function blankState() {
  const data = {};
  for (const ws of PACKET.worksheets) data[ws.id] = ws.repeatable ? [] : blankInstance(ws);
  return {
    version: SCHEMA_VERSION,
    meta: { businessName: "", filledBy: "", updated: null },
    data,
    suggested: {},
  };
}

export function blankInstance(ws) {
  const inst = {};
  for (const f of ws.fields) inst[f.key] = f.kind === "table" ? [] : "";
  return inst;
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── subscriptions ───────────────────────────────────────────────
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(what) {
  state.meta.updated = new Date().toISOString();
  for (const fn of listeners) fn(what);
  scheduleAutosave();
}

// ── path get/set ────────────────────────────────────────────────
/** Mark state dirty (metadata edits etc.) without a structural change. */
export function touch() {
  emit({ type: "touch" });
}

export function getPath(path) {
  const parts = path.split(".");
  let cur = state.data;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) ? cur.find((x) => x._id === p) ?? cur[Number(p)] : cur[p];
  }
  return cur;
}

export function setPath(path, value, { suggested = false } = {}) {
  const parts = path.split(".");
  const last = parts.pop();
  let cur = state.data;
  for (const p of parts) {
    cur = Array.isArray(cur) ? cur.find((x) => x._id === p) ?? cur[Number(p)] : cur[p];
    if (cur == null) return;
  }
  if (Array.isArray(cur)) {
    const idx = cur.findIndex((x) => x._id === last);
    cur[idx >= 0 ? idx : Number(last)] = value;
  } else {
    cur[last] = value;
  }
  if (suggested) state.suggested[path] = true;
  else delete state.suggested[path]; // human touch confirms the value
  emit({ type: "set", path });
}

export function confirmSuggestion(path) {
  delete state.suggested[path];
  emit({ type: "confirm", path });
}

export function isSuggested(path) {
  return !!state.suggested[path];
}

// ── repeatable instances ────────────────────────────────────────
export function addInstance(wsId, ws, prefill = {}, suggestedPaths = []) {
  const inst = { _id: uid(), ...blankInstance(ws), ...prefill };
  state.data[wsId].push(inst);
  for (const sub of suggestedPaths) state.suggested[`${wsId}.${inst._id}.${sub}`] = true;
  emit({ type: "add", wsId, id: inst._id });
  return inst;
}

export function removeInstance(wsId, id) {
  const arr = state.data[wsId];
  const idx = arr.findIndex((x) => x._id === id);
  if (idx >= 0) arr.splice(idx, 1);
  for (const k of Object.keys(state.suggested)) {
    if (k.startsWith(`${wsId}.${id}.`)) delete state.suggested[k];
  }
  emit({ type: "remove", wsId, id });
}

// ── table rows ──────────────────────────────────────────────────
export function addRow(tablePath, row = {}, { suggested = false } = {}) {
  const table = getPath(tablePath);
  if (!Array.isArray(table)) return;
  table.push(row);
  if (suggested) {
    const i = table.length - 1;
    for (const col of Object.keys(row)) {
      if (row[col] !== "" && row[col] != null) state.suggested[`${tablePath}.${i}.${col}`] = true;
    }
  }
  emit({ type: "row", tablePath });
}

export function removeRow(tablePath, index) {
  const table = getPath(tablePath);
  if (!Array.isArray(table)) return;
  table.splice(index, 1);
  // reindex suggestion flags for this table
  const prefix = `${tablePath}.`;
  const next = {};
  for (const [k, v] of Object.entries(state.suggested)) {
    if (!k.startsWith(prefix)) { next[k] = v; continue; }
    const rest = k.slice(prefix.length);
    const [iStr, ...colParts] = rest.split(".");
    const i = Number(iStr);
    if (i === index) continue;          // dropped with the row
    const ni = i > index ? i - 1 : i;   // shift down
    next[`${prefix}${ni}.${colParts.join(".")}`] = v;
  }
  state.suggested = next;
  emit({ type: "row", tablePath });
}

// ── persistence ─────────────────────────────────────────────────
let saveTimer = null;
function scheduleAutosave() {
  if (typeof localStorage === "undefined") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Autosave failed:", e);
    }
  }, 400);
}

export function loadFromStorage() {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== SCHEMA_VERSION) return false;
    state = migrate(parsed);
    return true;
  } catch {
    return false;
  }
}

export function clearAll() {
  state = blankState();
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  emit({ type: "reset" });
}

// ── JSON import/export (the pick-up-where-you-left-off path) ────
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text); // throws on bad JSON — caller surfaces the error
  if (typeof parsed !== "object" || parsed === null || !parsed.data) {
    throw new Error("That file doesn\u2019t look like a saved discovery packet.");
  }
  state = migrate(parsed);
  emit({ type: "import" });
}

// Ensure loaded state has every field the current schema expects
// (so old saves keep working after schema additions).
function migrate(s) {
  const fresh = blankState();
  s.version = SCHEMA_VERSION;
  s.meta = { ...fresh.meta, ...(s.meta || {}) };
  s.suggested = s.suggested || {};
  s.data = s.data || {};
  for (const ws of PACKET.worksheets) {
    if (ws.repeatable) {
      if (!Array.isArray(s.data[ws.id])) s.data[ws.id] = [];
      s.data[ws.id] = s.data[ws.id].map((inst) => ({ _id: inst._id || uid(), ...blankInstance(ws), ...inst }));
    } else {
      s.data[ws.id] = { ...blankInstance(ws), ...(s.data[ws.id] || {}) };
    }
  }
  return s;
}

// ── completion meter (sidebar) ─────────────────────────────────
export function completion(ws) {
  const countFields = (inst) => {
    let filled = 0, total = 0;
    for (const f of ws.fields) {
      total++;
      const v = inst[f.key];
      if (f.kind === "table" ? Array.isArray(v) && v.length > 0 : String(v ?? "").trim() !== "") filled++;
    }
    return [filled, total];
  };
  if (ws.repeatable) {
    const arr = state.data[ws.id];
    if (!arr.length) return 0;
    let f = 0, t = 0;
    for (const inst of arr) { const [fi, ti] = countFields(inst); f += fi; t += ti; }
    return t ? f / t : 0;
  }
  const [f, t] = countFields(state.data[ws.id]);
  return t ? f / t : 0;
}

export function suggestionCount() {
  return Object.keys(state.suggested).length;
}
