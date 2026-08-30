/**
 * 新记录使用业务编号，历史记录暂时仍只有 UUID。
 * 展示层优先使用业务编号，确保旧数据继续可读、可复制。
 */
export function displayPublicId(publicId?: string | null, legacyId?: string | null) {
  return publicId || legacyId || "—";
}
