-- =============================================================
-- AICraft Premium Features Migration
-- Creates tables for: favorites, reviews, user profiles
-- Run once against your Supabase Postgres instance.
-- =============================================================

-- ------------- FAVORITES -------------
CREATE TABLE IF NOT EXISTS public.favorites (
    id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tool_id      uuid          NOT NULL REFERENCES public.ai_tools(id) ON DELETE CASCADE,
    created_at   timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS favorites_user_id_idx ON public.favorites (user_id);
CREATE INDEX IF NOT EXISTS favorites_tool_id_idx ON public.favorites (tool_id);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "favorites_select_own" ON public.favorites;
CREATE POLICY "favorites_select_own"
    ON public.favorites FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorites_insert_own" ON public.favorites;
CREATE POLICY "favorites_insert_own"
    ON public.favorites FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorites_delete_own" ON public.favorites;
CREATE POLICY "favorites_delete_own"
    ON public.favorites FOR DELETE
    USING (auth.uid() = user_id);


-- ------------- REVIEWS -------------
CREATE TABLE IF NOT EXISTS public.reviews (
    id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tool_id      uuid          NOT NULL REFERENCES public.ai_tools(id) ON DELETE CASCADE,
    rating       smallint      NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment      text          CHECK (char_length(comment) <= 2000),
    created_at   timestamptz   NOT NULL DEFAULT now(),
    updated_at   timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS reviews_tool_id_idx ON public.reviews (tool_id);
CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON public.reviews (created_at DESC);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_touch_updated_at ON public.reviews;
CREATE TRIGGER reviews_touch_updated_at
    BEFORE UPDATE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_all" ON public.reviews;
CREATE POLICY "reviews_select_all"
    ON public.reviews FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "reviews_insert_own" ON public.reviews;
CREATE POLICY "reviews_insert_own"
    ON public.reviews FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_update_own" ON public.reviews;
CREATE POLICY "reviews_update_own"
    ON public.reviews FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "reviews_delete_own" ON public.reviews;
CREATE POLICY "reviews_delete_own"
    ON public.reviews FOR DELETE
    USING (auth.uid() = user_id);


-- ------------- USER PROFILES -------------
-- Extend existing `users` table with profile fields (non-breaking).
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS avatar_url text,
    ADD COLUMN IF NOT EXISTS bio        text CHECK (char_length(bio) <= 500),
    ADD COLUMN IF NOT EXISTS website    text,
    ADD COLUMN IF NOT EXISTS twitter    text,
    ADD COLUMN IF NOT EXISTS linkedin   text,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS users_touch_updated_at ON public.users;
CREATE TRIGGER users_touch_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ------------- TOOL RATING VIEW (aggregate) -------------
CREATE OR REPLACE VIEW public.tool_ratings AS
SELECT
    t.id                               AS tool_id,
    COUNT(r.id)                        AS review_count,
    COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0) AS avg_rating
FROM public.ai_tools t
LEFT JOIN public.reviews r ON r.tool_id = t.id
GROUP BY t.id;

GRANT SELECT ON public.tool_ratings TO anon, authenticated;


-- ------------- DONE -------------
SELECT 'AICraft premium features migration applied.' AS status;
