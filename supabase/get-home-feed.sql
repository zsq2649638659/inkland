-- ============================================================
-- get_home_feed：把「首页信息流」的全部跨区查询折叠成一次数据库往返。
-- 需要你在 Supabase SQL Editor 中执行本文件创建函数。
-- 执行后首页会自动走单查询快速路径（接口已按“缺失/形状不符时回落”设计，未部署也安全）。
--
-- 增强说明（真正单趟）：
--   1. posts 每行已折叠统计（like/comment/bookmark）、作者昵称/头像、标签；
--   2. 收藏系列（未关注的作者）的章节行直接并入 posts，去重后按时间倒序截断 limit；
--   3. 连载卡片需要的系列元数据（描述/封面/标签/状态/类型）折叠进 seriesMeta，
--      客户端不再需要第二次系列查询；
--   4. content 截断为前 6000 字符预览：信息流卡片只展示摘要/头几张图（沿用
--      “列表视图用 400px 缩略图而非原图”的既有口径），避免批量导入的超长单篇
--      （10 万+ 字）把单次往返撑到数 MB。
-- RLS/安全：SECURITY INVOKER + auth.uid() 识别调用者，身份一律取自会话，不信任客户端 p_user_id。
-- ============================================================

create or replace function public.get_home_feed(
  p_user_id uuid default null,
  p_tab text default 'following',
  p_limit int default 50
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_blocked uuid[];
  v_following uuid[];
  v_result json;
begin
  -- 屏蔽名单（对所有 tab 生效，和原客户端逻辑一致）
  select coalesce(array_agg(blocked_user_id), '{}') into v_blocked
  from public.blocked_users
  where user_id = v_me;

  if p_tab = 'myTags' then
    select json_build_object(
      'posts', '[]'::json,
      'seriesMeta', '[]'::json,
      'followedTags', coalesce((select json_agg(t) from (
        select tg.name, count(distinct pt.post_id)::int as post_count
        from public.tag_follows tf
        join public.tags tg on tg.id = tf.tag_id
        left join public.post_tags pt on pt.tag_id = tf.tag_id
        left join public.posts p on p.id = pt.post_id and p.status = 'published' and p.is_test_data = false
        where tf.user_id = v_me
          and not (p.post_type = 'serial' and p.chapter_number > 0) -- 排除连载章节
          and coalesce(p.post_type, 'x') <> 'serial'
        group by tg.name
        order by tg.name
      ) t), '[]'::json)
    ) into v_result;
    return v_result;

  elsif p_tab = 'hot24' then
    -- 发现：所有已发布（客户端再按热度排序），+ 屏蔽过滤
    with feed as (
      select p.*
      from public.posts p
      where p.status = 'published'
        and p.is_test_data = false
        and not (p.user_id = any(v_blocked))
      order by p.created_at desc
      limit p_limit
    )
    select json_build_object(
      'posts', coalesce((select json_agg(x) from (
        select p.id, p.title, left(p.content, 6000) as content, p.cover_url, p.word_count, p.post_type, p.created_at, p.is_test_data,
               p.user_id, p.series_name, p.chapter_number,
               coalesce(pr.nickname, '匿名用户') as author_nickname, pr.avatar_url as author_avatar,
               coalesce(s.like_count, 0) as like_count, coalesce(s.comment_count, 0) as comment_count,
               coalesce(s.bookmark_count, 0) as bookmark_count,
               exists(select 1 from public.likes l where l.post_id = p.id and l.user_id = v_me) as liked_by_me,
               exists(select 1 from public.bookmarks r where r.post_id = p.id and r.user_id = v_me) as bookmarked_by_me,
               coalesce((select json_agg(tg.name)
                         from public.post_tags pt
                         join public.tags tg on tg.id = pt.tag_id
                         where pt.post_id = p.id), '[]') as tags
        from feed p
        left join public.profiles pr on pr.id = p.user_id
        left join public.post_stats s on s.id = p.id
      ) x), '[]'::json),
      'seriesMeta', coalesce((select json_agg(m) from (
        select ss.name, ss.description, ss.cover_url, ss.tags, ss.status, ss.series_type, ss.is_test_data
        from public.series ss
        where ss.name in (
          select distinct p.series_name from feed p
          where p.post_type = 'serial' and p.chapter_number > 0 and p.series_name is not null
        )
          and ss.is_test_data = false
      ) m), '[]'::json),
      'followedTags', '[]'::json
    ) into v_result;
    return v_result;

  else
    -- following：我 + 关注作者 + 收藏的连载系列章节，去重合并后按时间倒序截断
    select coalesce(array_agg(f.following_id), '{}') into v_following
    from public.follows f
    where f.follower_id = v_me;
    v_following := array_append(v_following, v_me);

    with feed as (
      select p.*
      from public.posts p
      where p.status = 'published'
        and p.is_test_data = false
        and p.user_id = any(v_following)
        and not (p.user_id = any(v_blocked))
      order by p.created_at desc
      limit p_limit
    ),
    bookmarked_series as (
      select distinct p.series_name
      from public.bookmarks b
      join public.posts p on p.id = b.post_id
      where b.user_id = v_me
        and p.post_type = 'serial' and p.chapter_number > 0
        and p.series_name is not null
    ),
    extra_series_posts as (
      select p.*
      from public.posts p
      where p.status = 'published'
        and p.is_test_data = false
        and p.series_name in (select series_name from bookmarked_series)
        and not (p.user_id = any(v_blocked))
    ),
    merged as (
      select * from feed
      union
      select * from extra_series_posts
    )
    select json_build_object(
      'posts', coalesce((select json_agg(x) from (
        select p.id, p.title, left(p.content, 6000) as content, p.cover_url, p.word_count, p.post_type, p.created_at, p.is_test_data,
               p.user_id, p.series_name, p.chapter_number,
               coalesce(pr.nickname, '匿名用户') as author_nickname, pr.avatar_url as author_avatar,
               coalesce(s.like_count, 0) as like_count, coalesce(s.comment_count, 0) as comment_count,
               coalesce(s.bookmark_count, 0) as bookmark_count,
               exists(select 1 from public.likes l where l.post_id = p.id and l.user_id = v_me) as liked_by_me,
               exists(select 1 from public.bookmarks r where r.post_id = p.id and r.user_id = v_me) as bookmarked_by_me,
               coalesce((select json_agg(tg.name)
                         from public.post_tags pt
                         join public.tags tg on tg.id = pt.tag_id
                         where pt.post_id = p.id), '[]') as tags
        from merged p
        left join public.profiles pr on pr.id = p.user_id
        left join public.post_stats s on s.id = p.id
        order by p.created_at desc
        limit p_limit
      ) x), '[]'::json),
      'seriesMeta', coalesce((select json_agg(m) from (
        select ss.name, ss.description, ss.cover_url, ss.tags, ss.status, ss.series_type, ss.is_test_data
        from public.series ss
        where ss.name in (
          select distinct p.series_name from merged p
          where p.post_type = 'serial' and p.chapter_number > 0 and p.series_name is not null
        )
          and ss.is_test_data = false
      ) m), '[]'::json),
      'followedTags', '[]'::json
    ) into v_result;
    return v_result;
  end if;
end;
$$;
