import type { SupabaseClient } from "@supabase/supabase-js";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ERROR_LENGTH = 500;

type FeedbackDatabase = SupabaseClient;

type FeishuConfig = {
  appId: string;
  appSecret: string;
  appToken: string;
  tableId: string;
};

type FeedbackRecord = {
  id: string;
  public_id?: string | null;
  type: string;
  content: string;
  status: string;
  created_at: string;
  user_id: string;
  feishu_record_id?: string | null;
  feishu_sync_attempts?: number | null;
};

type ProfileRecord = {
  nickname?: string | null;
  public_id?: string | null;
};

type FeishuRecord = { record_id: string };
type FeishuResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
  data?: {
    record?: FeishuRecord;
    items?: FeishuRecord[];
    node?: { obj_token?: string; obj_type?: string };
  };
};

export type FeedbackFeishuSyncResult = {
  status: "synced" | "failed" | "skipped";
  recordId?: string;
  error?: string;
};

class FeishuApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "FeishuApiError";
    this.status = status;
  }
}

let tokenCache: { token: string; expiresAt: number } | null = null;
const bitableAppTokenCache = new Map<string, string>();

function getConfig(): FeishuConfig | null {
  const appId = process.env.FEISHU_FEEDBACK_APP_ID?.trim();
  const appSecret = process.env.FEISHU_FEEDBACK_APP_SECRET?.trim();
  const appToken = process.env.FEISHU_FEEDBACK_BITABLE_APP_TOKEN?.trim();
  const tableId = process.env.FEISHU_FEEDBACK_BITABLE_TABLE_ID?.trim();
  if (!appId || !appSecret || !appToken || !tableId) return null;
  return { appId, appSecret, appToken, tableId };
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "未知错误");
  return message.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_LENGTH) || "未知错误";
}

async function fetchJson(url: string, init: RequestInit): Promise<FeishuResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => null) as FeishuResponse | null;
    if (!response.ok) throw new FeishuApiError(payload?.msg || `飞书接口请求失败（HTTP ${response.status}）`, response.status);
    if (payload?.code !== 0) throw new FeishuApiError(payload?.msg || "飞书接口返回失败", response.status);
    return payload;
  } catch (error) {
    if (controller.signal.aborted) throw new FeishuApiError("飞书接口请求超时", 408);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getTenantAccessToken(config: FeishuConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const payload = await fetchJson(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  if (!payload.tenant_access_token) throw new FeishuApiError("飞书没有返回访问令牌", 502);
  tokenCache = { token: payload.tenant_access_token, expiresAt: Date.now() + Math.max(60, (payload.expire || 7_200) - 60) * 1_000 };
  return payload.tenant_access_token;
}

async function resolveBitableAppToken(config: FeishuConfig, tenantToken: string): Promise<string> {
  if (config.appToken.startsWith("bas")) return config.appToken;
  const cached = bitableAppTokenCache.get(config.appToken);
  if (cached) return cached;

  const payload = await fetchJson(`${FEISHU_API_BASE}/wiki/v2/spaces/get_node?token=${encodeURIComponent(config.appToken)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${tenantToken}` },
  });
  const node = payload.data?.node;
  if (!node?.obj_token || node.obj_type !== "bitable") {
    throw new FeishuApiError("飞书 Wiki 节点没有解析为多维表格，请检查 Wiki 链接和权限", 400);
  }
  bitableAppTokenCache.set(config.appToken, node.obj_token);
  return node.obj_token;
}

async function bitableApiPath(config: FeishuConfig, suffix = ""): Promise<string> {
  const tenantToken = await getTenantAccessToken(config);
  const appToken = await resolveBitableAppToken(config, tenantToken);
  return `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(config.tableId)}/records${suffix}`;
}

async function bitableRequest(config: FeishuConfig, path: string, init: RequestInit = {}): Promise<FeishuResponse> {
  const token = await getTenantAccessToken(config);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return fetchJson(`${FEISHU_API_BASE}${path}`, { ...init, headers });
}

function escapeFilterValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function feedbackStatusLabel(status: string): string {
  return ({ pending: "待处理", reviewing: "处理中", resolved: "已处理", closed: "已关闭" } as Record<string, string>)[status] || status;
}

function buildSystemFields(feedback: FeedbackRecord, profile: ProfileRecord | null): Record<string, string> {
  return {
    "反馈编号": feedback.public_id || feedback.id,
    "反馈类型": feedback.type,
    "反馈内容": feedback.content,
    "提交人 ID": profile?.public_id || feedback.user_id,
    "提交人昵称": profile?.nickname || "未填写",
    "提交时间": new Date(feedback.created_at).toISOString(),
    "来源": "Inkland 网站",
    "站内处理状态": feedbackStatusLabel(feedback.status),
  };
}

