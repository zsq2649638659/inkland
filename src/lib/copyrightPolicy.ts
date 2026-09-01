export type CopyrightLicense =
  | "all-rights-reserved"
  | "inkland-reading"
  | "attribution-repost"
  | "attribution-adaptation";

export interface CopyrightPolicyOption {
  value: CopyrightLicense;
  label: string;
  description: string;
  detail: string;
}

/**
 * Inkland uses plain-language choices instead of copying a standard-license
 * name. The preference describes the creator's default reuse boundary; it is
 * not a substitute for a work-specific permission or a legal agreement.
 */
export const copyrightPolicyOptions: CopyrightPolicyOption[] = [
  {
    value: "all-rights-reserved",
    label: "保留全部权利",
    description: "默认不允许站外转载、改编或商业使用。",
    detail: "其他用户可以在 Inkland 内阅读你公开的作品，但不能擅自复制到站外、改写或用于商业用途。",
  },
  {
    value: "inkland-reading",
    label: "仅限站内阅读",
    description: "允许在 Inkland 内阅读、收藏和分享原文链接。",
    detail: "作品仍只在 Inkland 提供阅读，站内分享应保留原作者和原作品页面，不代表允许转载正文。",
  },
  {
    value: "attribution-repost",
    label: "署名转载",
    description: "允许非商业转载完整内容，并保留作者与原文链接。",
    detail: "转载时不得删改正文、冒充作者或用于商业推广；转载者应同时注明作者、Inkland 原文链接和转载来源。",
  },
  {
    value: "attribution-adaptation",
    label: "署名改编",
    description: "允许非商业改编，并清楚标注原作者和改编关系。",
    detail: "改编者需要说明原作、作者和改动内容，不得让读者误认为改编内容由原作者发布或背书。",
  },
];

export const copyrightPolicyMap = Object.fromEntries(
  copyrightPolicyOptions.map((option) => [option.value, option]),
) as Record<CopyrightLicense, CopyrightPolicyOption>;

