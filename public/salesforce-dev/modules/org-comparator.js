// Org Comparator — compare sObject describe between two connected orgs.
import { h, esc, field } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  const orgs = ctx.getOrgs();
  if (orgs.length < 2) {
    root.append(h("p", { class: "sf-muted" }, "Connect at least two orgs to compare."));
    return;
  }

  const mk = (label) => h("select", { class: "sf-input" },
    orgs.map((o) => h("option", { value: o.org_id }, o.display_name || o.username || o.org_id)));
  const orgA = mk("A"), orgB = mk("B");
  orgA.selectedIndex = 0; orgB.selectedIndex = 1;
  const obj = h("input", { class: "sf-input", placeholder: "sObject API name" });
  const runBtn = h("button", { class: "btn btn-primary" }, "Compare");
  const out = h("pre", { class: "sf-code" }, "");

  runBtn.addEventListener("click", async () => {
    const name = obj.value.trim();
    if (!name) return toast("Enter sObject", "warn");
    out.textContent = "Loading…";
    try {
      const [a, b] = await Promise.all([
        api.describe(orgA.value, name),
        api.describe(orgB.value, name),
      ]);
      const setA = new Set((a.fields || []).map((f) => f.name));
      const setB = new Set((b.fields || []).map((f) => f.name));
      const onlyA = [...setA].filter((x) => !setB.has(x));
      const onlyB = [...setB].filter((x) => !setA.has(x));
      out.textContent =
        `Only in A (${onlyA.length}):\n  ${onlyA.join("\n  ") || "(none)"}\n\n` +
        `Only in B (${onlyB.length}):\n  ${onlyB.join("\n  ") || "(none)"}\n\n` +
        `Shared: ${[...setA].filter((x) => setB.has(x)).length} field(s)`;
    } catch (e) {
      out.textContent = e.message;
      toast(e.message, "err");
    }
  });

  root.append(h("div", { class: "sf-stack" }, [
    h("div", { class: "sf-grid-2" }, [field("Org A", orgA), field("Org B", orgB)]),
    field("sObject", obj),
    h("div", {}, runBtn),
    out,
  ]));
}
