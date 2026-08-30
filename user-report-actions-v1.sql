-- ============================================================
-- Inkland 模块 8/9 补全：用户举报 7 种处理结果（飞书 4.9-4.11）
-- 文件：user-report-actions-v1.sql
-- 依赖：report-closure-v1.sql、report-low-quality-queue-v1.sql、
--       user-enforcement-module6-v1.sql
-- 说明：幂等，可重复执行。在 Supabase SQL Editor 执行后：
--   1. 后台可用 admin_resolve_user_report_case 执行 7 种处理结果；
--   2. 资料整改使用 profile_revision_requests 记录，前台修改后恢复展示；
--   3. user_restrictions 增加 profile_edit / interact 类型，
--      资料编辑、关注、收藏、点赞均有数据库触发器硬拦截；
--   4. 举报中心状态筛选新增举报不成立、资料整改、警告、限制、
--      暂停、封禁等结果。
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 个人资料整改字段与请求表
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_revision_status TEXT;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_revision_request_id UUID;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hidden_profile_fields JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS external_link TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_profile_revision_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_profile_revision_status_check
      CHECK (profile_revision_status IS NULL OR profile_revision_status IN ('requested', 'submitted'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.profile_revision_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.moderation_report_cases(id) ON DELETE SET NULL,
  issue_type TEXT NOT NULL,
  issue_detail TEXT,
  original_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'requested',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profile_revision_requests_issue_type_check
    CHECK (issue_type IN ('avatar', 'nickname', 'bio', 'external_link')),
  CONSTRAINT profile_revision_requests_status_check
    CHECK (status IN ('requested', 'submitted', 'confirmed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS profile_revision_requests_user_idx
  ON public.profile_revision_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_revision_requests_case_idx
  ON public.profile_revision_requests (case_id);

ALTER TABLE public.profile_revision_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profile_revision_requests_admin_all ON public.profile_revision_requests;
CREATE POLICY profile_revision_requests_admin_all ON public.profile_revision_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS profile_revision_requests_self_select ON public.profile_revision_requests;
CREATE POLICY profile_revision_requests_self_select ON public.profile_revision_requests
  FOR SELECT USING (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2. 限制类型扩展
-- ------------------------------------------------------------

ALTER TABLE public.user_restrictions DROP CONSTRAINT IF EXISTS user_restrictions_type_check;
ALTER TABLE public.user_restrictions ADD CONSTRAINT user_restrictions_type_check
  CHECK (restriction_type IN ('comment', 'publish', 'report', 'account', 'profile_edit', 'interact'));

-- ------------------------------------------------------------
-- 3. 用户举报案件 7 种处理结果
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_resolve_user_report_case(
  p_case_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_options JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  case_record public.moderation_report_cases%ROWTYPE;
  snapshot_record public.moderation_report_snapshots%ROWTYPE;
  profile_record public.profiles%ROWTYPE;
  report_row RECORD;
  report_ids UUID[] := '{}';
  reporter_ids UUID[] := '{}';
  reporter_id UUID;
  outcome TEXT;
  now_ts TIMESTAMPTZ := NOW();
  v_reason TEXT;
  v_note TEXT;
  v_options JSONB;
  v_issue_type TEXT;
  v_issue_label TEXT;
  v_hide_profile BOOLEAN := TRUE;
  v_request_id UUID;
  v_notify TEXT;
  v_template_key TEXT;
  v_reporter_notify TEXT;
  v_reporter_object TEXT;
  v_reporter_reason TEXT;
  v_hidden_fields JSONB := '[]'::jsonb;
  v_old_profile JSONB;
  v_content_target_type TEXT;
  v_content_target_id UUID;
  v_content_action TEXT;
  v_owner_id UUID;
  v_content_title TEXT;
  v_content_snippet TEXT;
  v_enforce_result JSONB;
  v_restriction_types TEXT[] := '{}';
  v_restriction_type TEXT;
  v_restriction_label TEXT;
  v_restriction_labels TEXT[] := '{}';
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_immediate BOOLEAN := TRUE;
  v_count_violation BOOLEAN := TRUE;
  v_hide_content BOOLEAN := FALSE;
  v_category TEXT;
  v_severity TEXT;
  v_restriction_id UUID;
  v_cur_status TEXT;
  v_notify_date TEXT;
  v_violation_summary TEXT;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_case_id IS NULL OR p_action IS NULL
     OR p_action NOT IN ('no_violation', 'convert_content', 'profile_revision', 'warn', 'restrict', 'suspend', 'ban') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '处理参数无效。');
  END IF;

  SELECT * INTO case_record
  FROM public.moderation_report_cases WHERE id = p_case_id;
  IF case_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'case_missing', 'message', '没有找到该举报案件。');
  END IF;
  IF case_record.target_type <> 'user' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'wrong_case_type', 'message', '该案件不是用户举报案件。');
  END IF;
  IF case_record.status NOT IN ('pending', 'reviewing') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'already_resolved', 'message', '该举报案件已处理。');
  END IF;
  IF case_record.target_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '该账号已不存在，无法执行账号处理。');
  END IF;

  SELECT * INTO profile_record
  FROM public.profiles WHERE id = case_record.target_user_id;
  IF profile_record.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '该账号已不存在，无法执行账号处理。');
  END IF;

  SELECT * INTO snapshot_record
  FROM public.moderation_report_snapshots
  WHERE case_id = p_case_id LIMIT 1;

  v_reason := btrim(COALESCE(p_reason, ''));
  v_note := btrim(COALESCE(p_note, ''));
  v_options := COALESCE(p_options, '{}'::jsonb);
  outcome := CASE p_action
    WHEN 'no_violation' THEN 'no_violation'
    WHEN 'convert_content' THEN 'content_case'
    WHEN 'profile_revision' THEN 'profile_changes'
    WHEN 'warn' THEN 'warned'
    WHEN 'restrict' THEN 'restricted'
    WHEN 'suspend' THEN 'suspended'
    ELSE 'banned' END;

  -- 校验动作参数
  IF p_action = 'profile_revision' THEN
    v_issue_type := btrim(COALESCE(v_options->>'issue_type', ''));
    IF v_issue_type NOT IN ('avatar', 'nickname', 'bio', 'external_link') THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_issue', 'message', '请选择需要修改的资料位置。');
    END IF;
    v_issue_label := CASE v_issue_type
      WHEN 'avatar' THEN '头像'
      WHEN 'nickname' THEN '昵称'
      WHEN 'bio' THEN '个人简介'
      ELSE '外部链接' END;
    v_hide_profile := COALESCE((v_options->>'hide_profile')::BOOLEAN, TRUE);
    IF v_reason = '' THEN v_reason := '包含不适宜内容'; END IF;
  ELSIF p_action = 'convert_content' THEN
    v_content_target_type := btrim(COALESCE(v_options->>'target_type', ''));
    v_content_target_id := NULLIF(btrim(COALESCE(v_options->>'target_id', '')), '')::UUID;
    v_content_action := btrim(COALESCE(v_options->>'content_action', ''));
    IF v_content_target_type NOT IN ('post', 'comment')
       OR v_content_action NOT IN ('keep', 'remind', 'delete')
       OR v_content_target_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_content', 'message', '请选择具体违规内容及处理方式。');
    END IF;
    IF v_content_target_type = 'comment' THEN
      SELECT user_id, content INTO v_owner_id, v_content_snippet
      FROM public.comments WHERE id = v_content_target_id;
      v_content_title := COALESCE((
        SELECT p.title FROM public.posts p
        JOIN public.comments c ON c.post_id = p.id
        WHERE c.id = v_content_target_id
      ), '');
    ELSE
      SELECT user_id, title, content INTO v_owner_id, v_content_title, v_content_snippet
      FROM public.posts WHERE id = v_content_target_id;
    END IF;
    IF v_owner_id IS NULL OR v_owner_id <> case_record.target_user_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_content', 'message', '所选内容不属于被举报用户。');
    END IF;
  ELSIF p_action = 'restrict' THEN
    SELECT COALESCE(array_agg(value), '{}'::TEXT[])
    INTO v_restriction_types
    FROM jsonb_array_elements_text(v_options->'restriction_types') AS t(value);
    IF COALESCE(array_length(v_restriction_types, 1), 0) = 0
       OR EXISTS (
         SELECT 1 FROM unnest(v_restriction_types) AS t(value)
         WHERE value NOT IN ('profile_edit', 'report', 'interact')
       ) THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_restrict', 'message', '请选择要限制的功能。');
    END IF;
    v_immediate := COALESCE((v_options->>'immediate')::BOOLEAN, TRUE);
    v_starts_at := CASE WHEN v_immediate THEN now_ts
      ELSE COALESCE(NULLIF(v_options->>'starts_at', '')::TIMESTAMPTZ, now_ts) END;
    v_ends_at := NULLIF(v_options->>'ends_at', '')::TIMESTAMPTZ;
    IF v_ends_at IS NULL OR v_ends_at <= v_starts_at THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_ends_at', 'message', '请选择晚于开始时间的结束时间。');
    END IF;
    IF v_reason = '' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写限制原因。');
    END IF;
    v_count_violation := COALESCE((v_options->>'count_violation')::BOOLEAN, TRUE);
  ELSIF p_action IN ('warn', 'suspend', 'ban') THEN
    IF v_reason = '' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写处罚原因。');
    END IF;
    v_count_violation := COALESCE((v_options->>'count_violation')::BOOLEAN, TRUE);
    v_hide_content := COALESCE((v_options->>'hide_content')::BOOLEAN, FALSE);
    IF p_action = 'suspend' THEN
      v_ends_at := NULLIF(v_options->>'ends_at', '')::TIMESTAMPTZ;
      IF v_ends_at IS NULL OR v_ends_at <= now_ts THEN
        RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_ends_at', 'message', '请选择晚于当前时间的结束时间。');
      END IF;
    ELSIF p_action = 'ban' AND NULLIF(v_options->>'ends_at', '') IS NOT NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'ban_no_ends', 'message', '永久封禁不需要结束时间。');
    END IF;
  END IF;

  -- 先执行实际措施，全部成功后再结案（失败时整段回滚，保留管理员选择）
  IF p_action = 'convert_content' THEN
    IF v_content_target_type = 'comment' THEN
      IF v_content_action = 'delete' THEN
        DELETE FROM public.comments WHERE id = v_content_target_id;
      END IF;
    ELSIF v_content_action = 'delete' THEN
      DELETE FROM public.posts WHERE id = v_content_target_id;
    END IF;

    IF v_content_action = 'remind' THEN
      INSERT INTO public.notifications (
        user_id, type, actor_id, post_id, content, read, created_at,
        template_key, related_entity_type, related_entity_id, metadata,
        delivery_status, sent_at
      ) VALUES (
        v_owner_id, 'system', NULL, NULL,
        CASE WHEN v_content_target_type = 'comment'
          THEN '你的评论收到文明提醒：请友善交流，避免使用攻击、骚扰或威胁性语言。'
          ELSE '你的作品收到文明提醒：请检查作品内容，如涉及社区规则要求调整，请及时修改。' END,
        FALSE, now_ts, 'content_civility_reminder', v_content_target_type, v_content_target_id,
        jsonb_build_object('case_id', p_case_id), 'sent', now_ts
      );
    ELSIF v_content_action = 'delete' THEN
      INSERT INTO public.notifications (
        user_id, type, actor_id, post_id, content, read, created_at,
        template_key, related_entity_type, related_entity_id, metadata,
        delivery_status, sent_at
      ) VALUES (
        v_owner_id, 'system', NULL, NULL,
        CASE WHEN v_content_target_type = 'comment'
          THEN '内容已被删除' || E'\n'
            || '删除对象：你发布在《' || COALESCE(v_content_title, '某作品') || '》下的评论' || E'\n'
          ELSE '内容已被删除' || E'\n'
            || '删除对象：你的作品《' || COALESCE(v_content_title, '未命名作品') || '》' || E'\n' END
          || '删除原因：违反社区规范（' || COALESCE(NULLIF(btrim(COALESCE(case_record.primary_reason_category, '')), ''), '其他违规') || '）' || E'\n'
          || '已采取措施：该内容已被删除，不再公开展示。' || E'\n'
          || '下一步：如需提交复核，可通过设置页反馈或联系客服邮箱联系我们。',
        FALSE, now_ts,
        CASE WHEN v_content_target_type = 'comment' THEN 'comment_deleted' ELSE 'post_deleted' END,
        v_content_target_type, v_content_target_id,
        jsonb_build_object('case_id', p_case_id, 'title', v_content_title),
        'sent', now_ts
      );
      INSERT INTO public.user_violations (
        user_id, source_type, source_id, content_type, content_id,
        category, severity, summary, confirmed_by, confirmed_at, metadata
      ) VALUES (
        v_owner_id, 'report_case', p_case_id, v_content_target_type, v_content_target_id,
        COALESCE(case_record.primary_reason_category, '其他违规'), 'standard',
        CASE WHEN v_content_target_type = 'comment'
          THEN '用户举报转为内容案件后删除评论：' || left(COALESCE(v_content_snippet, ''), 120)
          ELSE '用户举报转为内容案件后删除作品：' || COALESCE(v_content_title, '') END,
        admin_id, now_ts,
        jsonb_build_object('action', 'delete', 'case_id', p_case_id, 'note', v_note)
      );
    END IF;

  ELSIF p_action = 'profile_revision' THEN
    v_old_profile := jsonb_build_object(
      'nickname', profile_record.nickname,
      'avatar_url', profile_record.avatar_url,
      'bio', profile_record.bio,
      'external_link', profile_record.external_link,
      'hidden_profile_fields', profile_record.hidden_profile_fields
    );
    IF v_hide_profile THEN
      IF jsonb_typeof(profile_record.hidden_profile_fields) = 'array' THEN
        SELECT COALESCE(jsonb_agg(DISTINCT value), '[]'::jsonb) INTO v_hidden_fields
        FROM jsonb_array_elements_text(
          COALESCE(profile_record.hidden_profile_fields, '[]'::jsonb) || jsonb_build_array(v_issue_type)
        ) AS t(value);
      ELSE
        v_hidden_fields := jsonb_build_array(v_issue_type);
      END IF;
    END IF;

    INSERT INTO public.profile_revision_requests (
      user_id, case_id, issue_type, issue_detail, original_profile,
      hidden_fields, status, created_by, created_at, updated_at
    ) VALUES (
      case_record.target_user_id, p_case_id, v_issue_type, v_reason, v_old_profile,
      v_hidden_fields, 'requested', admin_id, now_ts, now_ts
    ) RETURNING id INTO v_request_id;

    UPDATE public.profiles
    SET profile_revision_status = 'requested',
        profile_revision_request_id = v_request_id,
        hidden_profile_fields = v_hidden_fields,
        nickname = CASE WHEN v_hide_profile AND v_issue_type = 'nickname' THEN '待修改用户' ELSE nickname END,
        avatar_url = CASE WHEN v_hide_profile AND v_issue_type = 'avatar' THEN NULL ELSE avatar_url END,
        bio = CASE WHEN v_hide_profile AND v_issue_type = 'bio' THEN NULL ELSE bio END,
        external_link = CASE WHEN v_hide_profile AND v_issue_type = 'external_link' THEN NULL ELSE external_link END,
        updated_at = now_ts
    WHERE id = case_record.target_user_id;

    v_notify := '个人资料修改通知' || E'\n'
      || '你的账号资料中存在需要修改的内容。' || E'\n'
      || '问题位置：' || v_issue_label || E'\n'
      || '问题类型：' || v_reason || E'\n'
      || '请修改后重新提交。'
      || CASE WHEN v_hide_profile THEN '完成审核前，相关资料将暂时隐藏。' ELSE '修改完成后资料将恢复正常展示。' END;
    v_template_key := 'profile_revision_request';
    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      case_record.target_user_id, 'system', NULL, NULL, v_notify, FALSE, now_ts,
      v_template_key, 'profile_revision', v_request_id,
      jsonb_build_object(
        'case_id', p_case_id,
        'issue_type', v_issue_type,
        'hide_profile', v_hide_profile
      ),
      'sent', now_ts
    );

  ELSIF p_action = 'restrict' THEN
    FOREACH v_restriction_type IN ARRAY v_restriction_types
    LOOP
      v_restriction_id := NULL;
      v_restriction_label := CASE v_restriction_type
        WHEN 'profile_edit' THEN '修改个人资料'
        WHEN 'report' THEN '提交举报'
        ELSE '与其他用户互动' END;
      v_restriction_labels := v_restriction_labels || v_restriction_label;
      UPDATE public.user_restrictions
      SET status = 'active',
          reason = v_reason,
          starts_at = v_starts_at,
          ends_at = v_ends_at,
          created_by = admin_id,
          lifted_by = NULL,
          lifted_at = NULL,
          metadata = metadata || jsonb_build_object('renewed_at', now_ts),
          updated_at = now_ts
      WHERE user_id = case_record.target_user_id
        AND restriction_type = v_restriction_type
        AND status = 'active'
      RETURNING id INTO v_restriction_id;
      IF v_restriction_id IS NULL THEN
        INSERT INTO public.user_restrictions (
          user_id, restriction_type, status, reason, starts_at, ends_at,
          created_by, metadata, created_at, updated_at
        ) VALUES (
          case_record.target_user_id, v_restriction_type, 'active', v_reason,
          v_starts_at, v_ends_at, admin_id, '{}'::jsonb, now_ts, now_ts
        ) RETURNING id INTO v_restriction_id;
      END IF;
      IF v_restriction_type = 'report' THEN
        INSERT INTO public.user_reporter_stats (user_id, report_restricted_until, updated_at)
        VALUES (case_record.target_user_id, v_ends_at, now_ts)
        ON CONFLICT (user_id) DO UPDATE
          SET report_restricted_until = EXCLUDED.report_restricted_until,
              updated_at = now_ts;
      END IF;
    END LOOP;

    SELECT moderation_status INTO v_cur_status
    FROM public.profiles WHERE id = case_record.target_user_id;
    UPDATE public.profiles
    SET moderation_status = CASE WHEN v_cur_status IN ('suspended', 'banned') THEN v_cur_status ELSE 'restricted' END,
        moderation_note = left(v_reason, 500),
        moderated_at = now_ts,
        moderated_by = admin_id
    WHERE id = case_record.target_user_id;

    IF v_count_violation THEN
      INSERT INTO public.user_violations (
        user_id, source_type, source_id, content_type, content_id,
        category, severity, summary, confirmed_by, confirmed_at, metadata
      ) VALUES (
        case_record.target_user_id, 'report_case', p_case_id, 'account', NULL,
        '限制账号功能', 'standard', v_reason, admin_id, now_ts,
        jsonb_build_object(
          'action', 'restrict',
          'restriction_types', v_restriction_types,
          'starts_at', v_starts_at,
          'ends_at', v_ends_at,
          'note', v_note
        )
      );
    END IF;

    v_notify_date := CASE WHEN v_ends_at IS NULL THEN '' ELSE '（至 ' || to_char(v_ends_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') || '）' END;
    v_notify := '功能限制' || E'\n'
      || '你的以下功能已被限制' || v_notify_date || '：' || E'\n'
      || '- ' || array_to_string(v_restriction_labels, E'\n- ') || E'\n'
      || '原因：' || v_reason || E'\n'
      || '限制结束后相关功能会恢复。';
    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      case_record.target_user_id, 'system', NULL, NULL, v_notify, FALSE, now_ts,
      'restriction_functions', 'user', case_record.target_user_id,
      jsonb_build_object(
        'case_id', p_case_id,
        'restriction_types', v_restriction_types,
        'starts_at', v_starts_at,
        'ends_at', v_ends_at,
        'reason', v_reason
      ),
      'sent', now_ts
    );

  ELSIF p_action = 'warn' THEN
    v_enforce_result := public.admin_enforce_user_restriction(
      case_record.target_user_id, 'warn', v_reason, v_count_violation,
      NULL, NULL, FALSE, v_note
    );
    IF NOT COALESCE((v_enforce_result->>'ok')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object(
        'ok', FALSE, 'code', 'enforce_failed',
        'message', COALESCE(v_enforce_result->>'message', '账号警告发送失败，请稍后重试。')
      );
    END IF;

  ELSIF p_action = 'suspend' THEN
    v_enforce_result := public.admin_enforce_user_restriction(
      case_record.target_user_id, 'suspend', v_reason, v_count_violation,
      now_ts, v_ends_at, v_hide_content, v_note
    );
    IF NOT COALESCE((v_enforce_result->>'ok')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object(
        'ok', FALSE, 'code', 'enforce_failed',
        'message', COALESCE(v_enforce_result->>'message', '账号暂停失败，请稍后重试。')
      );
    END IF;

  ELSIF p_action = 'ban' THEN
    v_enforce_result := public.admin_enforce_user_restriction(
      case_record.target_user_id, 'ban', v_reason, v_count_violation,
      NULL, NULL, v_hide_content, v_note
    );
    IF NOT COALESCE((v_enforce_result->>'ok')::BOOLEAN, FALSE) THEN
      RETURN jsonb_build_object(
        'ok', FALSE, 'code', 'enforce_failed',
        'message', COALESCE(v_enforce_result->>'message', '账号封禁失败，请稍后重试。')
      );
    END IF;
  END IF;

  -- 按飞书 3.4.2 固定模板组装“举报已处理”通知（用户举报）
  v_reporter_reason := COALESCE(NULLIF(btrim(COALESCE(case_record.primary_reason_category, '')), ''), '其他违规');
  v_reporter_object := '用户“' || COALESCE(NULLIF(btrim(COALESCE(snapshot_record.object_snapshot->>'nickname', '')), ''), '某用户') || '”';
  v_reporter_notify := '举报已处理' || E'\n'
    || '举报对象：' || v_reporter_object || E'\n'
    || '举报理由：' || v_reporter_reason || E'\n'
    || '我们已经收到你的举报，并将重点关注相关内容和账号。感谢你对社区秩序的维护。';

  -- 全部措施成功后结案
  UPDATE public.moderation_report_cases
  SET status = 'resolved',
      outcome = outcome,
      resolved_by = admin_id,
      resolved_at = now_ts,
      metadata = metadata || jsonb_build_object(
        'action', p_action,
        'options', v_options,
        'note', v_note,
        'resolved_at', now_ts
      ),
      updated_at = now_ts
  WHERE id = p_case_id;

  FOR report_row IN
    SELECT id, reporter_id, target_type, target_id, comment_id
    FROM (
      SELECT id, reporter_id, target_type, target_id, NULL::UUID AS comment_id
      FROM public.content_reports
      WHERE case_id = p_case_id
      UNION ALL
      SELECT id, reporter_id, 'comment', NULL::UUID, comment_id
      FROM public.comment_reports
      WHERE case_id = p_case_id
    ) reports
  LOOP
    IF report_row.target_type = 'comment' THEN
      UPDATE public.comment_reports
      SET status = 'resolved', resolved_by = admin_id, resolved_at = now_ts
      WHERE id = report_row.id;
    ELSE
      UPDATE public.content_reports
      SET status = 'resolved', resolved_by = admin_id, resolved_at = now_ts
      WHERE id = report_row.id;
    END IF;
    report_ids := report_ids || report_row.id;
    IF report_row.reporter_id IS NOT NULL
       AND NOT report_row.reporter_id = ANY(reporter_ids) THEN
      reporter_ids := reporter_ids || report_row.reporter_id;
    END IF;
  END LOOP;

  FOREACH reporter_id IN ARRAY reporter_ids
  LOOP
    -- convert_content 沿用内容案件口径：保留=举报不成立，提醒/删除=举报成立
    v_count_violation := TRUE;
    IF p_action = 'convert_content' AND v_content_action = 'keep' THEN
      v_count_violation := FALSE;
    END IF;
    INSERT INTO public.user_reporter_stats (
      user_id, total_reports, pending_reports, valid_reports, invalid_reports,
      updated_at
    ) VALUES (
      reporter_id, 0, 0,
      CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 0 ELSE 1 END,
      CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 1 ELSE 0 END,
      now_ts
    )
    ON CONFLICT (user_id) DO UPDATE
      SET pending_reports = GREATEST(public.user_reporter_stats.pending_reports - 1, 0),
          valid_reports = public.user_reporter_stats.valid_reports
            + CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 0 ELSE 1 END,
          invalid_reports = public.user_reporter_stats.invalid_reports
            + CASE WHEN p_action = 'no_violation' OR (p_action = 'convert_content' AND v_content_action = 'keep') THEN 1 ELSE 0 END,
          updated_at = now_ts;

    INSERT INTO public.notifications (
      user_id, type, actor_id, post_id, content, read, created_at,
      template_key, related_entity_type, related_entity_id, metadata,
      delivery_status, sent_at
    ) VALUES (
      reporter_id, 'system', NULL, NULL,
      v_reporter_notify, FALSE, now_ts,
      'report_handled', 'report_case', p_case_id,
      jsonb_build_object('case_id', p_case_id, 'target_type', 'user'),
      'sent', now_ts
    );
  END LOOP;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'resolve_user_report_' || p_action, 'report_case', p_case_id,
    v_note, now_ts,
    jsonb_build_object(
      'action', p_action,
      'outcome', outcome,
      'target_user_id', case_record.target_user_id,
      'options', v_options,
      'reason', v_reason,
      'reporter_count', COALESCE(array_length(reporter_ids, 1), 0),
      'report_ids', report_ids
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'case_id', p_case_id,
    'outcome', outcome,
    'message', CASE p_action
      WHEN 'no_violation' THEN '举报不成立，案件已结案。'
      WHEN 'convert_content' THEN '已转为具体内容案件处理。'
      WHEN 'profile_revision' THEN '资料整改通知已发送。'
      WHEN 'warn' THEN '账号警告已发送。'
      WHEN 'restrict' THEN '功能限制已生效。'
      WHEN 'suspend' THEN '账号已暂停。'
      ELSE '账号已永久封禁。' END
  );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', FALSE, 'code', 'resolve_failed',
      'message', '用户举报处理失败：' || SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_user_report_case(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_user_report_case(UUID, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. 资料整改提交与确认
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.profile_revision_submit(p_fields TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_hidden TEXT[] := '{}';
  v_submitted TEXT[] := '{}';
  v_field TEXT;
  v_remaining TEXT[] := '{}';
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_logged_in', 'message', '请先登录。');
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF v_profile.id IS NULL OR COALESCE(v_profile.profile_revision_status, '') <> 'requested' THEN
    RETURN jsonb_build_object('ok', TRUE, 'submitted_fields', '[]'::jsonb);
  END IF;

  IF jsonb_typeof(COALESCE(v_profile.hidden_profile_fields, '[]'::jsonb)) = 'array' THEN
    SELECT COALESCE(array_agg(value), '{}'::TEXT[]) INTO v_hidden
    FROM jsonb_array_elements_text(v_profile.hidden_profile_fields) AS t(value);
  END IF;
  v_submitted := COALESCE(p_fields, '{}'::TEXT[]);
  FOREACH v_field IN ARRAY v_hidden
  LOOP
    IF NOT v_field = ANY(v_submitted) THEN
      v_remaining := v_remaining || v_field;
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET hidden_profile_fields = COALESCE((
        SELECT jsonb_agg(value) FROM unnest(v_remaining) AS t(value)
      ), '[]'::jsonb),
      profile_revision_status = CASE WHEN COALESCE(array_length(v_remaining, 1), 0) = 0
        THEN 'submitted' ELSE 'requested' END,
      updated_at = NOW()
  WHERE id = v_user_id;

  IF v_profile.profile_revision_request_id IS NOT NULL THEN
    UPDATE public.profile_revision_requests
    SET status = 'submitted', updated_at = NOW()
    WHERE id = v_profile.profile_revision_request_id
      AND status = 'requested';
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'remaining_fields', COALESCE((
      SELECT jsonb_agg(value) FROM unnest(v_remaining) AS t(value)
    ), '[]'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'submit_failed', 'message', '资料整改状态更新失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.profile_revision_submit(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_revision_submit(TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_confirm_profile_revision(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  v_request public.profile_revision_requests%ROWTYPE;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '资料整改记录无效。');
  END IF;
  SELECT * INTO v_request FROM public.profile_revision_requests WHERE id = p_request_id;
  IF v_request.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'request_missing', 'message', '没有找到该资料整改记录。');
  END IF;
  UPDATE public.profile_revision_requests
  SET status = 'confirmed', confirmed_by = admin_id, confirmed_at = now_ts, updated_at = now_ts
  WHERE id = p_request_id;
  UPDATE public.profiles
  SET profile_revision_status = NULL,
      hidden_profile_fields = '[]'::jsonb,
      updated_at = now_ts
  WHERE id = v_request.user_id
    AND profile_revision_request_id = p_request_id;
  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, 'confirm_profile_revision', 'user', v_request.user_id,
    '确认资料整改完成', now_ts,
    jsonb_build_object('request_id', p_request_id, 'issue_type', v_request.issue_type)
  );
  RETURN jsonb_build_object('ok', TRUE, 'message', '资料整改已确认。');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', FALSE, 'code', 'confirm_failed', 'message', '确认失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_profile_revision(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_profile_revision(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. 解除限制支持新增类型（资料编辑 / 互动）
--    复用模块 6 的 admin_lift_user_restriction 定义，仅扩展类型白名单。
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_lift_user_restriction(
  p_user_id UUID,
  p_action TEXT DEFAULT 'lift',
  p_restriction_type TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_restore_content BOOLEAN DEFAULT FALSE,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_id UUID;
  now_ts TIMESTAMPTZ := NOW();
  v_reason TEXT;
  v_row RECORD;
  v_lifted_count INTEGER := 0;
  v_restored_count INTEGER := 0;
  v_hidden_ids UUID[] := '{}';
  v_cur_status TEXT;
  v_new_status TEXT;
  v_active_count INTEGER;
  v_violation_count INTEGER;
  v_notify TEXT;
  v_template_key TEXT;
  v_type_filter TEXT;
  v_func_label TEXT;
BEGIN
  admin_id := auth.uid();
  IF admin_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_user_id IS NULL OR p_action NOT IN ('lift', 'restore') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_params', 'message', '解除参数无效。');
  END IF;
  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_reason', 'message', '请填写解除原因。');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'user_missing', 'message', '没有找到该用户。');
  END IF;

  v_type_filter := CASE
    WHEN p_action = 'restore' THEN 'account'
    WHEN p_restriction_type = 'all' THEN NULL
    WHEN p_restriction_type IN ('comment', 'publish', 'report', 'account', 'profile_edit', 'interact') THEN p_restriction_type
    ELSE NULL
  END;
  IF p_action = 'lift' AND COALESCE(p_restriction_type, '') NOT IN ('all','comment','publish','report','account','profile_edit','interact') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_type', 'message', '请选择要解除的限制类型。');
  END IF;
  IF p_action = 'restore' THEN
    v_type_filter := 'account';
    p_restore_content := TRUE;
  END IF;

  SELECT moderation_status INTO v_cur_status FROM public.profiles WHERE id = p_user_id;

  FOR v_row IN
    SELECT * FROM public.user_restrictions r
    WHERE r.user_id = p_user_id AND r.status = 'active'
      AND (v_type_filter IS NULL OR r.restriction_type = v_type_filter)
  LOOP
    UPDATE public.user_restrictions
    SET status = 'lifted',
        lifted_by = admin_id,
        lifted_at = now_ts,
        metadata = metadata || jsonb_build_object(
          'lift_reason', v_reason,
          'lifted_at', now_ts,
          'lifted_by', admin_id
        ),
        updated_at = now_ts
    WHERE id = v_row.id;
    v_lifted_count := v_lifted_count + 1;
    IF p_restore_content AND v_row.restriction_type = 'account'
       AND jsonb_typeof(v_row.metadata->'hidden_post_ids') = 'array' THEN
      UPDATE public.posts
      SET status = 'published'
      WHERE user_id = p_user_id AND status = 'hidden'
        AND id IN (
          SELECT hid::uuid FROM jsonb_array_elements_text(v_row.metadata->'hidden_post_ids') AS hid
        );
      GET DIAGNOSTICS v_restored_count = ROW_COUNT;
    END IF;
  END LOOP;

  -- 举报限制解除时清空举报人统计表中的截止时间
  IF v_type_filter = 'report' OR v_type_filter IS NULL THEN
    UPDATE public.user_reporter_stats
    SET report_restricted_until = NULL, updated_at = now_ts
    WHERE user_id = p_user_id;
  END IF;

  -- 重算账号状态
  SELECT COUNT(*) INTO v_active_count
  FROM public.user_restrictions r
  WHERE r.user_id = p_user_id AND r.status = 'active'
    AND (r.ends_at IS NULL OR r.ends_at > now_ts);
  IF v_active_count = 0 THEN
    SELECT COUNT(*) INTO v_violation_count
    FROM public.user_violations uv WHERE uv.user_id = p_user_id AND uv.status = 'active';
    v_new_status := CASE WHEN v_violation_count > 0 THEN 'warned' ELSE 'active' END;
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = p_user_id AND r.restriction_type = 'account'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > now_ts)
  ) THEN
    v_new_status := v_cur_status;
  ELSE
    v_new_status := 'restricted';
  END IF;
  UPDATE public.profiles
  SET moderation_status = v_new_status,
      moderation_note = left(v_reason, 500),
      moderated_at = now_ts,
      moderated_by = admin_id
  WHERE id = p_user_id;

  -- 解除/恢复通知
  IF v_type_filter = 'account' OR p_action = 'restore' THEN
    v_template_key := 'account_restored';
    v_func_label := '账号';
    v_notify := '账号恢复' || E'\n' || '你的账号已恢复使用。' || E'\n' || '原因：' || v_reason;
  ELSE
    v_template_key := 'restriction_lifted';
    v_func_label := CASE v_type_filter
      WHEN 'comment' THEN '评论'
      WHEN 'publish' THEN '发布'
      WHEN 'report' THEN '举报'
      WHEN 'profile_edit' THEN '资料编辑'
      WHEN 'interact' THEN '互动'
      ELSE '相关功能' END;
    v_notify := '限制解除' || E'\n' || '你的' || v_func_label || '功能已恢复。' || E'\n' || '原因：' || v_reason;
  END IF;
  INSERT INTO public.notifications (
    user_id, type, actor_id, post_id, content, read, created_at,
    template_key, related_entity_type, related_entity_id, metadata,
    delivery_status, sent_at
  ) VALUES (
    p_user_id, 'system', NULL, NULL, v_notify, FALSE, now_ts,
    v_template_key, 'user', p_user_id,
    jsonb_build_object(
      'action', p_action,
      'restriction_type', v_type_filter,
      'reason', v_reason,
      'restore_content', COALESCE(p_restore_content, FALSE),
      'restored_post_count', v_restored_count
    ),
    'sent', now_ts
  );

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, created_at, metadata
  ) VALUES (
    admin_id, CASE WHEN p_action = 'restore' THEN 'restore_user_account' ELSE 'lift_user_restriction' END,
    'user', p_user_id, btrim(COALESCE(p_note, v_reason)), now_ts,
    jsonb_build_object(
      'action', p_action,
      'restriction_type', v_type_filter,
      'reason', v_reason,
      'lifted_count', v_lifted_count,
      'restore_content', COALESCE(p_restore_content, FALSE),
      'restored_post_count', v_restored_count
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'message', CASE WHEN p_action = 'restore' THEN '账号已恢复使用。' ELSE '限制已解除。' END,
    'lifted_count', v_lifted_count,
    'restored_post_count', v_restored_count
  );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'lift_failed', 'message', '解除操作执行失败：' || SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_lift_user_restriction(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_lift_user_restriction(UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. 资料编辑 / 互动硬拦截触发器
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_user_restrictions_profile_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL OR NEW.id IS NULL OR NEW.id <> auth.uid()
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  SELECT p.moderation_status INTO v_status FROM public.profiles p WHERE p.id = NEW.id;
  IF v_status = 'banned' THEN
    RAISE EXCEPTION '你的账号已被封禁，无法修改个人资料。';
  ELSIF v_status = 'suspended' THEN
    RAISE EXCEPTION '你的账号已被暂停，暂停期间无法修改个人资料。';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = NEW.id AND r.restriction_type = 'profile_edit'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION '你的资料编辑功能暂时受限，无法修改个人资料。';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_restrictions ON public.profiles;
CREATE TRIGGER profiles_enforce_restrictions
BEFORE UPDATE OF nickname, avatar_url, bio, external_link ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_profile_edit();

CREATE OR REPLACE FUNCTION public.enforce_user_restrictions_interact()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_status TEXT;
  v_label TEXT;
BEGIN
  v_user_id := CASE TG_TABLE_NAME
    WHEN 'follows' THEN NEW.follower_id
    ELSE NEW.user_id END;
  IF auth.uid() IS NULL OR v_user_id IS NULL OR v_user_id <> auth.uid() THEN
    RETURN NEW;
  END IF;
  SELECT p.moderation_status INTO v_status FROM public.profiles p WHERE p.id = v_user_id;
  v_label := CASE TG_TABLE_NAME
    WHEN 'follows' THEN '关注其他用户'
    WHEN 'bookmarks' THEN '收藏作品'
    ELSE '点赞作品' END;
  IF v_status = 'banned' THEN
    RAISE EXCEPTION USING MESSAGE = '你的账号已被封禁，无法' || v_label || '。';
  ELSIF v_status = 'suspended' THEN
    RAISE EXCEPTION USING MESSAGE = '你的账号已被暂停，暂停期间无法' || v_label || '。';
  ELSIF EXISTS (
    SELECT 1 FROM public.user_restrictions r
    WHERE r.user_id = v_user_id AND r.restriction_type = 'interact'
      AND r.status = 'active' AND (r.ends_at IS NULL OR r.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION USING MESSAGE = '你的互动功能暂时受限，无法' || v_label || '。';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_enforce_restrictions ON public.follows;
CREATE TRIGGER follows_enforce_restrictions
BEFORE INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_interact();

DROP TRIGGER IF EXISTS bookmarks_enforce_restrictions ON public.bookmarks;
CREATE TRIGGER bookmarks_enforce_restrictions
BEFORE INSERT ON public.bookmarks
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_interact();

DROP TRIGGER IF EXISTS likes_enforce_restrictions ON public.likes;
CREATE TRIGGER likes_enforce_restrictions
BEFORE INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_restrictions_interact();

-- ------------------------------------------------------------
-- 6. 举报中心状态筛选（新增结果状态）
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_report_center_v2(
  p_tab TEXT DEFAULT 'cases',
  p_status TEXT DEFAULT 'all',
  p_priority TEXT DEFAULT 'all',
  p_target_type TEXT DEFAULT 'all',
  p_multi_report BOOLEAN DEFAULT NULL,
  p_suspicious BOOLEAN DEFAULT NULL,
  p_service_error BOOLEAN DEFAULT NULL,
  p_low_quality BOOLEAN DEFAULT NULL,
  p_query TEXT DEFAULT '',
  p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base JSONB;
  v_cases JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_admin', 'message', '需要管理员权限。');
  END IF;
  IF p_status IN ('all', 'pending', 'kept', 'reminded', 'deleted') THEN
    RETURN public.admin_report_center_v1(
      p_tab, p_status, p_priority, p_target_type,
      p_multi_report, p_suspicious, p_service_error, p_low_quality,
      p_query, p_limit
    );
  END IF;
  IF p_status NOT IN ('reviewing', 'no_violation', 'content_case', 'profile_changes', 'warned', 'restricted', 'suspended', 'banned') THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_status', 'message', '筛选状态无效。');
  END IF;

  v_base := public.admin_report_center_v1(
    p_tab, 'all', p_priority, p_target_type,
    p_multi_report, p_suspicious, p_service_error, p_low_quality,
    p_query, p_limit
  );
  SELECT COALESCE(jsonb_agg(x || jsonb_build_object(
      'target_moderation_status', COALESCE((
        SELECT p.moderation_status FROM public.profiles p
        WHERE p.id = (x->>'target_user_id')::UUID
      ), ''),
      'active_restrictions', COALESCE((
        SELECT COUNT(*)::INTEGER FROM public.user_restrictions ur
        WHERE ur.user_id = (x->>'target_user_id')::UUID
          AND ur.status = 'active'
          AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
      ), 0)
    )), '[]'::jsonb) INTO v_cases
  FROM jsonb_array_elements(v_base->'cases') AS x
  WHERE CASE
    WHEN p_status = 'reviewing' THEN x->>'status' = 'reviewing'
    ELSE x->>'outcome' = p_status END;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'tab', p_tab,
    'cases', v_cases,
    'reporters', v_base->'reporters',
    'target_users', v_base->'target_users',
    'counts', v_base->'counts',
    'filtered', jsonb_build_object(
      'cases', jsonb_array_length(v_cases),
      'reporters', jsonb_array_length(v_base->'reporters'),
      'target_users', jsonb_array_length(v_base->'target_users')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_report_center_v2(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_report_center_v2(
  TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, INTEGER
) TO authenticated, service_role;

COMMIT;

-- ============================================================
-- 执行后只读核验（单独运行）
-- ============================================================
-- SELECT to_regprocedure('public.admin_resolve_user_report_case(uuid, text, text, text, jsonb)');
-- SELECT to_regprocedure('public.profile_revision_submit(text[])');
-- SELECT to_regprocedure('public.admin_confirm_profile_revision(uuid)');
-- SELECT to_regprocedure('public.admin_report_center_v2(text, text, text, text, boolean, boolean, boolean, boolean, text, integer)');
-- SELECT to_regclass('public.profile_revision_requests');
