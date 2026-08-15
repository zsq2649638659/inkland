export async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("请求超时，请稍后重试。");
    if (error instanceof Error && error.name !== "AbortError") throw new Error("网络连接失败，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
