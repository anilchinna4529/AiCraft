// Docs — in-app reference for all modules, API endpoints, and environment setup.
// Purely informational; no SF calls required.
import { h } from "../ui.js";
import { MODULES } from "../modules.js";

/**
 * Per-module API endpoint index. Kept in one place so users can see at a glance
 * which /api/salesforce/* routes each module touches. Update if api.js changes.
 */
const MODULE_ENDPOINTS = {
  "query-runner":      ["POST /api/salesforce/query"],
  "soql-builder":      ["POST /api/salesforce/query", "GET /api/salesforce/metadata/describe/:object"],
  "metadata-explorer": ["GET /api/salesforce/metadata/global-describe", "GET /api/salesforce/metadata/describe/:object"],
  "org-manager":       ["GET /api/salesforce/orgs", "DELETE /api/salesforce/orgs/:orgId", "POST /api/salesforce/auth/initiate"],
  "data-loader":       ["POST /api/salesforce/sobjects", "PATCH /api/salesforce/sobjects"],
  "bulk-manager":      ["POST /api/salesforce/query"],
  "smock-it":          ["POST /api/salesforce/sobjects", "GET /api/salesforce/metadata/describe/:object"],
  "schema-viewer":     ["GET /api/salesforce/metadata/describe/:object"],
  "org-comparator":    ["GET /api/salesforce/metadata/global-describe", "GET /api/salesforce/metadata/describe/:object"],
  "reports-insights":  ["POST /api/salesforce/query", "GET /api/salesforce/limits"],
  "apex-debug":        ["POST /api/salesforce/apex/anonymous", "POST /api/salesforce/query"],
  "log-debugger":      ["POST /api/salesforce/query"],
  "package-xml":       ["GET /api/salesforce/metadata/global-describe"],
  "event-monitor":     ["POST /api/salesforce/query"],
  "ai-assistant":      ["(no SF call — local helper)"],
  "tool-suite":        ["GET /api/salesforce/metadata/describe/:object"],
};

const ENV_VARS = [
  { name: "SALESFORCE_CLIENT_ID",    required: true,  notes: "Consumer Key from the Salesforce Connected App." },
  { name: "SALESFORCE_CLIENT_SECRET",required: true,  notes: "Consumer Secret. Store only on the server." },
  { name: "SALESFORCE_LOGIN_URL",    required: false, notes: "Defaults to https://login.salesforce.com. Use test.salesforce.com for sandboxes." },
  { name: "SALESFORCE_API_VERSION",  required: false, notes: "Defaults to v62.0." },
  { name: "SF_ENCRYPTION_KEY",       required: true,  notes: "32-byte hex (64 hex chars). Generate: openssl rand -hex 32." },
  { name: "SITE_URL",                required: false, notes: "Public base URL. Used to build the OAuth redirect_uri." },
];

