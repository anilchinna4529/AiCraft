// Query Runner — executes SOQL / Tooling SOQL and renders a results grid.
import { h, renderTable, requireOrg, field } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const soqlInput = h("textarea", {
    class: "sf-textarea",
    placeholder: "SELECT Id, Name FROM Account LIMIT 50",
    spellcheck: "false",
  });
  soqlInput.value = localStorage.getItem("sf_last_soql") || "SELECT Id, Name FROM Account LIMIT 10";

  const toolingChk = h("input", { type: "checkbox", id: "sf-tooling-chk" });
  const runBtn = h("button", { class: "btn btn-primary" }, "Run");
  const csvBtn = h("button", { class: "btn btn-secondary", disabled: true }, "Export CSV");
  const statusEl = h("span", { class: "sf-pill" }, "idle");
  const resultWrap = h("div", { style: { marginTop: "12px" } });
  let lastRecords = [];

  async function run() {
    const soql = soqlInput.value.trim();
    if (!soql) return;
    localStorage.setItem("sf_last_soql", soql);
    statusEl.textContent = "running…";
    statusEl.className = "sf-pill warn";
    runBtn.disabled = true;
    resultWrap.innerHTML = "";
    const t0 = performance.now();
    try {
      const { result } = await api.query(ctx.getOrgId(), soql, { tooling: toolingChk.checked });
      const ms = Math.round(performance.now() - t0);
      statusEl.textContent = `${result.totalSize} row(s) • ${ms}ms`;
      statusEl.className = "sf-pill ok";
      lastRecords = result.records || [];
      csvBtn.disabled = lastRecords.length === 0;
      resultWrap.append(renderTable(lastRecords));
      if (result.done === false && result.nextRecordsUrl) {
        resultWrap.append(
          h("p", { class: "sf-muted", style: { marginTop: "8px" } },
            `More results available (nextRecordsUrl). Add LIMIT to cap.`)
        );
      }
    } catch (e) {
      statusEl.textContent = "error";
      statusEl.className = "sf-pill err";
      toast(e.message, "err");
      resultWrap.append(h("pre", { class: "sf-code" }, e.message));
    } finally {
      runBtn.disabled = false;
    }
  }

  runBtn.addEventListener("click", run);
  csvBtn.addEventListener("click", () => {
    if (!lastRecords.length) return;
    const csv = recordsToCsv(lastRecords);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url, download: `soql-${Date.now()}.csv`,
    });
    document.body.append(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
  soqlInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
  });

  root.append(
    h("div", { class: "sf-stack" }, [
      h("div", { class: "sf-toolbar" }, [
        h("label", {}, [toolingChk, " Tooling API"]),
        runBtn,
        csvBtn,
        statusEl,
        h("span", { class: "sf-muted", style: { fontSize: "12px" } }, "⌘/Ctrl + Enter to run"),
      ]),
      field("SOQL", soqlInput),
      resultWrap,
    ])
  );
}

function recordsToCsv(records) {
  if (!records.length) return "";
  const cols = [...records.reduce((s, r) => {
    Object.keys(r || {}).forEach((k) => { if (k !== "attributes") s.add(k); });
    return s;
  }, new Set())];
  const esc = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of records) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n");
}
