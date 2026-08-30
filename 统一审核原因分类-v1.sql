-- Inkland 统一审核原因分类 v1
-- 目的：将已有审核规则、举报记录、审核标记和违规记录统一到后台/前端共用的 13 类名称。
-- 说明：只迁移可明确对应的分类；“欺诈广告”等历史合并值按广告、导流与恶意营销保留，
--       新提交请使用“诈骗与欺诈”或“广告、导流与恶意营销”中的准确分类。
-- 幂等：重复执行不会继续改变已统一的值。

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.moderation_rules') IS NOT NULL THEN
    UPDATE public.moderation_rules
    SET category = CASE category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '暴力与威胁' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与骚扰' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '恶意营销' THEN '广告、导流与恶意营销'
      WHEN '抄袭信息' THEN '抄袭、盗用与其他侵权'
      WHEN '成人与不当内容' THEN '色情、淫秽与低俗'
      WHEN '诈骗与交易风险' THEN '诈骗与欺诈'
      WHEN '其他' THEN '其他违规'
      ELSE category
    END
    WHERE category IN ('淫秽色情', '低俗恶趣', '暴力血腥', '暴力与威胁', '欺诈广告', '广告与导流', '人身攻击', '人身攻击与骚扰', '恶意营销', '抄袭信息', '成人与不当内容', '诈骗与交易风险', '其他');
  END IF;

  IF to_regclass('public.moderation_findings') IS NOT NULL THEN
    UPDATE public.moderation_findings
    SET category = CASE category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '暴力与威胁' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与骚扰' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '恶意营销' THEN '广告、导流与恶意营销'
      WHEN '抄袭信息' THEN '抄袭、盗用与其他侵权'
      WHEN '成人与不当内容' THEN '色情、淫秽与低俗'
      WHEN '诈骗与交易风险' THEN '诈骗与欺诈'
      WHEN '其他' THEN '其他违规'
      WHEN '其他需要修改的问题' THEN '其他违规'
      ELSE category
    END
    WHERE category IN ('淫秽色情', '低俗恶趣', '暴力血腥', '暴力与威胁', '欺诈广告', '广告与导流', '人身攻击', '人身攻击与骚扰', '恶意营销', '抄袭信息', '成人与不当内容', '诈骗与交易风险', '其他', '其他需要修改的问题');
  END IF;

  IF to_regclass('public.series_moderation_findings') IS NOT NULL THEN
    UPDATE public.series_moderation_findings
    SET category = CASE category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '暴力与威胁' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与骚扰' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '恶意营销' THEN '广告、导流与恶意营销'
      WHEN '抄袭信息' THEN '抄袭、盗用与其他侵权'
      WHEN '成人与不当内容' THEN '色情、淫秽与低俗'
      WHEN '诈骗与交易风险' THEN '诈骗与欺诈'
      WHEN '其他' THEN '其他违规'
      WHEN '其他需要修改的问题' THEN '其他违规'
      ELSE category
    END
    WHERE category IN ('淫秽色情', '低俗恶趣', '暴力血腥', '暴力与威胁', '欺诈广告', '广告与导流', '人身攻击', '人身攻击与骚扰', '恶意营销', '抄袭信息', '成人与不当内容', '诈骗与交易风险', '其他', '其他需要修改的问题');
  END IF;

  IF to_regclass('public.comment_moderation_findings') IS NOT NULL THEN
    UPDATE public.comment_moderation_findings
    SET category = CASE category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '暴力与威胁' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与骚扰' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '恶意营销' THEN '广告、导流与恶意营销'
      WHEN '抄袭信息' THEN '抄袭、盗用与其他侵权'
      WHEN '成人与不当内容' THEN '色情、淫秽与低俗'
      WHEN '诈骗与交易风险' THEN '诈骗与欺诈'
      WHEN '其他' THEN '其他违规'
      WHEN '其他需要修改的问题' THEN '其他违规'
      ELSE category
    END
    WHERE category IN ('淫秽色情', '低俗恶趣', '暴力血腥', '暴力与威胁', '欺诈广告', '广告与导流', '人身攻击', '人身攻击与骚扰', '恶意营销', '抄袭信息', '成人与不当内容', '诈骗与交易风险', '其他', '其他需要修改的问题');
  END IF;

  IF to_regclass('public.user_violations') IS NOT NULL THEN
    UPDATE public.user_violations
    SET category = CASE category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '暴力与威胁' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与骚扰' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '恶意营销' THEN '广告、导流与恶意营销'
      WHEN '抄袭信息' THEN '抄袭、盗用与其他侵权'
      WHEN '成人与不当内容' THEN '色情、淫秽与低俗'
      WHEN '诈骗与交易风险' THEN '诈骗与欺诈'
      WHEN '其他' THEN '其他违规'
      WHEN '其他问题' THEN '其他违规'
      WHEN '内容违规' THEN '其他违规'
      WHEN '其他需要修改的问题' THEN '其他违规'
      ELSE category
    END
    WHERE category IN ('淫秽色情', '低俗恶趣', '暴力血腥', '暴力与威胁', '欺诈广告', '广告与导流', '人身攻击', '人身攻击与骚扰', '恶意营销', '抄袭信息', '成人与不当内容', '诈骗与交易风险', '其他', '其他问题', '内容违规', '其他需要修改的问题');
  END IF;

  IF to_regclass('public.moderation_report_cases') IS NOT NULL THEN
    UPDATE public.moderation_report_cases
    SET primary_reason_category = CASE primary_reason_category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '暴力与威胁' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与骚扰' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '恶意营销' THEN '广告、导流与恶意营销'
      WHEN '抄袭信息' THEN '抄袭、盗用与其他侵权'
      WHEN '成人与不当内容' THEN '色情、淫秽与低俗'
      WHEN '诈骗与交易风险' THEN '诈骗与欺诈'
      WHEN '色情低俗内容' THEN '色情、淫秽与低俗'
      WHEN '垃圾广告' THEN '广告、导流与恶意营销'
      WHEN '人身攻击与辱骂' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '引战与恶意引战' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '违法违规内容' THEN '其他违规'
      WHEN '其他' THEN '其他违规'
      WHEN '其他问题' THEN '其他违规'
      ELSE primary_reason_category
    END
    WHERE primary_reason_category IN ('淫秽色情', '低俗恶趣', '暴力血腥', '暴力与威胁', '欺诈广告', '广告与导流', '人身攻击', '人身攻击与骚扰', '恶意营销', '抄袭信息', '成人与不当内容', '诈骗与交易风险', '色情低俗内容', '垃圾广告', '人身攻击与辱骂', '引战与恶意引战', '违法违规内容', '其他', '其他问题');
  END IF;

  IF to_regclass('public.content_reports') IS NOT NULL THEN
    UPDATE public.content_reports
    SET reason_category = CASE reason_category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与辱骂' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '广告、诈骗或导流' THEN '广告、导流与恶意营销'
      WHEN '色情低俗内容' THEN '色情、淫秽与低俗'
      WHEN '垃圾广告' THEN '广告、导流与恶意营销'
      WHEN '其他' THEN '其他违规'
      ELSE reason_category
    END
    WHERE reason_category IS NOT NULL;
    UPDATE public.content_reports
    SET reason = CASE reason
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与辱骂' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '广告、诈骗或导流' THEN '广告、导流与恶意营销'
      WHEN '色情低俗内容' THEN '色情、淫秽与低俗'
      WHEN '垃圾广告' THEN '广告、导流与恶意营销'
      WHEN '其他' THEN '其他违规'
      ELSE reason
    END
    WHERE reason IS NOT NULL;
  END IF;

  IF to_regclass('public.comment_reports') IS NOT NULL THEN
    UPDATE public.comment_reports
    SET reason_category = CASE reason_category
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与辱骂' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '广告、诈骗或导流' THEN '广告、导流与恶意营销'
      WHEN '色情低俗内容' THEN '色情、淫秽与低俗'
      WHEN '垃圾广告' THEN '广告、导流与恶意营销'
      WHEN '其他' THEN '其他违规'
      ELSE reason_category
    END
    WHERE reason_category IS NOT NULL;
    UPDATE public.comment_reports
    SET reason = CASE reason
      WHEN '淫秽色情' THEN '色情、淫秽与低俗'
      WHEN '低俗恶趣' THEN '色情、淫秽与低俗'
      WHEN '暴力血腥' THEN '暴力、血腥与危险行为'
      WHEN '欺诈广告' THEN '广告、导流与恶意营销'
      WHEN '人身攻击' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '人身攻击与辱骂' THEN '人身攻击、骚扰与仇恨歧视'
      WHEN '广告与导流' THEN '广告、导流与恶意营销'
      WHEN '广告、诈骗或导流' THEN '广告、导流与恶意营销'
      WHEN '色情低俗内容' THEN '色情、淫秽与低俗'
      WHEN '垃圾广告' THEN '广告、导流与恶意营销'
      WHEN '其他' THEN '其他违规'
      ELSE reason
    END
    WHERE reason IS NOT NULL;
  END IF;
END $$;

COMMIT;

-- 13 类标准名称：
-- 政治敏感；色情、淫秽与低俗；涉未成年人不良信息；暴力、血腥与危险行为；
-- 人身攻击、骚扰与仇恨歧视；隐私泄露与个人信息滥用；谣言与虚假信息；诈骗与欺诈；
-- 广告、导流与恶意营销；抄袭、盗用与其他侵权；无关内容、刷屏与恶意灌水；
-- 内容质量与标注不符；其他违规。
