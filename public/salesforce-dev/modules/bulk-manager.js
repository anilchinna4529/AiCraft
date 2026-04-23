// Bulk Manager — list Bulk API v2 jobs (tooling-ish via REST).
import { h, esc, requireOrg, renderTable } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const refresh = h("button", { class: "btn btn-secondary" }, "Refresh");
  const out = h("div", {}, "Loading…");

  async function load() {
    out.innerHTML = "Loading…";
    try {
      // Jobs info isn't exposed via /query for bulk v2; we surface recent AsyncApexJob as a proxy.
      const { result } = await api.query(ctx.getOrgId(),
        "SELECT Id, JobType, ApexClass.Name, Status, MethodName, CompletedDate FROM AsyncApexJob ORDER BY CreatedDate DESC LIMIT 50");
      out.innerHTML = "";
      out.append(
        h("p", { class: "sf-muted" },
          "Bulk API v2 job submission requires multipart streaming and is planned for a follow-up. Shown below: recent AsyncApexJobs."),
        renderTable(result.records || [])
      );
    } catch (e) {
      out.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>`;
      toast(e.message, "err");
    }
  }

  refresh.addEventListener("click", load);
  root.append(h("div", { class: "sf-stack" }, [
    h("div", { class: "sf-toolbar" }, [h("h3", {}, "Bulk / Async Jobs"), refresh]),
    out,
  ]));
  load();
}
