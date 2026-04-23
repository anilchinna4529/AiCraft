// salesforce-dev/api.js
// Thin client-side wrapper over /api/salesforce/* routes.
// Uses the AICraft Supabase JWT stashed in localStorage as `aicraft_token`.

function token() {
  return localStorage.getItem("aicraft_token");
}

async function request(path, { method = "GET", body, query } = {}) {
  const t = token();
  if (!t) {
    window.location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
    throw new Error("Not authenticated");
  }
  let url = path;
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])
    );
    const s = qs.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${t}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try { payload = await res.json(); } catch { /* ignore */ }

  if (res.status === 401) {
    // JWT expired — bounce to login, preserving return.
    localStorage.removeItem("aicraft_token");
    window.location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search);
    throw new Error("Session expired");
  }
  if (!res.ok || (payload && payload.success === false)) {
    const msg = (payload && (payload.error || payload.message)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export const SF = {
  status:       () => request("/api/salesforce/status"),
  initiate:     (body) => request("/api/salesforce/auth/initiate", { method: "POST", body }),
  listOrgs:     () => request("/api/salesforce/orgs"),
  disconnectOrg:(orgId) => request(`/api/salesforce/orgs/${encodeURIComponent(orgId)}`, { method: "DELETE" }),

  query:        (orgId, soql, { tooling = false } = {}) =>
                  request("/api/salesforce/query", { method: "POST", body: { orgId, soql, tooling } }),

  globalDescribe: (orgId, { nocache = false } = {}) =>
                    request("/api/salesforce/metadata/global-describe", { query: { orgId, nocache: nocache ? "true" : undefined } }),
  describe:       (orgId, object, { nocache = false } = {}) =>
                    request(`/api/salesforce/metadata/describe/${encodeURIComponent(object)}`, { query: { orgId, nocache: nocache ? "true" : undefined } }),
  limits:         (orgId) => request("/api/salesforce/limits", { query: { orgId } }),

  create:  (orgId, objectName, fields) => request("/api/salesforce/sobjects", { method: "POST",  body: { orgId, objectName, fields } }),
  update:  (orgId, objectName, id, fields) => request("/api/salesforce/sobjects", { method: "PATCH", body: { orgId, objectName, id, fields } }),
  remove:  (orgId, objectName, id) => request("/api/salesforce/sobjects", { method: "DELETE", query: { orgId, objectName, id } }),

  anonymousApex: (orgId, apex) => request("/api/salesforce/apex/anonymous", { method: "POST", body: { orgId, apex } }),
  invalidateCache: (orgId, prefix) => request("/api/salesforce/cache/invalidate", { method: "POST", body: { orgId, prefix } }),
};

export function toast(msg, kind = "") {
  const el = document.getElementById("sfToast");
  if (!el) return;
  el.className = "sf-toast " + kind;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), 4500);
}
