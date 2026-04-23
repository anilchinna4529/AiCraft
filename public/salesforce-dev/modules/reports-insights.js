// Reports & Insights — list recent reports + basic metadata.
import { h, esc, requireOrg, renderTable } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const wrap = h("div", {}, "Loading…");
  try {
    const { result } = await api.query(ctx.getOrgId(),
      "SELECT Id, Name, DeveloperName, Format, LastRunDate, Owner.Name FROM Report ORDER BY LastRunDate DESC NULLS LAST LIMIT 50");
    wrap.innerHTML = "";
    wrap.append(renderTable(result.records || []));
  } catch (e) {
    wrap.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>`;
    toast(e.message, "err");
  }

  root.append(h("div", { class: "sf-stack" }, [
    h("h3", {}, "Recent Reports"),
    h("p", { class: "sf-muted" }, "Running reports in-app via Analytics REST is a planned enhancement."),
    wrap,
  ]));
}
