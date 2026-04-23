// sMock-it — generate mock records via SF.create. Small batches client-side.
import { h, esc, requireOrg, field } from "../ui.js";

function rand(n) { return Math.random().toString(36).slice(2, 2 + n); }
function pick(t) {
  switch (t) {
    case "string": case "textarea": case "picklist": return "Mock " + rand(6);
    case "email": return `mock.${rand(5)}@example.com`;
    case "phone": return "555-" + Math.floor(1000 + Math.random() * 9000);
    case "url": return "https://example.com/" + rand(6);
    case "int": case "double": case "currency": case "percent": return Math.floor(Math.random() * 1000);
    case "boolean": return Math.random() < 0.5;
    case "date": return new Date().toISOString().slice(0, 10);
    case "datetime": return new Date().toISOString();
    default: return null;
  }
}

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const objIn = h("input", { class: "sf-input", placeholder: "sObject API name" });
  const countIn = h("input", { class: "sf-input", type: "number", value: "5", min: "1", max: "50" });
  const runBtn = h("button", { class: "btn btn-primary" }, "Generate");
  const log = h("pre", { class: "sf-code" }, "");

  runBtn.addEventListener("click", async () => {
    const name = objIn.value.trim();
    const count = Math.min(50, Math.max(1, parseInt(countIn.value, 10) || 1));
    if (!name) return toast("Enter sObject", "warn");
    runBtn.disabled = true;
    log.textContent = "Describing…\n";
    try {
      const d = await api.describe(ctx.getOrgId(), name);
      const creatable = (d.fields || []).filter((f) =>
        f.createable && !f.nillable && !f.defaultedOnCreate &&
        !["Id", "OwnerId", "RecordTypeId"].includes(f.name)
      );
      log.textContent += `Required fields: ${creatable.map((f) => f.name).join(", ") || "(none)"}\n`;
      if (!confirm(`Create ${count} ${name} record(s)?`)) { runBtn.disabled = false; return; }
      let ok = 0, fail = 0;
      for (let i = 0; i < count; i++) {
        const rec = {};
        for (const f of creatable) rec[f.name] = pick(f.type);
        try {
          const r = await api.create(ctx.getOrgId(), name, rec);
          log.textContent += `#${i + 1} OK ${r.id}\n`;
          ok++;
        } catch (e) {
          log.textContent += `#${i + 1} FAIL ${e.message}\n`;
          fail++;
        }
      }
      toast(`${ok} created, ${fail} failed`, fail ? "warn" : "ok");
    } catch (e) {
      log.textContent += e.message;
      toast(e.message, "err");
    } finally {
      runBtn.disabled = false;
    }
  });

  root.append(h("div", { class: "sf-stack" }, [
    h("div", { class: "sf-grid-2" }, [field("sObject", objIn), field("Count", countIn)]),
    h("div", {}, runBtn),
    log,
  ]));
}
