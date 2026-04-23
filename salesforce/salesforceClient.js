// salesforce/salesforceClient.js
// Thin wrapper around the Salesforce REST / Tooling / Metadata APIs.
// - Uses native fetch (Node 20+)
// - Handles 401 with a single transparent token refresh
// - Logs every call to salesforce_api_logs (no secrets)
// - Enforces (user_id, org_id) ownership at the call site via getTokensForOrg()

import { getSalesforceConfig, SF_API_VERSION } from "./config.js";
import { getTokensForOrg, updateAccessToken, logApiCall } from "./tokenStore.js";

export class SalesforceAuthError extends Error {
  constructor(msg) { super(msg); this.name = "SalesforceAuthError"; this.status = 401; }
}
export class SalesforceApiError extends Error {
  constructor(msg, status, body) {
    super(msg);
    this.name = "SalesforceApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Build a SalesforceClient for a specific (userId, orgId).
 * Always go through this factory so multi-tenant isolation is enforced.
 */
export async function getClient(userId, orgId) {
  const tokens = await getTokensForOrg(userId, orgId);
  if (!tokens) {
    throw new SalesforceAuthError("No Salesforce connection for this user+org");
  }
  return new SalesforceClient({ userId, orgId, tokens });
}

export class SalesforceClient {
  constructor({ userId, orgId, tokens }) {
    this.userId = userId;
    this.orgId = orgId;
    this.instanceUrl = tokens.instanceUrl.replace(/\/$/, "");
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.apiVersion = SF_API_VERSION;
  }

  // ---- low-level ----

  async request(method, path, { body, query, headers = {}, retriedOn401 = false } = {}) {
    const url = this._buildUrl(path, query);
    const started = Date.now();
    let statusCode = 0;
    let errorMsg = null;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": body ? "application/json" : undefined,
          Accept: "application/json",
          ...headers,
        },
        body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      });
      statusCode = res.status;

      if (res.status === 401 && !retriedOn401 && this.refreshToken) {
        // Try one silent refresh, then retry.
        await this._refreshAccessToken();
        return this.request(method, path, { body, query, headers, retriedOn401: true });
      }

      const text = await res.text();
      const json = text ? safeJson(text) : null;

