// 全站标签规则：每个作品最多 10 个标签。
export const MAX_TAGS_PER_WORK = 10;

/** 按中文逗号、英文逗号或空白切分多个标签。 */
export function splitTags(value: string): string[] {
  return value
    .split(/[\s,，]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** 合并去重并保留最新标签，最多保留 MAX_TAGS_PER_WORK 个。 */
export function addTags(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming])).slice(0, MAX_TAGS_PER_WORK);
}
