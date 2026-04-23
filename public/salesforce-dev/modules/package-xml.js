// Package.xml Generator — pick metadata types and names → produce package.xml.
import { h, esc, field } from "../ui.js";

const COMMON_TYPES = [
  "ApexClass", "ApexTrigger", "ApexPage", "ApexComponent",
  "CustomObject", "CustomField", "CustomTab", "CustomApplication",
  "Flow", "FlowDefinition", "Layout", "PermissionSet", "Profile",
  "Report", "Dashboard", "LightningComponentBundle", "AuraDefinitionBundle",
  "StaticResource", "EmailTemplate", "Workflow", "ValidationRule"
];

export default async function render(ctx) {
  const { root } = ctx;
  const apiVer = h("input", { class: "sf-input", value: "62.0" });
  const rows = h("div", { class: "sf-stack" });
  const out = h("pre", { class: "sf-code" }, "");

  function addRow(type = "", members = "*") {
    const typeSel = h("select", { class: "sf-input" });
    typeSel.append(h("option", { value: "" }, "— type —"));
    COMMON_TYPES.forEach((t) => typeSel.append(h("option", { value: t, selected: t === type }, t)));
    const memIn = h("input", { class: "sf-input", value: members, placeholder: "* or comma-separated names" });
    const rm = h("button", { class: "btn btn-secondary" }, "Remove");
    const row = h("div", { class: "sf-grid-3" }, [typeSel, memIn, rm]);
    rm.addEventListener("click", () => { row.remove(); generate(); });
    [typeSel, memIn].forEach((el) => el.addEventListener("input", generate));
    rows.append(row);
  }

  function generate() {
    const items = [...rows.children].map((row) => {
      const [sel, inp] = row.querySelectorAll("select, input");
      return { type: sel.value, members: inp.value.trim() };
    }).filter((i) => i.type && i.members);

    const body = items.map((i) => {
      const names = i.members === "*"
        ? "    <members>*</members>"
        : i.members.split(",").map((m) => `    <members>${esc(m.trim())}</members>`).join("\n");
      return `  <types>\n${names}\n    <name>${esc(i.type)}</name>\n  </types>`;
    }).join("\n");

    out.textContent =
`<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
${body}
  <version>${esc(apiVer.value || "62.0")}</version>
</Package>`;
  }

  const addBtn = h("button", { class: "btn btn-secondary" }, "Add Type");
  const copyBtn = h("button", { class: "btn btn-primary" }, "Copy");
  addBtn.addEventListener("click", () => { addRow(); generate(); });
  copyBtn.addEventListener("click", () => navigator.clipboard.writeText(out.textContent));
  apiVer.addEventListener("input", generate);

  addRow("ApexClass", "*");
  addRow("CustomObject", "*");

  root.append(h("div", { class: "sf-stack" }, [
    field("API Version", apiVer),
    rows,
    h("div", { class: "sf-toolbar" }, [addBtn, copyBtn]),
    out,
  ]));
  generate();
}
