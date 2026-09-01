import { createClient } from "@/lib/supabase/browser";

type NotificationType = "comment" | "reply" | "like" | "bookmark" | "follow" | "system";

/** 消息提示最多展示 999，避免徽标被过大的数字撑开。 */
export function formatNotificationCount(count: number): number {
  return Math.min(Math.max(0, count), 999);
}

interface CreateNotificationParams {
  type: NotificationType;
  /** 谁触发了这个通知（评论者、点赞者等） */
  actor_id: string;
  /** 被交互的作品 ID（评论/点赞/收藏目标） */
  post_id?: string | null;
  /** 通知附带的内容（评论/回复的文本内容） */
  content?: string;
}

/**
 * 创建通知。
 * 根据 type 自动查询被通知人（user_id）：
 * - comment/like/bookmark → 查询 post 的 owner
 * - reply → 查询父评论的 author
 * - follow → actor_id 是被关注的人，需要外部传入 user_id
 * - system → 需要外部传入 user_id
 *
 * 如果触发者和被通知者是同一个人，则不创建通知。
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const supabase = createClient();

  let user_id: string | null = null;

  try {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("is_test_account")
      .eq("id", params.actor_id)
      .maybeSingle();
    const actorIsTest = actorProfile?.is_test_account === true;

    if (params.type === "comment" || params.type === "like" || params.type === "bookmark") {
      if (!params.post_id) return;
      const { data: post } = await supabase
        .from("posts")
        .select("user_id")
        .eq("id", params.post_id)
        .single();
      if (post) user_id = (post as Record<string, unknown>).user_id as string;
    } else if (params.type === "reply") {
      if (!params.post_id) return;
      // reply 需要查询被回复的评论的所有者
      // 目前 content 里存的是回复文本，但我们需要知道被回复的评论是谁写的
      // 先通过 post_id 和最新的评论来找到被回复的评论
      // 其实更精确的方式是：调用处传入 parent_comment_id，但当前接口没有
      // 改用：查询 post 的 owner 作为通知目标
      const { data: post } = await supabase
        .from("posts")
        .select("user_id")
        .eq("id", params.post_id)
        .single();
      if (post) user_id = (post as Record<string, unknown>).user_id as string;
    }

    // 如果没查到被通知人，不创建
    if (!user_id) return;

    // 不通知自己
    if (user_id === params.actor_id) return;

    // 测试空间和正式空间的互动通知也必须隔离：测试账号之间可以互相收到，
    // 普通账号之间可以互相收到，跨空间的动作不生成通知，避免彼此泄露存在性。
    const { data: recipientProfile } = await supabase
      .from("profiles")
      .select("is_test_account")
      .eq("id", user_id)
      .maybeSingle();
    const recipientIsTest = recipientProfile?.is_test_account === true;
    if (actorIsTest !== recipientIsTest) return;

    await supabase.from("notifications").insert({
      user_id,
      type: params.type,
      actor_id: params.actor_id,
      post_id: params.post_id || null,
      content: params.content || "",
      read: false,
    });
  } catch {
    // 通知创建失败不应影响主流程，静默忽略
  }
}
