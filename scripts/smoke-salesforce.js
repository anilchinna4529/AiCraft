#!/usr/bin/env node
// scripts/smoke-salesforce.js
// Quick smoke test for the Salesforce Developer Toolkit.
// Usage:
//   node scripts/smoke-salesforce.js \
//     --base http://localhost:3000 \
//     --token <supabase-jwt>        # optional for /status
//
// What it checks:
//   1. /api/salesforce/status       (unauthenticated)
//   2. /api/salesforce/health       (authenticated — env + crypto + db)
//   3. /api/salesforce/orgs         (authenticated — lists connected orgs)
// If at least one org is connected, also:
//   4. /api/salesforce/limits
//   5. /api/salesforce/query        SELECT Id, Name FROM Account LIMIT 1
//
// Exits with code 1 on any hard failure.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

const BASE = (args.base || process.env.SMOKE_BASE || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = args.token || process.env.SMOKE_TOKEN || null;

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m●\x1b[0m ${msg}`);
const err = (msg) => console.log(`\x1b[31m✗\x1b[0m ${msg}`);

async function hit(path, { method = "GET", body, auth = false } = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: r.status, json };
}

let failures = 0;

async function main() {
  console.log(`\nSalesforce Toolkit smoke test → ${BASE}`);
  console.log(`Token: ${TOKEN ? "(provided)" : "(not provided — auth-gated checks will be skipped)"}\n`);

  // 1. status
  {
    const { status, json } = await hit("/api/salesforce/status");
    if (status === 200 && json.success) {
      ok(`/status  configured=${json.configured} apiVersion=${json.apiVersion}`);
      if (!json.configured) warn("  Salesforce env vars are NOT set — OAuth will fail.");
    } else {
      err(`/status  ${status} ${JSON.stringify(json)}`);
      failures++;
    }
  }

  if (!TOKEN) {
    warn("No --token supplied; stopping after /status.");
    process.exit(failures ? 1 : 0);
  }

  // 2. health
  {
    const { status, json } = await hit("/api/salesforce/health", { auth: true });
    if (status === 401) {
      err("/health  401 — token rejected by authMiddleware (is the JWT valid?)");
      process.exit(1);
    }
    if (json.ready) {
      ok("/health  ready=true");
    } else {
      warn(`/health  ready=false`);
      if (json.checks) {
        const c = json.checks;
        console.log("  env.SALESFORCE_CLIENT_ID      :", c.env.SALESFORCE_CLIENT_ID);
        console.log("  env.SALESFORCE_CLIENT_SECRET  :", c.env.SALESFORCE_CLIENT_SECRET);
        console.log("  env.SF_ENCRYPTION_KEY_valid   :", c.env.SF_ENCRYPTION_KEY_valid);
        console.log("  crypto.ok                     :", c.crypto?.ok, c.crypto?.error || "");
        console.log("  db.ok                         :", c.db?.ok, c.db?.error || "");
      }
    }
  }

  // 3. orgs
  let firstOrgId = null;
  {
    const { status, json } = await hit("/api/salesforce/orgs", { auth: true });
    if (status !== 200) { err(`/orgs  ${status}`); failures++; }
    else {
      ok(`/orgs  ${json.orgs.length} org(s)`);
      json.orgs.forEach((o) =>
        console.log(`   - ${pad(o.org_name || o.org_id, 30)} ${o.instance_url}`)
      );
      firstOrgId = json.orgs[0]?.org_id || null;
    }
  }

  if (!firstOrgId) {
    warn("No connected orgs — skipping /limits and /query tests.");
    process.exit(failures ? 1 : 0);
  }

  // 4. limits
  {
    const { status, json } = await hit(`/api/salesforce/limits?orgId=${encodeURIComponent(firstOrgId)}`, { auth: true });
    if (status === 200 && json.success) {
      const n = Object.keys(json.result || {}).length;
      ok(`/limits  ${n} limit group(s) returned`);
    } else {
      err(`/limits  ${status} ${JSON.stringify(json).slice(0, 200)}`);
      failures++;
    }
  }

  // 5. query
  {
    const { status, json } = await hit("/api/salesforce/query", {
      method: "POST",
      auth: true,
      body: { orgId: firstOrgId, soql: "SELECT Id, Name FROM Account LIMIT 1" },
    });
    if (status === 200 && json.success) {
      ok(`/query  returned ${json.result.totalSize} row(s)`);
    } else {
      err(`/query  ${status} ${JSON.stringify(json).slice(0, 200)}`);
      failures++;
    }
  }

  console.log();
  if (failures) {
    err(`${failures} check(s) failed`);
    process.exit(1);
  } else {
    ok("all checks passed");
  }
}

main().catch((e) => {
  err(`fatal: ${e.message}`);
  process.exit(1);
});