      if (!res.ok) {
        const message = extractSfError(json) || `Salesforce ${res.status}`;
        errorMsg = message;
        throw new SalesforceApiError(message, res.status, json ?? text);
      }
      return json;
    } catch (e) {
      if (!errorMsg) errorMsg = e.message;
      throw e;
    } finally {
      logApiCall({
        userId: this.userId,
        orgId: this.orgId,
        endpoint: `${method} ${path}`,
        method,
        statusCode,
        durationMs: Date.now() - started,
        cached: false,
        errorMsg,
      });
    }
  }

  _buildUrl(path, query) {
    const base = path.startsWith("/") ? `${this.instanceUrl}${path}` : `${this.instanceUrl}/${path}`;
    if (!query || Object.keys(query).length === 0) return base;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    }
    return `${base}?${qs.toString()}`;
  }

  async _refreshAccessToken() {
    if (!this.refreshToken) throw new SalesforceAuthError("No refresh token available");
    const cfg = getSalesforceConfig();
    // We don't know the original login_url (prod vs sandbox). Token refresh is
    // domain-independent; instance URL works too, but login.salesforce.com is safer.
    const tokenUrl = `${cfg.defaultLoginUrl}/services/oauth2/token`;
    const params = new URLSearchParams();
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", this.refreshToken);
    params.set("client_id", cfg.clientId);
    if (cfg.clientSecret) params.set("client_secret", cfg.clientSecret);

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      throw new SalesforceAuthError(json.error_description || json.error || "Refresh failed");
    }
    this.accessToken = json.access_token;
    const expiresAt = json.issued_at && json.expires_in
      ? new Date(Number(json.issued_at) + Number(json.expires_in) * 1000).toISOString()
      : null;
    await updateAccessToken(this.userId, this.orgId, this.accessToken, expiresAt);
  }

  // ---- high-level helpers ----

  dataPath(suffix) { return `/services/data/${this.apiVersion}${suffix}`; }
  toolingPath(suffix) { return `/services/data/${this.apiVersion}/tooling${suffix}`; }

  async query(soql) {
    assertSafeSoql(soql);
    return this.request("GET", this.dataPath("/query"), { query: { q: soql } });
  }

  async queryMore(nextRecordsUrl) {
    // nextRecordsUrl is returned as a relative path like /services/data/v62.0/query/...
    if (!nextRecordsUrl || typeof nextRecordsUrl !== "string") throw new Error("nextRecordsUrl required");
    if (!nextRecordsUrl.startsWith("/services/data/")) throw new Error("Invalid nextRecordsUrl");
    return this.request("GET", nextRecordsUrl);
  }

  async queryAll(soql) {
    assertSafeSoql(soql);
    return this.request("GET", this.dataPath("/queryAll"), { query: { q: soql } });
  }

  async toolingQuery(soql) {
    assertSafeSoql(soql);
    return this.request("GET", this.toolingPath("/query"), { query: { q: soql } });
  }

  async describeGlobal() {
    return this.request("GET", this.dataPath("/sobjects"));
  }

  async describeSObject(objectName) {
    assertIdentifier(objectName, "objectName");
    return this.request("GET", this.dataPath(`/sobjects/${encodeURIComponent(objectName)}/describe`));
  }

  async getLimits() {
    return this.request("GET", this.dataPath("/limits"));
  }

  async getUserInfo() {
    // /services/oauth2/userinfo returns identity about the authenticated user.
    return this.request("GET", "/services/oauth2/userinfo");
  }

  // --- DML ---
  async createRecord(objectName, fields) {
    assertIdentifier(objectName, "objectName");
    return this.request("POST", this.dataPath(`/sobjects/${encodeURIComponent(objectName)}`), { body: fields });
  }
  async updateRecord(objectName, id, fields) {
    assertIdentifier(objectName, "objectName");
    assertSalesforceId(id);
    return this.request("PATCH", this.dataPath(`/sobjects/${encodeURIComponent(objectName)}/${encodeURIComponent(id)}`), { body: fields });
  }
  async deleteRecord(objectName, id) {
    assertIdentifier(objectName, "objectName");
    assertSalesforceId(id);
    return this.request("DELETE", this.dataPath(`/sobjects/${encodeURIComponent(objectName)}/${encodeURIComponent(id)}`));
  }

  // --- Apex anonymous (Tooling API) ---
  async executeAnonymous(apexBody) {
    if (typeof apexBody !== "string" || apexBody.length === 0) throw new Error("apexBody required");
    if (apexBody.length > 100000) throw new Error("Apex body too large");
    return this.request("GET", this.toolingPath("/executeAnonymous"), { query: { anonymousBody: apexBody } });
  }
}

// ------------------ helpers ------------------

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function extractSfError(json) {
  if (!json) return null;
  if (Array.isArray(json) && json[0]?.message) return `${json[0].errorCode || "ERROR"}: ${json[0].message}`;
  if (json.error_description) return json.error_description;
  if (json.message) return json.message;
  return null;
}

// Reject clearly unsafe SOQL. Salesforce parameterizes at the URL layer,
// but we add defence-in-depth: length caps, control-char blocks, keyword allow-list.
export function assertSafeSoql(soql) {
  if (typeof soql !== "string") throw new Error("soql must be a string");
  if (soql.length === 0) throw new Error("soql empty");
  if (soql.length > 20000) throw new Error("soql too long (max 20000 chars)");
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(soql)) throw new Error("soql contains control characters");
  const trimmed = soql.trim();
  if (!/^select\b/i.test(trimmed) && !/^find\b/i.test(trimmed)) {
    throw new Error("Only SELECT or FIND queries are accepted");
  }
}

export function assertIdentifier(name, label) {
  if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(name)) {
    throw new Error(`Invalid ${label || "identifier"}: ${name}`);
  }
}

export function assertSalesforceId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9]{15,18}$/.test(id)) {
    throw new Error(`Invalid Salesforce Id: ${id}`);
  }
}
