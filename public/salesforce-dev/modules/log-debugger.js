// Log Debugger — list recent ApexLogs via Tooling API.
import { h, esc, requireOrg, renderTable } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const refreshBtn = h("button", { class: "btn btn-secondary" }, "Refresh");
  const listWrap = h("div", {}, "Loading…");

  async function load() {
    listWrap.innerHTML = "Loading…";
    try {
      const { result } = await api.query(
        ctx.getOrgId(),
        "SELECT Id, Application, Operation, Status, LogLength, StartTime, LogUser.Name FROM ApexLog ORDER BY StartTime DESC LIMIT 50",
        { tooling: true }
      );
      listWrap.innerHTML = "";
      listWrap.append(renderTable(result.records || []));
    } catch (e) {
      listWrap.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>`;
      toast(e.message, "err");
    }
  }

  refreshBtn.addEventListener("click", load);
  root.append(h("div", { class: "sf-stack" }, [
    h("div", { class: "sf-toolbar" }, [h("h3", {}, "Recent Apex Logs"), refreshBtn]),
    listWrap,
  ]));
  load();
}
