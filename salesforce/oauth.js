// salesforce/oauth.js
// Salesforce OAuth 2.0 Authorization Code + PKCE helper.
// Spec: https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm

import { getSalesforceConfig } from "./config.js";
import { generateCodeVerifier, codeChallengeFromVerifier, randomState } from "./crypto.js";
import { saveOAuthState, consumeOAuthState, upsertTokens } from "./tokenStore.js";

// Allow only Salesforce-known login domains. Prevents open-redirect abuse.
const ALLOWED_LOGIN_HOSTS = new Set([
  "login.salesforce.com",
  "test.salesforce.com",
]);

function normalizeLoginUrl(loginUrl) {
  const cfg = getSalesforceConfig();
  const chosen = (loginUrl || cfg.defaultLoginUrl).replace(/\/$/, "");
  let u;
  try { u = new URL(chosen); } catch { throw new Error("Invalid login URL"); }
  if (u.protocol !== "https:") throw new Error("login URL must be https");
  // Allow my-domain.my.salesforce.com too (custom domains).
  const host = u.hostname.toLowerCase();
  const isCustomMyDomain = host.endsWith(".my.salesforce.com");
  if (!ALLOWED_LOGIN_HOSTS.has(host) && !isCustomMyDomain) {
    throw new Error(`login URL not allowed: ${host}`);
  }
  return `${u.protocol}//${u.host}`;
}

/**
 * Step 1: build the Salesforce authorize URL and persist PKCE state.
 * @returns {{ authorizationUrl: string, state: string }}
 */
export async function buildAuthorizationUrl({ userId, loginUrl, returnPath }) {
  const cfg = getSalesforceConfig();
  if (!cfg.clientId) {
    const e = new Error("SALESFORCE_CLIENT_ID not configured");
    e.status = 501; throw e;
  }
  const base = normalizeLoginUrl(loginUrl);
  const state = randomState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeFromVerifier(codeVerifier);

  await saveOAuthState({
    state,
    userId,
    codeVerifier,
    loginUrl: base,
    redirectUri: cfg.redirectUri,
    returnPath: sanitizeReturnPath(returnPath),
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login",
  });
  return {
    authorizationUrl: `${base}/services/oauth2/authorize?${params.toString()}`,
    state,
  };
}

/**
 * Step 2: handle the callback. Exchange code for tokens, fetch identity,
 * and persist encrypted tokens keyed by (userId, orgId).
 */
export async function handleCallback({ code, state, ip }) {
  if (!code || !state) throw new Error("Missing code/state");
  const stash = await consumeOAuthState(state);
  if (!stash) {
    const e = new Error("Invalid or expired OAuth state");
    e.status = 400; throw e;
  }
  const cfg = getSalesforceConfig();

  const tokenUrl = `${stash.loginUrl}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    redirect_uri: stash.redirectUri,
    code_verifier: stash.codeVerifier,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokens = await res.json().catch(() => ({}));
  if (!res.ok || !tokens.access_token) {
    const msg = tokens.error_description || tokens.error || "Token exchange failed";
    const e = new Error(msg); e.status = 400; throw e;
  }

  // tokens.id is like: https://login.salesforce.com/id/<orgId>/<userId18>
  const idUrl = tokens.id || "";
  const idMatch = idUrl.match(/\/id\/([^/]+)\/([^/?#]+)/);
  const orgId = idMatch ? idMatch[1] : null;
  if (!orgId) throw new Error("Could not determine Salesforce org id from token response");

  // Fetch identity (username, org type) — nice-to-have, non-fatal if it fails.
  let username = null;
  let orgType = null;
  let displayName = null;
  try {
    const idRes = await fetch(`${idUrl}?format=json&oauth_token=${encodeURIComponent(tokens.access_token)}`);
    if (idRes.ok) {
      const id = await idRes.json();
      username = id.username || id.preferred_username || null;
      displayName = id.display_name || username;
      if (id.urls && id.urls.enterprise) orgType = /sandbox/i.test(id.custom_domain || "") ? "Sandbox" : "Production";
    }
  } catch (_) { /* ignore */ }

  const oauthExpiresAt = tokens.issued_at && tokens.expires_in
    ? new Date(Number(tokens.issued_at) + Number(tokens.expires_in) * 1000).toISOString()
    : null;

  const stored = await upsertTokens({
    userId: stash.userId,
    orgId,
    instanceUrl: tokens.instance_url,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    issuedTokenType: tokens.token_type,
    scope: tokens.scope,
    oauthExpiresAt,
    orgType,
    username,
    displayName,
    createdByIp: ip || null,
  });

  return {
    org: stored,
    returnPath: stash.returnPath || "/salesforce-dev",
  };
}

function sanitizeReturnPath(p) {
  if (typeof p !== "string") return "/salesforce-dev";
  // Only allow same-origin relative paths that start with /salesforce-dev
  if (!p.startsWith("/salesforce-dev")) return "/salesforce-dev";
  // Strip protocol-relative or any fragment that breaks that prefix.
  if (p.includes("//")) return "/salesforce-dev";
  return p;
}
