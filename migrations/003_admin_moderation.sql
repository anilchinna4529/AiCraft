-- =============================================================
-- AICraft — Admin Moderation Migration (003)
-- Adds moderation fields to ai_tools used by admin approval workflow.
-- Safe to re-run (IF NOT EXISTS everywhere).
-- =============================================================

ALTER TABLE public.ai_tools
    ADD COLUMN IF NOT EXISTS status            text      DEFAULT 'approved'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN IF NOT EXISTS rejection_reason  text,
    ADD COLUMN IF NOT EXISTS featured          boolean   DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS ai_tools_status_idx   ON public.ai_tools (status);
CREATE INDEX IF NOT EXISTS ai_tools_featured_idx ON public.ai_tools (featured) WHERE featured = true;

-- updated_at auto-touch (uses helper from 002_premium_features.sql).
-- If touch_updated_at() does not yet exist, create it now:
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_tools_touch_updated_at ON public.ai_tools;
CREATE TRIGGER ai_tools_touch_updated_at
    BEFORE UPDATE ON public.ai_tools
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill: mark any existing rows without a status as approved so the public
-- directory keeps working for legacy data.
UPDATE public.ai_tools SET status = 'approved' WHERE status IS NULL;

SELECT 'AICraft admin moderation migration applied.' AS status;
