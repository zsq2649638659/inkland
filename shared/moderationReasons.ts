export const MODERATION_REASON_OPTIONS = [
  "政治敏感",
  "色情、淫秽与低俗",
  "涉未成年人不良信息",
  "暴力、血腥与危险行为",
  "人身攻击、骚扰与仇恨歧视",
  "隐私泄露与个人信息滥用",
  "谣言与虚假信息",
  "诈骗与欺诈",
  "广告、导流与恶意营销",
  "抄袭、盗用与其他侵权",
  "无关内容、刷屏与恶意灌水",
  "内容质量与标注不符",
  "其他违规",
] as const;

export type ModerationReason = (typeof MODERATION_REASON_OPTIONS)[number];

const legacyReasonAliases: Record<ModerationReason, string[]> = {
  "政治敏感": ["政治敏感"],
  "色情、淫秽与低俗": ["色情、淫秽与低俗", "淫秽色情", "低俗恶趣", "色情低俗内容", "成人或不当内容", "成人与不当内容"],
  "涉未成年人不良信息": ["涉未成年人不良信息"],
  "暴力、血腥与危险行为": ["暴力、血腥与危险行为", "暴力血腥", "暴力、血腥或威胁性内容", "暴力与威胁"],
  "人身攻击、骚扰与仇恨歧视": ["人身攻击、骚扰与仇恨歧视", "人身攻击", "人身攻击与辱骂", "人身攻击与骚扰", "攻击、骚扰或歧视性内容", "引战与恶意引战"],
  "隐私泄露与个人信息滥用": ["隐私泄露与个人信息滥用", "传播他人隐私信息"],
  "谣言与虚假信息": ["谣言与虚假信息", "散播谣言"],
  "诈骗与欺诈": ["诈骗与欺诈", "涉嫌诈骗", "诈骗与交易风险"],
  "广告、导流与恶意营销": ["广告、导流与恶意营销", "垃圾广告", "广告、诈骗或导流", "广告或引流", "广告与导流", "恶意营销", "欺诈广告"],
  "抄袭、盗用与其他侵权": ["抄袭、盗用与其他侵权", "抄袭信息", "盗用他人作品"],
  "无关内容、刷屏与恶意灌水": ["无关内容、刷屏与恶意灌水", "无关内容刷屏", "刷屏或灌水"],
  "内容质量与标注不符": ["内容质量与标注不符", "内容评级与实际内容不符", "内容质量与实际内容不符"],
  "其他违规": ["其他违规", "其他", "违法违规内容", "其他需要修改的问题"],
};

export const MODERATION_REASON_ALIASES: Readonly<Record<ModerationReason, readonly string[]>> = legacyReasonAliases;

const aliasToReason = new Map<string, ModerationReason>(
  Object.entries(legacyReasonAliases).flatMap(([reason, aliases]) => aliases.map((alias) => [alias, reason as ModerationReason])),
);

export function normalizeModerationReason(value: string | null | undefined): string {
  const trimmed = value?.trim() || "";
  return aliasToReason.get(trimmed) || trimmed;
}

export function getModerationReasonAliases(reason: string): string[] {
  const normalized = normalizeModerationReason(reason) as ModerationReason;
  return [...(legacyReasonAliases[normalized] || [reason])];
}
