// salesforce/tokenStore.js
// Persistence layer for encrypted Salesforce tokens in Supabase.
// Strict multi-tenant isolation: every lookup requires user_id.

import supabase from "../supabaseClient.js";
import { encryptToken, decryptToken } from "./crypto.js";

const TABLE = "salesforce_tokens";

/**
 * Upsert (user_id, org_id) → encrypted tokens.
 * @returns the stored row (without decrypted secrets).
 */
export async function upsertTokens({
  userId,
  orgId,
  instanceUrl,
  accessToken,
  refreshToken,
  issuedTokenType,
  scope,
  oauthExpiresAt,
  orgType,
  username,
  displayName,
  createdByIp,
}) {
  const payload = {
    user_id: userId,
    org_id: orgId,
    instance_url: instanceUrl,
    access_token_enc: encryptToken(accessToken),
    refresh_token_enc: refreshToken ? encryptToken(refreshToken) : null,
    issued_token_type: issuedTokenType || "Bearer",
    scope: scope || null,
    oauth_expires_at: oauthExpiresAt || null,
    org_type: orgType || null,
    username: username || null,
    display_name: displayName || username || null,
    created_by_ip: createdByIp || null,
    last_used_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: "user_id,org_id" })
    .select("id, user_id, org_id, instance_url, org_type, username, display_name, oauth_expires_at, scope, created_at, updated_at, last_used_at")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load tokens for a single (user, org). Tokens are decrypted in memory.
 * Returns null if not found.
 */
export async function getTokensForOrg(userId, orgId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    orgId: data.org_id,
    instanceUrl: data.instance_url,
    accessToken: decryptToken(data.access_token_enc),
    refreshToken: data.refresh_token_enc ? decryptToken(data.refresh_token_enc) : null,
    orgType: data.org_type,
    username: data.username,
    displayName: data.display_name,
    scope: data.scope,
    oauthExpiresAt: data.oauth_expires_at,
  };
}

/**
 * List all orgs connected by a user. Decrypted secrets are NOT returned.
 */
export async function listOrgsForUser(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, org_id, instance_url, org_type, username, display_name, scope, oauth_expires_at, last_used_at, created_at")
    .eq("user_id", userId)
    .order("last_used_at", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

/**
 * Delete a (user, org) mapping. Used when the user disconnects an org.
 */
export async function deleteOrg(userId, orgId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (error) throw error;
  return true;
}

/**
 * Update just the access token after a refresh, preserving the refresh token.
 */
export async function updateAccessToken(userId, orgId, newAccessToken, newExpiresAt) {
  const { error } = await supabase
    .from(TABLE)
    .update({
      access_token_enc: encryptToken(newAccessToken),
      oauth_expires_at: newExpiresAt || null,
      last_used_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (error) throw error;
}

/**
 * Short-lived OAuth state stash (CSRF + PKCE).
 */
export async function saveOAuthState({ state, userId, codeVerifier, loginUrl, redirectUri, returnPath, ttlSeconds = 600 }) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const { error } = await supabase.from("salesforce_oauth_states").insert({
    state,
    user_id: userId,
    code_verifier: codeVerifier,
    login_url: loginUrl,
    redirect_uri: redirectUri,
    return_path: returnPath || "/salesforce-dev",
    expires_at: expiresAt,
  });
  if (error) throw error;
}

export async function consumeOAuthState(state) {
  const { data, error } = await supabase
    .from("salesforce_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // Single-use: delete immediately
  await supabase.from("salesforce_oauth_states").delete().eq("state", state);

  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return {
    userId: data.user_id,
    codeVerifier: data.code_verifier,
    loginUrl: data.login_url,
    redirectUri: data.redirect_uri,
    returnPath: data.return_path,
  };
}

export async function pruneExpiredOAuthStates() {
  const { error } = await supabase
    .from("salesforce_oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (error) console.warn("⚠️ prune oauth states:", error.message);
}

/**
 * Insert an audit log row. Never logs token values.
 */
export async function logApiCall({ userId, orgId, endpoint, method, statusCode, durationMs, cached, errorMsg }) {
  try {
    await supabase.from("salesforce_api_logs").insert({
      user_id: userId,
      org_id: orgId,
      endpoint: endpoint ? String(endpoint).slice(0, 2048) : null,
      method,
      status_code: statusCode,
      duration_ms: durationMs,
      cached: !!cached,
      error: errorMsg ? String(errorMsg).slice(0, 500) : null,
    });
  } catch (e) {
    console.warn("⚠️ api log insert failed:", e.message);
  }
}
