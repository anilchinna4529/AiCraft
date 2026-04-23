// salesforce-dev/app.js — shell controller, org state, module router.

import { SF, toast } from "./api.js";
import { MODULES, loadModule } from "./modules.js";

const state = {
  orgs: [],
  currentOrgId: null,
  currentModuleId: null,
};

const LS_KEYS = {
  LAST_ORG: "sf_last_org",
  LAST_MODULE: "sf_last_module",
};

// ---------- bootstrapping ----------
init().catch((e) => {
  console.error(e);
  toast(e.message || "Failed to load", "err");
});

async function init() {
  // Guard: the shell requires an AiCraft Supabase JWT.
  if (!localStorage.getItem("aicraft_token")) {
    const next = encodeURIComponent(location.pathname + location.search);
    window.location.href = `/login.html?next=${next}`;
    return;
  }

  wireChrome();
  renderModuleGrid();
  renderSidebar();
  const healthLabel = document.getElementById("sfHealthLabel");
  if (healthLabel) healthLabel.textContent = `${MODULES.length} modules`;

  const status = await SF.status().catch(() => ({ configured: false }));
  if (!status.configured) {
    toast("Salesforce is not configured on the server (set SALESFORCE_CLIENT_ID & SF_ENCRYPTION_KEY).", "err");
  }

  await refreshOrgs();
  await autoResume();
  // Fire-and-forget health probe to update sidebar indicator.
  probeHealth();
}

async function probeHealth() {
  const dot = document.getElementById("sfHealthDot");
  const label = document.getElementById("sfHealthLabel");
  if (!dot) return;
  try {
    const t = localStorage.getItem("aicraft_token");
    const res = await fetch("/api/salesforce/health", {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ready) {
      dot.className = "sf-health-dot ok";
      dot.title = "Backend healthy";
    } else {
      dot.className = "sf-health-dot err";
      const failing = Object.entries(body.checks || {})
        .filter(([, v]) => v && v.ok === false)
        .map(([k]) => k).join(", ") || `HTTP ${res.status}`;
      dot.title = "Backend not ready: " + failing;
      if (label) label.textContent = `${MODULES.length} modules • degraded`;
    }
  } catch {
    dot.className = "sf-health-dot warn";
    dot.title = "Health check failed";
  }
}

function wireChrome() {
  document.getElementById("sfConnectBtn")?.addEventListener("click", connectOrg);
  document.getElementById("sfConnectBtnHero")?.addEventListener("click", connectOrg);
  document.getElementById("sfDisconnectBtn")?.addEventListener("click", disconnectOrg);
  document.getElementById("sfLogoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("aicraft_token");
    location.href = "/index.html";
  });
  document.getElementById("sfOrgSelect")?.addEventListener("change", (e) => {
    setCurrentOrg(e.target.value);
  });

  // URL ?connected=1&org=... comes from oauth callback
  const url = new URL(location.href);
  if (url.searchParams.get("connected") === "1") {
    toast("Salesforce org connected", "ok");
    const orgParam = url.searchParams.get("org");
    if (orgParam) localStorage.setItem(LS_KEYS.LAST_ORG, orgParam);
    url.searchParams.delete("connected"); url.searchParams.delete("org");
    history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }

  // Module router via hash: #/module/<id>
  window.addEventListener("hashchange", handleHashChange);
}

// ---------- org state ----------
async function refreshOrgs() {
  try {
    const { orgs } = await SF.listOrgs();
    state.orgs = orgs || [];
  } catch (e) {
    state.orgs = [];
  }
  const sel = document.getElementById("sfOrgSelect");
  sel.innerHTML = "";
  if (state.orgs.length === 0) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "— No orgs connected —";
    sel.appendChild(opt);
    document.getElementById("sfOrgChip").hidden = true;
    document.getElementById("sfDisconnectBtn").hidden = true;
    state.currentOrgId = null;
    return;
  }
  for (const org of state.orgs) {
    const opt = document.createElement("option");
    opt.value = org.org_id;
    opt.textContent = `${org.display_name || org.username || org.org_id} (${org.org_type || "org"})`;
    sel.appendChild(opt);
  }
  const preferred = localStorage.getItem(LS_KEYS.LAST_ORG);
  const pick = state.orgs.find((o) => o.org_id === preferred) || state.orgs[0];
  sel.value = pick.org_id;
  setCurrentOrg(pick.org_id, { silent: true });
}

function setCurrentOrg(orgId, { silent = false } = {}) {
  state.currentOrgId = orgId || null;
  const org = state.orgs.find((o) => o.org_id === orgId);
  const chip = document.getElementById("sfOrgChip");
  if (org) {
    chip.hidden = false;
    chip.textContent = `● ${org.org_type || "Org"}`;
    localStorage.setItem(LS_KEYS.LAST_ORG, org.org_id);
    document.getElementById("sfDisconnectBtn").hidden = false;
  } else {
    chip.hidden = true;
    document.getElementById("sfDisconnectBtn").hidden = true;
  }
  if (!silent && state.currentModuleId) renderModule(state.currentModuleId);
}

