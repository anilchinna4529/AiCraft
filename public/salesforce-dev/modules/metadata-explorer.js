// Metadata Explorer — browse sObjects, then fields & describe info.
import { h, esc, requireOrg } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const filter = h("input", { class: "sf-input", placeholder: "Filter objects…" });
  const list = h("div", { class: "sf-list" });
  const detail = h("div", { class: "sf-detail sf-muted" }, "Select an object to see fields.");
  let sobjects = [];

  async function load() {
    list.innerHTML = "Loading…";
    try {
      const { sobjects: sObjs } = await api.globalDescribe(ctx.getOrgId());
      sobjects = sObjs || [];
      drawList("");
    } catch (e) {
      toast(e.message, "err");
      list.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>`;
    }
  }

  function drawList(q) {
    const ql = q.toLowerCase();
    list.innerHTML = "";
    const filtered = sobjects
      .filter((s) => !ql || s.name.toLowerCase().includes(ql) || (s.label || "").toLowerCase().includes(ql))
      .slice(0, 500);
    for (const s of filtered) {
      const item = h("button", { class: "sf-list-item", "data-name": s.name },
        h("div", {}, s.label || s.name),
        h("small", { class: "sf-muted" }, s.name)
      );
      item.addEventListener("click", () => showDetail(s.name));
      list.append(item);
    }
    if (!filtered.length) list.append(h("p", { class: "sf-muted" }, "No matches."));
  }

  filter.addEventListener("input", () => drawList(filter.value));

  async function showDetail(name) {
    detail.innerHTML = "Loading…";
    try {
      const d = await api.describe(ctx.getOrgId(), name);
      const fields = d.fields || [];
      const rows = fields.map((f) =>
        h("tr", {},
          h("td", {}, f.name),
          h("td", {}, f.label || ""),
          h("td", {}, f.type),
          h("td", {}, String(f.length ?? "")),
          h("td", {}, f.custom ? "✓" : ""),
          h("td", {}, f.nillable ? "✓" : "")
        )
      );
      detail.innerHTML = "";
      detail.append(
        h("h3", {}, `${d.label || name} (${d.name})`),
        h("p", { class: "sf-muted" },
          `${fields.length} fields • keyPrefix=${d.keyPrefix || "—"} • custom=${d.custom ? "yes" : "no"}`),
        h("table", { class: "sf-table" },
          h("thead", {}, h("tr", {},
            h("th", {}, "API Name"), h("th", {}, "Label"), h("th", {}, "Type"),
            h("th", {}, "Length"), h("th", {}, "Custom"), h("th", {}, "Nillable")
          )),
          h("tbody", {}, rows)
        )
      );
    } catch (e) {
      detail.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>`;
    }
  }

  root.append(
    h("div", { class: "sf-split" }, [
      h("div", { class: "sf-pane" }, [
        h("div", { class: "sf-toolbar" }, filter),
        list,
      ]),
      detail,
    ])
  );
  load();
}
