// Tool Suite — Salesforce Id 15↔18, URL builder, timestamp helpers.
import { h, field } from "../ui.js";

// 15→18-char Salesforce Id conversion
function to18(id15) {
  if (!/^[a-zA-Z0-9]{15}$/.test(id15)) return "";
  const suffixChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
  let suffix = "";
  for (let i = 0; i < 3; i++) {
    let bits = 0;
    for (let j = 0; j < 5; j++) {
      const c = id15.charAt(i * 5 + j);
      if (c >= "A" && c <= "Z") bits |= 1 << j;
    }
    suffix += suffixChars.charAt(bits);
  }
  return id15 + suffix;
}

export default async function render(ctx) {
  const { root } = ctx;

  // Id converter
  const idIn = h("input", { class: "sf-input", placeholder: "15-char Id" });
  const idOut = h("input", { class: "sf-input", readonly: true });
  idIn.addEventListener("input", () => {
    idOut.value = to18(idIn.value.trim());
  });

  // Record URL builder
  const orgs = ctx.getOrgs();
  const orgSel = h("select", { class: "sf-input" },
    orgs.map((o) => h("option", { value: o.instance_url }, o.display_name || o.username || o.org_id)));
  const recId = h("input", { class: "sf-input", placeholder: "Record Id (15 or 18)" });
  const urlOut = h("input", { class: "sf-input", readonly: true });
  function buildUrl() {
    const base = orgSel.value;
    const id = recId.value.trim();
    urlOut.value = base && id ? `${base}/lightning/r/${id}/view` : "";
  }
  [orgSel, recId].forEach((el) => el.addEventListener("input", buildUrl));

  // Timestamp helpers
  const tsIn = h("input", { class: "sf-input", placeholder: "ISO 8601 or epoch millis" });
  const tsOut = h("pre", { class: "sf-code" }, "");
  tsIn.addEventListener("input", () => {
    const v = tsIn.value.trim();
    if (!v) { tsOut.textContent = ""; return; }
    const asNum = Number(v);
    const d = !Number.isNaN(asNum) && /^\d+$/.test(v) ? new Date(asNum) : new Date(v);
    tsOut.textContent = isNaN(d) ? "Invalid" :
      `ISO: ${d.toISOString()}\nLocal: ${d.toString()}\nEpoch ms: ${d.getTime()}`;
  });

  root.append(
    h("div", { class: "sf-stack" }, [
      h("h3", {}, "Salesforce Id 15 → 18"),
      h("div", { class: "sf-grid-2" }, [field("Input", idIn), field("Output", idOut)]),
      h("hr"),
      h("h3", {}, "Record URL Builder"),
      h("div", { class: "sf-grid-2" }, [field("Org", orgSel), field("Record Id", recId)]),
      field("URL", urlOut),
      h("hr"),
      h("h3", {}, "Timestamp Converter"),
      field("Input", tsIn),
      tsOut,
    ])
  );
}
