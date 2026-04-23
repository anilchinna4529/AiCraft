// salesforce/config.js
// Centralized config + environment reads for the Salesforce Developer Toolkit.

export const SF_API_VERSION = process.env.SF_API_VERSION || "v62.0";

export function getSalesforceConfig() {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET; // optional for public clients with PKCE
  const defaultLoginUrl = process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com";
  const siteUrl = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const redirectUri = `${siteUrl}/api/salesforce/auth/callback`;

  return {
    clientId,
    clientSecret,
    defaultLoginUrl,
    redirectUri,
    apiVersion: SF_API_VERSION,
    // Scopes: api (REST), refresh_token (offline access), id (user info), web (HTML access for some tooling APIs)
    scopes: (process.env.SALESFORCE_SCOPES || "api refresh_token offline_access id").trim(),
  };
}

export function assertSalesforceConfigured() {
  const cfg = getSalesforceConfig();
  if (!cfg.clientId) {
    const e = new Error(
      "Salesforce is not configured. Set SALESFORCE_CLIENT_ID (and optionally SALESFORCE_CLIENT_SECRET) in env."
    );
    e.status = 501;
    throw e;
  }
  return cfg;
}

// Cache TTLs in seconds (plan §7)
export const CACHE_TTL = {
  DESCRIBE_GLOBAL: 60 * 60,        // 1 hour
  DESCRIBE_OBJECT: 60 * 60,        // 1 hour
  SOQL: 15 * 60,                   // 15 minutes
  LOGS: 5 * 60,                    // 5 minutes
  ORG_INFO: 24 * 60 * 60,          // 1 day
};
