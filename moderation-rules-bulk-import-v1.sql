-- Inkland 敏感词批量导入：数据库迁移 v1
-- 文件：moderation-rules-bulk-import-v1.sql
-- 作用：提供 public.admin_bulk_import_moderation_rules(...) 数据库函数，
--       供第 4 步后台批量导入接口调用。
--
-- 规则摘要（与“功能记忆-敏感词批量导入.md”第 2 步确认一致）：
--   - 每行清洗首尾空格，空行忽略；
--   - 每词 1 至 500 字符，超长记为无效行并返回示例；
--   - 单批最多 5000 条，超过直接拒绝；
--   - 同一批内重复词自动合并；
--   - 只写入 rule_type='keyword'，不做白名单批量导入；
--   - 已存在的敏感词整条跳过，不覆盖原分类、风险、启用状态、备注；
--   - 新词默认启用，整批统一分类、风险与备注；
--   - 每次导入写一条 admin_audit_logs 审计日志。
--
-- 幂等：CREATE OR REPLACE FUNCTION，可重复执行；不修改已有表和已有数据。
-- 执行顺序：先测试环境，后生产环境；执行前仍建议备份数据库。

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.moderation_rules') IS NULL THEN
    RAISE EXCEPTION '缺少前置表 public.moderation_rules：请先执行 admin-moderation-v1-foundation.sql';
  END IF;
  IF to_regclass('public.admin_audit_logs') IS NULL THEN
    RAISE EXCEPTION '缺少前置表 public.admin_audit_logs：请先执行 admin-backoffice.sql';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION '缺少 public.is_admin()：请先执行 admin-backoffice.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'admin_audit_logs'
      AND column_name = 'metadata'
  ) THEN
    RAISE EXCEPTION '缺少 admin_audit_logs.metadata：请先执行 admin-moderation-v1-foundation.sql';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_bulk_import_moderation_rules(
  p_admin_id UUID,
  p_texts TEXT[],
  p_category TEXT,
  p_severity TEXT DEFAULT 'review',
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_input INTEGER;
  v_blank_lines INTEGER := 0;
  v_invalid_lines INTEGER := 0;
  v_invalid_examples TEXT[] := ARRAY[]::TEXT[];
  v_batch_unique TEXT[] := ARRAY[]::TEXT[];
  v_existing_patterns TEXT[] := ARRAY[]::TEXT[];
  v_duplicated_in_batch INTEGER := 0;
  v_skipped INTEGER := 0;
  v_inserted INTEGER := 0;
  v_description TEXT;
  v_item TEXT;
  v_batch_unique_count INTEGER := 0;
  i INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_id OR NOT public.is_admin() THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'not_admin',
      'message', '需要管理员权限。'
    );
  END IF;

  IF p_category IS NULL OR p_category NOT IN (
    '政治敏感', '色情、淫秽与低俗', '涉未成年人不良信息',
    '暴力、血腥与危险行为', '人身攻击、骚扰与仇恨歧视', '隐私泄露与个人信息滥用',
    '谣言与虚假信息', '诈骗与欺诈', '广告、导流与恶意营销',
    '抄袭、盗用与其他侵权', '无关内容、刷屏与恶意灌水', '内容质量与标注不符', '其他违规'
  ) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'invalid_category',
      'message', '问题分类不正确。'
    );
  END IF;

  IF p_severity IS NULL OR p_severity NOT IN ('review', 'high') THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'invalid_severity',
      'message', '风险级别不正确。'
    );
  END IF;

  IF p_texts IS NULL THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'empty_batch',
      'message', '导入内容为空。'
    );
  END IF;

  v_total_input := array_length(p_texts, 1);
  IF v_total_input IS NULL OR v_total_input <= 0 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'empty_batch',
      'message', '导入内容为空。'
    );
  END IF;

  IF v_total_input > 5000 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'batch_too_large',
      'message', '单批最多 5000 条，请分批导入。'
    );
  END IF;

  v_description := NULLIF(btrim(COALESCE(p_description, '')), '');
  IF v_description IS NOT NULL AND char_length(v_description) > 500 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'description_too_long',
      'message', '备注超过 500 个字符。'
    );
  END IF;

  LOCK TABLE public.moderation_rules IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE(array_agg(DISTINCT lower(pattern)), ARRAY[]::TEXT[])
  INTO v_existing_patterns
  FROM public.moderation_rules
  WHERE rule_type = 'keyword';

  FOR i IN 1..v_total_input LOOP
    v_item := btrim(COALESCE(p_texts[i], ''));
    IF v_item = '' THEN
      v_blank_lines := v_blank_lines + 1;
      CONTINUE;
    END IF;

    IF char_length(v_item) > 500 THEN
      v_invalid_lines := v_invalid_lines + 1;
      IF COALESCE(array_length(v_invalid_examples, 1), 0) < 10 THEN
        v_invalid_examples := v_invalid_examples || v_item;
      END IF;
      CONTINUE;
    END IF;

    IF lower(v_item) = ANY(v_batch_unique) THEN
      v_duplicated_in_batch := v_duplicated_in_batch + 1;
      CONTINUE;
    END IF;

    IF lower(v_item) = ANY(v_existing_patterns) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_batch_unique := v_batch_unique || v_item;
  END LOOP;

  v_batch_unique_count := COALESCE(array_length(v_batch_unique, 1), 0);
  IF v_batch_unique_count > 0 THEN
    INSERT INTO public.moderation_rules (
      rule_type, pattern, category, severity, description,
      enabled, created_by, updated_by
    )
    SELECT
      'keyword',
      candidate.pattern,
      p_category,
      p_severity,
      v_description,
      TRUE,
      p_admin_id,
      p_admin_id
    FROM unnest(v_batch_unique) AS candidate(pattern)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_skipped := v_skipped + (v_batch_unique_count - v_inserted);
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_id, action, target_type, target_id, note, metadata
  ) VALUES (
    p_admin_id,
    'bulk_import_moderation_rules',
    'moderation_rules',
    NULL,
    '批量导入敏感词：新增 ' || v_inserted || ' 条，跳过 ' || v_skipped || ' 条，无效 ' || v_invalid_lines || ' 条',
    jsonb_build_object(
      'category', p_category,
      'severity', p_severity,
      'total_input', v_total_input,
      'blank_lines', v_blank_lines,
      'invalid_lines', v_invalid_lines,
      'invalid_examples', v_invalid_examples,
      'duplicated_in_batch', v_duplicated_in_batch,
      'inserted', v_inserted,
      'skipped', v_skipped,
      'batch_unique_count', v_batch_unique_count
    )
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'invalid_lines', v_invalid_lines,
    'invalid_examples', v_invalid_examples,
    'ignored_blank_lines', v_blank_lines,
    'duplicated_in_batch', v_duplicated_in_batch,
    'total_input', v_total_input,
    'category', p_category,
    'severity', p_severity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_import_moderation_rules(
  UUID, TEXT[], TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_bulk_import_moderation_rules(
  UUID, TEXT[], TEXT, TEXT, TEXT
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_import_moderation_rules(
  UUID, TEXT[], TEXT, TEXT, TEXT
) TO authenticated, service_role;

COMMIT;

-- 执行后只读核验（单独运行）：
-- SELECT to_regprocedure('public.admin_bulk_import_moderation_rules(uuid,text[],text,text,text)');
