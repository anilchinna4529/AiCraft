// Event Monitor — list EventLogFile records (if licensed).
import { h, esc, requireOrg, renderTable } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const out = h("div", {}, "Loading…");
  try {
    const { result } = await api.query(ctx.getOrgId(),
      "SELECT Id, EventType, LogDate, LogFileLength, Interval FROM EventLogFile ORDER BY LogDate DESC LIMIT 50");
    out.innerHTML = "";
    out.append(renderTable(result.records || []));
  } catch (e) {
    out.innerHTML = `<pre class="sf-code">${esc(e.message)}</pre>` +
      `<p class="sf-muted">EventLogFile requires the Event Monitoring add-on.</p>`;
    toast(e.message, "err");
  }
  root.append(h("div", { class: "sf-stack" }, [h("h3", {}, "Event Log Files"), out]));
}
