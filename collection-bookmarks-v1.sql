-- Persistent per-user saves for public collections.
-- Apply this migration before enabling the collection bookmark action.
CREATE TABLE IF NOT EXISTS public.collection_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT collection_bookmarks_series_user_unique UNIQUE (series_id, user_id)
);

CREATE INDEX IF NOT EXISTS collection_bookmarks_user_created_idx
  ON public.collection_bookmarks (user_id, created_at DESC);

ALTER TABLE public.collection_bookmarks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.collection_bookmarks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.collection_bookmarks TO authenticated;

DROP POLICY IF EXISTS collection_bookmarks_self_select ON public.collection_bookmarks;
CREATE POLICY collection_bookmarks_self_select ON public.collection_bookmarks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS collection_bookmarks_self_insert ON public.collection_bookmarks;
CREATE POLICY collection_bookmarks_self_insert ON public.collection_bookmarks
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.series
      WHERE series.id = collection_bookmarks.series_id
    )
  );

DROP POLICY IF EXISTS collection_bookmarks_self_delete ON public.collection_bookmarks;
CREATE POLICY collection_bookmarks_self_delete ON public.collection_bookmarks
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
