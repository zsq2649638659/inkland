import { createClient } from "@/lib/supabase/browser";

export type MyRestrictionsPayload = {
  ok: boolean;
  status: "active" | "warned" | "restricted" | "suspended" | "banned" | string;
  restrictions: Array<{
    restriction_type: string;
    reason: string | null;
    starts_at: string;
    ends_at: string | null;
  }>;
};

const cache: { at: number; payload: MyRestrictionsPayload | null } = { at: 0, payload: null };
const TTL_MS = 30_000;

/**
 * 查询当前账号状态与有效限制。函数不存在或查询失败时返回 null，
 * 调用方回退到数据库层触发器的中文错误提示。
 */
export async function getMyRestrictions(force = false): Promise<MyRestrictionsPayload | null> {
  const now = Date.now();
  if (!force && cache.payload && now - cache.at < TTL_MS) return cache.payload;
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_my_restrictions");
  const result = data as MyRestrictionsPayload | null;
  if (error || !result?.ok) return null;
  cache.at = now;
  cache.payload = result;
  return result;
}

export function clearRestrictionCache() {
  cache.payload = null;
  cache.at = 0;
}

/** 返回当前账号在某项功能上的拦截提示；未受限返回 null。 */
export function restrictionBlockMessage(
  restrictions: MyRestrictionsPayload | null,
  target: "comment" | "publish" | "report" | "profile_edit" | "interact"
): string | null {
  if (!restrictions?.ok) return null;
  const status = restrictions.status;
  if (status === "banned") {
    return target === "publish"
      ? "你的账号已被封禁，无法发布或提交作品。"
      : target === "report"
        ? "你的账号已被封禁，无法提交举报。"
        : target === "profile_edit"
          ? "你的账号已被封禁，无法修改个人资料。"
          : target === "interact"
            ? "你的账号已被封禁，无法与其他用户互动。"
            : "你的账号已被封禁，无法发表评论。";
  }
  if (status === "suspended") {
    return target === "publish"
      ? "你的账号已被暂停，暂停期间无法发布或提交作品。"
      : target === "report"
        ? "你的账号已被暂停，暂停期间无法提交举报。"
        : target === "profile_edit"
          ? "你的账号已被暂停，暂停期间无法修改个人资料。"
          : target === "interact"
            ? "你的账号已被暂停，暂停期间无法与其他用户互动。"
            : "你的账号已被暂停，暂停期间无法发表评论。";
  }
  const active = restrictions.restrictions || [];
  if (target === "comment" && active.some((item) => item.restriction_type === "comment")) {
    return "你的评论功能暂时受限，无法发表评论。";
  }
  if (target === "publish" && active.some((item) => item.restriction_type === "publish")) {
    return "你的发布功能暂时受限，无法发布或提交作品。";
  }
  if (target === "report" && active.some((item) => item.restriction_type === "report")) {
    return "你的举报功能暂时受限，无法提交举报。";
  }
  if (target === "profile_edit" && active.some((item) => item.restriction_type === "profile_edit")) {
    return "你的资料编辑功能暂时受限，无法修改个人资料。";
  }
  if (target === "interact" && active.some((item) => item.restriction_type === "interact")) {
    return "你的互动功能暂时受限，无法与其他用户互动。";
  }
  return null;
}

/** 评论提交前的统一检查：返回 null 表示可以继续。 */
export async function assertCanComment(): Promise<string | null> {
  const restrictions = await getMyRestrictions();
  return restrictionBlockMessage(restrictions, "comment");
}

/** 发布/提交审核前的统一检查：返回 null 表示可以继续。 */
export async function assertCanPublish(): Promise<string | null> {
  const restrictions = await getMyRestrictions();
  return restrictionBlockMessage(restrictions, "publish");
}

/** 提交举报前的统一检查：返回 null 表示可以继续。 */
export async function assertCanReport(): Promise<string | null> {
  const restrictions = await getMyRestrictions();
  return restrictionBlockMessage(restrictions, "report");
}

/** 资料编辑前的统一检查：返回 null 表示可以继续。 */
export async function assertCanProfileEdit(): Promise<string | null> {
  const restrictions = await getMyRestrictions();
  return restrictionBlockMessage(restrictions, "profile_edit");
}

/** 关注、点赞、收藏等互动前的统一检查：返回 null 表示可以继续。 */
export async function assertCanInteract(): Promise<string | null> {
  const restrictions = await getMyRestrictions();
  return restrictionBlockMessage(restrictions, "interact");
}