function buildFields(feedback: FeedbackRecord, profile: ProfileRecord | null): Record<string, string> {
  return {
    ...buildSystemFields(feedback, profile),
    "Codex 处理状态": "待检查",
    "Codex 处理结论": "",
    "Codex 处理备注": "",
  };
}

async function getFeedback(database: FeedbackDatabase, feedbackId: string): Promise<{ feedback: FeedbackRecord; profile: ProfileRecord | null }> {
  const { data: feedback, error } = await database
    .from("feedbacks")
    .select("id, public_id, type, content, status, created_at, user_id, feishu_record_id, feishu_sync_attempts")
    .eq("id", feedbackId)
    .maybeSingle();
  if (error) throw new Error(`读取反馈失败：${error.message}`);
  if (!feedback) throw new Error("没有找到对应的反馈");

  const { data: profile } = await database
    .from("profiles")
    .select("nickname, public_id")
    .eq("id", feedback.user_id)
    .maybeSingle();
  return { feedback: feedback as FeedbackRecord, profile: (profile || null) as ProfileRecord | null };
}

async function findExistingRecord(config: FeishuConfig, feedbackNumber: string): Promise<FeishuRecord | null> {
  const query = new URLSearchParams();
  query.set("page_size", "100");
  query.set("filter", `CurrentValue.[反馈编号] = "${escapeFilterValue(feedbackNumber)}"`);
  const path = await bitableApiPath(config);
  const payload = await bitableRequest(config, `${path}?${query.toString()}`, { method: "GET" });
  return payload.data?.items?.[0] || null;
}

async function createRecord(config: FeishuConfig, fields: Record<string, string>): Promise<FeishuRecord> {
  const path = await bitableApiPath(config);
  const payload = await bitableRequest(config, path, { method: "POST", body: JSON.stringify({ fields }) });
  const record = payload.data?.record;
  if (!record?.record_id) throw new FeishuApiError("飞书没有返回新增记录编号", 502);
  return record;
}

async function updateRecord(config: FeishuConfig, recordId: string, fields: Record<string, string>): Promise<FeishuRecord> {
  const path = await bitableApiPath(config, `/${encodeURIComponent(recordId)}`);
  const payload = await bitableRequest(config, path, { method: "PUT", body: JSON.stringify({ fields }) });
  const record = payload.data?.record;
  if (!record?.record_id) throw new FeishuApiError("飞书没有返回更新后的记录编号", 502);
  return record;
}

async function writeRecord(config: FeishuConfig, feedback: FeedbackRecord, profile: ProfileRecord | null): Promise<string> {
  const fields = buildSystemFields(feedback, profile);
  if (feedback.feishu_record_id) {
    try {
      const record = await updateRecord(config, feedback.feishu_record_id, fields);
      return record.record_id;
    } catch (error) {
      if (!(error instanceof FeishuApiError) || error.status !== 404) throw error;
    }
  }
  const existing = await findExistingRecord(config, fields["反馈编号"]);
  if (existing?.record_id) return (await updateRecord(config, existing.record_id, fields)).record_id;
  return (await createRecord(config, buildFields(feedback, profile))).record_id;
}

async function markSyncFailure(database: FeedbackDatabase, feedback: FeedbackRecord, error: unknown): Promise<void> {
  const { error: updateError } = await database.from("feedbacks").update({
    feishu_sync_status: "failed",
    feishu_sync_attempts: Number(feedback.feishu_sync_attempts || 0) + 1,
    feishu_last_attempt_at: new Date().toISOString(),
    feishu_last_error: safeErrorMessage(error),
  }).eq("id", feedback.id);
  if (updateError) console.error("记录飞书同步失败状态失败:", updateError);
}

export async function syncFeedbackToFeishu(feedbackId: string, database: FeedbackDatabase): Promise<FeedbackFeishuSyncResult> {
  const config = getConfig();
  if (!config) return { status: "skipped", error: "飞书反馈同步尚未配置" };
  try {
    const { feedback, profile } = await getFeedback(database, feedbackId);
    const recordId = await writeRecord(config, feedback, profile);
    const now = new Date().toISOString();
    const { error } = await database.from("feedbacks").update({
      feishu_record_id: recordId,
      feishu_sync_status: "synced",
      feishu_sync_attempts: Number(feedback.feishu_sync_attempts || 0) + 1,
      feishu_last_attempt_at: now,
      feishu_synced_at: now,
      feishu_last_error: null,
    }).eq("id", feedback.id);
    if (error) throw new Error(`保存飞书同步状态失败：${error.message}`);
    return { status: "synced", recordId };
  } catch (error) {
    try {
      const { feedback } = await getFeedback(database, feedbackId);
      await markSyncFailure(database, feedback, error);
    } catch (markError) {
      console.error("记录飞书同步失败状态失败:", markError);
    }
    console.error("反馈同步飞书失败:", { feedbackId, error: safeErrorMessage(error) });
    return { status: "failed", error: safeErrorMessage(error) };
  }
}
