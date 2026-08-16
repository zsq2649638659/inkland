-- ============================================================
-- Inkland 飞书后续补全第 1 项：举报中心四分类与举报者风险
-- 文件：report-center-followup-v1.sql
-- 依赖：report-closure-v1.sql、report-notification-templates-v1.sql、
--       user-enforcement-module6-v1.sql、user-enforcement-module7-v1.sql
-- 说明：幂等，可重复执行。在 Supabase SQL Editor 执行后：
--   1. 后台举报中心按 作品举报 / 评论举报 / 举报者风险 / 被举报用户风险 分类；
--   2. 举报中心支持状态、优先级、多人集中举报、疑似恶意举报、审核服务异常筛选；
--   3. 提供独立举报者风险详情页数据与“保留举报权限”操作；
--   4. 提供举报者低质量队列标记（第二级恶意举报治理的数据基础）。
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 案件表补列：自动审核风险、审核依据、恶意/低质量/服务异常标记
-- ------------------------------------------------------------

ALTER TABLE public.moderation_report_cases
  ADD COLUMN IF NOT EXISTS risk_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_review_risk TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS suspicious_report BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS low_quality_queue BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_error BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_basis JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS moderation_report_cases_center_idx
  ON public.moderation_report_cases (status, target_type, last_reported_at DESC);

-- ------------------------------------------------------------
-- 2. 举报人统计补列：30 天举报、恶意举报记录、限制次数、扩展数据
-- ------------------------------------------------------------

ALTER TABLE public.user_reporter_stats
  ADD COLUMN IF NOT EXISTS reports_last_30d INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS malicious_report_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_restriction_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS user_reporter_stats_center_idx
  ON public.user_reporter_stats (reports_last_30d DESC, invalid_reports DESC);

