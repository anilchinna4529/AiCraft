// salesforce-dev/modules.js
// Registry of all 16 modules. Each module exports a `render(ctx)` function
// that owns its panel DOM. Modules are loaded on demand via dynamic import().

export const MODULES = [
  { id: "query-runner",      title: "Query Runner",       icon: "🔎", section: "Core",         desc: "Execute SOQL / SOSL with rich result grid." },
  { id: "soql-builder",      title: "SOQL Builder",       icon: "🧩", section: "Core",         desc: "Visually construct SOQL from picklists." },
  { id: "metadata-explorer", title: "Metadata Explorer",  icon: "🗂️", section: "Core",         desc: "Browse objects, fields, relationships." },
  { id: "org-manager",       title: "Org Manager",        icon: "🏢", section: "Core",         desc: "Connect, switch and remove orgs." },

  { id: "data-loader",       title: "Data Loader",        icon: "📥", section: "Data",         desc: "CSV-driven bulk insert / update." },
  { id: "bulk-manager",      title: "Bulk Manager",       icon: "🚚", section: "Data",         desc: "Monitor Bulk API v2 jobs." },
  { id: "smock-it",          title: "Smock-it",           icon: "🧪", section: "Data",         desc: "Generate synthetic mock records." },

  { id: "schema-viewer",     title: "Schema Viewer",      icon: "🗺️", section: "Understand",   desc: "ER diagram of relationships." },
  { id: "org-comparator",    title: "Org Comparator",     icon: "⚖️", section: "Understand",   desc: "Diff metadata between two orgs." },
  { id: "reports-insights",  title: "Reports & Insights", icon: "📊", section: "Understand",   desc: "Org-wide KPIs and trends." },

  { id: "apex-debug",        title: "Apex Debug",         icon: "🐞", section: "Dev",          desc: "Analyse stack traces & error patterns." },
  { id: "log-debugger",      title: "Log Debugger",       icon: "📜", section: "Dev",          desc: "Fetch and parse debug logs." },
  { id: "package-xml",       title: "Package.xml",        icon: "📦", section: "Dev",          desc: "Build deployment manifests." },
  { id: "event-monitor",     title: "Event Monitor",      icon: "📡", section: "Dev",          desc: "Event log files + platform events." },

  { id: "ai-assistant",      title: "AI Assistant",       icon: "🤖", section: "Intelligence", desc: "Explain SOQL, draft Apex, summarise logs." },
  { id: "tool-suite",        title: "Tool Suite",         icon: "🧰", section: "Intelligence", desc: "ID converter, field usage, misc utilities." },

  { id: "docs",              title: "Docs & Diagnostics", icon: "📘", section: "Help",         desc: "Module reference, env vars and /health probe." },
];

/**
 * Lazily load a module's render() implementation.
 * Modules live in ./modules/<id>.js and export a default `render(ctx)` function.
 */
export async function loadModule(id) {
  const known = MODULES.find((m) => m.id === id);
  if (!known) throw new Error(`Unknown module: ${id}`);
  const mod = await import(`./modules/${id}.js`);
  if (typeof mod.default !== "function") {
    throw new Error(`Module ${id} does not export a default render() function`);
  }
  return mod.default;
}
