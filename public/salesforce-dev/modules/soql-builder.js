// SOQL Builder — pick sObject + fields → generate SOQL → hand off to Query Runner.
import { h, esc, requireOrg, field } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const objSelect = h("select", { class: "sf-input" }, h("option", { value: "" }, "Loading…"));
  const fieldsBox = h("div", { class: "sf-fields-grid" });
  const whereInput = h("input", { class: "sf-input", placeholder: "e.g. Name LIKE 'A%'" });
  const orderInput = h("input", { class: "sf-input", placeholder: "e.g. CreatedDate DESC" });
  const limitInput = h("input", { class: "sf-input", type: "number", value: "50", min: "1", max: "2000" });
  const preview = h("pre", { class: "sf-code" }, "SELECT Id FROM …");
  const runBtn = h("button", { class: "btn btn-primary" }, "Open in Query Runner");

  try {
    const { sobjects } = await api.globalDescribe(ctx.getOrgId());
    objSelect.innerHTML = "";
    objSelect.append(h("option", { value: "" }, "— choose object —"));
    for (const s of sobjects) {
      if (!s.queryable) continue;
      objSelect.append(h("option", { value: s.name }, `${s.label || s.name} (${s.name})`));
    }
  } catch (e) {
    toast(e.message, "err");
  }

  async function loadFields() {
    const name = objSelect.value;
    fieldsBox.innerHTML = "";
    if (!name) { updatePreview(); return; }
    try {
      const d = await api.describe(ctx.getOrgId(), name);
      for (const f of d.fields || []) {
        const id = "fld_" + f.name;
        const cb = h("input", { type: "checkbox", id, value: f.name });
        if (["Id", "Name"].includes(f.name)) cb.checked = true;
        cb.addEventListener("change", updatePreview);
        fieldsBox.append(h("label", { class: "sf-check", for: id }, [cb, " ", f.name,
          h("small", { class: "sf-muted" }, ` ${f.type}`)]));
      }
    } catch (e) {
      toast(e.message, "err");
    }
    updatePreview();
  }

  function selectedFields() {
    return [...fieldsBox.querySelectorAll("input[type=checkbox]:checked")].map((c) => c.value);
  }

  function updatePreview() {
    const obj = objSelect.value;
    if (!obj) { preview.textContent = "SELECT Id FROM …"; return; }
    const fields = selectedFields();
    const fieldList = fields.length ? fields.join(", ") : "Id";
    let q = `SELECT ${fieldList} FROM ${obj}`;
    if (whereInput.value.trim()) q += ` WHERE ${whereInput.value.trim()}`;
    if (orderInput.value.trim()) q += ` ORDER BY ${orderInput.value.trim()}`;
    if (limitInput.value) q += ` LIMIT ${parseInt(limitInput.value, 10) || 50}`;
    preview.textContent = q;
  }

  [objSelect, whereInput, orderInput, limitInput].forEach((el) =>
    el.addEventListener("input", () => (el === objSelect ? loadFields() : updatePreview()))
  );

  runBtn.addEventListener("click", () => {
    if (!objSelect.value) { toast("Pick an object first", "warn"); return; }
    localStorage.setItem("sf_last_soql", preview.textContent);
    location.hash = "#/module/query-runner";
  });

  root.append(
    h("div", { class: "sf-stack" }, [
      field("sObject", objSelect),
      h("div", { class: "sf-muted" }, "Fields"),
      fieldsBox,
      h("div", { class: "sf-grid-2" }, [
        field("WHERE", whereInput),
        field("ORDER BY", orderInput),
      ]),
      field("LIMIT", limitInput),
      h("h4", {}, "Preview"),
      preview,
      h("div", {}, runBtn),
    ])
  );
}
