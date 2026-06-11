export function friendlyErrorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试。",
): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message.trim()) return fallback;
  if (/no_project|project.*missing|project.*required/i.test(message)) {
    return "请先选择或创建一个项目。";
  }
  if (/no_chapter|chapter.*missing|chapter.*required/i.test(message)) {
    return "请先打开一个章节。";
  }
  if (/api.?key|key_missing|unauthori[sz]ed|401|403/i.test(message)) {
    return "服务密钥无效或权限不足，请检查模型服务设置。";
  }
  if (/provider|model|llm|fallback/i.test(message)) {
    return "模型服务暂时不可用，请检查模型服务设置后重试。";
  }
  if (/invalid_json|json|parse/i.test(message)) {
    return "模型返回格式异常，请重试一次。";
  }
  if (/network|fetch|timeout|ECONN|ENOTFOUND|ETIMEDOUT|abort/i.test(message)) {
    return "网络或服务连接异常，请稍后重试。";
  }
  if (/permission|EACCES|EPERM/i.test(message)) {
    return "没有足够权限完成操作，请检查文件或目录权限。";
  }
  if (/ENOENT|not found|missing file/i.test(message)) {
    return "找不到需要的文件或资料，请检查后重试。";
  }
  if (/empty|blank/i.test(message)) {
    return "内容为空，请补充后再试。";
  }
  return fallback;
}

export function friendlyActionError(action: string, error: unknown): string {
  return `${action}：${friendlyErrorMessage(error)}`;
}
