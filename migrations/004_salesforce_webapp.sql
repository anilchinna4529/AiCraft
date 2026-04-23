-- =============================================================
-- AICraft — Salesforce Developer Toolkit Migration (004)
-- Adds tables for multi-tenant Salesforce OAuth + org mapping.
-- Safe to re-run (IF NOT EXISTS everywhere).
-- Source plan: steady-brewing-graham.md §4, §5, §11
-- =============================================================

-- ---------------------------------------------------------------
-- salesforce_tokens
-- One row per (user, Salesforce org). Tokens stored encrypted
-- using AES-256-GCM (iv:authTag:ciphertext, hex-encoded).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salesforce_tokens (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,               -- FK to auth.users / public.users
    org_id             text NOT NULL,               -- Salesforce Org ID (00DXX...)
    instance_url       text NOT NULL,               -- e.g. https://my.salesforce.com
    access_token_enc   text NOT NULL,               -- Encrypted access token
    refresh_token_enc  text,                        -- Encrypted refresh token (nullable if offline_access not granted)
    issued_token_type  text,                        -- e.g. "Bearer"
    scope              text,                        -- Granted scopes
    oauth_expires_at   timestamptz,                 -- When access_token expires
    org_type           text,                        -- "Production" | "Sandbox" | "Developer"
    username           text,                        -- Salesforce username
    display_name       text,                        -- Friendly label
    created_by_ip      text,                        -- Audit: IP that initiated login
    last_used_at       timestamptz,
    created_at         timestamptz DEFAULT now(),
    updated_at         timestamptz DEFAULT now(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS salesforce_tokens_user_idx
    ON public.salesforce_tokens (user_id);
CREATE INDEX IF NOT EXISTS salesforce_tokens_user_org_idx
    ON public.salesforce_tokens (user_id, org_id);

-- ---------------------------------------------------------------
-- salesforce_org_info
-- Cached org-level metadata (edition, name). Not secret.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salesforce_org_info (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,
    org_id             text NOT NULL,
    org_name           text,
    org_edition        text,
    api_version        text,
    last_sync_at       timestamptz,
    created_at         timestamptz DEFAULT now(),
    updated_at         timestamptz DEFAULT now(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS salesforce_org_info_user_idx
    ON public.salesforce_org_info (user_id);

-- ---------------------------------------------------------------
-- salesforce_oauth_states
-- CSRF/PKCE state stash. Short-lived (10 min). Cleaned up by cron.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salesforce_oauth_states (
    state              text PRIMARY KEY,            -- Random nonce returned by SF
    user_id            uuid NOT NULL,
    code_verifier      text NOT NULL,               -- PKCE code_verifier
    login_url          text NOT NULL,               -- login.salesforce.com or test.salesforce.com
    redirect_uri       text NOT NULL,
    return_path        text,                        -- Where to send the user post-auth
    created_at         timestamptz DEFAULT now(),
    expires_at         timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS salesforce_oauth_states_expires_idx
    ON public.salesforce_oauth_states (expires_at);

-- ---------------------------------------------------------------
-- salesforce_api_logs
-- Audit trail of every Salesforce API call.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salesforce_api_logs (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,
    org_id             text,
    endpoint           text,                        -- /services/data/v62.0/query
    method             text,                        -- GET / POST / PATCH / DELETE
    status_code        int,
    duration_ms        int,
    cached             boolean DEFAULT false,
    error              text,                        -- Truncated error message (no tokens!)
    created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS salesforce_api_logs_user_idx
    ON public.salesforce_api_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS salesforce_api_logs_created_idx
    ON public.salesforce_api_logs (created_at DESC);

-- ---------------------------------------------------------------
-- salesforce_metadata_cache
-- Server-side cache of expensive describe calls, keyed per-org.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salesforce_metadata_cache (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL,
    org_id             text NOT NULL,
    cache_key          text NOT NULL,               -- e.g. "describe_global", "describe:Account"
    payload            jsonb NOT NULL,
    expires_at         timestamptz NOT NULL,
    created_at         timestamptz DEFAULT now(),
    UNIQUE(user_id, org_id, cache_key)
);

CREATE INDEX IF NOT EXISTS salesforce_metadata_cache_lookup_idx
    ON public.salesforce_metadata_cache (user_id, org_id, cache_key);
CREATE INDEX IF NOT EXISTS salesforce_metadata_cache_expires_idx
    ON public.salesforce_metadata_cache (expires_at);

-- ---------------------------------------------------------------
-- updated_at auto-touch (reuses helper from 003)
-- ---------------------------------------------------------------
DROP TRIGGER IF EXISTS salesforce_tokens_touch_updated_at ON public.salesforce_tokens;
CREATE TRIGGER salesforce_tokens_touch_updated_at
    BEFORE UPDATE ON public.salesforce_tokens
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS salesforce_org_info_touch_updated_at ON public.salesforce_org_info;
CREATE TRIGGER salesforce_org_info_touch_updated_at
    BEFORE UPDATE ON public.salesforce_org_info
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------
-- Register the Salesforce tool in the marketplace (idempotent).
-- Remove or edit if you manage tool catalog manually.
-- ---------------------------------------------------------------
INSERT INTO public.ai_tools (name, description, category, sector, price, tool_link, status, featured)
SELECT
    'Salesforce Developer Toolkit',
    'Build, debug, and optimize Salesforce applications with 16 AI-powered developer modules.',
    'Developer Tools',
    'All Sectors',
    'Free',
    '/salesforce-dev',
    'approved',
    true
WHERE NOT EXISTS (
    SELECT 1 FROM public.ai_tools WHERE name = 'Salesforce Developer Toolkit'
);