async function connectOrg() {
  try {
    const useSandbox = confirm("Connecting a Sandbox? OK = Sandbox (test.salesforce.com), Cancel = Production (login.salesforce.com).");
    const loginUrl = useSandbox ? "https://test.salesforce.com" : "https://login.salesforce.com";
    const { authorizationUrl } = await SF.initiate({ loginUrl, returnPath: location.pathname + location.hash });
    window.location.href = authorizationUrl;
  } catch (e) {
    toast(e.message, "err");
  }
}

async function disconnectOrg() {
  if (!state.currentOrgId) return;
  if (!confirm("Disconnect this Salesforce org? Tokens will be deleted.")) return;
  try {
    await SF.disconnectOrg(state.currentOrgId);
    toast("Disconnected", "ok");
    await refreshOrgs();
    renderModule(state.currentModuleId || "welcome");
  } catch (e) {
    toast(e.message, "err");
  }
}

// ---------- sidebar / grid ----------
function renderSidebar() {
  const nav = document.getElementById("sfNav");
  nav.innerHTML = "";
  const sections = [...new Set(MODULES.map((m) => m.section))];
  for (const section of sections) {
    const h = document.createElement("div");
    h.className = "sf-nav-section";
    h.textContent = section;
    nav.appendChild(h);
    for (const m of MODULES.filter((x) => x.section === section)) {
      const a = document.createElement("a");
      a.href = `#/module/${m.id}`;
      a.dataset.moduleId = m.id;
      a.innerHTML = `<span class="icon">${m.icon}</span><span>${m.title}</span>`;
      nav.appendChild(a);
    }
  }
}

function renderModuleGrid() {
  const grid = document.getElementById("sfModuleGrid");
  if (!grid) return;
  grid.innerHTML = "";
  for (const m of MODULES) {
    const card = document.createElement("button");
    card.className = "sf-module-card";
    card.type = "button";
    card.innerHTML = `
      <div class="m-icon">${m.icon}</div>
      <h3>${m.title}</h3>
      <p>${m.desc}</p>`;
    card.addEventListener("click", () => {
      location.hash = `#/module/${m.id}`;
    });
    grid.appendChild(card);
  }
}

// ---------- routing ----------
async function autoResume() {
  const hash = location.hash.match(/^#\/module\/([a-z0-9-]+)/);
  if (hash) {
    renderModule(hash[1]);
    return;
  }
  const last = localStorage.getItem(LS_KEYS.LAST_MODULE);
  if (last && MODULES.find((m) => m.id === last)) {
    location.hash = `#/module/${last}`;
  } else {
    renderWelcome();
  }
}

function handleHashChange() {
  const m = location.hash.match(/^#\/module\/([a-z0-9-]+)/);
  if (m) renderModule(m[1]);
  else renderWelcome();
}

function renderWelcome() {
  state.currentModuleId = null;
  document.getElementById("sfModuleTitle").textContent = "Welcome";
  document.getElementById("sfModuleSub").textContent = "Pick a module from the left to get started.";
  const body = document.getElementById("sfModuleBody");
  body.innerHTML = "";
  // Rebuild welcome inline (simpler than cache)
  const wrap = document.createElement("div");
  wrap.className = "sf-welcome";
  wrap.innerHTML = `
    <div class="sf-banner">
      <h2>Salesforce Developer Toolkit</h2>
      <p>16 focused developer modules — SOQL, metadata, bulk loader, debug log analysis, AI assistance and more.</p>
      <div class="sf-banner-actions">
        <button class="btn btn-primary" id="sfConnectBtnHero2">Connect Salesforce Org</button>
        <a class="btn btn-ghost" href="/ai-tools.html">← Back to marketplace</a>
      </div>
    </div>
    <div class="sf-module-grid" id="sfModuleGrid2"></div>`;
  body.appendChild(wrap);
  document.getElementById("sfConnectBtnHero2").addEventListener("click", connectOrg);
  // re-render grid into new container
  const grid = document.getElementById("sfModuleGrid2");
  for (const m of MODULES) {
    const card = document.createElement("button");
    card.className = "sf-module-card";
    card.type = "button";
    card.innerHTML = `<div class="m-icon">${m.icon}</div><h3>${m.title}</h3><p>${m.desc}</p>`;
    card.addEventListener("click", () => (location.hash = `#/module/${m.id}`));
    grid.appendChild(card);
  }
  highlightNav(null);
}

async function renderModule(id) {
  const def = MODULES.find((m) => m.id === id);
  if (!def) { renderWelcome(); return; }
  state.currentModuleId = id;
  localStorage.setItem(LS_KEYS.LAST_MODULE, id);
  highlightNav(id);

  document.getElementById("sfModuleTitle").textContent = def.title;
  document.getElementById("sfModuleSub").textContent = def.desc;

  const body = document.getElementById("sfModuleBody");
  body.innerHTML = `<div class="sf-loading">Loading ${def.title}…</div>`;

  try {
    const render = await loadModule(id);
    // Clear and hand off to the module.
    body.innerHTML = "";
    await render({
      root: body,
      api: SF,
      toast,
      getOrgId: () => state.currentOrgId,
      getOrgs: () => state.orgs,
      refreshOrgs,
    });
  } catch (e) {
    console.error(e);
    body.innerHTML = `<div class="sf-empty"><h3>Couldn't load ${def.title}</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function highlightNav(activeId) {
  document.querySelectorAll(".sf-nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.moduleId === activeId);
  });
}

// ---------- shared helpers re-exported ----------
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
