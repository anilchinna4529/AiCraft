// salesforce/routes.js
// Express router mounted at /api/salesforce/* by server.js.
// All data routes require the caller to pass a Supabase JWT as Bearer token.

import express from "express";
import { assertSalesforceConfigured } from "./config.js";
import { buildAuthorizationUrl, handleCallback } from "./oauth.js";
import { getClient, SalesforceAuthError, SalesforceApiError, assertIdentifier } from "./salesforceClient.js";
import {
  listOrgsForUser,
  deleteOrg,
  pruneExpiredOAuthStates,
} from "./tokenStore.js";
import { getCached, setCached, invalidate as invalidateCache } from "./metadataCache.js";
import { CACHE_TTL } from "./config.js";

/**
 * Build the router. `authMiddleware` is injected from server.js so we reuse
 * the exact Supabase JWT validation already in use for the rest of AiCraft.
 */
export function buildSalesforceRouter({ authMiddleware, rateLimit }) {
  const router = express.Router();

  // Cheap guardrails on hot auth endpoints
  const authLimiter = rateLimit ? rateLimit({ windowMs: 60_000, max: 20 }) : (req, res, next) => next();
  const queryLimiter = rateLimit ? rateLimit({ windowMs: 60_000, max: 120 }) : (req, res, next) => next();

  // ----------------------------------------------------------
  // Public: is Salesforce configured on this server?
  // ----------------------------------------------------------
  router.get("/status", (req, res) => {
    const configured = !!process.env.SALESFORCE_CLIENT_ID && !!process.env.SF_ENCRYPTION_KEY;
    res.json({
      success: true,
      configured,
      apiVersion: process.env.SF_API_VERSION || "v62.0",
    });
  });

  // ----------------------------------------------------------
  // Diagnostic health check — authenticated so env vars are never
  // leaked to anonymous callers. Tells the operator *why* the
  // toolkit might not be ready.
  // ----------------------------------------------------------
  router.get("/health", authMiddleware, async (req, res) => {
    const checks = {};

    // 1) env vars
    checks.env = {
      SALESFORCE_CLIENT_ID: !!process.env.SALESFORCE_CLIENT_ID,
      SALESFORCE_CLIENT_SECRET: !!process.env.SALESFORCE_CLIENT_SECRET,
      SALESFORCE_LOGIN_URL: process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com",
      SF_API_VERSION: process.env.SF_API_VERSION || "v62.0",
      SF_ENCRYPTION_KEY_present: !!process.env.SF_ENCRYPTION_KEY,
      SF_ENCRYPTION_KEY_valid: isHex64(process.env.SF_ENCRYPTION_KEY),
      SITE_URL: process.env.SITE_URL || null,
    };

    // 2) crypto roundtrip — proves the key actually works
    try {
      const { encryptToken, decryptToken } = await import("./crypto.js");
      const enc = encryptToken("hello");
      const dec = decryptToken(enc);
      checks.crypto = { ok: dec === "hello" };
    } catch (e) {
      checks.crypto = { ok: false, error: e.message };
    }

    // 3) DB reachability — count the user's orgs (no-op read)
    try {
      const orgs = await listOrgsForUser(req.user.id);
      checks.db = { ok: true, orgCount: orgs.length };
    } catch (e) {
      checks.db = { ok: false, error: e.message };
    }

    const ready =
      checks.env.SALESFORCE_CLIENT_ID &&
      checks.env.SALESFORCE_CLIENT_SECRET &&
      checks.env.SF_ENCRYPTION_KEY_valid &&
      checks.crypto.ok &&
      checks.db.ok;

    res.status(ready ? 200 : 503).json({ success: true, ready, checks });
  });

  // ----------------------------------------------------------
  // OAuth: initiate login (returns URL the client redirects to)
  // POST /api/salesforce/auth/initiate   body: { loginUrl?, returnPath? }
  // ----------------------------------------------------------
  router.post("/auth/initiate", authMiddleware, authLimiter, async (req, res) => {
    try {
      assertSalesforceConfigured();
      pruneExpiredOAuthStates().catch(() => {}); // fire-and-forget GC
      const { loginUrl, returnPath } = req.body || {};
      const { authorizationUrl, state } = await buildAuthorizationUrl({
        userId: req.user.id,
        loginUrl,
        returnPath,
      });
      res.json({ success: true, authorizationUrl, state });
    } catch (e) {
      const status = e.status || 500;
      console.error("❌ SF initiate:", e.message);
      res.status(status).json({ success: false, error: e.message });
    }
  });

  // ----------------------------------------------------------
  // OAuth: callback (no authMiddleware — identified by state nonce)
  // GET /api/salesforce/auth/callback?code=...&state=...
  // ----------------------------------------------------------
  router.get("/auth/callback", async (req, res) => {
    try {
      const { code, state, error, error_description } = req.query;
      if (error) {
        return res.redirect(`/salesforce-dev/connect.html?error=${encodeURIComponent(error_description || error)}`);
      }
      const { org, returnPath } = await handleCallback({
        code: String(code || ""),
        state: String(state || ""),
        ip: req.ip,
      });
      const target = `${returnPath}?connected=1&org=${encodeURIComponent(org.org_id)}`;
      res.redirect(target);
    } catch (e) {
      console.error("❌ SF callback:", e.message);
      res.redirect(`/salesforce-dev/connect.html?error=${encodeURIComponent(e.message)}`);
    }
  });

  // ----------------------------------------------------------
  // Orgs: list / delete
  // ----------------------------------------------------------
  router.get("/orgs", authMiddleware, async (req, res) => {
    try {
      const orgs = await listOrgsForUser(req.user.id);
      res.json({ success: true, orgs });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete("/orgs/:orgId", authMiddleware, async (req, res) => {
    try {
      await deleteOrg(req.user.id, req.params.orgId);
      await invalidateCache(req.user.id, req.params.orgId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ----------------------------------------------------------
  // Data / metadata — all require ?orgId= to scope the Salesforce call.
  // ----------------------------------------------------------

  // POST /api/salesforce/query   body: { orgId, soql, tooling? }
  router.post("/query", authMiddleware, queryLimiter, async (req, res) => {
    try {
      const { orgId, soql, tooling } = req.body || {};
      if (!orgId || !soql) return res.status(400).json({ success: false, error: "orgId and soql required" });
      const client = await getClient(req.user.id, orgId);
      const result = tooling ? await client.toolingQuery(soql) : await client.query(soql);
      res.json({ success: true, result });
    } catch (e) {
      respondSfError(res, e);
    }
  });

  // GET /api/salesforce/metadata/global-describe?orgId=...&nocache=true
  router.get("/metadata/global-describe", authMiddleware, async (req, res) => {
    try {
      const orgId = String(req.query.orgId || "");
      if (!orgId) return res.status(400).json({ success: false, error: "orgId required" });
      const bypass = req.query.nocache === "true";
      if (!bypass) {
        const cached = await getCached(req.user.id, orgId, "describe_global");
        if (cached) return res.json({ success: true, cached: true, result: cached });
      }
      const client = await getClient(req.user.id, orgId);
      const result = await client.describeGlobal();
      await setCached(req.user.id, orgId, "describe_global", result, CACHE_TTL.DESCRIBE_GLOBAL);
      res.json({ success: true, cached: false, result });
    } catch (e) {
      respondSfError(res, e);
    }
  });

  // GET /api/salesforce/metadata/describe/:object?orgId=...
  router.get("/metadata/describe/:object", authMiddleware, async (req, res) => {
    try {
      const orgId = String(req.query.orgId || "");
      if (!orgId) return res.status(400).json({ success: false, error: "orgId required" });
      assertIdentifier(req.params.object, "object");
      const key = `describe:${req.params.object}`;
      const bypass = req.query.nocache === "true";
      if (!bypass) {
        const cached = await getCached(req.user.id, orgId, key);
        if (cached) return res.json({ success: true, cached: true, result: cached });
      }
      const client = await getClient(req.user.id, orgId);
      const result = await client.describeSObject(req.params.object);
      await setCached(req.user.id, orgId, key, result, CACHE_TTL.DESCRIBE_OBJECT);
      res.json({ success: true, cached: false, result });
    } catch (e) {
      respondSfError(res, e);
    }
  });

  // GET /api/salesforce/limits?orgId=...
  router.get("/limits", authMiddleware, async (req, res) => {
    try {
      const orgId = String(req.query.orgId || "");
      if (!orgId) return res.status(400).json({ success: false, error: "orgId required" });
      const client = await getClient(req.user.id, orgId);
      const result = await client.getLimits();
      res.json({ success: true, result });
    } catch (e) {
      respondSfError(res, e);
    }
  });

  // POST /api/salesforce/sobjects   body: { orgId, objectName, fields }
  router.post("/sobjects", authMiddleware, async (req, res) => {
    try {
      const { orgId, objectName, fields } = req.body || {};
      if (!orgId || !objectName || !fields) return res.status(400).json({ success: false, error: "orgId, objectName, fields required" });
      const client = await getClient(req.user.id, orgId);
      const result = await client.createRecord(objectName, fields);
      res.status(201).json({ success: true, result });
    } catch (e) { respondSfError(res, e); }
  });

  // PATCH /api/salesforce/sobjects  body: { orgId, objectName, id, fields }
  router.patch("/sobjects", authMiddleware, async (req, res) => {
    try {
      const { orgId, objectName, id, fields } = req.body || {};
      if (!orgId || !objectName || !id || !fields) return res.status(400).json({ success: false, error: "orgId, objectName, id, fields required" });
      const client = await getClient(req.user.id, orgId);
      const result = await client.updateRecord(objectName, id, fields);
      res.json({ success: true, result });
    } catch (e) { respondSfError(res, e); }
  });

  // DELETE /api/salesforce/sobjects?orgId=&objectName=&id=
  router.delete("/sobjects", authMiddleware, async (req, res) => {
    try {
      const orgId = String(req.query.orgId || "");
      const objectName = String(req.query.objectName || "");
      const id = String(req.query.id || "");
      if (!orgId || !objectName || !id) return res.status(400).json({ success: false, error: "orgId, objectName, id required" });
      const client = await getClient(req.user.id, orgId);
      const result = await client.deleteRecord(objectName, id);
      res.json({ success: true, result });
    } catch (e) { respondSfError(res, e); }
  });

  // POST /api/salesforce/apex/anonymous  body: { orgId, apex }
  router.post("/apex/anonymous", authMiddleware, async (req, res) => {
    try {
      const { orgId, apex } = req.body || {};
      if (!orgId || !apex) return res.status(400).json({ success: false, error: "orgId and apex required" });
      const client = await getClient(req.user.id, orgId);
      const result = await client.executeAnonymous(apex);
      res.json({ success: true, result });
    } catch (e) { respondSfError(res, e); }
  });

  // Cache invalidation (user-driven "Refresh Metadata" button)
  router.post("/cache/invalidate", authMiddleware, async (req, res) => {
    try {
      const { orgId, prefix } = req.body || {};
      if (!orgId) return res.status(400).json({ success: false, error: "orgId required" });
      await invalidateCache(req.user.id, orgId, prefix || null);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  return router;
}

function respondSfError(res, e) {
  if (e instanceof SalesforceAuthError) {
    return res.status(401).json({ success: false, error: e.message, code: "SF_AUTH" });
  }
  if (e instanceof SalesforceApiError) {
    return res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({
      success: false,
      error: e.message,
      code: "SF_API",
      details: e.body,
    });
  }
  console.error("❌ SF route:", e.message);
  res.status(e.status || 500).json({ success: false, error: e.message });
}

function isHex64(v) {
  return typeof v === "string" && /^[0-9a-fA-F]{64}$/.test(v);
}
