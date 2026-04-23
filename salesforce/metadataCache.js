// salesforce/metadataCache.js
// Per-(user,org) metadata cache backed by Postgres (salesforce_metadata_cache).
// Keeps memory footprint low; works across multiple Render instances.

import supabase from "../supabaseClient.js";

const TABLE = "salesforce_metadata_cache";

export async function getCached(userId, orgId, key) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("payload, expires_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("cache_key", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    // Lazy expire
    supabase.from(TABLE).delete()
      .eq("user_id", userId).eq("org_id", orgId).eq("cache_key", key)
      .then(() => {}, () => {});
    return null;
  }
  return data.payload;
}

export async function setCached(userId, orgId, key, payload, ttlSeconds) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: userId,
        org_id: orgId,
        cache_key: key,
        payload,
        expires_at: expiresAt,
      },
      { onConflict: "user_id,org_id,cache_key" }
    );
  if (error) console.warn("⚠️ metadata cache set:", error.message);
}

export async function invalidate(userId, orgId, keyPrefix = null) {
  let q = supabase.from(TABLE).delete().eq("user_id", userId).eq("org_id", orgId);
  if (keyPrefix) q = q.like("cache_key", `${keyPrefix}%`);
  const { error } = await q;
  if (error) console.warn("⚠️ metadata cache invalidate:", error.message);
}