export default async function render(ctx) {
  const { root } = ctx;

  const header = h("div", { class: "sf-stack", style: { gap: "4px", marginBottom: "16px" } }, [
    h("h2", { style: { margin: 0 } }, "Salesforce Dev — Reference"),
    h("p", { class: "sf-muted" }, "Module catalog, API endpoints, and server configuration used by this workspace."),
  ]);

  // ---------- Module filter ----------
  const filterInput = h("input", {
    class: "sf-input",
    type: "search",
    placeholder: "Filter modules by name, section, or description…",
    style: { maxWidth: "420px" },
  });
  const tableHost = h("div");

  function buildRows(q) {
    const needle = (q || "").trim().toLowerCase();
    const rows = MODULES
      .filter((m) => {
        if (!needle) return true;
        return (
          m.title.toLowerCase().includes(needle) ||
          m.section.toLowerCase().includes(needle) ||
          m.desc.toLowerCase().includes(needle) ||
          m.id.toLowerCase().includes(needle)
        );
      })
      .map((m) => h("tr", {}, [
        h("td", { style: { fontSize: "18px", width: "36px", textAlign: "center" } }, m.icon),
        h("td", {}, [
          h("div", { style: { fontWeight: "600" } }, m.title),
          h("div", { class: "sf-muted", style: { fontSize: "11px" } }, m.id),
        ]),
        h("td", {}, h("span", { class: "sf-pill" }, m.section)),
        h("td", {}, m.desc),
        h("td", { style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: "11px" } },
          (MODULE_ENDPOINTS[m.id] || ["—"]).map((e) => h("div", {}, e))),
      ]));

    tableHost.innerHTML = "";
    if (rows.length === 0) {
      tableHost.append(h("div", { class: "sf-empty" }, [h("p", {}, "No modules match that filter.")]));
      return;
    }
    const table = h("table", { class: "sf-table" }, [
      h("thead", {}, h("tr", {}, [
        h("th", {}, ""),
        h("th", {}, "Module"),
        h("th", {}, "Section"),
        h("th", {}, "Description"),
        h("th", {}, "API endpoints"),
      ])),
      h("tbody", {}, rows),
    ]);
    tableHost.append(h("div", { class: "sf-results" }, table));
  }

  filterInput.addEventListener("input", () => buildRows(filterInput.value));
  buildRows("");

  const modulesSection = h("section", { class: "sf-stack", style: { gap: "10px" } }, [
    h("h3", { style: { margin: "0" } }, `Modules (${MODULES.length})`),
    filterInput,
    tableHost,
  ]);

  // ---------- Environment section ----------
  const envRows = ENV_VARS.map((v) => h("tr", {}, [
    h("td", { style: { fontFamily: "ui-monospace, Menlo, monospace", fontWeight: "600" } }, v.name),
    h("td", {}, h("span", { class: "sf-pill " + (v.required ? "warn" : "") }, v.required ? "required" : "optional")),
    h("td", {}, v.notes),
  ]));
  const envSection = h("section", { class: "sf-stack", style: { gap: "10px", marginTop: "24px" } }, [
    h("h3", { style: { margin: 0 } }, "Environment variables"),
    h("p", { class: "sf-muted" }, "These are read by the server at startup. Missing values will surface in the /health diagnostic."),
    h("div", { class: "sf-results" }, h("table", { class: "sf-table" }, [
      h("thead", {}, h("tr", {}, [h("th", {}, "Name"), h("th", {}, "Status"), h("th", {}, "Notes")])),
      h("tbody", {}, envRows),
    ])),
  ]);

  // ---------- Diagnostics section ----------
  const diagOutput = h("pre", {
    class: "sf-code",
    style: { maxHeight: "320px", overflow: "auto", marginTop: "8px" },
  }, "Click \"Run diagnostics\" to probe /api/salesforce/health.");
  const diagBtn = h("button", { class: "btn btn-secondary" }, "Run diagnostics");
  diagBtn.addEventListener("click", async () => {
    diagBtn.disabled = true;
    diagOutput.textContent = "Running…";
    try {
      const token = localStorage.getItem("aicraft_token");
      const res = await fetch("/api/salesforce/health", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      diagOutput.textContent = `HTTP ${res.status}\n\n` + JSON.stringify(body, null, 2);
    } catch (e) {
      diagOutput.textContent = "Request failed: " + (e?.message || String(e));
    } finally {
      diagBtn.disabled = false;
    }
  });
  const diagSection = h("section", { class: "sf-stack", style: { gap: "10px", marginTop: "24px" } }, [
    h("h3", { style: { margin: 0 } }, "Diagnostics"),
    h("p", { class: "sf-muted" }, "Probe the backend for env, crypto, and database health."),
    diagBtn,
    diagOutput,
  ]);

  // ---------- Quick links ----------
  const linksSection = h("section", { class: "sf-stack", style: { gap: "10px", marginTop: "24px" } }, [
    h("h3", { style: { margin: 0 } }, "Useful references"),
    h("ul", { style: { margin: 0, paddingLeft: "20px" } }, [
      h("li", {}, [
        "Salesforce REST API docs: ",
        h("a", { href: "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/", target: "_blank", rel: "noreferrer" }, "developer.salesforce.com"),
      ]),
      h("li", {}, [
        "SOQL reference: ",
        h("a", { href: "https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/", target: "_blank", rel: "noreferrer" }, "SOQL/SOSL guide"),
      ]),
      h("li", {}, [
        "Connected App setup: ",
        h("a", { href: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm", target: "_blank", rel: "noreferrer" }, "help.salesforce.com"),
      ]),
    ]),
  ]);

  root.append(header, modulesSection, envSection, diagSection, linksSection);
}
