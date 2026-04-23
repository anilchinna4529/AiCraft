// Schema Viewer — object + relationships overview.
import { h, esc, requireOrg, field } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const select = h("select", { class: "sf-input" }, h("option", {}, "Loading…"));
  const view = h("div", { class: "sf-muted" }, "Select an object.");

  try {
    const { sobjects } = await api.globalDescribe(ctx.getOrgId());
    select.innerHTML = "";
    select.append(h("option", { value: "" }, "— choose object —"));
    sobjects.filter((s) => s.queryable).forEach((s) =>
      select.append(h("option", { value: s.name }, s.name)));
  } catch (e) { toast(e.message, "err"); }

  select.addEventListener("change", async () => {
    if (!select.value) return;
    view.innerHTML = "Loading…";
    try {
      const d = await api.describe(ctx.getOrgId(), select.value);
      const refs = (d.fields || []).filter((f) => f.type === "reference");
      const children = d.childRelationships || [];
      view.innerHTML = "";
      view.append(
        h("h3", {}, `${d.label} (${d.name})`),
        h("h4", {}, `Lookups / Master-Details (${refs.length})`),
        h("ul", {}, refs.map((f) =>
          h("li", {}, `${f.name} → ${(f.referenceTo || []).join(", ") || "?"}`))),
        h("h4", {}, `Child Relationships (${children.length})`),
        h("ul", {}, children.map((c) =>
          h("li", {}, `${c.childSObject}.${c.field}${c.relationshipName ? " as " + c.relationshipName : ""}`)))
      );
    } catch (e) { view.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>`; }
  });

  root.append(h("div", { class: "sf-stack" }, [field("Object", select), view]));
}
