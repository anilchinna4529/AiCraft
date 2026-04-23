// Data Loader — CSV-based insert / update (small batches, client-side loop).
import { h, esc, requireOrg, field } from "../ui.js";

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (s) => s.split(",").map((c) => c.trim());
  const headers = split(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const cols = split(l);
    const o = {};
    headers.forEach((h, i) => (o[h] = cols[i] ?? ""));
    return o;
  });
  return { headers, rows };
}

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const obj = h("input", { class: "sf-input", placeholder: "sObject API Name (e.g. Account)" });
  const op = h("select", { class: "sf-input" },
    h("option", { value: "insert" }, "Insert"),
    h("option", { value: "update" }, "Update (requires Id column)")
  );
  const textarea = h("textarea", { class: "sf-textarea", placeholder: "Paste CSV here" });
  const runBtn = h("button", { class: "btn btn-primary" }, "Run");
  const log = h("pre", { class: "sf-code" }, "");

  runBtn.addEventListener("click", async () => {
    const sobj = obj.value.trim();
    if (!sobj) return toast("Enter sObject", "warn");
    const { rows } = parseCsv(textarea.value);
    if (!rows.length) return toast("No rows parsed", "warn");
    if (rows.length > 200) return toast("Limit 200 rows per run", "warn");
    if (!confirm(`${op.value.toUpperCase()} ${rows.length} record(s) on ${sobj}?`)) return;
    log.textContent = "";
    runBtn.disabled = true;
    try {
      let ok = 0, fail = 0;
      for (const [i, row] of rows.entries()) {
        try {
          if (op.value === "insert") {
            const r = await api.create(ctx.getOrgId(), sobj, row);
            log.textContent += `#${i + 1} OK id=${r.id}\n`;
          } else {
            const { Id, ...rest } = row;
            if (!Id) throw new Error("Missing Id");
            await api.update(ctx.getOrgId(), sobj, Id, rest);
            log.textContent += `#${i + 1} OK updated ${Id}\n`;
          }
          ok++;
        } catch (e) {
          fail++;
          log.textContent += `#${i + 1} FAIL ${e.message}\n`;
        }
      }
      toast(`Done. ${ok} ok / ${fail} failed`, fail ? "warn" : "ok");
    } finally {
      runBtn.disabled = false;
    }
  });

  root.append(h("div", { class: "sf-stack" }, [
    h("div", { class: "sf-grid-2" }, [field("sObject", obj), field("Operation", op)]),
    field("CSV", textarea),
    h("div", {}, runBtn),
    log,
  ]));
}
