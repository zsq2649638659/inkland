-- Inkland 章节作者的话审核增量迁移
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS author_note TEXT;

COMMENT ON COLUMN public.posts.author_note IS '章节发布者的话；发布时会同步写入正文审核快照';
