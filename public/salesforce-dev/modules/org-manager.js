// Org Manager — connected orgs, limits, disconnect.
import { h, esc, requireOrg } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  const orgs = ctx.getOrgs();
  const limitsEl = h("div", { class: "sf-muted" }, "…");

  const rows = orgs.map((o) => {
    const dis = h("button", { class: "btn btn-secondary" }, "Disconnect");
    dis.addEventListener("click", async () => {
      if (!confirm(`Disconnect ${o.display_name || o.username || o.org_id}?`)) return;
      try {
        await api.disconnectOrg(o.org_id);
        toast("Org disconnected", "ok");
        await ctx.refreshOrgs();
        root.innerHTML = "";
        render(ctx);
      } catch (e) {
        toast(e.message, "err");
      }
    });
    return h("tr", {},
      h("td", {}, o.display_name || o.username || o.org_id),
      h("td", {}, o.instance_url || ""),
      h("td", {}, o.username || ""),
      h("td", {}, o.org_type || "—"),
      h("td", {}, dis)
    );
  });

  root.append(
    h("div", { class: "sf-stack" }, [
      h("h2", {}, "Connected Orgs"),
      orgs.length
        ? h("table", { class: "sf-table" },
            h("thead", {}, h("tr", {},
              h("th", {}, "Name"), h("th", {}, "Instance"), h("th", {}, "User"),
              h("th", {}, "Type"), h("th", {}, "")
            )),
            h("tbody", {}, rows))
        : h("p", { class: "sf-muted" }, "No orgs connected yet. Use the Connect button in the header."),
      h("h3", {}, "Current Org Limits"),
      limitsEl,
    ])
  );

  if (!requireOrg(ctx, limitsEl)) return;
  try {
    const lim = await api.limits(ctx.getOrgId());
    const items = Object.entries(lim).slice(0, 40).map(([k, v]) => {
      const max = v?.Max ?? 0;
      const rem = v?.Remaining ?? 0;
      const used = Math.max(0, max - rem);
      const pct = max ? Math.round((used / max) * 100) : 0;
      return h("div", { class: "sf-limit" },
        h("div", {}, [h("strong", {}, k), h("span", { class: "sf-muted" }, ` ${used}/${max}`)]),
        h("div", { class: "sf-bar" }, h("div", { class: "sf-bar-fill", style: { width: pct + "%" } }))
      );
    });
    limitsEl.innerHTML = "";
    limitsEl.append(h("div", { class: "sf-limits-grid" }, items));
  } catch (e) {
    limitsEl.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>`;
  }
}