-- ------------------------------------------------------------
-- 3. 举报中心聚合查询
--    p_tab: cases（内容案件）| reporters（举报者风险）| target_users（被举报用户风险）
--    p_status: all | pending | kept | reminded | deleted
--    p_priority: all | normal | high | urgent
--    p_target_type: all | post | comment | user
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_report_center_v1(
  p_tab TEXT DEFAULT 'cases',
  p_status TEXT DEFAULT 'all',
  p_priority TEXT DEFAULT 'all',
  p_target_type TEXT DEFAULT 'all',
  p_multi_report BOOLEAN DEFAULT NULL,
  p_suspicious BOOLEAN DEFAULT NULL,
  p_service_error BOOLEAN DEFAULT NULL,
  p_query TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := btrim(COALESCE(p_query, ''));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_cases JSONB;
  v_reporters JSONB;
  v_target_users JSONB;
  v_counts JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_tab NOT IN ('cases', 'reporters', 'target_users') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_tab', 'message', '分类参数无效。');
  END IF;

  -- 内容举报案件：保留快照摘要，并综合计算风险与举报者异常
  SELECT COALESCE(jsonb_agg(row_data ORDER BY c.last_reported_at DESC), '[]'::jsonb)
  INTO v_cases
  FROM (
    SELECT jsonb_build_object(
        'id', c.id,
        'target_type', c.target_type,
        'target_id', c.target_id,
        'target_user_id', c.target_user_id,
        'status', c.status,
        'priority', c.priority,
        'effective_priority', CASE
          WHEN c.auto_review_risk = 'urgent' THEN 'urgent'
          WHEN c.auto_review_risk = 'high' THEN 'high'
          ELSE c.priority END,
        'outcome', c.outcome,
        'primary_reason_category', c.primary_reason_category,
        'report_count', c.report_count,
        'first_reported_at', c.first_reported_at,
        'last_reported_at', c.last_reported_at,
        'created_at', c.created_at,
        'resolved_at', c.resolved_at,
        'metadata', c.metadata,
        'target_title', CASE
          WHEN c.target_type = 'post' THEN COALESCE(s.object_snapshot->>'title', '')
          WHEN c.target_type = 'comment' THEN '评论于《' || COALESCE(s.context_snapshot->>'post_title', '未知作品') || '》'
          ELSE COALESCE(s.object_snapshot->>'nickname', '') END,
        'target_summary', left(
          btrim(regexp_replace(
            COALESCE(
              CASE WHEN c.target_type = 'post' THEN s.object_snapshot->>'content'
                   WHEN c.target_type = 'comment' THEN s.object_snapshot->>'content'
                   ELSE s.object_snapshot->>'bio' END,
              ''
            ),
            '!\[[^\]]*\]\([^)]*\)', '', 'g'
          )),
          160
        ),
        'target_nickname', COALESCE(
          CASE WHEN c.target_type = 'post' THEN s.context_snapshot->>'author_nickname'
               WHEN c.target_type = 'comment' THEN s.context_snapshot->>'comment_author_nickname'
               ELSE s.object_snapshot->>'nickname' END,
          ''
        ),
        'auto_review_risk', COALESCE(NULLIF(c.auto_review_risk, ''), 'normal'),
        'risk_score', c.risk_score,
        'suspicious_report', COALESCE(c.suspicious_report, FALSE)
          OR EXISTS (
            SELECT 1 FROM public.user_reporter_stats rs
            WHERE rs.user_id IN (
              SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
              UNION
              SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
            )
            AND (rs.invalid_reports >= 5 OR rs.duplicate_attempts >= 3
                 OR (rs.total_reports >= 8 AND rs.invalid_reports::numeric / GREATEST(rs.total_reports, 1) >= 0.7))
          ),
        'multi_report', c.report_count >= 3,
        'service_error', COALESCE(c.service_error, FALSE)
          OR COALESCE(c.review_basis->>'service_error', 'false') = 'true',
        'low_quality_queue', COALESCE(c.low_quality_queue, FALSE),
        'recent_confirmed_violations', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = c.target_user_id AND uv.status = 'active'
            AND uv.confirmed_at > NOW() - interval '90 days'
        ),
        'reporter_anomalies', COALESCE((
          SELECT jsonb_agg(flag) FROM (
            SELECT flag FROM (
              SELECT CASE WHEN rs.duplicate_attempts >= 3 THEN '重复举报较多' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              UNION ALL
              SELECT CASE WHEN rs.invalid_reports >= 5
                AND rs.invalid_reports::numeric / GREATEST(rs.total_reports, 1) >= 0.7 THEN '成立率低' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              UNION ALL
              SELECT CASE WHEN rs.report_restricted_until IS NOT NULL
                AND rs.report_restricted_until > NOW() THEN '举报受限' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              UNION ALL
              SELECT CASE WHEN rs.reports_last_24h >= 10 THEN '短时举报集中' END AS flag
              FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
            ) flags
            WHERE flag IS NOT NULL
          ) f
        ), '[]'::jsonb)
    ) AS row_data
    FROM public.moderation_report_cases c
    LEFT JOIN public.moderation_report_snapshots s ON s.case_id = c.id
    WHERE (
        p_status = 'all'
        OR (p_status = 'pending' AND c.status IN ('pending', 'reviewing'))
        OR (p_status IN ('kept', 'reminded', 'deleted') AND c.status = 'resolved' AND c.outcome = p_status)
      )
      AND (
        p_priority = 'all'
        OR CASE
          WHEN c.auto_review_risk = 'urgent' THEN 'urgent'
          WHEN c.auto_review_risk = 'high' THEN 'high'
          ELSE c.priority END = p_priority
      )
      AND (p_target_type = 'all' OR c.target_type = p_target_type)
      AND (p_multi_report IS NULL OR (p_multi_report AND c.report_count >= 3))
      AND (
        p_suspicious IS NULL
        OR (
          p_suspicious
          AND (
            COALESCE(c.suspicious_report, FALSE)
            OR EXISTS (
              SELECT 1 FROM public.user_reporter_stats rs
              WHERE rs.user_id IN (
                SELECT cr.reporter_id FROM public.content_reports cr WHERE cr.case_id = c.id
                UNION
                SELECT cm.reporter_id FROM public.comment_reports cm WHERE cm.case_id = c.id
              )
              AND (rs.invalid_reports >= 5 OR rs.duplicate_attempts >= 3
                   OR (rs.total_reports >= 8 AND rs.invalid_reports::numeric / GREATEST(rs.total_reports, 1) >= 0.7))
            )
          )
        )
      )
      AND (
        p_service_error IS NULL
        OR (p_service_error AND (
          COALESCE(c.service_error, FALSE)
          OR COALESCE(c.review_basis->>'service_error', 'false') = 'true'
        ))
      )
      AND (
        v_query = ''
        OR COALESCE(c.primary_reason_category, '') ILIKE '%' || v_query || '%'
        OR COALESCE(s.object_snapshot->>'title', '') ILIKE '%' || v_query || '%'
        OR COALESCE(s.object_snapshot->>'nickname', '') ILIKE '%' || v_query || '%'
        OR COALESCE(s.context_snapshot->>'post_title', '') ILIKE '%' || v_query || '%'
        OR c.id::TEXT ILIKE v_query || '%'
    )
    LIMIT v_limit
  ) sub;

  -- 举报者风险：统计、异常标记、集中举报对象
  SELECT COALESCE(jsonb_agg(row_data ORDER BY risk_score DESC), '[]'::jsonb)
  INTO v_reporters
  FROM (
    SELECT jsonb_build_object(
        'user_id', p.id,
        'nickname', p.nickname,
        'avatar_url', p.avatar_url,
        'moderation_status', p.moderation_status,
        'created_at', p.created_at,
        'total_reports', COALESCE(rs.total_reports, 0),
        'pending_reports', COALESCE(rs.pending_reports, 0),
        'valid_reports', COALESCE(rs.valid_reports, 0),
        'invalid_reports', COALESCE(rs.invalid_reports, 0),
        'duplicate_attempts', COALESCE(rs.duplicate_attempts, 0),
        'reports_last_24h', COALESCE(rs.reports_last_24h, 0),
        'reports_last_30d', COALESCE(rs.reports_last_30d, (
          SELECT COUNT(*)::INTEGER FROM (
            SELECT 1 FROM public.content_reports cr WHERE cr.reporter_id = p.id AND cr.created_at > NOW() - interval '30 days'
            UNION ALL
            SELECT 1 FROM public.comment_reports cm WHERE cm.reporter_id = p.id AND cm.created_at > NOW() - interval '30 days'
          ) recent
        )),
        'report_restricted_until', rs.report_restricted_until,
        'low_quality', COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE),
        'distinct_target_users', (
          SELECT COUNT(*)::INTEGER FROM (
            SELECT DISTINCT target_user_id FROM (
              SELECT CASE WHEN cr.target_type = 'post' THEN (SELECT po.user_id FROM public.posts po WHERE po.id = cr.target_id)
                          WHEN cr.target_type = 'comment' THEN (SELECT co.user_id FROM public.comments co WHERE co.id = cr.target_id)
                          ELSE cr.target_id END AS target_user_id
              FROM public.content_reports cr WHERE cr.reporter_id = p.id
              UNION ALL
              SELECT co.user_id FROM public.comment_reports cm JOIN public.comments co ON co.id = cm.comment_id
              WHERE cm.reporter_id = p.id
            ) t
            WHERE target_user_id IS NOT NULL
          ) d
        ),
        'focused_target', (
          SELECT jsonb_build_object(
            'target_user_id', target_user_id,
            'nickname', COALESCE((SELECT nickname FROM public.profiles WHERE id = target_user_id), ''),
            'count', cnt
          )
          FROM (
            SELECT target_user_id, COUNT(*) AS cnt
            FROM (
              SELECT CASE WHEN cr.target_type = 'post' THEN (SELECT po.user_id FROM public.posts po WHERE po.id = cr.target_id)
                          WHEN cr.target_type = 'comment' THEN (SELECT co.user_id FROM public.comments co WHERE co.id = cr.target_id)
                          ELSE cr.target_id END AS target_user_id
              FROM public.content_reports cr WHERE cr.reporter_id = p.id
              UNION ALL
              SELECT co.user_id FROM public.comment_reports cm JOIN public.comments co ON co.id = cm.comment_id
              WHERE cm.reporter_id = p.id
            ) t
            WHERE target_user_id IS NOT NULL
            GROUP BY target_user_id
            ORDER BY cnt DESC
            LIMIT 1
          ) f
          WHERE cnt >= 3
        ),
        'risk_score', ROUND((
          CASE WHEN COALESCE(rs.total_reports, 0) >= 8
            THEN (COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(rs.total_reports, 1)) * 40 ELSE 0 END
          + LEAST(COALESCE(rs.reports_last_24h, 0)::numeric / 20, 1) * 25
          + LEAST(COALESCE(rs.duplicate_attempts, 0)::numeric / 5, 1) * 20
          + CASE WHEN COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE) THEN 10 ELSE 0 END
          + CASE WHEN rs.report_restricted_until IS NOT NULL AND rs.report_restricted_until > NOW() THEN 5 ELSE 0 END
        ), 1),
        'risk_level', CASE
          WHEN COALESCE(rs.total_reports, 0) = 0 THEN 'normal'
          WHEN (
            COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(rs.total_reports, 1) >= 0.85
            OR COALESCE(rs.reports_last_24h, 0) >= 15
            OR COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE)
          ) AND (
            COALESCE(rs.duplicate_attempts, 0) >= 3
            OR COALESCE(rs.invalid_reports, 0) >= 8
            OR rs.report_restricted_until IS NOT NULL
          ) THEN 'urgent'
          WHEN COALESCE(rs.invalid_reports, 0) >= 5
            AND COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(rs.total_reports, 1) >= 0.7 THEN 'high'
          WHEN COALESCE(rs.duplicate_attempts, 0) >= 3
            OR COALESCE(rs.reports_last_24h, 0) >= 10 THEN 'high'
          ELSE 'normal' END,
        'suspicious_flags', COALESCE((
          SELECT jsonb_agg(flag) FROM (
            SELECT flag FROM (
              SELECT CASE WHEN COALESCE(rs.duplicate_attempts, 0) >= 3 THEN '重复举报较多' END AS flag
              UNION ALL
              SELECT CASE WHEN COALESCE(rs.invalid_reports, 0) >= 5
                AND COALESCE(rs.invalid_reports, 0)::numeric / GREATEST(COALESCE(rs.total_reports, 1), 1) >= 0.7 THEN '成立率低' END
              UNION ALL
              SELECT CASE WHEN COALESCE(rs.reports_last_24h, 0) >= 10 THEN '短时举报集中' END
              UNION ALL
              SELECT CASE WHEN COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE) THEN '低质量举报队列' END
              UNION ALL
              SELECT CASE WHEN rs.report_restricted_until IS NOT NULL AND rs.report_restricted_until > NOW() THEN '举报功能受限' END
            ) flags
            WHERE flag IS NOT NULL
          ) f
        ), '[]'::jsonb)
    ) AS row_data
    FROM public.profiles p
    LEFT JOIN public.user_reporter_stats rs ON rs.user_id = p.id
    WHERE (
        v_query = ''
        OR p.nickname ILIKE '%' || v_query || '%'
        OR p.id::TEXT ILIKE v_query || '%'
      )
      AND (
        p_suspicious IS NULL
        OR (
          p_suspicious
          AND (
            COALESCE(rs.invalid_reports, 0) >= 5
            OR COALESCE(rs.duplicate_attempts, 0) >= 3
            OR COALESCE(rs.reports_last_24h, 0) >= 10
            OR COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE)
          )
        )
      )
    AND (rs.user_id IS NOT NULL OR v_query <> '')
    LIMIT v_limit
  ) sub;

  -- 被举报用户风险：案件、确认违规、限制与近期风险
  SELECT COALESCE(jsonb_agg(row_data ORDER BY risk_score DESC), '[]'::jsonb)
  INTO v_target_users
  FROM (
    SELECT jsonb_build_object(
        'user_id', p.id,
        'nickname', p.nickname,
        'avatar_url', p.avatar_url,
        'moderation_status', p.moderation_status,
        'created_at', p.created_at,
        'total_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
        ),
        'pending_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
        ),
        'recent30_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.last_reported_at > NOW() - interval '30 days'
        ),
        'recent90_cases', (
          SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.last_reported_at > NOW() - interval '90 days'
        ),
        'recent_confirmed_violations', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = p.id AND uv.status = 'active'
            AND uv.confirmed_at > NOW() - interval '90 days'
        ),
        'active_violations', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = p.id AND uv.status = 'active'
        ),
        'deleted_items', (
          SELECT COUNT(*)::INTEGER FROM public.user_violations uv
          WHERE uv.user_id = p.id AND uv.metadata->>'action' = 'delete'
        ),
        'active_restrictions', (
          SELECT COUNT(*)::INTEGER FROM public.user_restrictions ur
          WHERE ur.user_id = p.id AND ur.status = 'active'
            AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
        ),
        'latest_case_at', (
          SELECT MAX(mc.last_reported_at) FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
        ),
        'latest_priority', (
          SELECT mc.priority FROM public.moderation_report_cases mc
          WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
          ORDER BY mc.last_reported_at DESC LIMIT 1
        ),
        'risk_score', ROUND((
          LEAST((
            SELECT COUNT(*)::numeric FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.last_reported_at > NOW() - interval '30 days'
          ) / 10, 1) * 30
          + LEAST((
            SELECT COUNT(*)::numeric FROM public.user_violations uv
            WHERE uv.user_id = p.id AND uv.status = 'active'
              AND uv.confirmed_at > NOW() - interval '90 days'
          ) / 5, 1) * 40
          + LEAST((
            SELECT COUNT(*)::numeric FROM public.user_restrictions ur
            WHERE ur.user_id = p.id AND ur.status = 'active'
              AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
          ), 1) * 20
          + CASE WHEN (
            SELECT COUNT(*) FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
              AND mc.priority IN ('high', 'urgent')
          ) > 0 THEN 10 ELSE 0 END
        ), 1),
        'risk_level', CASE
          WHEN (
            SELECT COUNT(*) FROM public.user_violations uv
            WHERE uv.user_id = p.id AND uv.status = 'active'
              AND uv.confirmed_at > NOW() - interval '90 days'
          ) >= 3 THEN 'urgent'
          WHEN (
            SELECT COUNT(*) FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
              AND mc.priority IN ('high', 'urgent')
          ) > 0 THEN 'high'
          WHEN (
            SELECT COUNT(*) FROM public.user_violations uv
            WHERE uv.user_id = p.id AND uv.status = 'active'
              AND uv.confirmed_at > NOW() - interval '90 days'
          ) > 0 THEN 'high'
          WHEN (
            SELECT COUNT(*) FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id AND mc.status IN ('pending', 'reviewing')
          ) > 0 THEN 'normal'
          ELSE 'normal' END
    ) AS row_data
    FROM public.profiles p
    WHERE (
        v_query = ''
        OR p.nickname ILIKE '%' || v_query || '%'
        OR p.id::TEXT ILIKE v_query || '%'
      )
      AND (
        p_suspicious IS NULL
        OR (
          p_suspicious
          AND EXISTS (
            SELECT 1 FROM public.moderation_report_cases mc
            WHERE mc.target_user_id = p.id
              AND (COALESCE(mc.suspicious_report, FALSE) OR mc.report_count >= 3)
          )
        )
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_violations uv WHERE uv.user_id = p.id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_restrictions ur WHERE ur.user_id = p.id
        )
    )
    LIMIT v_limit
  ) sub;

  SELECT jsonb_build_object(
    'pending_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status IN ('pending', 'reviewing')
    ),
    'kept_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status = 'resolved' AND c.outcome = 'kept'
    ),
    'reminded_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status = 'resolved' AND c.outcome = 'reminded'
    ),
    'deleted_cases', (
      SELECT COUNT(*)::INTEGER FROM public.moderation_report_cases c
      WHERE c.status = 'resolved' AND c.outcome = 'deleted'
    ),
    'reporter_risk_count', (
      SELECT COUNT(*)::INTEGER FROM public.user_reporter_stats rs
      WHERE rs.invalid_reports >= 5 OR rs.duplicate_attempts >= 3
        OR rs.reports_last_24h >= 10 OR COALESCE((rs.metadata->>'low_quality')::BOOLEAN, FALSE)
    ),
    'target_user_risk_count', (
      SELECT COUNT(*)::INTEGER FROM public.profiles p
      WHERE EXISTS (
        SELECT 1 FROM public.moderation_report_cases mc WHERE mc.target_user_id = p.id
      )
      OR EXISTS (
        SELECT 1 FROM public.user_violations uv WHERE uv.user_id = p.id
      )
    )
  ) INTO v_counts;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'tab', p_tab,
    'cases', v_cases,
    'reporters', v_reporters,
    'target_users', v_target_users,
    'counts', v_counts,
    'filtered', jsonb_build_object(
      'cases', jsonb_array_length(v_cases),
      'reporters', jsonb_array_length(v_reporters),
      'target_users', jsonb_array_length(v_target_users)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_center_v1(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_center_v1(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. 独立举报者风险详情
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_reporter_detail_v1(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.profiles%ROWTYPE;
  v_stats public.user_reporter_stats%ROWTYPE;
  v_recent_reports JSONB;
  v_target_distribution JSONB;
  v_focused_target JSONB;
  v_malicious_history JSONB;
  v_restriction_history JSONB;
  v_risk_score NUMERIC := 0;
  v_risk_level TEXT := 'normal';
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  SELECT * INTO v_user FROM public.profiles WHERE id = p_user_id;
  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '没有找到该用户。');
  END IF;

  SELECT * INTO v_stats FROM public.user_reporter_stats WHERE user_id = p_user_id;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_recent_reports
  FROM (
    SELECT jsonb_build_object(
      'id', r.id,
      'target_type', r.target_type,
      'target_id', r.target_id,
      'target_title', r.target_title,
      'target_nickname', r.target_nickname,
      'reason_category', r.reason_category,
      'details', left(COALESCE(r.details, ''), 200),
      'status', r.status,
      'created_at', r.created_at
    ) AS row_data
    FROM (
      SELECT cr.id, cr.target_type, cr.target_id, cr.reason_category, cr.details, cr.status, cr.created_at,
        CASE WHEN cr.target_type = 'post' THEN COALESCE((SELECT po.title FROM public.posts po WHERE po.id = cr.target_id), '')
             WHEN cr.target_type = 'comment' THEN '评论于《' || COALESCE((SELECT po.title FROM public.posts po WHERE po.id = cm.post_id), '未知作品') || '》'
             ELSE COALESCE((SELECT pr.nickname FROM public.profiles pr WHERE pr.id = cr.target_id), '') END AS target_title,
        CASE WHEN cr.target_type = 'post' THEN COALESCE((SELECT p.nickname FROM public.posts po JOIN public.profiles p ON p.id = po.user_id WHERE po.id = cr.target_id), '')
             WHEN cr.target_type = 'comment' THEN COALESCE((SELECT p.nickname FROM public.comments co JOIN public.profiles p ON p.id = co.user_id WHERE co.id = cr.target_id), '')
             ELSE COALESCE((SELECT pr.nickname FROM public.profiles pr WHERE pr.id = cr.target_id), '') END AS target_nickname
      FROM public.content_reports cr
      LEFT JOIN public.comments cm ON cm.id = cr.target_id AND cr.target_type = 'comment'
      WHERE cr.reporter_id = p_user_id
      UNION ALL
      SELECT cm.id, 'comment'::TEXT, cm.comment_id, cm.reason_category, cm.details, cm.status, cm.created_at,
        '评论于《' || COALESCE((SELECT po.title FROM public.posts po WHERE po.id = c.post_id), '未知作品') || '》',
        COALESCE((SELECT p.nickname FROM public.profiles p WHERE p.id = c.user_id), '')
      FROM public.comment_reports cm
      JOIN public.comments c ON c.id = cm.comment_id
      WHERE cm.reporter_id = p_user_id
    ) r
    ORDER BY r.created_at DESC
    LIMIT 50
  ) sub;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_target_distribution
  FROM (
    SELECT jsonb_build_object(
      'target_type', target_type,
      'target_id', target_id,
      'target_title', target_title,
      'target_user_id', target_user_id,
      'target_nickname', target_nickname,
      'count', cnt,
      'last_at', last_at
    ) AS row_data
    FROM (
      SELECT t.target_type, t.target_id,
        CASE WHEN t.target_type = 'post' THEN COALESCE((SELECT po.title FROM public.posts po WHERE po.id = t.target_id), '')
             WHEN t.target_type = 'comment' THEN '评论于《' || COALESCE((SELECT po.title FROM public.posts po WHERE po.id = c.post_id), '未知作品') || '》'
             ELSE COALESCE((SELECT pr.nickname FROM public.profiles pr WHERE pr.id = t.target_id), '') END AS target_title,
        CASE WHEN t.target_type = 'post' THEN (SELECT po.user_id FROM public.posts po WHERE po.id = t.target_id)
             WHEN t.target_type = 'comment' THEN c.user_id
             ELSE t.target_id END AS target_user_id,
        CASE WHEN t.target_type = 'post' THEN COALESCE((SELECT pr.nickname FROM public.profiles pr WHERE pr.id = (SELECT po.user_id FROM public.posts po WHERE po.id = t.target_id)), '')
             WHEN t.target_type = 'comment' THEN COALESCE((SELECT pr.nickname FROM public.profiles pr WHERE pr.id = c.user_id), '')
             ELSE COALESCE((SELECT pr.nickname FROM public.profiles pr WHERE pr.id = t.target_id), '') END AS target_nickname,
        COUNT(*)::INTEGER AS cnt,
        MAX(t.created_at) AS last_at
      FROM (
        SELECT cr.target_type, cr.target_id, cr.created_at
        FROM public.content_reports cr WHERE cr.reporter_id = p_user_id
        UNION ALL
        SELECT 'comment'::TEXT, cm.comment_id, cm.created_at
        FROM public.comment_reports cm WHERE cm.reporter_id = p_user_id
      ) t
      LEFT JOIN public.comments c ON c.id = t.target_id AND t.target_type = 'comment'
      GROUP BY t.target_type, t.target_id, c.user_id, c.post_id
      ORDER BY cnt DESC
      LIMIT 30
    ) d
  ) sub;

  SELECT jsonb_build_object('target_user_id', target_user_id, 'nickname', nickname, 'count', cnt)
  INTO v_focused_target
  FROM (
    SELECT target_user_id,
      COALESCE((SELECT pr.nickname FROM public.profiles pr WHERE pr.id = target_user_id), '') AS nickname,
      COUNT(*) AS cnt
    FROM (
      SELECT CASE WHEN cr.target_type = 'post' THEN (SELECT po.user_id FROM public.posts po WHERE po.id = cr.target_id)
                  WHEN cr.target_type = 'comment' THEN (SELECT co.user_id FROM public.comments co WHERE co.id = cr.target_id)
                  ELSE cr.target_id END AS target_user_id
      FROM public.content_reports cr WHERE cr.reporter_id = p_user_id
      UNION ALL
      SELECT co.user_id FROM public.comment_reports cm JOIN public.comments co ON co.id = cm.comment_id
      WHERE cm.reporter_id = p_user_id
    ) t
    WHERE target_user_id IS NOT NULL
    GROUP BY target_user_id
    ORDER BY cnt DESC
    LIMIT 1
  ) f
  WHERE cnt >= 3;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_malicious_history
  FROM (
    SELECT jsonb_build_object(
      'id', uv.id,
      'category', uv.category,
      'summary', uv.summary,
      'status', uv.status,
      'confirmed_at', uv.confirmed_at,
      'metadata', uv.metadata
    ) AS row_data
    FROM public.user_violations uv
    WHERE uv.user_id = p_user_id
      AND (uv.category LIKE '%恶意举报%' OR COALESCE(uv.metadata->>'malicious_report', 'false') = 'true')
    ORDER BY uv.confirmed_at DESC
    LIMIT 30
  ) sub;

  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
  INTO v_restriction_history
  FROM (
    SELECT jsonb_build_object(
      'id', ur.id,
      'restriction_type', ur.restriction_type,
      'status', ur.status,
      'reason', ur.reason,
      'starts_at', ur.starts_at,
      'ends_at', ur.ends_at,
      'lifted_at', ur.lifted_at,
      'created_at', ur.created_at,
      'metadata', ur.metadata
    ) AS row_data
    FROM public.user_restrictions ur
    WHERE ur.user_id = p_user_id AND ur.restriction_type = 'report'
    ORDER BY ur.created_at DESC
    LIMIT 30
  ) sub;

  v_risk_score := ROUND((
    CASE WHEN COALESCE(v_stats.total_reports, 0) >= 8
      THEN (COALESCE(v_stats.invalid_reports, 0)::numeric / GREATEST(v_stats.total_reports, 1)) * 40 ELSE 0 END
    + LEAST(COALESCE(v_stats.reports_last_24h, 0)::numeric / 20, 1) * 25
    + LEAST(COALESCE(v_stats.duplicate_attempts, 0)::numeric / 5, 1) * 20
    + CASE WHEN COALESCE((v_stats.metadata->>'low_quality')::BOOLEAN, FALSE) THEN 10 ELSE 0 END
    + CASE WHEN v_stats.report_restricted_until IS NOT NULL AND v_stats.report_restricted_until > NOW() THEN 5 ELSE 0 END
  ), 1);

  IF COALESCE(v_stats.total_reports, 0) > 0
     AND (
       COALESCE(v_stats.invalid_reports, 0)::numeric / GREATEST(v_stats.total_reports, 1) >= 0.85
       OR COALESCE(v_stats.reports_last_24h, 0) >= 15
       OR COALESCE((v_stats.metadata->>'low_quality')::BOOLEAN, FALSE)
     ) AND (
       COALESCE(v_stats.duplicate_attempts, 0) >= 3
       OR COALESCE(v_stats.invalid_reports, 0) >= 8
       OR v_stats.report_restricted_until IS NOT NULL
     ) THEN
    v_risk_level := 'urgent';
  ELSIF COALESCE(v_stats.invalid_reports, 0) >= 5
     AND COALESCE(v_stats.invalid_reports, 0)::numeric / GREATEST(v_stats.total_reports, 1) >= 0.7 THEN
    v_risk_level := 'high';
  ELSIF COALESCE(v_stats.duplicate_attempts, 0) >= 3
     OR COALESCE(v_stats.reports_last_24h, 0) >= 10 THEN
    v_risk_level := 'high';
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'user', jsonb_build_object(
      'id', v_user.id,
      'nickname', v_user.nickname,
      'avatar_url', v_user.avatar_url,
      'bio', v_user.bio,
      'created_at', v_user.created_at,
      'moderation_status', v_user.moderation_status,
      'moderation_note', v_user.moderation_note,
      'moderated_at', v_user.moderated_at
    ),
    'reporter_stats', jsonb_build_object(
      'total_reports', COALESCE(v_stats.total_reports, 0),
      'pending_reports', COALESCE(v_stats.pending_reports, 0),
      'valid_reports', COALESCE(v_stats.valid_reports, 0),
      'invalid_reports', COALESCE(v_stats.invalid_reports, 0),
      'duplicate_attempts', COALESCE(v_stats.duplicate_attempts, 0),
      'reports_last_24h', COALESCE(v_stats.reports_last_24h, 0),
      'reports_last_30d', COALESCE(v_stats.reports_last_30d, jsonb_array_length(v_recent_reports)),
      'last_report_at', v_stats.last_report_at,
      'report_restricted_until', v_stats.report_restricted_until,
      'malicious_report_count', COALESCE(v_stats.malicious_report_count, 0),
      'report_restriction_count', COALESCE(v_stats.report_restriction_count, 0),
      'low_quality', COALESCE((v_stats.metadata->>'low_quality')::BOOLEAN, FALSE),
      'low_quality_reason', v_stats.metadata->>'low_quality_reason',
      'low_quality_at', v_stats.metadata->>'low_quality_at',
      'risk_score', v_risk_score,
      'risk_level', v_risk_level
    ),
    'report_permission', jsonb_build_object(
      'status', CASE
        WHEN EXISTS (
          SELECT 1 FROM public.user_restrictions ur
          WHERE ur.user_id = p_user_id AND ur.restriction_type = 'report'
            AND ur.status = 'active' AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
        ) OR (v_stats.report_restricted_until IS NOT NULL AND v_stats.report_restricted_until > NOW())
          THEN 'restricted'
        ELSE 'active' END,
      'restricted_until', CASE
        WHEN v_stats.report_restricted_until IS NOT NULL AND v_stats.report_restricted_until > NOW()
          THEN v_stats.report_restricted_until
        ELSE (
          SELECT MAX(ur.ends_at) FROM public.user_restrictions ur
          WHERE ur.user_id = p_user_id AND ur.restriction_type = 'report'
            AND ur.status = 'active' AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
        ) END
    ),
    'recent_reports', v_recent_reports,
    'target_distribution', v_target_distribution,
    'focused_target', v_focused_target,
    'malicious_history', v_malicious_history,
    'restriction_history', v_restriction_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reporter_detail_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reporter_detail_v1(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. 保留举报权限（只写审计，不改变现有限制）
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_keep_report_permission(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  v_reason TEXT;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '没有找到该用户。');
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'keep_report_permission', 'user', p_user_id,
    left(COALESCE(NULLIF(v_reason, ''), '管理员确认保留举报权限'), 500), NOW(),
    jsonb_build_object('reason', v_reason)
  );
  RETURN jsonb_build_object('ok', TRUE, 'message', '已确认保留该用户的举报权限。');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'keep_failed', 'message', '操作失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_keep_report_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_keep_report_permission(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. 举报者低质量队列标记（第二级恶意举报治理）
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_reporter_low_quality(
  p_user_id UUID,
  p_low_quality BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  v_reason TEXT;
  v_meta JSONB;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '没有找到该用户。');
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写处理说明。');
  END IF;

  v_meta := COALESCE((
    SELECT metadata FROM public.user_reporter_stats WHERE user_id = p_user_id
  ), '{}'::jsonb);
  v_meta := v_meta || jsonb_build_object(
    'low_quality', p_low_quality,
    'low_quality_reason', v_reason,
    'low_quality_at', NOW()::TEXT,
    'low_quality_by', admin_id::TEXT
  );

  INSERT INTO public.user_reporter_stats (user_id, metadata, updated_at)
  VALUES (p_user_id, v_meta, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET metadata = EXCLUDED.metadata,
        updated_at = NOW();

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id,
    CASE WHEN p_low_quality THEN 'mark_reporter_low_quality' ELSE 'unmark_reporter_low_quality' END,
    'user', p_user_id, left(v_reason, 500), NOW(),
    jsonb_build_object('low_quality', p_low_quality, 'reason', v_reason)
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'low_quality', p_low_quality,
    'message', CASE WHEN p_low_quality THEN '该举报者已进入低质量举报队列。' ELSE '已从低质量举报队列移除。' END
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'update_failed', 'message', '更新失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_reporter_low_quality(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_reporter_low_quality(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- ============================================================
-- 校验查询（执行后可在 SQL Editor 直接运行确认）
-- SELECT to_regprocedure('public.admin_report_center_v1(text,text,text,text,boolean,boolean,boolean,text,integer)');
-- SELECT to_regprocedure('public.admin_reporter_detail_v1(uuid)');
-- SELECT to_regprocedure('public.admin_keep_report_permission(uuid,text)');
-- SELECT to_regprocedure('public.admin_set_reporter_low_quality(uuid,boolean,text)');
-- ============================================================

COMMIT;
