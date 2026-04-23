// salesforce-dev/ui.js — tiny helpers shared by module files.

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Render an array of records as an HTML table. Handles nested objects minimally. */
export function renderTable(records) {
  const wrap = h("div", { class: "sf-results" });
  if (!records || records.length === 0) {
    wrap.append(h("div", { class: "sf-empty" }, [h("p", {}, "No rows.")]));
    return wrap;
  }
  const cols = Array.from(
    records.reduce((set, r) => { Object.keys(r || {}).forEach((k) => { if (k !== "attributes") set.add(k); }); return set; }, new Set())
  );
  const table = h("table", { class: "sf-table" });
  const thead = h("thead");
  thead.append(h("tr", {}, cols.map((c) => h("th", {}, c))));
  table.append(thead);
  const tbody = h("tbody");
  for (const row of records) {
    tbody.append(h("tr", {}, cols.map((c) => h("td", {}, formatCell(row[c])))));
  }
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

function formatCell(v) {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Require an org; otherwise show a prompt inline and return false.
 *  Optional `target` element receives the empty-state (defaults to ctx.root).
 */
export function requireOrg(ctx, target) {
  if (ctx.getOrgId()) return true;
  const host = target || ctx.root;
  const empty = h("div", { class: "sf-empty" }, [
    h("h3", {}, "No Salesforce org connected"),
    h("p", {}, "Use + Connect Org in the sidebar to authorize an org, then pick a module."),
  ]);
  if (host === ctx.root || host.append) host.append(empty);
  return false;
}

/** Build a simple labelled field row. */
export function field(label, input) {
  return h("label", { class: "sf-stack", style: { gap: "4px" } }, [
    h("span", { style: { fontSize: "11px", color: "var(--sf-muted)", textTransform: "uppercase", letterSpacing: ".05em" } }, label),
    input,
  ]);
}
